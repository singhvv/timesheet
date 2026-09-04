/**
 * TIMESHEET -> GOOGLE SHEETS
 *
 * Paste this whole file into the Apps Script editor attached to your
 * Google Sheet, then deploy it as a web app. Step-by-step instructions
 * are in README.md under "Sending the hours to Google Sheets".
 *
 * Three tabs:
 *
 *   Timesheet  the one you actually read. Pay periods newest first, each
 *              employee on one line with their total, and a +/- control in
 *              the left margin to open up their days.
 *   Shifts     the raw feed, one row per shift, keyed by punch id. The
 *              Timesheet tab is rebuilt from this. Do not sort it by hand.
 *   Log        one line for every message received, never edited.
 *
 * Rows in Shifts are matched on the punch id, so a retry after a dropped
 * connection updates the row instead of duplicating it.
 */


/* ============================================================
   CONFIGURATION -- change these if your payroll changes
   ============================================================ */

/* Any Sunday that started a real pay period. Everything else is counted
   forwards and backwards from here in 14 day steps, so this one date fixes
   the whole calendar. Sunday 13 September 2026 runs to Saturday 26
   September 2026, with payday on Friday 2 October 2026. */
var PERIOD_ANCHOR_YEAR = 2026;
var PERIOD_ANCHOR_MONTH = 9;    // 1 = January
var PERIOD_ANCHOR_DAY = 13;

var PERIOD_LENGTH_DAYS = 14;

/* Payday is the Friday after the Saturday the period ends on: six days later. */
var PAYDAY_OFFSET_DAYS = 6;

var NEWEST_PERIOD_FIRST = true;
var BLANK_ROWS_BETWEEN_EMPLOYEES = 1;
var BLANK_ROWS_BETWEEN_PERIODS = 3;

/* A shift longer than this is almost certainly a missed clock-out. */
var LONG_SHIFT_HOURS = 16;


/* ============================================================
   SHEET NAMES AND HEADERS
   ============================================================ */

var TIMESHEET_SHEET = 'Timesheet';
var SHIFTS_SHEET = 'Shifts';
var LOG_SHEET = 'Log';

var SHIFT_HEADERS = [
  'Punch ID', 'Employee', 'Employee ID', 'Date', 'Clock In', 'Clock Out',
  'Hours', 'Status', 'Device', 'In (ms)', 'Out (ms)', 'Last Updated'
];

var LOG_HEADERS = ['Received', 'Punch ID', 'Employee', 'Action', 'Device', 'Raw'];

var COL_PUNCH_ID = 1;
var COL_EMPLOYEE = 2;
var COL_EMPLOYEE_ID = 3;
var COL_DATE = 4;
var COL_IN_TEXT = 5;
var COL_OUT_TEXT = 6;
var COL_HOURS = 7;
var COL_STATUS = 8;
var COL_DEVICE = 9;
var COL_IN_MS = 10;
var COL_OUT_MS = 11;
var COL_UPDATED = 12;


/* ============================================================
   MENU
   ============================================================ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Timesheet')
    .addItem('Rebuild now', 'rebuildTimesheet')
    .addToUi();
}


/* ============================================================
   WEB APP ENDPOINTS
   ============================================================ */

