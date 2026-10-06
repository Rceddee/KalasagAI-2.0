import { db } from "./firebase";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";

export const DEFAULT_AI_CONTROLS = {
  threshold: 70,
  surgeMode: false,
};

export function normalizeAiControls(raw) {
  const threshold = Number(raw?.threshold);
  return {
    threshold: Number.isFinite(threshold)
      ? Math.round(Math.min(95, Math.max(50, threshold)) / 5) * 5
      : DEFAULT_AI_CONTROLS.threshold,
    surgeMode: Boolean(raw?.surgeMode),
  };
}

export function subscribeAiControls(onChange, onError) {
  return onSnapshot(doc(db, "system_config", "ai_controls"), (snap) => {
    onChange(snap.exists() ? normalizeAiControls(snap.data()) : DEFAULT_AI_CONTROLS);
  }, onError);
}

export async function saveAiControls(controls) {
  const payload = normalizeAiControls(controls);
  await setDoc(doc(db, "system_config", "ai_controls"), {
    ...payload,
    updated_at: serverTimestamp(),
  });
  return payload;
}
