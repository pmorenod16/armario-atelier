// Elegir prendas del armario (para apuntar lo que llevaste un día).
import { t } from "../i18n.js";
import { GROUPS, label, groupOf } from "../catalog.js";
import { $, esc, icon, openSheet } from "../ui.js";
import { store } from "../data.js";
import { tintFor } from "./add.js";

export function pickItems(selected = [], { title = t("picker.title") } = {}) {
  return new Promise((resolve) => {
    const sel = new Set(selected);
    let done = false;
    const sheet = openSheet(`
      <div class="sheet-head"><h2 class="display">${esc(title)}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
      <div id="groups"></div>
      <div class="sheet-foot"><button class="btn" type="button" data-close>${t("common.cancel")}</button><button class="btn primary" type="button" id="ok"></button></div>`,
    { label: title, wide: true, onClose: () => { if (!done) resolve(null); } });
    const root = sheet.el;
    const items = store.items;
    $("#groups", root).innerHTML = items.length ? GROUPS.map((g) => {
      const list = items.filter((i) => groupOf(i.type).k === g.k);
      return list.length ? `<div class="section"><h3>${esc(label(g))}</h3><div class="pick-grid">${list.map((it) => `
        <button type="button" class="pick" data-id="${it.id}" aria-pressed="${sel.has(it.id)}" style="--tint:${tintFor(it.tone) || "var(--surface-solid)"}">
          ${it.thumb ? `<img src="${it.thumb}" alt="" loading="lazy">` : ""}<span>${esc(it.name)}</span><i>${icon("check")}</i></button>`).join("")}</div></div>` : "";
    }).join("") : `<p class="muted">${t("closet.empty.title")}</p>`;
    const upd = () => { $("#ok", root).textContent = t("picker.ok", { n: sel.size }); $("#ok", root).disabled = !sel.size; };
    root.onclick = (e) => {
      const b = e.target.closest(".pick");
      if (b) { const id = b.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); b.setAttribute("aria-pressed", String(sel.has(id))); upd(); }
      if (e.target.closest("[data-close]")) sheet.close();
      if (e.target.closest("#ok")) { done = true; sheet.close(); resolve([...sel]); }
    };
    upd();
  });
}