function doPost(e) {
  var lock = LockService.getScriptLock();

  try {
    // Two people clocking in at the same moment must not write the same row.
    lock.waitLock(30000);

    if (!e || !e.postData || !e.postData.contents) {
      return reply({ ok: false, error: 'Empty request.' });
    }

    var row = JSON.parse(e.postData.contents);

    if (row.action === 'test') {
      appendLog(row, e.postData.contents);
      return reply({ ok: true, result: 'connection test received' });
    }

    /* Sent once at the end of a "Send All History" run, so the sheet is not
       rebuilt hundreds of times on the way through. */
    if (row.action === 'rebuild') {
      rebuildTimesheet();
      return reply({ ok: true, result: 'timesheet rebuilt' });
    }

    if (!row.punchId) {
      return reply({ ok: false, error: 'Missing punchId.' });
    }

    upsertShift(row);
    appendLog(row, e.postData.contents);

    if (!row.bulk) rebuildTimesheet();

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


/* ============================================================
   DATES

   Day arithmetic goes through whole day numbers rather than
   milliseconds, so the clocks going forward or back cannot shunt a
   shift into the wrong pay period.
   ============================================================ */

function dayNumberOf(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

function dateOfDayNumber(dayNumber) {
  var utc = new Date(dayNumber * 86400000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function anchorDayNumber() {
  return dayNumberOf(new Date(PERIOD_ANCHOR_YEAR, PERIOD_ANCHOR_MONTH - 1, PERIOD_ANCHOR_DAY));
}

/** The first day of the pay period that contains this day. */
function periodStartDayNumber(dayNumber) {
  var span = PERIOD_LENGTH_DAYS;
  var drift = ((dayNumber - anchorDayNumber()) % span + span) % span;
  return dayNumber - drift;
}

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

var WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** 09/13/2026 -- month first, matching the rest of the app. */
function formatDate(date) {
  return pad2(date.getMonth() + 1) + '/' + pad2(date.getDate()) + '/' + date.getFullYear();
}

/** Sun 09/13/2026 */
function formatDateWithWeekday(date) {
  return WEEKDAY_NAMES[date.getDay()] + ' ' + formatDate(date);
}

/** 8:00 AM */
function formatTime(ms) {
  var d = new Date(ms);
  var hour = d.getHours();
  var suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return hour + ':' + pad2(d.getMinutes()) + ' ' + suffix;
}

function roundHours(ms) {
  return Math.round((ms / 3600000) * 100) / 100;
}

/* Adding numbers that are already rounded to 2dp can still leave float dust
   like 33.730000000000004, so every running total goes through this. */
function round2(n) {
  return Math.round(n * 100) / 100;
}


/* ============================================================
   BUILDING THE TIMESHEET TAB

   buildTimesheetLayout is deliberately free of any SpreadsheetApp
   calls so the row maths can be checked outside of Google.
   ============================================================ */

/**
 * records: [{ punchId, employeeName, employeeId, inAt, outAt }]  inAt/outAt in ms
 *
 * Returns:
 *   values         2D array, one inner array per sheet row, 4 columns wide
 *   periodRows     0-based indexes of the pay period heading rows
 *   employeeRows   0-based indexes of the employee heading rows
 *   dayGroups      [{ firstRow, lastRow }] 0-based, the day rows to fold away
 */
function buildTimesheetLayout(records) {
  var periods = {};

  /* ---- 1. sort every punch into period -> employee -> day ---- */

  records.forEach(function (record) {
    if (!record.inAt) return;

    var dayNumber = dayNumberOf(new Date(record.inAt));
    var periodStart = periodStartDayNumber(dayNumber);

    var period = periods[periodStart];
    if (!period) period = periods[periodStart] = { start: periodStart, employees: {} };

    var name = record.employeeName || '(unnamed)';
    var employee = period.employees[name];
    if (!employee) employee = period.employees[name] = { name: name, days: {}, openCount: 0 };

    var day = employee.days[dayNumber];
    if (!day) day = employee.days[dayNumber] = { dayNumber: dayNumber, shifts: [] };

    day.shifts.push(record);
    if (!record.outAt) employee.openCount++;
  });

  /* ---- 2. work out the hours ----

     Each shift is rounded once, and everything above it is a plain sum of
     numbers that are already rounded. That is what makes the day rows add
     up to the employee total, and the employee totals add up to the period
     total, when somebody checks the sheet with a calculator. */

  var periodStarts = Object.keys(periods).map(Number).sort(function (a, b) {
    return NEWEST_PERIOD_FIRST ? b - a : a - b;
  });

  periodStarts.forEach(function (start) {
    var period = periods[start];
    period.hours = 0;

    Object.keys(period.employees).forEach(function (name) {
      var employee = period.employees[name];
      employee.hours = 0;
      employee.daysWorked = 0;

      Object.keys(employee.days).map(Number).forEach(function (dayNumber) {
        var day = employee.days[dayNumber];
        day.hours = 0;

        day.shifts.forEach(function (shift) {
          if (!shift.outAt) return;
          var worked = shift.outAt - shift.inAt;
          day.hours = round2(day.hours + roundHours(worked > 0 ? worked : 0));
        });

        if (day.hours > 0) employee.daysWorked++;
        employee.hours = round2(employee.hours + day.hours);
      });

      period.hours = round2(period.hours + employee.hours);
    });
  });

  /* ---- 3. lay it out ---- */

  var values = [];
  var periodRows = [];
  var employeeRows = [];
  var dayGroups = [];

  periodStarts.forEach(function (start, periodIndex) {
    var period = periods[start];

    var startDate = dateOfDayNumber(start);
    var endDate = dateOfDayNumber(start + PERIOD_LENGTH_DAYS - 1);
    var payday = dateOfDayNumber(start + PERIOD_LENGTH_DAYS - 1 + PAYDAY_OFFSET_DAYS);

    periodRows.push(values.length);
    values.push([
      '',
      'Pay period: ' + formatDate(startDate) + ' – ' + formatDate(endDate),
      period.hours,
      'Payday ' + formatDate(payday)
    ]);

    var names = Object.keys(period.employees).sort(function (a, b) {
      var x = a.toLowerCase(), y = b.toLowerCase();
      return x < y ? -1 : (x > y ? 1 : 0);
    });

    names.forEach(function (name, employeeIndex) {
      var employee = period.employees[name];

      var note = employee.daysWorked + (employee.daysWorked === 1 ? ' day worked' : ' days worked');
      if (employee.openCount) {
        note += ', ' + employee.openCount +
                (employee.openCount === 1 ? ' shift not clocked out' : ' shifts not clocked out');
      }

      employeeRows.push(values.length);
      values.push(['', name, employee.hours, note]);

      var firstDayRow = values.length;

      Object.keys(employee.days).map(Number).sort(function (a, b) {
        return a - b;                       // days always read oldest first
      }).forEach(function (dayNumber) {
        var day = employee.days[dayNumber];

        var shiftText = day.shifts.sort(function (a, b) {
          return a.inAt - b.inAt;
        }).map(function (shift) {
          if (!shift.outAt) return formatTime(shift.inAt) + ' – no clock-out';
          var text = formatTime(shift.inAt) + ' – ' + formatTime(shift.outAt);
          if (shift.outAt - shift.inAt > LONG_SHIFT_HOURS * 3600000) text += ' *';
          return text;
        }).join(',  ');

        values.push(['', formatDateWithWeekday(dateOfDayNumber(dayNumber)), day.hours, shiftText]);
      });

      if (values.length > firstDayRow) {
        dayGroups.push({ firstRow: firstDayRow, lastRow: values.length - 1 });
      }

      if (employeeIndex !== names.length - 1) {
        for (var b = 0; b < BLANK_ROWS_BETWEEN_EMPLOYEES; b++) values.push(['', '', '', '']);
      }
    });

    if (periodIndex !== periodStarts.length - 1) {
      for (var g = 0; g < BLANK_ROWS_BETWEEN_PERIODS; g++) values.push(['', '', '', '']);
    }
  });

  return {
    values: values,
    periodRows: periodRows,
    employeeRows: employeeRows,
    dayGroups: dayGroups
  };
}


function rebuildTimesheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(TIMESHEET_SHEET);
  if (!sheet) sheet = book.insertSheet(TIMESHEET_SHEET, 0);

  var layout = buildTimesheetLayout(readShiftRecords());

  // Groups have to go before the rows they were attached to do.
  removeAllRowGroups(sheet);
  sheet.clear();
  sheet.clearNotes();

  if (!layout.values.length) {
    sheet.getRange(1, 2).setValue('No hours have been recorded yet.');
    return;
  }

  sheet.getRange(1, 1, layout.values.length, 4).setValues(layout.values);

  sheet.setColumnWidth(1, 28);     // left margin
  sheet.setColumnWidth(2, 190);    // employee name / date
  sheet.setColumnWidth(3, 80);     // hours
  sheet.setColumnWidth(4, 380);    // payday / days worked / shift times

  sheet.getRange(1, 3, layout.values.length, 1).setNumberFormat('0.00');
  sheet.getRange(1, 1, layout.values.length, 4).setVerticalAlignment('middle');

  layout.periodRows.forEach(function (rowIndex) {
    var range = sheet.getRange(rowIndex + 1, 1, 1, 4);
    range.setFontWeight('bold');
    range.setBackground('#d9dde0');
    range.setBorder(true, true, true, true, false, false, '#7a8a99',
                    SpreadsheetApp.BorderStyle.SOLID);
  });

  layout.employeeRows.forEach(function (rowIndex) {
    var range = sheet.getRange(rowIndex + 1, 1, 1, 4);
    range.setFontWeight('bold');
    range.setBackground('#f1f3f4');
  });

  /* The +/- control sits on the employee row, immediately above the days
     it opens. */
  sheet.setRowGroupControlPosition(SpreadsheetApp.GroupControlTogglePosition.BEFORE);

  layout.dayGroups.forEach(function (group) {
    var count = group.lastRow - group.firstRow + 1;
    sheet.getRange(group.firstRow + 1, 1, count, 1).shiftRowGroupDepth(1);
  });

  collapseEveryRowGroup(sheet, layout.dayGroups);

  SpreadsheetApp.flush();
}


function removeAllRowGroups(sheet) {
  /* shiftRowGroupDepth(-1) on the whole sheet flattens whatever is there.
     Repeated because deeply nested groups need more than one pass, and
     wrapped because it throws when there is nothing left to remove. */
  for (var pass = 0; pass < 5; pass++) {
    try {
      var rows = sheet.getMaxRows();
      sheet.getRange(1, 1, rows, 1).shiftRowGroupDepth(-1);
    } catch (ignored) {
      return;
    }
  }
}


function collapseEveryRowGroup(sheet, groups) {
  groups.forEach(function (group) {
    try {
      sheet.getRowGroup(group.firstRow + 1, 1).collapse();
    } catch (ignored) {
      /* A group that will not collapse is not worth failing the rebuild for. */
    }
  });
}


/* ============================================================
   THE RAW SHIFTS TAB
   ============================================================ */

function sheetNamed(name, headers) {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(name);

  if (!sheet) sheet = book.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  } else if (sheet.getLastColumn() < headers.length) {
    /* An older version of this script made a narrower sheet. Widen the
       header row; existing rows keep their blanks until the timesheet
       sends its history again. */
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }

  return sheet;
}


function upsertShift(row) {
  var sheet = sheetNamed(SHIFTS_SHEET, SHIFT_HEADERS);

  var values = [
    row.punchId,
    row.employeeName || '',
    row.employeeId || '',
    row.inAt ? formatDateWithWeekday(new Date(row.inAt)) : '',
    row.inLocal || '',
    row.outLocal || '',
    row.hours === '' || row.hours === null || row.hours === undefined ? '' : row.hours,
    row.outAt ? 'Complete' : 'Still clocked in',
    row.device || '',
    row.inAt || '',
    row.outAt || '',
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

  var ids = sheet.getRange(2, COL_PUNCH_ID, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(punchId)) return i + 2;
  }
  return -1;
}


function readShiftRecords() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHIFTS_SHEET);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var width = Math.max(sheet.getLastColumn(), SHIFT_HEADERS.length);
  var rows = sheet.getRange(2, 1, lastRow - 1, width).getValues();
  var records = [];

  rows.forEach(function (cells) {
    var punchId = cells[COL_PUNCH_ID - 1];
    if (!punchId) return;

    var inAt = Number(cells[COL_IN_MS - 1]) || null;
    var outAt = Number(cells[COL_OUT_MS - 1]) || null;

    /* Rows written by the first version of this script have no millisecond
       columns, so fall back to reading the text that is there. */
    if (!inAt) inAt = parseStoredMoment(cells[COL_IN_TEXT - 1]);
    if (!outAt) outAt = parseStoredMoment(cells[COL_OUT_TEXT - 1]);

    if (!inAt) return;

    records.push({
      punchId: String(punchId),
      employeeName: String(cells[COL_EMPLOYEE - 1] || ''),
      employeeId: String(cells[COL_EMPLOYEE_ID - 1] || ''),
      inAt: inAt,
      outAt: outAt
    });
  });

  return records;
}


/** Reads back "Mon 08/24/2026  8:00 AM", or a real Date if the cell holds one. */
function parseStoredMoment(cell) {
  if (!cell) return null;
  if (cell instanceof Date) return cell.getTime();

  var text = String(cell).trim();
  var match = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!match) return null;

  var hour = Number(match[4]) % 12;
  if (/PM/i.test(match[6])) hour += 12;

  return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]),
                  hour, Number(match[5]), 0, 0).getTime();
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
