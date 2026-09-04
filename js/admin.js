/* ============================================================
   admin.js  --  sign in, employee list, hours reports, backup,
                 Google Sheets connection
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

  function narrow() { TS.el('#page').className = 'wrap narrow'; }
  function wide() { TS.el('#page').className = 'wrap'; }

  /* ------------------------------------------------------------
     First run: choose a passcode, then write down a recovery code
     ------------------------------------------------------------ */

  function drawCreatePasscode() {
    narrow();
    TS.el('#signOut').style.display = 'none';
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
        return issueRecoveryCode();
      }).then(function (code) {
        drawRecoveryCodeScreen(code, 'Set Up Admin Access', drawDashboard);
      });
    });
  }

  /* Generates a fresh recovery code, stores only its hash, and hands the
     plain code back to be shown to the boss exactly once. */
  function issueRecoveryCode() {
    var code = Auth.newRecoveryCode();
    return Auth.makeRecord(Auth.normalizeCode(code)).then(function (record) {
      return Store.setAdminRecovery(record);
    }).then(function () {
      return code;
    });
  }

  function drawRecoveryCodeScreen(code, heading, onContinue) {
    narrow();
    content.innerHTML =
      '<h1>' + TS.esc(heading) + '</h1>' +
      '<div class="panel"><h2>Recovery Code</h2><div class="panel-body">' +
        '<p style="margin-top:0">If the passcode is ever forgotten, this code is the ' +
        'only way back in. It is shown once and cannot be looked up later.</p>' +
        '<div class="codebox" id="codeText">' + TS.esc(code) + '</div>' +
        '<p><strong>Write it down and keep it somewhere away from this device</strong> ' +
        '&ndash; a wallet, a safe, a filing cabinet. Storing it on the same machine ' +
        'defeats the point.</p>' +
        '<label style="display:block;margin:14px 0">' +
          '<input type="checkbox" id="ack"> I have written this code down.' +
        '</label>' +
        '<button class="btn btn-primary" id="continue" disabled>Continue</button>' +
        '<button class="btn" id="print">Print This Page</button>' +
      '</div></div>';

    TS.el('#ack').addEventListener('change', function () {
      TS.el('#continue').disabled = !this.checked;
    });
    TS.el('#print').addEventListener('click', function () { window.print(); });
    TS.el('#continue').addEventListener('click', onContinue);
  }

  /* ------------------------------------------------------------
     Sign in, and getting back in without the passcode
     ------------------------------------------------------------ */

  function drawSignIn() {
    narrow();
    TS.el('#signOut').style.display = 'none';
    content.innerHTML =
      '<h1>Admin Sign In</h1>' +
      '<div class="panel"><div class="panel-body">' +
        '<label for="pass">Passcode</label>' +
        '<input type="password" id="pass" style="width:100%" autocomplete="current-password">' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-primary" id="go">Sign In</button>' +
        '<p class="hint"><a href="#" id="forgot">Forgot the passcode?</a></p>' +
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
    TS.el('#forgot').addEventListener('click', function (e) {
      e.preventDefault();
      drawForgot();
    });
    TS.el('#pass').focus();
  }

  function drawForgot() {
    narrow();
    TS.clearMsg();

    Store.getAdminRecovery().then(function (record) {

      if (!record) {
        content.innerHTML =
          '<h1>Forgot Passcode</h1>' +
          '<div class="panel"><div class="panel-body">' +
            '<p style="margin-top:0">No recovery code was ever generated on this device, ' +
            'so there is nothing to check the answer against.</p>' +
            '<p>The passcode can still be cleared by hand. On this computer, open the ' +
            'timesheet, press <strong>F12</strong>, choose the <strong>Console</strong> tab, ' +
            'paste the line below and press Enter. Employees and hours are not touched.</p>' +
            '<div class="codebox codebox-small">Store.setAdminPass(null).then(function(){location.reload()})</div>' +
            '<p class="hint">Once you are back in, use <strong>Generate New Recovery Code</strong> ' +
            'on the admin page so this is not needed again.</p>' +
            '<button class="btn" id="back">Back to Sign In</button>' +
          '</div></div>';
        TS.el('#back').addEventListener('click', drawSignIn);
        return;
      }

      content.innerHTML =
        '<h1>Forgot Passcode</h1>' +
        '<div class="panel"><div class="panel-body">' +
          '<p style="margin-top:0">Enter the recovery code that was written down when ' +
          'this timesheet was set up, then choose a new passcode.</p>' +
          '<label for="code">Recovery code</label>' +
          '<input type="text" id="code" style="width:100%" placeholder="ABCD-EFGH-JKMN-PQRS" ' +
          'autocomplete="off" spellcheck="false">' +
          '<div class="spacer"></div>' +
          '<label for="n1">New passcode</label>' +
          '<input type="password" id="n1" style="width:100%" autocomplete="new-password">' +
          '<div class="spacer"></div>' +
          '<label for="n2">Confirm new passcode</label>' +
          '<input type="password" id="n2" style="width:100%" autocomplete="new-password">' +
          '<div class="spacer"></div>' +
          '<button class="btn btn-primary" id="reset">Reset Passcode</button> ' +
          '<button class="btn" id="back">Cancel</button>' +
          '<p class="hint">Dashes and capitals do not matter.</p>' +
        '</div></div>';

      TS.el('#back').addEventListener('click', drawSignIn);

      TS.el('#reset').addEventListener('click', function () {
        TS.clearMsg();
        var typed = Auth.normalizeCode(TS.el('#code').value);
        var a = TS.el('#n1').value, b = TS.el('#n2').value;

        if (!typed) return TS.showError('Enter the recovery code.');
        if (a.length < 4) return TS.showError('The new passcode needs at least 4 characters.');
        if (a !== b) return TS.showError('The two passcodes do not match.');

        Auth.verify(record, typed).then(function (good) {
          if (!good) return TS.showError('That recovery code is not correct.');

          return Auth.makeRecord(a).then(function (rec) {
            return Store.setAdminPass(rec);
          }).then(function () {
            Auth.signIn();
            /* The old code has now been used and written down somewhere;
               replace it so a stale slip of paper is not a way in. */
            return issueRecoveryCode();
          }).then(function (code) {
            drawRecoveryCodeScreen(code, 'New Recovery Code', drawDashboard);
          });
        });
      });
    });
  }

  /* ------------------------------------------------------------
     The dashboard
     ------------------------------------------------------------ */

  function drawDashboard() {
    wide();
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

      '<div class="panel"><h2>Google Sheets</h2><div class="panel-body">' +
        '<div id="syncStatus"></div>' +
        '<div class="spacer"></div>' +
        '<label for="syncUrl">Web app address</label>' +
        '<input type="text" id="syncUrl" style="width:100%" spellcheck="false" ' +
          'placeholder="https://script.google.com/macros/s/..../exec">' +
        '<div class="spacer"></div>' +
        '<div class="row">' +
          '<div class="grow"><label for="syncDevice">Name of this device</label>' +
            '<input type="text" id="syncDevice" style="width:100%" placeholder="Front counter tablet"></div>' +
        '</div>' +
        '<div class="spacer"></div>' +
        '<div class="row">' +
          '<button class="btn btn-primary" id="syncSave">Save</button>' +
          '<button class="btn" id="syncTest">Test Connection</button>' +
          '<button class="btn" id="syncNow">Send Waiting Punches</button>' +
          '<button class="btn" id="syncAll">Send All History</button>' +
        '</div>' +
        '<p class="hint">Setting this up is described in README.md under ' +
        '&ldquo;Sending the hours to Google Sheets&rdquo;. The address is stored on this ' +
        'device only &ndash; it is never part of the published website.</p>' +
      '</div></div>' +

      '<div class="panel"><h2>Backup File</h2><div class="panel-body">' +
        '<p style="margin-top:0">A backup is a single file holding every employee and ' +
        'every punch. It is what you feed back in if this machine has to be replaced. ' +
        'Keep it somewhere that is not this computer &ndash; a USB stick, Google Drive, ' +
        'an email to yourself.</p>' +
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
        '<div class="spacer"></div>' +
        '<div id="recoveryState"></div>' +
        '<div class="spacer"></div>' +
        '<button class="btn" id="newRecovery">Generate New Recovery Code</button>' +
        '<p class="hint">Generating a new code cancels the old one. Do this if the ' +
        'written copy is lost, or if somebody who had it has left.</p>' +
      '</div></div>';

    /* default the report to the current week */
    TS.el('#from').value = TS.inputValue(TS.startOfWeek(Date.now()));
    TS.el('#to').value = TS.inputValue(Date.now());

    TS.el('#run').addEventListener('click', function () { runReport(true); });
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
    TS.el('#newRecovery').addEventListener('click', regenerateRecovery);

    TS.els('[data-range]').forEach(function (button) {
      button.addEventListener('click', function () {
        applyQuickRange(button.getAttribute('data-range'));
        runReport(true);
      });
    });

    TS.el('#syncSave').addEventListener('click', saveSync);
    TS.el('#syncTest').addEventListener('click', testSync);
    TS.el('#syncNow').addEventListener('click', flushSync);
    TS.el('#syncAll').addEventListener('click', sendAllHistory);

    drawEmployeeList();
    drawRecoveryState();
    drawSyncPanel();
    runReport(false);
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
      if (!target) return;

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
          runReport(false);
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
        drawSyncPanel();
        runReport(false);
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
      runReport(false);
    }).catch(function (err) { TS.showError(err.message); });
  }

  /* ------------------------------------------------------------
     Hours report
     ------------------------------------------------------------ */

  /* announce=true when a person pressed a button, so the result gets a
     visible "run at" stamp. Without it a re-run of an identical range
     repaints the same table and looks like nothing happened. */
  function runReport(announce) {
    var target = TS.el('#report');
    if (!target) return;

    var fromStr = TS.el('#from').value;
    var toStr = TS.el('#to').value;
    var fromMs = TS.startOfDay(fromStr);
    var toMs = TS.endOfDay(toStr);

    if (fromMs === null || toMs === null) {
      var missing = [];
      if (fromMs === null) missing.push('<strong>From</strong>');
      if (toMs === null) missing.push('<strong>To</strong>');
      target.innerHTML = '<div class="notice notice-warn">The ' + missing.join(' and ') +
        ' date ' + (missing.length > 1 ? 'fields need' : 'field needs') +
        ' a complete date before a report can run. Use one of the buttons above to ' +
        'fill both in.</div>';
      return;
    }

    if (fromMs > toMs) {
      target.innerHTML = '<div class="notice notice-warn">The start date is after the ' +
                         'end date. Swap them and run the report again.</div>';
      return;
    }

    Promise.all([
      Store.listEmployees(true),
      Store.listPunches(null, fromMs, toMs)
    ]).then(function (results) {
      try {
        drawReport(target, results[0], results[1], fromMs, toMs, announce);
      } catch (err) {
        target.innerHTML = '<div class="notice notice-error">The report could not be ' +
          'built: ' + TS.esc(err.message || String(err)) + '</div>';
      }
    });
  }

  function drawReport(target, employees, punches, fromMs, toMs, announce) {

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

    var stamp =
      '<p class="runstamp">' +
        TS.esc(TS.fmtDate(fromMs)) + ' through ' + TS.esc(TS.fmtDate(toMs)) +
        ' &nbsp;&middot;&nbsp; ' + listed.length + ' employee' + (listed.length === 1 ? '' : 's') +
        ' &nbsp;&middot;&nbsp; ' + TS.fmtHours(grandMs) + ' hours' +
        (announce ? ' &nbsp;&middot;&nbsp; run at ' + TS.esc(TS.fmtTime(Date.now())) : '') +
      '</p>';

    target.innerHTML =
      warnings + stamp +
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
     Google Sheets connection
     ------------------------------------------------------------ */

  function drawSyncPanel() {
    var target = TS.el('#syncStatus');
    if (!target || typeof Sync === 'undefined') return;

    var s = Sync.status();

    TS.el('#syncUrl').value = s.url;
    TS.el('#syncDevice').value = s.device;

    var lines = '';

    if (!s.configured) {
      lines += '<div class="notice notice-warn">Not connected. Punches are being saved ' +
               'on this device only. If this machine is lost, so are the hours.</div>';
    } else if (!s.looksRight) {
      lines += '<div class="notice notice-warn">That address does not have the usual shape. ' +
               'A deployed web app address starts with ' +
               '<strong>https://script.google.com/macros/s/</strong> and ends with ' +
               '<strong>/exec</strong>. Copying the address out of the Apps Script editor ' +
               'instead of the deployment window is the usual cause. Use Test Connection ' +
               'to find out whether it works anyway.</div>';
    } else {
      lines += '<div class="notice notice-ok" style="display:block">Connected to Google Sheets.</div>';
    }

    var facts = [];
    facts.push('<tr><td>Waiting to upload</td><td class="num">' +
               (s.pending ? '<span class="flag">' + s.pending + '</span>' : '0') + '</td></tr>');
    facts.push('<tr><td>Last successful upload</td><td class="num">' +
               (s.lastOkAt ? TS.esc(TS.fmtDateTime(s.lastOkAt)) : '<span class="muted">never</span>') +
               '</td></tr>');
    if (s.lastError) {
      facts.push('<tr><td>Last error</td><td><span class="flag">' +
                 TS.esc(s.lastError) + '</span></td></tr>');
    }

    lines += '<div class="table-scroll"><table><tbody>' + facts.join('') + '</tbody></table></div>';
    target.innerHTML = lines;
  }

  function saveSync() {
    TS.clearMsg();
    Sync.save(TS.el('#syncUrl').value, TS.el('#syncDevice').value).then(function () {
      TS.showOk('Google Sheets settings saved.');
      drawSyncPanel();
    }).catch(function (err) {
      TS.showError(err.message);
    });
  }

  function testSync() {
    TS.clearMsg();
    var button = TS.el('#syncTest');
    button.disabled = true;
    button.textContent = 'Testing...';

    Sync.save(TS.el('#syncUrl').value, TS.el('#syncDevice').value)
      .then(function () { return Sync.test(); })
      .then(function () {
        TS.showOk('Connection works. A test line was written to the Log tab of your sheet.');
      })
      .catch(function (err) {
        TS.showError('Connection failed: ' + err.message);
      })
      .then(function () {
        button.disabled = false;
        button.textContent = 'Test Connection';
        drawSyncPanel();
      });
  }

  function flushSync() {
    TS.clearMsg();
    var button = TS.el('#syncNow');
    button.disabled = true;

    Sync.flush().then(function (result) {
      if (result.skipped === 'not configured') {
        TS.showError('Save a web app address first.');
      } else if (result.error) {
        TS.showError('Stopped after ' + result.sent + ' of them: ' + result.error);
      } else if (!result.sent) {
        TS.showOk('Nothing was waiting.');
      } else {
        TS.showOk('Uploaded ' + result.sent + ' punch' + (result.sent === 1 ? '' : 'es') + '.');
      }
      button.disabled = false;
      drawSyncPanel();
    });
  }

  function sendAllHistory() {
    TS.clearMsg();
    if (!window.confirm('Send every punch on record to the sheet?\n\nRows already in the ' +
                        'sheet are updated rather than duplicated. On a long history this ' +
                        'can take a few minutes.')) {
      return;
    }

    var button = TS.el('#syncAll');
    button.disabled = true;
    button.textContent = 'Sending...';

    Sync.sendAllHistory().then(function (result) {
      if (result && result.error) {
        TS.showError('Stopped after ' + result.sent + ': ' + result.error);
      } else {
        TS.showOk('Sent ' + ((result && result.sent) || 0) + ' punches to the sheet.');
      }
      button.disabled = false;
      button.textContent = 'Send All History';
      drawSyncPanel();
    });
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
      TS.showOk('Backup downloaded. Move it off this computer.');
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
        drawRecoveryState();
        runReport(false);
      }).catch(function (err) { TS.showError(err.message); });
    };
    reader.onerror = function () { TS.showError('That file could not be read.'); };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------
     Passcode and recovery code
     ------------------------------------------------------------ */

  function drawRecoveryState() {
    var target = TS.el('#recoveryState');
    if (!target) return;

    Store.getAdminRecovery().then(function (record) {
      target.innerHTML = record
        ? '<p class="hint" style="margin:0">A recovery code is set. It was shown once ' +
          'when it was created and cannot be displayed again.</p>'
        : '<div class="notice notice-warn">No recovery code is set. If the passcode is ' +
          'forgotten there is no easy way back in. Generate one now.</div>';
    });
  }

  function regenerateRecovery() {
    TS.clearMsg();
    if (!window.confirm('Generate a new recovery code?\n\nAny code written down before ' +
                        'now stops working.')) {
      return;
    }
    issueRecoveryCode().then(function (code) {
      drawRecoveryCodeScreen(code, 'New Recovery Code', drawDashboard);
    });
  }

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
  if (typeof Sync !== 'undefined') Sync.startRetryLoop();
  start();
})();
