// Motor propio (sin IA): outfits del día, maleta, qué te falta y encaje con tu estilo.
// Se usa cuando Gemini falla o tarda, y también se puede elegir siempre. Reglas de estilismo + puntuación.
import { TYPE, COLOR, label } from "./catalog.js";

/* ---------- datos de base ---------- */
const NEUTRAL = new Set(["blanco", "crudo", "beige", "camel", "marron", "gris-claro", "gris", "antracita", "negro", "azul-marino", "denim", "caqui"]);
const SEMI = new Set(["oliva", "celeste", "burdeos"]); // casi neutros: combinan con casi todo
const DARK = new Set(["negro", "antracita", "azul-marino", "marron", "burdeos", "oliva"]);
const FORMALITY = { // 1 deporte · 2 diario · 3 arreglado · 4 elegante · 5 traje
  camiseta: 2, "camiseta-ml": 2, polo: 3, tirantes: 1, camisa: 3.5, "camisa-mc": 2.5, sobrecamisa: 2.5, blusa: 3.5, top: 2.5,
  jersey: 3, cardigan: 3, sudadera: 1.5, "sudadera-capucha": 1.5, "chaleco-punto": 3,
  cazadora: 2.5, chaqueta: 3, americana: 4.5, abrigo: 4, gabardina: 4, plumifero: 2, parka: 2, chaleco: 2,
  pantalon: 3, chino: 3, vaquero: 2.5, "traje-pantalon": 4.5, jogger: 1, bermuda: 1.5,
  zapatillas: 2, zapatos: 4.5, mocasines: 4, botas: 2.5, botines: 3.5, sandalias: 1,
};
const WARMTH = { // abrigo que da cada capa exterior / de punto
  plumifero: 3, parka: 3, abrigo: 3, gabardina: 2, americana: 1.5, chaqueta: 2, cazadora: 2, chaleco: 1.5, sobrecamisa: 1,
  jersey: 1.5, cardigan: 1.2, sudadera: 1.2, "sudadera-capucha": 1.2, "chaleco-punto": 0.8,
};
const SHORT = new Set(["camiseta", "polo", "tirantes", "camisa-mc"]);
const BASE_TOP = new Set(["camiseta", "camiseta-ml", "polo", "tirantes", "camisa", "camisa-mc", "blusa", "top"]);
const MID = new Set(["jersey", "cardigan", "sudadera", "sudadera-capucha", "chaleco-punto"]);
const OUTER = new Set(["cazadora", "chaqueta", "americana", "abrigo", "gabardina", "plumifero", "parka", "chaleco", "sobrecamisa"]);
const BOTTOM = new Set(["pantalon", "chino", "vaquero", "traje-pantalon", "jogger", "bermuda", "falda"]);
const SHOES = new Set(["zapatillas", "zapatos", "mocasines", "botas", "botines", "sandalias"]);
const SEASON_OF_MONTH = ["invierno", "invierno", "primavera", "primavera", "primavera", "verano", "verano", "verano", "otono", "otono", "otono", "invierno"];

const PLAN_RULES = [ // palabras del plan → formalidad buscada y matiz
  [/gym|gimnasio|deporte|correr|entren|padel|pádel|fútbol|futbol|bici/i, 1, "deporte"],
  [/casa|sof[aá]|relax|descans|recados|compra(r|s)? del super/i, 1.8, "relax"],
  [/boda|gala|evento|entrevista|graduaci|ceremonia|comuni[oó]n|bautizo/i, 4.5, "evento"],
  [/trabaj|oficina|reuni[oó]n|geieg|pr[aá]cticas|cliente/i, 3.2, "trabajo"],
  [/cita|cena|restaurante|teatro|concierto|aniversario/i, 3.5, "cita"],
  [/fiesta|discoteca|salir|noche|copas|bar\b|club/i, 3.3, "noche"],
  [/clase|uni|universidad|facultad|estudi|biblioteca|examen|laboratorio/i, 2.5, "clase"],
  [/viaje|aeropuerto|avi[oó]n|tren|coche/i, 2.2, "viaje"],
  [/paseo|amigos|caf[eé]|tarde|centro|museo|cine/i, 2.6, "paseo"],
];

/* ---------- utilidades ---------- */
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function hsl(hex) {
  const c = hexRgb(hex); if (!c) return null;
  const [r, g, b] = c.map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}
const dist = (a, b) => { const x = hexRgb(a), y = hexRgb(b); return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 999; };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const words = (s) => norm(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 3);
const mainColor = (it) => it.colors?.[0] || { k: "", hex: it.tone };
const colorName = (k) => (label(COLOR[k]) || k || "").toLowerCase();
const typeName = (it) => (label(TYPE[it.type]) || it.type || "").toLowerCase();
const formalityOf = (it) => +it.formality || FORMALITY[it.type] || 2.5;
const isKind = (set) => (it) => set.has(it.type);
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

/** Compatibilidad de dos colores, de -2 (chocan) a +2 (seguro). */
function colorPair(a, b) {
  const ka = a.k, kb = b.k;
  if (ka === "multicolor" || kb === "multicolor") return NEUTRAL.has(ka) || NEUTRAL.has(kb) ? 0.5 : -1.5;
  const na = NEUTRAL.has(ka), nb = NEUTRAL.has(kb);
  if (na && nb) return (ka === "negro" && kb === "azul-marino") || (kb === "negro" && ka === "azul-marino") ? 0.8 : 2;
  if (na || nb) return 1.5;
  if (SEMI.has(ka) || SEMI.has(kb)) return 0.8;
  const x = hsl(a.hex), y = hsl(b.hex);
  if (!x || !y) return 0;
  const dh = Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h));
  if (dh < 25) return 1; // misma gama (tono sobre tono)
  if (dh > 150 && Math.min(x.s, y.s) < 0.35) return 0.3; // complementarios apagados
  return -1.5; // dos colores fuertes distintos
}

/* ---------- contexto: tiempo, plan, estilo ---------- */
export function contextFrom({ weather, plan, style, date = new Date() }) {
  const temp = weather ? Math.round(((weather.feelsMax ?? weather.max) * 0.6 + (weather.feelsMin ?? weather.min) * 0.4)) : null;
  const rule = PLAN_RULES.find(([re]) => re.test(plan || ""));
  const board = styleFor(style, plan);
  const palette = (board?.palette || []).map((p) => p.hex).filter((h) => hexRgb(h));
  const styleWords = new Set([...(board?.keyPieces || []), ...(board?.keywords || []), ...(board?.formulas || []), ...(board?.mix || []).map((m) => m.name)].flatMap(words));
  const avoidWords = new Set(words(board?.avoid || ""));
  return {
    temp, rain: weather?.rain ?? 0, sunny: [0, 1, 2].includes(weather?.code), season: SEASON_OF_MONTH[date.getMonth()],
    formality: rule ? rule[1] : 2.6, mood: rule ? rule[2] : "diario", plan: plan || "",
    board, palette, styleWords, avoidWords, mix: board?.mix || [],
  };
}
/** Con varios tableros, el que encaja con el plan (por su uso); si no, el principal. */
function styleFor(style, plan) {
  if (!style) return null;
  const p = norm(plan);
  const extra = (style.extra || []).filter((b) => b.summary && words(b.use).some((w) => p.includes(w)));
  return extra[0] || (style.summary ? style : null);
}

