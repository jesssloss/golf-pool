import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { espnProvider } from '@/lib/scores/espn'
import { MASTERS_FIELD } from '@/lib/data/masters-field'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient()

  try {
    // Try ESPN first, fall back to hardcoded field
    let golfers: { id: string; name: string; world_ranking: number | null }[]
    try {
      golfers = await espnProvider.getFieldGolfers('')
      if (golfers.length === 0) throw new Error('Empty field')
    } catch {
      golfers = MASTERS_FIELD
    }

    // Insert golfers into golfer_scores as summary rows
    for (const golfer of golfers) {
      await supabase
        .from('golfer_scores')
        .upsert(
          {
            pool_id: params.id,
            golfer_id: golfer.id,
            golfer_name: golfer.name,
            round_number: null,
            total_to_par: 0,
            world_ranking: golfer.world_ranking,
          },
          { onConflict: 'pool_id,golfer_id,round_number' }
        )
    }

    return NextResponse.json({ success: true, count: golfers.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch golfers' },
      { status: 500 }
    )
  }
}
