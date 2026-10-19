import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirebaseConfig } from "./config";

export function getFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(getFirebaseConfig());
}

/** Client-only Firebase Auth instance (default IndexedDB persistence). */
export function getFirebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}
