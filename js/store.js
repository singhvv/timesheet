/* ============================================================
   store.js  --  DATA LAYER

   This is the ONLY file that knows where data is kept. Today
   everything lives in this browser's localStorage, which is why
   the timesheet must run on one shared device.

   To move to a cloud database later (Firebase, Supabase, etc.)
   rewrite the functions in this file and nothing else. Every
   function already returns a Promise, so the rest of the app
   will not care that a network call was added.

   Shape of the saved data:
     {
       version:   1,
       employees: [ { id, name, active, createdAt } ],
       punches:   [ { id, employeeId, inAt, outAt } ],   // ms since epoch
       adminPass: { algo, hash } | null
     }
   An open shift (clocked in, not yet out) has outAt === null.
   ============================================================ */

var Store = (function () {
  var KEY = 'timesheet.v1';

  function blankData() {
    return { version: 1, employees: [], punches: [], adminPass: null };
  }

  function load() {
    var data = null;
    try {
      data = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {
      data = null;
    }
    if (!data || typeof data !== 'object') data = blankData();
    if (!Array.isArray(data.employees)) data.employees = [];
    if (!Array.isArray(data.punches)) data.punches = [];
    if (data.adminPass === undefined) data.adminPass = null;
    return data;
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      alert('Could not save. The browser storage may be full or disabled.\n\n' + e.message);
      throw e;
    }
  }

  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function ok(value) { return Promise.resolve(value); }
  function fail(msg) { return Promise.reject(new Error(msg)); }

  function findOpen(data, employeeId) {
    for (var i = 0; i < data.punches.length; i++) {
      var p = data.punches[i];
      if (p.employeeId === employeeId && !p.outAt) return p;
    }
    return null;
  }

  return {

    /* ---------- employees ---------- */

    listEmployees: function (includeArchived) {
      var data = load();
      var list = data.employees.filter(function (e) {
        return includeArchived ? true : e.active;
      });
      list.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return ok(list);
    },

    getEmployee: function (id) {
      var data = load();
      var found = data.employees.filter(function (e) { return e.id === id; })[0];
      return ok(found || null);
    },

    addEmployee: function (name) {
      var data = load();
      name = String(name || '').trim();
      if (!name) return fail('Enter an employee name.');
      if (name.length > 60) return fail('That name is too long.');
      var clash = data.employees.some(function (e) {
        return e.active && e.name.toLowerCase() === name.toLowerCase();
      });
      if (clash) return fail('There is already an active employee named "' + name + '".');
      var emp = { id: newId(), name: name, active: true, createdAt: Date.now() };
      data.employees.push(emp);
      save(data);
      return ok(emp);
    },

    renameEmployee: function (id, name) {
      var data = load();
      name = String(name || '').trim();
      if (!name) return fail('Enter an employee name.');
      var emp = data.employees.filter(function (e) { return e.id === id; })[0];
      if (!emp) return fail('That employee no longer exists.');
      var clash = data.employees.some(function (e) {
        return e.id !== id && e.active && e.name.toLowerCase() === name.toLowerCase();
      });
      if (clash) return fail('There is already an active employee named "' + name + '".');
      emp.name = name;
      save(data);
      return ok(emp);
    },

    /* Archiving hides an employee from the home page but keeps every
       punch they ever made, so past pay periods still report correctly. */
    setArchived: function (id, archived) {
      var data = load();
      var emp = data.employees.filter(function (e) { return e.id === id; })[0];
      if (!emp) return fail('That employee no longer exists.');
      if (archived) {
        var open = findOpen(data, id);
        if (open) open.outAt = Date.now();   // never leave a shift hanging
      }
      emp.active = !archived;
      save(data);
      return ok(emp);
    },

    /* ---------- clock in / clock out ---------- */

    getOpenPunch: function (employeeId) {
      return ok(findOpen(load(), employeeId));
    },

    clockIn: function (employeeId) {
      var data = load();
      if (findOpen(data, employeeId)) return fail('That employee is already clocked in.');
      var punch = { id: newId(), employeeId: employeeId, inAt: Date.now(), outAt: null };
      data.punches.push(punch);
      save(data);
      return ok(punch);
    },

    clockOut: function (employeeId) {
      var data = load();
      var open = findOpen(data, employeeId);
      if (!open) return fail('That employee is not clocked in.');
      open.outAt = Date.now();
      save(data);
      return ok(open);
    },

    /* employeeId may be null for "everyone". fromMs / toMs filter on the
       clock-IN time, so an overnight shift counts on the day it started. */
    listPunches: function (employeeId, fromMs, toMs) {
      var data = load();
      var list = data.punches.filter(function (p) {
        if (employeeId && p.employeeId !== employeeId) return false;
        if (typeof fromMs === 'number' && p.inAt < fromMs) return false;
        if (typeof toMs === 'number' && p.inAt > toMs) return false;
        return true;
      });
      list.sort(function (a, b) { return a.inAt - b.inAt; });
      return ok(list);
    },

    /* ---------- admin passcode ---------- */

    getAdminPass: function () { return ok(load().adminPass); },

    setAdminPass: function (record) {
      var data = load();
      data.adminPass = record;
      save(data);
      return ok(true);
    },

    /* ---------- backup ---------- */

    exportAll: function () { return ok(load()); },

    importAll: function (incoming) {
      if (!incoming || typeof incoming !== 'object' ||
          !Array.isArray(incoming.employees) || !Array.isArray(incoming.punches)) {
        return fail('That file is not a timesheet backup.');
      }
      var data = blankData();
      data.employees = incoming.employees;
      data.punches = incoming.punches;
      data.adminPass = incoming.adminPass || null;
      save(data);
      return ok(true);
    }
  };
})();
