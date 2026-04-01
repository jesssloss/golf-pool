import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { inviteCode, playerName } = await request.json()

  if (!inviteCode || !playerName) {
    return NextResponse.json({ error: 'Invite code and player name are required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Find pool by invite code
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('*')
    .eq('invite_code', inviteCode.toUpperCase())
    .single()

  if (poolError || !pool) {
    return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  }

  if (pool.status !== 'lobby') {
    return NextResponse.json({ error: 'This pool is no longer accepting new players' }, { status: 400 })
  }

  // Check if player already has a session for this pool
  const cookieStore = cookies()
  const existingToken = cookieStore.get('session_token')?.value
  if (existingToken) {
    const { data: existingTeam } = await supabase
      .from('teams')
      .select('id')
      .eq('pool_id', pool.id)
      .eq('session_token', existingToken)
      .single()

    if (existingTeam) {
      return NextResponse.json({ pool_id: pool.id })
    }
  }

  const sessionToken = crypto.randomUUID()

  const { error: teamError } = await supabase
    .from('teams')
    .insert({
      pool_id: pool.id,
      owner_name: playerName,
      session_token: sessionToken,
    })

  if (teamError) {
    return NextResponse.json({ error: teamError.message }, { status: 500 })
  }

  cookieStore.set('session_token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })

  return NextResponse.json({ pool_id: pool.id })
}
