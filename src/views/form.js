// Formulario de prenda (añadir y editar). Los campos que rellena la IA llevan la marca "Leído por la IA"
// hasta que el usuario los toca.
import { t } from "../i18n.js";
import {
  TYPES, GROUPS, COLORS, COLOR, PATTERNS, MATERIALS, FITS, SEASONS, label, sizeKeyOf,
  shown, isWomen, BRA_FINISH, SHEER, NECKLINES, BRA_TYPES,
} from "../catalog.js";
// prendas que van pegadas al cuerpo (para saber qué sujetador llevar debajo)
const BODY_TYPES = new Set(["camiseta", "camiseta-ml", "polo", "tirantes", "camisa", "camisa-mc", "blusa", "top", "vestido", "mono", "jersey", "cardigan"]);
import { $, $$, esc, icon } from "../ui.js";
import { store } from "../data.js";

const aiMark = () => `<span class="ai-mark">${icon("spark")}${t("item.ai")}</span>`;
const chipGroup = (name, list, { multi = false } = {}) =>
  `<div class="ai-group" data-group="${name}"><div class="chips" role="group" data-multi="${multi}">${list
    .map((x) => `<button type="button" class="chip" data-v="${x.k}" aria-pressed="false">${esc(label(x))}</button>`).join("")}</div></div>`;

