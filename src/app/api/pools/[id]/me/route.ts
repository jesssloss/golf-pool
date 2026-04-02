import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get(`session_token_${params.id}`)?.value

  if (!sessionToken) {
    return NextResponse.json({ team: null })
  }

  const supabase = createServerSupabaseClient()

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('pool_id', params.id)
    .eq('session_token', sessionToken)
    .single()

  if (!team) {
    return NextResponse.json({ team: null, isCommissioner: false })
  }

  // Check commissioner status server-side by comparing tokens
  const { data: pool } = await supabase
    .from('pools')
    .select('commissioner_token')
    .eq('id', params.id)
    .single()

  const isCommissioner = !!(pool && pool.commissioner_token === sessionToken)

  return NextResponse.json({ team, isCommissioner })
}
