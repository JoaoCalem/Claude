import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import AddExpense from '../components/AddExpense'
import SettleUp from '../components/SettleUp'

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [expenses, setExpenses] = useState([])
  const [settlements, setSettlements] = useState([])
  const [balances, setBalances] = useState({})
  const [tab, setTab] = useState('expenses')
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showSettleUp, setShowSettleUp] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [memberEmail, setMemberEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAll()
  }, [id])

  async function fetchAll() {
    const [groupRes, membersRes, expensesRes, splitsRes, settlementsRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', id).single(),
      supabase.from('group_members').select('user_id, profiles(id, display_name)').eq('group_id', id),
      supabase.from('expenses').select('*, profiles(display_name)').eq('group_id', id).order('created_at', { ascending: false }),
      supabase.from('expense_splits').select('*, expenses!inner(group_id)').eq('expenses.group_id', id),
      supabase.from('settlements').select('*').eq('group_id', id),
    ])

    setGroup(groupRes.data)
    const memberList = membersRes.data?.map(m => m.profiles).filter(Boolean) || []
    setMembers(memberList)
    setExpenses(expensesRes.data || [])
    setSettlements(settlementsRes.data || [])

    // Calculate balances
    const bal = {}
    memberList.forEach(m => { bal[m.id] = 0 })

    // For each expense split, the user owes that amount
    // The payer is owed the total minus their own share
    expensesRes.data?.forEach(expense => {
      const splits = (splitsRes.data || []).filter(s => s.expense_id === expense.id)
      splits.forEach(split => {
        if (split.user_id === expense.paid_by) {
          // Payer is owed (expense total - their share)
          bal[split.user_id] = (bal[split.user_id] || 0) + (expense.amount - split.amount)
        } else {
          // Others owe their share
          bal[split.user_id] = (bal[split.user_id] || 0) - split.amount
        }
      })
    })

    // Apply settlements
    settlementsRes.data?.forEach(s => {
      bal[s.paid_by] = (bal[s.paid_by] || 0) + s.amount
      bal[s.paid_to] = (bal[s.paid_to] || 0) - s.amount
    })

    setBalances(bal)
    setLoading(false)
  }

  async function addMember(e) {
    e.preventDefault()
    // Find user by email
    const { data: authUser } = await supabase
      .from('profiles')
      .select('id, display_name')
      .ilike('display_name', memberEmail)
      .limit(1)
      .single()

    if (!authUser) {
      // Try matching by looking at email-like display names
      alert('User not found. They need to sign up first, then share their display name with you.')
      return
    }

    const { error } = await supabase
      .from('group_members')
      .insert({ group_id: id, user_id: authUser.id })

    if (error) {
      if (error.code === '23505') alert('User is already a member!')
      else alert(error.message)
      return
    }

    setMemberEmail('')
    setShowAddMember(false)
    fetchAll()
  }

  async function deleteExpense(expenseId) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', expenseId)
    fetchAll()
  }

  function getSimplifiedDebts() {
    // Simplify debts: who owes whom
    const debts = []
    const positive = [] // people owed money
    const negative = [] // people who owe money

    Object.entries(balances).forEach(([userId, amount]) => {
      const rounded = Math.round(amount * 100) / 100
      if (rounded > 0.01) positive.push({ userId, amount: rounded })
      else if (rounded < -0.01) negative.push({ userId, amount: Math.abs(rounded) })
    })

    positive.sort((a, b) => b.amount - a.amount)
    negative.sort((a, b) => b.amount - a.amount)

    let i = 0, j = 0
    while (i < positive.length && j < negative.length) {
      const payment = Math.min(positive[i].amount, negative[j].amount)
      if (payment > 0.01) {
        debts.push({
          from: negative[j].userId,
          to: positive[i].userId,
          amount: payment
        })
      }
      positive[i].amount -= payment
      negative[j].amount -= payment
      if (positive[i].amount < 0.01) i++
      if (negative[j].amount < 0.01) j++
    }

    return debts
  }

  function getMemberName(userId) {
    return members.find(m => m.id === userId)?.display_name || 'Unknown'
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!group) return <div className="page"><p>Group not found</p></div>

  const simplifiedDebts = getSimplifiedDebts()

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/" className="back-link">← Back to groups</Link>
          <h1>{group.name}</h1>
          {group.description && <p className="text-muted">{group.description}</p>}
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => setShowAddMember(!showAddMember)}>
            + Member
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddExpense(true)}>
            + Expense
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="members-bar">
        {members.map(m => (
          <div key={m.id} className="member-chip">
            <span className="member-avatar">{m.display_name[0].toUpperCase()}</span>
            {m.display_name}
            {m.id === user.id && <span className="badge">you</span>}
          </div>
        ))}
      </div>

      {showAddMember && (
        <form onSubmit={addMember} className="card create-form">
          <div className="form-group">
            <label>Member Display Name</label>
            <input
              value={memberEmail}
              onChange={e => setMemberEmail(e.target.value)}
              placeholder="Enter their display name"
              required
            />
          </div>
          <div className="form-row">
            <button type="submit" className="btn btn-primary">Add</button>
            <button type="button" className="btn btn-ghost" onClick={() => setShowAddMember(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>
          Expenses
        </button>
        <button className={`tab ${tab === 'balances' ? 'active' : ''}`} onClick={() => setTab('balances')}>
          Balances
        </button>
        <button className={`tab ${tab === 'settle' ? 'active' : ''}`} onClick={() => setTab('settle')}>
          Settle Up
        </button>
      </div>

      {/* Expenses Tab */}
      {tab === 'expenses' && (
        <div className="expenses-list">
          {expenses.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📝</span>
              <h3>No expenses yet</h3>
              <p>Add your first expense to get started</p>
            </div>
          ) : (
            expenses.map(expense => (
              <div key={expense.id} className="card expense-card">
                <div className="expense-info">
                  <strong>{expense.description}</strong>
                  <span className="text-muted">
                    Paid by {expense.paid_by === user.id ? 'you' : expense.profiles?.display_name}
                  </span>
                  <span className="expense-meta">
                    {expense.split_type} split · {new Date(expense.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="expense-amount">
                  ${Number(expense.amount).toFixed(2)}
                  {expense.paid_by === user.id && (
                    <button className="btn-icon" onClick={() => deleteExpense(expense.id)} title="Delete">
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Balances Tab */}
      {tab === 'balances' && (
        <div className="balances-list">
          {members.map(member => {
            const bal = Math.round((balances[member.id] || 0) * 100) / 100
            return (
              <div key={member.id} className={`card balance-card ${bal > 0 ? 'positive' : bal < 0 ? 'negative' : ''}`}>
                <div className="balance-name">
                  <span className="member-avatar">{member.display_name[0].toUpperCase()}</span>
                  {member.display_name}
                  {member.id === user.id && <span className="badge">you</span>}
                </div>
                <div className={`balance-amount ${bal > 0 ? 'text-green' : bal < 0 ? 'text-red' : ''}`}>
                  {bal > 0 ? `gets back $${bal.toFixed(2)}` : bal < 0 ? `owes $${Math.abs(bal).toFixed(2)}` : 'settled up'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Settle Up Tab */}
      {tab === 'settle' && (
        <div className="settle-list">
          {simplifiedDebts.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">✅</span>
              <h3>All settled up!</h3>
              <p>No outstanding debts in this group</p>
            </div>
          ) : (
            <>
              <h3 className="section-title">Suggested Payments</h3>
              {simplifiedDebts.map((debt, i) => (
                <div key={i} className="card settle-card">
                  <div className="settle-info">
                    <strong>{getMemberName(debt.from)}</strong>
                    <span className="settle-arrow">→ pays →</span>
                    <strong>{getMemberName(debt.to)}</strong>
                  </div>
                  <div className="settle-amount">${debt.amount.toFixed(2)}</div>
                  {(debt.from === user.id || debt.to === user.id) && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => setShowSettleUp({ from: debt.from, to: debt.to, amount: debt.amount })}
                    >
                      Record Payment
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Settlement history */}
          {settlements.length > 0 && (
            <>
              <h3 className="section-title">Payment History</h3>
              {settlements.map(s => (
                <div key={s.id} className="card settle-card history">
                  <div className="settle-info">
                    <strong>{getMemberName(s.paid_by)}</strong>
                    <span className="settle-arrow">→ paid →</span>
                    <strong>{getMemberName(s.paid_to)}</strong>
                  </div>
                  <div className="settle-amount">${Number(s.amount).toFixed(2)}</div>
                  <span className="text-muted">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddExpense && (
        <AddExpense
          groupId={id}
          members={members}
          currentUser={user}
          onClose={() => setShowAddExpense(false)}
          onSaved={() => { setShowAddExpense(false); fetchAll() }}
        />
      )}

      {showSettleUp && (
        <SettleUp
          groupId={id}
          from={showSettleUp.from}
          to={showSettleUp.to}
          amount={showSettleUp.amount}
          members={members}
          onClose={() => setShowSettleUp(false)}
          onSaved={() => { setShowSettleUp(false); fetchAll() }}
        />
      )}
    </div>
  )
}
