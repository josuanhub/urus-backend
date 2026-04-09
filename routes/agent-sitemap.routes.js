/**
 * URUS VERIFY — Sitemap Dinámico + Robots.txt
 * Para el motor de SEO de agentes IA
 *
 * GET /sitemap.xml  → sitemap completo con todas las páginas SEO
 * GET /robots.txt   → robots optimizado para Googlebot
 */

const express = require("express");
const router = express.Router();

const SITE_URL = (process.env.GSC_SITE_URL || "https://urusverify.com").replace(/\/$/, "");

function db() {
  if (global.__URUS_DB__) return global.__URUS_DB__;
  throw new Error("DB pool not initialized");
}

// Cache en memoria — 1 hora
let sitemapCache = null;
let sitemapCacheAt = 0;
const TTL = 60 * 60 * 1000;

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

router.get("/sitemap.xml", async (req, res) => {
  try {
    const now = Date.now();
    if (sitemapCache && now - sitemapCacheAt < TTL) {
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.set("Cache-Control", "public, max-age=3600");
      return res.send(sitemapCache);
    }

    const pool = db();

    // Páginas estáticas
    const statics = [
      { loc: SITE_URL + "/",                changefreq: "daily",   priority: "1.0" },
      { loc: SITE_URL + "/ranking/dominant", changefreq: "hourly",  priority: "0.95" },
      { loc: SITE_URL + "/ranking/verified", changefreq: "daily",   priority: "0.9" },
      { loc: SITE_URL + "/ranking/high-signal", changefreq: "daily",priority: "0.85" },
      { loc: SITE_URL + "/ranking/emerging", changefreq: "daily",   priority: "0.8" },
      { loc: SITE_URL + "/privacy",          changefreq: "yearly",  priority: "0.3" },
      { loc: SITE_URL + "/terms",            changefreq: "yearly",  priority: "0.3" },
    ];

    // Páginas dinámicas desde DB
    const result = await pool.query(`
      SELECT slug, page_type, priority, updated_at
      FROM seo_agent_pages
      ORDER BY priority DESC, created_at DESC
    `);

    const freqMap = { agent: "daily", ecosystem: "weekly", ranking: "hourly", comparison: "monthly", guide: "monthly" };

    const dynamic = result.rows.map(r => ({
      loc: `${SITE_URL}/${r.slug}`,
      lastmod: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : undefined,
      changefreq: freqMap[r.page_type] || "weekly",
      priority: String(r.priority || 0.7),
    }));

    const allUrls = [...statics, ...dynamic];

    const entries = allUrls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;

    sitemapCache = xml;
    sitemapCacheAt = now;

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    return res.send(xml);
  } catch (e) {
    console.error("SITEMAP_ERR", e);
    res.status(500).type("text").send("Sitemap error");
  }
});

router.get("/sitemap-invalidate", (req, res) => {
  sitemapCache = null;
  sitemapCacheAt = 0;
  res.json({ ok: true });
});

router.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *
Allow: /

Allow: /agent/
Allow: /ecosystem/
Allow: /ranking/
Allow: /compare/
Allow: /guide/
Allow: /sitemap.xml

Disallow: /v1/
Disallow: /seo/seed
Disallow: /seo/gsc/submit
Disallow: /webhook
Disallow: /auth/
Disallow: /admin/

User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

// Exportar para que seo.routes pueda invalidar el cache
module.exports = router;
module.exports.invalidate = () => { sitemapCache = null; sitemapCacheAt = 0; };
