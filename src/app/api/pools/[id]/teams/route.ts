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

  if (pool.draft_mode !== 'manual') {
    return NextResponse.json({ error: 'Adding players is only available in manual mode' }, { status: 400 })
  }

  if (pool.status !== 'lobby' && pool.status !== 'drafting') {
    return NextResponse.json({ error: 'Cannot add players after draft is finalized' }, { status: 400 })
  }

  // Check max player cap (field of ~60 golfers)
  const FIELD_SIZE = 60
  const maxTeams = pool.draft_mode === 'manual'
    ? 50 // manual mode allows shared golfers, so no hard limit from field size
    : Math.floor(FIELD_SIZE / pool.players_per_team)
  const { count: teamCount } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', params.id)

  if ((teamCount || 0) >= maxTeams) {
    return NextResponse.json({
      error: `Pool is full. Maximum ${maxTeams} teams.`
    }, { status: 400 })
  }

  const { playerName } = await request.json()

  if (!playerName || typeof playerName !== 'string' || playerName.trim().length === 0) {
    return NextResponse.json({ error: 'Player name is required' }, { status: 400 })
  }

  if (playerName.trim().length > 50) {
    return NextResponse.json({ error: 'Player name must be 50 characters or less' }, { status: 400 })
  }

  // Create team with a random session token (player won't use it, but column may be required)
  const teamToken = crypto.randomUUID()

  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({
      pool_id: params.id,
      owner_name: playerName.trim(),
      session_token: teamToken,
      is_commissioner: false,
    })
    .select()
    .single()

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 })
  }

  return NextResponse.json({ team })
}

export async function DELETE(
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

  if (pool.status !== 'lobby' && pool.status !== 'drafting') {
    return NextResponse.json({ error: 'Cannot remove players after draft is finalized' }, { status: 400 })
  }

  const { teamId } = await request.json()

  if (!teamId) {
    return NextResponse.json({ error: 'Team ID is required' }, { status: 400 })
  }

  // Verify team exists in this pool
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('pool_id', params.id)
    .single()

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  // Delete any existing draft picks for this team
  await supabase
    .from('draft_picks')
    .delete()
    .eq('team_id', teamId)
    .eq('pool_id', params.id)

  // Delete the team
  const { error: deleteError } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('pool_id', params.id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
