import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getTeamForPick } from '@/lib/utils/snake-draft'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(`session_token_${params.id}`)?.value
  const supabase = createServerSupabaseClient()
  const { golferId, golferName } = await request.json()

  // Get pool and draft state
  const [poolRes, draftRes, teamsRes] = await Promise.all([
    supabase.from('pools').select('*').eq('id', params.id).single(),
    supabase.from('draft_state').select('*').eq('pool_id', params.id).single(),
    supabase.from('teams').select('*').eq('pool_id', params.id).order('draft_position'),
  ])

  const pool = poolRes.data
  const draftState = draftRes.data
  const teams = teamsRes.data

  if (!pool || !draftState || !teams) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // Determine who should pick
  const teamIds = teams.map(t => t.id)
  const { team_id: expectedTeamId, round } = getTeamForPick(teamIds, draftState.current_pick)

  // Verify it's this player's turn (or commissioner picking on behalf)
  const myTeam = teams.find(t => t.session_token === sessionToken)
  if (!myTeam) {
    return NextResponse.json({ error: 'Not in this pool' }, { status: 403 })
  }

  const isCommissioner = pool.commissioner_token === sessionToken
  if (myTeam.id !== expectedTeamId && !isCommissioner) {
    return NextResponse.json({ error: 'Not your turn' }, { status: 400 })
  }

  // Check golfer not already picked
  const { data: existingPick } = await supabase
    .from('draft_picks')
    .select('id')
    .eq('pool_id', params.id)
    .eq('golfer_id', golferId)
    .single()

  if (existingPick) {
    return NextResponse.json({ error: 'Golfer already drafted' }, { status: 400 })
  }

  // Make the pick
  const pickingTeamId = isCommissioner && myTeam.id !== expectedTeamId ? expectedTeamId : myTeam.id

  await supabase.from('draft_picks').insert({
    pool_id: params.id,
    team_id: pickingTeamId,
    golfer_id: golferId,
    golfer_name: golferName,
    pick_number: draftState.current_pick,
    round,
  })

  const nextPick = draftState.current_pick + 1

  if (nextPick > draftState.total_picks) {
    // Draft complete - advance pick counter
    await supabase
      .from('draft_state')
      .update({ current_pick: nextPick, timer_expires_at: null })
      .eq('pool_id', params.id)

    if (pool.draft_mode === 'manual') {
      // Manual mode: wait for commissioner to finalize via /draft/finalize
    } else {
      // Live mode: auto-finalize
      try {
        const { data: allPicks } = await supabase
          .from('draft_picks')
          .select('*')
          .eq('pool_id', params.id)

        if (allPicks) {
          const { error: insertError } = await supabase.from('team_golfers').insert(
            allPicks.map(p => ({
              pool_id: params.id,
              team_id: p.team_id,
              golfer_id: p.golfer_id,
              golfer_name: p.golfer_name,
            }))
          )
          if (insertError) {
            console.error('Auto-finalize: failed to insert team_golfers', insertError)
            return NextResponse.json({ error: 'Failed to finalize draft' }, { status: 500 })
          }
        }

        // Set pool to active
        const { error: statusError } = await supabase
          .from('pools')
          .update({ status: 'active' })
          .eq('id', params.id)
        if (statusError) {
          console.error('Auto-finalize: failed to update pool status', statusError)
          return NextResponse.json({ error: 'Failed to activate pool' }, { status: 500 })
        }
      } catch (err) {
        console.error('Auto-finalize: unexpected error', err)
        return NextResponse.json({ error: 'Failed to finalize draft' }, { status: 500 })
      }
    }
  } else {
    // Advance to next pick
    // No timer for manual mode or unlimited timer (draft_timer_seconds === 0)
    const useTimer = pool.draft_mode !== 'manual' && pool.draft_timer_seconds > 0
    await supabase
      .from('draft_state')
      .update({
        current_pick: nextPick,
        timer_expires_at: useTimer
          ? new Date(Date.now() + pool.draft_timer_seconds * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq('pool_id', params.id)
  }

  return NextResponse.json({ success: true, nextPick })
}
