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
  const { teamId, golfers } = await request.json() as {
    teamId: string
    golfers: { golferId: string; golferName: string }[]
  }

  // Verify commissioner
  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== sessionToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (pool.draft_mode !== 'manual') {
    return NextResponse.json({ error: 'Batch picks only available in manual mode' }, { status: 400 })
  }

  if (pool.status !== 'drafting') {
    return NextResponse.json({ error: 'Pool is not in drafting state' }, { status: 400 })
  }

  // Verify team exists in this pool
  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('id', teamId)
    .eq('pool_id', params.id)
    .single()

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  // Verify correct number of golfers
  if (golfers.length !== pool.players_per_team) {
    return NextResponse.json({
      error: `Must select exactly ${pool.players_per_team} golfers`
    }, { status: 400 })
  }

  // Check for duplicates within submission
  const golferIds = golfers.map(g => g.golferId)
  if (new Set(golferIds).size !== golferIds.length) {
    return NextResponse.json({ error: 'Duplicate golfers in selection' }, { status: 400 })
  }

  // Check none of these golfers are already picked by other teams
  const { data: existingPicks } = await supabase
    .from('draft_picks')
    .select('golfer_id, golfer_name')
    .eq('pool_id', params.id)
    .in('golfer_id', golferIds)

  if (existingPicks && existingPicks.length > 0) {
    const names = existingPicks.map(p => p.golfer_name).join(', ')
    return NextResponse.json({
      error: `Already picked by another team: ${names}`
    }, { status: 400 })
  }

  // Remove any existing picks for this team (in case of re-entry)
  await supabase
    .from('draft_picks')
    .delete()
    .eq('pool_id', params.id)
    .eq('team_id', teamId)

  // Insert all picks for this team
  const { error: insertError } = await supabase.from('draft_picks').insert(
    golfers.map((g, i) => ({
      pool_id: params.id,
      team_id: teamId,
      golfer_id: g.golferId,
      golfer_name: g.golferName,
      pick_number: i + 1, // sequential within team, not global snake order
      round: i + 1,
    }))
  )

  if (insertError) {
    console.error('Batch pick insert error:', insertError)
    return NextResponse.json({ error: 'Failed to save picks' }, { status: 500 })
  }

  // Check if all teams now have their picks
  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('pool_id', params.id)

  const { data: allPicks } = await supabase
    .from('draft_picks')
    .select('team_id')
    .eq('pool_id', params.id)

  if (teams && allPicks) {
    const teamsWithPicks = new Set(allPicks.map(p => p.team_id))
    const allTeamsComplete = teams.every(t => teamsWithPicks.has(t.id))

    // Update draft state to reflect progress
    const picksPerTeam = pool.players_per_team
    const totalPicks = teams.length * picksPerTeam
    const currentPick = allTeamsComplete ? totalPicks + 1 : allPicks.length + 1

    await supabase
      .from('draft_state')
      .update({ current_pick: currentPick, timer_expires_at: null })
      .eq('pool_id', params.id)
  }

  return NextResponse.json({ success: true })
}
