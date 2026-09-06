import { useState, useMemo, useEffect } from 'react'
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { ExpenseRecord } from '../types'
import { EXPENSE_TYPES } from '../types'
import { getExpenses } from '../lib/db'
import { pullEntriesFromSheet } from '../lib/sheetSync'

const COLORS = ['#e53935', '#2196f3', '#fbc02d', '#4caf50', '#9c27b0', '#ff9800', '#00bcd4', '#795548', '#e91e63', '#8bc34a', '#607d8b']

type RangePreset = 'this-month' | 'last-3' | 'this-year' | 'all'

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Dashboard() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [preset, setPreset] = useState<RangePreset>('this-month')
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(EXPENSE_TYPES))
  const [grouping, setGrouping] = useState<'day' | 'week' | 'month' | 'year'>('day')
  const [pulling, setPulling] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [lastSynced, setLastSynced] = useState('')

  async function loadExpenses() {
    const all = await getExpenses()
    setExpenses(all)
  }

  async function syncFromSheet(silent = false) {
    setPulling(true)
    if (!silent) setSyncMsg('Syncing from Google Sheet…')
    try {
      const res = await pullEntriesFromSheet()
      setSyncMsg(res.success ? `✓ ${res.message}` : `⚠️ ${res.message}`)
      if (res.success) {
        setLastSynced(new Date().toLocaleTimeString())
        await loadExpenses()
      }
    } finally {
      setPulling(false)
    }
  }

  useEffect(() => {
    applyPreset('this-month') // default to this month
    loadExpenses()
    syncFromSheet(true) // auto-pull all sheet entries when the dashboard opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyPreset(p: RangePreset) {
    setPreset(p)
    const now = new Date()
    if (p === 'this-month') {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)))
      setTo(iso(now))
    } else if (p === 'last-3') {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)))
      setTo(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)))
    } else if (p === 'this-year') {
      setFrom(iso(new Date(now.getFullYear(), 0, 1)))
      setTo(iso(now))
    } else {
      setFrom('')
      setTo('')
    }
  }

  function toggleType(t: string) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (from && e.date < from) return false
      if (to && e.date > to) return false
      const key = e.ledger === 'Big Expenses' ? 'Big Expense' : (e.type || 'Others')
      return selectedTypes.has(key)
    })
  }, [expenses, from, to, selectedTypes])

  const stats = useMemo(() => {
    const total = filtered.reduce((s, e) => s + e.amount, 0)
    const bigOnly = filtered.filter((e) => e.ledger === 'Big Expenses').reduce((s, e) => s + e.amount, 0)
    const days = from && to ? Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1) : 1
    return {
      total,
      bigOnly,
      otherTotal: total - bigOnly,
      avgPerDay: total / days,
      avgPerMonth: total / Math.max(1, Math.ceil(days / 30)),
      count: filtered.length
    }
  }, [filtered, from, to])

  const byType = useMemo(() => {
    const map: Record<string, number> = {}
    filtered.forEach((e) => {
      const key = e.ledger === 'Big Expenses' ? 'Big Expense' : (e.type || 'Others')
      map[key] = (map[key] || 0) + e.amount
    })
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [filtered])

  const trend = useMemo(() => {
    // Build a map of time periods to expense type breakdowns
    const map: Record<string, Record<string, number>> = {}
    filtered.forEach((e) => {
      const d = new Date(e.date + 'T00:00:00')
      let key: string
      if (grouping === 'day') key = e.date
      else if (grouping === 'week') {
        const start = new Date(d)
        start.setDate(d.getDate() - d.getDay())
        key = iso(start)
      } else if (grouping === 'month') {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      } else {
        // year
        key = `${d.getFullYear()}`
      }
      
      // Get the expense type
      const expenseType = e.ledger === 'Big Expenses' ? 'Big Expense' : (e.type || 'Others')
      
      if (!map[key]) map[key] = {}
      map[key][expenseType] = (map[key][expenseType] || 0) + e.amount
    })
    
    // Convert to array format with all expense types as separate keys
    return Object.entries(map).map(([name, types]) => ({
      name,
      ...types
    })).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered, grouping])

  // Get all unique expense types for the stacked bar chart
  const allTypes = useMemo(() => {
    const types = new Set<string>()
    filtered.forEach((e) => {
      const type = e.ledger === 'Big Expenses' ? 'Big Expense' : (e.type || 'Others')
      types.add(type)
    })
    return Array.from(types).sort()
  }, [filtered])

const topExpenses = [...filtered].sort((a, b) => b.amount - a.amount).slice(0, 10)
const byTypeTotal = byType.reduce((s, t) => s + t.value, 0)

  return (
    <div className="space-y-6">
      {/* Sheet sync bar */}
      <div className="bg-navy-light p-4 rounded flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-white font-semibold">Google Sheet sync</div>
          <div className="text-xs text-gray-400 truncate">
            {syncMsg || (lastSynced ? `Last synced ${lastSynced}` : 'Auto-loads all entries from your sheet')}
          </div>
        </div>
        <button
          className="btn-blue whitespace-nowrap shrink-0 disabled:opacity-50"
          onClick={() => syncFromSheet(false)}
          disabled={pulling}
        >
          {pulling ? 'Syncing…' : '⟳ Sync Sheet'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-navy-light p-4 rounded space-y-3">
        <h3 className="font-display text-xl text-spiderblue">Filters</h3>
        <div className="flex flex-wrap gap-2">
          {(['this-month', 'last-3', 'this-year', 'all'] as RangePreset[]).map((p) => (
            <button key={p} onClick={() => applyPreset(p)} className={`px-3 py-1 text-sm ${preset === p ? 'btn-blue' : 'btn-gray'}`}>
              {p === 'this-month' ? 'This Month' : p === 'last-3' ? 'Last 3 Months' : p === 'this-year' ? 'This Year' : 'All Time'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-400 block mb-1">From</label>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('all') }} />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">To</label>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('all') }} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Types (click to toggle)</label>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => toggleType('Big Expense')} className={`px-2 py-1 text-xs ${selectedTypes.has('Big Expense') ? 'btn-red' : 'btn-gray'}`}>Big Expense</button>
            {EXPENSE_TYPES.map((t) => (
              <button key={t} onClick={() => toggleType(t)} className={`px-2 py-1 text-xs ${selectedTypes.has(t) ? 'btn-blue' : 'btn-gray'}`}>{t}</button>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button className="px-3 py-1 text-xs btn-gray" onClick={() => setSelectedTypes(new Set(['Big Expense', ...EXPENSE_TYPES]))}>Select All</button>
            <button className="px-3 py-1 text-xs btn-gray" onClick={() => setSelectedTypes(new Set())}>Clear All</button>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Trend grouping</label>
          <select value={grouping} onChange={(e) => setGrouping(e.target.value as 'day' | 'week' | 'month' | 'year')}>
            <option value="day">By Day</option>
            <option value="week">By Week</option>
            <option value="month">By Month</option>
            <option value="year">By Year</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-navy-light p-4 rounded">
          <div className="text-xs text-gray-400">Total Spend</div>
          <div className="currency text-2xl text-white">RM {stats.total.toFixed(2)}</div>
        </div>
        <div className="bg-navy-light p-4 rounded">
          <div className="text-xs text-gray-400">Entries</div>
          <div className="text-2xl text-white">{stats.count}</div>
        </div>
        <div className="bg-navy-light p-4 rounded border border-spiderred/30">
          <div className="text-xs text-gray-400">Big (w/)</div>
          <div className="currency text-xl text-spiderred">RM {stats.bigOnly.toFixed(2)}</div>
        </div>
        <div className="bg-navy-light p-4 rounded border border-spiderblue/30">
          <div className="text-xs text-gray-400">All (w/o Big)</div>
          <div className="currency text-xl text-spiderblue">RM {stats.otherTotal.toFixed(2)}</div>
        </div>
        <div className="col-span-2 bg-navy-light p-4 rounded">
          <div className="text-xs text-gray-400">Average per day / per month</div>
          <div className="currency text-lg">RM {stats.avgPerDay.toFixed(2)} <span className="text-gray-500">/ day</span> · RM {stats.avgPerMonth.toFixed(2)} <span className="text-gray-500">/ month</span></div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-navy-light p-4 rounded">
          <h3 className="font-display text-lg text-spiderblue mb-2">Spend over time</h3>
          {trend.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" fontSize={10} />
                  <YAxis stroke="#888" fontSize={10} tickFormatter={(v) => Number(v).toFixed(2)} />
                  <Tooltip
                    formatter={(value) => `RM ${Number(value).toFixed(2)}`}
                    contentStyle={{ background: '#0a1128', border: '1px solid #333', color: '#ffffff' }}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                  {allTypes.map((type, idx) => (
                    <Bar 
                      key={type} 
                      dataKey={type} 
                      stackId="a" 
                      fill={COLORS[idx % COLORS.length]} 
                      radius={idx === allTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
              {/* Legend for stacked bars */}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {allTypes.map((type, idx) => (
                  <div key={type} className="flex items-center gap-1.5 text-xs">
                    <span 
                      className="w-3 h-3 rounded-sm" 
                      style={{ background: COLORS[idx % COLORS.length] }}
                    />
                    <span>{type}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No data in range.</p>
          )}
        </div>

        <div className="bg-navy-light p-4 rounded">
          <h3 className="font-display text-lg text-spiderblue mb-2">Breakdown by Type</h3>
          {byType.length > 0 ? (
            <>
              <div className="relative">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={byType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={92}
                    innerRadius={48}
                    paddingAngle={2}
                  >
                    {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `RM ${Number(value).toFixed(2)}`}
                    contentStyle={{ background: '#0a1128', border: '1px solid #333', color: '#ffffff' }}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs text-gray-500">Total</div>
                <div className="currency text-lg text-white">RM {byTypeTotal.toFixed(2)}</div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {byType.map((t, i) => {
                  const pct = byTypeTotal > 0 ? (t.value / byTypeTotal) * 100 : 0
                  return (
                    <div key={t.name} className="flex items-center justify-between text-xs gap-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="truncate">{t.name}</span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums">
                        RM {t.value.toFixed(2)}
                        <span className="text-gray-500 ml-1">({pct.toFixed(1)}%)</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No data in range.</p>
          )}
        </div>
      </div>

      {/* Top 10 expenses callout */}
      <div className="bg-navy-light p-4 rounded">
        <h3 className="font-display text-lg text-spiderred mb-2">Top 10 Expenses</h3>
        {topExpenses.length > 0 ? (
          <ul className="space-y-2">
            {topExpenses.map((e, i) => (
              <li key={e.id} className="flex justify-between items-start gap-3 border-b border-gray-800 pb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-spiderred/20 text-spiderred text-xs flex items-center justify-center shrink-0 font-semibold">{i + 1}</span>
                    <span className="text-sm font-medium truncate">{e.expense || '(untitled)'}</span>
                  </div>
                  <div className="text-xs text-gray-500 pl-8 flex flex-wrap gap-x-3">
                    <span>{e.date || '—'}</span>
                    <span className="text-spiderblue">{e.ledger === 'Big Expenses' ? 'Big Expense' : (e.type || 'Others')}</span>
                    {e.remark ? <span className="truncate">· {e.remark}</span> : null}
                  </div>
                </div>
                <div className="currency text-spiderred whitespace-nowrap shrink-0">RM {e.amount.toFixed(2)}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">No data in range.</p>
        )}
      </div>
    </div>
  )
}