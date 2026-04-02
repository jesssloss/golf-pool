import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const poolId = params.id
  const { team_id, status, amount } = await request.json()

  const supabase = createServerSupabaseClient()

  // Verify commissioner
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(`session_token_${poolId}`)?.value
  const { data: pool } = await supabase.from('pools').select('commissioner_token').eq('id', poolId).single()
  if (!pool || pool.commissioner_token !== sessionToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Upsert payment record
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('pool_id', poolId)
    .eq('team_id', team_id)
    .eq('type', 'payout')
    .single()

  if (existing) {
    await supabase.from('payments').update({ status }).eq('id', existing.id)
  } else {
    await supabase.from('payments').insert({
      pool_id: poolId,
      team_id,
      type: 'payout',
      amount: amount || 0,
      status,
      method: 'manual',
    })
  }

  return NextResponse.json({ success: true })
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const poolId = params.id
  const supabase = createServerSupabaseClient()

  // Verify the caller is a pool member
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(`session_token_${poolId}`)?.value
  if (!sessionToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }
  const { data: team } = await supabase.from('teams').select('id').eq('pool_id', poolId).eq('session_token', sessionToken).single()
  if (!team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: payments } = await supabase
    .from('payments')
    .select('*')
    .eq('pool_id', poolId)
    .eq('type', 'payout')

  return NextResponse.json({ payments: payments || [] })
}
