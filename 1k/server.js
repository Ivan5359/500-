import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "leadrescue-48");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "revenuesprint.json");
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const USER_AGENT = "RevenueSprint48/2.0 (quote recovery lead research; human-approved outreach)";
const FETCH_TIMEOUT_MS = 9000;
const SCAN_INTERVAL_MS = Number(process.env.SCAN_INTERVAL_MS || 5 * 60 * 1000);

const { Pool } = pg;
const app = express();
let pool = null;
let storageMode = "file";
let scanTimer = null;
let scanRunning = false;

app.use(express.json({ limit: "5mb" }));
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (filePath.endsWith("service-worker.js")) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Service-Worker-Allowed", "/");
    }
    if (filePath.endsWith("manifest.webmanifest")) {
      res.setHeader("Content-Type", "application/manifest+json");
    }
  }
}));

function nowIso() {
  return new Date().toISOString();
}

function safeId(prefix = "lead") {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function clean(value) {
  return String(value || "").trim();
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function inferCategory(text = "") {
  const value = text.toLowerCase();
  const categories = ["roofing", "hvac", "painting", "flooring", "fencing", "landscaping", "remodeling", "plumbing"];
  return categories.find((item) => value.includes(item)) || "local contractor";
}

function normalizePhone(phone = "") {
  const digits = String(phone).replace(/[^\d+]/g, "");
  return digits.length >= 10 ? phone : "";
}

function defaultNextAction(temperature) {
  if (temperature === "Hot") return "Send human-approved recovery message today";
  if (temperature === "Warm") return "Review quote gap and schedule follow-up";
  return "Park in nurture lane and check for missing contact data";
}

function buildFollowUpMessage({ name, category, temperature } = {}) {
  const business = name || "there";
  const niche = category || "contractor";
  if (temperature === "Hot") {
    return `Hi ${business}, quick question: do you still have older ${niche} estimates that never closed? We help turn those quiet quotes into a clean 48-hour follow-up list before the week disappears.`;
  }
  if (temperature === "Cold") {
    return `Hi ${business}, I put together a simple way for ${niche} teams to revive old estimates without sending spam. Worth sending you the 48-hour recovery outline?`;
  }
  return `Hi ${business}, noticed many ${niche} teams leave revenue sitting in old quotes. We can sort your past leads into Hot/Warm/Cold and give you the exact follow-up list in 48 hours.`;
}

function scoreLead(lead = {}) {
  let score = 38;
  const text = `${lead.businessName || lead.name || ""} ${lead.category || ""}`.toLowerCase();
  if (/roof|hvac|plumb|remodel|floor|fenc|paint|landscap/.test(text)) score += 18;
  if (lead.website) score += 14;
  if (lead.phone) score += 12;
  if (lead.email) score += 10;
  if (lead.city || lead.state) score += 6;
  if (lead.valueEstimate) score += Math.min(12, Number(lead.valueEstimate) / 1000);
  return clampScore(score);
}

function normalizeLead(input = {}) {
  const name = clean(input.businessName || input.business_name || input.name || input.title);
  const category = clean(input.category || inferCategory(`${name} ${input.type || ""}`));
  const city = clean(input.city || input.town || input.location);
  const state = clean(input.state || input.region);
  const website = clean(input.website || input.url || input.homepage);
  const phone = clean(input.phone || input.telephone);
  const email = clean(input.email);
  const score = clampScore(input.score || scoreLead({ ...input, website, phone, email, category }));
  const temperature = input.temperature || (score >= 78 ? "Hot" : score >= 48 ? "Warm" : "Cold");

  return {
    id: clean(input.id) || safeId(),
    businessName: name || "Unnamed contractor",
    category,
    city,
    state,
    source: clean(input.source) || "manual",
    website,
    phone,
    email,
    ownerName: clean(input.ownerName || input.owner_name),
    valueEstimate: Number(input.valueEstimate || input.value_estimate || 0),
    status: clean(input.status) || "New",
    temperature,
    score,
    notes: clean(input.notes),
    nextAction: clean(input.nextAction || input.next_action) || defaultNextAction(temperature),
    followUpMessage: clean(input.followUpMessage || input.follow_up_message) || buildFollowUpMessage({ name, category, temperature }),
    followUpDue: input.followUpDue || input.follow_up_due || addDays(temperature === "Hot" ? 0 : temperature === "Warm" ? 1 : 3),
    lastChecked: input.lastChecked || input.last_checked || null,
    raw: input.raw || input
  };
}

function toDbRow(lead) {
  return {
    id: lead.id,
    business_name: lead.businessName,
    category: lead.category,
    city: lead.city,
    state: lead.state,
    source: lead.source,
    website: lead.website,
    phone: lead.phone,
    email: lead.email,
    owner_name: lead.ownerName,
    value_estimate: lead.valueEstimate,
    status: lead.status,
    temperature: lead.temperature,
    score: lead.score,
    notes: lead.notes,
    next_action: lead.nextAction,
    follow_up_message: lead.followUpMessage,
    follow_up_due: lead.followUpDue,
    last_checked: lead.lastChecked,
    raw: lead.raw
  };
}

function fromDbRow(row = {}) {
  return {
    id: row.id,
    businessName: row.business_name,
    category: row.category,
    city: row.city,
    state: row.state,
    source: row.source,
    website: row.website,
    phone: row.phone,
    email: row.email,
    ownerName: row.owner_name,
    valueEstimate: Number(row.value_estimate || 0),
    status: row.status,
    temperature: row.temperature,
    score: Number(row.score || 0),
    notes: row.notes,
    nextAction: row.next_action,
    followUpMessage: row.follow_up_message,
    followUpDue: row.follow_up_due,
    lastChecked: row.last_checked,
    raw: row.raw || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function defaultSettings() {
  return {
    autopilot: {
      enabled: false,
      running: false,
      query: "roofing contractor",
      city: "Austin",
      radiusKm: 12,
      dailyLimit: 25,
      lastRunAt: null,
      nextRunAt: null,
      lastResult: null
    }
  };
}

async function initStorage() {
  if (DATABASE_URL) {
    const requiresSsl = /sslmode=require/i.test(DATABASE_URL) || ["require", "no-verify"].includes(process.env.PGSSLMODE);
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: requiresSsl ? { rejectUnauthorized: false } : false
    });
    await pool.query("select 1");
    storageMode = "postgres";
    await migratePostgres();
    return;
  }

  storageMode = "file";
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await writeFileStore({ leads: [], settings: defaultSettings() });
  }
}

async function migratePostgres() {
  await pool.query(`
    create table if not exists leads (
      id text primary key,
      business_name text not null,
      category text,
      city text,
      state text,
      source text,
      website text,
      phone text,
      email text,
      owner_name text,
      value_estimate numeric default 0,
      status text default 'New',
      temperature text default 'Warm',
      score integer default 0,
      notes text,
      next_action text,
      follow_up_message text,
      follow_up_due timestamptz,
      last_checked timestamptz,
      raw jsonb default '{}'::jsonb,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `);
  await pool.query(`
    create table if not exists app_settings (
      key text primary key,
      value jsonb not null,
      updated_at timestamptz default now()
    );
  `);
  await setSettingIfMissing("autopilot", defaultSettings().autopilot);
}

async function readFileStore() {
  const text = await fs.readFile(DATA_FILE, "utf8");
  const store = JSON.parse(text);
  return {
    leads: Array.isArray(store.leads) ? store.leads : [],
    settings: { ...defaultSettings(), ...(store.settings || {}) }
  };
}

async function writeFileStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

async function setSettingIfMissing(key, value) {
  const existing = await pool.query("select key from app_settings where key = $1", [key]);
  if (!existing.rowCount) {
    await pool.query("insert into app_settings (key, value) values ($1, $2)", [key, value]);
  }
}

async function getSetting(key) {
  if (storageMode === "postgres") {
    const result = await pool.query("select value from app_settings where key = $1", [key]);
    return result.rows[0]?.value || defaultSettings()[key];
  }
  const store = await readFileStore();
  return store.settings[key] || defaultSettings()[key];
}

async function setSetting(key, value) {
  if (storageMode === "postgres") {
    await pool.query(
      `insert into app_settings (key, value, updated_at)
       values ($1, $2, now())
       on conflict (key)
       do update set value = excluded.value, updated_at = now()`,
      [key, value]
    );
    return value;
  }
  const store = await readFileStore();
  store.settings[key] = value;
  await writeFileStore(store);
  return value;
}

async function listLeads() {
  if (storageMode === "postgres") {
    const result = await pool.query("select * from leads order by updated_at desc, created_at desc");
    return result.rows.map(fromDbRow);
  }
  const store = await readFileStore();
  return store.leads.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function upsertLead(input) {
  const lead = normalizeLead(input);
  const timestamp = nowIso();
  lead.updatedAt = timestamp;
  lead.createdAt = input.createdAt || input.created_at || timestamp;

  if (storageMode === "postgres") {
    const row = toDbRow(lead);
    await pool.query(
      `insert into leads (
        id, business_name, category, city, state, source, website, phone, email, owner_name,
        value_estimate, status, temperature, score, notes, next_action, follow_up_message,
        follow_up_due, last_checked, raw, created_at, updated_at
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now(),now()
      )
      on conflict (id)
      do update set
        business_name = excluded.business_name,
        category = excluded.category,
        city = excluded.city,
        state = excluded.state,
        source = excluded.source,
        website = excluded.website,
        phone = excluded.phone,
        email = excluded.email,
        owner_name = excluded.owner_name,
        value_estimate = excluded.value_estimate,
        status = excluded.status,
        temperature = excluded.temperature,
        score = excluded.score,
        notes = excluded.notes,
        next_action = excluded.next_action,
        follow_up_message = excluded.follow_up_message,
        follow_up_due = excluded.follow_up_due,
        last_checked = excluded.last_checked,
        raw = excluded.raw,
        updated_at = now()`,
      [
        row.id, row.business_name, row.category, row.city, row.state, row.source, row.website,
        row.phone, row.email, row.owner_name, row.value_estimate, row.status, row.temperature,
        row.score, row.notes, row.next_action, row.follow_up_message, row.follow_up_due,
        row.last_checked, row.raw
      ]
    );
    return lead;
  }

  const store = await readFileStore();
  const index = store.leads.findIndex((item) => item.id === lead.id);
  if (index >= 0) {
    lead.createdAt = store.leads[index].createdAt || lead.createdAt;
    store.leads[index] = { ...store.leads[index], ...lead };
  } else {
    store.leads.unshift(lead);
  }
  await writeFileStore(store);
  return lead;
}

async function patchLead(id, patch) {
  const leads = await listLeads();
  const existing = leads.find((lead) => lead.id === id);
  if (!existing) return null;
  return upsertLead({ ...existing, ...patch, id });
}

async function deleteLead(id) {
  if (storageMode === "postgres") {
    const result = await pool.query("delete from leads where id = $1", [id]);
    return result.rowCount > 0;
  }
  const store = await readFileStore();
  const before = store.leads.length;
  store.leads = store.leads.filter((lead) => lead.id !== id);
  await writeFileStore(store);
  return store.leads.length !== before;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/html;q=0.9,*/*;q=0.7",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function nominatimSearch({ query, city, limit = 20 }) {
  const searchText = [query, city].filter(Boolean).join(" in ");
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", searchText || "roofing contractor");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("limit", String(Math.min(50, Math.max(1, Number(limit) || 20))));
  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
  return response.json();
}

function leadFromPlace(place, params = {}) {
  const address = place.address || {};
  const name = place.name || place.display_name?.split(",")[0] || params.query || "Local contractor";
  const city = address.city || address.town || address.village || address.county || params.city || "";
  const state = address.state || "";
  const website = place.extratags?.website || place.extratags?.contact_website || "";
  const phone = normalizePhone(place.extratags?.phone || place.extratags?.contact_phone || "");
  const email = place.extratags?.email || place.extratags?.contact_email || "";
  return normalizeLead({
    id: `osm_${place.osm_type}_${place.osm_id}`,
    businessName: name,
    category: inferCategory(`${params.query || ""} ${place.type || ""}`),
    city,
    state,
    source: "nominatim",
    website,
    phone,
    email,
    raw: place
  });
}

async function runScan(params = {}) {
  const autopilot = await getSetting("autopilot");
  const limit = Math.min(Number(params.limit || params.dailyLimit || autopilot.dailyLimit || 20), 50);
  const query = clean(params.query || autopilot.query || "roofing contractor");
  const city = clean(params.city || autopilot.city || "");
  const startedAt = nowIso();
  const places = await nominatimSearch({ query, city, limit });
  const leads = [];
  const seen = new Set((await listLeads()).map((lead) => lead.id));

  for (const place of places) {
    const lead = leadFromPlace(place, { query, city });
    if (seen.has(lead.id)) continue;
    leads.push(await upsertLead(lead));
    seen.add(lead.id);
  }

  const result = {
    startedAt,
    finishedAt: nowIso(),
    query,
    city,
    found: places.length,
    added: leads.length,
    leads
  };

  await setSetting("autopilot", {
    ...autopilot,
    query,
    city,
    lastRunAt: result.finishedAt,
    nextRunAt: autopilot.enabled ? new Date(Date.now() + SCAN_INTERVAL_MS).toISOString() : null,
    lastResult: {
      found: result.found,
      added: result.added,
      finishedAt: result.finishedAt
    }
  });

  return result;
}

function extractEmails(html) {
  const emailMatches = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return [...new Set(emailMatches.map((email) => email.toLowerCase()))].slice(0, 5);
}

function extractPhones(html) {
  const phoneMatches = html.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g) || [];
  return [...new Set(phoneMatches.map((phone) => phone.trim()))].slice(0, 5);
}

function extractTitle(html) {
  return clean((html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]).slice(0, 120);
}

async function deepCheckLead(lead) {
  const website = clean(lead.website);
  if (!website) {
    return {
      ...lead,
      lastChecked: nowIso(),
      notes: [lead.notes, "Deep Check: no website yet. Use Contact Finder or manual search."].filter(Boolean).join("\n")
    };
  }

  const url = website.startsWith("http") ? website : `https://${website}`;
  try {
    const response = await fetchWithTimeout(url, { headers: { Accept: "text/html,*/*" } });
    const html = await response.text();
    const emails = extractEmails(html);
    const phones = extractPhones(html);
    const title = extractTitle(html);
    const nextScore = scoreLead({
      ...lead,
      email: lead.email || emails[0],
      phone: lead.phone || phones[0],
      website
    });
    const temperature = nextScore >= 78 ? "Hot" : nextScore >= 48 ? "Warm" : "Cold";
    return {
      ...lead,
      email: lead.email || emails[0] || "",
      phone: lead.phone || phones[0] || "",
      score: nextScore,
      temperature,
      lastChecked: nowIso(),
      nextAction: defaultNextAction(temperature),
      followUpMessage: buildFollowUpMessage({ name: lead.businessName, category: lead.category, temperature }),
      notes: [
        lead.notes,
        `Deep Check: ${response.ok ? "site reachable" : `site returned ${response.status}`}${title ? `, title "${title}"` : ""}.`
      ].filter(Boolean).join("\n")
    };
  } catch (error) {
    return {
      ...lead,
      lastChecked: nowIso(),
      notes: [lead.notes, `Deep Check: site check failed (${error.message}).`].filter(Boolean).join("\n")
    };
  }
}

function leadsToCsv(leads) {
  const headers = [
    "businessName", "category", "city", "state", "temperature", "score", "status",
    "website", "phone", "email", "nextAction", "followUpDue", "followUpMessage", "notes"
  ];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...leads.map((lead) => headers.map((key) => escape(lead[key])).join(","))
  ].join("\n");
}

