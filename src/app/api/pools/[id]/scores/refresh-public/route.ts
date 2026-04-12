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

  // Rate limit check with timeout - if Supabase is slow, skip and return
  try {
    const rateCheck = await Promise.race([
      supabase
        .from('golfer_scores')
        .select('updated_at')
        .eq('pool_id', poolId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])

    if (rateCheck && 'data' in rateCheck && rateCheck.data) {
      const elapsed = Date.now() - new Date(rateCheck.data.updated_at).getTime()
      if (elapsed < REFRESH_INTERVAL_MS) {
        return NextResponse.json({
          success: true,
          cached: true,
          nextRefreshIn: Math.ceil((REFRESH_INTERVAL_MS - elapsed) / 1000),
        })
      }
    }
  } catch {
    // Supabase unreachable - continue without rate limit
    console.error('Rate limit check failed, continuing')
  }

  try {
    // Use ESPN only (fast, no API key, no budget tracking)
    const scores: GolferScoreData[] = await espnProvider.getScores('')

    if (scores.length === 0) {
      return NextResponse.json({ success: true, source: 'espn', count: 0 })
    }

    // Try to write to DB with timeout - don't block response if Supabase is slow
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

    // Fire DB writes without awaiting - don't block response
    const batches = []
    for (let i = 0; i < rows.length; i += 500) {
      batches.push(supabase.from('golfer_scores').insert(rows.slice(i, i + 500)))
    }

    // Wait up to 5s for inserts, then return regardless
    await Promise.race([
      Promise.all(batches),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])

    // Fire-and-forget cleanup
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
