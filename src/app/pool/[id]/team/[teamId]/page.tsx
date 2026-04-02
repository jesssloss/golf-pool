'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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

  const loadData = useCallback(async () => {
    const [poolRes, teamRes, tgRes, scoresRes] = await Promise.all([
      supabase.from('pools').select('*').eq('id', poolId).single(),
      supabase.from('teams').select('*').eq('id', teamId).single(),
      supabase.from('team_golfers').select('*').eq('pool_id', poolId).eq('team_id', teamId),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolId),
    ])

    if (poolRes.data) setPool(poolRes.data)
    if (teamRes.data) setTeam(teamRes.data)

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

  // Check if any round 4 scores exist
  const hasR4 = golfers.some(g => g.scores.some(sc => sc.round_number === 4))

  function formatScore(score: number): string {
    if (score === 0) return 'E'
    return score > 0 ? `+${score}` : `${score}`
  }

  function scoreColor(score: number): string {
    if (score < 0) return 'text-score-green'
    if (score > 0) return 'text-score-red'
    return 'text-gray-900'
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

        {/* Scoreboard table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-pimento text-cream">
                <th className="px-4 py-2 text-left font-serif font-bold">Golfer</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">R1</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">R2</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">R3</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">{hasR4 ? 'Final' : 'R4'}</th>
                <th className="px-2 py-2 text-center font-serif font-bold w-14">Total</th>
                {canDrop && <th className="px-2 py-2 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {golfers.map((g, idx) => {
                const roundScores = [1, 2, 3, 4].map(r => {
                  const score = g.scores.find(s => s.round_number === r)
                  return score?.score_to_par ?? null
                })
                const latestScore = g.scores.find(s => s.round_number === null) || g.scores[0]
                const total = latestScore?.total_to_par || 0
                const status = latestScore?.status || 'active'
                const isMissedCut = ['cut', 'withdrawn', 'dq'].includes(status)
                const isConfirmingDrop = confirmDropId === g.golfer_id

                return (
                  <tr
                    key={g.golfer_id}
                    className={`border-b border-muted-gray/20 ${
                      g.is_dropped ? 'opacity-50' : idx % 2 === 0 ? 'bg-white' : 'bg-cream'
                    }`}
                  >
                    <td className={`px-4 py-3 ${g.is_dropped ? 'line-through text-muted-gray' : ''}`}>
                      <span className="font-serif font-medium">{g.golfer_name}</span>
                      {g.is_dropped && <StatusBadge status="dropped" />}
                      {!g.is_dropped && status !== 'active' && (
                        <StatusBadge status={status as 'cut' | 'withdrawn' | 'dq'} />
                      )}
                      {/* Thru indicator */}
                      {!g.is_dropped && latestScore?.thru_hole && latestScore.thru_hole < 18 && status === 'active' && (
                        <div className="text-[10px] text-muted-gray font-sans mt-0.5">thru {latestScore.thru_hole}</div>
                      )}
                    </td>
                    {roundScores.map((score, i) => {
                      const isMissedCutRound = isMissedCut && score !== null && i >= (latestScore?.thru_hole === null ? 2 : 4)
                      return (
                        <td key={i} className={`px-2 py-3 text-center font-mono ${
                          g.is_dropped ? 'text-muted-gray' :
                          isMissedCutRound ? 'text-muted-gray italic' :
                          score !== null ? scoreColor(score) : 'text-muted-gray/40'
                        }`}>
                          {score !== null ? <FlipScore value={formatScore(score)} /> : '-'}
                        </td>
                      )
                    })}
                    <td className={`px-2 py-3 text-center font-mono font-bold ${
                      g.is_dropped ? 'text-muted-gray' : scoreColor(total)
                    }`}>
                      <FlipScore value={formatScore(total)} />
                    </td>
                    {canDrop && (
                      <td className="px-2 py-3 text-center">
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
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
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
