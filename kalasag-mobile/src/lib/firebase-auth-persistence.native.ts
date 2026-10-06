import AsyncStorage from "@react-native-async-storage/async-storage";
import { FirebaseApp, FirebaseError } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";

export function initializeFirebaseAuth(app: FirebaseApp) {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === "auth/already-initialized") {
      return getAuth(app);
    }
    throw error;
  }
}
