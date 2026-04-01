import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const cookieStore = cookies()
  const sessionToken = cookieStore.get('session_token')?.value

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

  return NextResponse.json({ team: team || null })
}
