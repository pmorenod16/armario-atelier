// «Dónde buscar»: qué tiendas, grandes almacenes y marcas se miran al buscar modelos en Compras.
// Vive en Compras, al lado de «Buscar modelos» (9/11/2026, Polete: «así no se va de un lado a otro todo el rato»).
// Guarda en el perfil: stores (cadenas + multimarca) y brands (marcas por grupo de estilo, con su descripción).
import { t } from "../i18n.js";
import { esc, icon, toast, openSheet } from "../ui.js";
import { store, saveProfile } from "../data.js";
import { STORES, BRANDS, BRAND_GROUPS, MULTI, LOCAL_DEFAULT, allowedStores, allowedBrands } from "../storesearch.js";

/** Resumen corto: «12 tiendas · 5 marcas». */
export function whereSummary(p = store.profile) {
  const s = allowedStores(p).length, b = allowedBrands(p).length;
  return t("where.summary", { s, b });
}

/** Botones «Marcar todas» / «Quitar todas» para un grupo de tiendas o marcas. */
function allBtns(kind, scope) {
  return `<div class="row wrap all-btns"><button type="button" class="btn sm ghost" data-all="${kind}:${scope}" data-on="1">${icon("check")}${t("stores.all")}</button><button type="button" class="btn sm ghost" data-all="${kind}:${scope}" data-on="0">${icon("close")}${t("stores.none")}</button></div>`;
}

function pickerHTML(p) {
  const st = allowedStores(p), br = allowedBrands(p);
  const groupHead = (list) => { const on = list.filter((b) => br.includes(b[0])).length; return `${list.length} marcas${on ? ` · ${on} marcadas` : ""}`; };
  return `
    <div class="sheet-head"><h2 class="display">${t("where.title")}</h2><button class="btn icon ghost" type="button" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <div class="where">
      <p class="muted small">${t("stores.hint")}</p>
      <h3 class="sub-h">${t("stores.title")}</h3>
      <div id="storeChips">
        ${allBtns("store", "chains")}
        <div class="chips">${STORES.filter(([n]) => !MULTI[n]).map(([n]) => `<button type="button" class="chip" data-store="${esc(n)}" aria-pressed="${st.includes(n)}">${esc(n)}</button>`).join("")}</div>
        <details class="brand-group"><summary><b>${t("stores.multi")}</b> <span class="muted small" data-count="multi"></span></summary>
          <p class="muted small">${t("stores.multiHint")}</p>
          ${allBtns("store", "multi")}
          ${STORES.filter(([n]) => MULTI[n]).map(([n]) => `<div class="brand-row"><button type="button" class="chip" data-store="${esc(n)}" aria-pressed="${st.includes(n)}">${esc(n)}</button><span class="muted small">${esc(MULTI[n])}</span></div>`).join("")}
        </details>
      </div>
      <h3 class="sub-h">${t("brands.title")}</h3>
      <p class="muted small">${t("brands.hint")}</p>
      ${allBtns("brand", "*")}
      <div id="brandChips">${BRAND_GROUPS.map(([g, title]) => { const list = BRANDS.filter((b) => b.group === g);
        return `<details class="brand-group" data-group="${esc(g)}"><summary><b>${esc(title)}</b> <span class="muted small" data-count="${esc(g)}">${groupHead(list)}</span></summary>
          ${allBtns("brand", g)}
          ${list.map((b) => `<div class="brand-row"><button type="button" class="chip" data-brand="${esc(b[0])}" aria-pressed="${br.includes(b[0])}">${esc(b[0])}</button><span class="muted small">${esc(b.desc)}</span></div>`).join("")}</details>`; }).join("")}</div>
      <div class="row wrap where-foot"><button class="btn sm ghost" type="button" id="storesReset">${icon("refresh")}${t("stores.reset")}</button><button class="btn sm primary" type="button" data-close>${icon("check")}${t("where.done")}</button></div>
    </div>`;
}

/** Abre la hoja «Dónde buscar». onChange se llama al cerrarla si se ha tocado algo. */
export function openWhere(onChange) {
  const p = { stores: [...allowedStores(store.profile)], brands: [...allowedBrands(store.profile)] };
  let dirty = false, timer;
  const save = () => { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 600); };
  const flush = () => { clearTimeout(timer); timer = null; return saveProfile({ stores: p.stores, brands: p.brands }).catch(() => toast(t("item.saveFail"), "error")); };
  const sh = openSheet(pickerHTML(p), { label: t("where.title"), wide: true, onClose: () => { if (!dirty) return; (timer ? flush() : Promise.resolve()).then(() => { toast(t("where.saved", { x: whereSummary(p) })); onChange?.(); }); } });
  const root = sh.el;
  const counts = () => BRAND_GROUPS.forEach(([g]) => { const list = BRANDS.filter((b) => b.group === g), on = list.filter((b) => p.brands.includes(b[0])).length; const el = root.querySelector(`[data-count="${CSS.escape(g)}"]`); if (el) el.textContent = `${list.length} marcas${on ? ` · ${on} marcadas` : ""}`; });
  const press = (sel, on) => root.querySelector(sel)?.setAttribute("aria-pressed", String(on));
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return sh.close();
    const all = e.target.closest("[data-all]");
    if (all) {
      const [kind, scope] = all.dataset.all.split(":"), on = all.dataset.on === "1";
      if (kind === "store") {
        const names = STORES.filter(([n]) => (scope === "multi" ? !!MULTI[n] : !MULTI[n])).map(([n]) => n);
        const cur = new Set(p.stores); names.forEach((n) => (on ? cur.add(n) : cur.delete(n)));
        if (!cur.size) return toast(t("stores.atLeastOne"));
        p.stores = [...cur]; names.forEach((n) => press(`[data-store="${CSS.escape(n)}"]`, on));
      } else {
        const names = BRANDS.filter((x) => scope === "*" || x.group === scope).map((x) => x[0]);
        const cur = new Set(p.brands); names.forEach((n) => (on ? cur.add(n) : cur.delete(n)));
        p.brands = [...cur]; names.forEach((n) => press(`[data-brand="${CSS.escape(n)}"]`, on)); counts();
      }
      return save();
    }
    const s = e.target.closest("[data-store]");
    if (s) {
      const n = s.dataset.store, on = !p.stores.includes(n);
      if (!on && p.stores.length <= 1) return toast(t("stores.atLeastOne"));
      p.stores = on ? [...p.stores, n] : p.stores.filter((x) => x !== n); s.setAttribute("aria-pressed", String(on));
      return save();
    }
    const b = e.target.closest("[data-brand]");
    if (b) {
      const n = b.dataset.brand, on = !p.brands.includes(n);
      p.brands = on ? [...p.brands, n] : p.brands.filter((x) => x !== n); b.setAttribute("aria-pressed", String(on)); counts();
      return save();
    }
    if (e.target.closest("#storesReset")) {
      p.stores = [...LOCAL_DEFAULT];
      root.querySelectorAll("[data-store]").forEach((x) => x.setAttribute("aria-pressed", String(LOCAL_DEFAULT.includes(x.dataset.store))));
      return save();
    }
  });
  return sh;
}
