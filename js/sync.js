/* ============================================================
   sync.js  --  uploads every punch to a Google Sheet

   How it works:

     1. Somebody clocks in or out. store.js saves it to this browser
        first -- that always succeeds, even with no internet.
     2. store.js hands the punch to onPunchChanged() below, which puts
        it on a queue and tries to upload it.
     3. If the upload fails (no internet, laptop asleep, Google having
        a bad day) the punch stays on the queue and is retried on the
        next punch, on the next page load, and once a minute after that.

   Nothing here can stop somebody clocking in. The worst case is a
   backlog that clears itself later, and the admin page shows the count.

   The Google Sheets address is entered on the admin page and kept in
   this browser only. It is deliberately NOT part of the source code, so
   publishing this repository does not publish a way to write to the sheet.
   ============================================================ */

var Sync = (function () {

  var SETTINGS_KEY = 'timesheet.sync';
  var QUEUE_KEY = 'timesheet.syncQueue';
  var RETRY_EVERY_MS = 60000;
  var REQUEST_TIMEOUT_MS = 15000;
  var MAX_QUEUE = 5000;

  var flushing = false;
  var timer = null;

  /* ---------- settings ---------- */

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function settings() {
    var s = readJson(SETTINGS_KEY, {});
    return {
      url: typeof s.url === 'string' ? s.url : '',
      device: typeof s.device === 'string' ? s.device : '',
      lastOkAt: typeof s.lastOkAt === 'number' ? s.lastOkAt : null,
      lastError: typeof s.lastError === 'string' ? s.lastError : ''
    };
  }

  function patchSettings(changes) {
    var next = settings();
    for (var k in changes) {
      if (Object.prototype.hasOwnProperty.call(changes, k)) next[k] = changes[k];
    }
    writeJson(SETTINGS_KEY, next);
    return next;
  }

  var APPS_SCRIPT_SHAPE = /^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec$/;

  function isConfigured() {
    return /^https?:\/\/\S+$/.test(settings().url);
  }

  /* Pasting the Apps Script *editor* address instead of the deployed web app
     address is the single most common setup mistake, so the panel warns about
     anything that does not have the deployed shape. It is only a warning --
     a working address in some other form is still allowed. */
  function looksLikeAppsScript() {
    return APPS_SCRIPT_SHAPE.test(settings().url);
  }

  /* ---------- queue ---------- */

  function queue() {
    var q = readJson(QUEUE_KEY, []);
    return Array.isArray(q) ? q : [];
  }

  function setQueue(items) {
    /* If the queue ever runs away, keep the newest entries. The Sheet is a
       convenience copy; this browser still holds the authoritative record. */
    if (items.length > MAX_QUEUE) items = items.slice(items.length - MAX_QUEUE);
    writeJson(QUEUE_KEY, items);
  }

  /* One row per punch, keyed by the punch id so a retry overwrites rather
     than duplicating. Clock-in writes the row; clock-out fills in the rest. */
  function rowFor(punch, employeeName, bulk) {
    var hours = punch.outAt ? (punch.outAt - punch.inAt) / 3600000 : 0;
    return {
      /* A bulk row tells the script to skip rebuilding the Timesheet tab.
         Rebuilding it once per row would turn a history re-send into
         hundreds of full sheet rewrites. One rebuild is sent at the end. */
      bulk: bulk ? true : undefined,
      punchId: punch.id,
      employeeId: punch.employeeId,
      employeeName: employeeName || '',
      action: punch.outAt ? 'out' : 'in',
      inAt: punch.inAt,
      inLocal: TS.fmtDateTime(punch.inAt),
      outAt: punch.outAt || '',
      outLocal: punch.outAt ? TS.fmtDateTime(punch.outAt) : '',
      hours: punch.outAt ? Math.round(hours * 100) / 100 : '',
      device: settings().device || 'unnamed device',
      sentAt: Date.now()
    };
  }

  function enqueueRow(row) {
    var items = queue();
    /* A punch already waiting is replaced, not stacked -- the newest state
       of that punch is the only one worth sending. */
    var replaced = false;
    for (var i = 0; i < items.length; i++) {
      if (items[i].punchId === row.punchId) { items[i] = row; replaced = true; break; }
    }
    if (!replaced) items.push(row);
    setQueue(items);
  }

  /* ---------- uploading ---------- */

  /* text/plain keeps this a "simple" cross-origin request, so the browser
     does not send a preflight that Apps Script would not answer. */
  function postRow(url, row) {
    var controller = null;
    var timeoutId = null;
    var options = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(row),
      redirect: 'follow'
    };

    if (typeof AbortController !== 'undefined') {
      controller = new AbortController();
      options.signal = controller.signal;
      timeoutId = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    }

    return fetch(url, options).then(function (response) {
      if (timeoutId) clearTimeout(timeoutId);
      if (!response.ok) throw new Error('Google replied with status ' + response.status);
      return response.text();
    }).then(function (text) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        /* Almost always the Apps Script sign-in page, which means the web
           app was not deployed with access set to "Anyone". */
        throw new Error('Google returned a page instead of a result. Check that the ' +
                        'web app is deployed with access set to "Anyone".');
      }
      if (!parsed || parsed.ok !== true) {
        throw new Error(parsed && parsed.error ? String(parsed.error) : 'The script reported a failure.');
      }
      return parsed;
    }).catch(function (err) {
      if (timeoutId) clearTimeout(timeoutId);
      if (err && err.name === 'AbortError') throw new Error('Timed out reaching Google.');
      throw err;
    });
  }

  function flush() {
    if (flushing) return Promise.resolve({ skipped: 'already running' });
    if (!isConfigured()) return Promise.resolve({ skipped: 'not configured' });

    var items = queue();
    if (!items.length) return Promise.resolve({ sent: 0, pending: 0 });

    flushing = true;
    var url = settings().url;
    var sent = 0;

    function step() {
      var current = queue();
      if (!current.length) return Promise.resolve();

      return postRow(url, current[0]).then(function () {
        /* Re-read the queue: a punch may have landed while we were waiting. */
        var latest = queue();
        var head = current[0];
        for (var i = 0; i < latest.length; i++) {
          if (latest[i].punchId === head.punchId && latest[i].sentAt === head.sentAt) {
            latest.splice(i, 1);
            break;
          }
        }
        setQueue(latest);
        sent++;
        patchSettings({ lastOkAt: Date.now(), lastError: '' });
        return step();
      });
    }

    return step().then(function () {
      flushing = false;
      return { sent: sent, pending: queue().length };
    }).catch(function (err) {
      flushing = false;
      patchSettings({ lastError: err.message || String(err) });
      return { sent: sent, pending: queue().length, error: err.message || String(err) };
    });
  }

  /* ---------- what store.js calls ---------- */

  function onPunchChanged(punch) {
    if (!punch) return;
    Store.getEmployee(punch.employeeId).then(function (emp) {
      enqueueRow(rowFor(punch, emp ? emp.name : ''));
      if (isConfigured()) flush();
    });
  }

  /* Re-queues every punch on record. Used when first connecting a sheet, or
     after restoring a backup onto a replacement machine. */
  function sendAllHistory() {
    return Promise.all([
      Store.listEmployees(true),
      Store.listPunches(null, null, null)
    ]).then(function (results) {
      var names = {};
      results[0].forEach(function (e) { names[e.id] = e.name; });
      results[1].forEach(function (p) { enqueueRow(rowFor(p, names[p.employeeId], true)); });
      return flush();
    }).then(function (result) {
      /* Best effort: if this does not get through, the next punch rebuilds
         the sheet anyway, and there is a Rebuild now item on the sheet's
         own Timesheet menu. */
      return requestRebuild().then(function () { return result; },
                                   function () { return result; });
    });
  }

  /* Asks the script to redraw the Timesheet tab from the Shifts tab. */
  function requestRebuild() {
    if (!isConfigured()) return Promise.reject(new Error('Not connected.'));
    return postRow(settings().url, { action: 'rebuild', sentAt: Date.now() });
  }

  function test() {
    var s = settings();
    if (!isConfigured()) {
      return Promise.reject(new Error('Enter the web app address first. It should start ' +
                                      'with https://script.google.com/macros/s/ and end with /exec'));
    }
    return postRow(s.url, {
      punchId: 'connection-test',
      employeeName: 'Connection test',
      action: 'test',
      device: s.device || 'unnamed device',
      sentAt: Date.now()
    });
  }

  function status() {
    var s = settings();
    return {
      configured: isConfigured(),
      looksRight: looksLikeAppsScript(),
      url: s.url,
      device: s.device,
      pending: queue().length,
      lastOkAt: s.lastOkAt,
      lastError: s.lastError
    };
  }

  function save(url, device) {
    url = String(url || '').trim();
    device = String(device || '').trim();

    if (url && !/^https?:\/\/\S+$/.test(url)) {
      return Promise.reject(new Error('That is not a web address. Paste the whole thing, ' +
                                      'starting with https://'));
    }
    patchSettings({ url: url, device: device, lastError: '' });
    return Promise.resolve(status());
  }

  function startRetryLoop() {
    if (timer) return;
    timer = setInterval(function () {
      if (isConfigured() && queue().length) flush();
    }, RETRY_EVERY_MS);

    /* Clear the backlog as soon as the machine is back online. */
    window.addEventListener('online', function () {
      if (isConfigured() && queue().length) flush();
    });

    if (isConfigured() && queue().length) flush();
  }

  return {
    onPunchChanged: onPunchChanged,
    flush: flush,
    sendAllHistory: sendAllHistory,
    requestRebuild: requestRebuild,
    test: test,
    status: status,
    save: save,
    startRetryLoop: startRetryLoop
  };
})();
