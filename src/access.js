// Acceso a la app (como en el Diario de alineadores): cualquiera se registra, pide acceso y un administrador
// (Polete) lo aprueba, lo deniega o se lo quita desde Perfil. Sin aprobar, la app enseña una pantalla de espera.
import { auth, accessDoc, accessCol, setDoc, onSnapshot, updateDoc, deleteDoc } from "./firebase.js";

const ADMINS = ["gyhrn5U6V7cFslqwDzabTPxEu0w2"];
export const isAdmin = () => ADMINS.includes(auth.currentUser?.uid);

/** Escucha el estado de acceso de la cuenta actual: cb("aprobado"|"pendiente"|"denegado"). Crea la petición si no existe. */
export function watchAccess(cb) {
  const u = auth.currentUser; if (!u) return () => {};
  if (isAdmin()) { cb("aprobado"); return () => {}; }
  let created = false;
  return onSnapshot(accessDoc(u.uid), async (s) => {
    if (!s.exists()) {
      if (created) return; created = true;
      try { await setDoc(accessDoc(u.uid), { status: "pendiente", email: u.email || "", name: u.displayName || "", requestedAt: Date.now() }); }
      catch (e) { console.warn("petición de acceso", e); cb("pendiente"); }
      return;
    }
    cb(s.data().status || "pendiente");
  }, (e) => { console.warn("acceso", e); cb("error"); });
}

/** Lista de cuentas (solo administradores). */
export const watchAccessList = (cb) => onSnapshot(accessCol(), (s) => cb(s.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => (a.status === "pendiente" ? -1 : 0) - (b.status === "pendiente" ? -1 : 0) || (b.requestedAt || 0) - (a.requestedAt || 0))), () => cb(null));
export const setAccess = (uid, status) => updateDoc(accessDoc(uid), { status, decidedAt: Date.now() });
export const removeAccess = (uid) => deleteDoc(accessDoc(uid));
