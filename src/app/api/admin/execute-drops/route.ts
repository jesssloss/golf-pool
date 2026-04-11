// TEMPORARY: One-time admin endpoint to execute commissioner drops
// DELETE THIS FILE after use
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const DROPS: Record<string, string[]> = {
  'Lee': ['akshay-bhatia', 'nico-echavarria'],
  'Lewis': ['cameron-smith', 'alex-noren'],
  'Thomas': ['jon-rahm', 'daniel-berger'],
  'Taylor': ['patrick-cantlay', 'sungjae-im'],
  'Adam': ['robert-macintyre', 'nicolai-hojgaard'],
  'Jess': ['min-woo-lee', 'bryson-dechambeau'],
  'Joel': ['jj-spaun', 'kurt-kitayama'],
  'Dan': ['russell-henley', 'andrew-novak'],
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get('secret')
  if (secret !== 'execute-drops-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = createServerSupabaseClient()
  const poolSlug = 'masters-pool-2026'

  // Get pool
  const { data: pool, error: poolError } = await supabase
    .from('pools')
    .select('id, drop_deadline_round')
    .eq('slug', poolSlug)
    .single()

  if (!pool || poolError) {
    return NextResponse.json({ error: 'Pool not found', poolError }, { status: 404 })
  }

  // Set drop_deadline_round = 0 so dropped golfers are excluded from ALL rounds
  await supabase
    .from('pools')
    .update({ drop_deadline_round: 0 })
    .eq('id', pool.id)

  // Get all teams
  const { data: teams } = await supabase
    .from('teams')
    .select('id, owner_name')
    .eq('pool_id', pool.id)

  if (!teams) {
    return NextResponse.json({ error: 'No teams found' }, { status: 404 })
  }

  // Get all team_golfers
  const { data: allGolfers } = await supabase
    .from('team_golfers')
    .select('id, team_id, golfer_id, golfer_name')
    .eq('pool_id', pool.id)

  if (!allGolfers) {
    return NextResponse.json({ error: 'No golfers found' }, { status: 404 })
  }

  const results: { team: string; dropped: string[]; errors: string[] }[] = []

  for (const [ownerName, golferSlugs] of Object.entries(DROPS)) {
    const team = teams.find(t => t.owner_name.toLowerCase().includes(ownerName.toLowerCase()))
    if (!team) {
      results.push({ team: ownerName, dropped: [], errors: [`Team not found for "${ownerName}"`] })
      continue
    }

    const teamGolfers = allGolfers.filter(g => g.team_id === team.id)
    const errors: string[] = []
    const dropped: string[] = []

    for (const slug of golferSlugs) {
      // Try exact match first, then partial match on golfer_id
      let golfer = teamGolfers.find(g => g.golfer_id === slug)
      if (!golfer) {
        // Try matching by name parts
        golfer = teamGolfers.find(g =>
          g.golfer_id.includes(slug) || slug.includes(g.golfer_id) ||
          g.golfer_name.toLowerCase().includes(slug.replace(/-/g, ' '))
        )
      }

      if (!golfer) {
        errors.push(`Golfer "${slug}" not found on team "${ownerName}". Available: ${teamGolfers.map(g => g.golfer_id).join(', ')}`)
        continue
      }

      const { error } = await supabase
        .from('team_golfers')
        .update({ is_dropped: true, dropped_at: new Date().toISOString() })
        .eq('id', golfer.id)

      if (error) {
        errors.push(`Failed to drop ${golfer.golfer_id}: ${error.message}`)
      } else {
        dropped.push(`${golfer.golfer_name} (${golfer.golfer_id})`)
      }
    }

    results.push({ team: `${ownerName} (${team.owner_name})`, dropped, errors })
  }

  return NextResponse.json({
    success: true,
    poolId: pool.id,
    drop_deadline_round: 0,
    results,
  })
}
