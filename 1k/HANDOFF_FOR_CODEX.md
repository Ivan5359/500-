# RevenueSprint 48 — Codex Handoff

## Current Goal

Build and polish a deployable web app for a productized B2B service:

**Quote Recovery Sprint**

Target customers: contractors and home-service businesses that send estimates/quotes and have old no-response leads.

Core offer:

> You send 20-50 old estimates or no-response leads. We segment them, write approved follow-up messages, and build a callback tracking board in 48 hours. Fixed $500.

Upsell:

> Monthly Recovery Autopilot for $299-799/month: weekly follow-up system for new estimates, callback board, reporting, and missed-lead recovery.

The user wants this to feel like a premium/luxury cosmic SaaS command center, work on phone, and be deployable as a real site.

## Workspace

Root:

```text
C:\Users\repki\Documents\1k
```

Main app:

```text
C:\Users\repki\Documents\1k\leadrescue-48\index.html
```

## Important Files

```text
index.html                              Root redirect to leadrescue-48/
server.js                               Node static server for Railway
package.json                            npm start -> node server.js
railway.json                            Railway config
Procfile                                web: npm start
RAILWAY_DEPLOY.md                       Railway instructions
DEPLOY.md                               GitHub Pages / Vercel / Netlify / Railway instructions
.nojekyll                               GitHub Pages support
vercel.json                             Vercel static config
netlify.toml                            Netlify static config

leadrescue-48/index.html                Main single-file app
leadrescue-48/manifest.webmanifest      PWA manifest
leadrescue-48/service-worker.js         PWA/offline cache
leadrescue-48/icon.svg                  PWA icon
leadrescue-48/README.md                 App instructions
leadrescue-48/SALES_SCRIPTS.md          Outreach scripts
leadrescue-48/CLIENT_ONE_PAGE_WORKFLOW.md
leadrescue-48/MONTHLY_AUTOPILOT.md
leadrescue-48/QUOTE_RECOVERY_OFFER.md
leadrescue-48/DAILY_OPERATOR_PLAYBOOK.md
leadrescue-48/STARTER_MARKETS.csv
leadrescue-48/quote-recovery-delivery-template.csv
leadrescue-48/review-cleanup-delivery-template.csv  Legacy/old idea; not primary
```

## Current App Features

### Product/Offer

The app is now centered on **Quote Recovery Sprint**, not Google reviews.

Primary customers:

- roofing contractors
- HVAC
- painting contractors
- flooring contractors
- fencing
- landscaping
- remodeling
- plumbers with high-ticket jobs

### Main UI Sections

The app has nav stages:

- `offer`
- `reviews` (renamed visually to smеты/quotes, but id is still `reviews`)
- `calculator`
- `prospects`
- `outreach`
- `crm`
- `autopilot`
- `delivery`

### Automation

Autopilot includes:

- `Full Auto Pipeline`
- `Lead Bot`
- `Deep Check сайтов`
- `Find Contacts`
- `Contact Hunt Pack`
- `Archive weak leads`
- `Build Today Pack`
- `Export Today Pack`
- `Mission Brief`
- `Copy Close Kit`
- `Luxe Focus`
- queue filters:
  - Ready
  - No Contact
  - Follow-ups
  - Replies
  - All

### Lead Bot

Lead Bot takes:

- cities
- niches
- radius
- max results per city/niche pair

It uses:

- Nominatim for geocoding
- Overpass API for OpenStreetMap business data

It adds leads into local CRM.

### Deep Check / Contact Finder

Deep Check attempts to:

- fetch business websites via `https://api.allorigins.win/raw?url=...`
- detect quote/estimate signals:
  - free estimate
  - request quote
  - get a quote
  - schedule estimate
- detect contractor/service keywords
- detect phone/email
- extract:
  - emails
  - phones
  - contact/quote/estimate form links
  - Facebook/Instagram/LinkedIn links

Fallback:

- If a website cannot be read, it scores by metadata.
- If no contact is found, it provides search routes:
  - Email Hunt
  - Form Hunt
  - Social Hunt

### CRM

Stored in browser localStorage.

Lead fields may include:

- id
- business
- contact
- bestContact
- contactEmail
- contactPhone
- contactForm
- contactSocial
- contactSummary
- niche
- status
- note
- verified
- verifyScore
- verifySummary
- sentAt
- followUpDue
- lastFollowUpAt
- repliedAt
- wonAt

Statuses used:

- To contact
- Sent
- Replied
- Call booked
- Won
- Lost
- Archived

### Follow-up Automation

When status becomes `Sent`:

- `sentAt` is set
- `followUpDue` is set for 3 days later

When `Done FU` is clicked:

- `lastFollowUpAt` is set
- next `followUpDue` is set for 5 days later

### Backup

CRM uses localStorage, so different browsers/devices do not share data.

Added:

- Backup JSON
- Import JSON
- CSV export

Backup JSON includes:

- leads
- tasks
- daily history
- bot settings

## Current Design State

The user wants:

- maximum minimalism
- premium/luxury
- black-blue palette
- cosmic/galaxy theme
- not tacky or overloaded
- mobile polished
- "like a paid product"

