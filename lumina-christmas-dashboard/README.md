# Lumina Club — Christmas Dashboard 🎄

A functional semester-based club dashboard for P4: Club Activity Dashboard. Vanilla HTML/CSS/JS frontend, Node.js/Express backend, optional Firebase Authentication and Google Sheets API.

## What it does

- Sign up / log in with email and password or Google (Firebase Authentication, requires configuration)
- Demo preview (only when live services aren't required)
- Semester switcher: 2025/1, 2025/2, 2026/1; all numbers and charts change on selection
- Three stat cards: active members, total events, total budget spent
- Attendance per event chart and planned-vs-actual budget chart
- Conditional, in-app notification bell + warning banners for budget >80% and events in 0–3 days
- Minimal Christmas light/dark visual theme, responsive design
- Sample CSV records with matching `semester` and event/member identifiers

## Quick start

Requires Node.js 20+.

```bash
npm install
cp .env.example .env
npm run dev
```

Open **http://localhost:3000**. Without Firebase/Google Sheets credentials, click **Explore demo dashboard**. The Google and email sign-in options are **not functional until Firebase is configured**; the demo deliberately does not pretend to authenticate users.

## Data structure / Google Sheet

Create **one Google Spreadsheet** with four tabs, named **exactly** `Members`, `Events`, `Attendance`, `Budget`.

Import the matching CSVs from `data/`. Every tab must contain a **`semester`** column with values such as `2026/1`, `2025/2`, `2025/1`. Downloading this project already includes the historical records. The date format is **YYYY-MM-DD**.

- Members: `member_id,name,department,status,semester`
- Events: `event_id,event_name,event_date,status,semester`
- Attendance: `attendance_id,event_id,member_id,attended,semester`
- Budget: `event_id,planned_budget,actual_spent,semester`

The API reads the four tabs, filters all four by semester, and calculates metrics dynamically. **Dates and budget are not hardcoded.** Current alert conditions are evaluated using the server's current date. The semester label comes from the data, not from the current date.

## Configure Google Sheets API (live API credit)

1. In Google Cloud Console, enable **Google Sheets API**.
2. Create a service account, download its credentials JSON.
3. Share your Google Spreadsheet with the service account email as **Viewer**.
4. In `.env`, set `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY` from the credentials JSON. Replace actual newlines in the private key with `\n` to keep it on one line.
5. Restart the server. On the Dashboard, the badge should now read **LIVE GOOGLE SHEETS**.
6. Edit a sheet cell and press **Refresh data**. The UI should change.

The service account credentials are used only server-side. **Never** place the private key in `/public` or commit `.env`.

## Configure Firebase login (required to meet Basic Requirements)

1. Firebase Console → create project → Authentication → Sign-in method → enable **Email/Password** and **Google**.
2. Add a Web App in Project Settings and copy the web config to `.env`: `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`.
3. Create **a separate Firebase Admin SDK service account** in Firebase Project Settings → Service accounts; set `FIREBASE_SERVICE_ACCOUNT_JSON` to the complete JSON string on one line (this is a Firebase credential, not the Google Sheets credential).
4. Add your deployment domain to **Firebase Authentication → Settings → Authorized domains**. On localhost, `localhost` is typically authorized but verify in your project.
5. Restart. Sign up with a fresh account, log out, log in, and test Google popup authentication. The backend verifies Firebase ID tokens before returning dashboard data.
6. For final grading, set `REQUIRE_LIVE_SERVICES=true` to disallow demo fallback and fail clearly if authentication or Sheets are missing.

For production, also restrict Google Cloud credentials/API exposure and do not deploy sample data containing real personal information (these CSVs are **fabricated mock records**).

## Deployment

Deploy Node.js server to **Render**, Railway, or a Node-hosting provider. Configure the same environment variables in the hosting dashboard; set start command `npm start`. A static-only host won't run this server. Verify the public URL, the Google popup authorized domain, and dashboard API response from a fresh browser.

## API

- `GET /api/config` — public Firebase web config and feature flags; **no private keys**.
- `GET /api/dashboard?term=2026%2F1` — stats, charts, notifications for that term. Requires `Authorization: Bearer <Firebase ID token>` when Firebase Admin is enabled.

## Important semantics

- `Budget > 80%` is **strictly greater** than 80, not greater-than-or-equal.
- Upcoming event alert is displayed when event date is **today through 3 days ahead**, inclusive.
- Alerts are *in-app on page load/refresh/semester change*, not background push or email notifications.
- Demo can be used to review the design, but does **not** by itself satisfy authentication or API integration grading criteria. Enable both services and demo the real data.

## Suggested demo

1. Sign up → log out → log in or sign in with Google.
2. Open `/api/dashboard` in the browser's network inspector to show response data.
3. Switch `2026/1` → `2025/2` → `2025/1` and show cards/charts updating.
4. Change an expense in the Google Sheet, refresh to show the stat and budget alert updating.
5. Switch light/dark mode and test on mobile.

## Attribution

Academic example for Lumina Club, with fabricated mock data. Fonts: Google Fonts (DM Sans, Playfair Display). Charts: Chart.js. Illustrations are CSS shapes and text glyphs. MIT License.
