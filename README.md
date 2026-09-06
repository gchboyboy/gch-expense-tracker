# GCH Expense Tracker

A personal expense-recording and analytics PWA, iOS-first, with local-first storage and Google Sheets sync.

## Features

- **Two ledgers**: Big Expenses and All Expenses, matching your existing Google Sheet columns exactly.
- **Receipt scanning**: take a photo or upload an image/PDF → client-side OCR (tesseract.js) auto-fills date, amount, and merchant into the entry form for review.
- **Manual entry**: full form with date, expense, type (All Expenses only), amount, image/PDF filename refs, remark.
- **Local-first**: everything saves to IndexedDB instantly (works offline) and syncs to Google Sheets in the background.
- **Dashboard**: date-range presets + custom From/To, multi-select type filter (Big Expenses as its own pseudo-type), summary cards (total, average/day & month, count), spend-over-time chart, breakdown-by-type chart, and a Big Expenses callout list.
- **Settings**: save/test your Apps Script Web App URL, push unsynced entries, export per-ledger CSV, clear local data.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- Dexie (IndexedDB)
- tesseract.js (offline OCR, swappable for a hosted API)
- recharts (dashboard charts)
- vite-plugin-pwa (installable, offline-capable)

## Getting started

```bash
npm install
npm run dev       # local dev at http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

## Installing as a PWA (iPhone)

1. `npm run build` and host the `dist/` folder (GitHub Pages / Netlify / Vercel, or any static host).
2. Open the hosted URL in Safari on your iPhone.
3. Tap **Share → Add to Home Screen**.
4. Open the app from the Home Screen — it runs standalone and works offline.

## Google Sheets sync

1. Open your Google Sheet → **Extensions → Apps Script**.
2. Paste the contents of `apps-script/Code.gs` into `Code.gs`.
3. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the Web App URL.
5. In the app → **Settings**, paste the URL, tap **Test Connection**, then use **Push Unsynced** (or just add entries — they sync automatically when a URL is saved).

### Apps Script behavior

- `GET /` → reports the bound spreadsheet name and whether both tabs exist (Test Connection).
- `POST /` with JSON `{ sheet, values }` → appends a new row into the last row with content in **column A** (avoids `appendRow()` gaps on large sheets).

## Data model

**Big Expenses** (order-sensitive, matches the sheet):
`Unique ID, Date, Expense, Amount, Image Attachment, PDF Attachment, Remark`

**All Expenses**:
`Unique ID, Date, Expense, Type, Amount, Image Attachment, PDF Attachment, Remark`

- Dates stored internally as `YYYY-MM-DD`, displayed/exported as `D-Mon-YYYY` (e.g. `9-Aug-2026`).
- `Unique ID` auto-generates as `K-XXXX` (4–5 alphanumeric chars).
- Image/PDF columns store filename references; the actual blobs live in IndexedDB on the device.

## Project structure

```
/src
  /components      EntryForm, Dashboard, Settings
  /lib
    db.ts            IndexedDB schema + CRUD + ID/date helpers
    ocr.ts           OCR interface + tesseract.js implementation (swappable)
    sheetSync.ts     Apps Script wrapper, test connection, retry, CSV export
  /types            shared types (ExpenseRecord, Ledger, ExpenseType, ...)
  App.tsx           tabs + entry captufe flow
apps-script/Code.gs    the Google Apps Script source (kept in-repo)
```

## Non-goals (v1)

- No accounts/auth
- No native App Store distribution (PWA only)
- No cloud file storage for receipts (local device only)