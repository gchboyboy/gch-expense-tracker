import { useState, useEffect } from 'react'
import type { User } from '../types'
import { getUsers, addUser, updateUser, deleteUser } from '../lib/db'

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [formData, setFormData] = useState({ username: '', password: '', isAdmin: false })
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    const list = await getUsers()
    setUsers(list)
  }

  function resetForm() {
    setFormData({ username: '', password: '', isAdmin: false })
    setEditing(null)
    setAdding(false)
  }

  async function handleAdd() {
    if (!formData.username || !formData.password) {
      setMessage('Username and password are required')
      return
    }

    try {
      await addUser({
        username: formData.username,
        password: formData.password,
        isAdmin: formData.isAdmin
      })
      setMessage('✓ User added successfully')
      resetForm()
      await loadUsers()
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage('⚠️ Failed to add user')
      console.error(err)
    }
  }

  async function handleUpdate() {
    if (editing === null) return
    
    const updates: Partial<Omit<User, 'id' | 'createdAt'>> = {
      username: formData.username,
      isAdmin: formData.isAdmin
    }
    
    if (formData.password) {
      updates.password = formData.password
    }

    try {
      await updateUser(editing, updates)
      setMessage('✓ User updated successfully')
      resetForm()
      await loadUsers()
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage('⚠️ Failed to update user')
      console.error(err)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this user?')) return

    try {
      await deleteUser(id)
      setMessage('✓ User deleted successfully')
      await loadUsers()
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage('⚠️ Failed to delete user')
      console.error(err)
    }
  }

  function startEdit(user: User) {
    setEditing(user.id!)
    setFormData({
      username: user.username,
      password: '',
      isAdmin: user.isAdmin
    })
    setAdding(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-navy-light p-4 rounded">
        <h2 className="font-display text-xl text-spiderblue mb-4">User Management</h2>
        
        {message && (
          <div className="bg-navy-lighter border border-spiderblue/50 text-white px-3 py-2 rounded text-sm mb-4">
            {message}
          </div>
        )}

        <div className="space-y-2 mb-4">
          {users.map((user) => (
            <div key={user.id} className="bg-navy-lighter p-3 rounded flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{user.username}</span>
                  {user.isAdmin && (
                    <span className="text-xs bg-spiderred/20 text-spiderred px-2 py-0.5 rounded">Admin</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  Created: {new Date(user.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => startEdit(user)}
                  className="text-spiderblue hover:text-spiderblue/80 text-sm px-3 py-1 bg-navy-light rounded"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(user.id!)}
                  className="text-red-400 hover:text-red-300 text-sm px-3 py-1 bg-navy-light rounded"
                  disabled={user.username === 'gchboyboy'}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        {(adding || editing !== null) && (
          <div className="bg-navy-lighter p-4 rounded border border-spiderblue/30">
            <h3 className="text-white font-semibold mb-3">
              {editing !== null ? 'Edit User' : 'Add New User'}
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full bg-navy-light border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-spiderblue text-sm"
                  placeholder="Enter username"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Password {editing !== null && '(leave empty to keep current)'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full bg-navy-light border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-spiderblue text-sm"
                  placeholder="Enter password"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isAdmin"
                  checked={formData.isAdmin}
                  onChange={(e) => setFormData({ ...formData, isAdmin: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isAdmin" className="text-sm text-gray-400">Admin privileges</label>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={editing !== null ? handleUpdate : handleAdd}
                  className="btn-blue px-4 py-2 text-sm"
                >
                  {editing !== null ? 'Update' : 'Add'} User
                </button>
                <button
                  onClick={resetForm}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {!adding && editing === null && (
          <button
            onClick={() => setAdding(true)}
            className="btn-blue w-full py-2"
          >
            + Add New User
          </button>
        )}
      </div>
    </div>
  )
}
