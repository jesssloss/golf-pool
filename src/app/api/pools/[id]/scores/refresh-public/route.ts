import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { slashGolfProvider, MONTHLY_CALL_LIMIT, DAILY_CALL_BUDGET } from '@/lib/scores/slashgolf'
import { espnProvider } from '@/lib/scores/espn'
import { SLASHGOLF_PLAYER_IDS } from '@/lib/data/slashgolf-ids'
import type { GolferScoreData } from '@/types'

const REFRESH_INTERVAL_MS = 2 * 60 * 1000

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const poolId = params.id
  const supabase = createServerSupabaseClient()

  // Database-backed rate limit (survives serverless cold starts)
  const { data: lastScoreRow } = await supabase
    .from('golfer_scores')
    .select('updated_at')
    .eq('pool_id', poolId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (lastScoreRow) {
    const lastUpdate = new Date(lastScoreRow.updated_at).getTime()
    const elapsed = Date.now() - lastUpdate
    if (elapsed < REFRESH_INTERVAL_MS) {
      return NextResponse.json({
        success: true,
        cached: true,
        nextRefreshIn: Math.ceil((REFRESH_INTERVAL_MS - elapsed) / 1000),
      })
    }
  }

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
    // 1. Try Slash Golf leaderboard first (primary source)
    let scores: GolferScoreData[]
    let source: 'slashgolf' | 'espn'

    // Check daily budget for Slash Golf
    const todayKey = new Date().toISOString().slice(0, 10)
    const monthKey = new Date().toISOString().slice(0, 7)

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
    const hasSlashGolfBudget =
      monthCallsUsed < MONTHLY_CALL_LIMIT && todayCallsUsed < DAILY_CALL_BUDGET

    if (hasSlashGolfBudget) {
      try {
        scores = await slashGolfProvider.getLeaderboard()
        source = 'slashgolf'

        // Log API call
        await supabase.from('api_usage').insert({
          provider: 'slashgolf',
          endpoint: 'leaderboard',
          month_key: monthKey,
        })

        // If Slash Golf returned no data or no round details, fall back to ESPN
        const hasRoundData = scores.some(s => s.rounds.length > 0)
        if (scores.length === 0 || !hasRoundData) {
          console.log('Slash Golf leaderboard returned no round data, falling back to ESPN')
          scores = await espnProvider.getScores('')
          source = 'espn'
        }
      } catch (err) {
        console.error('Slash Golf leaderboard error, falling back to ESPN:', err)
        scores = await espnProvider.getScores('')
        source = 'espn'
      }
    } else {
      // Over budget, use ESPN
      scores = await espnProvider.getScores('')
      source = 'espn'
    }

    // 2. Upsert scores to database
    // Delete all existing summary + round rows for this pool, then bulk insert.
    // This avoids the NULL round_number upsert bug (PostgreSQL treats NULL != NULL
    // so upsert with onConflict can't match summary rows, creating duplicates).
    await supabase
      .from('golfer_scores')
      .delete()
      .eq('pool_id', poolId)

    const rows = scores.flatMap(golfer => {
      const summary = {
        pool_id: poolId,
        golfer_id: golfer.golfer_id,
        golfer_name: golfer.golfer_name,
        round_number: null,
        score_to_par: null as number | null,
        total_to_par: golfer.total_to_par,
        thru_hole: golfer.thru_hole,
        status: golfer.status,
        world_ranking: golfer.world_ranking,
        updated_at: new Date().toISOString(),
      }
      const rounds = golfer.rounds.map(round => ({
        pool_id: poolId,
        golfer_id: golfer.golfer_id,
        golfer_name: golfer.golfer_name,
        round_number: round.round_number,
        score_to_par: round.score_to_par,
        total_to_par: golfer.total_to_par,
        thru_hole: null as number | null,
        status: golfer.status,
        world_ranking: golfer.world_ranking,
        updated_at: new Date().toISOString(),
      }))
      return [summary, ...rounds]
    })

    // Batch insert in chunks of 500
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('golfer_scores').insert(rows.slice(i, i + 500))
    }

    // 3. Proactively fetch hole-by-hole scores for drafted golfers
    let holeScoresFetched = 0
    if (source === 'slashgolf' && hasSlashGolfBudget) {
      try {
        holeScoresFetched = await fetchHoleScoresForPool(supabase, poolId, scores, todayCallsUsed + 1, monthCallsUsed + 1)
      } catch (err) {
        console.error('Hole scores batch fetch error:', err)
      }
    }

    return NextResponse.json({
      success: true,
      source,
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
  leaderboardScores: GolferScoreData[],
  todayCallsUsed: number,
  monthCallsUsed: number
): Promise<number> {
  const todayRemaining = DAILY_CALL_BUDGET - todayCallsUsed
  const monthRemaining = MONTHLY_CALL_LIMIT - monthCallsUsed
  const callsRemaining = Math.min(todayRemaining, monthRemaining)
  if (callsRemaining <= 0) return 0

  const monthKey = new Date().toISOString().slice(0, 7)

  // Get all drafted golfers for this pool
  const { data: teamGolfers } = await supabase
    .from('team_golfers')
    .select('golfer_id, golfer_name')
    .eq('pool_id', poolId)
    .eq('is_dropped', false)

  if (!teamGolfers || teamGolfers.length === 0) return 0

  // Dedupe golfer IDs
  const uniqueGolfers = new Map<string, string>()
  for (const tg of teamGolfers) {
    if (!uniqueGolfers.has(tg.golfer_id)) {
      uniqueGolfers.set(tg.golfer_id, tg.golfer_name)
    }
  }

  // Find golfers with in-progress rounds
  const activeGolferIds = new Set(
    leaderboardScores
      .filter(s => s.status === 'active' && s.thru_hole !== null && s.thru_hole < 18)
      .map(s => s.golfer_id)
  )

  // Check existing cache
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

  // Build fetch list
  const toFetch: { golferId: string; golferName: string; playerId: string }[] = []
  uniqueGolfers.forEach((golferName, golferId) => {
    const playerId = SLASHGOLF_PLAYER_IDS[golferId]
    if (!playerId) return

    const lastFetch = latestFetchByGolfer.get(golferId)
    if (!lastFetch) {
      toFetch.push({ golferId, golferName, playerId })
      return
    }

    if (activeGolferIds.has(golferId) && lastFetch < staleThreshold) {
      toFetch.push({ golferId, golferName, playerId })
    }
  })

  // Cap at 10 per cycle
  const maxPerCycle = Math.min(10, callsRemaining)
  const batch = toFetch.slice(0, maxPerCycle)
  let fetched = 0

  for (const { golferId, golferName, playerId } of batch) {
    try {
      const scorecards = await slashGolfProvider.getScorecard(playerId)
      if (scorecards.length === 0) continue

      await supabase.from('api_usage').insert({
        provider: 'slashgolf',
        endpoint: 'scorecard',
        month_key: monthKey,
      })

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
    }
  }

  return fetched
}