/* ---------- puntuación de una prenda sola ---------- */
function itemScore(it, ctx, recentDays) {
  let s = 0;
  const T = ctx.temp;
  // temporada
  if (it.seasons?.length && !it.seasons.includes(ctx.season)) s -= 1.2;
  // tiempo
  if (T != null) {
    if (SHORT.has(it.type) && T < 15) s -= 1.5;
    if (it.type === "tirantes" && T < 24) s -= 3;
    if ((it.type === "bermuda" || it.type === "sandalias") && T < 21) s -= 4;
    if ((it.type === "bermuda" || it.type === "sandalias" || SHORT.has(it.type)) && T >= 26) s += 1;
    if (MID.has(it.type) && T >= 23) s -= 3;
    if (["plumifero", "parka", "abrigo"].includes(it.type) && T >= 16) s -= 4;
    if (it.materialKey === "lana" || it.materialKey === "cachemira") s += T < 14 ? 0.6 : T > 21 ? -1.5 : 0;
    if (it.materialKey === "lino") s += T > 22 ? 0.8 : T < 16 ? -1.2 : 0;
  }
  if (ctx.rain >= 50) {
    if (it.materialKey === "ante" || it.type === "sandalias") s -= 2;
    if (it.type === "botas" || it.type === "botines" || it.type === "gabardina" || it.type === "parka") s += 0.8;
  }
  // formalidad del plan
  s -= Math.max(0, Math.abs(formalityOf(it) - ctx.formality) - 0.8) * 1.1;
  if (ctx.mood === "deporte" && (it.type === "jogger" || it.type === "zapatillas" || it.type.startsWith("sudadera") || it.type === "camiseta")) s += 1.5;
  // estilo de su Pinterest
  s += styleBonus(it, ctx);
  // uso reciente: no repetir lo de ayer, sacar lo que no se usa
  const last = recentDays.get(it.id);
  if (last != null) s -= last <= 1 ? 2.5 : last <= 3 ? 1.2 : 0.4;
  if (!it.wearCount) s += 0.4;
  return s;
}
function styleBonus(it, ctx) {
  let b = 0;
  if (ctx.palette.length) {
    const d = Math.min(...(it.colors?.length ? it.colors : [mainColor(it)]).map((c) => Math.min(...ctx.palette.map((p) => dist(c.hex, p)))));
    b += d < 45 ? 1.4 : d < 80 ? 0.7 : d > 150 ? -0.4 : 0;
  }
  if (ctx.styleWords.size) {
    const w = new Set([...words(it.name), ...words(typeName(it)), ...(it.styleTags || []).flatMap(words), ...(it.colors || []).flatMap((c) => words(colorName(c.k)))]);
    let hits = 0; w.forEach((x) => { if (ctx.styleWords.has(x)) hits++; });
    b += Math.min(1.6, hits * 0.45);
    let bad = 0; w.forEach((x) => { if (ctx.avoidWords.has(x)) bad++; });
    b -= Math.min(1.5, bad * 0.6);
  }
  return b;
}

/* ---------- puntuación del conjunto ---------- */
function harmony(items) {
  let s = 0, n = 0;
  const cols = items.filter((it) => !["cinturon", "reloj", "joya", "gafas-ver"].includes(it.type)).map(mainColor);
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) { s += colorPair(cols[i], cols[j]); n++; }
  let score = n ? (s / n) * 2.2 : 0;
  const strong = cols.filter((c) => c.k && !NEUTRAL.has(c.k) && !SEMI.has(c.k)).length;
  if (strong > 1) score -= (strong - 1) * 1.2; // un solo color protagonista
  const patterns = items.filter((it) => it.pattern && !["liso", "texturizado"].includes(it.pattern)).length;
  if (patterns > 1) score -= 2.5 * (patterns - 1);
  const f = items.map(formalityOf), spread = Math.max(...f) - Math.min(...f);
  if (spread > 2) score -= (spread - 2) * 1.5;
  const has = (t) => items.some((it) => it.type === t);
  if (has("jogger") && (has("mocasines") || has("zapatos") || has("americana"))) score -= 2.5;
  if (has("bermuda") && (has("botas") || has("americana") || has("abrigo"))) score -= 3;
  if (has("traje-pantalon") && has("zapatillas")) score -= 0.8;
  if (has("sudadera-capucha") && (has("americana") || has("abrigo"))) score -= 0.6;
  if (has("camisa") && has("chino") && (has("mocasines") || has("botines"))) score += 0.8; // fórmula clásica
  if (has("camiseta") && has("vaquero") && has("zapatillas")) score += 0.5;
  const dark = cols.filter((c) => DARK.has(c.k)).length / Math.max(1, cols.length);
  return { score, dark };
}

/* ---------- outfits del día ---------- */
/**
 * items: prendas disponibles; weather: todayWeather(); plan: texto; style: store.style;
 * wear: store.wear; feedback: store.feedback; exclude: [[ids]]; count.
 * Devuelve {outfits:[{title,itemIds,why,how[],tucked[],repeats[]}], missing, engine:true}
 */
