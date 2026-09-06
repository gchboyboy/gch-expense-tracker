import type { ExpenseRecord, ExpenseType, Ledger, SyncStatus } from '../types'
import { formatDateToSheet, getUnsyncedExpenses, markSynced, db } from './db'

/**
 * Google Apps Script sync wrapper.
 * Uses fetch() with Content-Type: text/plain to avoid CORS preflight
 * issues with Apps Script web apps.
 */
const APPS_SCRIPT_CONTENT_TYPE = 'text/plain;charset=utf-8'
const FETCH_TIMEOUT_MS = 10_000

/**
 * Default Apps Script Web App URL for this deployment.
 * Used automatically when the user hasn't saved a custom URL in Settings,
 * so no copy-paste is required for the standard setup.
 */
export const DEFAULT_WEB_APP_URL =
  'https://script.google.com/macros/s/AKfycbzCKwLUbn4R2ov-yxGcpXdWPI5-_Hif6OP2fLhM6DlP7DZYg-YZgN9PMxPXuCMnRbOr/exec'

/** fetch() wrapper that aborts after FETCH_TIMEOUT_MS so the UI never freezes. */
async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timer)
  }
}

export async function getWebAppUrl(): Promise<string> {
  // Fall back to the built-in default URL so nothing needs to be pasted.
  return (await db.settings.get('webAppUrl'))?.value || DEFAULT_WEB_APP_URL
}

export async function setWebAppUrl(url: string) {
  await db.settings.put({ key: 'webAppUrl', value: url })
}

/**
 * Test connection: GET the web app URL and report back spreadsheet name
 * and whether both tabs are found.
 */
