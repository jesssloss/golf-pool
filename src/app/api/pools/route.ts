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
    draftMode,
    slug,
    buyInAmount,
    paymentMethod,
    paymentDetails,
    payoutRules,
  } = body

  if (!poolName || !commissionerName) {
    return NextResponse.json({ error: 'Pool name and commissioner name are required' }, { status: 400 })
  }

  // Input validation: bounds checking
  if (playersPerTeam < 2 || playersPerTeam > 10) {
    return NextResponse.json({ error: 'Players per team must be between 2 and 10' }, { status: 400 })
  }
  if (scoringPlayers < 1 || scoringPlayers > playersPerTeam) {
    return NextResponse.json({ error: 'Scoring players must be between 1 and players per team' }, { status: 400 })
  }
  if (missedCutScore < 1 || missedCutScore > 200) {
    return NextResponse.json({ error: 'Missed cut score must be between 1 and 200' }, { status: 400 })
  }
  if (draftTimerSeconds < 0 || draftTimerSeconds > 600) {
    return NextResponse.json({ error: 'Draft timer must be between 0 and 600 seconds' }, { status: 400 })
  }
  if (buyInAmount < 0 || buyInAmount > 10000) {
    return NextResponse.json({ error: 'Buy-in amount must be between 0 and 10000' }, { status: 400 })
  }

  // Validate slug for manual mode
  if (draftMode === 'manual' && slug) {
    if (!/^[a-z0-9-]{3,50}$/.test(slug)) {
      return NextResponse.json({ error: 'URL slug must be 3-50 characters, lowercase letters, numbers, and hyphens only' }, { status: 400 })
    }
  }

  const supabase = createServerSupabaseClient()
  const sessionToken = crypto.randomUUID()
  const inviteCode = generateInviteCode()

  // Check slug uniqueness if provided
  if (slug) {
    const { data: existingPool } = await supabase
      .from('pools')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existingPool) {
      return NextResponse.json({ error: 'This URL is already taken. Try a different one.' }, { status: 400 })
    }
  }

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
      draft_mode: draftMode || 'live',
      slug: slug || null,
      buy_in_amount: buyInAmount,
      payment_method: paymentMethod || 'cash',
      payment_details: paymentDetails || null,
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

  // For manual mode, don't create a team for the commissioner.
  // They'll add players (possibly including themselves) via the add player API.
  if (draftMode !== 'manual') {
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
  }

  // Set session cookie scoped to this pool
  const cookieStore = cookies()
  cookieStore.set(`session_token_${pool.id}`, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  return NextResponse.json({ pool })
}
