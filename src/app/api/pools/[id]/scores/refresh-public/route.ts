import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { slashGolfProvider, MONTHLY_CALL_LIMIT, DAILY_CALL_BUDGET } from '@/lib/scores/slashgolf'
import { espnProvider } from '@/lib/scores/espn'
import type { GolferScoreData } from '@/types'

const REFRESH_INTERVAL_MS = 2 * 60 * 1000

export const maxDuration = 15

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const poolId = params.id
  const supabase = createServerSupabaseClient()

  // Database-backed rate limit (survives serverless cold starts)
  // Combine with pool check in parallel to save time
  const [lastScoreRes, poolRes] = await Promise.all([
    supabase
      .from('golfer_scores')
      .select('updated_at')
      .eq('pool_id', poolId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from('pools')
      .select('id, status')
      .eq('id', poolId)
      .single(),
  ])

  if (!poolRes.data) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  if (poolRes.data.status !== 'active') {
    return NextResponse.json({ success: true, message: 'Pool not active' })
  }

  if (lastScoreRes.data) {
    const lastUpdate = new Date(lastScoreRes.data.updated_at).getTime()
    const elapsed = Date.now() - lastUpdate
    if (elapsed < REFRESH_INTERVAL_MS) {
      return NextResponse.json({
        success: true,
        cached: true,
        nextRefreshIn: Math.ceil((REFRESH_INTERVAL_MS - elapsed) / 1000),
      })
    }
  }

  try {
    // 1. Fetch scores from external API (with 5s timeout on each call)
    let scores: GolferScoreData[]
    let source: 'slashgolf' | 'espn'

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

        // Log API call (don't await - fire and forget)
        supabase.from('api_usage').insert({
          provider: 'slashgolf',
          endpoint: 'leaderboard',
          month_key: monthKey,
        })

        const hasRoundData = scores.some(s => s.rounds.length > 0)
        if (scores.length === 0 || !hasRoundData) {
          console.log('Slash Golf returned no round data, falling back to ESPN')
          scores = await espnProvider.getScores('')
          source = 'espn'
        }
      } catch (err) {
        console.error('Slash Golf error, falling back to ESPN:', err)
        scores = await espnProvider.getScores('')
        source = 'espn'
      }
    } else {
      scores = await espnProvider.getScores('')
      source = 'espn'
    }

    // 2. Write scores: insert new rows, then delete old ones.
    // Insert-first so the table is never empty if we time out.
    const batchTimestamp = new Date().toISOString()

    const rows = scores.flatMap(golfer => {
      const base = {
        pool_id: poolId,
        golfer_id: golfer.golfer_id,
        golfer_name: golfer.golfer_name,
        status: golfer.status,
        world_ranking: golfer.world_ranking,
        updated_at: batchTimestamp,
      }
      const summary = {
        ...base,
        round_number: null,
        score_to_par: null as number | null,
        total_to_par: golfer.total_to_par,
        thru_hole: golfer.thru_hole,
      }
      const rounds = golfer.rounds.map(round => ({
        ...base,
        round_number: round.round_number,
        score_to_par: round.score_to_par,
        total_to_par: golfer.total_to_par,
        thru_hole: null as number | null,
      }))
      return [summary, ...rounds]
    })

    // Parallel batch insert
    const batches = []
    for (let i = 0; i < rows.length; i += 500) {
      batches.push(supabase.from('golfer_scores').insert(rows.slice(i, i + 500)))
    }
    await Promise.all(batches)

    // Delete old rows (don't await - cleanup can happen async)
    supabase
      .from('golfer_scores')
      .delete()
      .eq('pool_id', poolId)
      .lt('updated_at', batchTimestamp)
      .then(() => {})

    return NextResponse.json({
      success: true,
      source,
      count: scores.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scores' },
      { status: 500 }
    )
  }
}
