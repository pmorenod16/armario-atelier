import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, GoogleAuthProvider, signInWithPopup, signInWithCredential,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot, writeBatch, updateDoc, increment,
} from "firebase/firestore";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.apiKey).includes("PEGA_AQUI");

const app = initializeApp(configured ? firebaseConfig : { apiKey: "x", projectId: "x", appId: "x" });

// initializeAuth (no getAuth) para que funcione dentro del WebView de Android sin ventanas emergentes.
const native = Capacitor.isNativePlatform();
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  // En el ordenador hace falta para la ventana de Google; en Android se usa el inicio de sesión nativo
  ...(native ? {} : { popupRedirectResolver: browserPopupRedirectResolver }),
});

// Caché local: el armario se ve aunque no haya conexión.
let cache;
try { cache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch { cache = undefined; }
export const fs = initializeFirestore(app, cache ? { localCache: cache } : {});

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const logIn = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const register = (e, p) => createUserWithEmailAndPassword(auth, e, p);
export const resetPassword = (e) => sendPasswordResetEmail(auth, e);
export const logOut = async () => {
  if (native) { try { await FirebaseAuthentication.signOut(); } catch {} }
  return signOut(auth);
};

/** Entrar con Google: ventana de Google en el ordenador, selector de cuentas nativo en Android. */
export async function logInWithGoogle() {
  if (!native) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return signInWithPopup(auth, provider);
  }
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result?.credential?.idToken;
  if (!idToken) throw { code: "auth/google-cancelled" };
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

// Rutas de datos: todo bajo users/{uid}
const base = () => `users/${auth.currentUser.uid}`;
export const itemsRef = () => collection(fs, `${base()}/items`);
export const metaDoc = (name) => doc(fs, `${base()}/meta/${name}`);
export const imageDoc = (id) => doc(fs, `${base()}/images/${id}`);
export const newItemId = () => doc(itemsRef()).id;
export const userCol = (name) => collection(fs, `${base()}/${name}`);

export const accessDoc = (uid) => doc(fs, `access/${uid}`);
export const accessCol = () => collection(fs, "access");
export { doc, setDoc, deleteDoc, getDoc, getDocs, onSnapshot, writeBatch, updateDoc, increment };
