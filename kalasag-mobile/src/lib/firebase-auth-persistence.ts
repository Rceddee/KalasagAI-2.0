import { getAuth } from "firebase/auth";
import { FirebaseApp } from "firebase/app";

export function initializeFirebaseAuth(app: FirebaseApp) {
  return getAuth(app);
}
