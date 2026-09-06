import Dexie, { type Table } from 'dexie'
import type { ExpenseRecord, FileAttachment, User } from '../types'

class ExpenseDB extends Dexie {
  expenses!: Table<ExpenseRecord, number>
  files!: Table<FileAttachment, string>
  settings!: Table<{ key: string; value: string }, string>
  users!: Table<User, number>

  constructor() {
    super('gch-expense-tracker')
    this.version(1).stores({
      expenses: '++id, date, ledger, type, synced, uniqueId',
      files: 'id',
      settings: 'key'
    })
    this.version(2).stores({
      expenses: '++id, date, ledger, type, synced, uniqueId',
      files: 'id',
      settings: 'key',
      users: '++id, username'
    })
  }
}

export const db = new ExpenseDB()

// ---- Expenses CRUD ----

export async function addExpense(record: Omit<ExpenseRecord, 'id' | 'uniqueId' | 'synced'> & {
  uniqueId?: string
  synced?: number
}): Promise<number> {
  const full: ExpenseRecord = {
    ...record,
    uniqueId: record.uniqueId || generateUniqueId(),
    synced: record.synced ?? 0
  }
  const id = await db.expenses.add(full)
  return id
}

export async function getExpenses(): Promise<ExpenseRecord[]> {
  return db.expenses.toArray()
}

export async function getUnsyncedExpenses(): Promise<ExpenseRecord[]> {
  // Use .filter() (not the indexed query) so we catch every falsy value:
  // legacy records may have stored `synced: false` (boolean) while new ones
  // use `0` (number). IndexedDB treats these as different values, so a
  // strict `.equals(0)` would silently skip the boolean ones.
  const all = await db.expenses.toArray()
  return all.filter((e) => !e.synced)
}

export async function markSynced(ids: number[]) {
  await db.transaction('rw', db.expenses, async () => {
    for (const id of ids) {
      await db.expenses.update(id, { synced: 1 })
    }
  })
}

export async function deleteExpense(id: number) {
  await db.expenses.delete(id)
}

export async function clearAllExpenses() {
  await db.expenses.clear()
}

// ---- Files (blobs) ----

export async function saveFile(file: File): Promise<FileAttachment> {
  const id = generateUniqueId()
  const record: FileAttachment = {
    id,
    name: file.name,
    type: file.type,
    size: file.size,
    blob: file
  }
  await db.files.put(record)
  return record
}

export async function getFile(id: string): Promise<FileAttachment | undefined> {
  return db.files.get(id)
}

export async function clearAllFiles() {
  await db.files.clear()
}

// ---- Settings ----

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await db.settings.get(key)
  return row?.value
}

export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value })
}

// ---- Helpers ----

export function generateUniqueId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let result = 'K-'
  for (let i = 0; i < 4 + Math.floor(Math.random() * 2); i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function formatDateToSheet(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()}-${months[d.getMonth()]}-${d.getFullYear()}`
}

// ---- User Management ----

export async function initializeAdminUser() {
  const users = await db.users.toArray()
  if (users.length === 0) {
    // Create default admin user
    await db.users.add({
      username: 'gchboyboy',
      password: '19950428Gch',
      isAdmin: true,
      createdAt: new Date().toISOString()
    })
  }
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const user = await db.users.where('username').equals(username).first()
  if (user && user.password === password) {
    return user
  }
  return null
}

export async function getUsers(): Promise<User[]> {
  return db.users.toArray()
}

export async function addUser(user: Omit<User, 'id' | 'createdAt'>): Promise<number> {
  const full: Omit<User, 'id'> = {
    ...user,
    createdAt: new Date().toISOString()
  }
  return db.users.add(full)
}

export async function updateUser(id: number, updates: Partial<Omit<User, 'id' | 'createdAt'>>) {
  await db.users.update(id, updates)
}

export async function deleteUser(id: number) {
  await db.users.delete(id)
}
