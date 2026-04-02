'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Pool, Team, TeamGolfer, GolferScore, PayoutRule } from '@/types'
import { MILESTONE_COPY, EMPTY_STATE_COPY } from '@/lib/constants/copy'
import FlipScore from './FlipScore'
import StatusBadge from './StatusBadge'
import GreenJacketIcon from './GreenJacketIcon'
import MilestoneBanner from './MilestoneBanner'
import GreenJacketCard from './GreenJacketCard'

interface Props {
  poolId: string
  pool: Pool
}

interface TeamStanding {
  team: Team
  golfers: (TeamGolfer & { scores: GolferScore[]; total: number; status: string })[]
  teamTotal: number
  rank: number
}

export default function Leaderboard({ poolId, pool }: Props) {
  const supabase = createClient()
  const [standings, setStandings] = useState<TeamStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [showJacketCard, setShowJacketCard] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [prevRanks, setPrevRanks] = useState<Record<string, number>>({})
  const [payoutRules, setPayoutRules] = useState<PayoutRule[]>([])
  const [copied, setCopied] = useState(false)
  const isFirstLoad = useRef(true)

  const loadStandings = useCallback(async () => {
    const [teamsRes, tgRes, scoresRes, rulesRes] = await Promise.all([
      supabase.from('teams').select('*').eq('pool_id', poolId),
      supabase.from('team_golfers').select('*').eq('pool_id', poolId),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolId),
      supabase.from('payout_rules').select('*').eq('pool_id', poolId).order('position'),
    ])

    const teams = teamsRes.data || []
    const teamGolfers = tgRes.data || []
    const allScores = scoresRes.data || []
    if (rulesRes.data) setPayoutRules(rulesRes.data)

    const teamStandings: TeamStanding[] = teams.map(team => {
      const golfers = teamGolfers
        .filter(tg => tg.team_id === team.id)
        .map(tg => {
          const scores = allScores.filter(s => s.golfer_id === tg.golfer_id)
          const roundScores = scores.filter(s => s.round_number !== null)
          const latestStatus = scores.find(s => s.round_number === null) || scores[0]
          const isCutWdDq = latestStatus && ['cut', 'withdrawn', 'dq'].includes(latestStatus.status)

          let total: number
          if (isCutWdDq) {
            const playedTotal = roundScores.reduce((sum, s) => sum + (s.score_to_par || 0), 0)
            const missedRounds = 4 - roundScores.length
            total = playedTotal + (missedRounds * pool.missed_cut_score)
          } else {
            total = latestStatus?.total_to_par || 0
          }

          return { ...tg, scores, total, status: latestStatus?.status || 'active' }
        })

      const activeGolfers = golfers.filter(g => !g.is_dropped)
      activeGolfers.sort((a, b) => a.total - b.total)
      const scoringGolfers = activeGolfers.slice(0, pool.scoring_players)
      const teamTotal = scoringGolfers.reduce((sum, g) => sum + g.total, 0)

      return { team, golfers, teamTotal, rank: 0 }
    })

    teamStandings.sort((a, b) => a.teamTotal - b.teamTotal)
    let currentRank = 1
    teamStandings.forEach((s, i) => {
      if (i > 0 && s.teamTotal > teamStandings[i - 1].teamTotal) {
        currentRank = i + 1
      }
      s.rank = currentRank
    })

    // Track previous ranks for movement arrows (skip first load)
    if (!isFirstLoad.current) {
      const currentRanks: Record<string, number> = {}
      standings.forEach(s => { currentRanks[s.team.id] = s.rank })
      setPrevRanks(currentRanks)
    }
    isFirstLoad.current = false

    setStandings(teamStandings)
    setLoading(false)
    setLastUpdated(new Date())
  }, [poolId, pool, supabase, standings])

  useEffect(() => { loadStandings() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load current team
  useEffect(() => {
    async function loadMe() {
      const res = await fetch(`/api/pools/${poolId}/me`)
      if (res.ok) {
        const data = await res.json()
        if (data.team) setCurrentTeam(data.team)
      }
    }
    loadMe()
  }, [poolId])

  // Realtime subscription for instant updates when cron writes scores
  useEffect(() => {
    const channel = supabase
      .channel('scores-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'golfer_scores', filter: `pool_id=eq.${poolId}` }, () => loadStandings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_golfers', filter: `pool_id=eq.${poolId}` }, () => loadStandings())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [poolId, supabase, loadStandings])

  // Auto-refresh: pull fresh ESPN scores every 60s for active pools
  useEffect(() => {
    if (pool.status !== 'active') return
    const interval = setInterval(async () => {
      await fetch(`/api/pools/${poolId}/scores/refresh`, { method: 'POST' })
      loadStandings()
    }, 60_000)
    return () => clearInterval(interval)
  }, [pool.status, poolId, loadStandings])

  const handleManualRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch(`/api/pools/${poolId}/scores/refresh`, { method: 'POST' })
      await loadStandings()
    } finally {
      setRefreshing(false)
    }
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

  function getMovement(teamId: string, currentRank: number): 'up' | 'down' | 'same' | null {
    const prev = prevRanks[teamId]
    if (prev === undefined) return null
    if (currentRank < prev) return 'up'
    if (currentRank > prev) return 'down'
    return 'same'
  }

  function getPayoutAmount(position: number): number | null {
    const rule = payoutRules.find(r => r.position === position)
    if (!rule) return null
    const totalPot = pool.buy_in_amount * standings.length
    return Math.round(totalPot * rule.percentage / 100)
  }

  async function shareStandings() {
    const lines = [
      `\u26f3 ${pool.name}`,
      ...standings.map(s => `${s.rank}. ${s.team.owner_name} (${formatScore(s.teamTotal)})`),
      `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    ]
    const text = lines.join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="loading-pulse font-serif italic text-muted-gray">{EMPTY_STATE_COPY.waitingFirstRound}</p>
      </main>
    )
  }

  const isComplete = pool.status === 'complete'
  const winner = isComplete && standings.length > 0 ? standings[0] : null
  const myStanding = currentTeam ? standings.find(s => s.team.id === currentTeam.id) : null

  // Check if any round 4 scores exist (Final Round label)
  const hasR4 = standings.some(s => s.golfers.some(g => g.scores.some(sc => sc.round_number === 4)))

  return (
    <main className="min-h-screen py-4 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-serif font-bold text-augusta">{pool.name}</h1>
            <p className="text-sm text-muted-gray">{pool.tournament_name}</p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-gray hidden sm:inline">
                Updated {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={shareStandings}
              className="text-sm px-3 py-2 min-h-[44px] border border-augusta text-augusta rounded-sm hover:bg-augusta hover:text-white transition-colors"
            >
              {copied ? 'Copied!' : 'Share'}
            </button>
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="text-sm px-3 py-2 min-h-[44px] border border-augusta text-augusta rounded-sm hover:bg-augusta hover:text-white transition-colors disabled:opacity-50"
            >
              {refreshing ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Milestone banners */}
        {isComplete && winner && (
          <MilestoneBanner text={MILESTONE_COPY.poolFinalized(pool.name)} />
        )}

        {/* Your Position Card */}
        {myStanding && (
          <Link href={`/pool/${poolId}/team/${myStanding.team.id}`}>
            <div className="bg-white rounded-sm p-4 mb-4 border border-augusta/30 flex items-center justify-between hover:bg-cream transition-colors">
              <div>
                <div className="text-xs text-muted-gray">Your Team</div>
                <div className="font-serif font-semibold text-lg">{myStanding.team.owner_name}</div>
              </div>
              <div className="flex items-center gap-4">
                {getPayoutAmount(myStanding.rank) && (
                  <div className="text-right hidden sm:block">
                    <div className="text-xs text-muted-gray">Prize</div>
                    <div className="font-semibold text-score-green">${getPayoutAmount(myStanding.rank)}</div>
                  </div>
                )}
                <div className="text-right">
                  <div className="text-xs text-muted-gray">Position</div>
                  <div className="text-2xl font-serif font-bold text-augusta">#{myStanding.rank}</div>
                </div>
                <div className={`text-xl font-mono font-bold ${scoreColor(myStanding.teamTotal)}`}>
                  {formatScore(myStanding.teamTotal)}
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* Green Jacket Card overlay */}
        {showJacketCard && winner && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowJacketCard(false)}>
            <div onClick={e => e.stopPropagation()}>
              <GreenJacketCard
                winnerName={winner.team.owner_name}
                poolName={pool.name}
                winningScore={formatScore(winner.teamTotal)}
              />
              <p className="text-center text-cream/60 text-xs mt-4 font-sans">Tap outside to close</p>
            </div>
          </div>
        )}

        {/* Mobile Card Layout */}
        <div className="mt-4 sm:hidden space-y-2">
          {standings.map((s) => {
            const isWinner = isComplete && s.rank === 1
            const isMe = currentTeam && s.team.id === currentTeam.id
            const movement = getMovement(s.team.id, s.rank)
            const payout = getPayoutAmount(s.rank)

            return (
              <Link key={s.team.id} href={`/pool/${poolId}/team/${s.team.id}`}>
                <div className={`rounded-sm p-3 border ${
                  isWinner ? 'bg-masters-gold/10 border-masters-gold/40' :
                  isMe ? 'bg-augusta/5 border-augusta/30' :
                  'bg-white border-muted-gray/20'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-muted-gray w-6">{s.rank}</span>
                      {movement === 'up' && <span className="text-score-green text-xs">&#9650;</span>}
                      {movement === 'down' && <span className="text-score-red text-xs">&#9660;</span>}
                      <span className="font-serif font-semibold">
                        {isWinner && <GreenJacketIcon size={16} />}
                        {' '}{s.team.owner_name}
                        {isMe && <span className="ml-1 text-xs text-augusta/60">(you)</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {payout && (
                        <span className="text-xs font-semibold text-score-green">${payout}</span>
                      )}
                      <span className={`font-mono font-bold ${scoreColor(s.teamTotal)}`}>
                        {formatScore(s.teamTotal)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 pl-8">
                    {s.golfers.map(g => (
                      <span key={g.golfer_id} className={`text-xs ${g.is_dropped ? 'line-through text-muted-gray opacity-50' : 'text-muted-gray'}`}>
                        {g.golfer_name}
                        {!g.is_dropped && g.status !== 'active' && (
                          <StatusBadge status={g.status as 'cut' | 'withdrawn' | 'dq'} />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Desktop Table Layout */}
        <div className="mt-4 overflow-x-auto hidden sm:block">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-augusta text-cream">
                <th className="px-3 py-2 text-left font-serif font-bold w-10">#</th>
                <th className="px-3 py-2 text-left font-serif font-bold">Team</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">R1</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">R2</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">R3</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">{hasR4 ? 'Final' : 'R4'}</th>
                <th className="px-3 py-2 text-center font-serif font-bold w-16">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, idx) => {
                const isWinner = isComplete && s.rank === 1
                const isMe = currentTeam && s.team.id === currentTeam.id
                const movement = getMovement(s.team.id, s.rank)
                const payout = getPayoutAmount(s.rank)
                // Calculate team round totals from best scoring golfers
                const activeGolfers = s.golfers.filter(g => !g.is_dropped)
                activeGolfers.sort((a, b) => a.total - b.total)
                const scoringGolfers = activeGolfers.slice(0, pool.scoring_players)

                const roundTotals = [1, 2, 3, 4].map(r => {
                  const scores = scoringGolfers
                    .map(g => g.scores.find(sc => sc.round_number === r)?.score_to_par)
                    .filter((sc): sc is number => sc !== null && sc !== undefined)
                  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) : null
                })

                return (
                  <tr
                    key={s.team.id}
                    className={`border-b border-muted-gray/20 ${
                      isWinner ? 'bg-masters-gold/10' :
                      isMe ? 'bg-augusta/5' :
                      idx % 2 === 0 ? 'bg-white' : 'bg-cream'
                    }`}
                  >
                    <td className="px-3 py-3 font-serif font-bold text-muted-gray">
                      <div className="flex items-center gap-1">
                        {s.rank}
                        {movement === 'up' && <span className="text-score-green text-[10px]">&#9650;</span>}
                        {movement === 'down' && <span className="text-score-red text-[10px]">&#9660;</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/pool/${poolId}/team/${s.team.id}`} className="hover:underline">
                        <span className="font-serif font-semibold">
                          {isWinner && <GreenJacketIcon size={16} />}
                          {' '}{s.team.owner_name}
                          {isMe && <span className="ml-1 text-xs text-augusta/60">(you)</span>}
                        </span>
                      </Link>
                      {payout && (
                        <span className="ml-2 text-xs font-semibold text-score-green">${payout}</span>
                      )}
                      {/* Inline golfer list */}
                      <div className="mt-1 space-y-0.5">
                        {s.golfers.map(g => (
                          <div key={g.golfer_id} className={`text-xs flex items-center gap-1 ${g.is_dropped ? 'line-through text-muted-gray opacity-50' : ''}`}>
                            <span className="truncate">{g.golfer_name}</span>
                            {!g.is_dropped && g.status !== 'active' && (
                              <StatusBadge status={g.status as 'cut' | 'withdrawn' | 'dq'} />
                            )}
                            {g.is_dropped && <StatusBadge status="dropped" />}
                          </div>
                        ))}
                      </div>
                    </td>
                    {roundTotals.map((rt, i) => (
                      <td key={i} className={`px-3 py-3 text-center font-mono ${rt !== null ? scoreColor(rt) : 'text-muted-gray'}`}>
                        {rt !== null ? <FlipScore value={formatScore(rt)} /> : '-'}
                      </td>
                    ))}
                    <td className={`px-3 py-3 text-center font-mono font-bold ${scoreColor(s.teamTotal)}`}>
                      <FlipScore value={formatScore(s.teamTotal)} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* View Champion button */}
        {isComplete && winner && (
          <div className="mt-6 text-center">
            <button
              onClick={() => setShowJacketCard(true)}
              className="px-6 py-3 min-h-[44px] bg-augusta text-white font-serif rounded-sm hover:bg-augusta-dark transition-colors"
            >
              View Champion
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
