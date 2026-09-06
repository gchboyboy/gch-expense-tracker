import { useState, useEffect } from 'react'
import type { SyncStatus } from '../types'
import {
  getWebAppUrl, setWebAppUrl, testConnection, pushUnsyncedEntries, pullEntriesFromSheet, exportCSV, DEFAULT_WEB_APP_URL
} from '../lib/sheetSync'
import { getExpenses, getUnsyncedExpenses, clearAllExpenses, clearAllFiles } from '../lib/db'

export default function Settings() {
  const [url, setUrl] = useState(DEFAULT_WEB_APP_URL)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [unsyncedCount, setUnsyncedCount] = useState(0)
  const [isDefault, setIsDefault] = useState(true)

  useEffect(() => {
    getWebAppUrl().then((v) => {
      setUrl(v)
      setIsDefault(v === DEFAULT_WEB_APP_URL)
    })
    getUnsyncedExpenses().then((rows) => setUnsyncedCount(rows.length))
  }, [])

  async function handleSave() {
    await setWebAppUrl(url.trim())
    setIsDefault(url.trim() === DEFAULT_WEB_APP_URL)
    setStatus({ success: true, message: isDefault ? 'Using the built-in default URL.' : 'Web App URL saved.' })
  }

  async function handleTest() {
    setStatus({ success: false, message: 'Testing connection...' })
    const res = await testConnection(url.trim())
    setStatus(res)
  }

  async function handlePush() {
    if (!url.trim()) {
      setStatus({ success: false, message: 'Save your Web App URL first.' })
      return
    }
    setStatus({ success: false, message: 'Pushing unsynced entries...' })
    const res = await pushUnsyncedEntries(url.trim())
    await getUnsyncedExpenses().then((rows) => setUnsyncedCount(rows.length))
    setStatus(res)
  }

  async function handlePull() {
    if (!url.trim()) {
      setStatus({ success: false, message: 'Save your Web App URL first.' })
      return
    }
    setStatus({ success: false, message: 'Pulling entries from sheet...' })
    const res = await pullEntriesFromSheet()
    await getUnsyncedExpenses().then((rows) => setUnsyncedCount(rows.length))
    setStatus(res)
  }

  async function handleExport(ledger: 'Big Expenses' | 'All Expenses') {
    const expenses = await getExpenses()
    await exportCSV(expenses, ledger)
  }

  async function handleClear() {
    if (window.confirm('Delete ALL local data? This cannot be undone.')) {
      await clearAllExpenses()
      await clearAllFiles()
      setStatus({ success: true, message: 'Local data cleared.' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-navy-light p-4 rounded space-y-3">
        <h3 className="font-display text-xl text-spiderblue">Google Sheet Connection</h3>
        <div>
          <label className="text-xs text-gray-400 block mb-1">Apps Script Web App URL</label>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setIsDefault(false) }}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
          {isDefault ? (
            <p className="text-[10px] text-green-400 mt-1">✓ Using built-in default URL — no setup needed.</p>
          ) : (
            <p className="text-[10px] text-gray-500 mt-1">Custom URL saved in this browser.</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-blue" onClick={handleSave}>Save</button>
          {!isDefault && <button className="btn-gray" onClick={() => { setUrl(DEFAULT_WEB_APP_URL); setIsDefault(true); setWebAppUrl(DEFAULT_WEB_APP_URL) }}>Reset to default</button>}
          <button className="btn-gray" onClick={handleTest}>Test Connection</button>
          <button className="btn-gray" onClick={handlePull}>Pull from Sheet</button>
          <button className="btn-gray" onClick={handlePush}>Push Unsynced ({unsyncedCount})</button>
        </div>
        {status && (
          <p className={`text-xs ${status.success ? 'text-green-400' : 'text-yellow-300'}`}>
            {status.message}
            {status.spreadsheetName ? ` — Spreadsheet: ${status.spreadsheetName}` : ''}
            {status.tabsFound?.length ? ` — Tabs found: ${status.tabsFound.join(', ')}` : ''}
          </p>
        )}
      </div>

      <div className="bg-navy-light p-4 rounded space-y-3">
        <h3 className="font-display text-xl text-spiderblue">Data</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-gray" onClick={() => handleExport('Big Expenses')}>Export Big CSV</button>
          <button className="btn-gray" onClick={() => handleExport('All Expenses')}>Export All CSV</button>
        </div>
        <button className="btn-red" onClick={handleClear}>Clear Local Data</button>
      </div>

      <div className="bg-navy-light p-4 rounded">
        <h3 className="font-display text-xl text-spiderblue">About</h3>
        <p className="text-xs text-gray-400">
          GCH Expense Tracker v1.0 — local-first PWA. Entries save to your device immediately and
          sync to Google Sheets via your Apps Script Web App URL. Receipt photos and PDFs are stored
          locally on this device.
        </p>
      </div>
    </div>
  )
}