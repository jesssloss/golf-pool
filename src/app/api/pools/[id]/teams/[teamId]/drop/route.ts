import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; teamId: string } }
) {
  const cookieStore = cookies()
  const commissionerToken = cookieStore.get(`commissioner_token_${params.id}`)?.value
  const supabase = createServerSupabaseClient()

  // Verify commissioner
  const { data: pool } = await supabase
    .from('pools')
    .select('id, commissioner_token, players_per_team, scoring_players')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== commissionerToken) {
    return NextResponse.json({ error: 'Unauthorized — commissioner only' }, { status: 403 })
  }

  const { golferIds } = await request.json()

  if (!Array.isArray(golferIds) || golferIds.length === 0) {
    return NextResponse.json({ error: 'golferIds array required' }, { status: 400 })
  }

  const expectedDrops = pool.players_per_team - pool.scoring_players
  if (golferIds.length !== expectedDrops) {
    return NextResponse.json(
      { error: `Must drop exactly ${expectedDrops} golfers` },
      { status: 400 }
    )
  }

  // Clear any previous drops for this team (allows commissioner to redo)
  await supabase
    .from('team_golfers')
    .update({ is_dropped: false, dropped_at: null })
    .eq('pool_id', params.id)
    .eq('team_id', params.teamId)

  // Apply new drops
  for (const golferId of golferIds) {
    const { error } = await supabase
      .from('team_golfers')
      .update({ is_dropped: true, dropped_at: new Date().toISOString() })
      .eq('pool_id', params.id)
      .eq('team_id', params.teamId)
      .eq('golfer_id', golferId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, dropped: golferIds })
}
