# Timesheet

A plain time clock for a small workplace. No server, no build step, no
dependencies. Three HTML pages, one stylesheet, five scripts.

- **Home page** shows every employee as a button, three across.
- **Employee page** is one big Clock In / Clock Out button plus their own hours.
- **Admin page** is behind a passcode and runs hour reports for everyone.

Hours are reported in decimal form so payroll can multiply straight by the
hourly rate: 7 hours 45 minutes reads as **7.75**.

## How the data is stored

Everything lives in `localStorage` in the browser of **one shared device** --
the tablet or computer that sits by the door. That is the trade-off of hosting
on GitHub Pages: it serves files but cannot store anything.

What this means day to day:

- Employees clock in on that one device. Punching in from a personal phone
  would write to that phone's storage, and no one else would ever see it.
- The boss runs reports on that same device.
- Clearing browsing data, resetting the machine, or switching browsers wipes
  the hours. **Use the Download Backup button every pay period.**

## Is it safe for the repository to be public?

Yes. The repository holds code, not data.

Employee names, punch records, and the admin passcode hash live in `localStorage`
on the shop device only. None of it is ever committed, uploaded, or transmitted --
there is no server to transmit it to.

A stranger who finds the URL gets an empty copy of the app pointed at their own
browser's storage. They can add fake employees and clock them in all day; it writes
to their machine and never reaches yours. There is no shared state to attack.

Two things worth knowing:

- **A private repo would not hide the code anyway.** GitHub Pages serves the files
  to the public internet either way, so anyone can read the JavaScript with View
  Source. On the free plan Pages requires a public repo regardless.
- **Never commit a backup file.** Downloaded backups *do* contain every name, every
  punch, and the passcode hash. `.gitignore` already excludes
  `timesheet-backup-*.json`, but do not rename one into the repo folder and commit it.

The real exposure is physical, not remote: anyone standing at the shop device can
clock in as anyone else, because employees have no passcode by design. If that
becomes a problem, the fix is a PIN per employee, not a change to repository
visibility.

**This changes the day you move to a cloud database.** At that point real shared
state exists on the internet, the connection keys live in the committed code, and a
public repo means anyone can read and write your punch records. Moving to Firebase
or Supabase means adding real authentication and server-side rules at the same time.
Do not do one without the other.

## Moving to the cloud later

Every read and write goes through `js/store.js`, and every function there
returns a Promise. To switch to Firebase, Supabase, or anything else, rewrite
the bodies of those functions to make network calls. No other file changes --
the rest of the app already waits for a Promise to resolve.

## Files

    index.html        home page, employee grid
    employee.html     clock in / clock out and personal hours
    admin.html        sign in, employee list, hour reports, backup
    css/style.css     all styling
    js/store.js       DATA LAYER -- the only file that touches storage
    js/common.js      date and time helpers, admin passcode handling
    js/home.js        home page
    js/employee.js    employee page
    js/admin.js       admin page

## First run

1. Open the site and click **Admin Sign In** in the top right corner.
2. Choose an admin passcode. It is stored as a hash on that device only.
3. Add employees. They appear on the home page right away.

## Deploying to GitHub Pages

1. Create a repository on GitHub and push these files to the root of the
   `main` branch.
2. In the repository, go to **Settings -> Pages**, set Source to
   **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
3. The site appears at `https://<user>.github.io/<repo>/` within a minute or two.
4. For a custom domain, enter it under Settings -> Pages -> Custom domain, then
   add the DNS records GitHub shows you at your registrar. Leave
   **Enforce HTTPS** on.

All paths are relative, so the site works from a subfolder or a bare domain
without changes.

## Settings worth knowing

In `js/common.js`:

- `WEEK_STARTS_ON` -- `0` for a Sunday payroll week, `1` for Monday.
- `LONG_SHIFT_HOURS` -- shifts longer than this get flagged in reports as a
  probable missed clock-out. Default 16.

## Known limits

- **Punches cannot be edited.** If someone forgets to clock out, the app
  flags it but there is no screen to correct the time. The workaround is to
  download the backup, edit the JSON by hand, and restore it.
- **The admin passcode is a speed bump, not security.** The check runs in the
  browser, so anyone comfortable with developer tools can get past it. Do not
  reuse a password that protects anything else.
- **Overnight shifts** count on the day they started.
- Breaks and lunches are not tracked. Clock out and back in to take one.
