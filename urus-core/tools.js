/**
 * URUS OS v2 — TOOLS
 * Implementación real de cada herramienta del Registry. Ninguna lanza error hacia afuera:
 * run() devuelve siempre { ok, data } o { ok:false, error }.
 *
 * SEGURIDAD: el modelo decide qué URL abrir, así que TODA descarga pasa por safeFetch:
 *   solo http/https, bloquea localhost, IPs privadas y metadata de la nube (SSRF),
 *   y revalida cada redirección.
 * Lo que NO está aquí a propósito: ejecutar código arbitrario y consultar tu base de datos
 * con SQL libre (el modelo podría leer la tabla users).
 */
'use strict';

const dns = require('dns').promises;
const net = require('net');
const Memory = require('./memory');

let _ctx = {};
function init(ctx) { _ctx = ctx || {}; }

const clamp = (n, lo, hi, def) => {
  const x = parseInt(n, 10);
  return Number.isFinite(x) ? Math.min(Math.max(x, lo), hi) : def;
};
const cut = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// ───────────── SSRF ─────────────
// Expande una IPv6 (con o sin "::" y con IPv4 al final) a 8 grupos de 16 bits. null si no es válida.
function expandIPv6(ip) {
  let s = String(ip).toLowerCase().split('%')[0];
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const o = v4[1].split('.').map(Number);
    if (o.some((n) => n > 255)) return null;
    s = s.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function isPrivateIp(ip) {
  const x = String(ip).toLowerCase();
  if (net.isIPv4(x)) {
    const [a, b] = x.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(x)) {
    const g = expandIPv6(x);
    if (!g) return true;
    if (g.every((n) => n === 0)) return true;                       // ::
    if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true; // ::1
    if ((g[0] & 0xfe00) === 0xfc00) return true;                    // fc00::/7  (ULA)
    if ((g[0] & 0xffc0) === 0xfe80) return true;                    // fe80::/10 (link-local)
    if ((g[0] & 0xffc0) === 0xfec0) return true;                    // fec0::/10 (site-local, obsoleto)
    // IPv4 incrustada: ::ffff:a.b.c.d  (mapeada), ::a.b.c.d (compatible), 64:ff9b::a.b.c.d (NAT64)
    const mapped = g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff;
    const compat = g.slice(0, 6).every((n) => n === 0);
    const nat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((n) => n === 0);
    if (mapped || compat || nat64) {
      return isPrivateIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
    }
    return false;
  }
  return true; // no es IP → no confiar
}

async function assertSafeUrl(urlStr) {
  let u;
  try { u = new URL(String(urlStr)); } catch { throw new Error('URL inválida'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('solo http/https');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('host no permitido');
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('IP privada bloqueada');
    return u;
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new Error('no se pudo resolver el dominio'); }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error('el dominio apunta a una IP privada');
  return u;
}

async function safeFetch(urlStr, opts = {}) {
  let current = urlStr;
  for (let i = 0; i <= 4; i++) {
    const u = await assertSafeUrl(current);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 15000);
    let res;
    try {
      res = await fetch(u.toString(), {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; URUS-OS/2.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml,application/pdf;q=0.9,*/*;q=0.8',
          ...(opts.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), u).toString();
      continue;
    }
    return res;
  }
  throw new Error('demasiadas redirecciones');
}

async function readLimited(res, maxBytes) {
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes) throw new Error('archivo demasiado grande');
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) { try { await reader.cancel(); } catch { /* ignore */ } throw new Error('archivo demasiado grande'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// ───────────── HTML → texto ─────────────
function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ' '; } });
}

function htmlToText(html) {
  let s = String(html);
  const title = decodeEntities((s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').trim();
  s = s.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|section|article|li|tr|h[1-6]|ul|ol|table|header|footer)>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  return { title, text: s };
}

function extractLinks(html, base, max) {
  const out = [];
  const seen = new Set();
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && out.length < max) {
    const href = m[1].trim();
    if (!href || href.startsWith('#') || /^(javascript|mailto|tel):/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, base).toString(); } catch { continue; }
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push({ text: cut(decodeEntities(m[2].replace(/<[^>]+>/g, ' ')), 80), url: abs });
  }
  return out;
}

async function renderPage(url) {
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch { throw new Error('puppeteer no está instalado'); }
  await assertSafeUrl(url);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', async (req) => {
      try {
        await assertSafeUrl(req.url()); // http/https, sin localhost, y el DNS no apunta a IPs privadas
        return req.continue();
      } catch { return req.abort(); }
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    return await page.content();
  } finally {
    await browser.close().catch(() => {});
  }
}

