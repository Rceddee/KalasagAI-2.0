import { db, auth } from "./firebase";
import { collection, addDoc, doc, getDoc, Timestamp } from "firebase/firestore";

/**
 * Resolves the current user's display name.
 * Priority: Firestore personnel doc name → Firebase Auth displayName → fallback.
 */
async function resolveActorName(user) {
  // 1. Try Firestore personnel document (always has the real name)
  if (user?.email) {
    try {
      const personnelSnap = await getDoc(
        doc(db, "personnel", user.email.trim().toLowerCase())
      );
      if (personnelSnap.exists()) {
        const name = personnelSnap.data().name;
        if (name) return name;
      }
    } catch {
      // Firestore read failed — fall through to other sources
    }
  }

  // 2. Firebase Auth displayName (populated for Google Sign-In users)
  if (user?.displayName) return user.displayName;

  // 3. Last resort
  return "Unknown Operator";
}

export async function logSystemAction(action, details) {
  try {
    const user = auth.currentUser;
    const actor_name = user ? await resolveActorName(user) : "System";
    const actor_email = user
      ? user.email || "unknown@kalasag.gov.ph"
      : "system@kalasag.gov.ph";

    const logEntry = {
      action,
      details,
      actor_name,
      actor_email,
      timestamp: Timestamp.now(),
    };

    await addDoc(collection(db, "system_logs"), logEntry);
    console.log(`[LOGGED ACTION]: ${action} - ${details}`);
  } catch (error) {
    console.error("Failed to write system log:", error);
  }
}
