'use client'

import { useState } from 'react'
import type { Team, GolferScore } from '@/types'
import GreenJacketIcon from './GreenJacketIcon'

interface ManualDraftEntryProps {
  poolId: string
  teams: Team[]
  golfers: GolferScore[]
  playersPerTeam: number
  existingPicks: { team_id: string; golfer_id: string; golfer_name: string }[]
  onPicksSaved: () => void
  onFinalize: () => void
  finalizing: boolean
}

export default function ManualDraftEntry({
  poolId,
  teams,
  golfers,
  playersPerTeam,
  existingPicks,
  onPicksSaved,
  onFinalize,
  finalizing,
}: ManualDraftEntryProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [selectedGolfers, setSelectedGolfers] = useState<{ golferId: string; golferName: string }[]>([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Which teams already have picks entered
  const teamPickMap = new Map<string, { golfer_id: string; golfer_name: string }[]>()
  for (const pick of existingPicks) {
    const existing = teamPickMap.get(pick.team_id) || []
    existing.push({ golfer_id: pick.golfer_id, golfer_name: pick.golfer_name })
    teamPickMap.set(pick.team_id, existing)
  }

  const allTeamsComplete = teams.every(t => {
    const picks = teamPickMap.get(t.id) || []
    return picks.length === playersPerTeam
  })

  // All golfer IDs already picked by OTHER teams (not the currently selected team)
  const pickedByOthers = new Set<string>()
  teamPickMap.forEach((picks, teamId) => {
    if (teamId !== selectedTeamId) {
      picks.forEach(p => pickedByOthers.add(p.golfer_id))
    }
  })

  // Also exclude golfers already selected in current session
  const selectedIds = new Set(selectedGolfers.map(g => g.golferId))

  const availableGolfers = golfers
    .filter(g => !pickedByOthers.has(g.golfer_id) && !selectedIds.has(g.golfer_id))
    .filter(g => !search || g.golfer_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.world_ranking || 999) - (b.world_ranking || 999))

  function selectTeam(teamId: string) {
    setSelectedTeamId(teamId)
    setError('')
    setSearch('')
    // Pre-populate if this team already has picks
    const existing = teamPickMap.get(teamId)
    if (existing && existing.length > 0) {
      setSelectedGolfers(existing.map(p => ({ golferId: p.golfer_id, golferName: p.golfer_name })))
    } else {
      setSelectedGolfers([])
    }
  }

  function addGolfer(golferId: string, golferName: string) {
    if (selectedGolfers.length >= playersPerTeam) return
    setSelectedGolfers([...selectedGolfers, { golferId, golferName }])
    setSearch('')
  }

  function removeGolfer(golferId: string) {
    setSelectedGolfers(selectedGolfers.filter(g => g.golferId !== golferId))
  }

  async function savePicks() {
    if (!selectedTeamId || selectedGolfers.length !== playersPerTeam) return
    setSaving(true)
    setError('')

    try {
      const res = await fetch(`/api/pools/${poolId}/draft/batch-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: selectedTeamId, golfers: selectedGolfers }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to save picks')
      } else {
        setSelectedTeamId(null)
        setSelectedGolfers([])
        onPicksSaved()
      }
    } catch {
      setError('Failed to save picks. Check your connection.')
    }
    setSaving(false)
  }

  const selectedTeam = teams.find(t => t.id === selectedTeamId)

  // Team list view
  if (!selectedTeamId) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-gray mb-2">
          Select a player to enter their picks. Each player needs {playersPerTeam} golfers.
        </div>

        <div className="space-y-2">
          {teams.map(team => {
            const picks = teamPickMap.get(team.id) || []
            const isComplete = picks.length === playersPerTeam
            return (
              <button
                key={team.id}
                onClick={() => selectTeam(team.id)}
                className={`w-full text-left p-4 rounded-sm border transition-colors min-h-[44px] ${
                  isComplete
                    ? 'border-score-green/30 bg-score-green/5'
                    : 'border-muted-gray/20 bg-white hover:bg-cream'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-serif font-semibold text-pimento">{team.owner_name}</div>
                    {isComplete ? (
                      <div className="text-xs text-score-green mt-1">
                        {picks.map(p => p.golfer_name).join(', ')}
                      </div>
                    ) : picks.length > 0 ? (
                      <div className="text-xs text-cheddar mt-1">
                        {picks.length} of {playersPerTeam} entered
                      </div>
                    ) : (
                      <div className="text-xs text-muted-gray mt-1">No picks entered yet</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {isComplete && (
                      <span className="text-score-green text-sm">&#10003;</span>
                    )}
                    <span className="text-muted-gray text-sm">&#9654;</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {allTeamsComplete && (
          <button
            onClick={onFinalize}
            disabled={finalizing}
            className="w-full bg-pimento text-white py-3 px-6 rounded-sm font-semibold hover:bg-pimento-dark transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {finalizing ? 'Finalizing...' : 'Finalize Draft & Start Scoring'}
          </button>
        )}
      </div>
    )
  }

  // Golfer entry view for selected team
  return (
    <div className="space-y-4">
      <button
        onClick={() => { setSelectedTeamId(null); setSelectedGolfers([]); setError('') }}
        className="text-sm text-pimento hover:text-pimento-dark font-medium flex items-center gap-1 min-h-[44px]"
      >
        &#8592; Back to players
      </button>

      <div className="flex items-center gap-2 mb-2">
        <GreenJacketIcon size={20} />
        <h2 className="text-lg font-serif font-bold text-pimento">
          {selectedTeam?.owner_name}&apos;s Picks
        </h2>
        <span className="text-sm text-muted-gray">
          ({selectedGolfers.length}/{playersPerTeam})
        </span>
      </div>

      {error && (
        <div className="bg-red-50 text-score-red p-3 rounded-sm text-sm">{error}</div>
      )}

      {/* Selected golfers */}
      {selectedGolfers.length > 0 && (
        <div className="bg-cream rounded-sm p-3 space-y-1">
          {selectedGolfers.map((g, i) => (
            <div key={g.golferId} className="flex items-center justify-between py-1">
              <span className="text-sm">
                <span className="text-muted-gray mr-2">{i + 1}.</span>
                {g.golferName}
              </span>
              <button
                onClick={() => removeGolfer(g.golferId)}
                className="text-score-red text-xs hover:text-red-700 min-h-[32px] min-w-[32px] flex items-center justify-center"
              >
                &#10005;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      {selectedGolfers.length === playersPerTeam && (
        <button
          onClick={savePicks}
          disabled={saving}
          className="w-full bg-pimento text-white py-3 px-6 rounded-sm font-semibold hover:bg-pimento-dark transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Saving...' : `Save ${selectedTeam?.owner_name}'s Picks`}
        </button>
      )}

      {/* Golfer search and list */}
      {selectedGolfers.length < playersPerTeam && (
        <div className="bg-white rounded-sm border border-muted-gray/20">
          <div className="p-3 border-b border-muted-gray/20">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search golfers..."
              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:ring-2 focus:ring-pimento focus:border-transparent"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {availableGolfers.map(g => (
              <button
                key={g.golfer_id}
                onClick={() => addGolfer(g.golfer_id, g.golfer_name)}
                className="w-full px-3 py-2 min-h-[44px] text-left text-sm flex items-center justify-between border-b border-muted-gray/10 hover:bg-cream transition-colors"
              >
                <span>{g.golfer_name}</span>
                {g.world_ranking && (
                  <span className="text-xs text-muted-gray">#{g.world_ranking}</span>
                )}
              </button>
            ))}
            {availableGolfers.length === 0 && (
              <div className="p-4 text-center text-muted-gray text-sm font-serif italic">
                {search ? 'No golfers match your search' : 'No available golfers'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
