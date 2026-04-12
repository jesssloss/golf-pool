import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { slashGolfProvider, MONTHLY_CALL_LIMIT, DAILY_CALL_BUDGET } from '@/lib/scores/slashgolf'
import { espnProvider } from '@/lib/scores/espn'
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
    // 1. Fetch scores from external API
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

        await supabase.from('api_usage').insert({
          provider: 'slashgolf',
          endpoint: 'leaderboard',
          month_key: monthKey,
        })

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
      scores = await espnProvider.getScores('')
      source = 'espn'
    }

    // 2. Write scores to database using insert-then-delete pattern
    // This avoids the window where scores are empty (delete-first can leave
    // the table empty if the function times out before inserting).
    const batchTimestamp = new Date().toISOString()

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
        updated_at: batchTimestamp,
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
        updated_at: batchTimestamp,
      }))
      return [summary, ...rounds]
    })

    // Insert new rows first
    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('golfer_scores').insert(rows.slice(i, i + 500))
    }

    // Then delete old rows (anything with updated_at before this batch)
    await supabase
      .from('golfer_scores')
      .delete()
      .eq('pool_id', poolId)
      .lt('updated_at', batchTimestamp)

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
