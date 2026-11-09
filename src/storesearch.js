// Buscar modelos reales en muchas tiendas desde el propio móvil (APK), sin claves:
// buscador web (DuckDuckGo y, si no, Bing) → fichas de producto de tiendas conocidas → foto, nombre y precio de la ficha.
// Las tiendas bloquean a los servidores, pero no a un móvil: por eso se hace aquí y no en el Worker.
import { CapacitorHttp } from "@capacitor/core";
import { isNative } from "./ui.js";
import { apiDefaults } from "./api.js";
import { COLORS } from "./catalog.js";

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
  ["Primark", "primark.com", /\/p\/|\d{9,}/i],
  ["Lefties", "lefties.com", /-l\d{6,}|c\d+p\d+|-p\d{6,}/i],
  ["Cortefiel", "cortefiel.com", /\/p\/|\d{6,}\.html/i],
  ["Celio", "celio.com", /\d{6,}\.html|\/p\//i],
  ["Decathlon", "decathlon.es", /\/p\/|_\d{6,}/i],
];
// Tiendas con tienda física en Girona o alrededores (Espai Gironès, centro): las que se buscan por defecto.
// Polete puede cambiarlas en Perfil → Ajustes → Tiendas (perfil.stores).
export const LOCAL_DEFAULT = ["Zara", "Massimo Dutti", "Mango", "H&M", "Pull&Bear", "Bershka", "Springfield", "Primark", "Lefties", "Cortefiel", "Jack & Jones", "Decathlon", "Celio"];
export const allowedStores = (profile) => (Array.isArray(profile?.stores) && profile.stores.length ? profile.stores : LOCAL_DEFAULT);
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

