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

  // Verify commissioner
  const { data: pool } = await supabase
    .from('pools')
    .select('commissioner_token')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== sessionToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { paid } = await request.json()

  await supabase
    .from('teams')
    .update({ buy_in_paid: paid })
    .eq('id', params.teamId)

  return NextResponse.json({ success: true })
}
