/* ============================================================
   home.js  --  the employee grid
   ============================================================ */

(function () {

  /* If the Google Sheet is connected but punches are stuck in the queue,
     say so where somebody will actually see it. */
  function renderSyncLine() {
    var target = TS.el('#syncLine');
    if (!target || typeof Sync === 'undefined') return;

    var s = Sync.status();
    if (!s.configured || !s.pending) {
      target.style.display = 'none';
      return;
    }

    target.style.display = '';
    target.textContent = s.pending + ' punch' + (s.pending === 1 ? '' : 'es') +
      ' still waiting to reach Google Sheets. They are saved here and will upload ' +
      'once this device is back online.';
  }

  function render() {
    renderSyncLine();
    Store.listEmployees(false).then(function (employees) {
      var list = TS.el('#list');

      if (!employees.length) {
        list.innerHTML =
          '<div class="empty">' +
          'No employees have been added yet.<br><br>' +
          'Use <strong>Admin Sign In</strong> in the top right corner to add them.' +
          '</div>';
        return;
      }

      /* Look up who is currently on the clock so the grid shows it. */
      Promise.all(employees.map(function (emp) {
        return Store.getOpenPunch(emp.id);
      })).then(function (openPunches) {

        var html = '<div class="emp-grid">';
        employees.forEach(function (emp, i) {
          var open = openPunches[i];
          var status = open
            ? '<span class="s s-in">Clocked in &ndash; ' + TS.esc(TS.fmtTime(open.inAt)) + '</span>'
            : '<span class="s s-out">Clocked out</span>';
          html += '<a class="emp-tile" href="employee.html?id=' + encodeURIComponent(emp.id) + '">' +
                    '<span class="n">' + TS.esc(emp.name) + '</span>' + status +
                  '</a>';
        });
        html += '</div>';
        list.innerHTML = html;
      });
    });
  }

  TS.startTopClock();
  if (typeof Sync !== 'undefined') Sync.startRetryLoop();
  render();

  /* Refresh the badges every half minute, and immediately if another
     tab on this device punches someone in or out. */
  setInterval(render, 30000);
  window.addEventListener('storage', render);
  window.addEventListener('pageshow', render);
})();
