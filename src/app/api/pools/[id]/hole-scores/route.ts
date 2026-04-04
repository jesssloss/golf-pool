import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { slashGolfProvider, MONTHLY_CALL_LIMIT } from '@/lib/scores/slashgolf'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const poolId = params.id
  const golferId = request.nextUrl.searchParams.get('golferId')
  const playerId = request.nextUrl.searchParams.get('playerId')

  if (!golferId) {
    return NextResponse.json({ error: 'golferId required' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  // Check what round data we have from golfer_scores (ESPN data)
  const { data: golferScores } = await supabase
    .from('golfer_scores')
    .select('round_number, thru_hole, status')
    .eq('pool_id', poolId)
    .eq('golfer_id', golferId)
    .not('round_number', 'is', null)

  const completedRounds = new Set(
    (golferScores || [])
      .filter(s => s.thru_hole === 18 || s.thru_hole === null)
      .map(s => s.round_number)
  )

  // Check cached hole scores
  const { data: cachedScores } = await supabase
    .from('hole_scores')
    .select('*')
    .eq('pool_id', poolId)
    .eq('golfer_id', golferId)
    .order('round_number')
    .order('hole_number')

  // Determine which rounds need fetching
  type HoleScoreRow = NonNullable<typeof cachedScores>[number]
  const cachedRounds = new Map<number, { holes: HoleScoreRow[]; fetchedAt: Date }>()
  for (const score of cachedScores || []) {
    const round = score.round_number
    if (!cachedRounds.has(round)) {
      cachedRounds.set(round, { holes: [], fetchedAt: new Date(score.fetched_at) })
    }
    cachedRounds.get(round)!.holes.push(score)
  }

  let needsFetch = false
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)

  // Check each active round
  for (const gs of golferScores || []) {
    if (gs.round_number === null) continue
    const round = gs.round_number
    const cached = cachedRounds.get(round)

    if (!cached) {
      needsFetch = true
      break
    }

    // Complete rounds never need re-fetching
    if (completedRounds.has(round)) continue

    // In-progress rounds: re-fetch if cache is > 10 min old
    if (cached.fetchedAt < tenMinAgo) {
      needsFetch = true
      break
    }
  }

  if (needsFetch && playerId) {
    // Check API budget
    const monthKey = new Date().toISOString().slice(0, 7) // YYYY-MM
    const { count } = await supabase
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('provider', 'slashgolf')
      .eq('month_key', monthKey)

    const callsUsed = count || 0

    if (callsUsed < MONTHLY_CALL_LIMIT) {
      try {
        const scorecards = await slashGolfProvider.getScorecard(playerId)

        // Only log the call and cache if we got actual data back
        if (scorecards.length === 0) {
          return NextResponse.json({
            scores: cachedScores || [],
            fromCache: true,
            noData: true,
          })
        }

        // Log API call (only when we got useful data)
        await supabase.from('api_usage').insert({
          provider: 'slashgolf',
          endpoint: 'scorecard',
          month_key: monthKey,
        })

        // Get golfer name
        const { data: tg } = await supabase
          .from('team_golfers')
          .select('golfer_name')
          .eq('pool_id', poolId)
          .eq('golfer_id', golferId)
          .limit(1)
          .single()

        const golferName = tg?.golfer_name || ''

        // Cache hole scores
        for (const round of scorecards) {
          const upserts = round.holes.map(h => ({
            pool_id: poolId,
            golfer_id: golferId,
            golfer_name: golferName,
            round_number: round.round_number,
            hole_number: h.hole_number,
            par: h.par,
            score: h.score,
            fetched_at: new Date().toISOString(),
          }))

          await supabase
            .from('hole_scores')
            .upsert(upserts, { onConflict: 'pool_id,golfer_id,round_number,hole_number' })
        }

        // Re-read from cache for consistent response
        const { data: freshScores } = await supabase
          .from('hole_scores')
          .select('*')
          .eq('pool_id', poolId)
          .eq('golfer_id', golferId)
          .order('round_number')
          .order('hole_number')

        return NextResponse.json({
          scores: freshScores || [],
          apiCallsUsed: callsUsed + 1,
          apiCallsLimit: MONTHLY_CALL_LIMIT,
          fromCache: false,
        })
      } catch (err) {
        console.error('Slash Golf API error:', err)
        // Fall through to return cached data
      }
    }

    // Over limit or error: return cached with flag
    return NextResponse.json({
      scores: cachedScores || [],
      apiCallsUsed: callsUsed,
      apiCallsLimit: MONTHLY_CALL_LIMIT,
      fromCache: true,
      limitReached: callsUsed >= MONTHLY_CALL_LIMIT,
    })
  }

  // No fetch needed, return cache
  return NextResponse.json({
    scores: cachedScores || [],
    fromCache: true,
  })
}
