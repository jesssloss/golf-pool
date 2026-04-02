import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { espnProvider } from '@/lib/scores/espn'

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

  // Fetch scores once (all pools share the same tournament)
  try {
    const scores = await espnProvider.getScores('')

    for (const pool of pools) {
      for (const golfer of scores) {
        // Upsert summary row (round_number = null)
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

        // Upsert per-round scores
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
    }

    return NextResponse.json({
      success: true,
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
