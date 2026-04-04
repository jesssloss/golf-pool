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
    .select('commissioner_token')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== commissionerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { action } = await request.json()

  if (action === 'randomize') {
    // Get all teams
    const { data: teams } = await supabase
      .from('teams')
      .select('id')
      .eq('pool_id', params.id)

    if (!teams) {
      return NextResponse.json({ error: 'No teams found' }, { status: 404 })
    }

    // Shuffle
    const shuffled = [...teams].sort(() => Math.random() - 0.5)

    // Update draft positions
    for (let i = 0; i < shuffled.length; i++) {
      await supabase
        .from('teams')
        .update({ draft_position: i + 1 })
        .eq('id', shuffled[i].id)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
