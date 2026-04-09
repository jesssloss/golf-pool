import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { slashGolfProvider, MONTHLY_CALL_LIMIT, DAILY_CALL_BUDGET } from '@/lib/scores/slashgolf'
import { espnProvider } from '@/lib/scores/espn'
import { SLASHGOLF_PLAYER_IDS } from '@/lib/data/slashgolf-ids'
import type { GolferScoreData } from '@/types'

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized calls
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerSupabaseClient()

  // Find all pools in 'active' status
  const { data: pools, error: poolsError } = await supabase
    .from('pools')
    .select('id, tournament_name')
    .eq('status', 'active')

  if (poolsError || !pools?.length) {
    return NextResponse.json({ pools: 0, message: 'No active pools' })
  }

  // Check Slash Golf budget
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

  let monthCallsUsed = monthUsage.count || 0
  let todayCallsUsed = todayUsage.count || 0

  // Fetch scores once (all pools share the same tournament)
  try {
    let scores: GolferScoreData[]
    let source: 'slashgolf' | 'espn'

    const hasSlashGolfBudget =
      monthCallsUsed < MONTHLY_CALL_LIMIT && todayCallsUsed < DAILY_CALL_BUDGET

    if (hasSlashGolfBudget) {
      try {
        scores = await slashGolfProvider.getLeaderboard()
        source = 'slashgolf'

        await supabase.from('api_usage').insert({
          provider: 'slashgolf',
          endpoint: 'leaderboard',
          month_key: monthKey,
        })
        monthCallsUsed++
        todayCallsUsed++

        if (scores.length === 0) {
          console.log('Cron: Slash Golf leaderboard returned empty, falling back to ESPN')
          scores = await espnProvider.getScores('')
          source = 'espn'
        }
      } catch (err) {
        console.error('Cron: Slash Golf leaderboard error, falling back to ESPN:', err)
        scores = await espnProvider.getScores('')
        source = 'espn'
      }
    } else {
      scores = await espnProvider.getScores('')
      source = 'espn'
    }

    for (const pool of pools) {
      for (const golfer of scores) {
        await supabase
          .from('golfer_scores')
          .upsert(
            {
              pool_id: pool.id,
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
                pool_id: pool.id,
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

      // Proactively fetch hole-by-hole scores for drafted golfers
      if (source === 'slashgolf') {
        try {
          await fetchHoleScoresForPool(supabase, pool.id, scores, todayCallsUsed, monthCallsUsed, monthKey)
        } catch (err) {
          console.error(`Cron: Hole scores batch error for pool ${pool.id}:`, err)
        }
      }
    }

    return NextResponse.json({
      success: true,
      source,
      pools: pools.length,
      golfers: scores.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scores' },
      { status: 500 }
    )
  }
}

async function fetchHoleScoresForPool(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  poolId: string,
  leaderboardScores: GolferScoreData[],
  todayCallsUsed: number,
  monthCallsUsed: number,
  monthKey: string
): Promise<number> {
  const todayRemaining = DAILY_CALL_BUDGET - todayCallsUsed
  const monthRemaining = MONTHLY_CALL_LIMIT - monthCallsUsed
  const callsRemaining = Math.min(todayRemaining, monthRemaining)
  if (callsRemaining <= 0) return 0

  // Get all drafted golfers for this pool
  const { data: teamGolfers } = await supabase
    .from('team_golfers')
    .select('golfer_id, golfer_name')
    .eq('pool_id', poolId)
    .eq('is_dropped', false)

  if (!teamGolfers || teamGolfers.length === 0) return 0

  // Dedupe golfer IDs
  const uniqueGolfers = new Map<string, string>()
  teamGolfers.forEach(tg => {
    if (!uniqueGolfers.has(tg.golfer_id)) {
      uniqueGolfers.set(tg.golfer_id, tg.golfer_name)
    }
  })

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
      console.error(`Cron: Hole scores fetch failed for ${golferId}:`, err)
    }
  }

  return fetched
}
