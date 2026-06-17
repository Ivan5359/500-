const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const VERSION = 'SWISS_FINAL_20260617_1900';

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

function json(res, status, body) {
  send(res, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

function serve(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.json': 'application/json; charset=utf-8'
    };
    send(res, 200, data, types[ext] || 'application/octet-stream');
  });
}

function safeJoin(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.normalize(path.join(PUBLIC, clean));
  return target.startsWith(PUBLIC) ? target : null;
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function idFor(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `l_${(hash >>> 0).toString(16)}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || 22000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'LeadDeskFinal/1.0',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function leadFromPlace(item, city, niche) {
  const tags = item.extratags || {};
  const address = item.address || {};
  const name = item.namedetails?.name || item.namedetails?.['name:en'] || (item.display_name || '').split(',')[0] || 'Unknown business';
  const website = tags.website || tags['contact:website'] || tags.url || '';
  const phone = tags.phone || tags['contact:phone'] || '';
  const email = tags.email || tags['contact:email'] || '';
  return {
    id: idFor(`${item.osm_type}|${item.osm_id}|${name}|${city}`),
    name,
    city,
    niche,
    website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
    phone,
    email,
    form: '',
    address: [address.house_number, address.road, address.city || address.town || address.village, address.state].filter(Boolean).join(' ') || item.display_name || '',
    source: 'Nominatim',
    status: email || phone || website ? 'Ready' : 'Need Contact'
  };
}

async function scan(city, limit, niches) {
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
  const selected = String(niches || '').split(',').map((x) => x.trim()).filter(Boolean);
  const active = selected.length ? selected : Object.keys(labels);
  const seen = new Set();
  const leads = [];

  for (const id of active) {
    if (leads.length >= limit) break;
    const label = labels[id] || id;
    const queries = [`${label} contractor ${city}`, `${label} company ${city}`];
    for (const query of queries) {
      if (leads.length >= limit) break;
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=12&addressdetails=1&extratags=1&namedetails=1&q=${encodeURIComponent(query)}`;
      const rows = await fetchJson(url, { timeout: 18000 }).catch(() => []);
      for (const row of rows) {
        const lead = leadFromPlace(row, city, label);
        const key = normalize(`${lead.name}|${lead.address}|${lead.website}`);
        if (seen.has(key)) continue;
        seen.add(key);
        leads.push(lead);
        if (leads.length >= limit) break;
      }
    }
  }
  return leads;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');

  if (url.pathname === '/health') {
    return json(res, 200, { ok: true, app: 'Lead Desk', version: VERSION });
  }
  if (url.pathname === '/__version') {
    return json(res, 200, { ok: true, app: 'Lead Desk', version: VERSION, message: 'NEW BUILD IS LIVE' });
  }
  if (url.pathname === '/api/scan') {
    const city = String(url.searchParams.get('city') || '').trim();
    const limit = Math.max(5, Math.min(80, Number(url.searchParams.get('limit') || 40)));
    const niches = url.searchParams.get('niches') || '';
    if (!city) return json(res, 400, { ok: false, error: 'City is required' });
    try {
      const leads = await scan(city, limit, niches);
      return json(res, 200, { ok: true, version: VERSION, endpoint: 'nominatim-final', leads });
    } catch (error) {
      return json(res, 502, { ok: false, version: VERSION, error: error.message || 'Scan failed' });
    }
  }

  if (url.pathname === '/' || url.pathname === '/app' || url.pathname === '/app.html' || url.pathname === '/index.html') {
    return serve(res, path.join(PUBLIC, 'index.html'));
  }
  if (url.pathname === '/presentation' || url.pathname === '/presentation.html') {
    return serve(res, path.join(PUBLIC, 'presentation.html'));
  }
  if (url.pathname === '/guide' || url.pathname === '/guide.html') {
    return serve(res, path.join(PUBLIC, 'guide.html'));
  }

  const file = safeJoin(url.pathname);
  if (!file) return send(res, 403, 'Forbidden');
  return serve(res, file);
}).listen(PORT, () => {
  console.log(`Lead Desk ${VERSION} running on ${PORT}`);
});
