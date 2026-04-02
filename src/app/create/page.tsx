'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface PayoutRule {
  position: number
  percentage: number
}

export default function CreatePool() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [formData, setFormData] = useState({
    poolName: '',
    commissionerName: '',
    playersPerTeam: 6,
    scoringPlayers: 5,
    missedCutScore: 80,
    dropDeadlineRound: 2,
    draftTimerSeconds: 90,
    buyInAmount: 50,
    paymentMethod: 'cash' as 'e-transfer' | 'paypal' | 'cash' | 'other',
    paymentDetails: '',
  })
  const [payoutRules, setPayoutRules] = useState<PayoutRule[]>([
    { position: 1, percentage: 60 },
    { position: 2, percentage: 25 },
    { position: 3, percentage: 15 },
  ])

  const totalPercentage = payoutRules.reduce((sum, r) => sum + r.percentage, 0)

  function addPayoutPosition() {
    const nextPosition = payoutRules.length + 1
    setPayoutRules([...payoutRules, { position: nextPosition, percentage: 0 }])
  }

  function removePayoutPosition(index: number) {
    const updated = payoutRules.filter((_, i) => i !== index)
      .map((r, i) => ({ ...r, position: i + 1 }))
    setPayoutRules(updated)
  }

  function updatePayoutPercentage(index: number, percentage: number) {
    const updated = [...payoutRules]
    updated[index] = { ...updated[index], percentage }
    setPayoutRules(updated)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (totalPercentage !== 100) {
      setError('Payout percentages must sum to 100%')
      return
    }
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, payoutRules }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.push(`/pool/${data.pool.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pool')
      setLoading(false)
    }
  }

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-pimento focus:border-transparent"

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-serif font-bold text-pimento mb-8">Create Your Pool</h1>

        {error && (
          <div className="bg-red-50 text-score-red p-3 rounded-sm mb-4 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pool Name</label>
            <input
              type="text"
              required
              value={formData.poolName}
              onChange={e => setFormData({ ...formData, poolName: e.target.value })}
              placeholder="e.g., The Amen Corner Invitational"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your Name (Commissioner)</label>
            <input
              type="text"
              required
              value={formData.commissionerName}
              onChange={e => setFormData({ ...formData, commissionerName: e.target.value })}
              placeholder="Your name"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buy-in ($)</label>
            <input
              type="number"
              min={0}
              value={formData.buyInAmount}
              onChange={e => setFormData({ ...formData, buyInAmount: parseInt(e.target.value) })}
              className={inputClass}
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">How will players pay?</label>
            <select
              value={formData.paymentMethod}
              onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as 'e-transfer' | 'paypal' | 'cash' | 'other' })}
              className={inputClass}
            >
              <option value="e-transfer">Interac e-Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {formData.paymentMethod === 'e-transfer' ? 'e-Transfer Email or Phone' :
               formData.paymentMethod === 'paypal' ? 'PayPal.me Username or Email' :
               'Payment Instructions'}
            </label>
            <input
              type="text"
              value={formData.paymentDetails}
              onChange={e => setFormData({ ...formData, paymentDetails: e.target.value })}
              placeholder={
                formData.paymentMethod === 'e-transfer' ? 'your@email.com' :
                formData.paymentMethod === 'paypal' ? 'paypal.me/yourhandle' :
                formData.paymentMethod === 'cash' ? 'e.g., Pay me at the clubhouse' :
                'How should players send payment?'
              }
              className={inputClass}
            />
          </div>

          {/* Payout Rules */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payout Structure</label>
            <div className="space-y-2">
              {payoutRules.map((rule, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-muted-gray w-12">#{rule.position}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rule.percentage}
                    onChange={e => updatePayoutPercentage(i, parseInt(e.target.value) || 0)}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-pimento focus:border-transparent"
                  />
                  <span className="text-sm text-muted-gray">%</span>
                  {payoutRules.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePayoutPosition(i)}
                      className="text-score-red text-sm hover:text-red-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 mt-2">
              <button
                type="button"
                onClick={addPayoutPosition}
                className="text-sm text-pimento hover:text-pimento-dark font-medium min-h-[44px] px-2"
              >
                + Add Position
              </button>
              <span className={`text-sm ${totalPercentage === 100 ? 'text-score-green' : 'text-score-red'}`}>
                Total: {totalPercentage}%
              </span>
            </div>
          </div>

          {/* Advanced Settings */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-pimento hover:text-pimento-dark font-medium flex items-center gap-1 min-h-[44px]"
            >
              <span className={`inline-block transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>&#9654;</span>
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 pl-4 border-l-2 border-cream-dark">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Golfers Per Team</label>
                    <input
                      type="number"
                      min={2}
                      max={10}
                      value={formData.playersPerTeam}
                      onChange={e => setFormData({ ...formData, playersPerTeam: parseInt(e.target.value) })}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-gray mt-1">How many golfers each team drafts</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Scoring Golfers</label>
                    <input
                      type="number"
                      min={1}
                      max={formData.playersPerTeam}
                      value={formData.scoringPlayers}
                      onChange={e => setFormData({ ...formData, scoringPlayers: parseInt(e.target.value) })}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-gray mt-1">Best N scores count toward your total</p>
                    {formData.scoringPlayers > formData.playersPerTeam && (
                      <p className="text-xs text-score-red mt-1">Must be less than or equal to golfers per team</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Missed Cut Score</label>
                    <input
                      type="number"
                      value={formData.missedCutScore}
                      onChange={e => setFormData({ ...formData, missedCutScore: parseInt(e.target.value) })}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-gray mt-1">Score added per missed round (e.g. +80 for R3 and R4)</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Drop After Round</label>
                    <input
                      type="number"
                      min={1}
                      max={3}
                      value={formData.dropDeadlineRound}
                      onChange={e => setFormData({ ...formData, dropDeadlineRound: parseInt(e.target.value) })}
                      className={inputClass}
                    />
                    <p className="text-xs text-muted-gray mt-1">Last round you can drop a golfer</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Draft Timer (seconds)</label>
                  <input
                    type="number"
                    min={30}
                    max={300}
                    value={formData.draftTimerSeconds}
                    onChange={e => setFormData({ ...formData, draftTimerSeconds: parseInt(e.target.value) })}
                    className="w-full max-w-[200px] px-3 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-pimento focus:border-transparent"
                  />
                  <p className="text-xs text-muted-gray mt-1">Time per pick before auto-draft kicks in</p>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || totalPercentage !== 100}
            className="w-full bg-pimento text-white py-3 px-6 rounded-sm font-semibold hover:bg-pimento-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Pool'}
          </button>
        </form>
      </div>
    </main>
  )
}
