// Buscar modelos reales en muchas tiendas desde el propio móvil (APK), sin claves:
// buscador web (DuckDuckGo y, si no, Bing) → fichas de producto de tiendas conocidas → foto, nombre y precio de la ficha.
// Las tiendas bloquean a los servidores, pero no a un móvil: por eso se hace aquí y no en el Worker.
import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "./ui.js";
import { apiDefaults } from "./api.js";

export const STORES = [ // [nombre, dominio, patrón de ficha de producto]
  ["Massimo Dutti", "massimodutti.com", /-l\d{6,}|\/p\/|c\d+p\d+/i],
  ["Mango", "mango.com", /\/p\/|_\d{6,}/i],
  ["H&M", "hm.com", /productpage\.\d+/i],
  ["Pull&Bear", "pullandbear.com", /-l\d{6,}|c\d+p\d+/i],
  ["Bershka", "bershka.com", /-c0p\d+|-l\d{6,}|c\d+p\d+/i],
  ["Uniqlo", "uniqlo.com", /\/products\/[A-Z]?\d{5,}/i],
  ["COS", "cos.com", /product[./]|\.\d{9,}\.html/i],
  ["Arket", "arket.com", /product[./]|\.\d{9,}\.html/i],
  ["Springfield", "springfield.com", /\/p\/|\d{6,}\.html/i],
  ["Scalpers", "scalperscompany.com", /\/products\//i],
  ["El Ganso", "elganso.com", /\/p\/|\d{5,}\.html|\/products\//i],
  ["Jack & Jones", "jackjones.com", /\/\d{8,}|\.html/i],
  ["Selected", "selected.com", /\/\d{8,}|\.html/i],
  ["Zara", "zara.com", /-p\d{6,}\.html/i],
];
const UA = { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", "Accept-Language": "es-ES,es;q=0.9", Accept: "text/html,application/xhtml+xml" };

async function get(url, timeout = 12000, extra = {}) {
  const r = await CapacitorHttp.get({ url, headers: { ...UA, ...extra }, responseType: "text", connectTimeout: timeout, readTimeout: timeout });
  if (r.status >= 400) throw new Error("HTTP " + r.status);
  return typeof r.data === "string" ? r.data : JSON.stringify(r.data);
}
const storeOf = (url) => { try { const h = new URL(url).hostname; return STORES.find(([, d]) => h === d || h.endsWith("." + d)); } catch { return null; } };
const decodeHtml = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Enlaces de resultados del buscador (DuckDuckGo html/lite o Bing). */
function linksFrom(html) {
  const out = new Set();
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    let u = decodeHtml(m[1]);
    const dd = u.match(/[?&]uddg=([^&]+)/); if (dd) u = decodeURIComponent(dd[1]);
    const gq = u.match(/^\/url\?(?:.*&)?q=([^&]+)/); if (gq) u = decodeURIComponent(gq[1]);
    const bing = u.match(/bing\.com\/ck\/a\?.*?[?&]u=a1([^&]+)/); if (bing) { try { u = atob(bing[1].replace(/-/g, "+").replace(/_/g, "/")); } catch {} }
    if (/^https?:\/\//.test(u) && !/duckduckgo\.com|bing\.com|microsoft\.com|google\.[a-z.]+\/|gstatic/.test(u)) out.add(u.split("#")[0]);
  }
  return [...out];
}
const ENGINES = [
  ["DuckDuckGo", (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=es-es`],
  ["DuckDuckGo lite", (q) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}&kl=es-es`],
  ["Bing", (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=es&cc=ES&count=30`],
  ["Google", (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=es&gl=es&num=30&gbv=1`, { Cookie: "CONSENT=YES+cb; SOCS=CAESEwgDEgk0ODE3Nzk3MjQaAmVzIAEaBgiA_LyaBg" }],
];
/** Prueba buscadores hasta que uno devuelva enlaces de tiendas. diag[] guarda qué pasó con cada uno. */
async function webSearch(q, diag) {
  for (const [name, url, extra] of ENGINES) {
    try {
      const html = await get(url(q), 12000, extra);
      const links = linksFrom(html).map((u) => u.replace(/^\/url\?q=/, ""));
      const shops = links.filter((u) => storeOf(u));
      diag.push(`${name}: ${shops.length}/${links.length}`);
      if (shops.length) return links;
    } catch (e) { diag.push(`${name}: ${e.message}`); }
  }
  return [];
}

/**
 * Búsqueda de IMÁGENES por tienda (DuckDuckGo y, si no, Bing): devuelve directamente foto + título + enlace a la ficha,
 * sin tener que abrir la ficha (H&M, COS o Arket cierran sus fichas a las apps: 403). La miniatura viene del propio
 * buscador, que siempre carga.
 */
async function ddgImages(q) {
  const home = await get(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images&kl=es-es`, 10000);
  const vqd = home.match(/vqd=["']?([\d-]+)["']?/)?.[1];
  if (!vqd) throw new Error("sin vqd");
  const raw = await get(`https://duckduckgo.com/i.js?l=es-es&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`, 10000, { Referer: "https://duckduckgo.com/", Accept: "application/json" });
  const j = JSON.parse(raw);
  return (j.results || []).map((r) => ({ title: r.title, page: r.url, image: r.image, thumb: r.thumbnail }));
}
async function bingImages(q) {
  const html = await get(`https://www.bing.com/images/async?q=${encodeURIComponent(q)}&first=0&count=35&mmasync=1&setlang=es&cc=ES`, 10000);
  const out = [];
  for (const m of html.matchAll(/\bm="(\{[^"]+\})"/g)) {
    try { const j = JSON.parse(decodeHtml(m[1])); if (j.purl && (j.turl || j.murl)) out.push({ title: j.t || "", page: j.purl, image: j.murl, thumb: j.turl }); } catch {}
  }
  return out;
}
async function imageSearch(q, diag, tag) {
  for (const [name, fn] of [["DDG imágenes", ddgImages], ["Bing imágenes", bingImages]]) {
    try { const r = await fn(q); if (r.length) { diag.push(`${tag} ${name}: ${r.length}`); return r; } diag.push(`${tag} ${name}: 0`); }
    catch (e) { diag.push(`${tag} ${name}: ${e.message}`); }
  }
  return [];
}
const cleanTitle = (t) => decodeHtml(String(t || "").replace(/<[^>]+>/g, "")).replace(/\s*[|–-]\s*(Massimo Dutti|MANGO|Mango|H&M|Pull&Bear|Bershka|UNIQLO|Uniqlo|COS|ARKET|Arket|Springfield|Scalpers|El Ganso|JACK & JONES|Jack & Jones|SELECTED|Selected)\b.*$/i, "").replace(/^(Comprar|Buy)\s+/i, "").trim();

/** Ficha de producto → {name, image, price}. JSON-LD Product o etiquetas og/product. */
async function readProduct(url) {
  const html = (await get(url, 10000)).slice(0, 1_500_000);
  let name = null, image = null, price = null, currency = "€";
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    for (const x of [].concat(j?.["@graph"] || j || [])) {
      if (!/Product/i.test([].concat(x?.["@type"]).join())) continue;
      name ||= x.name; const im = [].concat(x.image || [])[0]; image ||= typeof im === "string" ? im : im?.url || null;
      const off = [].concat(x.offers || [])[0]; const p = off?.price ?? off?.lowPrice ?? off?.offers?.[0]?.price;
      if (p != null) { price ||= +p; currency = off.priceCurrency === "EUR" || !off.priceCurrency ? "€" : off.priceCurrency; }
    }
  }
  const meta = (prop) => decodeHtml(html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, "i"))?.[1] || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"))?.[1] || "");
  name ||= meta("og:title") || null;
  image ||= meta("og:image") || null;
  if (!price) { const p = meta("product:price:amount") || meta("og:price:amount"); if (p) price = +p.replace(",", "."); }
  if (!price) { const m = html.match(/"price"\s*:\s*"?(\d{1,4}(?:[.,]\d{1,2})?)"?/); if (m) price = +m[1].replace(",", "."); }
  if (!name || !image) throw new Error("sin ficha");
  return { name: decodeHtml(name).replace(/\s*[|–-]\s*(Massimo Dutti|MANGO|H&M|Pull&Bear|Bershka|UNIQLO|COS|ARKET|Springfield|Scalpers|El Ganso).*$/i, "").trim(), image: new URL(image, url).href, price: price && price > 1 && price < 5000 ? Math.round(price * 100) / 100 : null, currency };
}

/** Pool de tareas con concurrencia limitada. */
async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; try { out[k] = await fn(list[k]); } catch { out[k] = null; } } }));
  return out;
}