export async function testConnection(url: string): Promise<SyncStatus> {
  try {
    const res = await fetchWithTimeout(url, { method: 'GET', headers: { 'Content-Type': APPS_SCRIPT_CONTENT_TYPE } })
    const data = await res.json()
    return {
      success: true,
      spreadsheetName: data.spreadsheetName,
      tabsFound: data.tabsFound,
      message: `Connected to "${data.spreadsheetName}"`
    }
  } catch (err) {
    return {
      success: false,
      message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

/**
 * Pull every entry from both tabs of the Google Sheet and merge them into
 * local IndexedDB. Entries are matched by `uniqueId` so duplicates are skipped.
 * Returns the number of new entries pulled.
 */
export async function pullEntriesFromSheet(): Promise<SyncStatus> {
  const url = await getWebAppUrl()
  if (!url) {
    return { success: false, message: 'No Web App URL configured.' }
  }

  try {
    const res = await fetchWithTimeout(`${url}?pull=1`, {
      method: 'GET',
      headers: { 'Content-Type': APPS_SCRIPT_CONTENT_TYPE }
    })

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const data = await res.json()
    if (data.error) {
      throw new Error(data.error)
    }
    if (data.success === false) {
      throw new Error(data.error || 'Pull failed')
    }

    const { added, updated, removed } = await mergePulledEntries(data.bigExpenses || [], data.allExpenses || [])

    const bits: string[] = []
    if (added > 0) bits.push(`${added} new entr${added === 1 ? 'y' : 'ies'}`)
    if (updated > 0) bits.push(`${updated} updated`)
    if (removed > 0) bits.push(`${removed} removed`)
    if (bits.length === 0) bits.push('Sheet is up to date')

    return {
      success: true,
      message: `Pulled ${bits.join(', ')}${bits[0] !== 'Sheet is up to date' ? '.' : ''}`
    }
  } catch (err) {
    return {
      success: false,
      message: `Pull failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

type SheetRow = Record<string, unknown>

/**
 * Merge rows pulled from the sheet into local DB, keyed by uniqueId.
 * - brand-new uniqueIds are added (counted as added)
 * - existing uniqueIds are updated from the sheet (counted as updated),
 *   which repairs entries from earlier pulls that had broken date parsing.
 * - synced local records whose uniqueId no longer exists in the sheet are
 *   deleted from local DB too (counted as removed). Records that were
 *   created locally and not yet pushed (synced = 0) are never deleted.
 * Returns { added, updated, removed }.
 */
async function mergePulledEntries(
  bigExpenses: SheetRow[],
  allExpenses: SheetRow[]
): Promise<{ added: number; updated: number; removed: number }> {
  const existing = await db.expenses.toArray()
  const existingByUniqueId = new Map<string, ExpenseRecord>()
  for (const e of existing) {
    existingByUniqueId.set(e.uniqueId, e)
  }
  const seenThisPull = new Set<string>()

  let added = 0
  let updated = 0
  let removed = 0
  const writes: Promise<unknown>[] = []

  const collect = (row: SheetRow, ledger: Ledger) => {
    const entry = mapRowToExpense(row, ledger)
    if (!entry) return
    if (seenThisPull.has(entry.uniqueId)) return // duplicate row inside the sheet
    seenThisPull.add(entry.uniqueId)

    const existingRecord = existingByUniqueId.get(entry.uniqueId)
    if (existingRecord && existingRecord.id !== undefined) {
      const patch = toUpdateFields(existingRecord, entry as ExpenseRecord)
      // Even if nothing else changed, fix an empty stored date (self-heal old pulls)
      if (!existingRecord.date && entry.date) patch.date = entry.date
      if (Object.keys(patch).length > 0) {
        writes.push(db.expenses.update(existingRecord.id, patch))
        updated++
      }
    } else {
      writes.push(db.expenses.add(entry as ExpenseRecord))
      added++
    }
  }

  for (const row of bigExpenses) collect(row, 'Big Expenses')
  for (const row of allExpenses) collect(row, 'All Expenses')

  // Reconciliation: remove synced records that no longer exist in the sheet.
  // (Avoid deleting locally-created unsynced rows that haven't been pushed yet.)
  for (const e of existing) {
    const isSynced = e.synced === 1
    if (!isSynced || e.uniqueId === '' || e.id === undefined) continue
    if (!seenThisPull.has(e.uniqueId)) {
      writes.push(db.expenses.delete(e.id))
      removed++
    }
  }

  // Wait until every add/update/delete has actually committed to disk.
  await Promise.all(writes)

  return { added, updated, removed }
}

/** Return the changed fields for an existing record (preserves id & synced). */
function toUpdateFields(existing: ExpenseRecord, incoming: ExpenseRecord): Partial<ExpenseRecord> {
  const patch: Partial<ExpenseRecord> = {}
  if (incoming.date && existing.date !== incoming.date) patch.date = incoming.date
  if (existing.expense !== incoming.expense) patch.expense = incoming.expense
  if (existing.amount !== incoming.amount) patch.amount = incoming.amount
  if (incoming.ledger !== existing.ledger) patch.ledger = incoming.ledger
  if (incoming.type !== existing.type) patch.type = incoming.type
  if ((incoming.imageAttachment || '') !== (existing.imageAttachment || '')) patch.imageAttachment = incoming.imageAttachment
  if ((incoming.pdfAttachment || '') !== (existing.pdfAttachment || '')) patch.pdfAttachment = incoming.pdfAttachment
  if ((incoming.remark || '') !== (existing.remark || '')) patch.remark = incoming.remark
  return patch
}

/** Case-insensitive lookup of a field by its (possible) header names. */
function findField(row: SheetRow, keys: string[]): unknown {
  const lower = keys.map((k) => k.toLowerCase())
  for (const rowKey of Object.keys(row)) {
    if (lower.includes(rowKey.toLowerCase())) {
      return row[rowKey]
    }
  }
  return null
}

/** Convert a pulled row object into an ExpenseRecord (or null if it should be skipped). */
function mapRowToExpense(
  row: SheetRow,
  ledger: Ledger
): Omit<ExpenseRecord, 'id'> | null {
  const uniqueId = String(findField(row, ['Unique ID', 'UniqueID', 'Id']) || '').trim()
  if (!uniqueId) {
    console.warn('[gch-sync] skipped sheet row missing Unique ID:', JSON.stringify(row).slice(0, 140))
    return null
  }

  const expense = String(findField(row, ['Expense', 'Expense Name', 'Name']) || '').trim()
  const amount = parseSheetAmount(findField(row, ['Amount', 'Price', 'Total']))
  const date = parseSheetDate(findField(row, ['Date']))

  // Skip rows that are effectively empty (no name, no amount, no date)
  if (!expense && amount === 0 && !date) return null

  const entry: Omit<ExpenseRecord, 'id'> & { synced: number } = {
    uniqueId,
    date,
    expense,
    amount,
    ledger,
    synced: 1 // already present in the sheet
  }

  if (ledger === 'All Expenses') {
    const typeRaw = String(findField(row, ['Type', 'Category']) || '').trim()
    entry.type = (typeRaw || 'Others') as ExpenseType
  }

  const image = String(findField(row, ['Image Attachment', 'Image', 'Img']) || '').trim()
  if (image) entry.imageAttachment = image

  const pdf = String(findField(row, ['PDF Attachment', 'PDF', 'Pdf']) || '').trim()
  if (pdf) entry.pdfAttachment = pdf

  const remark = String(findField(row, ['Remark', 'Remarks', 'Note', 'Notes']) || '').trim()
  if (remark) entry.remark = remark

  return entry
}

/** Parse a value that could be a Date object or a date string into ISO YYYY-MM-DD. */
function parseSheetDate(value: unknown): string {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  }
  if (!value) return ''

  const s = String(value).trim()

  // ISO datetime string from Apps Script JSON, e.g. "2023-03-04T08:00:00.000Z".
  // The 8:00Z timestamp is 16:00 local (UTC+8) on the SAME calendar date,
  // so taking the date portion is correct for this timezone.
  const isoDateTime = s.match(/^(\d{4})-(\d{2})-(\d{2})T/)
  if (isoDateTime) {
    return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}`
  }

  // DD-Mon-YYYY (e.g. "9-Aug-2026")
  const mdy = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (mdy) {
    const months: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    }
    return `${mdy[3]}-${months[mdy[2]] || '01'}-${mdy[1].padStart(2, '0')}`
  }

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  return ''
}

/** Parse an amount cell into a number (handles numbers, currency symbols, commas). */
function parseSheetAmount(value: unknown): number {
  if (typeof value === 'number') return value
  if (!value) return 0
  const cleaned = String(value).replace(/[^0-9.\-]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}


export async function pushUnsyncedEntries(url: string): Promise<SyncStatus> {
  const unsynced = await getUnsyncedExpenses()
  if (unsynced.length === 0) {
    return { success: true, message: 'No unsynced entries.', pushedCount: 0 }
  }

  try {
    let pushed = 0
    for (const expense of unsynced) {
      const ok = await pushSingle(url, expense)
      if (ok) {
        await markSynced([expense.id!])
        pushed++
      }
    }
    return {
      success: true,
      message: `Pushed ${pushed} of ${unsynced.length} entries.`,
      pushedCount: pushed
    }
  } catch (err) {
    return {
      success: false,
      message: `Sync failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

async function pushSingle(url: string, expense: ExpenseRecord): Promise<boolean> {
  const row =
    expense.ledger === 'Big Expenses'
      ? [
          expense.uniqueId,
          formatDateToSheet(expense.date),
          expense.expense,
          expense.amount,
          expense.imageAttachment || '',
          expense.pdfAttachment || '',
          expense.remark || ''
        ]
      : [
          expense.uniqueId,
          formatDateToSheet(expense.date),
          expense.expense,
          expense.type || 'Others',
          expense.amount,
          expense.imageAttachment || '',
          expense.pdfAttachment || '',
          expense.remark || ''
        ]

  const payload = {
    sheet: expense.ledger,
    values: row
  }

  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': APPS_SCRIPT_CONTENT_TYPE },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      console.error('[gch-sync] HTTP error', res.status, await res.text().catch(() => ''))
      return false
    }
    const data = await res.json()
    console.log('[gch-sync] pushSingle result for', expense.uniqueId, '→', data)
    return data.success === true
  } catch (err) {
    console.error('[gch-sync] pushSingle failed for', expense.uniqueId, err)
    return false
  }
}

export async function exportCSV(expenses: ExpenseRecord[], ledger: 'Big Expenses' | 'All Expenses'): Promise<void> {
  const header =
    ledger === 'Big Expenses'
      ? 'Unique ID,Date,Expense,Amount,Image Attachment,PDF Attachment,Remark'
      : 'Unique ID,Date,Expense,Type,Amount,Image Attachment,PDF Attachment,Remark'

  const rows = expenses
    .filter((e) => e.ledger === ledger)
    .map((e) => {
      const base = [
        csvEscape(e.uniqueId),
        csvEscape(formatDateToSheet(e.date)),
        csvEscape(e.expense),
        e.amount
      ]
      const tail = [
        csvEscape(e.imageAttachment || ''),
        csvEscape(e.pdfAttachment || ''),
        csvEscape(e.remark || '')
      ]
      const all =
        ledger === 'Big Expenses'
          ? [...base, ...tail]
          : [...base, csvEscape(e.type || 'Others'), ...tail]
      return all.join(',')
    })

  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `gch-${ledger.toLowerCase().replace(/\s+/g, '-')}-export.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}