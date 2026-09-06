import { useState, useEffect } from 'react'
import type { Ledger, User } from './types'
import EntryForm from './components/EntryForm'
import Dashboard from './components/Dashboard'
import Settings from './components/Settings'
import Login from './components/Login'
import UserManagement from './components/UserManagement'
import { initializeAdminUser } from './lib/db'

type Tab = 'add' | 'dash' | 'settings' | 'users'

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>('add')
  const [ledger, setLedger] = useState<Ledger>('All Expenses')
  const [scanFile, setScanFile] = useState<File | null>(null)

  useEffect(() => {
    initializeAdminUser()
  }, [])

  function handleLogin(user: User) {
    setCurrentUser(user)
  }

  function handleLogout() {
    setCurrentUser(null)
    setTab('add')
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="comic-bg">
      <header className="max-w-lg mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl text-white tracking-widest">
              <span className="text-spiderred">GCH</span> <span className="text-spiderblue">EXPENSE</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1">Your friendly neighborhood expense tracker</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-white">{currentUser.username}</div>
            {currentUser.isAdmin && (
              <div className="text-xs text-spiderred">Admin</div>
            )}
            <button
              onClick={handleLogout}
              className="text-xs text-gray-400 hover:text-white mt-1"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="max-w-lg mx-auto px-4 mb-4">
        <div className="flex bg-navy-light rounded-lg p-1">
          <button
            className={`flex-1 py-2 text-center text-sm rounded ${tab === 'add' ? 'bg-navy-lighter text-white' : 'text-gray-400'}`}
            onClick={() => setTab('add')}
          >
            Add
          </button>
          <button
            className={`flex-1 py-2 text-center text-sm rounded ${tab === 'dash' ? 'bg-navy-lighter text-white' : 'text-gray-400'}`}
            onClick={() => setTab('dash')}
          >
            Dashboard
          </button>
          <button
            className={`flex-1 py-2 text-center text-sm rounded ${tab === 'settings' ? 'bg-navy-lighter text-white' : 'text-gray-400'}`}
            onClick={() => setTab('settings')}
          >
            Settings
          </button>
          {currentUser.isAdmin && (
            <button
              className={`flex-1 py-2 text-center text-sm rounded ${tab === 'users' ? 'bg-navy-lighter text-white' : 'text-gray-400'}`}
              onClick={() => setTab('users')}
            >
              Users
            </button>
          )}
        </div>
      </nav>

      <main className="max-w-lg mx-auto px-4 pb-10">
        {tab === 'add' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                className={`py-3 rounded font-display text-lg ${ledger === 'All Expenses' ? 'btn-blue' : 'bg-navy-light text-gray-500'}`}
                onClick={() => setLedger('All Expenses')}
              >
                All Expenses
              </button>
              <button
                className={`py-3 rounded font-display text-lg ${ledger === 'Big Expenses' ? 'btn-red' : 'bg-navy-light text-gray-500'}`}
                onClick={() => setLedger('Big Expenses')}
              >
                Big Expenses
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="bg-navy-light border-2 border-dashed border-spiderblue rounded p-3 text-center cursor-pointer">
                <input type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) setScanFile(f)
                }} />
                <div className="text-spiderblue font-semibold text-sm">📷 Scan Receipt</div>
                <div className="text-xs text-gray-500 mt-1">Camera or file</div>
              </label>
              <div className="bg-navy-light border-2 border-dashed border-gray-600 rounded p-3 text-center">
                <div className="text-gray-400 font-semibold text-sm">✍️ Enter Manually</div>
                <div className="text-xs text-gray-500 mt-1">Use the form below</div>
              </div>
            </div>

            <div className="bg-navy-light p-4 rounded">
              <h3 className="font-display text-lg mb-3 text-white">
                {ledger === 'Big Expenses' ? 'Big Expense Entry' : 'All Expense Entry'}
              </h3>
              <EntryForm
                key={ledger}
                ledger={ledger}
                initialType="Others"
                initialScanFile={scanFile}
                onScanHandled={() => setScanFile(null)}
              />
            </div>
          </div>
        )}

        {tab === 'dash' && <Dashboard />}
        {tab === 'settings' && <Settings />}
        {tab === 'users' && currentUser.isAdmin && <UserManagement />}
      </main>
    </div>
  )
}
