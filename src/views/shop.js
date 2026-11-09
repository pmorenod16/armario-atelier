// Compras: qué te falta (para combinar mejor y para tu estilo) con modelos reales a precio razonable,
// lista de deseos y modo tienda (foto a una prenda → ¿me la compro?).
import { t } from "../i18n.js";
import { TYPE, COLOR, PATTERN, MATERIAL, FIT, label } from "../catalog.js";
import { $, esc, icon, toast, say, setHalo, pickPhoto, isCancel, openSheet } from "../ui.js";
import { api, blobToBase64, base64ToBlob } from "../api.js";
import { shrinkPhoto } from "../cutout.js";
import { store, subscribe, styleText, saveShopping, saveShopResult, saveWish, deleteWish } from "../data.js";
import { tintFor } from "./add.js";
import { boardHTML, hydrateBoard } from "./board.js";
import { findGaps } from "../engine.js";
import { searchStores, canSearchStores, STORES, typeOk } from "../storesearch.js";

const byId = (id) => store.items.find((i) => i.id === id);
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "long" }) : "";
const eur = (n) => n == null ? "" : `${Number(n).toLocaleString("es-ES", { maximumFractionDigits: n % 1 ? 2 : 0 })} €`;
const wardrobe = () => store.items.map((i) => ({
  id: i.id, name: i.name, type: label(TYPE[i.type]) || i.type, colors: (i.colors || []).map((c) => label(COLOR[c.k]) || c.k),
  pattern: label(PATTERN[i.pattern]), material: i.material || label(MATERIAL[i.materialKey]), fit: label(FIT[i.fit]),
  formality: i.formality, seasons: i.seasons, styleTags: i.styleTags, wears: i.wearCount || 0,
}));
/** Talla que toca según el tipo de prenda (de las tallas del perfil). */
export function sizeFor(type) {
  const s = store.profile?.sizes || {}, g = TYPE[type]?.g;
  const key = type === "vaquero" ? "vaquero" : type === "americana" || type === "traje-pantalon" ? "americana"
    : { camisetas: "camiseta", camisas: "camisa", punto: "jersey", abrigo: "jersey", pantalones: "pantalon", calzado: "calzado" }[g];
  return (key && (s[key] || (key === "vaquero" ? s.pantalon : key === "americana" ? s.jersey : ""))) || "";
}
const strip = (ids, cls = "") => ids.map(byId).filter(Boolean).map((it) => `<button type="button" class="mini ${cls}" data-item="${it.id}" title="${esc(it.name)}" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">${it.thumb ? `<img src="${it.thumb}" alt="${esc(it.name)}">` : ""}</button>`).join("");
const VERDICT = { justo: "shop.vJusto", caro: "shop.vCaro", barato: "shop.vBarato" };

let tab = "gaps"; // se recuerda al volver a la sección

