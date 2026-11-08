// Probador 3D: maniquí con las fotos recortadas de tus prendas.
// Cada prenda es una superficie curva que envuelve el cuerpo: delante la foto,
// detrás la misma foto en espejo y más oscura (la espalda de la prenda).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { layerOf } from "./catalog.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createViewer(stage, { onError } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: false });
  } catch (e) { onError?.(e); return null; }
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(28, 0.8, 0.1, 50);
  const target = new THREE.Vector3(0, 0.95, 0);
  let dist = 5.0;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9d96, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(1.6, 3.2, 3.4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45); fill.position.set(-2.5, 1.5, 1.5); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(0, 2.5, -3); scene.add(rim);

  const root = new THREE.Group(); root.rotation.y = 0.25; scene.add(root);

  // sombra de contacto
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,.35)"); grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);

  // ---------- maniquí ----------
  // Modelo 3D de cuerpo humano (public/models/maniqui.glb) con acabado de maniquí de tienda, en la postura de reposo.
  // Mientras carga (o si falla) se ve un maniquí sencillo hecho con formas.
  const skin = new THREE.MeshStandardMaterial({ color: 0xe9e4db, roughness: 0.42, metalness: 0.0 });
  const body = new THREE.Group(); root.add(body);
  const simple = new THREE.Group(); body.add(simple);
  const torsoProfile = [
    [0, 0.8], [0.1, 0.8], [0.145, 0.84], [0.156, 0.92], [0.148, 1.0], [0.128, 1.08], [0.134, 1.16],
    [0.157, 1.26], [0.17, 1.36], [0.165, 1.42], [0.13, 1.47], [0.06, 1.5], [0.048, 1.57], [0, 1.58],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 48), skin);
  torso.scale.z = 0.7; simple.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 40, 28), skin);
  head.scale.set(0.86, 1.16, 0.96); head.position.y = 1.68; simple.add(head);
  const limb = (rt, rb, h, x, y, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 28), skin);
    m.position.set(x, y, 0); m.rotation.z = rz; simple.add(m); return m;
  };
  [-1, 1].forEach((s) => {
    limb(0.068, 0.04, 0.8, s * 0.075, 0.42);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.2), skin); foot.position.set(s * 0.078, 0.02, 0.04); simple.add(foot);
    limb(0.044, 0.03, 0.66, s * 0.225, 1.1, s * 0.1);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14), skin); hand.scale.y = 1.4; hand.position.set(s * 0.258, 0.73, 0); simple.add(hand);
  });

  const BODY_H = 1.78; // altura del maniquí en unidades de escena (1 = 1 m)
  let model = null, bodyMesh = null, bodyShape = { heightCm: 178, build: "media" };
  let modelLoaded; const modelReady = new Promise((r) => (modelLoaded = r));
  // maniqui.glb: malla humana masculina (base CC0 de MakeHuman) con morph targets por complexión (scripts/mh2glb.py)
  new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/maniqui.glb`).then((gltf) => {
    model = gltf.scene;
    model.traverse((o) => { if (o.isMesh) { o.material = skin; o.frustumCulled = false; } });
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3());
    const k = BODY_H / size.y;
    model.scale.setScalar(k);
    model.position.set(-(box.min.x + size.x / 2) * k, -box.min.y * k, -(box.min.z + size.z / 2) * k);
    body.remove(simple); body.add(model);
    model.traverse((o) => { if (o.isMesh && !bodyMesh) bodyMesh = o; });
    prepareBody(k);
    setBody(bodyShape); modelLoaded(true);
  }).catch((e) => { console.warn("Maniquí 3D no disponible, se usa el sencillo:", e); modelLoaded(false); });

  const clothes = new THREE.Group(); root.add(clothes);

  // ---------- prendas ----------
  const loader = new THREE.TextureLoader();
  const texCache = new Map();
  async function texture(item, getUrl) {
    const k = item.id + ":" + (item.imageVersion || 0);
    if (texCache.has(k)) return texCache.get(k);
    const url = await getUrl(item);
    if (!url) return null;
    const t = await loader.loadAsync(url);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.userData.avg = averageColor(t.image);
    texCache.set(k, t); return t;
  }
  // color medio de la parte opaca de la foto: es el color de la tela a los lados y detrás
  function averageColor(img) {
    try {
      const c = document.createElement("canvas"); c.width = c.height = 40;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0, 40, 40);
      const d = g.getImageData(0, 0, 40, 40).data; let r = 0, gg = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 160) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
      return n ? `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})` : null;
    } catch { return null; }
  }

  function arcPair(tex, { width, height, yTop, radius, z = 0, order = 0, flare = 1 }) {
    const r = Math.max(radius, width / Math.PI); // como mucho media vuelta por delante
    const L = width / r;
    const g = new THREE.Group();
    const geo = new THREE.CylinderGeometry(r, r * flare, height, 64, 1, true, -L / 2, L);
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.92, side: THREE.FrontSide }));
    const backTex = tex.clone(); backTex.wrapS = THREE.RepeatWrapping; backTex.repeat.x = -1; backTex.offset.x = 1; backTex.needsUpdate = true;
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: backTex, color: 0xa8a8a8, transparent: true, alphaTest: 0.35, roughness: 0.95 }));
    back.rotation.y = Math.PI;
    front.renderOrder = back.renderOrder = order;
    g.add(front, back);
    g.position.set(0, yTop - height / 2, z); g.scale.z = 0.78;
    return g;
  }
  function flat(tex, { width, aspect, x, y, z = 0.02, ry = 0 }) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, width / aspect), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
    m.position.set(x, y, z); m.rotation.y = ry; return m;
  }

  // Volumen de tela en el color de la prenda, debajo de la foto: da cuerpo de lado y tapa el maniquí
  function fabric(item, tex) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tex?.userData?.avg || item.colorHex || "#888").convertSRGBToLinear().convertLinearToSRGB().multiplyScalar(0.92), roughness: 0.95 });
    const g = new THREE.Group();
    const cyl = (rt, rb, h, x, y, rz = 0, sz = 0.74) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 32), m); c.position.set(x, y, 0); c.rotation.z = rz; c.scale.z = sz; g.add(c); };
    const arm = (len, r) => [-1, 1].forEach((s) => cyl(r, r * 0.9, len, s * (0.19 + Math.sin(0.1) * len / 2), 1.43 - Math.cos(0.1) * len / 2, s * 0.1, 1));
    const leg = (len, r) => [-1, 1].forEach((s) => cyl(r, r * 0.9, len, s * 0.075, 0.82 - len / 2, 0, 1));
    return { g, cyl, arm, leg };
  }

  function garment(item, tex) {
    const a = item.aspect || 0.8, s = item.shape;
    const { g, cyl, arm, leg } = fabric(item, tex);
    switch (item.category) {
      case "top": {
        const short = ["camiseta", "top"].includes(s), W = short ? 0.58 : 0.7, H = clamp(W / a, 0.42, 0.8);
        cyl(0.176, 0.15, Math.min(H, 0.66), 0, 1.47 - Math.min(H, 0.66) / 2);
        if (s !== "top") arm(short ? 0.2 : 0.6, 0.05);
        g.add(arcPair(tex, { width: W, height: H, yTop: 1.5, radius: 0.19, order: 2 })); return g;
      }
      case "outer": {
        const W = 0.8, H = clamp(W / a, 0.5, 1.15);
        cyl(0.2, 0.19, H, 0, 1.5 - H / 2, 0, 0.76); arm(0.62, 0.058);
        g.add(arcPair(tex, { width: W, height: H, yTop: 1.53, radius: 0.22, order: 4 })); return g;
      }
      case "dress": {
        const W = 0.54, H = clamp(W / a, 0.7, 1.15), mono = s === "mono";
        cyl(0.172, mono ? 0.16 : 0.24, H, 0, 1.48 - H / 2);
        if (mono) leg(0.78, 0.075);
        g.add(arcPair(tex, { width: W, height: H, yTop: 1.5, radius: 0.19, order: 3, flare: mono ? 1 : 1.3 })); return g;
      }
      case "bottom": {
        const H = { pantalon: 0.95, vaquero: 0.95, shorts: 0.38 }[s] ?? clamp(0.44 / a, 0.35, 0.8);
        const W = clamp(H * a, 0.26, 0.62), skirt = s === "falda";
        if (skirt) cyl(0.155, 0.23, H - 0.02, 0, 0.99 - H / 2);
        else { cyl(0.152, 0.158, 0.2, 0, 0.9); leg(H - 0.17, 0.074); }
        g.add(arcPair(tex, { width: W, height: H, yTop: 1.0, radius: 0.165, order: 1, flare: skirt ? 1.35 : 1 })); return g;
      }
      case "shoes": {
        const W = 0.36, H = clamp(W / a, 0.08, 0.26);
        [-1, 1].forEach((side) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.065, 0.23), new THREE.MeshStandardMaterial({ color: new THREE.Color(tex?.userData?.avg || item.colorHex || "#888"), roughness: 0.8 })); b.position.set(side * 0.078, 0.033, 0.04); g.add(b); });
        if (s === "botas") [-1, 1].forEach((side) => cyl(0.073, 0.07, 0.22, side * 0.075, 0.12, 0, 1));
        g.add(arcPair(tex, { width: W, height: H, yTop: H + 0.004, radius: 0.19, z: 0.05, order: 1 })); return g;
      }
      default: {
        if (s === "gorro") return flat(tex, { width: 0.26, aspect: a, x: 0, y: 1.8, z: 0.06 });
        if (s === "bufanda") return arcPair(tex, { width: 0.34, height: clamp(0.34 / a, 0.1, 0.5), yTop: 1.56, radius: 0.1, order: 5 });
        if (s === "cinturon") return arcPair(tex, { width: 0.45, height: clamp(0.45 / a, 0.03, 0.08), yTop: 1.02, radius: 0.17, order: 5 });
        return flat(tex, { width: 0.26, aspect: a, x: 0.36, y: 0.8, z: 0.04, ry: -0.3 }); // bolso u otro
      }
    }
  }

  // ---------- ropa con la forma del cuerpo ----------
  // Cada prenda es una "funda" hecha con los vértices del maniquí de esa zona, separada unos milímetros
  // de la piel y con la tela real (un trozo de la foto repetido). Sigue la complexión (morph targets).
  let B = null; // datos del cuerpo en metros
  function prepareBody(k) {
    const g = bodyMesh.geometry, pos = g.attributes.position, n = pos.count;
    const box = new THREE.Box3().setFromBufferAttribute(pos);
    const ym = new Float32Array(n), xm = new Float32Array(n), zm = new Float32Array(n);
    for (let i = 0; i < n; i++) { ym[i] = (pos.getY(i) - box.min.y) * k; xm[i] = pos.getX(i) * k; zm[i] = pos.getZ(i) * k; }
    const armt = g.attributes._armt?.array || new Float32Array(n);
    // centro de cada brazo (para envolver la tela alrededor)
    const armC = { 1: [0, 0, 0], [-1]: [0, 0, 0] };
    for (let i = 0; i < n; i++) if (armt[i]) { const c = armC[Math.sign(armt[i])]; c[0] += xm[i]; c[1] += zm[i]; c[2]++; }
    // centro del tronco (de delante a atrás), medido a la altura del pecho
    let zlo = 1e9, zhi = -1e9; for (let i = 0; i < n; i++) if (!armt[i] && ym[i] > 1.2 && ym[i] < 1.3) { zlo = Math.min(zlo, zm[i]); zhi = Math.max(zhi, zm[i]); }
    const z0 = (zlo + zhi) / 2;
    // centro de cada pierna, medido a la altura de la rodilla
    // centro de cada pierna a cada altura (franjas de 5 cm): las piernas van algo abiertas
    const legBands = { 1: [], [-1]: [] };
    for (const sd of [1, -1]) for (let b = 0; b < 18; b++) {
      let xl = 1e9, xh = -1e9, zl = 1e9, zh = -1e9;
      for (let i = 0; i < n; i++) if (!armt[i] && Math.sign(xm[i]) === sd && ym[i] >= b * 0.05 && ym[i] < b * 0.05 + 0.05) { xl = Math.min(xl, xm[i]); xh = Math.max(xh, xm[i]); zl = Math.min(zl, zm[i]); zh = Math.max(zh, zm[i]); }
      legBands[sd][b] = xh > xl ? [(xl + xh) / 2, (zl + zh) / 2] : legBands[sd][b - 1] || [sd * 0.09, z0];
    }
    const legAt = (sd, y) => legBands[sd][Math.max(0, Math.min(17, Math.floor(y / 0.05)))];
    const legC = { 1: legAt(1, 0.5), [-1]: legAt(-1, 0.5) };
    const uv = new Float32Array(n * 2), TILE = 0.15;
    for (let i = 0; i < n; i++) {
      let cx = 0, r = 0.16;
      if (armt[i]) { const c = armC[Math.sign(armt[i])]; cx = c[0] / c[2]; r = 0.045; }
      let cz = z0;
      if (!armt[i] && ym[i] < 0.84) { [cx, cz] = legAt(xm[i] > 0 ? 1 : -1, ym[i]); r = 0.07; }
      uv[i * 2] = (Math.atan2(xm[i] - cx, zm[i] - cz) * r) / TILE;
      uv[i * 2 + 1] = ym[i] / TILE;
    }
    // perfil del cuerpo por ángulo (pecho, cadera y rodillas): la ropa cae recta desde ahí en vez de pegarse a la piel
    const BINS = 48, bin = (dx, dz) => Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
    const prof = (sel, cx, cz = z0) => { const r = new Float32Array(BINS); for (let i = 0; i < n; i++) if (sel(i)) { const dx = xm[i] - cx, dz = zm[i] - cz, b = bin(dx, dz); r[b] = Math.max(r[b], Math.hypot(dx, dz)); } return r; };
    const chest = prof((i) => !armt[i] && ym[i] > 1.24 && ym[i] < 1.3, 0);
    const hips = prof((i) => !armt[i] && ym[i] > 0.86 && ym[i] < 0.92, 0);
    const knee = { 1: prof((i) => !armt[i] && xm[i] > 0 && ym[i] > 0.47 && ym[i] < 0.53, ...legC[1]), [-1]: prof((i) => !armt[i] && xm[i] < 0 && ym[i] > 0.47 && ym[i] < 0.53, ...legC[-1]) };
    B = { k, ym, xm, zm, z0, armt, uv, index: g.index.array, n, bin, chest, hips, knee, legAt };
  }

  // zona del cuerpo que cubre cada prenda (metros desde el suelo; arm = hasta dónde llega la manga, 1 = muñeca)
  function zoneFor(item, opts) {
    const t = item.type, L = item.layer || layerOf(t), tucked = opts.tucked?.has(item.id);
    const sleeve = { camiseta: 0.3, polo: 0.3, tirantes: 0, "camisa-mc": 0.36, "chaleco-punto": 0, chaleco: 0 }[t] ?? 0.97;
    if (L === "top") {
      const knit = ["jersey", "cardigan", "sudadera", "sudadera-capucha", "chaleco-punto"].includes(t);
      return { y0: tucked ? 0.97 : t.startsWith("camisa") || t === "sobrecamisa" ? 0.84 : 0.87, y1: t.startsWith("camisa") || t === "polo" ? 1.49 : 1.465, arm: sleeve, off: tucked ? 0.004 : knit ? 0.014 : 0.01, drape: tucked ? 0 : knit ? 0.97 : 0.95, order: knit ? 3 : 2 };
    }
    if (L === "outer") {
      const len = { americana: 0.78, abrigo: 0.62, gabardina: 0.55, parka: 0.68, plumifero: 0.82 }[t] ?? 0.86;
      return { y0: len, y1: 1.485, arm: t === "chaleco" ? 0 : 1.0, off: t === "plumifero" ? 0.04 : 0.026, drape: 1.0, order: 5 };
    }
    if (L === "bottom") return { y0: t === "bermuda" ? 0.5 : t === "falda" ? 0.55 : 0.065, y1: 1.02, arm: 0, off: 0.008, leg: t === "jogger" ? 0 : t === "vaquero" ? 0.9 : 0.97, order: 1 };
    if (L === "dress") return { y0: 0.55, y1: 1.5, arm: t === "mono" ? 0.3 : 0.25, off: 0.008, order: 2 };
    if (L === "shoes") return { y0: -1, y1: ["botas", "botines"].includes(t) ? 0.2 : 0.1, arm: 0, off: 0.016, order: 1 };
    if (t === "gorra" || t === "gorro") return { y0: t === "gorro" ? 1.68 : 1.71, y1: 9, arm: 0, off: 0.012, order: 6 };
    if (t === "bufanda") return { y0: 1.42, y1: 1.56, arm: 0, off: 0.03, order: 6 };
    if (t === "cinturon") return { y0: 0.96, y1: 1.0, arm: 0, off: 0.012, order: 6 };
    return null; // reloj, gafas, mochila…: no se ponen en el maniquí
  }

  function shell(item, zone, mat) {
    const { ym, armt, index, k } = B, g0 = bodyMesh.geometry;
    const inZone = (i) => {
      const a = Math.abs(armt[i]);
      if (a) return zone.arm > 0 && a <= zone.arm && ym[i] <= zone.y1 + 0.02;
      return ym[i] >= zone.y0 && ym[i] <= zone.y1;
    };
    const keep = new Uint8Array(B.n); for (let i = 0; i < B.n; i++) keep[i] = inZone(i) ? 1 : 0;
    const idx = [];
    for (let f = 0; f < index.length; f += 3) { const a = index[f], b = index[f + 1], c = index[f + 2]; if (keep[a] && keep[b] && keep[c]) idx.push(a, b, c); }
    if (!idx.length) return null;
    const P = g0.attributes.position.array, N = g0.attributes.normal.array, off = zone.off / k, out = new Float32Array(P.length);
    for (let i = 0; i < P.length; i++) out[i] = P[i] + N[i] * off;
    // caída: empuja hacia fuera hasta el perfil de pecho/cadera (arriba) o de rodilla (pernera recta)
    const { xm, zm, z0, bin } = B, sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const push = (i, cx, prof, amount, ease, cz = z0) => {
      const dx = xm[i] - cx, dz = zm[i] - cz, r = Math.hypot(dx, dz) || 1e-6, want = prof[bin(dx, dz)] * amount + zone.off;
      if (want <= r + zone.off) return;
      const nr = r + zone.off + (want - r - zone.off) * ease;
      out[i * 3] = (cx + (dx / r) * nr) / k; out[i * 3 + 2] = (cz + (dz / r) * nr) / k;
    };
    for (let i = 0; i < B.n; i++) {
      if (!keep[i] || armt[i]) continue;
      if (zone.drape && ym[i] > 0.84 && ym[i] < 1.28) push(i, 0, ym[i] > 0.95 ? B.chest : B.hips, zone.drape, sm(1.28 - ym[i], 0, 0.12));
      if (zone.leg && ym[i] < 0.6) { const sd = xm[i] > 0 ? 1 : -1, [cx, cz] = B.legAt(sd, ym[i]); push(i, cx, B.knee[sd], zone.leg, sm(0.6 - ym[i], 0, 0.1), cz); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(out, 3));
    g.setAttribute("normal", g0.attributes.normal);
    g.setAttribute("uv", new THREE.BufferAttribute(B.uv, 2));
    g.morphAttributes = g0.morphAttributes; g.morphTargetsRelative = g0.morphTargetsRelative;
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(bodyMesh.position); m.quaternion.copy(bodyMesh.quaternion); m.scale.copy(bodyMesh.scale);
    m.morphTargetInfluences = bodyMesh.morphTargetInfluences; m.renderOrder = zone.order; m.frustumCulled = false;
    return m;
  }

  // trozo de tela: el centro de la prenda recortada, repetido en espejo para que no se noten las costuras
  function swatch(img, item) {
    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    const L = item.layer || layerOf(item.type);
    const side = Math.min(W, H) * (L === "shoes" ? 0.22 : 0.24);
    const cy = H * (L === "bottom" ? 0.3 : L === "shoes" ? 0.55 : 0.5);
    g.fillStyle = item.tone || "#888"; g.fillRect(0, 0, 256, 256);
    g.filter = "blur(1.2px) contrast(0.88)";
    g.drawImage(img, W / 2 - side / 2, cy - side / 2, side, side, 0, 0, 256, 256);
    g.filter = "none";
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  const imgCache = new Map();
  async function loadImg(item, getUrl) {
    const key = item.id + ":" + (item.imageVersion || 0);
    if (!imgCache.has(key)) imgCache.set(key, (async () => {
      const url = item.hasImage ? await getUrl(item) : item.thumb;
      if (!url) return null;
      const im = new Image(); im.crossOrigin = "anonymous"; im.src = url; await im.decode(); return im;
    })().catch(() => null));
    return imgCache.get(key);
  }
  async function dressed(item, getUrl, opts) {
    const zone = zoneFor(item, opts); if (!zone) return null;
    const img = await loadImg(item, getUrl);
    const mat = new THREE.MeshStandardMaterial({
      color: img ? 0xffffff : new THREE.Color(item.tone || "#888"), map: img ? swatch(img, item) : null,
      roughness: ["cuero", "nylon"].includes(item.materialKey) ? 0.55 : 0.9, side: THREE.DoubleSide,
    });
    return shell(item, zone, mat);
  }

  // Sin foto: forma de color sencilla
  function plain(item) {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(item.colorHex || "#888"), roughness: 0.85 });
    const cyl = (rt, rb, h, y, x = 0) => { const g = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 32), m); g.position.set(x, y, 0); g.scale.z = 0.76; return g; };
    const g = new THREE.Group();
    if (item.category === "top") g.add(cyl(0.178, 0.15, 0.56, 1.2));
    else if (item.category === "outer") g.add(cyl(0.205, 0.2, item.shape === "abrigo" ? 1.0 : 0.62, item.shape === "abrigo" ? 1.0 : 1.2));
    else if (item.category === "dress") g.add(cyl(0.17, 0.27, 0.95, 1.0));
    else if (item.category === "bottom") {
      if (item.shape === "falda") g.add(cyl(0.155, 0.25, 0.5, 0.75));
      else { g.add(cyl(0.155, 0.16, 0.2, 0.9)); const h = item.shape === "shorts" ? 0.25 : 0.78; [-1, 1].forEach((s) => g.add(cyl(0.078, 0.07, h, 0.82 - h / 2, s * 0.075))); }
    } else if (item.category === "shoes") [-1, 1].forEach((s) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.07, 0.24), m); b.position.set(s * 0.078, 0.035, 0.045); g.add(b); });
    else { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.17, 0.07), m); b.position.set(0.32, 0.8, 0.02); g.add(b); }
    return g;
  }

  let token = 0, worn = [];
  /** Viste el maniquí. opts.tucked = Set de ids de prendas de arriba metidas por dentro. */
  async function show(items, getUrl, opts = {}) {
    const my = ++token;
    const real = await modelReady;
    // formato antiguo para el maniquí sencillo
    items = items.map((it) => ({ ...it, category: it.category || layerOf(it.type), shape: it.shape || it.type, colorHex: it.colorHex || it.tone }));
    const built = await Promise.all(items.map(async (it) => {
      try {
        if (real && B) return await dressed(it, getUrl, opts);
        const t = it.hasImage ? await texture(it, getUrl) : null; return t ? garment(it, t) : plain(it);
      } catch (e) { console.warn(e); return null; }
    }));
    if (my !== token) return; // llegó otra selección mientras cargaba
    clothes.clear(); worn.forEach((m) => m.parent?.remove(m)); worn = [];
    built.forEach((g) => {
      if (!g) return;
      if (real && B) { bodyMesh.parent.add(g); worn.push(g); } else clothes.add(g);
    });
    // una prenda que cubre el cuerpo oculta el maniquí por debajo en esa zona
    draw();
  }

  // ---------- cámara e interacción ----------
  function draw() { cam.position.set(0, 1.0, dist); cam.lookAt(target); renderer.render(scene, cam); }
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); draw();
  }
  let anim = 0;
  function turnTo(angle) {
    cancelAnimationFrame(anim);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = root.rotation.y, to = angle + Math.round((from - angle) / (2 * Math.PI)) * 2 * Math.PI;
    if (reduce) { root.rotation.y = to; draw(); return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3); root.rotation.y = from + (to - from) * e; draw(); if (k < 1) anim = requestAnimationFrame(step); };
    anim = requestAnimationFrame(step);
  }
  const pointers = new Map(); let rot0 = 0, x0 = 0, pinch0 = 0, dist0 = dist;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e);
    if (pointers.size === 1) { rot0 = root.rotation.y; x0 = e.clientX; }
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); dist0 = dist; }
    cancelAnimationFrame(anim);
  });
  stage.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId, e);
    if (pointers.size === 1) { root.rotation.y = rot0 + (e.clientX - x0) * 0.012; draw(); }
    else if (pointers.size === 2 && pinch0) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); dist = clamp(dist0 * pinch0 / d, 2.2, 7); draw(); }
  });
  const up = (e) => { pointers.delete(e.pointerId); if (pointers.size === 1) { const p = [...pointers.values()][0]; rot0 = root.rotation.y; x0 = p.clientX; } };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("wheel", (e) => { e.preventDefault(); dist = clamp(dist + e.deltaY * 0.003, 2.2, 7); draw(); }, { passive: false });
  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { root.rotation.y -= 0.25; draw(); }
    if (e.key === "ArrowRight") { root.rotation.y += 0.25; draw(); }
  });
  new ResizeObserver(resize).observe(stage);

  /** Proporciones del usuario: altura en cm y complexión (delgada|media|atletica|robusta). */
  // Con el modelo 3D la complexión cambia la forma del cuerpo (morph targets); con el sencillo, se estira.
  const BUILD = { delgada: [0.9, 0.92], media: [1, 1], atletica: [1.1, 1.02], robusta: [1.14, 1.16] };
  const MORPHS = ["delgada", "atletica", "robusta"];
  function setBody({ heightCm = 178, build = "media" } = {}) {
    bodyShape = { heightCm, build };
    const h = clamp(heightCm, 140, 210) / 178;
    if (model) {
      model.traverse((o) => { if (o.morphTargetInfluences) MORPHS.forEach((m, i) => (o.morphTargetInfluences[i] = m === build ? 1 : 0)); });
      root.scale.setScalar(h); shadow.scale.setScalar(build === "robusta" ? 1.15 : 1);
    } else {
      const [w, d] = BUILD[build] || BUILD.media;
      root.scale.set(w, h, d); shadow.scale.set(w, 1, d);
    }
    target.y = 0.95 * h; draw();
  }

  // giro lento cuando nadie lo toca
  let idle = 0, idleOn = false;
  function autoRotate(on) {
    idleOn = on && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    cancelAnimationFrame(idle);
    if (!idleOn) return;
    let last = performance.now();
    const loop = (t) => { if (!pointers.size) { root.rotation.y += (t - last) * 0.00035; draw(); } last = t; idle = requestAnimationFrame(loop); };
    idle = requestAnimationFrame(loop);
  }
  const dispose = () => { cancelAnimationFrame(idle); cancelAnimationFrame(anim); renderer.dispose(); renderer.domElement.remove(); };

  return { show, resize, setBody, autoRotate, dispose, front: () => turnTo(0), back: () => turnTo(Math.PI), spin: (a) => turnTo(root.rotation.y + a) };
}