// ───────────── HERRAMIENTAS ─────────────
async function web_search(input) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('falta TAVILY_API_KEY');
  const query = cut(input.query, 380);
  if (!query) throw new Error('query vacía');
  const r = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: input.depth === 'advanced' ? 'advanced' : 'basic',
      max_results: clamp(input.max_results, 1, 8, 5),
      include_answer: true,
      topic: input.topic === 'news' ? 'news' : 'general',
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Tavily HTTP ${r.status}`);
  const data = await r.json();
  const results = Array.isArray(data.results) ? data.results : [];
  return {
    answer: data.answer ? cut(data.answer, 1200) : null,
    results: results.map((x) => ({ title: cut(x.title, 160), url: x.url, content: cut(x.content, 900) })),
  };
}

async function web_scrape(input) {
  const url = String(input.url || '').trim();
  const mode = ['text', 'links', 'html'].includes(input.mode) ? input.mode : 'text';
  let html;
  let status = 200;
  let rendered = false;

  if (input.render === true) {
    html = await renderPage(url);
    rendered = true;
  } else {
    const res = await safeFetch(url);
    status = res.status;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await readLimited(res, 5 * 1024 * 1024);
    html = buf.toString('utf8');
  }

  const { title, text } = htmlToText(html);
  const out = { url, status, rendered, title };
  if (mode === 'html') {
    out.html = html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, '').replace(/\s+/g, ' ').slice(0, 20000);
  } else if (mode === 'links') {
    out.links = extractLinks(html, url, 80);
  } else {
    out.text = text.slice(0, 12000);
    out.links = extractLinks(html, url, 25);
    if (text.length < 300 && !rendered) {
      out.note = 'Poco texto: la página probablemente carga con JavaScript. Reintenta con render:true.';
    }
  }
  return out;
}

async function pdf_extract(input) {
  const url = String(input.url || '').trim();
  const res = await safeFetch(url, { timeoutMs: 25000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await readLimited(res, 15 * 1024 * 1024);
  const pdfParse = require('pdf-parse');
  const parsed = await pdfParse(buf);
  const text = String(parsed.text || '').trim();
  if (!text) throw new Error('el PDF no tiene texto (¿escaneado?)');
  return { pages: parsed.numpages, text: text.slice(0, 14000), truncated: text.length > 14000 };
}

async function rss_fetch(input) {
  const Parser = require('rss-parser');
  const res = await safeFetch(String(input.url || '').trim());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = (await readLimited(res, 3 * 1024 * 1024)).toString('utf8');
  const feed = await new Parser().parseString(xml);
  return {
    title: cut(feed.title, 120),
    items: (feed.items || []).slice(0, clamp(input.limit, 1, 20, 10)).map((i) => ({
      title: cut(i.title, 160), link: i.link, date: i.pubDate || i.isoDate || null, summary: cut(i.contentSnippet || i.content, 300),
    })),
  };
}

async function youtube_search(input) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('falta YOUTUBE_API_KEY');
  const q = cut(input.query, 200);
  if (!q) throw new Error('query vacía');
  const type = input.type === 'channel' ? 'channel' : 'video';
  const max = clamp(input.max_results, 1, 15, 8);
  const api = 'https://www.googleapis.com/youtube/v3/';

  const sp = new URLSearchParams({ part: 'snippet', q, type, maxResults: String(max), key });
  const s = await (await fetch(api + 'search?' + sp, { signal: AbortSignal.timeout(20000) })).json();
  if (s.error) throw new Error('YouTube API: ' + (s.error.message || 'error'));
  const items = s.items || [];
  if (!items.length) return { type, results: [] };

  if (type === 'video') {
    const ids = items.map((i) => i.id && i.id.videoId).filter(Boolean).join(',');
    const vp = new URLSearchParams({ part: 'statistics', id: ids, key });
    const v = await (await fetch(api + 'videos?' + vp, { signal: AbortSignal.timeout(20000) })).json();
    const stats = {};
    for (const it of v.items || []) stats[it.id] = it.statistics || {};
    return {
      type,
      results: items.map((i) => ({
        id: i.id.videoId, title: cut(i.snippet.title, 140), channel: i.snippet.channelTitle,
        published: i.snippet.publishedAt, views: Number((stats[i.id.videoId] || {}).viewCount || 0),
        likes: Number((stats[i.id.videoId] || {}).likeCount || 0),
      })),
    };
  }
  const ids = items.map((i) => i.id && i.id.channelId).filter(Boolean).join(',');
  const cp = new URLSearchParams({ part: 'statistics', id: ids, key });
  const c = await (await fetch(api + 'channels?' + cp, { signal: AbortSignal.timeout(20000) })).json();
  const stats = {};
  for (const it of c.items || []) stats[it.id] = it.statistics || {};
  return {
    type,
    results: items.map((i) => ({
      id: i.id.channelId, title: cut(i.snippet.title, 120), description: cut(i.snippet.description, 200),
      subscribers: Number((stats[i.id.channelId] || {}).subscriberCount || 0),
      videos: Number((stats[i.id.channelId] || {}).videoCount || 0),
      views: Number((stats[i.id.channelId] || {}).viewCount || 0),
    })),
  };
}

async function memory_search(input, ctx) {
  const query = cut(input.query, 500);
  if (!query) throw new Error('query vacía');
  const limit = clamp(input.limit, 1, 10, 5);
  const scope = ['project', 'personal', 'all'].includes(input.scope) ? input.scope : 'all';
  const vec = await Memory.embed(query);
  const out = [];
  if (scope !== 'personal') {
    const rows = await Memory.search({ query, vec, projectId: ctx.projectId || null, limit });
    for (const r of rows) out.push({ origin: 'proyecto', type: r.type, content: cut(r.content, 700), date: r.created_at });
  }
  if (scope !== 'project') {
    const rows = await Memory.personalContext({ query, vec, limit });
    for (const r of rows) out.push({ origin: 'personal', type: r.type, content: cut(r.content, 700) });
  }
  return { count: out.length, results: out };
}

async function memory_save(input, ctx) {
  const allowed = ['note', 'journal', 'decision', 'idea', 'insight'];
  const type = allowed.includes(input.type) ? input.type : 'note';
  const content = String(input.content || '').trim();
  if (content.length < 3) throw new Error('content vacío');
  const id = await Memory.save({ content, type, projectId: ctx.projectId || null, runId: ctx.runId || null, agent: ctx.agent || null });
  return { saved: true, id, type };
}

const IMPL = { web_search, web_scrape, pdf_extract, rss_fetch, youtube_search, memory_search, memory_save };

async function run(name, input, ctx = {}) {
  const fn = IMPL[name];
  if (!fn) return { ok: false, error: `herramienta '${name}' no existe` };
  const timeoutMs = name === 'web_scrape' ? 60000 : 45000;
  let timer;
  try {
    const data = await Promise.race([
      fn(input && typeof input === 'object' ? input : {}, ctx),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`timeout en ${name}`)), timeoutMs); }),
    ]);
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e).slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { init, run, isPrivateIp, assertSafeUrl, htmlToText, IMPL };
