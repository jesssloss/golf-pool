'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Pool, Team, TeamGolfer, GolferScore } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import GreenJacketIcon from '@/components/GreenJacketIcon'
import { SLASHGOLF_PLAYER_IDS } from '@/lib/data/slashgolf-ids'

// Course pars and hole names — replace with your tournament course
const COURSE_PARS = [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4]
const COURSE_HOLE_NAMES = [
  'Tea Olive', 'Pink Dogwood', 'Flowering Peach', 'Flowering Crab Apple',
  'Magnolia', 'Juniper', 'Pampas', 'Yellow Jasmine', 'Carolina Cherry',
  'Camellia', 'White Dogwood', 'Golden Bell', 'Azalea', 'Chinese Fir',
  'Firethorn', 'Redbud', 'Nandina', 'Holly'
]

interface CachedHoleScore {
  round_number: number
  hole_number: number
  par: number
  score: number
}

// Generate realistic fake hole scores for a round given the round total to par
function generateFakeHoleScores(roundToPar: number, thruHole: number = 18): (number | null)[] {
  const scores: (number | null)[] = []
  let remaining = roundToPar

  for (let h = 0; h < 18; h++) {
    if (h >= thruHole) {
      scores.push(null)
      continue
    }
    const holesLeft = thruHole - h
    const par = COURSE_PARS[h]

    if (holesLeft === 1) {
      scores.push(par + remaining)
    } else {
      let holeScore = par
      const rand = Math.sin(h * 17 + roundToPar * 31) * 0.5 + 0.5

      if (remaining < 0 && rand < 0.4) {
        holeScore = par - 1
        remaining += 1
      } else if (remaining > 0 && rand > 0.6) {
        holeScore = par + 1
        remaining -= 1
      } else if (rand > 0.95 && par === 5) {
        holeScore = par - 2
        remaining += 2
      }

      scores.push(holeScore)
    }
  }
  return scores
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function holeScoreLabel(score: number, _par: number): string {
  return `${score}`
}

function holeScoreStyle(score: number, par: number): string {
  const diff = score - par
  if (diff <= -2) return 'bg-score-green text-white rounded-full font-bold' // eagle
  if (diff === -1) return 'text-score-green font-bold ring-1 ring-score-green rounded-full' // birdie
  if (diff === 0) return 'text-gray-700' // par
  if (diff === 1) return 'bg-score-red/10 text-score-red font-bold rounded-sm' // bogey
  return 'bg-score-red text-white font-bold rounded-sm' // double+
}

export default function PublicTeamDetail() {
  const params = useParams()
  const slug = params.slug as string
  const teamId = params.teamId as string
  const supabase = useMemo(() => createClient(), [])

  const [pool, setPool] = useState<Pool | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [golfers, setGolfers] = useState<(TeamGolfer & { scores: GolferScore[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGolfer, setExpandedGolfer] = useState<string | null>(null)
  const [holeScores, setHoleScores] = useState<Record<string, CachedHoleScore[]>>({})
  const [, setHoleScoresLive] = useState<Record<string, boolean>>({})
  const [holeScoresLoading, setHoleScoresLoading] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async () => {
    const { data: poolData } = await supabase
      .from('pools')
      .select('id, name, tournament_name, invite_code, status, players_per_team, scoring_players, missed_cut_score, drop_deadline_round, draft_timer_seconds, draft_mode, slug, buy_in_amount, payment_method, payment_details, created_at')
      .eq('slug', slug)
      .single()

    if (!poolData) { setLoading(false); return }
    setPool(poolData as Pool)

    const [teamRes, tgRes, scoresRes] = await Promise.all([
      supabase.from('teams').select('id, pool_id, owner_name, draft_position, is_commissioner, buy_in_paid, created_at').eq('id', teamId).single(),
      supabase.from('team_golfers').select('*').eq('pool_id', poolData.id).eq('team_id', teamId),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolData.id),
    ])

    if (teamRes.data) setTeam(teamRes.data as Team)
    if (tgRes.data && scoresRes.data) {
      const teamGolfers = tgRes.data
      setGolfers(teamGolfers.map(tg => ({
        ...tg,
        scores: scoresRes.data!.filter(s => s.golfer_id === tg.golfer_id),
      })))

      // Batch-fetch all hole scores for this team's golfers in one query
      const golferIds = teamGolfers.map(tg => tg.golfer_id)
      const { data: allHoleScores } = await supabase
        .from('hole_scores')
        .select('golfer_id, round_number, hole_number, par, score')
        .eq('pool_id', poolData.id)
        .in('golfer_id', golferIds)
        .order('round_number')
        .order('hole_number')

      if (allHoleScores && allHoleScores.length > 0) {
        const grouped: Record<string, CachedHoleScore[]> = {}
        for (const hs of allHoleScores) {
          if (!grouped[hs.golfer_id]) grouped[hs.golfer_id] = []
          grouped[hs.golfer_id].push(hs)
        }
        setHoleScores(grouped)
      }
    }
    setLoading(false)
  }, [slug, teamId, supabase])

  useEffect(() => { loadData() }, [loadData])

  // Fetch hole-by-hole scores when a golfer is expanded
  const [noDataGolfers, setNoDataGolfers] = useState<Set<string>>(new Set())

  const fetchHoleScoresRef = useRef<Set<string>>(new Set())

  const fetchHoleScores = useCallback(async (golferId: string, poolId: string) => {
    if (holeScores[golferId] || noDataGolfers.has(golferId) || fetchHoleScoresRef.current.has(golferId)) return
    fetchHoleScoresRef.current.add(golferId)

    setHoleScoresLoading(prev => ({ ...prev, [golferId]: true }))

    const playerId = SLASHGOLF_PLAYER_IDS[golferId] || null
    const queryParams = new URLSearchParams({ golferId })
    if (playerId) queryParams.set('playerId', playerId)

    try {
      const res = await fetch(`/api/pools/${poolId}/hole-scores?${queryParams}`)
      if (res.ok) {
        const data = await res.json()
        if (data.noData || !data.scores || data.scores.length === 0) {
          setNoDataGolfers(prev => new Set(prev).add(golferId))
        } else {
          setHoleScores(prev => ({ ...prev, [golferId]: data.scores }))
          setHoleScoresLive(prev => ({ ...prev, [golferId]: !data.fromCache }))
        }
      } else {
        setNoDataGolfers(prev => new Set(prev).add(golferId))
      }
    } catch {
      setNoDataGolfers(prev => new Set(prev).add(golferId))
    } finally {
      setHoleScoresLoading(prev => ({ ...prev, [golferId]: false }))
      fetchHoleScoresRef.current.delete(golferId)
    }
  }, [holeScores, noDataGolfers])

  // Trigger fetch when golfer is expanded
  useEffect(() => {
    if (expandedGolfer && pool) {
      fetchHoleScores(expandedGolfer, pool.id)
    }
  }, [expandedGolfer, pool, fetchHoleScores])

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="loading-pulse font-serif italic text-muted-gray mt-3">Loading...</p>
      </main>
    )
  }

  if (!pool || !team) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="text-score-red mt-3">Team not found</p>
      </main>
    )
  }

  function formatScore(score: number): string {
    if (score === 0) return 'E'
    return score > 0 ? `+${score}` : `${score}`
  }

  function scoreColor(score: number): string {
    if (score < 0) return 'text-score-green'
    if (score > 0) return 'text-score-red'
    return 'text-gray-900'
  }

  // Build hole scores for a round from real data or fallback to fake
  function getHoleScoresForRound(
    golferId: string,
    roundNum: number,
    toPar: number,
    thru: number
  ): { scores: (number | null)[]; isLive: boolean } {
    const realScores = holeScores[golferId]
    if (realScores && realScores.length > 0) {
      const roundHoles = realScores.filter(s => s.round_number === roundNum)
      if (roundHoles.length > 0) {
        const scores: (number | null)[] = Array(18).fill(null)
        for (const h of roundHoles) {
          if (h.hole_number >= 1 && h.hole_number <= 18) {
            scores[h.hole_number - 1] = h.score
          }
        }
        return { scores, isLive: true }
      }
    }
    return { scores: generateFakeHoleScores(toPar, thru), isLive: false }
  }

  return (
    <main className="min-h-screen py-4 px-4">
      <div className="max-w-4xl mx-auto">
        <Link href={`/p/${slug}`} className="text-sm text-pimento hover:underline mb-4 block min-h-[44px] flex items-center">
          &larr; Back to Leaderboard
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <GreenJacketIcon size={24} />
          <h1 className="text-2xl font-serif font-bold text-pimento">{team.owner_name}</h1>
        </div>
        <p className="text-sm text-muted-gray mb-4">
          {pool.tournament_name}
        </p>

        {/* Golfer cards */}
        <div className="space-y-3">
          {golfers.map((g) => {
            const latestScore = g.scores.find(s => s.round_number === null) || g.scores[0]
            const total = latestScore?.total_to_par || 0
            const status = latestScore?.status || 'active'
            const thruHole = latestScore?.thru_hole || 0
            const isExpanded = expandedGolfer === g.golfer_id
            const roundScores = [1, 2, 3, 4].map(r => {
              const score = g.scores.find(s => s.round_number === r)
              return score ? { toPar: score.score_to_par ?? 0, thru: score.thru_hole || 18 } : null
            })

            return (
              <div key={g.golfer_id} className={`border rounded-sm overflow-hidden ${
                g.is_dropped ? 'opacity-50 border-muted-gray/20' : 'border-muted-gray/20'
              }`}>
                {/* Golfer summary row - clickable */}
                <button
                  onClick={() => setExpandedGolfer(isExpanded ? null : g.golfer_id)}
                  className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-cream/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className={`transform transition-transform text-muted-gray text-xs ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                    <div className="text-left">
                      <span className={`font-serif font-semibold ${g.is_dropped ? 'line-through text-muted-gray' : ''}`}>
                        {g.golfer_name}
                      </span>
                      {g.is_dropped && <StatusBadge status="dropped" />}
                      {!g.is_dropped && status !== 'active' && (
                        <StatusBadge status={status as 'cut' | 'withdrawn' | 'dq'} />
                      )}
                      {!g.is_dropped && thruHole > 0 && thruHole < 18 && status === 'active' && (
                        <span className="ml-2 text-[10px] text-muted-gray">thru {thruHole}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Round summary pills */}
                    <div className="hidden sm:flex items-center gap-2">
                      {roundScores.map((rs, i) => (
                        <div key={i} className={`text-xs font-mono px-2 py-0.5 rounded-sm ${
                          rs === null ? 'text-muted-gray/30' :
                          rs.toPar < 0 ? 'bg-score-green/10 text-score-green' :
                          rs.toPar > 0 ? 'bg-score-red/10 text-score-red' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {rs === null ? '-' : formatScore(rs.toPar)}
                        </div>
                      ))}
                    </div>
                    <span className={`font-mono font-bold text-lg ${scoreColor(total)}`}>
                      {formatScore(total)}
                    </span>
                  </div>
                </button>

                {/* Expanded scorecard */}
                {isExpanded && !g.is_dropped && (
                  <div className="border-t border-muted-gray/20 bg-cream/30">
                    {holeScoresLoading[g.golfer_id] && (
                      <div className="px-4 py-2 text-xs text-muted-gray italic">Loading scorecard...</div>
                    )}
                    {!holeScoresLoading[g.golfer_id] && roundScores.every(rs => rs === null) && (
                      <div className="px-4 py-4 text-sm text-muted-gray text-center">
                        No scorecard data available yet
                      </div>
                    )}
                    {roundScores.map((rs, roundIdx) => {
                      if (!rs) return null
                      const roundNum = roundIdx + 1
                      const thru = rs.thru || 18
                      const { scores: holeScoresArr, isLive } = getHoleScoresForRound(g.golfer_id, roundNum, rs.toPar, thru)
                      const front9 = holeScoresArr.slice(0, 9)
                      const back9 = holeScoresArr.slice(9, 18)
                      const front9Total = front9.filter((s): s is number => s !== null).reduce((a, b) => a + b, 0)
                      const back9Total = back9.filter((s): s is number => s !== null).reduce((a, b) => a + b, 0)
                      const front9Par = COURSE_PARS.slice(0, 9).reduce((a, b) => a + b, 0)
                      const back9Par = COURSE_PARS.slice(9, 18).reduce((a, b) => a + b, 0)

                      return (
                        <div key={roundNum} className="px-4 py-3 border-b border-muted-gray/10 last:border-b-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-muted-gray uppercase tracking-wide">
                                Round {roundNum}
                              </span>
                              {isLive && (
                                <span className="text-[9px] bg-score-green/10 text-score-green px-1.5 py-0.5 rounded-sm font-medium">
                                  LIVE
                                </span>
                              )}
                            </div>
                            <span className={`text-sm font-mono font-bold ${scoreColor(rs.toPar)}`}>
                              {formatScore(rs.toPar)}
                              {thru < 18 && <span className="text-[10px] text-muted-gray font-normal ml-1">thru {thru}</span>}
                            </span>
                          </div>

                          {/* Front 9 */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse mb-1">
                              <thead>
                                <tr>
                                  <th className="px-1 py-0.5 text-left text-muted-gray font-normal w-10">Hole</th>
                                  {[1,2,3,4,5,6,7,8,9].map(h => (
                                    <th key={h} className="px-1 py-0.5 text-center text-muted-gray font-normal w-8">{h}</th>
                                  ))}
                                  <th className="px-1 py-0.5 text-center text-muted-gray font-semibold w-10">Out</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="text-muted-gray/60">
                                  <td className="px-1 py-0.5 text-left">Par</td>
                                  {COURSE_PARS.slice(0, 9).map((p, i) => (
                                    <td key={i} className="px-1 py-0.5 text-center">{p}</td>
                                  ))}
                                  <td className="px-1 py-0.5 text-center font-semibold">{front9Par}</td>
                                </tr>
                                <tr>
                                  <td className="px-1 py-1 text-left text-muted-gray"></td>
                                  {front9.map((score, i) => (
                                    <td key={i} className="px-0.5 py-1 text-center">
                                      {score !== null ? (
                                        <span className={`inline-flex items-center justify-center w-6 h-6 text-xs ${holeScoreStyle(score, COURSE_PARS[i])}`}>
                                          {holeScoreLabel(score, COURSE_PARS[i])}
                                        </span>
                                      ) : (
                                        <span className="text-muted-gray/30">-</span>
                                      )}
                                    </td>
                                  ))}
                                  <td className={`px-1 py-1 text-center font-semibold ${scoreColor(front9Total - front9Par)}`}>
                                    {front9.some(s => s !== null) ? front9Total : '-'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>

                            {/* Back 9 */}
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr>
                                  <th className="px-1 py-0.5 text-left text-muted-gray font-normal w-10">Hole</th>
                                  {[10,11,12,13,14,15,16,17,18].map(h => (
                                    <th key={h} className="px-1 py-0.5 text-center text-muted-gray font-normal w-8">{h}</th>
                                  ))}
                                  <th className="px-1 py-0.5 text-center text-muted-gray font-semibold w-10">In</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="text-muted-gray/60">
                                  <td className="px-1 py-0.5 text-left">Par</td>
                                  {COURSE_PARS.slice(9, 18).map((p, i) => (
                                    <td key={i} className="px-1 py-0.5 text-center">{p}</td>
                                  ))}
                                  <td className="px-1 py-0.5 text-center font-semibold">{back9Par}</td>
                                </tr>
                                <tr>
                                  <td className="px-1 py-1 text-left text-muted-gray"></td>
                                  {back9.map((score, i) => (
                                    <td key={i} className="px-0.5 py-1 text-center">
                                      {score !== null ? (
                                        <span className={`inline-flex items-center justify-center w-6 h-6 text-xs ${holeScoreStyle(score, COURSE_PARS[i + 9])}`}>
                                          {holeScoreLabel(score, COURSE_PARS[i + 9])}
                                        </span>
                                      ) : (
                                        <span className="text-muted-gray/30">-</span>
                                      )}
                                    </td>
                                  ))}
                                  <td className={`px-1 py-1 text-center font-semibold ${scoreColor(back9Total - back9Par)}`}>
                                    {back9.some(s => s !== null) ? back9Total : '-'}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Hole names tooltip row */}
                          <div className="mt-1 text-[9px] text-muted-gray/40 italic hidden sm:block">
                            {COURSE_HOLE_NAMES.slice(0, thru).join(' \u00b7 ')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