export function suggestOutfits({ items, weather, plan, style, wear = [], feedback = [], exclude = [], count = 4, date = new Date(), must = null }) {
  const ctx = contextFrom({ weather, plan, style, date });
  const today = date.toISOString().slice(0, 10);
  const recentDays = new Map();
  for (const w of wear) {
    if (w.date >= today) continue;
    const days = Math.round((new Date(today) - new Date(w.date)) / 864e5);
    for (const id of w.itemIds || []) if (!recentDays.has(id) || recentDays.get(id) > days) recentDays.set(id, days);
  }
  const sc = new Map(items.map((it) => [it.id, itemScore(it, ctx, recentDays)]));
  const mustIt = must ? items.find((it) => it.id === must) : null;
  if (mustIt) sc.set(mustIt.id, Math.max(sc.get(mustIt.id), 0) + 4); // la prenda pedida va sí o sí
  const best = (arr, n) => { const l = arr.slice().sort((a, b) => sc.get(b.id) - sc.get(a.id)).slice(0, n); if (mustIt && arr.includes(mustIt) && !l.includes(mustIt)) l.push(mustIt); return l; };
  const tops = best(items.filter((it) => BASE_TOP.has(it.type) || MID.has(it.type)), 14);
  const mids = items.filter(isKind(MID));
  const outers = items.filter(isKind(OUTER));
  const bottoms = best(items.filter(isKind(BOTTOM)), 9);
  const shoes = best(items.filter(isKind(SHOES)), 7);
  const liked = feedback.filter((f) => f.liked).map((f) => new Set(f.itemIds)), disliked = feedback.filter((f) => !f.liked).map((f) => f.itemIds.slice().sort().join());
  const excluded = new Set(exclude.map((ids) => ids.slice().sort().join()));

  if (!tops.length || !bottoms.length) {
    return { outfits: [], missing: !tops.length ? "Añade camisetas, camisas o jerséis para que pueda montar outfits." : "Añade algún pantalón para que pueda montar outfits.", engine: true };
  }
  const T = ctx.temp;
  const needWarmth = T == null ? 1 : T < 8 ? 3.5 : T < 12 ? 3 : T < 16 ? 2 : T < 20 ? 1 : 0; // abrigo que pide el día
  const maxWarmth = T == null ? 4 : T >= 24 ? 0.3 : T >= 20 ? 1.6 : 6;

  const combos = [];
  for (const top of tops) for (const bot of bottoms) for (const sh of shoes.length ? shoes : [null]) {
    const base = [top, bot, sh].filter(Boolean);
    let warmth = WARMTH[top.type] || 0;
    // capa de punto encima de la camisa/camiseta si hace falta abrigo
    let layers = [];
    if (BASE_TOP.has(top.type) && needWarmth >= 1.5 && mids.length) {
      const m = bestAdd(base, mids, sc, ctx); if (m && m.gain > -1.5) { layers.push(m.item); warmth += WARMTH[m.item.type] || 1; }
    }
    // capa exterior
    if (warmth < needWarmth || (needWarmth >= 1 && ctx.formality >= 4)) {
      const fit = outers.filter((o) => (WARMTH[o.type] || 1) + warmth >= needWarmth - 0.6 || ctx.formality >= 4);
      const o = bestAdd([...base, ...layers], fit.length ? fit : outers, sc, ctx);
      if (o) { layers.push(o.item); warmth += WARMTH[o.item.type] || 1; }
    }
    if (mustIt && (MID.has(mustIt.type) || OUTER.has(mustIt.type)) && ![...base, ...layers].includes(mustIt)) {
      // con «¿con qué lo combino?» de una capa: se pone esa capa (y se quita la otra del mismo tipo)
      layers = layers.filter((x) => (MID.has(mustIt.type) ? !MID.has(x.type) : !OUTER.has(x.type)));
      layers.push(mustIt); warmth = (WARMTH[top.type] || 0) + layers.reduce((a, x) => a + (WARMTH[x.type] || 1), 0);
    }
    if (warmth > maxWarmth && !mustIt) continue;
    const all = [...base, ...layers];
    if (mustIt && TYPE[mustIt.type]?.g !== "complementos" && !all.includes(mustIt)) continue;
    const ids = all.map((x) => x.id);
    const key = ids.slice().sort().join();
    if (excluded.has(key)) continue;
    const h = harmony(all);
    let score = all.reduce((a, it) => a + sc.get(it.id), 0) / all.length * 2 + h.score;
    if (warmth < needWarmth - 0.6) score -= (needWarmth - warmth) * 2; // pasaría frío
    if (!sh) score -= 3;
    if (ctx.mood === "noche" && h.dark > 0.5) score += 1;
    if (disliked.includes(key)) score -= 6;
    if (liked.some((l) => ids.filter((id) => l.has(id)).length >= 3)) score += 1.5;
    combos.push({ items: all, ids, score, warmth, h });
  }
  combos.sort((a, b) => b.score - a.score);

  // elegir los mejores pero distintos entre sí
  const chosen = [];
  const used = new Map();
  for (const c of combos) {
    if (chosen.length >= count) break;
    const overlap = c.ids.filter((id) => used.has(id)).length;
    const sameCore = chosen.some((o) => o.ids.includes(c.ids[0]) && o.ids.includes(c.ids[1]));
    if (sameCore || overlap > Math.max(1, Math.floor(c.ids.length / 2))) continue;
    if (overlap && c.score - overlap * 1.5 < (combos[0]?.score ?? 0) - 9) continue;
    chosen.push(c); c.ids.forEach((id) => used.set(id, (used.get(id) || 0) + 1));
  }
  // si el armario es pequeño, completar repitiendo
  for (const c of combos) { if (chosen.length >= count) break; if (!chosen.includes(c)) chosen.push(c); }

  const accs = items.filter((it) => TYPE[it.type]?.g === "complementos" && !(mustIt && it.type === mustIt.type && it.id !== mustIt.id));
  const watchUse = new Map();
  const outfits = chosen.map((c, i) => {
    let x = addAccessories(c, ctx, accs, sc, i, watchUse);
    if (mustIt && !x.ids.includes(mustIt.id)) x = { ...x, items: [...x.items, mustIt], ids: [...x.ids, mustIt.id] };
    return describeOutfit(x, ctx, i);
  });
  const missing = !shoes.length ? "No tienes calzado en el armario: añádelo para que los outfits estén completos."
    : needWarmth >= 2 && !outers.length ? `Para ${T} °C te vendría bien una chaqueta o un abrigo: no tienes ninguno disponible.` : null;
  return { outfits, missing, engine: true };
}
function bestAdd(base, options, sc, ctx) {
  let best = null;
  for (const it of options) {
    if (base.some((b) => b.id === it.id)) continue;
    const gain = sc.get(it.id) + harmony([...base, it]).score - harmony(base).score;
    if (!best || gain > best.gain) best = { item: it, gain };
  }
  return best;
}