/* ---------- precisión: que sea ESA prenda, de la sección del perfil ---------- */
const N = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
// por tipo del catálogo: lo que el nombre tiene que decir (need) y lo que no puede decir (avoid)
const TYPE_RULES = {
  camiseta: { need: /\bcamisetas?\b|t-?shirt|\btee\b/, avoid: /tirantes|sin mangas|\bcamisas?\b|sobrecamisa|\bpolo|sudadera|manga larga|\btop\b|\bbody\b|tank/ },
  "camiseta-ml": { need: /(\bcamisetas?\b|t-?shirt).*manga larga|manga larga.*(\bcamisetas?\b|t-?shirt)|long sleeve/, avoid: /tirantes|\bcamisas?\b|\bpolo|sudadera/ },
  polo: { need: /\bpolos?\b/, avoid: /cuello polo.*jersey|jersey|sudadera/ },
  tirantes: { need: /tirantes|sin mangas|tank/ },
  camisa: { need: /\bcamisas?\b|\bshirt\b/, avoid: /camiseta|sobrecamisa|overshirt|t-?shirt|manga corta/ },
  "camisa-mc": { need: /\bcamisas?\b.*manga corta|manga corta.*\bcamisas?\b/, avoid: /camiseta|sobrecamisa|t-?shirt/ },
  sobrecamisa: { need: /sobrecamisa|overshirt/ },
  jersey: { need: /jersey|sueter|sweater|pullover|\bpunto\b/, avoid: /chaleco|cardigan|sudadera|chaqueta|vestido|falda|pantalon/ },
  cardigan: { need: /cardigan|chaqueta (de )?punto/ },
  sudadera: { need: /sudadera|sweatshirt/, avoid: /capucha|hoodie|pantalon/ },
  "sudadera-capucha": { need: /capucha|hoodie/, avoid: /pantalon|chaqueta/ },
  "chaleco-punto": { need: /chaleco/ },
  pantalon: { need: /pantalon|trousers/, avoid: /corto|bermuda|\bshorts?\b|jogger|chandal|vaquero|jeans?\b|denim|pijama/ },
  chino: { need: /chino/ , avoid: /corto|bermuda|\bshorts?\b/ },
  vaquero: { need: /vaquero|jeans?\b/, avoid: /corto|bermuda|\bshorts?\b|camisa|chaqueta|cazadora|sobrecamisa/ },
  "traje-pantalon": { need: /pantalon.*traje|traje.*pantalon|pantalon (de )?vestir|pinzas/, avoid: /corto|bermuda/ },
  jogger: { need: /jogger|chandal|jogging/, avoid: /sudadera|chaqueta/ },
  bermuda: { need: /bermuda|\bshorts?\b|pantalon corto/ },
  falda: { need: /falda|skirt/ },
  vestido: { need: /vestido|dress/ },
  zapatillas: { need: /zapatilla|sneaker|deportiva/, avoid: /calcetin|bolsa|zapato/ },
  zapatos: { need: /zapato|oxford|derby|blucher/, avoid: /zapatilla|calcetin/ },
  mocasines: { need: /mocasin|loafer|penny/, avoid: /calcetin/ },
  botas: { need: /\bbotas?\b|boot/, avoid: /botin|calcetin/ },
  botines: { need: /botin|chelsea|boot/, avoid: /calcetin/ },
  sandalias: { need: /sandalia|chancla/ },
  americana: { need: /americana|blazer/, avoid: /pantalon|chaleco/ },
  abrigo: { need: /abrigo|\bcoat\b/, avoid: /sobrecamisa|chaleco/ },
  gabardina: { need: /gabardina|trench/ },
  cazadora: { need: /cazadora|bomber|chaqueta/, avoid: /punto|americana|pantalon/ },
  chaqueta: { need: /chaqueta|cazadora|jacket/, avoid: /punto|pantalon/ },
  plumifero: { need: /plumifero|acolchad|puffer|plumas/ },
  parka: { need: /parka/ },
  chaleco: { need: /chaleco/, avoid: /punto/ },
  cinturon: { need: /cinturon|\bbelt\b/ },
  reloj: { need: /reloj|watch/ },
  gafas: { need: /gafas|sunglasses/ },
  bufanda: { need: /bufanda|scarf/ },
  gorra: { need: /gorra|\bcap\b/ },
  calcetines: { need: /calcetin|socks?\b/ },
};
/** ¿El nombre es de esa prenda? (con tipo del catálogo; si no, que diga la palabra principal de la prenda entera) */
export function typeOk(title, type, piece) {
  const t = N(title), r = TYPE_RULES[type];
  if (r) return r.need.test(t) && !(r.avoid && r.avoid.test(t));
  const main = N(piece).split(/[^a-z]+/).find((w) => w.length > 3);
  return !main || new RegExp(`\\b${main.replace(/e?s$/, "")}(e?s)?\\b`).test(t);
}
/** ¿Es de la sección del perfil? Fuera mujer/niño en hombre, y hombre/niño en mujer (por nombre y por enlace). */
export function sectionOk(title, url) {
  const t = `${N(title)} ${N(decodeURIComponent(url || ""))}`;
  const kids = /\bnin[oa]s?\b|kids?\b|\bbebe|junior|\bboys?\b|\bgirls?\b|infantil|teen/;
  if (kids.test(t)) return false;
  return (apiDefaults.section || "hombre") === "mujer" ? !/\bhombres?\b|\/(man|men|hombre)\/|\bmen\b|\bman\b/.test(t) : !/\bmujer(es)?\b|\/(woman|women|mujer|ella|she)\/|\bwomen\b|\bwoman\b|\bfemenin/.test(t);
}

