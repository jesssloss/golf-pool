import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const start = Date.now()
  const timings: Record<string, number | string> = {}

  // Test 1: ESPN API (no Supabase)
  try {
    const t1 = Date.now()
    const res = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard',
      { signal: AbortSignal.timeout(5000) }
    )
    timings['espn_ms'] = Date.now() - t1
    timings['espn_status'] = res.status
  } catch (e) {
    timings['espn_error'] = e instanceof Error ? e.message : 'unknown'
  }

  // Test 2: Supabase URL resolution (just DNS + TCP, no query)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_SET'
  timings['supabase_url'] = supabaseUrl.substring(0, 40)
  timings['service_key_set'] = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'yes' : 'no'

  // Test 3: Basic Supabase REST call
  if (supabaseUrl !== 'NOT_SET' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const t3 = Date.now()
      const res = await fetch(`${supabaseUrl}/rest/v1/pools?slug=eq.masters-pool-2026&select=id&limit=1`, {
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        signal: AbortSignal.timeout(5000),
      })
      timings['supabase_direct_ms'] = Date.now() - t3
      timings['supabase_status'] = res.status
      const data = await res.json()
      timings['supabase_rows'] = Array.isArray(data) ? data.length : 'not-array'
    } catch (e) {
      timings['supabase_error'] = e instanceof Error ? e.message : 'unknown'
      timings['supabase_direct_ms'] = Date.now() - start
    }
  }

  timings['total_ms'] = Date.now() - start

  return NextResponse.json(timings)
}
