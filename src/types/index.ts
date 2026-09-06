export type Ledger = 'Big Expenses' | 'All Expenses'

export type ExpenseType =
  | 'Food'
  | 'Transport'
  | 'Necessity'
  | 'Entertainment'
  | 'Shopping'
  | 'Accommodation'
  | 'Insurance'
  | 'Loan'
  | 'TnG Ewallet'
  | 'Cat'
  | 'Others'

export const EXPENSE_TYPES: ExpenseType[] = [
  'Food',
  'Transport',
  'Necessity',
  'Entertainment',
  'Shopping',
  'Accommodation',
  'Insurance',
  'Loan',
  'TnG Ewallet',
  'Cat',
  'Others'
]

export interface ExpenseRecord {
  id?: number
  uniqueId: string
  date: string // ISO YYYY-MM-DD
  expense: string
  amount: number
  ledger: Ledger
  type?: ExpenseType // only for All Expenses
  imageAttachment?: string // filename reference
  pdfAttachment?: string // filename reference
  remark?: string
  synced: number // 0 = unsynced, 1 = synced (use number for IndexedDB index compatibility)
}

export interface FileAttachment {
  id: string
  name: string
  type: string
  size: number
  blob: Blob
}

export interface ParsedReceipt {
  date?: string
  amount?: number
  description?: string
  confidence: 'high' | 'low'
}

export interface SyncStatus {
  success: boolean
  message: string
  spreadsheetName?: string
  tabsFound?: string[]
  pushedCount?: number
}

export interface User {
  id?: number
  username: string
  password: string
  isAdmin: boolean
  createdAt: string
}
