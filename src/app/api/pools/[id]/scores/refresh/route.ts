import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { espnProvider } from '@/lib/scores/espn'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(`session_token_${params.id}`)?.value
  const supabase = createServerSupabaseClient()

  // Verify commissioner
  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== sessionToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const scores = await espnProvider.getScores('')

    for (const golfer of scores) {
      // Upsert summary row (round_number = null)
      await supabase
        .from('golfer_scores')
        .upsert(
          {
            pool_id: params.id,
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
              pool_id: params.id,
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

    return NextResponse.json({ success: true, count: scores.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch scores' },
      { status: 500 }
    )
  }
}
