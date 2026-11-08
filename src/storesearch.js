// Buscar modelos reales en muchas tiendas desde el propio móvil (APK), sin claves:
// buscador web (DuckDuckGo y, si no, Bing) → fichas de producto de tiendas conocidas → foto, nombre y precio de la ficha.
// Las tiendas bloquean a los servidores, pero no a un móvil: por eso se hace aquí y no en el Worker.
import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "./ui.js";

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

async function get(url, timeout = 12000) {
  const r = await CapacitorHttp.get({ url, headers: UA, responseType: "text", connectTimeout: timeout, readTimeout: timeout });
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
    const bing = u.match(/bing\.com\/ck\/a\?.*?[?&]u=a1([^&]+)/); if (bing) { try { u = atob(bing[1].replace(/-/g, "+").replace(/_/g, "/")); } catch {} }
    if (/^https?:\/\//.test(u) && !/duckduckgo\.com|bing\.com|microsoft\.com|google\./.test(u)) out.add(u.split("#")[0]);
  }
  return [...out];
}
async function webSearch(q) {
  try {
    const html = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=es-es`);
    const l = linksFrom(html); if (l.length) return l;
  } catch (e) { console.warn("ddg", e.message); }
  try { return linksFrom(await get(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=es&cc=ES`)); }
  catch (e) { console.warn("bing", e.message); return []; }
}

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
export async function searchStores({ term, piece, color, skip = ["zara.com"], max = 10 }) {
  if (!isNative) return [];
  const stores = STORES.filter(([, d]) => !skip.includes(d));
  const q = `${term} hombre`;
  const groups = [stores.slice(0, 5), stores.slice(5, 9), stores.slice(9)].filter((g) => g.length);
  const lists = await Promise.all([webSearch(`${q} comprar`), ...groups.map((g) => webSearch(`${q} ${g.map(([, d]) => `site:${d}`).join(" OR ")}`))]);
  const seen = new Set(), cand = [];
  for (const u of lists.flat()) {
    const st = storeOf(u); if (!st || skip.includes(st[1])) continue;
    const clean = u.split("?")[0];
    if (!st[2].test(clean) || seen.has(clean)) continue;
    seen.add(clean); cand.push({ url: u, st });
  }
  // como mucho 3 por tienda, para que salgan varias marcas
  const per = new Map(), picked = cand.filter((c) => { const n = per.get(c.st[0]) || 0; if (n >= 3) return false; per.set(c.st[0], n + 1); return true; }).slice(0, 18);
  const read = await pool(picked, 5, async (c) => ({ ...(await readProduct(c.url)), url: c.url, store: c.st[0] }));
  const words = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const stem = (w) => w.slice(0, 5); // «mocasín» = «mocasines»
  const want = new Set([...words(term), ...words(piece), ...words(color)].map(stem));
  return read.filter(Boolean).map((p) => {
    const hits = new Set(words(p.name).map(stem).filter((w) => want.has(w))).size;
    return { store: p.store, name: p.name.slice(0, 120), price: p.price ? `${p.price.toFixed(2).replace(".", ",")} ${p.currency}` : "", priceNum: p.price, url: p.url, image: p.image, color: "", _hits: hits };
  }).filter((p) => p._hits > 0).sort((a, b) => b._hits - a._hits).slice(0, max);
}
