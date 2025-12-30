import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/* ================= FIREBASE CONFIG ================= */
/* ⚠️ THESE VALUES MUST COME FROM THE SAME PROJECT */
const firebaseConfig = {
  apiKey: "AIzaSyCqTh8CVvqNVx1AG0cbeOujL3DL46Y50mA",
  authDomain: "word-search-app-79dee.firebaseapp.com",
  projectId: "word-search-app-79dee",
  storageBucket: "word-search-app-79dee.firebasestorage.app",
  messagingSenderId: "185782714778",
  appId: "1:185782714778:web:3964c9c888c26f511eba23"
};
/* ================= APP INIT (HMR SAFE) ================= */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* ================= AUTH ================= */
export const auth = getAuth(app);

// ✅ Required for login persistence across refresh / devices
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error("Auth persistence error:", err);
});

/* ================= FIRESTORE ================= */
export const db = getFirestore(app);