/* ---------- color: que la prenda de la foto sea del color que buscas ---------- */
// palabras de color que aparecen en los nombres de las tiendas → clave del catálogo
const COLOR_WORDS = [["blanc|white|off.?white", "blanco"], ["crudo|ecru|marfil|hueso|ivory", "crudo"], ["beige|arena|piedra|sand|stone", "beige"], ["camel|tostado|tabaco", "camel"],
  ["marr[oó]n|chocolate|brown|cuero", "marron"], ["gris claro|gris jaspe|light grey|vigor", "gris-claro"], ["gris|grey|gray", "gris"], ["antracita|charcoal|grafito", "antracita"],
  ["negr|black", "negro"], ["marino|navy", "azul-marino"], ["azul|blue|cobalto|indigo", "azul"], ["celeste|azul claro|light blue|cielo", "celeste"], ["verde|green|botella", "verde"],
  ["oliva|olive|kaki|khaki|caqui", "oliva"], ["rojo|red", "rojo"], ["burdeos|granate|vino|burgundy", "burdeos"], ["rosa|pink", "rosa"], ["morado|lila|violeta|purple", "morado"],
  ["amarillo|yellow", "amarillo"], ["mostaza|mustard|ocre", "mostaza"], ["naranja|orange|teja", "naranja"]];
