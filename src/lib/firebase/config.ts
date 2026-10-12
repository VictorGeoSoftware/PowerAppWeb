// Firebase web app config, set per environment via NEXT_PUBLIC_FIREBASE_* (see .env.example).
// These values are public identifiers inlined into the client bundle at build time;
// they are kept out of git only to avoid committing them. Protection relies on API key
// restrictions in Google Cloud plus Firebase Auth / backend token checks.
// Each process.env access must be literal so Next.js can inline it.
const env = {
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function required(name: keyof typeof env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is not set (copy .env.example to .env.local)`);
  return value;
}

/** Resolved lazily so builds/tests that never touch Firebase don't need the vars. */
export function getFirebaseConfig() {
  return {
    apiKey: required("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: required("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: required("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: required("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: required("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: required("NEXT_PUBLIC_FIREBASE_APP_ID"),
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
  };
}
