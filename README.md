# Timesheet

A plain time clock for a small workplace. No server, no build step, no
dependencies. Three HTML pages, one stylesheet, six scripts.

- **Home page** shows every employee as a button, three across.
- **Employee page** is one big Clock In / Clock Out button plus their own hours.
- **Admin page** is behind a passcode and runs hour reports for everyone.

Hours are reported in decimal form so payroll can multiply straight by the
hourly rate: 7 hours 45 minutes reads as **7.75**.

## How the data is stored

Everything is written to `localStorage` in the browser of **one shared device**
-- the tablet or computer that sits by the door. That is the trade-off of
hosting on GitHub Pages: it serves files but cannot store anything.

### What that does and does not survive

The data is written to disk the moment somebody punches, not when the browser
closes. So it **does** survive:

- closing the tab or quitting the browser
- restarting or shutting down the computer
- a power cut, even mid-shift
- the internet going down

It does **not** survive:

- clearing browsing data, cookies, or "site data"
- a browser configured to clear data when it closes
- a private or incognito window (never use one for this)
- reinstalling the browser, switching browsers, or a different Windows user
- the machine being lost, stolen, wiped, or replaced

The bottom half of that list is why the Google Sheets connection below is worth
setting up. It puts a second copy somewhere that is not this computer.

## Is it safe for the repository to be public?

Yes. The repository holds code, not data.

Employee names, punch records, the admin passcode hash, and the Google Sheets
address all live in `localStorage` on the shop device only. None of it is ever
committed.

A stranger who finds the URL gets an empty copy of the app pointed at their own
browser's storage. They can add fake employees and clock them in all day; it
writes to their machine and never reaches yours.

Two things worth knowing:

- **A private repo would not hide the code anyway.** GitHub Pages serves the
  files to the public internet either way, so anyone can read the JavaScript
  with View Source. On the free plan Pages requires a public repo regardless.
- **Never commit a backup file.** Downloaded backups *do* contain every name,
  every punch, and the passcode hash. `.gitignore` already excludes
  `timesheet-backup-*.json`.

The real exposure is physical: anyone standing at the shop device can clock in
as anyone else, because employees have no passcode by design.

## Sending the hours to Google Sheets

This is the durable copy. Every clock in and clock out is uploaded to a Google
Sheet as it happens. If the shop computer dies, the hours are still in the sheet.

The sheet gets three tabs.

### Timesheet -- the one you read

Pay periods newest first, so the current one is always at the top. Each pay
period is headed with its dates, the total hours across everyone, and the
payday:

    Pay period: 09/13/2026 – 09/26/2026        79.25    Payday 10/02/2026

Under it, one line per employee showing their total for that period. Click the
**+** in the grey margin on the left of an employee's row to open their days,
and the **-** to fold them away again. They start folded:

    Maria Delgado                              41.25    5 days worked
      Sun 09/13/2026                            8.00    8:00 AM – 12:00 PM,  1:00 PM – 5:00 PM
      Mon 09/14/2026                            8.50    8:00 AM – 4:30 PM

One blank row separates employees, three blank rows separate pay periods.

The columns are: the employee name or the date, then hours, then the payday /
days worked / shift times depending on the row. Column A is left empty as a
margin.

Every number adds up: the day rows sum to the employee's total, and the
employee totals sum to the period total. Each shift is rounded to two decimals
once, and nothing above it is ever re-rounded, so checking a payslip with a
calculator gives the same answer as the sheet.

A day someone forgot to clock out of shows `9:00 AM – no clock-out` and counts
as zero hours, and their summary line says so. A shift over 16 hours is marked
with an asterisk.

Only employees who actually worked in a period appear in that period's block.
The script builds this tab from the Shifts tab and has no way of knowing about
someone who was on the payroll but recorded nothing.

**Do not type into this tab.** It is wiped and redrawn from Shifts every time
somebody clocks in or out.

### Shifts -- the raw feed

One row per shift, keyed by punch id, which is what makes a retry after a
dropped connection update the row instead of duplicating it. The Timesheet tab
is rebuilt from this. Do not sort or edit it by hand.

### Log -- every message received

One line per message, never edited. Use it if you ever need to prove what was
recorded and when.

### When the Timesheet tab is redrawn

- After every clock in and clock out, automatically.
- Once at the end of a **Send All History** run, rather than once per punch.
- When you pick **Timesheet -> Rebuild now** from the menu bar of the sheet
  itself.
- When you press **Rebuild Sheet Layout** on the admin page.

### Changing the pay period

At the top of `google-apps-script.gs`:

    PERIOD_ANCHOR_YEAR / MONTH / DAY    any Sunday that started a real pay period
    PERIOD_LENGTH_DAYS                  14
    PAYDAY_OFFSET_DAYS                  6, the Friday after the closing Saturday
    NEWEST_PERIOD_FIRST                 true
    BLANK_ROWS_BETWEEN_EMPLOYEES        1
    BLANK_ROWS_BETWEEN_PERIODS          3

The anchor is currently Sunday 13 September 2026, which runs to Saturday 26
September 2026 with payday on Friday 2 October 2026. Every other period is
counted forwards and backwards from that one date in fourteen day steps, so
changing the anchor shifts the whole calendar at once. Any Sunday that started
a real pay period works; it does not have to be a recent one.

After changing anything here, save, redeploy (see below), then run
**Timesheet -> Rebuild now**.

### One-time setup

