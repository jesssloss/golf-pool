import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { espnProvider } from '@/lib/scores/espn'
import { slashGolfProvider, MONTHLY_CALL_LIMIT, DAILY_CALL_BUDGET } from '@/lib/scores/slashgolf'
import { SLASHGOLF_PLAYER_IDS } from '@/lib/data/slashgolf-ids'

// Simple in-memory rate limit: one refresh per pool per 2 minutes
const lastRefresh = new Map<string, number>()
const REFRESH_INTERVAL_MS = 2 * 60 * 1000

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const poolId = params.id
  const now = Date.now()
  const last = lastRefresh.get(poolId) || 0

  if (now - last < REFRESH_INTERVAL_MS) {
    return NextResponse.json({
      success: true,
      cached: true,
      nextRefreshIn: Math.ceil((REFRESH_INTERVAL_MS - (now - last)) / 1000),
    })
  }

  const supabase = createServerSupabaseClient()

  // Verify pool exists and is active
  const { data: pool } = await supabase
    .from('pools')
    .select('id, status')
    .eq('id', poolId)
    .single()

  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  if (pool.status !== 'active') {
    return NextResponse.json({ success: true, message: 'Pool not active' })
  }

  try {
    // 1. Refresh ESPN summary scores
    const scores = await espnProvider.getScores('')

    for (const golfer of scores) {
      await supabase
        .from('golfer_scores')
        .upsert(
          {
            pool_id: poolId,
            golfer_id: golfer.golfer_id,
            golfer_name: golfer.golfer_name,
            round_number: null,
            total_to_par: golfer.total_to_par,
            thru_hole: golfer.thru_hole,
            status: golfer.status,
            world_ranking: golfer.world_ranking,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'pool_id,golfer_id,round_number' }
        )

      for (const round of golfer.rounds) {
        await supabase
          .from('golfer_scores')
          .upsert(
            {
              pool_id: poolId,
              golfer_id: golfer.golfer_id,
              golfer_name: golfer.golfer_name,
              round_number: round.round_number,
              score_to_par: round.score_to_par,
              total_to_par: golfer.total_to_par,
              status: golfer.status,
              world_ranking: golfer.world_ranking,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'pool_id,golfer_id,round_number' }
          )
      }
    }

    lastRefresh.set(poolId, now)

    // 2. Proactively fetch hole-by-hole scores for all drafted golfers
    let holeScoresFetched = 0
    try {
      holeScoresFetched = await fetchHoleScoresForPool(supabase, poolId, scores)
    } catch (err) {
      console.error('Hole scores batch fetch error:', err)
    }

    return NextResponse.json({
      success: true,
      count: scores.length,
      holeScoresFetched,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scores' },
      { status: 500 }
    )
  }
}

/**
 * Proactively fetch hole-by-hole scores for all drafted golfers with
 * in-progress rounds where the cache is stale.
 */
async function fetchHoleScoresForPool(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  poolId: string,
  espnScores: Awaited<ReturnType<typeof espnProvider.getScores>>
): Promise<number> {
  // Check API budget: enforce both monthly and daily limits
  const now = new Date()
  const monthKey = now.toISOString().slice(0, 7)
  const todayKey = now.toISOString().slice(0, 10)

  const [monthUsage, todayUsage] = await Promise.all([
    supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('provider', 'slashgolf')
      .eq('month_key', monthKey),
    supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('provider', 'slashgolf')
      .gte('called_at', `${todayKey}T00:00:00Z`)
      .lt('called_at', `${todayKey}T23:59:59Z`),
  ])

  const monthCallsUsed = monthUsage.count || 0
  const todayCallsUsed = todayUsage.count || 0

  const monthRemaining = MONTHLY_CALL_LIMIT - monthCallsUsed
  const todayRemaining = DAILY_CALL_BUDGET - todayCallsUsed
  const callsRemaining = Math.min(monthRemaining, todayRemaining)

  if (callsRemaining <= 0) return 0

  // Get all drafted golfers for this pool
  const { data: teamGolfers } = await supabase
    .from('team_golfers')
    .select('golfer_id, golfer_name')
    .eq('pool_id', poolId)
    .eq('is_dropped', false)

  if (!teamGolfers || teamGolfers.length === 0) return 0

  // Dedupe golfer IDs (shared golfers across teams in manual mode)
  const uniqueGolfers = new Map<string, string>()
  for (const tg of teamGolfers) {
    if (!uniqueGolfers.has(tg.golfer_id)) {
      uniqueGolfers.set(tg.golfer_id, tg.golfer_name)
    }
  }

  // Find golfers with in-progress rounds (thru_hole < 18 and status active)
  const activeGolferIds = new Set(
    espnScores
      .filter(s => s.status === 'active' && s.thru_hole !== null && s.thru_hole < 18)
      .map(s => s.golfer_id)
  )

  // Check existing cache to skip golfers with fresh data (5 min for background batch)
  const staleThreshold = new Date(Date.now() - 5 * 60 * 1000)
  const { data: cachedHoleScores } = await supabase
    .from('hole_scores')
    .select('golfer_id, fetched_at')
    .eq('pool_id', poolId)
    .order('fetched_at', { ascending: false })

  const latestFetchByGolfer = new Map<string, Date>()
  for (const row of cachedHoleScores || []) {
    if (!latestFetchByGolfer.has(row.golfer_id)) {
      latestFetchByGolfer.set(row.golfer_id, new Date(row.fetched_at))
    }
  }

  // Build fetch list: drafted golfers that are actively playing and have stale/no cache
  const toFetch: { golferId: string; golferName: string; playerId: string }[] = []
  uniqueGolfers.forEach((golferName, golferId) => {
    const playerId = SLASHGOLF_PLAYER_IDS[golferId]
    if (!playerId) return // No mapping, can't fetch

    // Always fetch if no cache exists
    const lastFetch = latestFetchByGolfer.get(golferId)
    if (!lastFetch) {
      toFetch.push({ golferId, golferName, playerId })
      return
    }

    // For active golfers mid-round, fetch if cache is stale
    if (activeGolferIds.has(golferId) && lastFetch < staleThreshold) {
      toFetch.push({ golferId, golferName, playerId })
    }
  })

  // Cap at remaining budget and max 10 per cycle to spread calls out
  const maxPerCycle = Math.min(10, callsRemaining)
  const batch = toFetch.slice(0, maxPerCycle)
  let fetched = 0

  for (const { golferId, golferName, playerId } of batch) {
    try {
      const scorecards = await slashGolfProvider.getScorecard(playerId)
      if (scorecards.length === 0) continue

      // Log API call
      await supabase.from('api_usage').insert({
        provider: 'slashgolf',
        endpoint: 'scorecard',
        month_key: monthKey,
      })

      // Cache hole scores
      for (const round of scorecards) {
        const upserts = round.holes.map(h => ({
          pool_id: poolId,
          golfer_id: golferId,
          golfer_name: golferName,
          round_number: round.round_number,
          hole_number: h.hole_number,
          par: h.par,
          score: h.score,
          fetched_at: new Date().toISOString(),
        }))

        await supabase
          .from('hole_scores')
          .upsert(upserts, { onConflict: 'pool_id,golfer_id,round_number,hole_number' })
      }

      fetched++
    } catch (err) {
      console.error(`Hole scores fetch failed for ${golferId}:`, err)
      // Continue with next golfer
    }
  }

  return fetched
}
