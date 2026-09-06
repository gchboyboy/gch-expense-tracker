import Tesseract from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'
import type { ParsedReceipt } from '../types'

// Set up PDF.js worker - use local copy from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'

/**
 * OCR interface. The tesseract.js implementation is the default client-side
 * first-pass. Swap this module for a hosted API (Google Vision, Mindee,
 * Veryfi) behind the same `parseReceipt` signature to improve accuracy.
 */
export interface OCRProvider {
  parseReceipt(file: File): Promise<ParsedReceipt>
}

export const tesseractOCR: OCRProvider = {
  async parseReceipt(file: File): Promise<ParsedReceipt> {
    try {
      let text = ''
      
      // Handle PDFs differently
      if (file.type === 'application/pdf') {
        console.log('[OCR] Processing PDF file...')
        text = await extractTextFromPDF(file)
        console.log('[OCR] Extracted PDF text:', text.substring(0, 500))
      } else {
        console.log('[OCR] Processing image file...')
        // Handle images with Tesseract OCR
        const result = await Tesseract.recognize(file, 'eng', {
          logger: () => {} // silence progress
        })
        text = result.data.text
        console.log('[OCR] Extracted image text:', text.substring(0, 500))
      }
      
      const parsed = extractFromText(text)
      console.log('[OCR] Parsed result:', JSON.stringify(parsed, null, 2))
      return parsed
    } catch (err) {
      console.error('OCR failed:', err)
      return { confidence: 'low' }
    }
  }
}

async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  
  let fullText = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
    fullText += pageText + '\n'
  }
  
  return fullText
}

export const activeOCR: OCRProvider = tesseractOCR

/**
 * Extract candidate date, amount and description from OCR text.
 * Heuristics:
 *  - amount: currency-prefixed numbers, prefer largest or total-labeled one
 *  - date: patterns like 09/08/2026, 9-Aug-2026, 2026-08-09
 *  - description: first meaningful line (merchant name heuristic)
 */
export function extractFromText(text: string): ParsedReceipt {
  const result: ParsedReceipt = { confidence: 'high' }

  // Amount detection
  const amountMatch = extractAmount(text)
  if (amountMatch) {
    result.amount = amountMatch
  }

  // Date detection
  const dateMatch = extractDate(text)
  if (dateMatch) {
    result.date = dateMatch
  }

  // Description detection (merchant name heuristic: first non-empty, non-numeric line)
  const desc = extractDescription(text)
  if (desc) {
    result.description = desc
  }

  // Set confidence based on how many critical fields we found
  // Need at least amount OR (date + description) for high confidence
  const foundCount = [result.amount !== undefined, result.date !== undefined, result.description !== undefined].filter(Boolean).length
  if (foundCount === 0 || (foundCount === 1 && !result.amount)) {
    result.confidence = 'low'
  } else if (foundCount < 3 && !result.amount) {
    result.confidence = 'low'
  }

  return result
}

