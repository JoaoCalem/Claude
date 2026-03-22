import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AddExpense({ groupId, members, currentUser, onClose, onSaved }) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(currentUser.id)
  const [splitType, setSplitType] = useState('equal')
  const [customSplits, setCustomSplits] = useState(
    members.reduce((acc, m) => ({ ...acc, [m.id]: '' }), {})
  )
  const [selectedMembers, setSelectedMembers] = useState(
    members.reduce((acc, m) => ({ ...acc, [m.id]: true }), {})
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function toggleMember(id) {
    setSelectedMembers(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function calculateSplits() {
    const total = parseFloat(amount)
    if (!total || total <= 0) return null

    const activeMembers = members.filter(m => selectedMembers[m.id])
    if (activeMembers.length === 0) return null

    const splits = {}

    switch (splitType) {
      case 'equal': {
        const share = Math.round((total / activeMembers.length) * 100) / 100
        // Handle rounding: give the remainder to the first person
        let remaining = total
        activeMembers.forEach((m, i) => {
          if (i === activeMembers.length - 1) {
            splits[m.id] = Math.round(remaining * 100) / 100
          } else {
            splits[m.id] = share
            remaining -= share
          }
        })
        break
      }
      case 'percentage': {
        let totalPct = 0
        activeMembers.forEach(m => {
          const pct = parseFloat(customSplits[m.id]) || 0
          totalPct += pct
          splits[m.id] = Math.round((total * pct / 100) * 100) / 100
        })
        if (Math.abs(totalPct - 100) > 0.01) return { error: 'Percentages must add up to 100%' }
        break
      }
      case 'exact': {
        let totalExact = 0
        activeMembers.forEach(m => {
          const val = parseFloat(customSplits[m.id]) || 0
          splits[m.id] = val
          totalExact += val
        })
        if (Math.abs(totalExact - total) > 0.01) return { error: `Amounts must add up to $${total.toFixed(2)} (currently $${totalExact.toFixed(2)})` }
        break
      }
      case 'shares': {
        let totalShares = 0
        activeMembers.forEach(m => {
          totalShares += parseFloat(customSplits[m.id]) || 0
        })
        if (totalShares === 0) return { error: 'Enter at least one share' }
        let remaining2 = total
        const memberShares = activeMembers.map(m => ({
          id: m.id,
          shares: parseFloat(customSplits[m.id]) || 0
        }))
        memberShares.forEach((ms, i) => {
          if (i === memberShares.length - 1) {
            splits[ms.id] = Math.round(remaining2 * 100) / 100
          } else {
            const val = Math.round((total * ms.shares / totalShares) * 100) / 100
            splits[ms.id] = val
            remaining2 -= val
          }
        })
        break
      }
    }

    return splits
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const splits = calculateSplits()
    if (!splits) {
      setError('Invalid split configuration')
      return
    }
    if (splits.error) {
      setError(splits.error)
      return
    }

    setSaving(true)

    const { data: expense, error: expError } = await supabase
      .from('expenses')
      .insert({
        group_id: groupId,
        paid_by: paidBy,
        description,
        amount: parseFloat(amount),
        split_type: splitType,
      })
      .select()
      .single()

    if (expError) {
      setError(expError.message)
      setSaving(false)
      return
    }

    const splitRows = Object.entries(splits).map(([userId, amt]) => ({
      expense_id: expense.id,
      user_id: userId,
      amount: amt,
    }))

    const { error: splitError } = await supabase
      .from('expense_splits')
      .insert(splitRows)

    if (splitError) {
      setError(splitError.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  const splitResult = calculateSplits()
  const splitPreview = splitResult && !splitResult.error ? splitResult : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Expense</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Description</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What was it for?"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Paid by</label>
              <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
                {members.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.id === currentUser.id ? 'You' : m.display_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Split type</label>
            <div className="split-type-buttons">
              {['equal', 'percentage', 'exact', 'shares'].map(type => (
                <button
                  key={type}
                  type="button"
                  className={`btn btn-sm ${splitType === type ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSplitType(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Split between</label>
            <div className="split-members">
              {members.map(m => (
                <div key={m.id} className="split-member-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedMembers[m.id]}
                      onChange={() => toggleMember(m.id)}
                    />
                    <span className="member-avatar sm">{m.display_name[0].toUpperCase()}</span>
                    {m.display_name}
                    {m.id === currentUser.id && <span className="badge">you</span>}
                  </label>

                  {splitType !== 'equal' && selectedMembers[m.id] && (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="split-input"
                      value={customSplits[m.id]}
                      onChange={e => setCustomSplits(prev => ({ ...prev, [m.id]: e.target.value }))}
                      placeholder={splitType === 'percentage' ? '%' : splitType === 'shares' ? 'shares' : '$'}
                    />
                  )}

                  {splitPreview && selectedMembers[m.id] && (
                    <span className="split-preview">${(splitPreview[m.id] || 0).toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="form-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Add Expense'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
