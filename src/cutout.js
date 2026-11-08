// Recorte de la prenda: quita el fondo de la foto en el propio móvil.
// 1º intenta el modelo de IA (@imgly/background-removal, se descarga una vez y queda en caché);
// si falla, usa un recorte por color de fondo (funciona bien con fondos lisos).

let lib = null;

async function loadImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode(); return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

function canvasFor(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }

/** Reduce una foto a JPEG de `max` px de lado. */
export async function shrinkPhoto(fileOrBlob, max = 1400) {
  const img = await loadImage(fileOrBlob);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasFor(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
}

/** Recorte simple: borra los píxeles conectados al borde con un color parecido al del fondo. */
export function floodCutout(imageData, tolerance = 42) {
  const { width: w, height: h, data } = imageData;
  // color de fondo = media de los píxeles del borde
  let r = 0, g = 0, b = 0, n = 0;
  const addPx = (i) => { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; };
  for (let x = 0; x < w; x++) { addPx(x * 4); addPx(((h - 1) * w + x) * 4); }
  for (let y = 0; y < h; y++) { addPx(y * w * 4); addPx((y * w + w - 1) * 4); }
  r /= n; g /= n; b /= n;
  const tol2 = tolerance * tolerance;
  const isBg = (p) => {
    const i = p * 4, dr = data[i] - r, dg = data[i + 1] - g, db = data[i + 2] - b;
    return dr * dr + dg * dg + db * db < tol2;
  };
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (p) => { if (!seen[p] && isBg(p)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  for (let p = 0; p < w * h; p++) if (seen[p]) data[p * 4 + 3] = 0;
  // suaviza el borde: píxeles opacos junto al fondo quedan semitransparentes
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x; if (seen[p]) continue;
    if (seen[p - 1] || seen[p + 1] || seen[p - w] || seen[p + w]) data[p * 4 + 3] = 150;
  }
  return seen.reduce((a, v) => a + v, 0) / (w * h); // fracción eliminada
}

/** Recorta al contorno de la prenda y devuelve WebP con transparencia. */
async function trimToWebp(canvas, maxSide = 900) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  if (cw * ch < w * h * 0.04) return null; // casi nada recortado: algo ha fallado
  const k = Math.min(1, maxSide / Math.max(cw, ch));
  const out = canvasFor(Math.max(1, Math.round(cw * k)), Math.max(1, Math.round(ch * k)));
  out.getContext("2d").drawImage(canvas, x0, y0, cw, ch, 0, 0, out.width, out.height);
  let q = 0.86, blob;
  do { blob = await new Promise((r) => out.toBlob(r, "image/webp", q)); q -= 0.12; }
  while (blob && blob.size > 600_000 && q > 0.4);
  return { blob, width: out.width, height: out.height, aspect: out.width / out.height, tone: toneOf(out), thumb: thumbOf(out) };
}

/** Miniatura WebP (data URL, ~5-15 KB) para que la cuadrícula del armario cargue al instante. */
function thumbOf(canvas, side = 260) {
  const k = Math.min(1, side / Math.max(canvas.width, canvas.height));
  const c = canvasFor(Math.max(1, Math.round(canvas.width * k)), Math.max(1, Math.round(canvas.height * k)));
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL("image/webp", 0.8);
}

/** Tono representativo de la prenda (para el halo de color): media de los píxeles opacos, dando más peso a los saturados. */
export function toneOf(canvas) {
  const s = 48, c = canvasFor(s, s), g = c.getContext("2d");
  g.drawImage(canvas, 0, 0, s, s);
  const d = g.getImageData(0, 0, s, s).data;
  let r = 0, gg = 0, b = 0, w = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 180) continue;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const wt = 1 + 3 * ((mx - mn) / 255);
    r += d[i] * wt; gg += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
  }
  if (!w) return "#8a8f98";
  const hex = (v) => Math.round(v / w).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(gg)}${hex(b)}`;
}

/** Deja solo la prenda: quita motas y trozos de fondo sueltos (se queda con la pieza más grande y las que se le parecen
 * en tamaño, p. ej. los dos zapatos), y endurece el borde. Devuelve la fracción opaca. */
export function cleanMask(canvas) {
  const ctx = canvas.getContext("2d"), { width: w, height: h } = canvas;
  const id = ctx.getImageData(0, 0, w, h), d = id.data, n = w * h;
  const solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const a = d[p * 4 + 3];
    if (a < 40) d[p * 4 + 3] = 0; else if (a > 215) d[p * 4 + 3] = 255;
    solid[p] = d[p * 4 + 3] >= 100 ? 1 : 0;
  }
  // componentes conexas de lo opaco
  const label = new Int32Array(n), sizes = [0];
  const stack = new Int32Array(n);
  for (let p = 0; p < n; p++) {
    if (!solid[p] || label[p]) continue;
    const id2 = sizes.length; let top = 0, size = 0;
    stack[top++] = p; label[p] = id2;
    while (top) {
      const q = stack[--top]; size++;
      const x = q % w;
      if (x > 0 && solid[q - 1] && !label[q - 1]) { label[q - 1] = id2; stack[top++] = q - 1; }
      if (x < w - 1 && solid[q + 1] && !label[q + 1]) { label[q + 1] = id2; stack[top++] = q + 1; }
      if (q >= w && solid[q - w] && !label[q - w]) { label[q - w] = id2; stack[top++] = q - w; }
      if (q < n - w && solid[q + w] && !label[q + w]) { label[q + w] = id2; stack[top++] = q + w; }
    }
    sizes.push(size);
  }
  const biggest = Math.max(0, ...sizes);
  if (!biggest) return 0;
  const keep = sizes.map((s) => s >= biggest * 0.06);
  // lo semitransparente se queda solo si toca una pieza que se conserva (borde suave)
  let opaque = 0;
  for (let p = 0; p < n; p++) {
    const l = label[p];
    if (l) { if (!keep[l]) d[p * 4 + 3] = 0; else opaque++; continue; }
    if (!d[p * 4 + 3]) continue;
    const x = p % w;
    const near = (x > 0 && keep[label[p - 1]] && label[p - 1]) || (x < w - 1 && keep[label[p + 1]] && label[p + 1]) || (p >= w && keep[label[p - w]] && label[p - w]) || (p < n - w && keep[label[p + w]] && label[p + w]);
    if (!near) d[p * 4 + 3] = 0;
  }
  ctx.putImageData(id, 0, 0);
  return opaque / n;
}

/** Recorta la foto a la caja de la prenda (box = [ymin, xmin, ymax, xmax] de 0 a 1000) con un pequeño margen. */
async function cropToBox(photo, box) {
  const img = await loadImage(photo), W = img.naturalWidth, H = img.naturalHeight;
  const [y0, x0, y1, x1] = box.map((v) => Math.max(0, Math.min(1000, +v)) / 1000);
  const m = 0.1; // margen generoso: la IA a veces deja fuera mangas o puntas
  const sx = Math.max(0, (x0 - m) * W), sy = Math.max(0, (y0 - m) * H), ex = Math.min(W, (x1 + m) * W), ey = Math.min(H, (y1 + m) * H);
  const c = canvasFor(Math.round(ex - sx), Math.round(ey - sy));
  c.getContext("2d").drawImage(img, sx, sy, ex - sx, ey - sy, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.92));
  blob.cutEdges = { top: sy > 0, left: sx > 0, bottom: ey < H, right: ex < W }; // lados en los que se ha cortado la foto
  return blob;
}
/** ¿La prenda llega hasta un lado por el que se ha recortado la foto? (entonces la caja se ha quedado corta) */
function touchesCut(canvas, edges) {
  if (!edges) return false;
  const { width: w, height: h } = canvas, d = canvas.getContext("2d").getImageData(0, 0, w, h).data;
  const op = (x, y) => d[(y * w + x) * 4 + 3] > 128;
  const count = (fn, len) => { let n = 0; for (let i = 0; i < len; i++) if (fn(i)) n++; return n / len; };
  const band = 2;
  const hit = (edge) => {
    let f = 0;
    for (let b = 0; b < band; b++) f = Math.max(f, edge === "top" ? count((x) => op(x, b), w) : edge === "bottom" ? count((x) => op(x, h - 1 - b), w) : edge === "left" ? count((y) => op(b, y), h) : count((y) => op(w - 1 - b, y), h));
    return f > 0.03;
  };
  return Object.entries(edges).some(([k, cut]) => cut && hit(k));
}
const validBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(+v)) && (b[2] - b[0]) * (b[3] - b[1]) > 0.04 * 1e6 && (b[2] - b[0]) * (b[3] - b[1]) < 0.985 * 1e6;

/**
 * Quita el fondo y deja SOLO la prenda. onProgress(texto, fracción 0..1).
 * locate (opcional): async (foto) => caja de la prenda [ymin,xmin,ymax,xmax] 0-1000 (la da la IA); con ella se recorta antes
 * para que no se cuele nada más (percha, cama, otra ropa).
 * Devuelve {blob, width, height, aspect, tone, thumb, method: "ia"|"fondo-liso"|"sin-recorte"}.
 */
export async function makeCutout(photo, onProgress = () => {}, { locate } = {}) {
  // 0) dónde está la prenda
  let src = photo;
  if (locate) {
    try {
      onProgress("Buscando la prenda en la foto…", 0);
      const box = await locate(photo);
      if (validBox(box)) src = await cropToBox(photo, box);
    } catch (e) { console.warn("Sin caja de la prenda:", e); }
  }
  // 1) modelo de recorte en el dispositivo + limpieza (solo la prenda)
  try {
    onProgress("Preparando el recorte…", 0);
    lib ??= await import("@imgly/background-removal");
    const run = (model) => lib.removeBackground(src, {
      model, output: { format: "image/png" },
      progress: (key, cur, total) => {
        if (key.startsWith("fetch")) onProgress("Descargando el modelo de recorte (solo la primera vez)…", total ? cur / total : 0);
        else onProgress("Recortando la prenda…", 0.95);
      },
    });
    let model = "isnet_fp16";
    const cutOf = async () => {
      let png;
      try { png = await run(model); } catch (e) { console.warn(model, "no disponible, uso el ligero", e); model = "isnet_quint8"; png = await run(model); }
      const img = await loadImage(png);
      const c = canvasFor(img.naturalWidth, img.naturalHeight);
      c.getContext("2d").drawImage(img, 0, 0);
      return c;
    };
    let c = await cutOf();
    // si la prenda toca el borde recortado, la caja de la IA se quedó corta (mangas, bajos): se repite con la foto entera
    if (src !== photo && touchesCut(c, src.cutEdges)) { console.warn("La caja cortaba la prenda: recorto la foto entera"); src = photo; c = await cutOf(); }
    const frac = cleanMask(c);
    if (frac > 0.03 && frac < 0.96) {
      const res = await trimToWebp(c);
      if (res) return { ...res, method: "ia" };
    }
  } catch (e) {
    console.warn("Recorte IA no disponible:", e);
  }
  // 2) recorte por color de fondo
  onProgress("Recortando por color de fondo…", 0.9);
  const img = await loadImage(src);
  const k = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasFor(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const removed = floodCutout(id);
  if (removed > 0.08 && removed < 0.95) {
    ctx.putImageData(id, 0, 0);
    cleanMask(c);
    const res = await trimToWebp(c);
    if (res) return { ...res, method: "fondo-liso" };
  }
  // 3) sin recorte: la foto (ya encuadrada en la prenda si la IA la encontró)
  const plain = canvasFor(c.width, c.height);
  plain.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const res = await trimToWebp(plain);
  return { ...res, method: "sin-recorte" };
}

/**
 * Gafas de ver: deja los cristales transparentes. El recorte deja la gafa entera opaca (montura + lo que se ve a
 * través del cristal). Se separa la montura del cristal por color (la montura es el color del borde exterior de la
 * silueta; el cristal es «lo otro») y se quitan las zonas de cristal encerradas por la montura.
 * Recibe y devuelve lo mismo que makeCutout ({blob, width, height, aspect, tone, thumb, method}).
 */
export async function clearLenses(cut) {
  const img = await loadImage(cut.blob);
  const w = img.naturalWidth, h = img.naturalHeight, n = w * h;
  const c = canvasFor(w, h), g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, w, h), d = id.data;
  const op = new Uint8Array(n);
  for (let p = 0; p < n; p++) op[p] = d[p * 4 + 3] > 128 ? 1 : 0;
  const lab = (p) => { const i = p * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  // 1) color de la montura: píxeles opacos pegados al exterior (banda de 1-3 px del contorno)
  const edge = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x; if (!op[p]) continue;
    if (!op[p - 1] || !op[p + 1] || !op[p - w] || !op[p + w]) { const q = [p + 1, p - 1, p + w, p - w].find((k) => op[k] && op[k + 1] && op[k - 1] && op[k + w] && op[k - w]); if (q != null) edge.push(lab(q)); }
  }
  if (edge.length < 20) return cut;
  const med = (arr, k) => arr.map((v) => v[k]).sort((a, b) => a - b)[arr.length >> 1];
  let frame = [med(edge, 0), med(edge, 1), med(edge, 2)];
  // 2) dos grupos de color (montura / cristal) con k-medias, empezando por la montura y lo más lejano a ella
  const all = []; for (let p = 0; p < n; p += 2) if (op[p]) all.push(lab(p));
  let lens = all.reduce((best, v) => (dist(v, frame) > dist(best, frame) ? v : best), frame);
  if (dist(lens, frame) < 40) return cut; // todo del mismo color: no se distingue el cristal
  for (let it = 0; it < 8; it++) {
    const sA = [0, 0, 0, 0], sB = [0, 0, 0, 0];
    for (const v of all) { const s = dist(v, frame) <= dist(v, lens) ? sA : sB; s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; s[3]++; }
    if (sA[3]) frame = [sA[0] / sA[3], sA[1] / sA[3], sA[2] / sA[3]];
    if (sB[3]) lens = [sB[0] / sB[3], sB[1] / sB[3], sB[2] / sB[3]];
  }
  const isFrame = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (op[p]) { const v = lab(p); isFrame[p] = dist(v, frame) * 1.15 < dist(v, lens) ? 1 : 0; }
  // 3) la montura se engorda un poco para cerrar huecos y que los cristales queden encerrados
  const R = Math.max(1, Math.round(Math.min(w, h) / 150));
  const fat = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!isFrame[y * w + x]) continue;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w) fat[yy * w + xx] = 1; }
  }
  // 4) zonas opacas que no son montura: las grandes y rodeadas de montura son cristales
  const seen = new Int32Array(n).fill(-1), comps = [];
  let opaque = 0; for (let p = 0; p < n; p++) opaque += op[p];
  for (let s = 0; s < n; s++) {
    if (!op[s] || fat[s] || seen[s] >= 0) continue;
    const k = comps.length, stack = [s], pix = []; let open = 0; seen[s] = k;
    while (stack.length) {
      const p = stack.pop(); pix.push(p);
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0) { open++; continue; }
        if (!op[q]) { open++; continue; } // toca el exterior: no está encerrada
        if (fat[q] || seen[q] >= 0) continue;
        seen[q] = k; stack.push(q);
      }
    }
    comps.push({ pix, open });
  }
  const lenses = comps.filter((cm) => cm.pix.length > opaque * 0.04 && cm.open < cm.pix.length * 0.02);
  if (!lenses.length) return cut;
  // 5) cristal fuera: transparente, recuperando también el borde engordado que no era montura
  const clear = new Uint8Array(n);
  for (const cm of lenses) for (const p of cm.pix) clear[p] = 1;
  for (let pass = 0; pass < R + 1; pass++) {
    const add = [];
    for (let p = 0; p < n; p++) if (!clear[p] && op[p] && !isFrame[p]) { const x = p % w; if ((x > 0 && clear[p - 1]) || (x < w - 1 && clear[p + 1]) || clear[p - w] || clear[p + w]) add.push(p); }
    add.forEach((p) => (clear[p] = 1));
  }
  for (let p = 0; p < n; p++) if (clear[p]) d[p * 4 + 3] = 0;
  // borde suave entre montura y cristal
  for (let p = w; p < n - w; p++) if (!clear[p] && op[p] && (clear[p - 1] || clear[p + 1] || clear[p - w] || clear[p + w])) d[p * 4 + 3] = Math.min(d[p * 4 + 3], 200);
  g.putImageData(id, 0, 0);
  let q = 0.9, blob;
  do { blob = await new Promise((r) => c.toBlob(r, "image/webp", q)); q -= 0.12; } while (blob && blob.size > 600_000 && q > 0.4);
  return { ...cut, blob, tone: toneOf(c), thumb: thumbOf(c), lensesCleared: lenses.length };
}
