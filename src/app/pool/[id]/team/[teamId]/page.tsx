'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Pool, Team, TeamGolfer, GolferScore } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import FlipScore from '@/components/FlipScore'
import TeamCard from '@/components/TeamCard'
import MilestoneBanner from '@/components/MilestoneBanner'
import { MILESTONE_COPY } from '@/lib/constants/copy'
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
  if (diff <= -2) return 'bg-score-green text-white rounded-full font-bold'
  if (diff === -1) return 'text-score-green font-bold ring-1 ring-score-green rounded-full'
  if (diff === 0) return 'text-gray-700'
  if (diff === 1) return 'bg-score-red/10 text-score-red font-bold rounded-sm'
  return 'bg-score-red text-white font-bold rounded-sm'
}

export default function TeamDetail() {
  const params = useParams()
  const poolId = params.id as string
  const teamId = params.teamId as string
  const supabase = useMemo(() => createClient(), [])

  const [pool, setPool] = useState<Pool | null>(null)
  const [team, setTeam] = useState<Team | null>(null)
  const [golfers, setGolfers] = useState<(TeamGolfer & { scores: GolferScore[] })[]>([])
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [dropping, setDropping] = useState(false)
  const [confirmDropId, setConfirmDropId] = useState<string | null>(null)
  const [showTeamCard, setShowTeamCard] = useState(false)
  const [expandedGolfer, setExpandedGolfer] = useState<string | null>(null)
  const [holeScores, setHoleScores] = useState<Record<string, CachedHoleScore[]>>({})
  const [, setHoleScoresLive] = useState<Record<string, boolean>>({})
  const [holeScoresLoading, setHoleScoresLoading] = useState<Record<string, boolean>>({})

  const loadData = useCallback(async () => {
    const [poolRes, teamRes, tgRes, scoresRes] = await Promise.all([
      supabase.from('pools').select('id, name, tournament_name, invite_code, status, players_per_team, scoring_players, missed_cut_score, drop_deadline_round, draft_timer_seconds, draft_mode, buy_in_amount, payment_method, payment_details, created_at').eq('id', poolId).single(),
      supabase.from('teams').select('id, pool_id, owner_name, draft_position, is_commissioner, buy_in_paid, created_at').eq('id', teamId).single(),
      supabase.from('team_golfers').select('*').eq('pool_id', poolId).eq('team_id', teamId),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolId),
    ])

    if (poolRes.data) setPool(poolRes.data as Pool)
    if (teamRes.data) setTeam(teamRes.data as Team)

    if (tgRes.data && scoresRes.data) {
      setGolfers(tgRes.data.map(tg => ({
        ...tg,
        scores: scoresRes.data!.filter(s => s.golfer_id === tg.golfer_id),
      })))
    }

    const meRes = await fetch(`/api/pools/${poolId}/me`)
    if (meRes.ok) {
      const data = await meRes.json()
      if (data.team) setCurrentTeam(data.team)
    }
  }, [poolId, teamId, supabase])

  useEffect(() => { loadData() }, [loadData])

  // Fetch hole-by-hole scores when a golfer is expanded
  const [noDataGolfers, setNoDataGolfers] = useState<Set<string>>(new Set())

  const fetchHoleScoresRef = useRef<Set<string>>(new Set())

  const fetchHoleScores = useCallback(async (golferId: string) => {
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
  }, [holeScores, noDataGolfers, poolId])

  useEffect(() => {
    if (expandedGolfer) {
      fetchHoleScores(expandedGolfer)
    }
  }, [expandedGolfer, fetchHoleScores])

  async function dropGolfer(golferId: string) {
    setDropping(true)
    const res = await fetch(`/api/pools/${poolId}/teams/${teamId}/drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ golferId }),
    })
    if (res.ok) loadData()
    setDropping(false)
    setConfirmDropId(null)
  }

  if (!pool || !team) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center">
        <GreenJacketIcon size={32} />
        <p className="loading-pulse font-serif italic text-muted-gray mt-3">Loading...</p>
      </main>
    )
  }

  const isOwnTeam = currentTeam?.id === teamId
  const hasDropped = golfers.some(g => g.is_dropped)
  const canDrop = pool.status === 'active' && isOwnTeam && !hasDropped

  function formatScore(score: number): string {
    if (score === 0) return 'E'
    return score > 0 ? `+${score}` : `${score}`
  }

  function scoreColor(score: number): string {
    if (score < 0) return 'text-score-green'
    if (score > 0) return 'text-score-red'
    return 'text-gray-900'
  }

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
      <div className="max-w-3xl mx-auto">
        <Link href={`/pool/${poolId}`} className="text-sm text-pimento hover:underline mb-4 block min-h-[44px] flex items-center">
          Back to Leaderboard
        </Link>

        <div className="flex items-center gap-2 mb-1">
          <GreenJacketIcon size={24} />
          <h1 className="text-2xl font-serif font-bold text-pimento">{team.owner_name}</h1>
        </div>
        <p className="text-sm text-muted-gray mb-2">
          Best {pool.scoring_players} of {pool.players_per_team} golfers count
        </p>

        {/* Drop window milestone */}
        {canDrop && (
          <MilestoneBanner text={MILESTONE_COPY.dropWindow} />
        )}

        {/* Golfer rows */}
        <div className="mt-4 space-y-0">
          {golfers.map((g, idx) => {
            const roundScores = [1, 2, 3, 4].map(r => {
              const score = g.scores.find(s => s.round_number === r)
              return score ? { toPar: score.score_to_par ?? 0, thru: score.thru_hole || 18 } : null
            })
            const latestScore = g.scores.find(s => s.round_number === null) || g.scores[0]
            const total = latestScore?.total_to_par || 0
            const status = latestScore?.status || 'active'
            const isMissedCut = ['cut', 'withdrawn', 'dq'].includes(status)
            const isConfirmingDrop = confirmDropId === g.golfer_id
            const isExpanded = expandedGolfer === g.golfer_id

            return (
              <div key={g.golfer_id} className={`border-b border-muted-gray/20 ${
                g.is_dropped ? 'opacity-50' : ''
              }`}>
                {/* Main row */}
                <div className={`flex items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-cream'}`}>
                  {/* Expand button */}
                  <button
                    onClick={() => setExpandedGolfer(isExpanded ? null : g.golfer_id)}
                    className="px-3 py-3 text-muted-gray hover:text-pimento transition-colors"
                  >
                    <span className={`transform transition-transform text-xs inline-block ${isExpanded ? 'rotate-90' : ''}`}>&#9654;</span>
                  </button>

                  {/* Golfer name */}
                  <div className={`flex-1 py-3 ${g.is_dropped ? 'line-through text-muted-gray' : ''}`}>
                    <span className="font-serif font-medium">{g.golfer_name}</span>
                    {g.is_dropped && <StatusBadge status="dropped" />}
                    {!g.is_dropped && status !== 'active' && (
                      <StatusBadge status={status as 'cut' | 'withdrawn' | 'dq'} />
                    )}
                    {!g.is_dropped && latestScore?.thru_hole && latestScore.thru_hole < 18 && status === 'active' && (
                      <div className="text-[10px] text-muted-gray font-sans mt-0.5">thru {latestScore.thru_hole}</div>
                    )}
                  </div>

                  {/* Round scores */}
                  <div className="hidden sm:flex items-center gap-0">
                    {roundScores.map((rs, i) => {
                      const score = rs?.toPar ?? null
                      const isMissedCutRound = isMissedCut && score !== null && i >= (latestScore?.thru_hole === null ? 2 : 4)
                      return (
                        <div key={i} className={`w-14 py-3 text-center font-mono text-sm ${
                          g.is_dropped ? 'text-muted-gray' :
                          isMissedCutRound ? 'text-muted-gray italic' :
                          score !== null ? scoreColor(score) : 'text-muted-gray/40'
                        }`}>
                          {score !== null ? <FlipScore value={formatScore(score)} /> : '-'}
                        </div>
                      )
                    })}
                  </div>

                  {/* Total */}
                  <div className={`w-14 py-3 text-center font-mono font-bold ${
                    g.is_dropped ? 'text-muted-gray' : scoreColor(total)
                  }`}>
                    <FlipScore value={formatScore(total)} />
                  </div>

                  {/* Drop button */}
                  {canDrop && (
                    <div className="w-20 py-3 text-center">
                      {!g.is_dropped && !isConfirmingDrop && (
                        <button
                          onClick={() => setConfirmDropId(g.golfer_id)}
                          disabled={dropping}
                          className="text-xs text-score-red hover:text-red-700 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center mx-auto"
                        >
                          Drop
                        </button>
                      )}
                      {isConfirmingDrop && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-score-red font-medium">Can&apos;t undo</div>
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => dropGolfer(g.golfer_id)}
                              disabled={dropping}
                              className="text-xs bg-score-red text-white px-2 py-1 rounded-sm min-h-[36px] disabled:opacity-50"
                            >
                              {dropping ? '...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setConfirmDropId(null)}
                              className="text-xs text-muted-gray px-2 py-1 rounded-sm min-h-[36px] hover:bg-cream"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded scorecard */}
                {isExpanded && !g.is_dropped && (
                  <div className="bg-cream/30 border-t border-muted-gray/10">
                    {holeScoresLoading[g.golfer_id] && (
                      <div className="px-4 py-2 text-xs text-muted-gray italic">Loading scorecard...</div>
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

                          {/* Hole names */}
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

        {/* Team Card button */}
        <div className="mt-6 text-center">
          <button
            onClick={() => setShowTeamCard(!showTeamCard)}
            className="text-sm text-pimento hover:underline min-h-[44px] px-4"
          >
            {showTeamCard ? 'Hide Team Card' : 'View Team Card'}
          </button>
        </div>

        {showTeamCard && (
          <div className="mt-4">
            <TeamCard
              ownerName={team.owner_name}
              golfers={golfers.map((g, i) => ({ name: g.golfer_name, pickOrder: i + 1 }))}
              poolName={pool.name}
            />
          </div>
        )}
      </div>
    </main>
  )
}