async function autopilotTick() {
  if (scanRunning) return;
  const autopilot = await getSetting("autopilot");
  if (!autopilot.enabled) return;
  scanRunning = true;
  await setSetting("autopilot", { ...autopilot, running: true });
  try {
    await runScan(autopilot);
  } catch (error) {
    await setSetting("autopilot", {
      ...autopilot,
      running: false,
      lastRunAt: nowIso(),
      nextRunAt: new Date(Date.now() + SCAN_INTERVAL_MS).toISOString(),
      lastResult: { error: error.message, finishedAt: nowIso() }
    });
  } finally {
    const latest = await getSetting("autopilot");
    await setSetting("autopilot", {
      ...latest,
      running: false,
      nextRunAt: latest.enabled ? new Date(Date.now() + SCAN_INTERVAL_MS).toISOString() : null
    });
    scanRunning = false;
  }
}

async function configureAutopilot(input = {}) {
  const current = await getSetting("autopilot");
  const next = {
    ...current,
    ...input,
    enabled: Boolean(input.enabled),
    running: false,
    query: clean(input.query || current.query || "roofing contractor"),
    city: clean(input.city || current.city || ""),
    radiusKm: Number(input.radiusKm || current.radiusKm || 12),
    dailyLimit: Math.min(50, Math.max(1, Number(input.dailyLimit || current.dailyLimit || 25))),
    nextRunAt: input.enabled ? new Date(Date.now() + SCAN_INTERVAL_MS).toISOString() : null
  };
  await setSetting("autopilot", next);
  if (next.enabled) startAutopilotLoop();
  return next;
}