/* ---------- complementos ---------- */
const COL_FAMILY = (k) => ["marron", "camel", "beige"].includes(k) ? "marron" : ["negro", "antracita"].includes(k) ? "negro" : k;
/** Elige el reloj: formalidad parecida a la del conjunto, correa a juego con zapatos/cinturón, tono del estilo y rotación. */
function bestWatch(watches, c, f, ctx, sc, used = new Map()) {
  const shoe = c.items.find(isKind(SHOES)), shoeFam = shoe ? COL_FAMILY(mainColor(shoe).k) : null;
  const dark = harmony(c.items).dark > 0.5;
  const score = (w) => {
    const words = new Set([...(w.colors || []).map((x) => x.k), ...String(`${w.name} ${w.material || ""} ${w.materialKey || ""} ${(w.styleTags || []).join(" ")}`).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9-]+/)]);
    const leather = words.has("cuero") || words.has("piel") || words.has("correa");
    const sporty = ["deportivo", "sport", "smartwatch", "digital", "caucho", "silicona", "buceo"].some((x) => words.has(x));
    const metal = ["acero", "metal", "plata", "plateado", "dorado", "oro", "titanio"].some((x) => words.has(x));
    let s = -(used.get(w.id) || 0) * 0.7 + (sc.get(w.id) || 0) * 0.3 + (metal ? 0.6 : 0); // el de metal va con casi todo; la paleta pesa poco en un reloj
    s -= Math.abs(formalityOf(w) - f) * 1.2;                       // de vestir con lo arreglado, deportivo con lo informal
    if (sporty) s += ctx.mood === "deporte" ? 2 : f <= 1.8 ? 0.5 : f >= 3 ? -1.5 : -0.3;
    if (leather && shoeFam) s += (w.colors || []).some((x) => COL_FAMILY(x.k) === shoeFam) ? 1.5 : -0.8; // correa a juego con el calzado
    if (dark && (w.colors || []).some((x) => ["negro", "antracita"].includes(x.k))) s += 0.8; // looks oscuros, reloj oscuro
    if (!dark && (w.colors || []).some((x) => ["gris", "gris-claro", "plata", "blanco", "beige", "camel", "marron"].includes(x.k))) s += 0.4;
    return s;
  };
  const w = watches.slice().sort((a, b) => score(b) - score(a))[0];
  used.set(w.id, (used.get(w.id) || 0) + 1);
  return w;
}

/** Elige las gafas de ver: montura oscura con looks oscuros, de pasta/metal según la formalidad, a juego con el calzado si son marrones/carey; y rota. */
function bestGlasses(list, c, f, used = new Map()) {
  const dark = harmony(c.items).dark > 0.5, shoe = c.items.find(isKind(SHOES)), shoeFam = shoe ? COL_FAMILY(mainColor(shoe).k) : null;
  const score = (g) => {
    const fam = COL_FAMILY(mainColor(g).k), words = String(`${g.name} ${g.material || ""} ${(g.styleTags || []).join(" ")}`).toLowerCase();
    let s = -(used.get(g.id) || 0) * 0.7 - Math.abs(formalityOf(g) - f) * 0.8;
    if (dark && fam === "negro") s += 0.8;
    if (shoeFam && fam === shoeFam) s += 0.6;
    if (/metal|dorad|platead|titanio/.test(words) && f >= 3) s += 0.4;
    return s;
  };
  const g = list.slice().sort((a, b) => score(b) - score(a))[0];
  used.set(g.id, (used.get(g.id) || 0) + 1);
  return g;
}

/** Para outfits que vienen de la IA: si tiene gafas de ver y el outfit no las lleva, se las pone (las mejores para ese conjunto). */
export function ensureGlasses(outfits, items) {
  const glasses = items.filter((i) => i.type === "gafas-ver" && i.status !== "prestada"); if (!glasses.length) return outfits;
  const used = new Map(), byId = new Map(items.map((i) => [i.id, i]));
  return outfits.map((o) => {
    const its = (o.itemIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!its.length || its.some((i) => i.type === "gafas-ver")) return o;
    const f = its.reduce((a, it) => a + formalityOf(it), 0) / its.length;
    return { ...o, itemIds: [...o.itemIds, bestGlasses(glasses, { items: its }, f, used).id] };
  });
}

/** Añade al conjunto los complementos del armario que lo rematan (máx. 3) y apunta en c.extras los que le faltarían. */
function addAccessories(c, ctx, accs, sc, seed, watchUse) {
  const f = c.items.reduce((a, it) => a + formalityOf(it), 0) / c.items.length;
  const T = ctx.temp, has = (t) => c.items.some((it) => it.type === t);
  const top = c.items.find((it) => ["camisa", "polo"].includes(it.type)), bottom = c.items.find(isKind(BOTTOM)), shoe = c.items.find(isKind(SHOES));
  const tucked = top && bottom && bottom.type !== "jogger" && f >= 2.8;
  const want = []; // [tipo, motivo para sugerirlo si no lo tiene]
  if (tucked) want.push(["cinturon", `Cinturón de piel ${shoe && COL_FAMILY(mainColor(shoe).k) === "negro" ? "negro" : "marrón"} a juego con los zapatos`]);
  if (ctx.sunny && T != null && T >= 14) want.push(["gafas", "Gafas de sol de pasta o metal"]);
  if (T != null && T < 10) want.push(["bufanda", "Bufanda de lana en gris o camel"]);
  if (T != null && T < 6) want.push(["gorro", "Gorro de punto liso"]);
  if (ctx.mood === "clase" || ctx.mood === "viaje") want.push(["mochila", "Mochila sencilla de lona o piel"]);
  if (ctx.mood === "evento" && f >= 4) want.push(["corbata", "Corbata lisa de punto o seda"]);
  if ((ctx.mood === "noche" || ctx.mood === "cita") && f >= 2.8) want.push(["joya", "Cadena o anillo plateado discreto"]);
  if (f <= 2.2 && !ctx.rain && (ctx.mood === "relax" || ctx.mood === "deporte" || ctx.mood === "paseo")) want.push(["gorra", "Gorra lisa"]);
  const added = [], extras = [];
  // reloj SIEMPRE (si tiene alguno): el que mejor encaja con este conjunto
  const watches = accs.filter((a) => a.type === "reloj");
  if (watches.length && !has("reloj")) added.push(bestWatch(watches, c, f, ctx, sc, watchUse));
  else if (!watches.length) extras.push("Reloj de esfera sencilla con correa de piel o metal");
  // gafas de ver SIEMPRE (las lleva a diario): las que mejor van con el conjunto
  const glasses = accs.filter((a) => a.type === "gafas-ver");
  if (glasses.length && !has("gafas-ver")) added.push(bestGlasses(glasses, c, f, watchUse));
  for (const [type, suggestion] of want) {
    if (added.filter((a) => a.type !== "reloj" && a.type !== "gafas-ver").length >= 3) break;
    const opts = accs.filter((a) => a.type === type && !has(type));
    if (!opts.length) { if (extras.length < 2) extras.push(suggestion); continue; }
    // a juego: cinturón del color de los zapatos; si no, el que mejor puntúa
    opts.sort((a, b) => {
      const m = (x) => type === "cinturon" && shoe && COL_FAMILY(mainColor(x).k) === COL_FAMILY(mainColor(shoe).k) ? 3 : 0;
      return (m(b) + (sc.get(b.id) || 0)) - (m(a) + (sc.get(a.id) || 0));
    });
    added.push(opts[seed % Math.min(2, opts.length)] || opts[0]);
  }
  if (!added.length && !extras.length) return c;
  return { ...c, items: [...c.items, ...added], ids: [...c.ids, ...added.map((a) => a.id)], extras };
}

