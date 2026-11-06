import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence,
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, writeBatch,
} from "firebase/firestore";
import { firebaseConfig } from "./config.js";

export const configured = !String(firebaseConfig.apiKey).includes("PEGA_AQUI");

const app = initializeApp(configured ? firebaseConfig : { apiKey: "x", projectId: "x", appId: "x" });

// initializeAuth (no getAuth) para que funcione dentro del WebView de Android sin ventanas emergentes.
export const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] });

// Caché local: el armario se ve aunque no haya conexión.
let cache;
try { cache = persistentLocalCache({ tabManager: persistentMultipleTabManager() }); } catch { cache = undefined; }
export const fs = initializeFirestore(app, cache ? { localCache: cache } : {});

export const watchAuth = (cb) => onAuthStateChanged(auth, cb);
export const logIn = (e, p) => signInWithEmailAndPassword(auth, e, p);
export const register = (e, p) => createUserWithEmailAndPassword(auth, e, p);
export const resetPassword = (e) => sendPasswordResetEmail(auth, e);
export const logOut = () => signOut(auth);

// Rutas de datos: todo bajo users/{uid}
const base = () => `users/${auth.currentUser.uid}`;
export const itemsRef = () => collection(fs, `${base()}/items`);
export const outfitsRef = () => collection(fs, `${base()}/outfits`);
export const metaDoc = (name) => doc(fs, `${base()}/meta/${name}`);
export const imageDoc = (id) => doc(fs, `${base()}/images/${id}`);
export const newItemId = () => doc(itemsRef()).id;

export { collection, doc, setDoc, deleteDoc, getDoc, onSnapshot, writeBatch };
