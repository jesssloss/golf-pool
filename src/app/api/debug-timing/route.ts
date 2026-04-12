import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { espnProvider } from '@/lib/scores/espn'

export const maxDuration = 15

export async function GET() {
  const timings: Record<string, number> = {}
  const start = Date.now()

  // Test 1: Supabase connection
  const t1 = Date.now()
  const supabase = createServerSupabaseClient()
  const { data: pool, error: poolErr } = await supabase
    .from('pools')
    .select('id')
    .eq('slug', 'masters-pool-2026')
    .single()
  timings['supabase_pool_query'] = Date.now() - t1

  if (!pool) {
    return NextResponse.json({ error: 'Pool not found', poolErr, timings })
  }

  // Test 2: Count golfer_scores
  const t2 = Date.now()
  const { count, error: countErr } = await supabase
    .from('golfer_scores')
    .select('*', { count: 'exact', head: true })
    .eq('pool_id', pool.id)
  timings['supabase_score_count'] = Date.now() - t2

  // Test 3: ESPN API
  const t3 = Date.now()
  try {
    const scores = await espnProvider.getScores('')
    timings['espn_api'] = Date.now() - t3
    timings['espn_golfer_count'] = scores.length
  } catch (err) {
    timings['espn_api'] = Date.now() - t3
    timings['espn_error'] = -1
  }

  // Test 4: Rate limit query
  const t4 = Date.now()
  const { data: lastScore } = await supabase
    .from('golfer_scores')
    .select('updated_at')
    .eq('pool_id', pool.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()
  timings['supabase_rate_limit_query'] = Date.now() - t4

  timings['total'] = Date.now() - start

  return NextResponse.json({
    timings,
    scoreCount: count,
    countErr,
    lastScoreUpdated: lastScore?.updated_at || null,
    poolId: pool.id,
  })
}
