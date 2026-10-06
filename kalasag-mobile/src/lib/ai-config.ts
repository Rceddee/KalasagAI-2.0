import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type AiControls = {
  threshold: number;
  surgeMode: boolean;
};

export const DEFAULT_AI_CONTROLS: AiControls = {
  threshold: 70,
  surgeMode: false,
};

function normalize(raw: Partial<AiControls> | undefined): AiControls {
  const threshold = Number(raw?.threshold);
  return {
    threshold: Number.isFinite(threshold)
      ? Math.round(Math.min(95, Math.max(50, threshold)) / 5) * 5
      : DEFAULT_AI_CONTROLS.threshold,
    surgeMode: Boolean(raw?.surgeMode),
  };
}

export async function getAiControls(): Promise<AiControls> {
  try {
    const snap = await getDoc(doc(db, "system_config", "ai_controls"));
    return snap.exists() ? normalize(snap.data() as Partial<AiControls>) : DEFAULT_AI_CONTROLS;
  } catch (error) {
    console.error("Could not load shared AI controls:", error);
    throw new Error("Could not load shared incident settings. Check your connection and try again.");
  }
}

export function shouldAutoFlag(confidence: number, threshold: number): boolean {
  const score = Number(confidence);
  return Number.isFinite(score) && score * 100 < threshold;
}
