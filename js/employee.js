/* ============================================================
   employee.js  --  one person's clock in / clock out and hours
   ============================================================ */

(function () {

  var RECENT_DAYS = 14;

  var employeeId = TS.param('id');
  var employee = null;
  var openPunch = null;
  var tickTimer = null;

  function load() {
    if (!employeeId) { notFound(); return; }

    Store.getEmployee(employeeId).then(function (emp) {
      if (!emp) { notFound(); return; }
      employee = emp;
      document.title = emp.name + ' – Timesheet';
      TS.el('#empName').innerHTML = TS.esc(emp.name) +
        (emp.active ? '' : ' <span class="sub">(archived)</span>');
      return refresh();
    });
  }

  function notFound() {
    TS.el('#empName').textContent = 'Employee not found';
    TS.el('#content').innerHTML =
      '<div class="empty">That employee link is no longer valid. ' +
      '<a href="index.html">Go back to the employee list.</a></div>';
  }

  function refresh() {
    var weekStart = TS.startOfWeek(Date.now());
    var lastWeekStart = TS.addDays(weekStart, -7);
    var recentStart = TS.startOfDay(TS.dayKey(TS.addDays(Date.now(), -(RECENT_DAYS - 1))));
    var earliest = Math.min(lastWeekStart, recentStart);

    return Promise.all([
      Store.getOpenPunch(employeeId),
      Store.listPunches(employeeId, earliest, null)
    ]).then(function (results) {
      openPunch = results[0];
      var punches = results[1];

      var thisWeek = 0, lastWeek = 0;
      punches.forEach(function (p) {
        if (!p.outAt) return;                       // open shifts are not counted yet
        var ms = TS.punchMs(p);
        if (p.inAt >= weekStart) thisWeek += ms;
        else if (p.inAt >= lastWeekStart) lastWeek += ms;
      });

      var recent = punches.filter(function (p) { return p.inAt >= recentStart; })
                          .sort(function (a, b) { return b.inAt - a.inAt; });

      draw(thisWeek, lastWeek, recent);
    });
  }

  function draw(thisWeekMs, lastWeekMs, recent) {
    var html = '';

    /* ---- status and the one big button ---- */

    html += '<div class="status">';
    if (openPunch) {
      html += '<div class="state in">Clocked In</div>' +
              '<div class="detail">Since ' + TS.esc(TS.fmtDateTime(openPunch.inAt)) +
              ' &nbsp;&middot;&nbsp; <span id="elapsed">' +
              TS.fmtHours(TS.punchMs(openPunch)) + '</span> hrs so far</div>';
    } else {
      html += '<div class="state out">Clocked Out</div>' +
              '<div class="detail">You are not on the clock right now.</div>';
    }
    html += '</div>';

    /* A shift that started on an earlier day almost always means somebody
       forgot to clock out. Say so plainly before they make it worse. */
    if (openPunch && TS.dayKey(openPunch.inAt) !== TS.dayKey(Date.now())) {
      html += '<div class="notice notice-warn">This shift started on ' +
              TS.esc(TS.fmtDate(openPunch.inAt)) +
              ' and was never clocked out. Clocking out now will record all of the ' +
              'hours in between. Tell your manager so the entry can be corrected.</div>';
    }

    html += openPunch
      ? '<button class="btn btn-out btn-big" id="toggle">Clock Out</button>'
      : '<button class="btn btn-in btn-big" id="toggle">Clock In</button>';

    html += '<div class="spacer"></div>';

    /* ---- totals ---- */

    html += '<div class="totals">' +
              '<div class="total-box"><div class="k">This Week</div><div class="v">' +
                TS.fmtHours(thisWeekMs) + '</div></div>' +
              '<div class="total-box"><div class="k">Last Week</div><div class="v">' +
                TS.fmtHours(lastWeekMs) + '</div></div>' +
            '</div>';

    html += '<div class="spacer"></div>';

    /* ---- recent activity ---- */

    html += '<div class="panel"><h2>Last ' + RECENT_DAYS + ' Days</h2><div class="panel-body">';

    if (!recent.length) {
      html += '<p class="muted" style="margin:0">No hours recorded in the last ' +
              RECENT_DAYS + ' days.</p>';
    } else {
      var total = 0;
      var rows = '';
      recent.forEach(function (p) {
        var openRow = !p.outAt;
        if (!openRow) total += TS.punchMs(p);
        rows += '<tr>' +
                  '<td>' + TS.esc(TS.fmtDate(p.inAt)) + '</td>' +
                  '<td>' + TS.esc(TS.fmtTime(p.inAt)) + '</td>' +
                  '<td>' + (openRow
                      ? '<span class="flag">still clocked in</span>'
                      : TS.esc(TS.fmtTime(p.outAt))) + '</td>' +
                  '<td class="num">' + (openRow
                      ? '<span class="muted">&ndash;</span>'
                      : TS.fmtHours(TS.punchMs(p))) + '</td>' +
                '</tr>';
      });

      html += '<div class="table-scroll"><table>' +
                '<thead><tr><th>Date</th><th>In</th><th>Out</th>' +
                '<th class="num">Hours</th></tr></thead>' +
                '<tbody>' + rows + '</tbody>' +
                '<tfoot><tr><td colspan="3">Total</td><td class="num">' +
                  TS.fmtHours(total) + '</td></tr></tfoot>' +
              '</table></div>' +
              '<p class="hint">Hours are shown in decimal form. 7 hours 45 minutes reads as 7.75.</p>';
    }

    html += '</div></div>';

    TS.el('#content').innerHTML = html;
    TS.el('#toggle').addEventListener('click', onToggle);
    startTicking();
  }

  /* Keep the "so far" figure moving while somebody is on the clock. */
  function startTicking() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (!openPunch) return;
    tickTimer = setInterval(function () {
      var node = TS.el('#elapsed');
      if (!node) { clearInterval(tickTimer); return; }
      node.textContent = TS.fmtHours(TS.punchMs(openPunch));
    }, 10000);
  }

  function onToggle() {
    TS.clearMsg();
    var button = TS.el('#toggle');
    button.disabled = true;

    var action = openPunch ? Store.clockOut(employeeId) : Store.clockIn(employeeId);

    action.then(function (punch) {
      var message = openPunch
        ? 'Clocked out at ' + TS.fmtTime(punch.outAt) +
          '. Shift total ' + TS.fmtHours(TS.punchMs(punch)) + ' hours.'
        : 'Clocked in at ' + TS.fmtTime(punch.inAt) + '.';
      return refresh().then(function () { TS.showOk(message); });
    }).catch(function (err) {
      button.disabled = false;
      TS.showError(err.message);
      refresh();     // another tab probably changed the state underneath us
    });
  }

  TS.startTopClock();
  load();
})();
