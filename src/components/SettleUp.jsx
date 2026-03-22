import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function SettleUp({ groupId, from, to, amount, members, onClose, onSaved }) {
  const [payAmount, setPayAmount] = useState(amount.toFixed(2))
  const [saving, setSaving] = useState(false)

  const fromName = members.find(m => m.id === from)?.display_name || 'Unknown'
  const toName = members.find(m => m.id === to)?.display_name || 'Unknown'

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)

    const { error } = await supabase
      .from('settlements')
      .insert({
        group_id: groupId,
        paid_by: from,
        paid_to: to,
        amount: parseFloat(payAmount),
      })

    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Record Payment</h2>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        <div className="settle-preview">
          <span className="settle-from">{fromName}</span>
          <span className="settle-arrow-big">💸</span>
          <span className="settle-to">{toName}</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              required
            />
          </div>
          <div className="form-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Recording...' : 'Record Payment'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
