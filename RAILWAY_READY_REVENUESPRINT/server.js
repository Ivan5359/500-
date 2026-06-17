const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    Pragma: 'no-cache',
    Expires: '0'
  });
  res.end(body);
}

function serve(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, 'Not found');
      return;
    }
    send(res, 200, data, types[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  });
}

function safeJoin(base, requestPath) {
  const clean = decodeURIComponent(requestPath.split('?')[0]);
  const target = path.normalize(path.join(base, clean));
  return target.startsWith(base) ? target : null;
}

function sendJson(res, status, body) {
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

const nicheMap = {
  roofing: ['roof', 'roofing', 'roofer'],
  hvac: ['hvac', 'heating', 'cooling', 'air conditioning'],
  painting: ['paint', 'painting', 'painter'],
  flooring: ['floor', 'flooring'],
  fencing: ['fence', 'fencing'],
  landscaping: ['landscape', 'landscaping', 'lawn'],
  remodeling: ['remodel', 'renovation', 'contractor'],
  plumbing: ['plumb', 'plumbing', 'plumber']
};

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function leadId(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `l_${(hash >>> 0).toString(16)}`;
}

function inferNiche(tags) {
  const text = normalizeText(Object.values(tags || {}).join(' '));
  for (const [id, words] of Object.entries(nicheMap)) {
    if (words.some((word) => text.includes(normalizeText(word)))) {
      return id.charAt(0).toUpperCase() + id.slice(1);
    }
  }
  return 'Contractor';
}

function cleanWebsite(value) {
  if (!value) return '';
  let text = String(value).trim();
  if (!text) return '';
  if (!/^https?:\/\//i.test(text)) text = `https://${text}`;
  try {
    return new URL(text).href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function osmToLead(element, city) {
  const tags = element.tags || {};
  const name = tags.name || tags.brand || tags.operator || '';
  if (!name) return null;

  const website = tags.website || tags['contact:website'] || tags.url || '';
  const phone = tags.phone || tags['contact:phone'] || '';
  const email = tags.email || tags['contact:email'] || '';
  const address = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:state']
  ].filter(Boolean).join(' ');

  return {
    id: leadId(`${name}|${city}|${website}|${address}`),
    name,
    city,
    niche: inferNiche(tags),
    website: cleanWebsite(website),
    phone,
    email,
    form: '',
    social: '',
    address,
    source: 'Server OSM',
    status: email || phone || website ? 'Ready' : 'Need Contact',
    notes: tags.description || ''
  };
}

function overpassQuery(lat, lon, radius, nicheIds) {
  const selected = String(nicheIds || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const chosen = selected.length ? selected : Object.keys(nicheMap);
  const words = chosen.flatMap((id) => nicheMap[id] || []).join('|') || 'roof|hvac|paint|floor|fence|landscape|remodel|plumb';

  return `[out:json][timeout:35];
(
  nwr["craft"~"roofer|plumber|painter|floorer|hvac|landscaper|builder|carpenter|electrician",i](around:${radius},${lat},${lon});
  nwr["name"~"${words}",i](around:${radius},${lat},${lon});
  nwr["office"="company"]["name"~"${words}",i](around:${radius},${lat},${lon});
  nwr["shop"~"flooring|paint|hardware|doityourself",i](around:${radius},${lat},${lon});
);
out center tags 240;`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 30000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RevenueSprint48/1.0 contact@example.com',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function nominatimToLead(item, city, nicheLabel) {
  const display = item.display_name || '';
  const name =
    item.namedetails?.name ||
    item.namedetails?.['name:en'] ||
    item.name ||
    display.split(',')[0] ||
    'Unknown business';
  const tags = item.extratags || {};
  const address = item.address || {};
  const website = tags.website || tags['contact:website'] || tags.url || '';
  const phone = tags.phone || tags['contact:phone'] || '';
  const email = tags.email || tags['contact:email'] || '';

  return {
    id: leadId(`nominatim|${item.osm_type}|${item.osm_id}|${name}|${city}`),
    name,
    city,
    niche: nicheLabel || inferNiche(tags),
    website: cleanWebsite(website),
    phone,
    email,
    form: '',
    social: '',
    address: [
      address.house_number,
      address.road,
      address.city || address.town || address.village,
      address.state
    ].filter(Boolean).join(' ') || display,
    source: 'Server Nominatim',
    status: email || phone || website ? 'Ready' : 'Need Contact',
    notes: display
  };
}

async function fallbackNominatimSearch(city, limit, nicheIds) {
  const selected = String(nicheIds || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const chosen = selected.length ? selected : ['roofing', 'hvac', 'painting', 'flooring', 'fencing', 'landscaping', 'remodeling', 'plumbing'];
  const labels = {
    roofing: 'Roofing',
    hvac: 'HVAC',
    painting: 'Painting',
    flooring: 'Flooring',
    fencing: 'Fencing',
    landscaping: 'Landscaping',
    remodeling: 'Remodeling',
    plumbing: 'Plumbing'
  };
  const seen = new Set();
  const leads = [];

  for (const niche of chosen) {
    if (leads.length >= limit) break;
    const label = labels[niche] || niche;
    const queries = [
      `${label} contractor ${city}`,
      `${label} company ${city}`
    ];

    for (const query of queries) {
      if (leads.length >= limit) break;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=12&addressdetails=1&extratags=1&namedetails=1&q=${encodeURIComponent(query)}`;
        const results = await fetchJson(url, { timeout: 18000 });
        for (const item of results || []) {
          const lead = nominatimToLead(item, city, label);
          const key = normalizeText(`${lead.name}|${lead.address}|${lead.website}`);
          if (!lead.name || seen.has(key)) continue;
          seen.add(key);
          leads.push(lead);
          if (leads.length >= limit) break;
        }
      } catch {
        // Continue with the next query. The route returns a useful error only if every source fails.
      }
    }
  }

  return leads;
}

async function scanBusinesses({ city, radius, limit, niches }) {
  const geo = await fetchJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(city)}`, { timeout: 16000 });
  if (!geo.length) throw new Error('City not found');

  const lat = Number(geo[0].lat);
  const lon = Number(geo[0].lon);
  const query = overpassQuery(lat, lon, radius, niches);
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.openstreetmap.ru/api/interpreter'
  ];

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const data = await fetchJson(endpoint, {
        method: 'POST',
        body: query,
        timeout: 36000,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
      });
      const seen = new Set();
      const leads = (data.elements || [])
        .map((element) => osmToLead(element, city))
        .filter(Boolean)
        .filter((lead) => {
          const key = normalizeText(`${lead.name}|${lead.website}|${lead.address}`);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .slice(0, limit);
      if (!leads.length) {
        const fallbackLeads = await fallbackNominatimSearch(city, limit, niches);
        return {
          cityLabel: geo[0].display_name,
          endpoint: `${endpoint} + nominatim-fallback-empty`,
          leads: fallbackLeads
        };
      }
      return {
        cityLabel: geo[0].display_name,
        endpoint,
        leads
      };
    } catch (error) {
      lastError = error;
    }
  }
  const fallbackLeads = await fallbackNominatimSearch(city, limit, niches);
  if (fallbackLeads.length) {
    return {
      cityLabel: geo[0].display_name,
      endpoint: 'nominatim-fallback',
      leads: fallbackLeads
    };
  }
  throw lastError || new Error('Scan failed');
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (url.pathname === '/health') {
    send(res, 200, JSON.stringify({ ok: true, app: 'Lead Desk', version: '2026-06-17-server-scan' }), 'application/json; charset=utf-8');
    return;
  }

  if (url.pathname === '/api/scan') {
    const city = String(url.searchParams.get('city') || '').trim();
    const radius = Math.max(1000, Math.min(50000, Number(url.searchParams.get('radius') || 10000)));
    const limit = Math.max(5, Math.min(120, Number(url.searchParams.get('limit') || 60)));
    const niches = url.searchParams.get('niches') || '';

    if (!city) {
      sendJson(res, 400, { ok: false, error: 'City is required' });
      return;
    }

    scanBusinesses({ city, radius, limit, niches })
      .then((result) => sendJson(res, 200, { ok: true, ...result }))
      .catch((error) => sendJson(res, 502, { ok: false, error: error.message || 'Scan failed' }));
    return;
  }

  if (url.pathname === '/presentation' || url.pathname === '/presentation.html') {
    serve(res, path.join(publicDir, 'presentation.html'));
    return;
  }

  if (url.pathname === '/guide' || url.pathname === '/guide.html') {
    serve(res, path.join(publicDir, 'guide.html'));
    return;
  }

  let filePath = url.pathname === '/' ? path.join(publicDir, 'index.html') : safeJoin(publicDir, url.pathname);
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.stat(filePath, (fileErr, fileStat) => {
      if (!fileErr && fileStat.isFile()) serve(res, filePath);
      else serve(res, path.join(publicDir, 'index.html'));
    });
  });
}).listen(port, () => {
  console.log(`RevenueSprint 48 running on ${port}`);
});
