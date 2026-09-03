/* ============================================================
   admin.js  --  sign in, employee list, hours reports, backup
   ============================================================ */

(function () {

  var content = TS.el('#content');

  /* ------------------------------------------------------------
     Which screen do we show?
     ------------------------------------------------------------ */

  function start() {
    Store.getAdminPass().then(function (record) {
      if (!record) return drawCreatePasscode();
      if (!Auth.isSignedIn()) return drawSignIn();
      return drawDashboard();
    });
  }

  /* ------------------------------------------------------------
     First run: choose a passcode
     ------------------------------------------------------------ */

  function drawCreatePasscode() {
    TS.el('#page').className = 'wrap narrow';
    content.innerHTML =
      '<h1>Set Up Admin Access</h1>' +
      '<div class="panel"><div class="panel-body">' +
        '<p style="margin-top:0">No admin passcode has been set on this device yet. ' +
        'Choose one now. It is needed to add employees and run hour reports.</p>' +
        '<label for="p1">Passcode</label>' +
        '<input type="password" id="p1" style="width:100%" autocomplete="new-password">' +
        '<div class="spacer"></div>' +
        '<label for="p2">Confirm passcode</label>' +
        '<input type="password" id="p2" style="width:100%" autocomplete="new-password">' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="save">Save Passcode</button>' +
        '<p class="hint">This passcode keeps employees out of the reports. It is not ' +
        'strong security &ndash; anyone who knows their way around a web browser can ' +
        'get past it. Do not reuse a password that matters.</p>' +
      '</div></div>';

    TS.el('#save').addEventListener('click', function () {
      var a = TS.el('#p1').value, b = TS.el('#p2').value;
      TS.clearMsg();
      if (a.length < 4) return TS.showError('Use at least 4 characters.');
      if (a !== b) return TS.showError('The two passcodes do not match.');
      Auth.makeRecord(a).then(function (record) {
        return Store.setAdminPass(record);
      }).then(function () {
        Auth.signIn();
        drawDashboard();
      });
    });
  }

  /* ------------------------------------------------------------
     Sign in
     ------------------------------------------------------------ */

  function drawSignIn() {
    TS.el('#page').className = 'wrap narrow';
    content.innerHTML =
      '<h1>Admin Sign In</h1>' +
      '<div class="panel"><div class="panel-body">' +
        '<label for="pass">Passcode</label>' +
        '<input type="password" id="pass" style="width:100%" autocomplete="current-password">' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="go">Sign In</button>' +
      '</div></div>';

    function attempt() {
      TS.clearMsg();
      var typed = TS.el('#pass').value;
      Store.getAdminPass().then(function (record) {
        return Auth.verify(record, typed);
      }).then(function (good) {
        if (!good) {
          TS.showError('That passcode is not correct.');
          TS.el('#pass').value = '';
          TS.el('#pass').focus();
          return;
        }
        Auth.signIn();
        drawDashboard();
      });
    }

    TS.el('#go').addEventListener('click', attempt);
    TS.el('#pass').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') attempt();
    });
    TS.el('#pass').focus();
  }

  /* ------------------------------------------------------------
     The dashboard
     ------------------------------------------------------------ */

  function drawDashboard() {
    TS.el('#page').className = 'wrap';
    TS.el('#signOut').style.display = '';

    content.innerHTML =
      '<h1>Administration</h1>' +

      '<div class="panel"><h2>Hours Report</h2><div class="panel-body">' +
        '<div class="row">' +
          '<div><label for="from">From</label><input type="date" id="from"></div>' +
          '<div><label for="to">To</label><input type="date" id="to"></div>' +
          '<div><button class="btn btn-primary" id="run">Run Report</button></div>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<div class="row">' +
          '<button class="btn btn-small" data-range="thisweek">This Week</button>' +
          '<button class="btn btn-small" data-range="lastweek">Last Week</button>' +
          '<button class="btn btn-small" data-range="thismonth">This Month</button>' +
          '<button class="btn btn-small" data-range="last30">Last 30 Days</button>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<div id="report"></div>' +
      '</div></div>' +

      '<div class="panel"><h2>Employees</h2><div class="panel-body">' +
        '<div class="row">' +
          '<div class="grow"><label for="newName">Add an employee</label>' +
            '<input type="text" id="newName" style="width:100%" placeholder="Full name"></div>' +
          '<div><button class="btn btn-primary" id="add">Add</button></div>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<div id="empList"></div>' +
      '</div></div>' +

      '<div class="panel"><h2>Backup</h2><div class="panel-body">' +
        '<p style="margin-top:0">All hours are stored inside this browser on this ' +
        'device. Clearing browsing data, resetting the machine, or switching browsers ' +
        'will lose them. Download a backup regularly &ndash; at least every pay period.</p>' +
        '<div class="row">' +
          '<button class="btn btn-primary" id="download">Download Backup</button>' +
          '<button class="btn" id="restore">Restore From Backup</button>' +
          '<input type="file" id="restoreFile" accept="application/json,.json" style="display:none">' +
        '</div>' +
      '</div></div>' +

      '<div class="panel"><h2>Passcode</h2><div class="panel-body">' +
        '<div class="row">' +
          '<div><label for="oldPass">Current</label><input type="password" id="oldPass"></div>' +
          '<div><label for="newPass">New</label><input type="password" id="newPass"></div>' +
          '<div><button class="btn" id="changePass">Change Passcode</button></div>' +
        '</div>' +
      '</div></div>';

    /* default the report to the current week */
    var weekStart = TS.startOfWeek(Date.now());
    TS.el('#from').value = TS.inputValue(weekStart);
    TS.el('#to').value = TS.inputValue(Date.now());

    TS.el('#run').addEventListener('click', runReport);
    TS.el('#add').addEventListener('click', addEmployee);
    TS.el('#newName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') addEmployee();
    });
    TS.el('#download').addEventListener('click', downloadBackup);
    TS.el('#restore').addEventListener('click', function () {
      TS.el('#restoreFile').click();
    });
    TS.el('#restoreFile').addEventListener('change', restoreBackup);
    TS.el('#changePass').addEventListener('click', changePasscode);

    TS.els('[data-range]').forEach(function (button) {
      button.addEventListener('click', function () {
        applyQuickRange(button.getAttribute('data-range'));
        runReport();
      });
    });

    drawEmployeeList();
    runReport();
  }

  function applyQuickRange(which) {
    var now = Date.now();
    var from = now, to = now;
    if (which === 'thisweek') {
      from = TS.startOfWeek(now);
    } else if (which === 'lastweek') {
      from = TS.addDays(TS.startOfWeek(now), -7);
      to = TS.addDays(TS.startOfWeek(now), -1);
    } else if (which === 'thismonth') {
      from = TS.startOfMonth(now);
    } else if (which === 'last30') {
      from = TS.addDays(now, -29);
    }
    TS.el('#from').value = TS.inputValue(from);
    TS.el('#to').value = TS.inputValue(to);
  }

  /* ------------------------------------------------------------
     Employee management
     ------------------------------------------------------------ */

  function drawEmployeeList() {
    Store.listEmployees(true).then(function (employees) {
      var target = TS.el('#empList');

      if (!employees.length) {
        target.innerHTML = '<p class="muted" style="margin:0">No employees yet. ' +
                           'Add the first one above.</p>';
        return;
      }

      var active = employees.filter(function (e) { return e.active; });
      var archived = employees.filter(function (e) { return !e.active; });
      var ordered = active.concat(archived);

      var rows = ordered.map(function (emp) {
        return '<tr>' +
                 '<td>' + TS.esc(emp.name) + '</td>' +
                 '<td>' + (emp.active
                     ? 'Active'
                     : '<span class="muted">Archived</span>') + '</td>' +
                 '<td>' +
                   '<button class="btn btn-small" data-act="rename" data-id="' +
                     TS.esc(emp.id) + '">Rename</button> ' +
                   '<button class="btn btn-small" data-act="' +
                     (emp.active ? 'archive' : 'restore') + '" data-id="' +
                     TS.esc(emp.id) + '">' +
                     (emp.active ? 'Archive' : 'Restore') + '</button>' +
                 '</td>' +
               '</tr>';
      }).join('');

      target.innerHTML =
        '<div class="table-scroll"><table>' +
          '<thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table></div>' +
        '<p class="hint">Archiving takes someone off the home page but keeps every hour ' +
        'they worked, so past pay periods still report correctly. If they are on the ' +
        'clock when you archive them, they are clocked out at that moment.</p>';

      TS.els('#empList [data-act]').forEach(function (button) {
        button.addEventListener('click', function () {
          onEmployeeAction(button.getAttribute('data-act'), button.getAttribute('data-id'));
        });
      });
    });
  }

  function onEmployeeAction(action, id) {
    TS.clearMsg();

    if (action === 'rename') {
      Store.getEmployee(id).then(function (emp) {
        if (!emp) return;
        var name = window.prompt('New name for ' + emp.name + ':', emp.name);
        if (name === null) return;
        Store.renameEmployee(id, name).then(function () {
          TS.showOk('Name updated.');
          drawEmployeeList();
          runReport();
        }).catch(function (err) { TS.showError(err.message); });
      });
      return;
    }

    var archiving = action === 'archive';
    Store.getEmployee(id).then(function (emp) {
      if (!emp) return;
      if (archiving && !window.confirm(
            'Archive ' + emp.name + '?\n\nThey come off the home page but their hours ' +
            'stay in the reports.')) {
        return;
      }
      Store.setArchived(id, archiving).then(function () {
        TS.showOk(archiving ? emp.name + ' archived.' : emp.name + ' restored.');
        drawEmployeeList();
        runReport();
      }).catch(function (err) { TS.showError(err.message); });
    });
  }

  function addEmployee() {
    TS.clearMsg();
    var field = TS.el('#newName');
    Store.addEmployee(field.value).then(function (emp) {
      field.value = '';
      field.focus();
      TS.showOk(emp.name + ' added.');
      drawEmployeeList();
      runReport();
    }).catch(function (err) { TS.showError(err.message); });
  }

  /* ------------------------------------------------------------
     Hours report
     ------------------------------------------------------------ */

  function runReport() {
    var fromStr = TS.el('#from').value;
    var toStr = TS.el('#to').value;
    var target = TS.el('#report');

    if (!fromStr || !toStr) {
      target.innerHTML = '<p class="muted">Choose a start and end date.</p>';
      return;
    }

    var fromMs = TS.startOfDay(fromStr);
    var toMs = TS.endOfDay(toStr);

    if (fromMs > toMs) {
      target.innerHTML = '<div class="notice notice-warn">The start date is after the ' +
                         'end date.</div>';
      return;
    }

    Promise.all([
      Store.listEmployees(true),
      Store.listPunches(null, fromMs, toMs)
    ]).then(function (results) {
      drawReport(target, results[0], results[1], fromMs, toMs);
    });
  }

  function drawReport(target, employees, punches, fromMs, toMs) {

    var byEmployee = {};
    punches.forEach(function (p) {
      (byEmployee[p.employeeId] = byEmployee[p.employeeId] || []).push(p);
    });

    /* Everyone currently on the payroll, plus anyone archived who still
       worked hours inside this date range. */
    var listed = employees.filter(function (emp) {
      return emp.active || byEmployee[emp.id];
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });

    if (!listed.length) {
      target.innerHTML = '<p class="muted">No employees to report on.</p>';
      return;
    }

    var grandMs = 0, openCount = 0, longCount = 0;
    var bodyRows = '';

    listed.forEach(function (emp) {
      var mine = byEmployee[emp.id] || [];
      var totalMs = 0;
      var days = {};

      mine.forEach(function (p) {
        var key = TS.dayKey(p.inAt);
        var day = days[key] || (days[key] = { key: key, at: p.inAt, ms: 0, punches: [] });
        day.punches.push(p);
        if (p.outAt) {
          var ms = TS.punchMs(p);
          day.ms += ms;
          totalMs += ms;
          if (TS.isLongShift(p)) longCount++;
        } else {
          openCount++;
        }
      });

      grandMs += totalMs;

      var dayList = Object.keys(days).map(function (k) { return days[k]; })
                    .sort(function (a, b) { return a.at - b.at; });

      var worked = dayList.filter(function (d) { return d.ms > 0; }).length;

      bodyRows +=
        '<tr>' +
          '<td>' + TS.esc(emp.name) +
            (emp.active ? '' : ' <span class="muted">(archived)</span>') + '</td>' +
          '<td class="num">' + worked + '</td>' +
          '<td class="num">' + TS.fmtHours(totalMs) + '</td>' +
          '<td>' + (dayList.length
              ? '<button class="btn btn-small" data-days="' + TS.esc(emp.id) + '">Show days</button>'
              : '<span class="muted">&ndash;</span>') + '</td>' +
        '</tr>';

      if (dayList.length) {
        bodyRows +=
          '<tr class="detail" id="detail-' + TS.esc(emp.id) + '" style="display:none">' +
            '<td class="detail-cell" colspan="4">' + dayTable(dayList) + '</td>' +
          '</tr>';
      }
    });

    var warnings = '';
    if (openCount) {
      warnings += '<div class="notice notice-warn">' + openCount + ' shift' +
                  (openCount === 1 ? ' has' : 's have') + ' no clock-out yet. ' +
                  'Those hours are not counted in the totals below.</div>';
    }
    if (longCount) {
      warnings += '<div class="notice notice-warn">' + longCount + ' shift' +
                  (longCount === 1 ? ' is' : 's are') + ' longer than ' +
                  TS.LONG_SHIFT_HOURS + ' hours, marked with an asterisk. ' +
                  'Check for a missed clock-out before running payroll.</div>';
    }

    target.innerHTML =
      warnings +
      '<p class="hint" style="margin-top:0">' +
        TS.esc(TS.fmtDate(fromMs)) + ' through ' + TS.esc(TS.fmtDate(toMs)) +
      '</p>' +
      '<div class="table-scroll"><table>' +
        '<thead><tr><th>Employee</th><th class="num">Days Worked</th>' +
        '<th class="num">Total Hours</th><th>Detail</th></tr></thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
        '<tfoot><tr><td colspan="2">All employees</td>' +
        '<td class="num">' + TS.fmtHours(grandMs) + '</td><td></td></tr></tfoot>' +
      '</table></div>';

    TS.els('#report [data-days]').forEach(function (button) {
      button.addEventListener('click', function () {
        var row = document.getElementById('detail-' + button.getAttribute('data-days'));
        if (!row) return;
        var hidden = row.style.display === 'none';
        row.style.display = hidden ? '' : 'none';
        button.textContent = hidden ? 'Hide days' : 'Show days';
      });
    });
  }

  function dayTable(dayList) {
    var rows = dayList.map(function (day) {
      var shifts = day.punches.sort(function (a, b) { return a.inAt - b.inAt; })
        .map(function (p) {
          if (!p.outAt) {
            return TS.esc(TS.fmtTime(p.inAt)) + ' &ndash; <span class="flag">no clock-out</span>';
          }
          return TS.esc(TS.fmtTime(p.inAt)) + ' &ndash; ' + TS.esc(TS.fmtTime(p.outAt)) +
                 (TS.isLongShift(p) ? ' <span class="flag">*</span>' : '');
        }).join('<br>');

      return '<tr>' +
               '<td>' + TS.esc(TS.fmtDate(day.at)) + '</td>' +
               '<td>' + shifts + '</td>' +
               '<td class="num">' + TS.fmtHours(day.ms) + '</td>' +
             '</tr>';
    }).join('');

    return '<table><thead><tr><th>Date</th><th>Shifts</th>' +
           '<th class="num">Hours</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ------------------------------------------------------------
     Backup and restore
     ------------------------------------------------------------ */

  function downloadBackup() {
    TS.clearMsg();
    Store.exportAll().then(function (data) {
      var text = JSON.stringify(data, null, 2);
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'timesheet-backup-' + TS.dayKey(Date.now()) + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      TS.showOk('Backup downloaded.');
    });
  }

  function restoreBackup(event) {
    TS.clearMsg();
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!window.confirm('Restoring replaces every employee and every hour currently ' +
                        'stored on this device.\n\nContinue?')) {
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (e) {
        TS.showError('That file could not be read as a backup.');
        return;
      }
      Store.importAll(parsed).then(function () {
        TS.showOk('Backup restored.');
        drawEmployeeList();
        runReport();
      }).catch(function (err) { TS.showError(err.message); });
    };
    reader.onerror = function () { TS.showError('That file could not be read.'); };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------
     Passcode change and sign out
     ------------------------------------------------------------ */

  function changePasscode() {
    TS.clearMsg();
    var oldValue = TS.el('#oldPass').value;
    var newValue = TS.el('#newPass').value;

    if (newValue.length < 4) return TS.showError('The new passcode needs at least 4 characters.');

    Store.getAdminPass().then(function (record) {
      return Auth.verify(record, oldValue);
    }).then(function (good) {
      if (!good) return TS.showError('The current passcode is not correct.');
      return Auth.makeRecord(newValue).then(function (record) {
        return Store.setAdminPass(record);
      }).then(function () {
        TS.el('#oldPass').value = '';
        TS.el('#newPass').value = '';
        TS.showOk('Passcode changed.');
      });
    });
  }

  TS.el('#signOut').addEventListener('click', function (e) {
    e.preventDefault();
    Auth.signOut();
    window.location.href = 'index.html';
  });

  TS.startTopClock();
  start();
})();