function startAutopilotLoop() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(() => {
    autopilotTick().catch((error) => console.error("Autopilot tick failed:", error));
  }, SCAN_INTERVAL_MS);
}

app.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    app: "RevenueSprint 48",
    storage: storageMode,
    time: nowIso()
  });
});

app.get("/api/leads", async (_req, res, next) => {
  try {
    res.json({ leads: await listLeads() });
  } catch (error) {
    next(error);
  }
});

app.post("/api/leads", async (req, res, next) => {
  try {
    res.status(201).json({ lead: await upsertLead(req.body) });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/leads/:id", async (req, res, next) => {
  try {
    const lead = await patchLead(req.params.id, req.body);
    if (!lead) return res.status(404).json({ error: "Lead not found" });
    res.json({ lead });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/leads/:id", async (req, res, next) => {
  try {
    const deleted = await deleteLead(req.params.id);
    res.status(deleted ? 200 : 404).json({ deleted });
  } catch (error) {
    next(error);
  }
});

app.post("/api/scan", async (req, res, next) => {
  try {
    res.json(await runScan(req.body));
  } catch (error) {
    next(error);
  }
});

app.get("/api/autopilot/status", async (_req, res, next) => {
  try {
    res.json({ autopilot: await getSetting("autopilot") });
  } catch (error) {
    next(error);
  }
});

app.post("/api/autopilot/start", async (req, res, next) => {
  try {
    const autopilot = await configureAutopilot({ ...req.body, enabled: true });
    res.json({ autopilot });
  } catch (error) {
    next(error);
  }
});

app.post("/api/autopilot/stop", async (_req, res, next) => {
  try {
    const current = await getSetting("autopilot");
    const autopilot = await configureAutopilot({ ...current, enabled: false });
    res.json({ autopilot });
  } catch (error) {
    next(error);
  }
});

app.post("/api/deep-check", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const leads = await listLeads();
    const targets = ids.length ? leads.filter((lead) => ids.includes(lead.id)) : leads.slice(0, Number(req.body.limit || 10));
    const checked = [];
    for (const lead of targets) {
      checked.push(await upsertLead(await deepCheckLead(lead)));
    }
    res.json({ checked });
  } catch (error) {
    next(error);
  }
});

