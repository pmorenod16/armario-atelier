# Uso: python3 scripts/mh2glb.py <makehuman/data de github.com/makehumancommunity/makehuman> public/models/maniqui.glb
# Construye el maniquí masculino a partir de la malla base CC0 de MakeHuman y lo exporta a GLB
# con 3 morph targets (delgada, atletica, robusta) respecto a la complexión media.
import sys, json, struct, numpy as np
R, OUT = sys.argv[1], sys.argv[2]
V, faces, g, groups = [], [], None, {}
for ln in open(f"{R}/3dobjs/base.obj"):
    if ln.startswith("v "): V.append([float(x) for x in ln.split()[1:4]])
    elif ln.startswith("g "): g = ln.split()[1]
    elif ln.startswith("f "):
        f = [int(p.split("/")[0]) - 1 for p in ln.split()[1:]]
        groups.setdefault(g, set()).update(f)
        if g in ("body", "helper-l-eye", "helper-r-eye"): faces.append(f)
V = np.array(V, dtype=np.float64)
def target(name):
    d = np.zeros_like(V)
    for ln in open(f"{R}/targets/macrodetails/{name}.target"):
        if ln[0] in "#\n": continue
        p = ln.split(); d[int(p[0])] = [float(x) for x in p[1:4]]
    return d
races = sum(target(f"{r}-male-young") for r in ("african", "asian", "caucasian")) / 3
def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
W = {}
def lower_arms(P, deg=33):
    # baja los brazos de la postura en A a una postura de maniquí (brazos junto al cuerpo)
    P = P.copy()
    for side in "lr":
        sh = P[list(groups[f"joint-{side}-shoulder"])].mean(0); hd = P[list(groups[f"joint-{side}-hand"])].mean(0)
        d = (hd - sh)[:2]; d /= np.linalg.norm(d)
        rel = P[:, :2] - sh[:2]; proj = rel @ d; perp = np.abs(rel[:, 0] * d[1] - rel[:, 1] * d[0])
        if side not in W: W[side] = smooth(proj, -0.2, 1.3) * (1 - smooth(perp, 0.8, 1.2))
        a = np.radians(deg) * W[side] * (1 if d[0] > 0 else -1)  # hacia el cuerpo
        c, s_ = np.cos(a), np.sin(a)
        x, y = rel[:, 0], rel[:, 1]
        P[:, 0] = sh[0] + c * x + s_ * y; P[:, 1] = sh[1] - s_ * x + c * y
    return P
def build(muscle, weight):
    return lower_arms(V + races + target(f"universal-male-young-{muscle}muscle-{weight}weight"))
B = {"media": build("average", "average"), "delgada": build("average", "min"),
     "atletica": build("max", "average"), "robusta": build("average", "max")}
# solo los vértices usados, triángulos
used = sorted({i for f in faces for i in f}); remap = {o: n for n, o in enumerate(used)}
tris = []
for f in faces:
    f = [remap[i] for i in f]
    tris += [[f[0], f[1], f[2]]] + ([[f[0], f[2], f[3]]] if len(f) == 4 else [])
T = np.array(tris, dtype=np.uint32)
def normals(P):
    n = np.zeros_like(P); fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3): np.add.at(n, T[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
P = {k: v[used].astype(np.float32) for k, v in B.items()}
N = {k: normals(v).astype(np.float32) for k, v in P.items()}
base, bn = P["media"], N["media"]
# GLB
blobs, views, accs = [], [], []
def add(arr, target=None, minmax=False, comp=5126, typ="VEC3"):
    off = sum(len(b) for b in blobs); raw = arr.tobytes(); pad = (-len(raw)) % 4
    blobs.append(raw + b"\0" * pad)
    v = {"buffer": 0, "byteOffset": off, "byteLength": len(raw)}
    if target: v["target"] = target
    views.append(v)
    a = {"bufferView": len(views) - 1, "componentType": comp, "count": len(arr) if typ != "SCALAR" else arr.size, "type": typ}
    if minmax: a["min"] = arr.min(0).tolist(); a["max"] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
pos = add(base, 34962, True); nor = add(bn, 34962); idx = add(T.reshape(-1), 34963, comp=5125, typ="SCALAR")
names = ["delgada", "atletica", "robusta"]
targets = [{"POSITION": add(P[k] - base, 34962, True), "NORMAL": add(N[k] - bn, 34962)} for k in names]
gl = {"asset": {"version": "2.0", "generator": "armario-atelier mh2glb", "copyright": "CC0 — malla base de MakeHuman"},
      "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0, "name": "maniqui"}],
      "meshes": [{"name": "maniqui", "primitives": [{"attributes": {"POSITION": pos, "NORMAL": nor}, "indices": idx, "material": 0, "targets": targets}],
                  "weights": [0, 0, 0], "extras": {"targetNames": names}}],
      "materials": [{"name": "maniqui", "pbrMetallicRoughness": {"baseColorFactor": [0.9, 0.88, 0.84, 1], "metallicFactor": 0, "roughnessFactor": 0.45}}],
      "buffers": [{"byteLength": sum(len(b) for b in blobs)}], "bufferViews": views, "accessors": accs}
js = json.dumps(gl).encode(); js += b" " * ((-len(js)) % 4); bin_ = b"".join(blobs)
out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(bin_), 0x004E4942) + bin_
open(OUT, "wb").write(out)
print("vértices", len(base), "triángulos", len(T), "altura", float(base[:, 1].max() - base[:, 1].min()), "bytes", len(out))