const TITLE_BY_F = [[1.6, ["Cómodo", "Deportivo", "Relajado"]], [2.4, ["Básico", "Diario", "Sin pensar"]], [3.1, ["Casual cuidado", "Smart casual", "Diario arreglado"]], [3.9, ["Arreglado", "Pulido", "Clásico"]], [9, ["Elegante", "De ocasión", "Impecable"]]];
function describeOutfit(c, ctx, i) {
  const f = c.items.reduce((a, it) => a + formalityOf(it), 0) / c.items.length;
  const base = pick(TITLE_BY_F.find(([lim]) => f <= lim)[1], i);
  const cols = [...new Set(c.items.filter((it) => TYPE[it.type]?.g !== "complementos").map((it) => colorName(mainColor(it).k)).filter(Boolean))];
  const mixName = nearestMix(c, ctx);
  const title = `${mixName ? `${mixName} · ` : ""}${base}${cols.length ? ` en ${cols.slice(0, 2).join(" y ")}` : ""}`;
  const find = (set) => c.items.find(isKind(set));
  const top = c.items.find((it) => BASE_TOP.has(it.type)), mid = find(MID), outer = find(OUTER), bottom = find(BOTTOM), shoe = find(SHOES);
  const why = [];
  const neutrals = c.items.filter((it) => NEUTRAL.has(mainColor(it).k)).length;
  const accent = c.items.map((it) => mainColor(it).k).find((k) => k && !NEUTRAL.has(k));
  why.push(neutrals === c.items.length ? "Todo neutros: combina seguro" : neutrals ? `El ${colorName(accent) || "color"} de protagonista sobre neutros` : "Colores de la misma gama");
  if (ctx.temp != null) why.push(outer ? `${typeName(outer)} para los ${ctx.temp} °C` : ctx.temp >= 22 ? `ligero para los ${ctx.temp} °C` : mid ? `${typeName(mid)} para no pasar frío` : `pensado para ${ctx.temp} °C`);
  if (ctx.palette.length && c.items.some((it) => styleBonus(it, ctx) > 0.6)) why.push("dentro de la paleta de tu estilo");
  if (ctx.rain >= 50) why.push("preparado para la lluvia");
  const how = [], tucked = [];
  if (top && ["camisa", "polo"].includes(top.type) && bottom && bottom.type !== "jogger" && f >= 2.8) { how.push(`${cap(typeName(top))} por dentro${c.items.some((x) => x.type === "cinturon") ? " con el cinturón a la vista" : ""}.`); tucked.push(top.id); }
  else if (top && top.type === "camiseta" && bottom && ["chino", "pantalon", "traje-pantalon"].includes(bottom.type)) how.push("Camiseta por dentro, o solo por delante si quieres algo más relajado.");
  if (mid && top && top.type === "camisa") how.push(`Deja asomar el cuello de la camisa por el ${typeName(mid)}.`);
  if (top && ["camisa", "sobrecamisa", "camiseta-ml"].includes(top.type) && ctx.temp >= 19) how.push("Remanga las mangas dos vueltas.");
  if (outer && ctx.temp != null && ctx.temp >= 15) how.push(`Lleva la ${typeName(outer)} abierta; si refresca por la tarde, ciérrala.`);
  if (bottom && shoe && ["chino", "pantalon", "traje-pantalon"].includes(bottom.type) && ["mocasines", "zapatillas"].includes(shoe.type) && ctx.temp >= 18) how.push("Bajo del pantalón con una vuelta para que se vea el tobillo.");
  if (outer && ctx.temp != null && ctx.temp < 10) how.push(`Hace frío: ${typeName(outer)} cerrada y, si tienes, bufanda.`);
  if (ctx.rain >= 50) how.push("Llueve: mejor calzado que no sea de ante.");
  const acc = c.items.filter((it) => TYPE[it.type]?.g === "complementos");
  if (acc.length) how.push(`Remátalo con ${acc.map((a) => typeName(a)).join(", ").replace(/, ([^,]*)$/, " y $1")}.`);
  return { title, itemIds: c.ids, why: why.join(", ") + ".", how: how.slice(0, 4), tucked, repeats: [], extras: c.extras || [], engine: true };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Estética de su mezcla más cercana a este conjunto (por palabras clave de cada estética). */
function nearestMix(c, ctx) {
  if (!ctx.mix?.length) return "";
  const w = new Set(c.items.flatMap((it) => [...words(it.name), ...words(typeName(it)), ...(it.styleTags || []).flatMap(words), ...words(colorName(mainColor(it).k))]));
  const dark = harmony(c.items).dark;
  let best = null;
  for (const m of ctx.mix) {
    let s = words(`${m.name} ${m.look}`).filter((x) => w.has(x)).length;
    if (/starboy|street|urban|noche|rock/i.test(m.name)) s += dark > 0.5 ? 1 : -0.5;
    if (/old money|clasic|clásic|prep|quiet/i.test(m.name)) s += dark <= 0.5 ? 0.6 : 0;
    if (!best || s > best.s) best = { name: m.name, s };
  }
  return best && best.s >= 1 ? best.name : "";
}

/* ---------- maleta ---------- */
export function packTrip({ items, weather, plan, style, days }) {
  const out = [], pack = new Set();
  const wdays = weather?.days?.length ? weather.days : Array.from({ length: days }, () => null);
  for (let d = 0; d < days; d++) {
    const w = wdays[d] || wdays[wdays.length - 1];
    const wx = w ? { max: w.max, min: w.min, rain: w.rain ?? 0 } : null;
    // repetir prendas que ya van en la maleta: menos equipaje
    const pool = items.map((it) => ({ ...it, wearCount: pack.has(it.id) ? 5 : it.wearCount }));
    const r = suggestOutfits({ items: pool, weather: wx, plan, style, wear: out.map((o, k) => ({ date: dayStr(d - k - 1), itemIds: o.itemIds })), count: 3, date: new Date(Date.now() + d * 864e5) });
    const choice = r.outfits.sort((a, b) => b.itemIds.filter((id) => pack.has(id)).length - a.itemIds.filter((id) => pack.has(id)).length)[0] || r.outfits[0];
    if (!choice) continue;
    choice.itemIds.forEach((id) => pack.add(id));
    out.push({ day: d + 1, title: choice.title, itemIds: choice.itemIds, how: choice.how.slice(0, 2) });
  }
  const temps = wdays.filter(Boolean);
  const tips = [`Con ${pack.size} prendas montas los ${days} días: se repiten las que combinan con todo.`];
  if (temps.some((w) => (w.rain ?? 0) >= 50)) tips.push("Hay días de lluvia: mete un paraguas plegable y evita el ante.");
  if (temps.length && Math.max(...temps.map((w) => w.max)) - Math.min(...temps.map((w) => w.min)) >= 10) tips.push("Mucha diferencia entre día y noche: viste por capas.");
  tips.push("Enrolla las camisetas y mete los calcetines dentro de los zapatos para ganar sitio.");
  return { pack: [...pack], days: out, tips, missing: null, engine: true };
}
const dayStr = (off) => new Date(Date.now() + off * 864e5).toISOString().slice(0, 10);

/* ---------- qué te falta ---------- */
const ESSENTIALS = [ // [tipo, colores aceptados, prenda, por qué, precio min-max, término de búsqueda]
  ["camiseta", ["blanco", "crudo"], "Camiseta blanca de algodón grueso", "La base que combina con todo tu armario.", 12, 30, "camiseta blanca algodón"],
  ["camiseta", ["negro", "azul-marino", "gris"], "Camiseta lisa negra o marino", "Segunda base para looks más oscuros.", 12, 30, "camiseta negra básica"],
  ["camisa", ["blanco", "celeste"], "Camisa oxford blanca o celeste", "Sube cualquier look de vaquero o chino un nivel.", 30, 60, "camisa oxford hombre"],
  ["jersey", null, "Jersey de punto fino en gris o marino", "Capa de entretiempo que va con camisas y camisetas.", 30, 70, "jersey punto fino"],
  ["chino", ["beige", "camel", "crudo", "caqui", "azul-marino"], "Chino beige de corte recto", "El pantalón puente entre lo arreglado y lo diario.", 30, 60, "chino recto beige"],
  ["vaquero", null, "Vaquero recto azul oscuro", "Va con casi todo tu armario, de camiseta a americana.", 35, 70, "vaquero recto azul oscuro"],
  ["zapatillas", ["blanco", "crudo"], "Zapatillas blancas de piel", "El calzado que combina con más outfits.", 50, 110, "zapatillas blancas piel"],
  ["mocasines", null, "Mocasines de piel marrones", "Para los días arreglados sin llegar a traje.", 50, 110, "mocasines piel marron"],
  ["cazadora", null, "Cazadora o sobrecamisa de entretiempo", "La capa de primavera y otoño que te falta.", 40, 100, "cazadora hombre"],
  ["abrigo", ["camel", "gris", "azul-marino", "negro", "antracita"], "Abrigo de lana en camel o gris", "Para invierno, y arregla cualquier look.", 90, 200, "abrigo lana hombre"],
  ["cinturon", null, "Cinturón de piel marrón", "Remata los looks con camisa por dentro.", 20, 45, "cinturon piel marron"],
];
const GROUP_OF = { camiseta: ["camiseta", "camiseta-ml", "polo"], camisa: ["camisa", "camisa-mc"], jersey: ["jersey", "cardigan", "chaleco-punto"], chino: ["chino", "pantalon"], vaquero: ["vaquero"], zapatillas: ["zapatillas"], mocasines: ["mocasines", "zapatos"], cazadora: ["cazadora", "chaqueta", "sobrecamisa", "gabardina"], abrigo: ["abrigo", "plumifero", "parka", "gabardina"], cinturon: ["cinturon"] };

export function findGaps({ items, style }) {
  const has = (type, colors) => items.some((it) => (GROUP_OF[type] || [type]).includes(it.type) && (!colors || (it.colors || []).some((c) => colors.includes(c.k))));
  const pairsFor = (type) => {
    const f = FORMALITY[type] || 2.5, layer = TYPE[type]?.g;
    return items.filter((it) => TYPE[it.type]?.g !== layer && Math.abs(formalityOf(it) - f) <= 1.2 && (NEUTRAL.has(mainColor(it).k) || SEMI.has(mainColor(it).k))).slice(0, 5).map((it) => it.id);
  };
  const gap = (kind, i, g) => ({
    id: `${kind}-${i}-${norm(g.piece).replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, kind, priority: g.priority || "media",
    stores: g.stores || ["zara", "massimo", "uniqlo"], newOutfits: g.pairs.length ? Math.min(12, g.pairs.length * 2) : null, pairsWith: g.pairs, ...g,
  });
  // (a) básicos que faltan para combinar mejor
  const combine = [];
  for (const [type, colors, piece, why, lo, hi, term] of ESSENTIALS) {
    if (has(type, colors)) continue;
    const pairs = pairsFor(type);
    combine.push({ piece, type, why, priceMin: lo, priceMax: hi, searchTerm: term, pairs, color: colors ? colorName(colors[0]) : "", colorHex: colors ? COLOR[colors[0]]?.hex || "#8a8f98" : "#8a8f98" });
  }
  combine.sort((a, b) => b.pairs.length - a.pairs.length);
  // (b) prendas clave de su estilo que no tiene
  const styleGaps = [];
  const board = style?.summary ? style : null;
  for (const kp of board?.keyPieces || []) {
    const w = words(kp);
    const type = Object.keys(FORMALITY).find((k) => w.includes(norm(k)) || w.includes(norm(label(TYPE[k]) || k).split(" ")[0])) || "";
    const owned = items.some((it) => { const iw = new Set([...words(it.name), ...words(typeName(it))]); return w.filter((x) => iw.has(x)).length >= Math.min(2, w.length); });
    if (owned || combine.some((g) => g.type === type && type)) continue;
    const colorKey = Object.keys(COLOR).find((k) => w.includes(norm(colorName(k)).split(" ")[0]));
    const [lo, hi] = priceFor(type);
    styleGaps.push({ piece: cap(kp), type, why: `Es una prenda clave de tu estilo «${board.name || ""}» y no la tienes.`, priceMin: lo, priceMax: hi, searchTerm: kp.split(/\s+/).slice(0, 4).join(" "), pairs: type ? pairsFor(type) : [], color: colorKey ? colorName(colorKey) : "", colorHex: colorKey ? COLOR[colorKey].hex : board.palette?.[0]?.hex || "#8a8f98" });
    if (styleGaps.length >= 5) break;
  }
  const n = items.length;
  const advice = n < 10 ? "Tu armario aún es pequeño: empieza por los básicos neutros, que multiplican los outfits."
    : combine.length >= 4 ? "Tienes prendas pero te faltan básicos puente: con pocos neutros sacarás muchos más outfits."
    : "Tienes una buena base: céntrate en las prendas que te acercan a tu estilo.";
  return {
    advice,
    combine: combine.slice(0, 5).map((g, i) => gap("combine", i, { ...g, priority: i < 2 ? "alta" : "media" })),
    style: styleGaps.map((g, i) => gap("style", i, { ...g, priority: i === 0 ? "alta" : "media" })),
    engine: true,
  };
}
function priceFor(type) {
  const g = TYPE[type]?.g;
  return { camisetas: [12, 35], camisas: [30, 65], punto: [30, 80], abrigo: [60, 180], pantalones: [30, 70], calzado: [50, 120], complementos: [15, 50] }[g] || [25, 70];
}

/* ---------- encaje armario ↔ estilo ---------- */
export function matchStyle({ items, style }) {
  const ctx = contextFrom({ weather: null, plan: "", style });
  const scored = items.map((it) => ({ id: it.id, s: styleBonus(it, ctx) }));
  const fits = scored.filter((x) => x.s >= 0.9).sort((a, b) => b.s - a.s).map((x) => x.id);
  const off = scored.filter((x) => x.s < 0).sort((a, b) => a.s - b.s).map((x) => x.id);
  const score = Math.round(Math.max(5, Math.min(92, 30 + (fits.length / Math.max(1, items.length)) * 55 - (off.length / Math.max(1, items.length)) * 30)));
  return { score, fits: fits.slice(0, 10), off: off.slice(0, 8), note: `Calculado por la app: ${fits.length} de tus ${items.length} prendas encajan con la paleta y las prendas clave de tu estilo.`, engine: true };
}

/* ---------- sujetador (sección mujer): que no se marque ni se transparente ---------- */
const LIGHT = new Set(["blanco", "crudo", "beige", "gris-claro", "celeste", "rosa", "amarillo", "nude"]);
const SKIN = new Set(["nude", "beige", "camel"]);
/** ¿Transparenta? Lo que diga la prenda; si no, por material y color (seda, gasa, lino, viscosa claros). */
export function sheerOf(it) {
  if (it.sheer) return it.sheer;
  const words = `${it.name || ""} ${it.material || ""}`.toLowerCase();
  if (/gasa|tul|organza|encaje|transparen|chiffon|crochet|ganchillo|malla/.test(words)) return "si";
  const light = LIGHT.has(mainColor(it).k);
  if (light && (["seda", "lino", "viscosa"].includes(it.materialKey) || /fin[oa]|satén|saten|popelín|popelin/.test(words))) return "algo";
  if (light && ["camiseta", "tirantes", "top", "blusa", "camisa", "camisa-mc"].includes(it.type)) return "algo"; // blanco fino: mejor no arriesgar
  return "no";
}
/**
 * Elige el sujetador para un conjunto. Mira la prenda que va pegada al cuerpo (la de arriba o el vestido):
 * si es clara o fina → color carne y sin relieve; si es ajustada o de punto fino → liso (el encaje se marca);
 * palabra de honor / espalda al aire → sin tirantes; con poca tela o deporte → el que toca. Devuelve {id, why, warn}.
 */
export function pickUnder(items, all) {
  const bras = all.filter((i) => BRA_TYPES_E.has(i.type) && i.status !== "sucia" && i.status !== "prestada");
  // la prenda que va pegada al cuerpo: vestido/mono, si no la de arriba de base, si no el jersey
  const base = items.find((i) => i.type === "vestido" || i.type === "mono") || items.find((i) => BASE_TOP.has(i.type)) || items.find((i) => MID.has(i.type));
  if (!base) return null;
  const sheer = sheerOf(base), col = mainColor(base).k, light = LIGHT.has(col), dark = !light && ["negro", "antracita", "azul-marino", "burdeos", "marron", "morado", "verde", "oliva"].includes(col);
  const fitted = base.fit === "slim" || ["punto", "viscosa", "seda"].includes(base.materialKey) || base.type === "top";
  const neck = base.neckline || "normal", sporty = formalityOf(base) <= 1.2 || /deport|gym|running/.test(`${base.name} ${(base.styleTags || []).join(" ")}`.toLowerCase());
  const needStrapless = neck === "sin-tirantes" || neck === "espalda";
  const reasons = [];
  if (sheer !== "no" || light) reasons.push(sheer === "si" ? "transparenta" : light ? "es de color claro" : "es fina");
  if (fitted) reasons.push("es ajustada");
  const score = (b) => {
    const bc = mainColor(b).k, finish = b.braFinish || (/encaje|bordad|puntilla/.test(`${b.name} ${b.material || ""}`.toLowerCase()) ? "relieve" : "liso");
    let s = 0;
    if (needStrapless) s += b.type === "sujetador-sin-tirantes" ? 5 : -6;
    if (sporty) s += b.type === "sujetador-deportivo" ? 3 : 0; else if (b.type === "sujetador-deportivo") s -= 1.5;
    if (fitted || sheer !== "no" || light) s += finish === "liso" ? 2.5 : -3;
    if (light || sheer !== "no") { if (SKIN.has(bc)) s += 3; else if (bc === "blanco") s -= 1.5; else if (["negro", "rojo", "burdeos", "azul-marino", "morado"].includes(bc)) s -= 4; else s -= 1; }
    else if (dark) { if (["negro", "antracita", "azul-marino", "burdeos", "marron"].includes(bc) || SKIN.has(bc)) s += 1; }
    if (b.type === "bralette" && (neck === "escote" || neck === "tirantes-finos") && sheer === "no" && !light) s += 1.5; // se puede dejar ver a propósito
    return s;
  };
  const what = sheer === "si" || light ? "color carne (nude) y sin costuras" : fitted ? "liso, sin costuras ni encaje" : needStrapless ? "sin tirantes" : "cualquiera cómodo";
  if (!bras.length) return { id: null, suggest: `Sujetador ${what}`, why: reasons.length ? `Porque «${base.name}» ${reasons.join(" y ")}` : sporty ? "Uno deportivo para moverte" : "Con esta prenda no se nota: el que te resulte más cómodo", warn: "" };
  const ranked = bras.map((b) => [b, score(b)]).sort((a, b) => b[1] - a[1]), [b, s] = ranked[0];
  const bc = mainColor(b).k;
  const why = [
    needStrapless ? "sin tirantes por el escote" : "",
    (light || sheer !== "no") && SKIN.has(bc) ? "el color carne no se ve a través" : "",
    (fitted || light || sheer !== "no") && (b.braFinish || "liso") === "liso" ? "liso para que no se marque" : "",
    sporty && b.type === "sujetador-deportivo" ? "deportivo para moverte" : "",
  ].filter(Boolean).join(", ") || "va bien con este conjunto";
  const warn = s < 0 ? `Con «${base.name}» lo ideal sería un sujetador ${what}${reasons.length ? ` porque ${reasons.join(" y ")}` : ""}; este es el que mejor queda de los que tienes.` : "";
  return { id: b.id, why: why.charAt(0).toUpperCase() + why.slice(1), warn };
}
const BRA_TYPES_E = new Set(["sujetador", "sujetador-sin-tirantes", "bralette", "sujetador-deportivo"]);
/** Añade el sujetador a cada outfit (campo under, no va en itemIds ni en el lienzo). */
export function addUnder(outfits, all) {
  return outfits.map((o) => { const its = (o.itemIds || []).map((id) => all.find((i) => i.id === id)).filter(Boolean); const u = pickUnder(its, all); return u ? { ...o, under: u } : o; });
}

/* ---------- calcetines: que vayan con el zapato, el pantalón, lo arreglado del look y el tiempo ---------- */
const DARKS = new Set(["negro", "antracita", "azul-marino", "gris", "marron", "burdeos", "oliva"]);
const FAM = (k) => ({ "azul-marino": "azul", denim: "azul", azul: "azul", celeste: "azul", antracita: "gris", gris: "gris", "gris-claro": "gris", negro: "negro", marron: "marron", camel: "marron", beige: "beige", crudo: "beige", nude: "beige", blanco: "blanco", burdeos: "rojo", rojo: "rojo", oliva: "verde", verde: "verde", caqui: "verde" }[k] || k);
const sockLen = (s) => s.sockLength || (/invisible|pinkie|no.?show/i.test(s.name) ? "invisible" : /tobiller|corto/i.test(s.name) ? "tobillero" : /alto|vestir|ejecutiv/i.test(s.name) ? "alto" : "media");
/**
 * Elige los calcetines para un conjunto. Reglas de estilismo:
 * · arreglado (zapatos, mocasines, pantalón de vestir): finos, altos o de media caña, del color del pantalón (o oscuros) para no cortar la pierna; nunca blancos de deporte.
 * · mocasines o zapatos con calor, bermudas o pantalón corto: invisibles.
 * · zapatillas: blancos, grises o negros (o a juego con el pantalón); con bermuda, tobilleros o invisibles.
 * · botas: media caña o altos; con frío, de lana.
 * · sandalias: sin calcetines.
 * Devuelve {id, why, warn} o null si el conjunto no tiene calzado.
 */
export function pickSocks(items, all, { temp = null } = {}) {
  const shoe = items.find(isKind(SHOES)); if (!shoe) return null;
  if (shoe.type === "sandalias") return { id: null, suggest: "Sin calcetines", why: "Con sandalias, mejor el pie al aire", warn: "" };
  const bottom = items.find(isKind(BOTTOM)) || items.find((i) => i.type === "vestido" || i.type === "mono");
  const f = items.reduce((a, it) => a + formalityOf(it), 0) / items.length;
  const short = bottom && (bottom.type === "bermuda" || bottom.type === "falda" || bottom.type === "vestido");
  const dressy = ["zapatos", "mocasines"].includes(shoe.type) && f >= 3, hot = temp != null && temp >= 22, cold = temp != null && temp < 10;
  let want, ideal;
  if (short || (shoe.type === "mocasines" && (hot || !cold && f < 3.5))) { want = ["invisible"]; ideal = "invisibles"; }
  else if (dressy) { want = ["alto", "media"]; ideal = `finos y altos${bottom ? ` en ${(label(COLOR[mainColor(bottom).k]) || "el color del pantalón").toLowerCase()}` : " oscuros"}`; }
  else if (shoe.type === "botas" || shoe.type === "botines") { want = ["media", "alto"]; ideal = cold ? "de lana, media caña o altos" : "de media caña"; }
  else { want = hot ? ["invisible", "tobillero", "media"] : ["media", "tobillero", "invisible"]; ideal = "blancos, grises o del color del pantalón"; }
  const socks = all.filter((i) => i.type === "calcetines" && i.status !== "sucia" && i.status !== "prestada");
  if (!socks.length) {
    // sin calcetines en el armario: igualmente, cómo deberían ser
    const reason = want[0] === "invisible" ? (short ? "Con la pierna al aire, que no se vean" : "Con mocasines queda más limpio sin calcetín a la vista")
      : dressy ? "En un look arreglado, finos y del color del pantalón para no cortar la pierna"
      : shoe.type === "botas" || shoe.type === "botines" ? (cold ? "Con botas y frío, más altos y abrigados" : "Que suban por encima de la bota para que no roce")
      : hot ? "Con calor y zapatillas, cortos y finos" : "Con zapatillas, blancos o neutros quedan bien siempre";
    return { id: null, suggest: `Calcetines ${ideal}`, why: reason, warn: "" };
  }
  const bfam = bottom ? FAM(mainColor(bottom).k) : null, sfam = FAM(mainColor(shoe).k);
  const plainLook = items.every((i) => !i.pattern || i.pattern === "liso");
  const score = (s) => {
    const len = sockLen(s), c = mainColor(s).k, fam = FAM(c), words = `${s.name} ${s.material || ""} ${s.materialKey || ""}`.toLowerCase();
    let v = want.includes(len) ? 3 - want.indexOf(len) * 0.6 : -3;
    if (len !== "invisible") { // el color solo cuenta si se ven
      if (dressy) { v += fam === bfam ? 3 : fam === sfam ? 1.8 : DARKS.has(c) ? 1.2 : c === "blanco" ? -4 : -1.5; if (s.pattern && s.pattern !== "liso") v += f >= 4 ? -2 : plainLook ? 0.4 : -0.5; if (/deport|sport|running|felpa/.test(words)) v -= 3; }
      else { v += c === "blanco" || c === "gris-claro" || c === "gris" || c === "negro" ? 1.5 : fam === bfam ? 1.2 : 0; if (s.pattern && s.pattern !== "liso") v += plainLook ? 0.6 : -0.6; }
    }
    if (cold && (s.materialKey === "lana" || /lana|grues|térmic|termic/.test(words))) v += 1.2;
    if (hot && (s.materialKey === "lana" || /lana|grues/.test(words))) v -= 2;
    v -= (s.wearsSinceWash || 0) * 0.2;
    return v;
  };
  const [best, sc] = socks.map((s) => [s, score(s)]).sort((a, b) => b[1] - a[1])[0];
  const len = sockLen(best), bc = mainColor(best).k;
  const why = len === "invisible" ? (short ? "Invisibles: con pierna al aire no se ven" : "Invisibles: con mocasines queda más limpio sin calcetín a la vista")
    : dressy ? (FAM(bc) === bfam ? "Del color del pantalón: alargan la pierna" : "Finos y oscuros, como pide un look arreglado")
    : shoe.type === "botas" || shoe.type === "botines" ? (cold ? "Más altos y abrigados para las botas" : "De media caña para que no rocen las botas")
    : bc === "blanco" ? "Blancos con zapatillas: el toque casual" : "Van con las zapatillas y el pantalón";
  return { id: best.id, why, warn: sc < 0 ? `Lo ideal serían unos calcetines ${ideal}; estos son los que mejor quedan de los que tienes.` : "" };
}
