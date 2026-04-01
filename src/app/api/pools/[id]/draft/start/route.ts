import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

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

  if (pool.status !== 'lobby') {
    return NextResponse.json({ error: 'Pool is not in lobby state' }, { status: 400 })
  }

  // Get teams
  const { data: teams } = await supabase
    .from('teams')
    .select('*')
    .eq('pool_id', params.id)
    .order('draft_position')

  if (!teams || teams.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 teams to start draft' }, { status: 400 })
  }

  // Assign draft positions if not set
  const needsPositions = teams.some(t => !t.draft_position)
  if (needsPositions) {
    for (let i = 0; i < teams.length; i++) {
      await supabase
        .from('teams')
        .update({ draft_position: i + 1 })
        .eq('id', teams[i].id)
    }
  }

  const totalPicks = teams.length * pool.players_per_team

  // Create draft state
  await supabase
    .from('draft_state')
    .insert({
      pool_id: params.id,
      current_pick: 1,
      total_picks: totalPicks,
      timer_expires_at: new Date(Date.now() + pool.draft_timer_seconds * 1000).toISOString(),
    })

  // Update pool status
  await supabase
    .from('pools')
    .update({ status: 'drafting' })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