function extractAmount(text: string): number | undefined {
  console.log('[extractAmount] Searching in text:', text.substring(0, 300))
  
  // Look for currency-prefixed numbers (RM 120.00, RM120.00, etc.) and standalone amounts
  const currencyRegex = /(?:RM|rm|\$|MYR|ringgit malaysia)[\s]*([\d,]+(?:\.\d{1,2})?)/gi
  const matches: number[] = []
  let m: RegExpExecArray | null
  while ((m = currencyRegex.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    console.log('[extractAmount] Found currency match:', val)
    matches.push(val)
  }

  console.log('[extractAmount] Currency matches:', matches)

  if (matches.length === 0) {
    console.log('[extractAmount] No currency-prefixed amounts, trying standalone numbers...')
    // Fallback: look for standalone decimal numbers that look like prices
    const standaloneRegex = /\b(\d{1,6}\.\d{2})\b/g
    while ((m = standaloneRegex.exec(text)) !== null) {
      const val = parseFloat(m[1])
      console.log('[extractAmount] Found standalone decimal:', val)
      matches.push(val)
    }
  }

  if (matches.length === 0) {
    console.log('[extractAmount] No amounts found')
    return undefined
  }

  // Look for "TOTAL" or payment-related labeled amounts
  const totalRegex = /(?:total|grand total|amount due|please pay|payment|sum of|ringgit malaysia)[\s:]*(?:RM|rm|\$|MYR)?[\s]*([\d,]+(?:\.\d{1,2})?)/gi
  const totalMatch = totalRegex.exec(text)
  if (totalMatch) {
    const amount = parseFloat(totalMatch[1].replace(/,/g, ''))
    console.log('[extractAmount] Found labeled total:', amount)
    return amount
  }

  // Return the largest amount found
  const result = Math.max(...matches)
  console.log('[extractAmount] Returning largest:', result)
  return result
}

function extractDate(text: string): string | undefined {
  console.log('[extractDate] Searching in text...')
  
  // Pattern: DD/MM/YYYY or MM/DD/YYYY
  const slashRegex = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/
  const slashMatch = slashRegex.exec(text)
  if (slashMatch) {
    const [, a, b, year] = slashMatch
    // MY locale: prefer day-first (DD/MM/YYYY). Only flip to MM/DD when
    // the first number is clearly invalid as a day (>31) or the second is
    // invalid as a month, or the first is clearly a month (>12 with second <=12).
    let day: number
    let month: number
    const first = parseInt(a)
    const second = parseInt(b)
    const firstIsMonth = first <= 12 && second > 12
    if (firstIsMonth) {
      // MM/DD layout is unambiguous
      month = first
      day = second
    } else if (second > 12 || first > 12) {
      // Only one valid layout remains: DD/MM
      month = second
      day = first
    } else {
      // Ambiguous 09/08 -> day-first (MY locale)
      day = first
      month = second
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      console.log('[extractDate] Found slash date:', result)
      return result
    }
  }

  // Pattern: DD-Mon-YYYY or DD/Mon/YYYY (e.g. 24/Aug/2026, 9-Aug-2026)
  const monRegex = /(\d{1,2})[/\- ](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[/\- ,](\d{4})/i
  const monMatch = monRegex.exec(text)
  if (monMatch) {
    const months: Record<string, number> = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    }
    const day = parseInt(monMatch[1])
    const month = months[monMatch[2].toLowerCase()]
    const year = parseInt(monMatch[3])
    const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    console.log('[extractDate] Found month-name date:', result)
    return result
  }

  console.log('[extractDate] No date found')
  return undefined
}

function extractDescription(text: string): string | undefined {
  console.log('[extractDescription] Searching for merchant name...')
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Skip obvious junk/first lines that are totals or headers
  const skipPatterns = [
    /^total$/i, /grand total/i, /^[A-Z]{2,}$/, /^[\d.,]+$/, /amount/i,
    /date/i, /qty/i, /thank you/i, /receipt/i, /invoice/i, /bill/i,
    /tax/i, /subtotal/i, /phone/i, /^time/i, /^tel/i, /^no\./i, /^item/i,
    /^h\/p/i, /^email/i, /^fax/i, /^address/i, /^sst/i, /^rep-/i, /^w\d+-/i,
    /^received from/i, /^payment/i, /^description/i, /^being payment/i
  ]

  // Merchant heuristic: reasonably short lines that look like company names.
  // Prefer ALL-CAPS merchant-ish lines first, then any meaningful alpha line.
  const merchantish = (line: string) =>
    line.length >= 3 &&
    line.length <= 60 &&
    /^[A-Za-z][A-Za-z\s'&.,()/-]*$/.test(line) &&
    line.split(/\s+/).length <= 8 &&
    !skipPatterns.some((p) => p.test(line))

  // Pass 1: prefer lines with ALL-CAPS words (typical merchant header)
  const capsLine = lines.find((l) => merchantish(l) && /[A-Z]{3}/.test(l))
  if (capsLine) {
    console.log('[extractDescription] Found caps merchant:', capsLine)
    return capsLine
  }

  // Pass 2: first meaningful alphabetic line
  const anyLine = lines.find((l) => merchantish(l))
  if (anyLine) {
    console.log('[extractDescription] Found merchant:', anyLine)
    return anyLine
  }

  console.log('[extractDescription] No merchant name found')
  return undefined
}
