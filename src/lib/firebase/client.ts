import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { firebaseConfig } from "./config";

function firebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/** Client-only Firebase Auth instance (default IndexedDB persistence). */
export function getFirebaseAuth(): Auth {
  return getAuth(firebaseApp());
}
