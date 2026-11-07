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

/**
 * Quita el fondo. onProgress(texto, fracción 0..1).
 * Devuelve {blob, width, height, aspect, method: "ia"|"fondo-liso"|"sin-recorte"}.
 */
export async function makeCutout(photo, onProgress = () => {}) {
  // 1) modelo de IA en el dispositivo
  try {
    onProgress("Preparando el recorte…", 0);
    lib ??= await import("@imgly/background-removal");
    const png = await lib.removeBackground(photo, {
      model: "isnet_quint8",
      output: { format: "image/png" },
      progress: (key, cur, total) => {
        if (key.startsWith("fetch")) onProgress("Descargando el modelo de recorte (solo la primera vez)…", total ? cur / total : 0);
        else onProgress("Recortando la prenda…", 0.95);
      },
    });
    const img = await loadImage(png);
    const c = canvasFor(img.naturalWidth, img.naturalHeight);
    c.getContext("2d").drawImage(img, 0, 0);
    const res = await trimToWebp(c);
    if (res) return { ...res, method: "ia" };
  } catch (e) {
    console.warn("Recorte IA no disponible:", e);
  }
  // 2) recorte por color de fondo
  onProgress("Recortando por color de fondo…", 0.9);
  const img = await loadImage(photo);
  const k = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = canvasFor(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const removed = floodCutout(id);
  if (removed > 0.08 && removed < 0.95) {
    ctx.putImageData(id, 0, 0);
    const res = await trimToWebp(c);
    if (res) return { ...res, method: "fondo-liso" };
  }
  // 3) sin recorte: la foto tal cual
  const plain = canvasFor(c.width, c.height);
  plain.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  const res = await trimToWebp(plain);
  return { ...res, method: "sin-recorte" };
}