Current design has had many layered CSS overrides. It works, but the next Codex should strongly consider a cleaner CSS refactor because many theme layers were appended over time.

Current visual features:

- dark black-blue theme
- animated galaxy canvas
- mobile bottom nav
- SVG nav icons
- minimal orbital background
- glass panels
- Smart Command panel
- Mission Brief / Today Pack / Contact Hunt outputs

Important recent user feedback:

- User disliked bottom icons; replaced text symbols with SVG icons.
- User asked to remove headline "Закрой первые $500..." and keep minimal labels.
- User wants labels like Автопилот visible.
- User wants more minimal cosmic luxury, not noisy galaxy.

## Known Limitations

1. **No shared database yet**
   - CRM is per-browser localStorage.
   - Use Backup JSON / Import JSON for transfer.
   - Railway deployment alone will not make shared data unless backend/database is added.

2. **Contact extraction is imperfect**
   - Browser-side CORS blocks many websites.
   - Uses AllOrigins proxy, which can fail.
   - OSM data often lacks websites/emails.
   - Contact Hunt links are fallback.

3. **No automatic sending**
   - This is intentional.
   - Fully automated cold outbound risks bans/legal issues.
   - App prepares contacts/messages; user confirms sending.

4. **No real auth/backend**
   - Static app plus Node static server.
   - Railway currently only serves files.

5. **Testing limitation**
   - Previous shell/node/browser automation failed locally with:
     `CreateProcessAsUserW failed: 5`
   - Changes were applied via `apply_patch`, not verified by automated browser tests.

## Deployment

The user chose Railway.

Railway files:

```text
package.json
server.js
railway.json
Procfile
RAILWAY_DEPLOY.md
```

Run command:

```bash
npm start
```

Health path:

```text
/health
```

Root redirect:

```text
/ -> /leadrescue-48/
```

## Suggested Next Improvements

### Highest Priority

1. **Clean CSS architecture**
   - Consolidate repeated overrides.
   - Move styles into separate CSS file.
   - Keep one final design system, not many stacked layers.

2. **Backend + database**
   - Railway + Postgres/Supabase/SQLite.
   - Store leads centrally.
   - Make phone/desktop share one CRM.

3. **Server-side contact checking**
   - Move website fetch/contact parsing to server.
   - Avoid browser CORS issues.
   - Add rate limiting and queue.

4. **Real deployment**
   - Push to GitHub.
   - Deploy to Railway.
   - Test phone install/PWA.

5. **UX pass**
   - Reduce text in app.
   - Make Autopilot the main screen.
   - Hide secondary tools behind menus/tabs.
   - Improve mobile bottom nav.

### Contact Finder Backend Idea

Server endpoints:

```text
POST /api/check-site
POST /api/find-contacts
POST /api/leadbot
GET /api/leads
POST /api/leads
PATCH /api/leads/:id
```

Use server fetch to:

- read website homepage
- crawl likely contact pages:
  - /contact
  - /contact-us
  - /get-a-quote
  - /request-estimate
  - /free-estimate
- parse mailto/tel/social links
- store confidence score

### Better Data Sources

OpenStreetMap is safe but incomplete.

Potential upgrades:

- Google Places API (requires key and cost)
- SerpAPI (requires key and cost)
- Yelp Fusion API (requires key)
- DataForSEO (paid)
- Apify actors (paid/scraping risk)

Use compliant APIs where possible.

## Current Sales Copy

Main cold message:

```text
Hi, quick idea for your business.

Do you have old estimates or leads where the homeowner went quiet after comparing options?

I help contractors run a 48-hour quote recovery sprint: you send 20-50 past quotes/leads, I segment them, write approved follow-ups, and set up a simple callback tracking board.

Fixed $500 for the first sprint. If one old estimate turns back into a job, it can pay for itself.

Want me to send the one-page workflow?
```

Close kit:

```text
Great. The workflow is simple:

1. You send 20-50 old estimates or no-response leads.
2. I segment them into Hot / Warm / Cold.
3. I write approved follow-up messages.
4. I build a callback tracking board.
5. You or your team handles the actual calls/bookings.

The first sprint is $500 and takes 48 hours after I receive the list.

If you want to start, I can send the invoice and onboarding checklist now.
```

## User Preferences

The user:

- wants maximum autonomy from Codex
- wants "do everything possible"
- wants less manual work
- wants premium/luxury design
- wants cosmic black-blue minimalism
- wants mobile support
- wants deployment as real site
- prefers direct action over long explanation
- is frustrated by bugs/resets/confusing UI
- does not want cheap-looking icons
- wants labels visible

## What To Tell The Next Codex

Continue from this workspace. Do not restart the product idea. The current product direction is:

**Quote Recovery Sprint for contractors**

Primary next mission:

1. Clean/refactor UI into a truly premium minimal cosmic design.
2. Deploy or help deploy on Railway.
3. Add backend/database if possible.
4. Make contact finding more reliable server-side.
5. Preserve existing feature set unless replacing with a cleaner architecture.
