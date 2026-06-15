# Deploy RevenueSprint 48

## Best Option Right Now

Use `GitHub Pages`, `Vercel`, or `Netlify`.

This app is currently a static frontend with browser storage, so Railway is not required unless you want a real backend/database later.

## GitHub Pages

1. Create a GitHub repository.
2. Upload or push this folder.
3. Go to `Settings` -> `Pages`.
4. Source: deploy from branch.
5. Branch: `main`.
6. Folder: `/root`.
7. Open the generated GitHub Pages URL.

The root `index.html` redirects to `leadrescue-48/`.

## Vercel

1. Import the GitHub repository into Vercel.
2. Framework preset: `Other`.
3. Build command: leave empty.
4. Output directory: `.`.
5. Deploy.

## Netlify

1. Import the GitHub repository into Netlify.
2. Build command: leave empty.
3. Publish directory: `.`.
4. Deploy.

## Railway

Railway will work with the included `server.js`.

1. Create a new Railway project from GitHub.
2. Railway detects Node.
3. Start command: `npm start`.
4. Deploy.

Railway is useful later if we add:

- shared database;
- logins;
- server-side lead checks;
- email connector;
- scheduled scans.

## Mobile

After deploying, open the site on your phone and use:

- iPhone Safari: `Share` -> `Add to Home Screen`.
- Android Chrome: menu -> `Add to Home screen`.

The app includes a PWA manifest and service worker for app-like behavior.
