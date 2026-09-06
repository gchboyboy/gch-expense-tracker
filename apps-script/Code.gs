/**
 * GCH Expense Tracker - Google Apps Script Web App
 * Bound to the target spreadsheet.
 *
 * Deploy as: Web App
 *  - Execute as: Me
 *  - Who has access: Anyone (or Anyone with Google account)
 *
 * Endpoints:
 *   GET  (no params)       -> test connection, report spreadsheet name + tabs found
 *   GET  ?pull=1           -> pull all rows from both tabs (returns full data)
 *   POST                   -> append a row to either "Big Expenses" or "All Expenses"
 *                              (encode payload as text/plain JSON to avoid CORS preflight)
 */

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};

  // Pull mode — return every row from both tabs
  if (params.pull === '1') {
    return pullAllData();
  }

  // Default: test connection
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabsFound = [];
  if (ss.getSheetByName('Big Expenses')) tabsFound.push('Big Expenses');
  if (ss.getSheetByName('All Expenses')) tabsFound.push('All Expenses');

  return jsonResponse({
    spreadsheetName: ss.getName(),
    tabsFound: tabsFound
  });
}

/**
 * Read every row from both tabs and return them keyed by header name.
 * The frontend maps fields by header text so it tolerates column reordering.
 */
function pullAllData() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {
      success: true,
      bigExpenses: readTabAsObjects('Big Expenses', ss),
      allExpenses: readTabAsObjects('All Expenses', ss)
    };
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

/**
 * Read a tab and return each row as { headerName: cellValue, ... }.
 * Header row is row 1; data rows start at row 2.
 * Empty rows (all cells blank/null/undefined) are skipped.
 */
function readTabAsObjects(sheetName, ss) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; // header only or empty

  var lastCol = sheet.getLastColumn();
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  var headers = values[0];
  var rows = values.slice(1);

  var result = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    // skip fully-empty rows
    var hasContent = false;
    for (var c = 0; c < row.length; c++) {
      var v = row[c];
      if (v !== '' && v !== null && v !== undefined) { hasContent = true; break; }
    }
    if (!hasContent) continue;

    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      var key = String(headers[h] || '').trim();
      if (key) obj[key] = row[h];
    }
    result.push(obj);
  }
  return result;
}

function doPost(e) {
  try {
    // Payload arrives as text/plain JSON
    var payload = JSON.parse(e.postData.contents);
    var sheetName = payload.sheet || 'All Expenses';
    var values = payload.values;

    if (!values || !Array.isArray(values)) {
      throw new Error('Invalid payload: values array required');
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('Sheet "' + sheetName + '" not found');
    }

    appendRowAfterLastContent(sheet, values);

    return jsonResponse({ success: true, sheet: sheetName });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) });
  }
}

/**
 * Find the last row with actual content in column A and append after it.
 * This avoids appendRow() issues on large sheets with stray formatting.
 */
function appendRowAfterLastContent(sheet, values) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(values);
    return;
  }

  // Scan column A for the last non-empty, non-header data cell
  var colAValues = sheet.getRange(1, 1, lastRow, 1).getValues();
  var lastContentRow = 0;
  for (var i = colAValues.length - 1; i >= 0; i--) {
    var v = colAValues[i][0];
    if (v !== '' && v !== null && v !== undefined) {
      lastContentRow = i + 1; // 1-based row in sheet
      break;
    }
  }

  if (lastContentRow === 0) {
    // Header row only exists or sheet empty: append at row 1
    sheet.appendRow(values);
  } else {
    sheet.getRange(lastContentRow + 1, 1, 1, values.length).setValues([values]);
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}