export function renderShop(view) {
  let busy = false;
  const open = new Set(); // huecos desplegados
  const searching = new Set();

  function draw() {
    setHalo(null);
    const wl = store.wishlist.filter((w) => !w.bought);
    view.innerHTML = `
      <header class="head"><div><h1 class="display">${t("shop.title")}</h1><div class="sub">${t("shop.sub")}</div></div></header>
      <div class="seg shop-tabs" role="tablist">
        <button type="button" role="tab" data-tab="gaps" aria-pressed="${tab === "gaps"}">${icon("spark")}${t("shop.tabGaps")}</button>
        <button type="button" role="tab" data-tab="wish" aria-pressed="${tab === "wish"}">${icon("heart")}${t("shop.tabWish")}${wl.length ? ` <span class="count">${wl.length}</span>` : ""}</button>
        <button type="button" role="tab" data-tab="store" aria-pressed="${tab === "store"}">${icon("camera")}${t("shop.tabStore")}</button>
      </div>
      <div id="pane"></div>`;
    view.querySelector(".shop-tabs").onclick = (e) => { const b = e.target.closest("[data-tab]"); if (b && b.dataset.tab !== tab) { tab = b.dataset.tab; draw(); } };
    const pane = $("#pane", view);
    if (tab === "gaps") drawGaps(pane); else if (tab === "wish") drawWish(pane); else drawStore(pane);
    const gc = tab === "gaps" ? [...(store.shopping?.combine || []), ...(store.shopping?.style || [])].map((g) => g.colorHex).filter(Boolean) : [];
    setHalo(gc[0] || null, gc[1] || gc[0]);
  }

  /* ---------- Te falta ---------- */
  function drawGaps(pane) {
    const sh = store.shopping?.combine ? store.shopping : null;
    const enough = store.items.length >= 3;
    if (!sh) {
      pane.innerHTML = `<div class="empty"><div class="empty-art">${icon("bag")}</div><h2 class="display">${t("shop.emptyTitle")}</h2><p>${t(enough ? "shop.emptyBody" : "shop.needItems")}</p>
        ${enough ? `<button class="btn primary" type="button" id="analyze">${icon("spark")}${t("shop.analyze")}</button>` : ""}<p class="status" id="st" aria-live="polite"></p></div>`;
      const b = $("#analyze", pane); if (b) b.onclick = analyze;
      return;
    }
    const res = sh.results || {};
    const card = (g) => {
      const r = res[g.id], isOpen = open.has(g.id), size = sizeFor(g.type), wished = new Set(store.wishlist.map((w) => w.url));
      return `<article class="card gap ${isOpen ? "open" : ""}" data-gap="${esc(g.id)}">
        <div class="gap-head">
          <i class="swatch" style="background:${g.colorHex}"></i>
          <div class="grow"><b>${esc(g.piece)}</b><small class="muted">${[g.priceMin && t("shop.range", { min: g.priceMin, max: g.priceMax }), size && t("shop.yourSize", { s: esc(size) })].filter(Boolean).join(" · ")}</small></div>
          <span class="pill prio-${g.priority}">${t("shop.prio." + g.priority)}</span>
        </div>
        <p class="gap-why">${esc(g.why)}${g.newOutfits ? ` <span class="muted">${t("shop.newOutfits", { n: g.newOutfits })}</span>` : ""}</p>
        ${g.pairsWith?.length ? `<div class="gap-pairs"><span class="muted small">${t("shop.pairs")}</span><div class="look-items">${strip(g.pairsWith)}</div></div>` : ""}
        <div class="row wrap">
          <button class="btn sm ${r ? "ghost" : "primary"}" type="button" data-search="${esc(g.id)}" ${searching.has(g.id) ? "disabled" : ""}>${icon(r ? "refresh" : "search")}${t(searching.has(g.id) ? "shop.searching" : r ? (isOpen ? "shop.searchAgain" : "shop.seeModels") : "shop.search")}</button>
          ${r && isOpen ? `<span class="muted small">${t("shop.searchedAt", { date: fmtDate(r.searched) })}</span>` : ""}
        </div>
        ${r && isOpen ? `
          ${r.products?.length ? `<div class="products">${r.products.map((p, k) => `
            <div class="product">
              <a class="p-img" href="${esc(p.url)}" target="_blank" rel="noopener">${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"${p.thumb && p.thumb !== p.image ? ` onerror="this.onerror=null;this.src='${esc(p.thumb)}'"` : ""}>` : icon("bag")}</a>
              <div class="p-info"><span class="muted small">${esc(p.store)}</span><a href="${esc(p.url)}" target="_blank" rel="noopener" class="p-name">${esc(p.name)}</a>
                <div class="p-price"><b>${esc(p.price || t("shop.noPrice"))}</b>${p.verdict ? `<span class="pill v-${p.verdict}">${t(VERDICT[p.verdict])}</span>` : ""}</div></div>
              <button class="btn sm icon ghost heart" type="button" data-wish="${esc(g.id)}|${k}" aria-pressed="${wished.has(p.url)}" aria-label="${t("shop.toWish")}">${icon("heart")}</button>
            </div>`).join("")}</div>` : `<p class="muted small">${t("shop.noProducts")}</p>`}
          ${r.size || size ? `<p class="muted small">${t("shop.sizeNote", { s: esc(r.size || size) })}</p>` : ""}
          ${!r.allStores ? `<p class="muted small">${t("shop.moreInApp")}</p>` : ""}
          ${r.diag && r.allStores ? `<details class="diag"><summary class="muted small">${t("shop.diag")}</summary><p class="muted small">${esc(r.diag)}</p></details>` : ""}
          <div class="store-links"><span class="muted small">${t("shop.inStores")}</span>${(r.links || []).map((l) => `<a class="chip" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.store)} ${icon("external")}</a>`).join("")}</div>` : ""}
      </article>`;
    };
    pane.innerHTML = `
      <section class="card shop-advice"><div class="row between"><span class="kicker">${t("shop.diagnosis")}</span><button class="btn sm ghost" type="button" id="analyze">${icon("refresh")}${t("shop.reanalyze")}</button></div>
        <p class="lead">${esc(sh.advice || "")}</p>${sh.engine ? `<p class="muted small" style="margin:0">${t("engine.gapsByApp")}</p>` : ""}<p class="muted small" style="margin:0">${t("shop.analyzedAt", { date: fmtDate(sh.at), n: sh.items || store.items.length })}${sh.items && sh.items !== store.items.length ? ` · ${t("shop.stale")}` : ""}</p>
        <p class="status" id="st" aria-live="polite"></p></section>
      <h2 class="display shop-h">${t("shop.listCombine")}</h2><p class="muted shop-hsub">${t("shop.listCombineSub")}</p>
      <div class="gaps">${(sh.combine || []).map(card).join("")}</div>
      <h2 class="display shop-h">${t("shop.listStyle")}</h2><p class="muted shop-hsub">${store.style?.summary ? t("shop.listStyleSub", { name: esc(store.style.name || "") }) : t("shop.listStyleNoStyle")}</p>
      <div class="gaps">${(sh.style || []).map(card).join("")}</div>`;
    $("#analyze", pane).onclick = analyze;
    pane.onclick = async (e) => {
      const it = e.target.closest(".look-items [data-item]"); if (it) return (await import("./item.js")).openItem(it.dataset.item);
      const s = e.target.closest("[data-search]");
      if (s) {
        const id = s.dataset.search, has = !!res[id];
        if (has && !open.has(id)) { open.add(id); return draw(); }
        return search([...(sh.combine || []), ...(sh.style || [])].find((g) => g.id === id));
      }
      const w = e.target.closest("[data-wish]");
      if (w) {
        const [gid, k] = w.dataset.wish.split("|"), g = [...sh.combine, ...sh.style].find((x) => x.id === gid), p = res[gid]?.products?.[+k];
        if (!p) return;
        const ex = store.wishlist.find((x) => x.url === p.url);
        if (ex) { await deleteWish(ex.id); toast(t("shop.wishRemoved")); return; }
        await saveWish({ name: p.name, store: p.store, price: p.price, priceNum: p.priceNum, url: p.url, image: p.image, color: p.color, gap: g?.piece || "", pairsWith: g?.pairsWith || [], verdict: p.verdict || null, size: sizeFor(g?.type) || null });
        toast(t("shop.wishAdded"));
      }
    };
  }

  async function analyze() {
    if (busy) return;
    busy = true;
    const st = $("#st", view), b = $("#analyze", view); if (b) b.disabled = true;
    say(st, t("shop.analyzing"));
    try {
      let r;
      const local = () => findGaps({ items: store.items, style: store.style });
      if (store.profile?.engine === "app") r = local();
      else try { r = await api("/api/gaps", { wardrobe: wardrobe(), style: styleText(store.style), sizes: store.profile?.sizes || {} }, { timeout: 45000 }); }
      catch (e) { console.warn("IA no disponible, huecos de la app", e); r = local(); toast(t("engine.fallback")); }
      open.clear();
      await saveShopping({ ...r, engine: !!r.engine, at: Date.now(), items: store.items.length, results: {} });
      busy = false; draw();
    } catch (e) { busy = false; if (b) b.disabled = false; say(st, e?.message || t("shop.fail"), "error"); }
  }

  async function search(g) {
    if (!g || searching.has(g.id)) return;
    searching.add(g.id); open.add(g.id); draw();
    try {
      // Zara (servidor) y el resto de tiendas (desde el móvil, sin IA ni claves) a la vez
      const [srv, dev] = await Promise.all([
        api("/api/shop", { piece: g.piece, searchTerm: g.searchTerm, color: g.color, priceMin: g.priceMin, priceMax: g.priceMax, stores: g.stores, size: sizeFor(g.type) }, { timeout: 40000 }).catch((e) => ({ error: e })),
        searchStores({ term: g.searchTerm || g.piece, piece: g.piece, color: g.color, colorHex: g.colorHex, type: g.type }).catch((e) => { console.warn("tiendas", e); return { products: [], diag: ["error: " + (e?.message || e)] }; }),
      ]);
      const devRes = dev; const dev2 = devRes.products || [];
      // aunque todo falle, siempre quedan los enlaces «Buscar en…» de cada tienda
      const verdict = (n) => !n || !g.priceMin ? null : n < g.priceMin * 0.6 ? "barato" : n > (g.priceMax || g.priceMin) * 1.35 ? "caro" : "justo";
      const devP = dev2.map(({ _hits, ...p }) => ({ ...p, verdict: verdict(p.priceNum) }));
      // intercalar tiendas para que no salga todo de la misma marca
      const srvP = (srv.products || []).filter((p) => typeOk(p.name, g.type, g.piece)); // Zara también: que sea esa prenda
      const all = [...srvP, ...devP], byStore = new Map();
      all.forEach((p) => { if (!byStore.has(p.store)) byStore.set(p.store, []); byStore.get(p.store).push(p); });
      const mixed = []; for (let k = 0; mixed.length < all.length; k++) { let any = false; for (const l of byStore.values()) if (l[k]) { mixed.push(l[k]); any = true; } if (!any) break; }
      const seenUrl = new Set();
      const r = { products: mixed.filter((p) => !seenUrl.has(p.url) && seenUrl.add(p.url)).slice(0, 18), links: srv.links?.length ? srv.links : storeLinks(g), size: srv.size || sizeFor(g.type) || null, searched: Date.now(), allStores: canSearchStores, diag: (devRes.diag || []).join(" · ").slice(0, 600) };
      searching.delete(g.id);
      await saveShopResult(g.id, r);
      if (!r.products?.length) toast(t("shop.noProductsToast"));
    } catch (e) { searching.delete(g.id); toast(e?.message || t("shop.fail"), "error"); }
    draw();
  }

  /* ---------- Lista de deseos ---------- */
  function drawWish(pane) {
    const all = store.wishlist, pending = all.filter((w) => !w.bought), bought = all.filter((w) => w.bought);
    const total = pending.reduce((a, w) => a + (w.priceNum || 0), 0);
    const row = (w) => `<article class="card wish ${w.bought ? "bought" : ""}" data-w="${w.id}">
      <a class="p-img" ${w.url ? `href="${esc(w.url)}" target="_blank" rel="noopener"` : ""}>${w.image ? `<img src="${esc(w.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon("bag")}</a>
      <div class="grow">
        <span class="muted small">${esc([w.store, w.gap && t("shop.forGap", { g: w.gap })].filter(Boolean).join(" · "))}</span>
        <b class="w-name">${esc(w.name)}</b>
        <div class="p-price"><b>${esc(w.price || t("shop.noPrice"))}</b>${w.verdict ? `<span class="pill v-${w.verdict}">${t(VERDICT[w.verdict])}</span>` : ""}${w.size ? `<span class="muted small">${t("shop.yourSize", { s: esc(w.size) })}</span>` : ""}
          ${w.oldPrice && w.oldPrice !== w.price ? `<span class="muted small"><s>${esc(w.oldPrice)}</s></span>` : ""}</div>
        ${w.pairsWith?.length && !w.bought ? `<div class="look-items">${strip(w.pairsWith)}</div>` : ""}
        <div class="row wrap w-actions">
          ${w.bought ? `<span class="pill">${icon("check")}${t("shop.bought")}</span>` : `
          ${w.url ? `<a class="btn sm ghost" href="${esc(w.url)}" target="_blank" rel="noopener">${icon("external")}${t("shop.open")}</a>` : ""}
          ${w.url && /^https?:/.test(w.url) ? `<button class="btn sm ghost" type="button" data-price="${w.id}">${icon("refresh")}${t("shop.updatePrice")}</button>` : ""}
          <button class="btn sm" type="button" data-bought="${w.id}">${icon("check")}${t("shop.gotIt")}</button>`}
          <button class="btn sm icon ghost" type="button" data-del="${w.id}" aria-label="${t("shop.remove")}">${icon("trash")}</button>
        </div>
      </div></article>`;
    pane.innerHTML = `
      <section class="card">
        <form class="off-link" id="addLink"><input class="input" name="url" type="url" inputmode="url" placeholder="${t("shop.wishLinkPh")}" aria-label="${t("shop.wishLink")}"><button class="btn sm primary" type="submit">${icon("plus")}${t("shop.add")}</button></form>
        <p class="status" id="wst" aria-live="polite"></p>
      </section>
      ${pending.length ? `<div class="row between wish-total"><span class="muted">${t("shop.wishCount", { n: pending.length })}</span>${total ? `<b>${t("shop.total", { v: eur(Math.round(total * 100) / 100) })}</b>` : ""}</div>
        <div class="wishes">${pending.map(row).join("")}</div>`
      : `<div class="empty"><div class="empty-art">${icon("heart")}</div><h2 class="display">${t("shop.wishEmpty")}</h2><p>${t("shop.wishEmptyBody")}</p></div>`}
      ${bought.length ? `<h2 class="display shop-h">${t("shop.boughtList")}</h2><div class="wishes">${bought.map(row).join("")}</div>` : ""}`;
    $("#addLink", pane).onsubmit = async (e) => {
      e.preventDefault();
      const url = e.target.url.value.trim(); if (!url) return;
      const st = $("#wst", pane); say(st, t("official.reading"));
      try {
        const p = (await api("/api/product", { url })).products[0];
        await saveWish({ name: p.name || t("shop.product"), store: p.brand || hostName(url), price: p.price || "", priceNum: priceNum(p.price), url: p.url || url, image: p.images?.[0] || null });
        toast(t("shop.wishAdded"));
      } catch (err) { say(st, err?.message || t("official.fail"), "error"); }
    };
    pane.onclick = async (e) => {
      const it = e.target.closest(".look-items [data-item]"); if (it) return (await import("./item.js")).openItem(it.dataset.item);
      const del = e.target.closest("[data-del]");
      if (del) { if (!del.dataset.sure) { del.dataset.sure = 1; del.classList.add("danger"); toast(t("shop.removeSure")); return; } await deleteWish(del.dataset.del); return; }
      const pr = e.target.closest("[data-price]");
      if (pr) {
        const w = store.wishlist.find((x) => x.id === pr.dataset.price); pr.disabled = true;
        try {
          const p = (await api("/api/product", { url: w.url })).products[0];
          const changed = p.price && p.price !== w.price;
          await saveWish({ price: p.price || w.price, priceNum: priceNum(p.price) ?? w.priceNum, oldPrice: changed ? w.price : w.oldPrice || null, image: w.image || p.images?.[0] || null, checkedAt: Date.now() }, w.id);
          toast(changed ? t("shop.priceChanged", { from: w.price, to: p.price }) : t("shop.priceSame"));
        } catch (err) { pr.disabled = false; toast(err?.message || t("official.fail"), "error"); }
        return;
      }
      const got = e.target.closest("[data-bought]");
      if (got) {
        const w = store.wishlist.find((x) => x.id === got.dataset.bought); got.disabled = true;
        await saveWish({ bought: true, boughtAt: Date.now() }, w.id);
        // y la añade al armario con su foto oficial
        try {
          if (!w.image || w.image.startsWith("data:")) throw 0;
          const { image, mime } = await api("/api/image", { url: w.image });
          (await import("./add.js")).openAdd(base64ToBlob(image, mime));
        } catch { (await import("./add.js")).openAdd(); }
      }
    };
  }

  /* ---------- Modo tienda ---------- */
  let check = null; // {photo (dataURL), result}
  function drawStore(pane) {
    const r = check?.result;
    const V = { si: ["shop.vSi", "ok"], quizas: ["shop.vQuizas", "mid"], no: ["shop.vNo", "bad"] };
    pane.innerHTML = `
      <section class="card store-cam">
        ${check?.photo ? `<img class="store-photo" src="${check.photo}" alt="">` : `<div class="empty-art">${icon("camera")}</div>`}
        <div class="grow stack">
          <h2 class="display">${t("shop.storeTitle")}</h2>
          <p class="muted" style="margin:0">${t("shop.storeBody")}</p>
          <label class="field"><span>${t("shop.priceSeen")}</span><input class="input" id="price" inputmode="decimal" maxlength="8" placeholder="${t("shop.pricePh")}" value="${esc(check?.price || "")}"></label>
          <button class="btn primary" type="button" id="snap" ${busy ? "disabled" : ""}>${icon("camera")}${t(check ? "shop.otherPhoto" : "shop.takePhoto")}</button>
          ${check?.photo && !r && !busy ? `<button class="btn sm ghost" type="button" id="retry">${icon("refresh")}${t("common.retry")}</button>` : ""}
          <p class="status" id="sst" aria-live="polite"></p>
        </div>
      </section>
      ${r ? `
        <section class="card verdict v-${V[r.verdict][1]}">
          <div class="match-row"><div class="ring" style="--p:${r.score}"><b>${r.score}</b><small>/100</small></div>
            <div><span class="kicker">${t(V[r.verdict][0])}</span><h2 class="display" style="margin:2px 0 4px">${esc(r.name)}</h2><p style="margin:0">${esc(r.headline)}</p></div></div>
          ${r.styleFit ? `<p class="muted">${esc(r.styleFit)}</p>` : ""}
          <dl class="facts">
            <dt>${t("shop.priceLabel")}</dt><dd>${r.price ? `<b>${eur(r.price)}</b> · ` : ""}${r.priceMin ? t("shop.range", { min: r.priceMin, max: r.priceMax }) + ". " : ""}${esc(r.priceNote || "")}</dd>
            ${r.size || sizeFor(r.type) ? `<dt>${t("shop.trySize")}</dt><dd>${esc(r.size || sizeFor(r.type))}</dd>` : ""}
          </dl>
          ${r.similar?.length ? `<div class="notice warn">${icon("info")}<div><b>${t("shop.similar")}</b><div class="look-items">${strip(r.similar)}</div></div></div>` : ""}
          ${r.check?.length ? `<h3 class="how-title">${t("shop.checkIn")}</h3><ul class="how">${r.check.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>` : ""}
          <div class="row wrap"><button class="btn sm" type="button" id="toWish">${icon("heart")}${t("shop.toWish")}</button></div>
        </section>
        ${r.outfits?.length ? `<h2 class="display shop-h">${t("shop.combos")}</h2><div class="combos">${r.outfits.map((o) => `
          <article class="card combo"><div class="combo-imgs"><figure class="combo-new"><img src="${check.photo}" alt=""><figcaption>${t("shop.thisOne")}</figcaption></figure><span class="plus">+</span>${boardHTML(o.itemIds, { small: true })}</div>
            <b>${esc(o.title)}</b><p class="muted small" style="margin:0">${esc(o.how)}</p></article>`).join("")}</div>` : ""}` : ""}`;
    $("#snap", pane).onclick = snap;
    const rt = $("#retry", pane); if (rt) rt.onclick = () => runCheck();
    $("#price", pane).oninput = (e) => { if (check) check.price = e.target.value; };
    hydrateBoard(pane);
    pane.onclick = async (e) => {
      const it = e.target.closest(".look-items [data-item]"); if (it) return (await import("./item.js")).openItem(it.dataset.item);
      if (e.target.closest("#toWish")) {
        await saveWish({ name: r.name, store: t("shop.inStore"), price: r.price ? eur(r.price) : "", priceNum: r.price || null, url: "", image: check.thumb, pairsWith: [...new Set(r.outfits.flatMap((o) => o.itemIds))].slice(0, 6), verdict: null, size: r.size || null });
        toast(t("shop.wishAdded"));
      }
    };
  }

  async function snap() {
    let f;
    try { f = await pickPhoto({ prompt: true }); } catch (e) { if (!isCancel(e)) toast(t("add.cameraFail"), "error"); return; }
    if (!f) return;
    const small = await shrinkPhoto(f, 1200), thumb = await shrinkPhoto(f, 360);
    check = { photo: URL.createObjectURL(small), image: await blobToBase64(small), thumb: "data:image/jpeg;base64," + await blobToBase64(thumb), price: $("#price", view)?.value || "", result: null };
    runCheck();
  }
  async function runCheck() {
    if (!check) return;
    if (store.items.length < 2) { toast(t("shop.needItems"), "error"); return; }
    busy = true; check.result = null; drawStore($("#pane", view));
    say($("#sst", view), t("shop.checking"));
    try {
      check.result = await api("/api/shop/check", { image: check.image, price: check.price || null, wardrobe: wardrobe(), style: styleText(store.style), sizes: store.profile?.sizes || {} });
      busy = false; drawStore($("#pane", view));
    } catch (e) { busy = false; drawStore($("#pane", view)); say($("#sst", view), e?.message || t("shop.fail"), "error"); }
  }

  draw();
  const sigOf = () => JSON.stringify([store.shopping?.at, Object.keys(store.shopping?.results || {}).length, store.shopping?.updatedAt, store.wishlist.map((w) => w.id + (w.updatedAt || "")), store.items.length]);
  let sig = sigOf();
  return subscribe(() => {
    const now = sigOf();
    if (now !== sig && !busy) { sig = now; if (tab === "store") return; const y = scrollY; draw(); scrollTo(0, y); }
  });
}

const hostName = (u) => { try { return new URL(u).hostname.replace(/^www\d?\./, ""); } catch { return ""; } };
function priceNum(p) {
  const m = String(p || "").replace(/\s/g, "").match(/(\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  let x = m[1];
  x = /[.,]\d{1,2}$/.test(x) ? x.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".") : x.replace(/[.,]/g, "");
  const n = parseFloat(x); return Number.isFinite(n) && n > 0 ? n : null;
}

/** Enlaces al buscador de cada tienda (se hacen en la app: no dependen del servidor). */
function storeLinks(g) {
  const sec = store.profile?.section === "mujer" ? "mujer" : "hombre";
  const term = `${g.searchTerm || g.piece} ${sec}`, q = encodeURIComponent(term);
  const site = (d) => `https://www.google.com/search?q=${q}+site%3A${d}`;
  return [
    { store: "Zara", url: `https://www.zara.com/es/es/search?searchTerm=${encodeURIComponent(g.searchTerm || g.piece)}&section=${sec === "mujer" ? "WOMAN" : "MAN"}` },
    { store: "Massimo Dutti", url: site("massimodutti.com") }, { store: "H&M", url: `https://www2.hm.com/es_es/search-results.html?q=${q}` },
    { store: "Mango", url: site("mango.com") }, { store: "Pull&Bear", url: site("pullandbear.com") }, { store: "Bershka", url: site("bershka.com") },
    { store: "Uniqlo", url: site("uniqlo.com") }, { store: "COS", url: site("cos.com") },
  ];
}
