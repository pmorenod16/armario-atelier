// Aviso de bajada de precio (13/11/2026). Los precios de la lista de deseos se revisan solos al abrir la app, como mucho
// cada 12 h por prenda (no hay servidor que lo haga de noche: todo pasa en tu móvil, gratis y sin claves). En el APK la ficha
// se lee desde el móvil (storesearch.readProduct, las tiendas no bloquean al móvil); si no puede, o en el ordenador, por
// /api/product. Si baja: se guarda (oldPrice, dropAt, dropFrom), se avisa con un mensaje y una notificación, y en Deseos la
// tarjeta lleva «Ha bajado −X €» durante 14 días. «Ver precio» en Deseos usa lo mismo (refreshPrice).
import { t, locale } from "./i18n.js";
import { store, saveWish } from "./data.js";
import { api } from "./api.js";
import { isNative, toast } from "./ui.js";

const EVERY = 12 * 3600e3;
export const DROP_DAYS = 14;
let running = null;

const eur = (n) => (n == null ? "" : `${Number(n).toLocaleString(locale(), { maximumFractionDigits: n % 1 ? 2 : 0 })} €`);
export function priceNum(p) {
  if (typeof p === "number") return p > 0 ? p : null;
  const m = String(p || "").replace(/\s/g, "").match(/(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  let x = m[1];
  x = /[.,]\d{1,2}$/.test(x) ? x.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".") : x.replace(/[.,]/g, "");
  const n = parseFloat(x); return Number.isFinite(n) && n > 0 ? n : null;
}

/** Lee el precio actual de la ficha → {num, text, image}. */
async function readPrice(url) {
  if (isNative) {
    try { const { readProduct } = await import("./storesearch.js"); const p = await readProduct(url); if (p.price) return { num: p.price, text: eur(p.price), image: p.image }; } catch { /* sigue con el servidor */ }
  }
  const p = (await api("/api/product", { url }, { timeout: 25000 })).products?.[0];
  const num = priceNum(p?.price);
  return { num, text: p?.price || (num ? eur(num) : ""), image: p?.images?.[0] || null };
}

/** Vuelve a mirar el precio de un deseo y lo guarda. Devuelve {changed, drop, from, to}. */
export async function refreshPrice(w) {
  const r = await readPrice(w.url);
  const before = w.priceNum ?? priceNum(w.price);
  const now = r.num;
  if (!now) { await saveWish({ checkedAt: Date.now() }, w.id); return { changed: false }; }
  const changed = before == null || Math.abs(now - before) >= 0.01;
  const drop = before != null && now < before - 0.01;
  const patch = { price: r.text || eur(now), priceNum: now, checkedAt: Date.now(), image: w.image || r.image || null };
  if (changed && before != null) patch.oldPrice = w.price || eur(before);
  if (drop) Object.assign(patch, { dropAt: Date.now(), dropFrom: before, lowest: Math.min(now, w.lowest ?? before) });
  else if (changed) Object.assign(patch, { dropAt: null, dropFrom: null }); // subió: ya no es una bajada
  await saveWish(patch, w.id);
  return { changed, drop, from: before, to: now, name: w.name };
}

/** Revisa los precios de la lista de deseos (al abrir la app). */
export function checkPrices({ force = false } = {}) {
  if (running) return running;
  const due = store.wishlist.filter((w) => !w.bought && /^https?:/.test(w.url || "") && (force || Date.now() - (w.checkedAt || w.addedAt || 0) > EVERY));
  if (!due.length || !navigator.onLine) return Promise.resolve([]);
  running = (async () => {
    const drops = [];
    for (const w of due.slice(0, 12)) { // pocas cada vez, sin prisa
      try { const r = await refreshPrice(w); if (r.drop) drops.push(r); } catch (e) { console.warn("precio", w.url, e); }
    }
    if (drops.length) notify(drops);
    return drops;
  })().finally(() => { running = null; });
  return running;
}

function notify(drops) {
  const d = drops[0];
  const text = drops.length === 1
    ? t("price.dropOne", { name: d.name, from: eur(d.from), to: eur(d.to) })
    : t("price.dropMany", { n: drops.length, name: d.name, from: eur(d.from), to: eur(d.to) });
  toast(text);
  if (!isNative) return;
  import("@capacitor/local-notifications").then(({ LocalNotifications }) => LocalNotifications.schedule({ notifications: [{
    id: 900 + (Date.now() % 90), title: t("price.notifTitle"), body: text, extra: { open: "deseos" }, schedule: { at: new Date(Date.now() + 1500) },
  }] })).catch(() => {});
}

/** ¿Ha bajado hace poco? → cuánto (para la etiqueta de la tarjeta). */
export const recentDrop = (w) => (w.dropAt && Date.now() - w.dropAt < DROP_DAYS * 864e5 && w.dropFrom && w.priceNum < w.dropFrom ? w.dropFrom - w.priceNum : 0);
export { eur as fmtEur };
