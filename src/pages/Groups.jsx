import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export default function Groups() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchGroups()
  }, [])

  async function fetchGroups() {
    const { data } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, description, created_at)')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })

    setGroups(data?.map(d => d.groups).filter(Boolean) || [])
    setLoading(false)
  }

  async function createGroup(e) {
    e.preventDefault()
    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, description, created_by: user.id })
      .select()
      .single()

    if (error) return alert(error.message)

    await supabase
      .from('group_members')
      .insert({ group_id: group.id, user_id: user.id })

    setName('')
    setDescription('')
    setShowCreate(false)
    fetchGroups()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div className="page">
      <div className="page-header">
        <h1>Your Groups</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New Group'}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createGroup} className="card create-form">
          <div className="form-group">
            <label>Group Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Europe Trip 2026"
              required
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this group for?"
            />
          </div>
          <button type="submit" className="btn btn-primary">Create Group</button>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">👋</span>
          <h2>No groups yet</h2>
          <p>Create your first group to start splitting expenses!</p>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map(group => (
            <Link to={`/groups/${group.id}`} key={group.id} className="card group-card">
              <div className="group-card-icon">
                {getGroupEmoji(group.name)}
              </div>
              <h3>{group.name}</h3>
              {group.description && <p className="text-muted">{group.description}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function getGroupEmoji(name) {
  const lower = name.toLowerCase()
  if (lower.includes('trip') || lower.includes('travel')) return '✈️'
  if (lower.includes('house') || lower.includes('home') || lower.includes('rent')) return '🏠'
  if (lower.includes('food') || lower.includes('dinner') || lower.includes('lunch')) return '🍕'
  if (lower.includes('party') || lower.includes('event')) return '🎉'
  if (lower.includes('work') || lower.includes('office')) return '💼'
  const emojis = ['🌈', '⭐', '🎯', '🎪', '🌺', '🦊', '🐙', '🍀']
  let hash = 0
  for (const c of name) hash = ((hash << 5) - hash + c.charCodeAt(0)) | 0
  return emojis[Math.abs(hash) % emojis.length]
}
