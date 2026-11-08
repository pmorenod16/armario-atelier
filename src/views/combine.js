// «¿Con qué lo combino?»: outfits que llevan una prenda concreta (motor de la app, al instante, con el tiempo de hoy).
import { t } from "../i18n.js";
import { $, esc, icon, openSheet, toast } from "../ui.js";
import { store, logWear, saveLook, lookSaved, deleteLook } from "../data.js";
import { suggestOutfits } from "../engine.js";
import { todayWeather } from "../weather.js";
import { boardHTML, hydrateBoard } from "./board.js";

export async function openCombine(item) {
  const sh = openSheet(`
    <div class="sheet-head"><h2 class="display">${t("combine.title")}</h2><button class="btn icon ghost" data-close aria-label="${t("common.close")}">${icon("close")}</button></div>
    <p class="muted" style="margin-top:0">${t("combine.sub", { name: esc(item.name) })}</p>
    <div id="out"><div class="card thinking"><div class="bar indet"><i></i></div><p>${t("combine.thinking")}</p></div></div>`, { label: t("combine.title"), wide: true });
  sh.el.onclick = (e) => { if (e.target.closest("[data-close]")) sh.close(); };
  let wx = null;
  try { const p = store.profile; wx = await todayWeather(p.places.find((x) => x.id === p.activePlace) || p.places[0]); } catch {}
  const avail = store.items.filter((i) => i.status === "disponible" || i.id === item.id);
  const r = suggestOutfits({ items: avail, weather: wx, plan: "", style: store.style, wear: store.wear, feedback: store.feedback, count: 3, must: item.id });
  const out = $("#out", sh.el);
  if (!r.outfits.length) { out.innerHTML = `<p class="notice">${esc(r.missing || t("combine.none"))}</p>`; return; }
  out.innerHTML = `${wx ? `<p class="muted small">${t("combine.weather", { max: wx.max, min: wx.min })}</p>` : ""}<div class="combine-list">${r.outfits.map((o, i) => `
    <article class="card combine-item" data-i="${i}">
      ${boardHTML(o.itemIds)}
      <div class="stack">
        <b>${esc(o.title)}</b>
        <p class="muted small" style="margin:0">${esc(o.why)}</p>
        ${o.how?.length ? `<ul class="how">${o.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        <div class="row wrap">
          <button class="btn sm primary" type="button" data-wear="${i}">${icon("check")}${t("today.wear")}</button>
          <button class="btn sm" type="button" data-save="${i}" aria-pressed="${!!lookSaved(o.itemIds)}">${icon("bookmark")}${t(lookSaved(o.itemIds) ? "looks.saved" : "looks.save")}</button>
        </div>
      </div>
    </article>`).join("")}</div>`;
  hydrateBoard(out);
  out.onclick = async (e) => {
    const w = e.target.closest("[data-wear]"), s = e.target.closest("[data-save]");
    if (w) { const x = r.outfits[+w.dataset.wear]; try { await logWear({ itemIds: x.itemIds, title: x.title, how: x.how }); toast(t("today.wornSaved")); } catch { toast(t("item.saveFail"), "error"); } }
    if (s) {
      const x = r.outfits[+s.dataset.save], ex = lookSaved(x.itemIds);
      try {
        if (ex) { await deleteLook(ex.id); s.setAttribute("aria-pressed", "false"); s.lastChild.textContent = t("looks.save"); toast(t("looks.removed")); }
        else { await saveLook({ title: x.title, itemIds: x.itemIds, how: x.how, source: "combina" }); s.setAttribute("aria-pressed", "true"); s.lastChild.textContent = t("looks.saved"); toast(t("looks.savedToast")); }
      } catch { toast(t("item.saveFail"), "error"); }
    }
  };
}