1. Create a new Google Sheet and give it a name.
2. **Extensions -> Apps Script.** An editor opens in a new tab.
3. Delete everything in `Code.gs` and paste in the entire contents of
   [`google-apps-script.gs`](google-apps-script.gs) from this repository. Save.
4. **Deploy -> New deployment.**
5. Click the gear beside "Select type" and pick **Web app**.
6. Set **Execute as: Me** and **Who has access: Anyone**.
   It must be *Anyone*, not *Anyone with a Google account* -- the shop tablet is
   not signed in to Google.
7. Click **Deploy**. Google will ask for authorization. It warns that the app is
   unverified, which is expected for your own script: **Advanced -> Go to
   (project name) -> Allow.**
8. Copy the **Web app URL**. It ends in `/exec`.
9. In the timesheet: **Admin -> Google Sheets**, paste the address, name the
   device (for example "Front counter tablet"), and press **Save**.
10. Press **Test Connection**. A line should appear on the Log tab of your sheet.
11. Press **Send All History** once, to push everything already recorded.
12. Close and reopen the sheet once, so the **Timesheet** menu appears.

### After that

Nothing. Punches upload on their own.

If the internet is down, the punch is still recorded on the device and joins a
queue. The queue is retried on the next punch, on the next page load, when the
machine comes back online, and once a minute in between. The home page shows a
line when anything is waiting, and the admin page shows the count and the last
error.

### If you edit the Apps Script later

Changes do not take effect until you redeploy: **Deploy -> Manage deployments
-> pencil icon -> Version: New version -> Deploy.** Editing and saving alone
keeps the old code running, which is the usual reason a change appears to do
nothing.

### If you set the sheet up with an earlier version of this script

The Shifts tab gained columns for the raw clock-in and clock-out times. Existing
rows keep working, but press **Send All History** once so every row is filled in
properly, then **Timesheet -> Rebuild now**.

### About that address

Anyone who has the web app URL can write rows to your sheet. It is stored on the
shop device only and never enters this repository, so it is not published with
the site. If it does leak, go to **Deploy -> Manage deployments**, archive the
deployment, create a new one, and paste the new address into the admin page.

## The backup file

**Download Backup** gives you a `.json` file. It is not meant to be read -- it is
a restore file, the whole timesheet in one lump: every employee, every punch, and
the passcode hash.

What to do with it: put it somewhere that is not the shop computer. A USB stick
in a drawer, a folder in Google Drive, an email to yourself. Once a pay period is
plenty.

What it is for: **Restore From Backup** on a replacement machine, which puts
everything back exactly as it was. That is the one thing the Google Sheet cannot
do for you -- the sheet is a readable record, the backup is a working restore.

Do not open it in Excel and do not edit it unless you are fixing a punch by hand
(see Known limits).

## Files

    index.html               home page, employee grid
    employee.html            clock in / clock out and personal hours
    admin.html               sign in, employee list, reports, sheets, backup
    css/style.css            all styling
    js/store.js              DATA LAYER -- the only file that touches storage
    js/common.js             date and time helpers, passcode handling
    js/sync.js               the Google Sheets uploader and its retry queue
    js/home.js               home page
    js/employee.js           employee page
    js/admin.js              admin page
    google-apps-script.gs    paste this into your Google Sheet

## First run

1. Open the site and click **Admin Sign In** in the top right corner.
2. Choose an admin passcode.
3. **Write down the recovery code it shows you.** It is displayed once and
   cannot be looked up again. Keep it away from the shop computer.
4. Add employees. They appear on the home page right away.
5. Optionally connect Google Sheets, as above.

### If the passcode is forgotten

Click **Forgot the passcode?** on the sign-in screen and enter the recovery code.
You will be asked to set a new passcode, and a fresh recovery code is issued
(the old one stops working). Dashes and capitals do not matter when typing it in.

If no recovery code was ever generated, that screen explains how to clear the
passcode by hand. Employees and hours are never touched either way.

## Deploying to GitHub Pages

1. Create a repository on GitHub and push these files to the root of the
   `main` branch.
2. **Settings -> Pages**, Source **Deploy from a branch**, branch `main`,
   folder `/ (root)`, save.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.
4. For a custom domain, enter it under Settings -> Pages -> Custom domain, then
   add the DNS records GitHub shows you at your registrar. Leave
   **Enforce HTTPS** on.

All paths are relative, so the site works from a subfolder or a bare domain
without changes.

After pushing an update, the shop device may keep running the old version for a
few minutes because the browser caches the files. **Ctrl+F5** forces it to pick
up the new one immediately.

## Settings worth knowing

In `js/common.js`:

- `WEEK_STARTS_ON` -- `0` for a Sunday payroll week, `1` for Monday.
- `LONG_SHIFT_HOURS` -- shifts longer than this get flagged in reports as a
  probable missed clock-out. Default 16.

In `js/sync.js`:

- `RETRY_EVERY_MS` -- how often a stuck queue is retried. Default 60 seconds.

## Known limits

- **Punches cannot be edited.** If someone forgets to clock out, the app flags
  it in the report and warns the employee, but there is no screen to correct the
  time. The workaround is to download the backup, edit the JSON by hand, restore
  it, and press Send All History to push the correction to the sheet.
- **The admin passcode is a speed bump, not security.** The check runs in the
  browser, so anyone comfortable with developer tools can get past it. Do not
  reuse a password that protects anything else.
- **Overnight shifts** count on the day they started.
- Breaks and lunches are not tracked. Clock out and back in to take one.