const FAMILY = { blanco: "claro", crudo: "claro", beige: "claro", "gris-claro": "claro", nude: "claro", celeste: "azul", azul: "azul", "azul-marino": "azul", denim: "azul", negro: "oscuro", antracita: "oscuro", gris: "gris", marron: "marron", camel: "marron", verde: "verde", oliva: "verde", caqui: "verde", rojo: "rojo", burdeos: "rojo", rosa: "rojo", morado: "morado", amarillo: "amarillo", mostaza: "amarillo", naranja: "naranja" };
/** Color pedido («blanco», «azul marino»…) → {k, hex} del catálogo. */
export function wantedColor(text, hex) {
  const low = String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [re, k] of COLOR_WORDS) if (new RegExp(re.normalize("NFD").replace(/[̀-ͯ]/g, "")).test(low)) { const c = COLORS.find((x) => x.k === k); return { k, hex: hex || c?.hex }; }
  return hex ? { k: null, hex } : null;
}
/** Colores que nombra un título de producto. */
const colorsInTitle = (t) => { const low = String(t || "").toLowerCase(); return COLOR_WORDS.filter(([re]) => new RegExp(re).test(low)).map(([, k]) => k); };
const rgbOf = (hex) => { const n = parseInt(String(hex).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function lab([r, g, b]) {
  const f = (c) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = f(r), G = f(g), B = f(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const h = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * h(Y) - 16, 500 * (h(X) - h(Y)), 200 * (h(Y) - h(Z))];
}
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Color de la prenda en una foto de tienda: se quita el fondo (color de los bordes) y se mira el centro. */
async function garmentColor(url) {
  const r = await CapacitorHttp.get({ url, responseType: "blob", headers: { "User-Agent": UA["User-Agent"] }, connectTimeout: 8000, readTimeout: 8000 });
  if (r.status >= 400 || typeof r.data !== "string") throw new Error("foto " + r.status);
  const mime = (r.headers?.["Content-Type"] || r.headers?.["content-type"] || "image/jpeg").split(";")[0];
  const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = `data:${mime};base64,${r.data}`; });
  const W = 48, H = 60, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0, W, H);
  const d = g.getImageData(0, 0, W, H).data, px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const border = []; for (let x = 0; x < W; x++) { border.push(px(x, 0), px(x, H - 1)); } for (let y = 0; y < H; y++) { border.push(px(0, y), px(W - 1, y)); }
  const med = (arr) => [0, 1, 2].map((k) => arr.map((v) => v[k]).sort((a, b) => a - b)[arr.length >> 1]);
  const bg = lab(med(border)), inner = [];
  for (let y = Math.round(H * 0.2); y < H * 0.8; y++) for (let x = Math.round(W * 0.2); x < W * 0.8; x++) { const p = px(x, y); if (dE(lab(p), bg) > 12) inner.push(p); }
  // prenda casi del color del fondo (camiseta blanca sobre blanco): el color es el del fondo
  if (inner.length < W * H * 0.36 * 0.12) return med(border);
  return med(inner);
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
export async function searchStores({ term, piece, color, colorHex, type, only = null, skip = ["zara.com"], max = 14 }) {
  const diag = [];
  if (!isNative) return { products: [], diag: ["solo en la app del móvil"] };
  const stores = STORES.filter(([n, d]) => !skip.includes(d) && (!only || only.includes(n)));
  const wanted = wantedColor(color || term, colorHex);
  const sec = apiDefaults.section || "hombre";
  const q = `${term}${color && !String(term).toLowerCase().includes(String(color).toLowerCase()) ? " " + color : ""} ${sec} ${sec === "mujer" ? "-hombre" : "-mujer"} -niño -niña -kids`;
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
      if (!typeOk(title, type, piece) || !sectionOk(title, r.page)) continue; // que sea esa prenda y de su sección
      // que sea de ese color: si el nombre dice otro color (de otra familia), fuera
      const named = colorsInTitle(title);
      if (wanted?.k && named.length && !named.some((k) => k === wanted.k || FAMILY[k] === FAMILY[wanted.k])) continue;
      if (viaImg.some((p) => p.url.split("?")[0] === clean)) continue;
      viaImg.push({ store: name, name: title.slice(0, 120), url: r.page, image: r.image || r.thumb, thumb: r.thumb || r.image, price: "", priceNum: null, color: "", _hits: [...tw].filter((w) => want.has(w)).length + (pat.test(clean) ? 0.5 : 0) });
      if (++n >= 3) break; // como mucho 3 por tienda
    }
  });
  // color de verdad: se mira la foto (los nombres a menudo no dicen el color). Lejos del pedido → fuera
  let dropped = 0;
  if (wanted?.hex && /^#/.test(wanted.hex)) {
    const target = lab(rgbOf(wanted.hex));
    await pool(viaImg, 6, async (p) => {
      if (colorsInTitle(p.name).some((k) => k === wanted.k)) { p._color = 0; return; } // el nombre ya lo dice
      try { p._color = dE(lab(await garmentColor(p.thumb || p.image)), target); } catch { p._color = null; }
    });
    const limit = ["blanco", "crudo", "negro", "gris-claro"].includes(wanted.k) ? 22 : 34; // blanco y negro, más estrictos
    for (let i = viaImg.length - 1; i >= 0; i--) if (viaImg[i]._color != null && viaImg[i]._color > limit) { viaImg.splice(i, 1); dropped++; }
    viaImg.forEach((p) => { if (p._color != null) p._hits += Math.max(0, (limit - p._color) / limit) * 2; });
  }
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
  const fromPages = ok.filter((p) => typeOk(p.name, type, piece) && sectionOk(p.name, p.url)).filter((p) => { const named = colorsInTitle(p.name); return !(wanted?.k && named.length && !named.some((k) => k === wanted.k || FAMILY[k] === FAMILY[wanted.k])); }).map((p) => {
    const hits = new Set(words(p.name).map(stem).filter((w) => want.has(w))).size;
    return { store: p.store, name: p.name.slice(0, 120), price: p.price ? `${p.price.toFixed(2).replace(".", ",")} ${p.currency}` : "", priceNum: p.price, url: p.url, image: p.image, color: "", _hits: hits };
  });
  const seenU = new Set(), products = [...viaImg, ...fromPages].filter((p) => { const k = p.url.split("?")[0]; if (seenU.has(k)) return false; seenU.add(k); return true; })
    .sort((a, b) => b._hits - a._hits).slice(0, max);
  diag.push(`por imágenes ${viaImg.length}${dropped ? `, ${dropped} quitadas por color` : ""} (${[...new Set(viaImg.map((p) => p.store))].join(", ") || "ninguna tienda"}) · enlaces de tiendas ${shopLinks}, fichas ${picked.length}, leídas ${ok.length}${fails.length ? ` (fallos: ${[...new Set(fails)].slice(0, 4).join(", ")})` : ""}`);
  return { products, diag };
}
