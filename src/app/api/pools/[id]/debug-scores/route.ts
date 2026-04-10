import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const poolId = params.id
  const golferId = request.nextUrl.searchParams.get('golferId') || 'scottie-scheffler'
  const supabase = createServerSupabaseClient()

  // 1. Check pool exists
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('id, slug, status')
    .eq('id', poolId)
    .single()

  // 2. Get ALL golfer_scores for this golfer
  const { data: allScores, error: scoresError } = await supabase
    .from('golfer_scores')
    .select('golfer_id, golfer_name, round_number, score_to_par, total_to_par, thru_hole, status, updated_at')
    .eq('pool_id', poolId)
    .eq('golfer_id', golferId)
    .order('round_number', { ascending: true, nullsFirst: true })

  // 3. Count total scores in pool
  const { count: totalScoresCount } = await supabase
    .from('golfer_scores')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', poolId)

  // 4. Count round-specific entries
  const { count: roundEntriesCount } = await supabase
    .from('golfer_scores')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', poolId)
    .not('round_number', 'is', null)

  // 5. Get unique golfer_ids with round data
  const { data: golfersWithRounds } = await supabase
    .from('golfer_scores')
    .select('golfer_id')
    .eq('pool_id', poolId)
    .not('round_number', 'is', null)
    .limit(10)

  return NextResponse.json({
    pool: pool || poolError?.message,
    golferId,
    scoresForGolfer: allScores || scoresError?.message,
    totalScoresInPool: totalScoresCount,
    roundEntriesInPool: roundEntriesCount,
    sampleGolfersWithRounds: golfersWithRounds?.map(g => g.golfer_id) || [],
  })
}
