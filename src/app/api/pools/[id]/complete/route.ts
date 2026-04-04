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

  const { data: pool } = await supabase
    .from('pools')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== commissionerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  if (pool.status !== 'active') {
    return NextResponse.json({ error: 'Pool must be active to mark as complete' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pools')
    .update({ status: 'complete' })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
