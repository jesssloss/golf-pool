'use client'

import { useState } from 'react'
import type { Pool } from '@/types'

interface TeamStanding {
  team: { id: string; owner_name: string }
  golfers: { golfer_id: string; golfer_name: string; is_dropped: boolean; status: string }[]
  teamTotal: number
  rank: number
}

interface Props {
  poolId: string
  pool: Pool
  standings: TeamStanding[]
  onDropsChanged: () => void
}

export default function DropManager({ poolId, pool, standings, onDropsChanged }: Props) {
  const dropsPerTeam = pool.players_per_team - pool.scoring_players
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [selectedDrops, setSelectedDrops] = useState<Record<string, Set<string>>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function toggleDrop(teamId: string, golferId: string) {
    setSelectedDrops(prev => {
      const current = new Set(prev[teamId] || [])
      if (current.has(golferId)) {
        current.delete(golferId)
      } else if (current.size < dropsPerTeam) {
        current.add(golferId)
      }
      return { ...prev, [teamId]: current }
    })
  }

  async function submitDrops(teamId: string) {
    const drops = selectedDrops[teamId]
    if (!drops || drops.size !== dropsPerTeam) return

    setSaving(teamId)
    setError(null)
    try {
      const res = await fetch(`/api/pools/${poolId}/teams/${teamId}/drop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ golferIds: Array.from(drops) }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save drops')
      } else {
        setExpandedTeam(null)
        setSelectedDrops(prev => {
          const next = { ...prev }
          delete next[teamId]
          return next
        })
        onDropsChanged()
      }
    } catch {
      setError('Network error. Try again.')
    }
    setSaving(null)
  }

  function initTeamDrops(teamId: string, golfers: TeamStanding['golfers']) {
    // Pre-select already-dropped golfers
    const alreadyDropped = new Set(
      golfers.filter(g => g.is_dropped).map(g => g.golfer_id)
    )
    setSelectedDrops(prev => ({ ...prev, [teamId]: alreadyDropped }))
    setExpandedTeam(teamId)
    setError(null)
  }

  return (
    <div className="mt-8 bg-white rounded-sm border border-muted-gray/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-muted-gray/20 bg-cream">
        <h2 className="font-serif font-semibold text-gray-700">
          Manage Drops
        </h2>
        <p className="text-xs text-muted-gray mt-1">
          Drop {dropsPerTeam} golfer{dropsPerTeam > 1 ? 's' : ''} per team after Round {pool.drop_deadline_round || 2}
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 bg-score-red/10 text-score-red text-sm">{error}</div>
      )}

      <div className="divide-y divide-muted-gray/20">
        {standings.map(s => {
          const isExpanded = expandedTeam === s.team.id
          const teamDrops = selectedDrops[s.team.id] || new Set()
          const hasDrops = s.golfers.some(g => g.is_dropped)

          return (
            <div key={s.team.id}>
              <div
                className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-cream/50 transition-colors"
                onClick={() => {
                  if (isExpanded) {
                    setExpandedTeam(null)
                  } else {
                    initTeamDrops(s.team.id, s.golfers)
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.team.owner_name}</span>
                  {hasDrops && (
                    <span className="text-xs px-2 py-0.5 bg-muted-gray/10 text-muted-gray rounded-sm">
                      {s.golfers.filter(g => g.is_dropped).length} dropped
                    </span>
                  )}
                </div>
                <span className="text-muted-gray text-sm">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2">
                  {s.golfers.map(g => {
                    const isSelected = teamDrops.has(g.golfer_id)
                    const isCut = ['cut', 'withdrawn', 'dq'].includes(g.status)
                    return (
                      <button
                        key={g.golfer_id}
                        onClick={() => toggleDrop(s.team.id, g.golfer_id)}
                        className={`w-full text-left px-3 py-2 rounded-sm border text-sm flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'border-score-red/40 bg-score-red/5 text-score-red'
                            : 'border-muted-gray/20 hover:bg-cream/50'
                        }`}
                      >
                        <span className={isSelected ? 'line-through' : ''}>
                          {g.golfer_name}
                          {isCut && <span className="ml-1 text-xs text-muted-gray">(MC)</span>}
                        </span>
                        {isSelected && <span className="text-xs font-medium">DROP</span>}
                      </button>
                    )
                  })}

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-gray">
                      {teamDrops.size} / {dropsPerTeam} selected
                    </span>
                    <button
                      onClick={() => submitDrops(s.team.id)}
                      disabled={teamDrops.size !== dropsPerTeam || saving === s.team.id}
                      className="px-4 py-2 min-h-[44px] bg-pimento text-white text-sm rounded-sm hover:bg-pimento-dark transition-colors disabled:opacity-50"
                    >
                      {saving === s.team.id ? 'Saving...' : hasDrops ? 'Update Drops' : 'Confirm Drops'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