app.post("/api/contact-finder", async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const leads = await listLeads();
    const targets = ids.length ? leads.filter((lead) => ids.includes(lead.id)) : leads.slice(0, Number(req.body.limit || 15));
    const checked = [];
    for (const lead of targets) {
      checked.push(await upsertLead(await deepCheckLead(lead)));
    }
    res.json({ checked });
  } catch (error) {
    next(error);
  }
});

app.post("/api/pipeline", async (req, res, next) => {
  try {
    const scan = await runScan(req.body);
    const checked = [];
    for (const lead of scan.leads.slice(0, Number(req.body.deepCheckLimit || 12))) {
      checked.push(await upsertLead(await deepCheckLead(lead)));
    }
    res.json({ scan, checked });
  } catch (error) {
    next(error);
  }
});

app.post("/api/export", async (_req, res, next) => {
  try {
    const leads = await listLeads();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"revenuesprint-leads.csv\"");
    res.send(leadsToCsv(leads));
  } catch (error) {
    next(error);
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "RevenueSprint server error",
    detail: process.env.NODE_ENV === "production" ? "Check Railway logs for details." : error.message
  });
});

await initStorage();
const bootAutopilot = await getSetting("autopilot");
if (bootAutopilot?.enabled) startAutopilotLoop();

app.listen(PORT, () => {
  console.log(`RevenueSprint 48 running on port ${PORT} with ${storageMode} storage`);
});
