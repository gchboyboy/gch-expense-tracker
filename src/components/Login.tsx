import { useState } from 'react'
import type { User } from '../types'

interface Props {
  onLogin: (user: User) => void
}

export default function Login({ onLogin }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { authenticateUser } = await import('../lib/db')
      const user = await authenticateUser(username, password)
      
      if (user) {
        onLogin(user)
      } else {
        setError('Invalid username or password')
      }
    } catch (err) {
      setError('Login failed. Please try again.')
      console.error('Login error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="comic-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl text-white tracking-widest">
            <span className="text-spiderred">GCH</span> <span className="text-spiderblue">EXPENSE</span>
          </h1>
          <p className="text-xs text-gray-400 mt-2">Your friendly neighborhood expense tracker</p>
        </div>

        <div className="bg-navy-light p-6 rounded-lg border-2 border-spiderblue/30">
          <h2 className="font-display text-xl text-spiderblue mb-6 text-center">Login</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-navy-lighter border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-spiderblue"
                placeholder="Enter username"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-navy-lighter border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-spiderblue"
                placeholder="Enter password"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-500 text-red-400 px-3 py-2 rounded text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-blue py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