export function itemForm(initial = {}) {
  const el = document.createElement("form");
  el.className = "item-form"; el.noValidate = true;
  const brands = [...new Set(store.items.map((i) => i.brand).filter(Boolean))].sort();
  el.innerHTML = `
  <div class="section"><h3>${t("item.section.basic")}</h3>
    <label class="field" data-f="name"><span>${t("item.name")} ${aiMark()}</span><input name="name" autocomplete="off" maxlength="80" required></label>
    <label class="field" data-f="type"><span>${t("item.type")} ${aiMark()}</span><select name="type">${GROUPS.filter(shown).map((g) =>
      `<optgroup label="${esc(label(g))}">${TYPES.filter((x) => x.g === g.k && (shown(x) || x.k === initial.type)).map((x) => `<option value="${x.k}">${esc(label(x))}</option>`).join("")}</optgroup>`).join("")}</select></label>
    <div class="field ai-group" data-f="colors"><span>${t("item.colors")} ${aiMark()}</span><span class="hint">${t("item.colorsHint")}</span>
      <div class="swatches">${COLORS.map((c) => `<button type="button" class="sw-btn" data-c="${c.k}" aria-pressed="false" aria-label="${esc(label(c))}" title="${esc(label(c))}"><i style="background:${c.hex}"></i></button>`).join("")}</div></div>
    <div class="field ai-group" data-f="pattern"><span>${t("item.pattern")} ${aiMark()}</span>${chipGroup("pattern", PATTERNS)}</div>
  </div>
  <div class="section" id="wBody" hidden><h3>${t("under.section")}</h3>
    <div class="field ai-group" data-f="sheer"><span>${t("under.sheer")} ${aiMark()}</span><span class="hint">${t("under.sheerHint")}</span>${chipGroup("sheer", SHEER)}</div>
    <div class="field ai-group" data-f="neckline"><span>${t("under.neckline")} ${aiMark()}</span>${chipGroup("neckline", NECKLINES)}</div>
  </div>
  <div class="section" id="wBra" hidden><h3>${t("under.braSection")}</h3>
    <div class="field ai-group" data-f="braFinish"><span>${t("under.finish")} ${aiMark()}</span><span class="hint">${t("under.finishHint")}</span>${chipGroup("braFinish", BRA_FINISH)}</div>
  </div>
  <div class="section"><h3>${t("item.section.details")}</h3>
    <div class="two">
      <label class="field" data-f="brand"><span>${t("item.brand")} ${aiMark()}</span><input name="brand" list="brandList" autocomplete="off" maxlength="40"><datalist id="brandList">${brands.map((b) => `<option value="${esc(b)}">`).join("")}</datalist></label>
      <label class="field" data-f="size"><span>${t("item.size")} ${aiMark()}</span><input name="size" autocomplete="off" maxlength="20"></label>
    </div>
    <label class="field" data-f="material"><span>${t("item.material")} ${aiMark()}</span><input name="material" placeholder="${t("item.materialPh")}" maxlength="120"></label>
    <div class="field ai-group" data-f="materialKey"><span>${t("item.materialKey")} ${aiMark()}</span>${chipGroup("materialKey", MATERIALS)}</div>
    <div class="field ai-group" data-f="fit"><span>${t("item.fit")} ${aiMark()}</span>${chipGroup("fit", FITS)}</div>
  </div>
  <div class="section"><h3>${t("item.section.use")}</h3>
    <div class="field ai-group" data-f="seasons"><span>${t("item.season")} ${aiMark()}</span>${chipGroup("seasons", SEASONS.map((k) => ({ k, es: t("season." + k) })), { multi: true })}</div>
    <label class="field ai-group" data-f="formality"><span>${t("item.formality")} ${aiMark()} <b class="form-val" style="margin-left:auto"></b></span><input type="range" name="formality" min="1" max="5" step="1"></label>
    <label class="field" data-f="styleTags"><span>${t("item.style")} ${aiMark()}</span><input name="styleTags" placeholder="${t("item.stylePh")}" maxlength="120"></label>
  </div>
  <div class="section"><h3>${t("item.section.care")}</h3>
    <label class="field" data-f="care"><span>${t("item.care")} ${aiMark()}</span><input name="care" placeholder="${t("item.carePh")}" maxlength="160"></label>
    <label class="field" data-f="notes"><span>${t("item.notes")}</span><textarea name="notes" placeholder="${t("item.notesPh")}" maxlength="400"></textarea></label>
  </div>`;

  const F = (n) => el.elements.namedItem(n);
  let colors = [];
  const pressSingle = (name, v) => $$(`[data-group="${name}"] .chip`, el).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
  const getSingle = (name) => $(`[data-group="${name}"] .chip[aria-pressed="true"]`, el)?.dataset.v || null;
  const renderColors = () => $$(".sw-btn", el).forEach((b) => {
    const i = colors.findIndex((c) => c.k === b.dataset.c);
    b.setAttribute("aria-pressed", String(i >= 0));
    if (i >= 0 && colors.length > 1) b.dataset.order = i + 1; else delete b.dataset.order;
  });
  const formVal = () => { $(".form-val", el).textContent = t("formality." + F("formality").value); };
  const sizeHint = () => {
    const k = sizeKeyOf(F("type").value), s = k && store.profile?.sizes?.[k];
    F("size").placeholder = s ? t("item.yourSize", { s }) : "";
  };

  const clearAi = (f) => $(`[data-f="${f}"]`, el)?.classList.remove("ai");
  el.addEventListener("input", (e) => { const f = e.target.closest("[data-f]")?.dataset.f; if (f) clearAi(f); if (e.target.name === "formality") formVal(); });
  const womenFields = () => {
    const ty = F("type").value;
    $("#wBody", el).hidden = !(isWomen() && BODY_TYPES.has(ty));
    $("#wBra", el).hidden = !BRA_TYPES.has(ty);
  };
  el.addEventListener("change", (e) => { if (e.target.name === "type") { sizeHint(); womenFields(); } });
  el.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip"), sw = e.target.closest(".sw-btn");
    if (chip) {
      const g = chip.closest("[data-group]"); const multi = g.querySelector(".chips").dataset.multi === "true";
      if (multi) chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
      else pressSingle(g.dataset.group, chip.getAttribute("aria-pressed") === "true" ? null : chip.dataset.v);
      clearAi(chip.closest("[data-f]").dataset.f);
    }
    if (sw) {
      const k = sw.dataset.c, i = colors.findIndex((c) => c.k === k);
      if (i >= 0) colors.splice(i, 1);
      else { if (colors.length >= 3) colors.pop(); colors.push({ k, hex: COLOR[k].hex.startsWith("#") ? COLOR[k].hex : null }); }
      renderColors(); clearAi("colors");
    }
  });

  /** Rellena campos. Con ai=true marca los que cambia como "Leído por la IA" (solo si traen valor). */
  function fill(d = {}, { ai = false } = {}) {
    const mark = (f) => ai && $(`[data-f="${f}"]`, el)?.classList.add("ai");
    for (const f of ["name", "brand", "size", "material", "care", "notes"]) if (d[f] != null && d[f] !== "") { F(f).value = d[f]; mark(f); }
    if (d.type && F("type").querySelector(`option[value="${d.type}"]`)) { F("type").value = d.type; mark("type"); }
    if (Array.isArray(d.colors) && d.colors.length) {
      colors = d.colors.filter((c) => COLOR[c.k] || c.hex).slice(0, 3).map((c) => ({ k: COLOR[c.k] ? c.k : "", hex: /^#[0-9a-f]{6}$/i.test(c.hex || "") ? c.hex : COLOR[c.k]?.hex || null }));
      renderColors(); mark("colors");
    }
    for (const f of ["pattern", "materialKey", "fit", "sheer", "neckline", "braFinish"]) if (d[f]) { pressSingle(f, d[f]); mark(f); }
    if (Array.isArray(d.seasons) && d.seasons.length) { $$('[data-group="seasons"] .chip', el).forEach((b) => b.setAttribute("aria-pressed", String(d.seasons.includes(b.dataset.v)))); mark("seasons"); }
    if (d.formality) { F("formality").value = Math.min(5, Math.max(1, Math.round(d.formality))); formVal(); mark("formality"); }
    const tags = d.styleTags || d.tags; if (Array.isArray(tags) && tags.length) { F("styleTags").value = tags.join(", "); mark("styleTags"); }
    sizeHint(); womenFields();
  }

  function read() {
    return {
      name: F("name").value.trim(), type: F("type").value,
      colors: colors.map((c) => ({ k: c.k, hex: c.hex || null })),
      pattern: getSingle("pattern"), brand: F("brand").value.trim() || null, size: F("size").value.trim() || null,
      material: F("material").value.trim() || null, materialKey: getSingle("materialKey"), fit: getSingle("fit"),
      seasons: $$('[data-group="seasons"] .chip[aria-pressed="true"]', el).map((b) => b.dataset.v),
      formality: Number(F("formality").value),
      styleTags: F("styleTags").value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      care: F("care").value.trim() || null, notes: F("notes").value.trim() || null,
      ...(isWomen() && BODY_TYPES.has(F("type").value) ? { sheer: getSingle("sheer"), neckline: getSingle("neckline") } : {}),
      ...(BRA_TYPES.has(F("type").value) ? { braFinish: getSingle("braFinish") } : {}),
    };
  }

  F("formality").value = 2; formVal();
  fill({ seasons: SEASONS, ...initial });
  $$(".ai", el).forEach((n) => n.classList.remove("ai"));
  el.addEventListener("submit", (e) => e.preventDefault());
  return { el, fill, read, focusName: () => F("name").focus() };
}
