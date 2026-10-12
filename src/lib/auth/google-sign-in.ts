import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, type Auth } from "firebase/auth";

/**
 * Popup first (works in iOS Safari and Android Chrome when triggered by a tap);
 * falls back to a full-page redirect only when the browser blocks the popup.
 */
export async function signInWithGoogle(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    if ((error as { code?: string })?.code === "auth/popup-blocked") {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw error;
  }
}
