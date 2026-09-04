/**
 * TIMESHEET -> GOOGLE SHEETS
 *
 * Paste this whole file into the Apps Script editor attached to your
 * Google Sheet, then deploy it as a web app. Step-by-step instructions
 * are in README.md under "Sending the hours to Google Sheets".
 *
 * It keeps two tabs:
 *
 *   Shifts  one row per shift, updated in place when somebody clocks out.
 *           This is the tab to use for payroll.
 *   Log     one line for every message received, never edited. Use it if
 *           you ever need to prove what happened and when.
 *
 * Rows are matched on the punch id, so if the timesheet retries a message
 * after a dropped connection you get the same row updated, not a duplicate.
 */

var SHIFTS_SHEET = 'Shifts';
var LOG_SHEET = 'Log';

var SHIFT_HEADERS = [
  'Punch ID', 'Employee', 'Date', 'Clock In', 'Clock Out',
  'Hours', 'Status', 'Device', 'Last Updated'
];

var LOG_HEADERS = ['Received', 'Punch ID', 'Employee', 'Action', 'Device', 'Raw'];


function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    // Two people clocking in at the same moment must not write the same row.
    lock.waitLock(20000);

    if (!e || !e.postData || !e.postData.contents) {
      return reply({ ok: false, error: 'Empty request.' });
    }

    var row = JSON.parse(e.postData.contents);

    if (row.action === 'test') {
      appendLog(row, e.postData.contents);
      return reply({ ok: true, result: 'connection test received' });
    }

    if (!row.punchId) {
      return reply({ ok: false, error: 'Missing punchId.' });
    }

    upsertShift(row);
    appendLog(row, e.postData.contents);

    return reply({ ok: true, result: 'saved', punchId: row.punchId });

  } catch (err) {
    return reply({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}


/** Opening the web app address in a browser shows this, which is a quick
 *  way to confirm the deployment is live. */
function doGet() {
  return reply({ ok: true, result: 'Timesheet endpoint is running.' });
}


function reply(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}


function sheetNamed(name, headers) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);

  if (!sheet) {
    sheet = book.insertSheet(name);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return sheet;
}


function upsertShift(row) {
  var sheet = sheetNamed(SHIFTS_SHEET, SHIFT_HEADERS);

  var values = [
    row.punchId,
    row.employeeName || '',
    row.inLocal ? String(row.inLocal).split('  ')[0] : '',
    row.inLocal || '',
    row.outLocal || '',
    row.hours === '' || row.hours === null || row.hours === undefined ? '' : row.hours,
    row.outAt ? 'Complete' : 'Still clocked in',
    row.device || '',
    new Date()
  ];

  var existing = findRowByPunchId(sheet, row.punchId);

  if (existing > 0) {
    sheet.getRange(existing, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}


function findRowByPunchId(sheet, punchId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(punchId)) return i + 2;
  }
  return -1;
}


function appendLog(row, raw) {
  var sheet = sheetNamed(LOG_SHEET, LOG_HEADERS);
  sheet.appendRow([
    new Date(),
    row.punchId || '',
    row.employeeName || '',
    row.action || '',
    row.device || '',
    String(raw).slice(0, 2000)
  ]);
}
