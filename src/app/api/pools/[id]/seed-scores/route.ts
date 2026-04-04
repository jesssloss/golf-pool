import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Realistic mid-Round 2 Masters scores
// Simulates: Round 1 complete, Round 2 in progress (some finished, some on course)
const SIMULATED_SCORES: Record<string, {
  r1: number
  r2: number | null
  thru: number | null
  total: number
  status: string
}> = {
  'scottie-scheffler': { r1: -6, r2: -3, thru: 14, total: -9, status: 'active' },
  'xander-schauffele': { r1: -4, r2: -4, thru: 18, total: -8, status: 'active' },
  'rory-mcilroy': { r1: -5, r2: -2, thru: 16, total: -7, status: 'active' },
  'collin-morikawa': { r1: -3, r2: -3, thru: 18, total: -6, status: 'active' },
  'ludvig-aberg': { r1: -4, r2: -1, thru: 12, total: -5, status: 'active' },
  'jon-rahm': { r1: -2, r2: -3, thru: 18, total: -5, status: 'active' },
  'hideki-matsuyama': { r1: -3, r2: -1, thru: 15, total: -4, status: 'active' },
  'bryson-dechambeau': { r1: -1, r2: -3, thru: 18, total: -4, status: 'active' },
  'wyndham-clark': { r1: -2, r2: -1, thru: 13, total: -3, status: 'active' },
  'tommy-fleetwood': { r1: -3, r2: 0, thru: 18, total: -3, status: 'active' },
  'patrick-cantlay': { r1: -1, r2: -2, thru: 18, total: -3, status: 'active' },
  'shane-lowry': { r1: -2, r2: 0, thru: 11, total: -2, status: 'active' },
  'viktor-hovland': { r1: 0, r2: -2, thru: 18, total: -2, status: 'active' },
  'brooks-koepka': { r1: -1, r2: -1, thru: 18, total: -2, status: 'active' },
  'sahith-theegala': { r1: -2, r2: 1, thru: 14, total: -1, status: 'active' },
  'tony-finau': { r1: 0, r2: -1, thru: 18, total: -1, status: 'active' },
  'russell-henley': { r1: -1, r2: 0, thru: 18, total: -1, status: 'active' },
  'sungjae-im': { r1: 1, r2: -2, thru: 18, total: -1, status: 'active' },
  'cameron-smith': { r1: 0, r2: 0, thru: 10, total: 0, status: 'active' },
  'justin-thomas': { r1: -1, r2: 1, thru: 18, total: 0, status: 'active' },
  'sam-burns': { r1: 1, r2: -1, thru: 18, total: 0, status: 'active' },
  'matt-fitzpatrick': { r1: 0, r2: 1, thru: 16, total: 1, status: 'active' },
  'keegan-bradley': { r1: 2, r2: -1, thru: 18, total: 1, status: 'active' },
  'robert-macintyre': { r1: 1, r2: 0, thru: 13, total: 1, status: 'active' },
  'will-zalatoris': { r1: 0, r2: 2, thru: 18, total: 2, status: 'active' },
  'max-homa': { r1: 2, r2: 0, thru: 15, total: 2, status: 'active' },
  'adam-scott': { r1: 1, r2: 1, thru: 18, total: 2, status: 'active' },
  'brian-harman': { r1: 3, r2: 0, thru: 18, total: 3, status: 'active' },
  'jordan-spieth': { r1: 1, r2: 2, thru: 18, total: 3, status: 'active' },
  'cameron-young': { r1: 2, r2: 1, thru: 12, total: 3, status: 'active' },
  'dustin-johnson': { r1: 3, r2: 1, thru: 18, total: 4, status: 'active' },
  'min-woo-lee': { r1: 2, r2: 2, thru: 18, total: 4, status: 'active' },
  'corey-conners': { r1: 1, r2: 3, thru: 18, total: 4, status: 'active' },
  'tom-kim': { r1: 4, r2: 1, thru: 18, total: 5, status: 'active' },
  'jason-day': { r1: 3, r2: 2, thru: 18, total: 5, status: 'active' },
  'chris-kirk': { r1: 2, r2: 3, thru: 18, total: 5, status: 'active' },
  'sepp-straka': { r1: 4, r2: 2, thru: 18, total: 6, status: 'active' },
  'denny-mccarthy': { r1: 3, r2: 3, thru: 18, total: 6, status: 'active' },
  'aaron-rai': { r1: 5, r2: 2, thru: 18, total: 7, status: 'active' },
  'taylor-pendrith': { r1: 4, r2: 3, thru: 18, total: 7, status: 'active' },
  'phil-mickelson': { r1: 5, r2: 3, thru: 18, total: 8, status: 'active' },
  'tiger-woods': { r1: 4, r2: 4, thru: 18, total: 8, status: 'active' },
  'bubba-watson': { r1: 6, r2: 3, thru: 18, total: 9, status: 'active' },
  'fred-couples': { r1: 5, r2: 5, thru: 18, total: 10, status: 'active' },
  'sergio-garcia': { r1: 6, r2: 4, thru: 18, total: 10, status: 'active' },
  'patrick-reed': { r1: 7, r2: 4, thru: 18, total: 11, status: 'active' },
  'joaquin-niemann': { r1: 3, r2: 1, thru: 18, total: 4, status: 'active' },
  'si-woo-kim': { r1: 4, r2: 2, thru: 18, total: 6, status: 'active' },
  'billy-horschel': { r1: 5, r2: 1, thru: 18, total: 6, status: 'active' },
  'rickie-fowler': { r1: 3, r2: 3, thru: 18, total: 6, status: 'active' },
  'tyrrell-hatton': { r1: 2, r2: 2, thru: 18, total: 4, status: 'active' },
  'nick-dunlap': { r1: 1, r2: 3, thru: 18, total: 4, status: 'active' },
  'akshay-bhatia': { r1: 3, r2: 2, thru: 18, total: 5, status: 'active' },
  'byeong-hun-an': { r1: 4, r2: 3, thru: 18, total: 7, status: 'active' },
  'stephan-jaeger': { r1: 5, r2: 2, thru: 18, total: 7, status: 'active' },
  'davis-thompson': { r1: 2, r2: 4, thru: 18, total: 6, status: 'active' },
  'jake-knapp': { r1: 6, r2: 2, thru: 18, total: 8, status: 'active' },
  'austin-eckroat': { r1: 5, r2: 4, thru: 18, total: 9, status: 'active' },
  'maverick-mcnealy': { r1: 4, r2: 5, thru: 18, total: 9, status: 'active' },
  'christiaan-bezuidenhout': { r1: 3, r2: 4, thru: 18, total: 7, status: 'active' },
}

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
    .select('*')
    .eq('id', params.id)
    .single()

  if (!pool || pool.commissioner_token !== commissionerToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Test scores are not available in production' }, { status: 403 })
  }

  // Get all golfers assigned to teams in this pool
  const { data: teamGolfers } = await supabase
    .from('team_golfers')
    .select('golfer_id, golfer_name')
    .eq('pool_id', params.id)

  if (!teamGolfers || teamGolfers.length === 0) {
    return NextResponse.json({ error: 'No team golfers found. Finalize the draft first.' }, { status: 400 })
  }

  // Get unique golfer IDs
  const uniqueGolfers = Array.from(
    new Map(teamGolfers.map(g => [g.golfer_id, g])).values()
  )

  const upserts: Array<Record<string, unknown>> = []

  for (const golfer of uniqueGolfers) {
    const scores = SIMULATED_SCORES[golfer.golfer_id]
    if (!scores) continue

    // Summary row (round_number = null)
    upserts.push({
      pool_id: params.id,
      golfer_id: golfer.golfer_id,
      golfer_name: golfer.golfer_name,
      round_number: null,
      score_to_par: null,
      total_to_par: scores.total,
      thru_hole: scores.thru,
      status: scores.status,
      world_ranking: null,
    })

    // Round 1 (complete for everyone)
    upserts.push({
      pool_id: params.id,
      golfer_id: golfer.golfer_id,
      golfer_name: golfer.golfer_name,
      round_number: 1,
      score_to_par: scores.r1,
      total_to_par: scores.r1,
      thru_hole: 18,
      status: 'active',
      world_ranking: null,
    })

    // Round 2 (if they have R2 data)
    if (scores.r2 !== null) {
      upserts.push({
        pool_id: params.id,
        golfer_id: golfer.golfer_id,
        golfer_name: golfer.golfer_name,
        round_number: 2,
        score_to_par: scores.r2,
        total_to_par: scores.total,
        thru_hole: scores.thru,
        status: 'active',
        world_ranking: null,
      })
    }
  }

  // Delete existing scores for this pool first
  await supabase
    .from('golfer_scores')
    .delete()
    .eq('pool_id', params.id)

  // Insert all scores
  const { error } = await supabase
    .from('golfer_scores')
    .insert(upserts)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: `Seeded ${uniqueGolfers.length} golfers with mid-Round 2 scores`,
    golfers: uniqueGolfers.length,
    scoreRows: upserts.length,
  })
}

// DELETE to clear test scores
export async function DELETE(
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

  await supabase
    .from('golfer_scores')
    .delete()
    .eq('pool_id', params.id)

  return NextResponse.json({ success: true, message: 'All scores cleared' })
}
