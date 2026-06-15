# RevenueSprint 48 Railway Setup

## Local run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Without `DATABASE_URL`, the app stores data in `data/revenuesprint.json` for local testing.

## Railway production

1. Deploy this repository to Railway.
2. Add a Railway PostgreSQL service.
3. Make sure the web service has `DATABASE_URL` from the PostgreSQL service.
4. Railway starts the app with:

```bash
npm start
```

5. Health check:

```text
/health
```

## iPhone / PWA behavior

The Home Screen app uses `manifest.webmanifest` and `service-worker.js`.

The scanner state is stored on the server, not in browser `localStorage`, so reopening the iPhone app restores the CRM and Autopilot status from Railway.

Important: iOS does not guarantee normal JavaScript work in the background like a native app. RevenueSprint solves that by keeping scan state and Autopilot on the server. The phone is the control panel, not the worker.

## Outreach rule

The app can research, score, prepare drafts, export, and remind. It must not send mass messages automatically. Every follow-up draft is human-approved before sending.
