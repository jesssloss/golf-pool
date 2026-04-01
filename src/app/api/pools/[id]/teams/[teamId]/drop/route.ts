import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; teamId: string } }
) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get('session_token')?.value
  const supabase = createServerSupabaseClient()

  // Verify team ownership
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', params.teamId)
    .eq('session_token', sessionToken)
    .single()

  if (!team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Check no drop already made
  const { data: existingDrop } = await supabase
    .from('team_golfers')
    .select('id')
    .eq('team_id', params.teamId)
    .eq('is_dropped', true)
    .single()

  if (existingDrop) {
    return NextResponse.json({ error: 'Already dropped a golfer' }, { status: 400 })
  }

  const { golferId } = await request.json()

  const { error } = await supabase
    .from('team_golfers')
    .update({ is_dropped: true, dropped_at: new Date().toISOString() })
    .eq('pool_id', params.id)
    .eq('team_id', params.teamId)
    .eq('golfer_id', golferId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
