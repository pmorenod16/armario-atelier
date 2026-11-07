// Ficha de una prenda: foto grande con su halo, datos, estado (disponible/sucia/prestada), editar y eliminar.
import { t } from "../i18n.js";
import { TYPE, COLOR, PATTERN, MATERIAL, FIT, STATUSES, label, groupOf } from "../catalog.js";
import { $, $$, esc, icon, openSheet, toast, setHalo } from "../ui.js";
import { store, subscribe, fullImage, setItemStatus, deleteItem } from "../data.js";
import { openEdit, tintFor } from "./add.js";

export function openItem(id) {
  let item = store.items.find((i) => i.id === id);
  if (!item) { toast(t("item.notFound"), "error"); return; }
  const sheet = openSheet(`<div class="sheet-head"><span></span><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div><div id="body"></div>`,
    { label: item.name, wide: true, onClose: () => { unsub(); setHalo(null); } });
  const root = sheet.el;
  $("[data-close]", root).onclick = () => sheet.close();

  function render() {
    const c = item.colors || [];
    setHalo(c[0]?.hex || item.tone, c[1]?.hex || item.tone);
    const facts = [
      [t("item.type"), esc(label(TYPE[item.type]) || item.type || "—")],
      [t("item.colors"), c.length ? c.map((x) => `<span class="row" style="gap:6px"><i class="swatch" style="background:${x.hex || COLOR[x.k]?.hex}"></i>${esc(label(COLOR[x.k]) || x.name || "")}</span>`).join("") : "—"],
      [t("item.pattern"), esc(label(PATTERN[item.pattern]) || "—")],
      [t("item.brand"), esc(item.brand || "—")],
      [t("item.size"), esc(item.size || "—")],
      [t("item.material"), esc(item.material || label(MATERIAL[item.materialKey]) || "—")],
      [t("item.fit"), esc(label(FIT[item.fit]) || "—")],
      [t("item.season"), (item.seasons || []).length === 4 ? t("item.allYear") : (item.seasons || []).map((s) => t("season." + s)).join(", ") || "—"],
      [t("item.formality"), item.formality ? t("formality." + item.formality) : "—"],
      [t("item.style"), esc((item.styleTags || []).join(", ") || "—")],
      [t("item.care"), esc(item.care || "—")],
      ...(item.notes ? [[t("item.notes"), esc(item.notes)]] : []),
    ];
    $("#body", root).innerHTML = `
      <div class="detail">
        <div class="preview" id="pv" style="--tint:${tintFor(item.tone) || "var(--surface-solid)"}">${item.thumb ? `<img src="${item.thumb}" alt="${esc(item.name)}">` : ""}</div>
        <div class="stack">
          <div><div class="kicker">${esc(label(groupOf(item.type)))}</div><h2 class="display">${esc(item.name)}</h2></div>
          <div class="seg" role="group" aria-label="${t("item.status")}">${STATUSES.map((s) => `<button type="button" data-s="${s}" aria-pressed="${item.status === s}">${t("status." + s)}</button>`).join("")}</div>
          <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
          <div class="row wrap">
            <button class="btn" type="button" id="edit">${icon("edit")}${t("item.edit")}</button>
            <button class="btn danger" type="button" id="del">${icon("trash")}<span>${t("item.delete")}</span></button>
          </div>
        </div>
      </div>`;
    fullImage(item).then((u) => { if (u) $("#pv img", root)?.setAttribute("src", u); });
    $$(".seg button", root).forEach((b) => (b.onclick = async () => {
      if (item.status === b.dataset.s) return;
      $$(".seg button", root).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      try { await setItemStatus(item.id, b.dataset.s); } catch { toast(t("item.saveFail"), "error"); }
    }));
    $("#edit", root).onclick = () => openEdit(item);
    let armed = 0;
    $("#del", root).onclick = async (e) => {
      const btn = e.currentTarget;
      if (!armed) {
        btn.classList.add("armed"); btn.querySelector("span").textContent = t("item.deleteConfirm");
        armed = setTimeout(() => { armed = 0; btn.classList.remove("armed"); btn.querySelector("span").textContent = t("item.delete"); }, 3500);
        return;
      }
      clearTimeout(armed); btn.disabled = true;
      try { await deleteItem(item.id); toast(t("item.deleted")); sheet.close(); }
      catch { toast(t("item.saveFail"), "error"); btn.disabled = false; }
    };
  }

  const unsub = subscribe(() => {
    const next = store.items.find((i) => i.id === id);
    if (!next) { sheet.close(); return; }
    if (next.updatedAt !== item.updatedAt || next.status !== item.status) { item = next; render(); }
  });
  render();
}
