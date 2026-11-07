// Probador 3D: maniquí con las fotos recortadas de tus prendas.
// Cada prenda es una superficie curva que envuelve el cuerpo: delante la foto,
// detrás la misma foto en espejo y más oscura (la espalda de la prenda).
import * as THREE from "three";

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
  const skin = new THREE.MeshStandardMaterial({ color: 0xe6e1d8, roughness: 0.5, metalness: 0.02 });
  const body = new THREE.Group(); root.add(body);
  const torsoProfile = [
    [0, 0.8], [0.1, 0.8], [0.145, 0.84], [0.156, 0.92], [0.148, 1.0], [0.128, 1.08], [0.134, 1.16],
    [0.157, 1.26], [0.17, 1.36], [0.165, 1.42], [0.13, 1.47], [0.06, 1.5], [0.048, 1.57], [0, 1.58],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 48), skin);
  torso.scale.z = 0.7; body.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 40, 28), skin);
  head.scale.set(0.86, 1.16, 0.96); head.position.y = 1.68; body.add(head);
  const limb = (rt, rb, h, x, y, rz = 0) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 28), skin);
    m.position.set(x, y, 0); m.rotation.z = rz; body.add(m); return m;
  };
  [-1, 1].forEach((s) => {
    limb(0.068, 0.04, 0.8, s * 0.075, 0.42);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.04, 0.2), skin); foot.position.set(s * 0.078, 0.02, 0.04); body.add(foot);
    limb(0.044, 0.03, 0.66, s * 0.225, 1.1, s * 0.1);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.038, 20, 14), skin); hand.scale.y = 1.4; hand.position.set(s * 0.258, 0.73, 0); body.add(hand);
  });

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

  let token = 0;
  async function show(items, getUrl) {
    const my = ++token;
    const built = await Promise.all(items.map(async (it) => {
      try { const t = it.hasImage ? await texture(it, getUrl) : null; return t ? garment(it, t) : plain(it); }
      catch { return plain(it); }
    }));
    if (my !== token) return; // llegó otra selección mientras cargaba
    clothes.clear(); built.forEach((g) => g && clothes.add(g));
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
  const BUILD = { delgada: [0.9, 0.92], media: [1, 1], atletica: [1.1, 1.02], robusta: [1.14, 1.16] };
  function setBody({ heightCm = 178, build = "media" } = {}) {
    const [w, d] = BUILD[build] || BUILD.media, h = clamp(heightCm, 140, 210) / 178;
    root.scale.set(w, h, d); shadow.scale.set(w, 1, d);
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
