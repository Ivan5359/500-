# Railway Deploy

## What Railway Runs

Railway runs:

```bash
npm start
```

That starts `server.js`, which serves the static RevenueSprint app.

## Required Settings

- Root directory: project root
- Start command: `npm start`
- Health check path: `/health`
- Port: Railway sets `PORT` automatically

## After Deploy

Open the Railway public URL. It should redirect to:

```text
/leadrescue-48/
```

On mobile, open the Railway URL and use:

- iPhone: Share -> Add to Home Screen
- Android: menu -> Add to Home screen
