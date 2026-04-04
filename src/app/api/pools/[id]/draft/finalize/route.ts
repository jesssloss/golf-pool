import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const commissionerToken = cookieStore.get(`commissioner_token_${params.id}`)?.value
  const supabase = createServerSupabaseClient()

  // Verify commissioner
  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== commissionerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (pool.status !== 'drafting') {
    return NextResponse.json({ error: 'Pool is not in drafting state' }, { status: 400 })
  }

  // Verify all picks are made
  const { data: draftState } = await supabase
    .from('draft_state')
    .select('*')
    .eq('pool_id', params.id)
    .single()

  if (!draftState || draftState.current_pick <= draftState.total_picks) {
    return NextResponse.json({ error: 'Draft is not complete yet' }, { status: 400 })
  }

  // Populate team_golfers from draft_picks
  const { data: allPicks } = await supabase
    .from('draft_picks')
    .select('*')
    .eq('pool_id', params.id)

  if (allPicks && allPicks.length > 0) {
    await supabase.from('team_golfers').insert(
      allPicks.map(p => ({
        pool_id: params.id,
        team_id: p.team_id,
        golfer_id: p.golfer_id,
        golfer_name: p.golfer_name,
      }))
    )
  }

  // Set pool to active
  await supabase
    .from('pools')
    .update({ status: 'active' })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
