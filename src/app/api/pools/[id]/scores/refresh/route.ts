import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { slashGolfProvider, MONTHLY_CALL_LIMIT, DAILY_CALL_BUDGET } from '@/lib/scores/slashgolf'
import { espnProvider } from '@/lib/scores/espn'
import type { GolferScoreData } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(`session_token_${params.id}`)?.value
  const supabase = createServerSupabaseClient()

  // Verify the caller is a member of this pool
  const { data: pool } = await supabase
    .from('pools')
    .select('id, status')
    .eq('id', params.id)
    .single()

  if (!pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  if (sessionToken) {
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('pool_id', params.id)
      .eq('session_token', sessionToken)
      .single()

    if (!team) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    // Primary: Slash Golf leaderboard, Fallback: ESPN
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

    // Delete all existing rows for this pool, then bulk insert.
    // Avoids NULL round_number upsert bug (PostgreSQL NULL != NULL).
    await supabase
      .from('golfer_scores')
      .delete()
      .eq('pool_id', params.id)

    const rows = scores.flatMap(golfer => {
      const summary = {
        pool_id: params.id,
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
        pool_id: params.id,
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

    for (let i = 0; i < rows.length; i += 500) {
      await supabase.from('golfer_scores').insert(rows.slice(i, i + 500))
    }

    return NextResponse.json({ success: true, source, count: scores.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scores' },
      { status: 500 }
    )
  }
}
