import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { generateInviteCode } from '@/lib/utils/invite-code'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    poolName,
    commissionerName,
    playersPerTeam,
    scoringPlayers,
    missedCutScore,
    dropDeadlineRound,
    draftTimerSeconds,
    buyInAmount,
    payoutRules,
  } = body

  if (!poolName || !commissionerName) {
    return NextResponse.json({ error: 'Pool name and commissioner name are required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()
  const sessionToken = crypto.randomUUID()
  const inviteCode = generateInviteCode()

  // Create pool
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .insert({
      name: poolName,
      invite_code: inviteCode,
      commissioner_token: sessionToken,
      players_per_team: playersPerTeam,
      scoring_players: scoringPlayers,
      missed_cut_score: missedCutScore,
      drop_deadline_round: dropDeadlineRound,
      draft_timer_seconds: draftTimerSeconds,
      buy_in_amount: buyInAmount,
    })
    .select()
    .single()

  if (poolError) {
    return NextResponse.json({ error: poolError.message }, { status: 500 })
  }

  // Create payout rules
  if (payoutRules?.length) {
    const { error: payoutError } = await supabase
      .from('payout_rules')
      .insert(
        payoutRules.map((r: { position: number; percentage: number }) => ({
          pool_id: pool.id,
          position: r.position,
          percentage: r.percentage,
        }))
      )

    if (payoutError) {
      return NextResponse.json({ error: payoutError.message }, { status: 500 })
    }
  }

  // Create commissioner's team
  const { error: teamError } = await supabase
    .from('teams')
    .insert({
      pool_id: pool.id,
      owner_name: commissionerName,
      session_token: sessionToken,
      is_commissioner: true,
    })

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 })
  }

  // Set session cookie
  const cookieStore = cookies()
  cookieStore.set('session_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  return NextResponse.json({ pool })
}
