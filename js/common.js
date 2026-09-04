/* ============================================================
   common.js  --  shared helpers used by every page
   ============================================================ */

var TS = (function () {

  /* Payroll week starts on Sunday. Change to 1 for a Monday week. */
  var WEEK_STARTS_ON = 0;

  /* A shift longer than this is almost certainly a missed clock-out,
     so reports mark it for the boss to look at. */
  var LONG_SHIFT_HOURS = 16;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- time formatting ---------- */

  function fmtTime(ms) {            // 8:02 AM
    var d = new Date(ms);
    var h = d.getHours();
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ':' + pad(d.getMinutes()) + ' ' + ap;
  }

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmtDate(ms) {            // Tue 09/02/2026
    var d = new Date(ms);
    return DAY_NAMES[d.getDay()] + ' ' + pad(d.getMonth() + 1) + '/' +
           pad(d.getDate()) + '/' + d.getFullYear();
  }

  function fmtDateTime(ms) { return fmtDate(ms) + '  ' + fmtTime(ms); }

  /* Hours are decimal so payroll can multiply straight by the rate:
     7 hours 45 minutes is 7.75. */
  function fmtHours(ms) { return (ms / 3600000).toFixed(2); }

  /* Elapsed time of a punch. An open shift is measured up to now. */
  function punchMs(p, nowMs) {
    var end = p.outAt || (nowMs || Date.now());
    var ms = end - p.inAt;
    return ms > 0 ? ms : 0;
  }

  function isLongShift(p) {
    return punchMs(p) > LONG_SHIFT_HOURS * 3600000;
  }

  /* ---------- date arithmetic (all local time) ---------- */

  function dayKey(ms) {             // 2026-09-02, used to group by day
    var d = new Date(ms);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function inputValue(ms) { return dayKey(ms); }   // for <input type="date">

  /* A date field normally hands back '2026-09-02'. An older browser with no
     date picker hands back whatever was typed, so accept '09/02/2026' too.
     Anything we cannot make sense of returns null rather than a silent
     Invalid Date that would poison every comparison downstream. */
  function parseDateParts(dateStr) {
    var text = String(dateStr === null || dateStr === undefined ? '' : dateStr).trim();
    if (!text) return null;

    var iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);

    var y, m, d;
    if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
    else if (us) { y = +us[3]; m = +us[1]; d = +us[2]; }
    else return null;

    if (m < 1 || m > 12 || d < 1 || d > 31) return null;

    var probe = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
      return null;                  // rejects 02/31 and friends
    }
    return { y: y, m: m, d: d };
  }

  function startOfDay(dateStr) {    // '2026-09-02' -> ms at 00:00:00.000
    var p = parseDateParts(dateStr);
    return p === null ? null : new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0).getTime();
  }

  function endOfDay(dateStr) {      // '2026-09-02' -> ms at 23:59:59.999
    var p = parseDateParts(dateStr);
    return p === null ? null : new Date(p.y, p.m - 1, p.d, 23, 59, 59, 999).getTime();
  }

  function addDays(ms, n) {
    var d = new Date(ms);
    d.setDate(d.getDate() + n);
    return d.getTime();
  }

  function startOfWeek(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    var back = (d.getDay() - WEEK_STARTS_ON + 7) % 7;
    d.setDate(d.getDate() - back);
    return d.getTime();
  }

  function startOfMonth(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).getTime();
  }

  /* ---------- page furniture ---------- */

  function el(sel, root) { return (root || document).querySelector(sel); }
  function els(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
  }

  /* Live clock in the top bar. */
  function startTopClock() {
    var node = el('#topClock');
    if (!node) return;
    function tick() { node.textContent = fmtDateTime(Date.now()); }
    tick();
    setInterval(tick, 1000);
  }

  function showError(msg) {
    var node = el('#msg');
    if (!node) { alert(msg); return; }
    node.className = 'notice notice-error';
    node.textContent = msg;
    node.style.display = 'block';
  }

  function showOk(msg) {
    var node = el('#msg');
    if (!node) return;
    node.className = 'notice notice-ok';
    node.textContent = msg;
    node.style.display = 'block';
    setTimeout(function () { node.style.display = 'none'; }, 4000);
  }

  function clearMsg() {
    var node = el('#msg');
    if (node) node.style.display = 'none';
  }

  return {
    WEEK_STARTS_ON: WEEK_STARTS_ON,
    LONG_SHIFT_HOURS: LONG_SHIFT_HOURS,
    pad: pad, esc: esc,
    fmtTime: fmtTime, fmtDate: fmtDate, fmtDateTime: fmtDateTime,
    fmtHours: fmtHours, punchMs: punchMs, isLongShift: isLongShift,
    dayKey: dayKey, inputValue: inputValue,
    parseDateParts: parseDateParts,
    startOfDay: startOfDay, endOfDay: endOfDay, addDays: addDays,
    startOfWeek: startOfWeek, startOfMonth: startOfMonth,
    el: el, els: els, param: param,
    startTopClock: startTopClock,
    showError: showError, showOk: showOk, clearMsg: clearMsg
  };
})();


/* ============================================================
   auth.js portion -- admin passcode handling

   Be clear-eyed about this: on a static site the check runs in the
   browser, so anyone who knows how to open developer tools can get
   past it. It keeps honest people out of the reports; it is not
   real security. The passcode itself is never stored -- only a hash.
   ============================================================ */

var Auth = (function () {

  var SESSION_KEY = 'timesheet.adminSession';

  function canUseCrypto() {
    return !!(window.crypto && window.crypto.subtle && window.isSecureContext);
  }

  function sha256(text) {
    var bytes = new TextEncoder().encode('timesheet:' + text);
    return window.crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  /* Used only when the page is opened straight off the disk, where the
     browser will not give us the real crypto API. */
  function weakHash(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) {
      h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    }
    return Promise.resolve(h.toString(16));
  }

  function hashWith(algo, text) {
    return algo === 'sha256' ? sha256(text) : weakHash(text);
  }

  function makeRecord(passcode) {
    var algo = canUseCrypto() ? 'sha256' : 'weak';
    return hashWith(algo, passcode).then(function (hash) {
      return { algo: algo, hash: hash };
    });
  }

  function verify(record, passcode) {
    if (!record) return Promise.resolve(false);
    if (record.algo === 'sha256' && !canUseCrypto()) return Promise.resolve(false);
    return hashWith(record.algo, passcode).then(function (hash) {
      return hash === record.hash;
    });
  }

  function isSignedIn() {
    try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; }
  }

  function signIn() {
    try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
  }

  function signOut() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  /* Recovery code, for the day somebody forgets the passcode. Letters and
     digits that cannot be mistaken for each other -- no O/0, no I/1/L. */
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function newRecoveryCode() {
    var length = 16;
    var picks = new Array(length);
    var i;

    if (window.crypto && window.crypto.getRandomValues) {
      var bytes = new Uint8Array(length);
      window.crypto.getRandomValues(bytes);
      for (i = 0; i < length; i++) picks[i] = CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    } else {
      for (i = 0; i < length; i++) {
        picks[i] = CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
    }

    /* Grouped as ABCD-EFGH-JKMN-PQRS so it can be read off paper. */
    return picks.join('').replace(/(.{4})(?=.)/g, '$1-');
  }

  /* Accept the code however it gets typed back in: lower case, spaces,
     missing dashes. */
  function normalizeCode(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  return {
    makeRecord: makeRecord, verify: verify,
    newRecoveryCode: newRecoveryCode, normalizeCode: normalizeCode,
    isSignedIn: isSignedIn, signIn: signIn, signOut: signOut
  };
})();
