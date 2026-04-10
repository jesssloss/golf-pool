import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const poolId = params.id
  const golferId = request.nextUrl.searchParams.get('golferId')

  if (!golferId) {
    return NextResponse.json({ error: 'golferId required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Return cached hole scores immediately — no on-demand API calls.
  // The refresh endpoints proactively batch-fetch hole scores.
  const { data: cachedScores } = await supabase
    .from('hole_scores')
    .select('round_number, hole_number, par, score')
    .eq('pool_id', poolId)
    .eq('golfer_id', golferId)
    .order('round_number')
    .order('hole_number')

  return NextResponse.json({
    scores: cachedScores || [],
    fromCache: true,
  })
}
