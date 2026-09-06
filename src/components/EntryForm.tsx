import { useState, useEffect } from 'react'
import type { Ledger, ExpenseType, ParsedReceipt } from '../types'
import { EXPENSE_TYPES } from '../types'
import { addExpense, saveFile, generateUniqueId } from '../lib/db'
import { pushUnsyncedEntries, getWebAppUrl } from '../lib/sheetSync'

interface Props {
  ledger: Ledger
  initialType: ExpenseType
  initialScanFile?: File | null
  onScanHandled?: () => void
}

export default function EntryForm({ ledger, initialType, initialScanFile, onScanHandled }: Props) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [expense, setExpense] = useState('')
  const [type, setType] = useState<ExpenseType>(initialType)
  const [amount, setAmount] = useState('')
  const [imageRef, setImageRef] = useState('')
  const [pdfRef, setPdfRef] = useState('')
  const [remark, setRemark] = useState('')
  const [autofilled, setAutofilled] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [webAppUrl, setWebAppUrlState] = useState('')

  useEffect(() => {
    getWebAppUrl().then(setWebAppUrlState)
  }, [])

  // Handle a file picked via the "Scan Receipt" card
  useEffect(() => {
    if (initialScanFile) {
      processFile(initialScanFile, 'scan')
      onScanHandled?.()
    }
  }, [initialScanFile])

  function applyParsed(p: ParsedReceipt) {
    const marks: string[] = []
    if (p.date) { setDate(p.date); marks.push('date') }
    if (p.amount !== undefined) { setAmount(String(p.amount)); marks.push('amount') }
    if (p.description) { setExpense(p.description); marks.push('expense') }
    setAutofilled(marks)
  }

  async function processFile(file: File, source: 'scan' | 'attach') {
    setMessage(source === 'scan' ? 'Analyzing receipt...' : 'Processing image...')
    try {
      const att = await saveFile(file)
      if (source === 'scan') {
        // From the Scan Receipt card: attach as image if it's an image
        if (file.type.startsWith('image/')) setImageRef(att.name)
        else if (file.type === 'application/pdf') setPdfRef(att.name)
      } else {
        setImageRef(att.name)
      }
      // Run OCR for receipt extraction
      const { activeOCR } = await import('../lib/ocr')
      const parsed = await activeOCR.parseReceipt(file)
      
      // Count what was actually filled
      const filledFields = [parsed.date, parsed.amount, parsed.description].filter(v => v !== undefined).length
      
      applyParsed(parsed)
      
      if (filledFields === 0) {
        setMessage('Could not extract data from receipt. Please enter manually.')
      } else if (parsed.confidence === 'high') {
        setMessage(`Auto-filled ${filledFields} field(s) from receipt. Please verify.`)
      } else {
        setMessage(`Auto-filled ${filledFields} field(s) with low confidence. Please verify carefully.`)
      }
    } catch (err) {
      setMessage(`File saved but parsing failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await processFile(file, 'attach')
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const att = await saveFile(file)
      setPdfRef(att.name)
      setMessage('PDF attached (OCR for PDFs is limited in v1).')
    } catch (err) {
      setMessage(`PDF save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function save() {
    if (!expense.trim() || !amount || isNaN(parseFloat(amount))) {
      setMessage('Please fill in Expense and Amount.')
      return
    }
    setSaving(true)
    setMessage('')
    let savedUniqueId = ''
    try {
      savedUniqueId = generateUniqueId()
      await addExpense({
        uniqueId: savedUniqueId,
        date,
        expense: expense.trim(),
        amount: parseFloat(amount),
        ledger,
        type: ledger === 'All Expenses' ? type : undefined,
        imageAttachment: imageRef || undefined,
        pdfAttachment: pdfRef || undefined,
        remark: remark.trim() || undefined
      })

      // Local save done — acknowledge immediately and reset the form.
      // NOTE: never `await` the Google Sheet sync here; a slow/broken
      // Apps Script URL would freeze the UI. It runs in the background.
      setMessage(`Saved ✓ ${savedUniqueId}`)
      setExpense('')
      setAmount('')
      setType(initialType)
      setImageRef('')
      setPdfRef('')
      setRemark('')
      setAutofilled([])
      setSaving(false)

      // Background sync (fire-and-forget, wrapped in its own try/catch)
      if (webAppUrl) {
        pushUnsyncedEntries(webAppUrl)
          .then((r) => {
            if (r.success) {
              setMessage(`Saved ✓ ${savedUniqueId} · ${r.message}`)
            } else {
              setMessage(`Saved ✓ ${savedUniqueId} · Sync pending: ${r.message}`)
            }
          })
          .catch((err) => {
            setMessage(`Saved ✓ ${savedUniqueId} · Sync pending: ${err instanceof Error ? err.message : String(err)}`)
          })
      }
    } catch (err) {
      setSaving(false)
      setMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-400 block mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setAutofilled(autofilled.filter((f) => f !== 'date')) }}
          className={autofilled.includes('date') ? 'border-yellow-500' : ''}
        />
        {autofilled.includes('date') && <span className="text-[10px] text-yellow-400">auto-filled</span>}
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Expense</label>
        <input
          type="text"
          value={expense}
          onChange={(e) => { setExpense(e.target.value); setAutofilled(autofilled.filter((f) => f !== 'expense')) }}
          placeholder="e.g. Grocery shopping"
          className={autofilled.includes('expense') ? 'border-yellow-500' : ''}
        />
        {autofilled.includes('expense') && <span className="text-[10px] text-yellow-400">auto-filled</span>}
      </div>

      {ledger === 'All Expenses' && (
        <div>
          <label className="text-xs text-gray-400 block mb-1">Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as ExpenseType)}>
            {EXPENSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="text-xs text-gray-400 block mb-1">Amount</label>
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => { setAmount(e.target.value); setAutofilled(autofilled.filter((f) => f !== 'amount')) }}
          placeholder="0.00"
          className={`currency ${autofilled.includes('amount') ? 'border-yellow-500' : ''}`}
        />
        {autofilled.includes('amount') && <span className="text-[10px] text-yellow-400">auto-filled</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-400 block mb-1">Image Attachment</label>
          <input type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="text-xs" />
          {imageRef && <span className="text-[10px] text-green-400 block mt-1">{imageRef}</span>}
        </div>
        <div>
          <label className="text-xs text-gray-400 block mb-1">PDF Attachment</label>
          <input type="file" accept="application/pdf" onChange={handlePdfUpload} className="text-xs" />
          {pdfRef && <span className="text-[10px] text-green-400 block mt-1">{pdfRef}</span>}
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 block mb-1">Remark</label>
        <input
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Optional note"
        />
      </div>

      {message && <p className="text-xs text-yellow-300">{message}</p>}

      <button
        onClick={save}
        disabled={saving}
        className={ledger === 'Big Expenses' ? 'btn-red w-full' : 'btn-blue w-full'}
      >
        {saving ? 'Saving...' : 'Save Entry'}
      </button>
    </div>
  )
}