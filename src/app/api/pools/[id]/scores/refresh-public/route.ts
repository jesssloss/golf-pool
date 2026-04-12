import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
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

  // Parallel: rate limit check + pool existence check
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
    const elapsed = Date.now() - new Date(lastScoreRes.data.updated_at).getTime()
    if (elapsed < REFRESH_INTERVAL_MS) {
      return NextResponse.json({
        success: true,
        cached: true,
        nextRefreshIn: Math.ceil((REFRESH_INTERVAL_MS - elapsed) / 1000),
      })
    }
  }

  try {
    // Use ESPN only for public refresh (fast, no API key, no budget tracking).
    // Slash Golf is used by the cron job which has a longer timeout budget.
    const scores: GolferScoreData[] = await espnProvider.getScores('')

    if (scores.length === 0) {
      return NextResponse.json({ success: true, source: 'espn', count: 0 })
    }

    // Insert-then-delete: table is never empty if function times out
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
      return [
        { ...base, round_number: null, score_to_par: null as number | null, total_to_par: golfer.total_to_par, thru_hole: golfer.thru_hole },
        ...golfer.rounds.map(round => ({
          ...base, round_number: round.round_number, score_to_par: round.score_to_par, total_to_par: golfer.total_to_par, thru_hole: null as number | null,
        })),
      ]
    })

    // Parallel batch insert
    const batches = []
    for (let i = 0; i < rows.length; i += 500) {
      batches.push(supabase.from('golfer_scores').insert(rows.slice(i, i + 500)))
    }
    await Promise.all(batches)

    // Clean up old rows (fire-and-forget)
    supabase
      .from('golfer_scores')
      .delete()
      .eq('pool_id', poolId)
      .lt('updated_at', batchTimestamp)
      .then(() => {})

    return NextResponse.json({ success: true, source: 'espn', count: scores.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scores' },
      { status: 500 }
    )
  }
}