export const canSearchStores = isNative;

/**
 * Busca la prenda en muchas tiendas (sin Zara, que ya da el servidor).
 * Devuelve [{store, name, price, priceNum, url, image, color}] ordenados por parecido con lo buscado.
 */
export async function searchStores({ term, piece, color, skip = ["zara.com"], max = 14 }) {
  const diag = [];
  if (!isNative) return { products: [], diag: ["solo en la app del móvil"] };
  const stores = STORES.filter(([, d]) => !skip.includes(d));
  const q = `${term} ${apiDefaults.section || "hombre"}`;
  const words = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const stem = (w) => w.slice(0, 5);
  const want = new Set([...words(term), ...words(piece), ...words(color)].map(stem));
  const pieceWords = new Set(words(piece || term).map(stem));
  // 1) imágenes por tienda: foto, nombre y enlace sin abrir la ficha
  const viaImg = [];
  await pool(stores, 4, async ([name, dom, pat]) => {
    const res = await imageSearch(`${q} site:${dom}`, diag, name);
    let n = 0;
    for (const r of res) {
      const st = storeOf(r.page); if (!st || st[0] !== name) continue;
      const clean = r.page.split("?")[0], title = cleanTitle(r.title);
      if (!title || /buscar|search|resultados|categor/i.test(title)) continue;
      const tw = new Set(words(title).map(stem));
      if (![...pieceWords].some((w) => tw.has(w))) continue; // que sea esa prenda
      if (viaImg.some((p) => p.url.split("?")[0] === clean)) continue;
      viaImg.push({ store: name, name: title.slice(0, 120), url: r.page, image: r.image || r.thumb, thumb: r.thumb || r.image, price: "", priceNum: null, color: "", _hits: [...tw].filter((w) => want.has(w)).length + (pat.test(clean) ? 0.5 : 0) });
      if (++n >= 3) break; // como mucho 3 por tienda
    }
  });
  // precio: se intenta leer la ficha (si la tienda la cierra, se queda sin precio)
  await pool(viaImg.slice(0, 14), 5, async (p) => {
    try { const f = await readProduct(p.url); if (f.price) { p.priceNum = f.price; p.price = `${f.price.toFixed(2).replace(".", ",")} ${f.currency}`; } } catch {}
  });
  const groups = [stores.slice(0, 5), stores.slice(5, 9), stores.slice(9)].filter((g) => g.length);
  const lists = await Promise.all([webSearch(`${q} comprar`, diag), ...groups.map((g) => webSearch(`${q} ${g.map(([, d]) => `site:${d}`).join(" OR ")}`, diag))]);
  const seen = new Set(), cand = [];
  let shopLinks = 0;
  for (const u of lists.flat()) {
    const st = storeOf(u); if (!st || skip.includes(st[1])) continue;
    shopLinks++;
    const clean = u.split("?")[0];
    if (!st[2].test(clean) || seen.has(clean)) continue;
    seen.add(clean); cand.push({ url: u, st });
  }
  // como mucho 3 por tienda, para que salgan varias marcas
  const per = new Map(), picked = cand.filter((c) => { const n = per.get(c.st[0]) || 0; if (n >= 3) return false; per.set(c.st[0], n + 1); return true; }).slice(0, 18);
  const fails = [];
  const read = await pool(picked, 5, async (c) => { try { return { ...(await readProduct(c.url)), url: c.url, store: c.st[0] }; } catch (e) { fails.push(`${c.st[0]} ${e.message}`); throw e; } });
  const ok = read.filter(Boolean);
  const fromPages = ok.map((p) => {
    const hits = new Set(words(p.name).map(stem).filter((w) => want.has(w))).size;
    return { store: p.store, name: p.name.slice(0, 120), price: p.price ? `${p.price.toFixed(2).replace(".", ",")} ${p.currency}` : "", priceNum: p.price, url: p.url, image: p.image, color: "", _hits: hits };
  });
  const seenU = new Set(), products = [...viaImg, ...fromPages].filter((p) => { const k = p.url.split("?")[0]; if (seenU.has(k)) return false; seenU.add(k); return true; })
    .sort((a, b) => b._hits - a._hits).slice(0, max);
  diag.push(`por imágenes ${viaImg.length} (${[...new Set(viaImg.map((p) => p.store))].join(", ") || "ninguna tienda"}) · enlaces de tiendas ${shopLinks}, fichas ${picked.length}, leídas ${ok.length}${fails.length ? ` (fallos: ${[...new Set(fails)].slice(0, 4).join(", ")})` : ""}`);
  return { products, diag };
}
