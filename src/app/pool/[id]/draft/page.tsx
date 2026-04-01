'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getTeamForPick } from '@/lib/utils/snake-draft'
import type { Pool, Team, DraftState, DraftPick, GolferScore } from '@/types'
import MilestoneBanner from '@/components/MilestoneBanner'
import { MILESTONE_COPY, EMPTY_STATE_COPY } from '@/lib/constants/copy'

export default function DraftPage() {
  const params = useParams()
  const router = useRouter()
  const poolId = params.id as string
  const supabase = createClient()

  const [pool, setPool] = useState<Pool | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [draftState, setDraftState] = useState<DraftState | null>(null)
  const [picks, setPicks] = useState<DraftPick[]>([])
  const [golfers, setGolfers] = useState<GolferScore[]>([])
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [picking, setPicking] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [autoPickTriggered, setAutoPickTriggered] = useState(false)

  const loadData = useCallback(async () => {
    const [poolRes, teamsRes, draftRes, picksRes, golfersRes] = await Promise.all([
      supabase.from('pools').select('*').eq('id', poolId).single(),
      supabase.from('teams').select('*').eq('pool_id', poolId).order('draft_position'),
      supabase.from('draft_state').select('*').eq('pool_id', poolId).single(),
      supabase.from('draft_picks').select('*').eq('pool_id', poolId).order('pick_number'),
      supabase.from('golfer_scores').select('*').eq('pool_id', poolId).is('round_number', null),
    ])

    if (poolRes.data) setPool(poolRes.data)
    if (teamsRes.data) setTeams(teamsRes.data)
    if (draftRes.data) setDraftState(draftRes.data)
    if (picksRes.data) setPicks(picksRes.data)
    if (golfersRes.data) setGolfers(golfersRes.data)

    const meRes = await fetch(`/api/pools/${poolId}/me`)
    if (meRes.ok) {
      const data = await meRes.json()
      if (data.team) setCurrentTeam(data.team)
    }

    setLoading(false)
  }, [poolId, supabase])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    const channel = supabase
      .channel('draft-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_picks', filter: `pool_id=eq.${poolId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'draft_state', filter: `pool_id=eq.${poolId}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pools', filter: `id=eq.${poolId}` }, () => loadData())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [poolId, supabase, loadData])

  useEffect(() => {
    if (!draftState?.timer_expires_at) {
      setTimeLeft(null)
      return
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor(
        (new Date(draftState.timer_expires_at!).getTime() - Date.now()) / 1000
      ))
      setTimeLeft(remaining)
    }, 1000)

    return () => clearInterval(interval)
  }, [draftState?.timer_expires_at])

  useEffect(() => {
    if (pool?.status === 'active') {
      router.push(`/pool/${poolId}`)
    }
  }, [pool?.status, poolId, router])

  // Reset auto-pick flag when the pick advances
  const prevPickRef = useRef(draftState?.current_pick)
  useEffect(() => {
    if (draftState?.current_pick !== prevPickRef.current) {
      prevPickRef.current = draftState?.current_pick
      setAutoPickTriggered(false)
    }
  }, [draftState?.current_pick])

  if (loading || !pool || !draftState) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="font-serif italic text-muted-gray">{EMPTY_STATE_COPY.draftBoardEmpty}</p>
      </main>
    )
  }

  const teamIds = teams.map(t => t.id)
  const isComplete = draftState.current_pick > draftState.total_picks
  const currentPickInfo = !isComplete ? getTeamForPick(teamIds, draftState.current_pick) : null
  const pickingTeam = currentPickInfo ? teams.find(t => t.id === currentPickInfo.team_id) : null
  const isMyTurn = currentTeam && pickingTeam && currentTeam.id === pickingTeam.id
  const isCommissioner = currentTeam && pool.commissioner_token === currentTeam.session_token

  const pickedGolferIds = new Set(picks.map(p => p.golfer_id))
  const availableGolfers = golfers
    .filter(g => !pickedGolferIds.has(g.golfer_id))
    .filter(g => !search || g.golfer_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999))

  async function makePick(golferId: string, golferName: string) {
    setPicking(true)
    try {
      const res = await fetch(`/api/pools/${poolId}/draft/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golferId, golferName }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error)
      }
      setSearch('')
      await loadData()
    } catch {
      alert('Failed to make pick')
    }
    setPicking(false)
  }

  async function autoPickBestAvailable() {
    if (autoPickTriggered || picking) return
    setAutoPickTriggered(true)
    // Pick the highest-ranked available golfer (already sorted by world_ranking)
    const pickedIds = new Set(picks.map(p => p.golfer_id))
    const best = golfers
      .filter(g => !pickedIds.has(g.golfer_id))
      .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999))[0]
    if (best) {
      await makePick(best.golfer_id, best.golfer_name)
    }
  }

  const rounds = pool.players_per_team
  const draftBoard: (DraftPick | null)[][] = []
  for (let r = 0; r < rounds; r++) {
    const row: (DraftPick | null)[] = []
    for (let t = 0; t < teams.length; t++) {
      const pickNum = r * teams.length + (r % 2 === 0 ? t + 1 : teams.length - t)
      const pick = picks.find(p => p.pick_number === pickNum) || null
      row.push(pick)
    }
    draftBoard.push(row)
  }

  return (
    <main className="min-h-screen py-4 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-serif font-bold text-augusta">Draft</h1>
          <div className="text-sm text-muted-gray">
            Pick {Math.min(draftState.current_pick, draftState.total_picks)} of {draftState.total_picks}
          </div>
        </div>

        {/* Milestone: draft starting */}
        {picks.length === 0 && !isComplete && (
          <MilestoneBanner text={MILESTONE_COPY.draftStarting} />
        )}

        {/* Current pick banner */}
        {!isComplete && pickingTeam && (
          <div className={`rounded-sm p-4 mb-4 ${isMyTurn ? 'bg-augusta text-white' : 'bg-white border border-muted-gray/20'}`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm opacity-75">
                  {timeLeft === 0
                    ? `Time's up! Auto-picking for ${pickingTeam.owner_name}...`
                    : isMyTurn ? MILESTONE_COPY.yourTurn : `${pickingTeam.owner_name} is picking...`}
                </div>
                <div className="text-lg font-serif font-bold">
                  Round {currentPickInfo?.round}
                </div>
              </div>
              {timeLeft !== null && (
                <div className={`text-3xl font-mono font-bold ${timeLeft <= 10 ? 'text-score-red' : ''}`}>
                  {timeLeft === 0 ? '0:00' : `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
                </div>
              )}
            </div>
            {timeLeft === 0 && isCommissioner && !autoPickTriggered && (
              <div className="mt-2">
                <button
                  onClick={autoPickBestAvailable}
                  className="bg-masters-gold text-augusta-dark px-4 py-1 rounded-sm text-sm font-semibold"
                >
                  Auto-pick best available
                </button>
              </div>
            )}
          </div>
        )}

        {isComplete && (
          <div className="bg-augusta text-white rounded-sm p-4 mb-4 text-center">
            <MilestoneBanner text={MILESTONE_COPY.draftComplete} />
            <p className="text-sm opacity-75 mt-1">Redirecting to leaderboard...</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Draft board */}
          <div className="lg:col-span-2 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-augusta text-cream">
                  <th className="px-2 py-2 text-left font-serif text-xs">Rd</th>
                  {teams.map(t => (
                    <th key={t.id} className={`px-2 py-2 text-left font-serif text-xs ${
                      pickingTeam?.id === t.id ? 'text-masters-gold font-bold' : ''
                    }`}>
                      {t.owner_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {draftBoard.map((row, r) => (
                  <tr key={r} className={`border-b border-muted-gray/20 ${r % 2 === 0 ? 'bg-white' : 'bg-cream'}`}>
                    <td className="px-2 py-2 text-muted-gray font-serif">{r + 1}</td>
                    {row.map((pick, t) => (
                      <td key={t} className="px-2 py-2">
                        {pick ? (
                          <span className="text-xs font-medium">{pick.golfer_name}</span>
                        ) : (
                          <span className="text-muted-gray/40">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Golfer picker */}
          <div className="bg-white rounded-sm border border-muted-gray/20">
            <div className="p-3 border-b border-muted-gray/20">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search golfers..."
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-augusta focus:border-transparent"
              />
            </div>
            <div className="max-h-96 overflow-y-auto">
              {availableGolfers.map(g => (
                <button
                  key={g.golfer_id}
                  disabled={(!isMyTurn && !isCommissioner) || picking}
                  onClick={() => makePick(g.golfer_id, g.golfer_name)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-cream disabled:opacity-50 disabled:hover:bg-white flex items-center justify-between border-b border-muted-gray/10"
                >
                  <span>{g.golfer_name}</span>
                  {g.world_ranking && (
                    <span className="text-xs text-muted-gray">#{g.world_ranking}</span>
                  )}
                </button>
              ))}
              {availableGolfers.length === 0 && (
                <div className="p-4 text-center text-muted-gray text-sm font-serif italic">
                  {golfers.length === 0 ? EMPTY_STATE_COPY.draftBoardEmpty : 'No golfers match your search'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
