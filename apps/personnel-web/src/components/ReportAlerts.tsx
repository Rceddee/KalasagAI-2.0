"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { CloseIcon, VolumeIcon, VolumeMuteIcon } from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { listenForNewReports } from "@/lib/report-alerts";
import { getSupabase } from "@/lib/supabase";

function chime(context: AudioContext) {
  const tone = context.createOscillator();
  const gain = context.createGain();
  const now = context.currentTime;
  tone.connect(gain);
  gain.connect(context.destination);
  tone.frequency.setValueAtTime(660, now);
  tone.frequency.setValueAtTime(880, now + 0.15);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
  tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  tone.start(now);
  tone.stop(now + 0.45);
}

export function ReportAlerts() {
  const [notice, setNotice] = useState<{ id: string; reference: string; count: number } | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const soundButton = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  const enableSound = useCallback(async (preview: boolean) => {
    const Audio = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Audio) throw new Error("Audio unavailable");
    const context = audio.current ??= new Audio();
    context.onstatechange = () => setSoundOn(context.state === "running");
    await context.resume();
    if (audio.current === context && context.state === "running") {
      setSoundOn(true);
      if (preview) chime(context);
    }
  }, []);

  useEffect(() => {
    // Browsers can unlock audio on a staff member's first dashboard interaction.
    const gestures = new AbortController();
    const unlock = (event: Event) => {
      if (!event.isTrusted) return;
      gestures.abort();
      if (event.target instanceof Node && soundButton.current?.contains(event.target)) return;
      try {
        if (sessionStorage.getItem("personnel-alerts-muted") === "true") return;
      } catch { /* Storage is optional for audio playback. */ }
      void enableSound(false).catch(() => { /* The sound button allows another attempt. */ });
    };
    window.addEventListener("click", unlock, { signal: gestures.signal });
    window.addEventListener("keydown", unlock, { signal: gestures.signal });
    return () => gestures.abort();
  }, [enableSound]);

  useEffect(() => {
    const unsubscribe = listenForNewReports(getSupabase(), (reports) => {
      const latest = reports[reports.length - 1];
      setNotice((current) => ({ id: latest.id, reference: latest.reference, count: (current?.count ?? 0) + reports.length }));
      if (audio.current?.state === "running") chime(audio.current);
    });
    return () => {
      unsubscribe();
      const context = audio.current;
      audio.current = null;
      if (context) {
        context.onstatechange = null;
        void context.close();
      }
    };
  }, []);

  async function toggleSound() {
    try {
      if (soundOn && audio.current) {
        await audio.current.suspend();
        setSoundOn(false);
      } else {
        await enableSound(true);
      }
      try {
        sessionStorage.setItem("personnel-alerts-muted", String(soundOn));
      } catch { /* The selection still applies for this dashboard session. */ }
    } catch {
      toast.error("Could not enable alert sound. Check the browser's sound settings.");
    }
  }

  const soundLabel = soundOn ? "Mute alert sound" : "Enable alert sound";
  return (
    <>
      <button ref={soundButton} className="btn btn-google report-sound-toggle" type="button" title={soundLabel}
        aria-label={soundLabel} onClick={() => void toggleSound()}>
        {soundOn ? <VolumeIcon size={16} /> : <VolumeMuteIcon size={16} />}
        <span className="sidebar-action-label">{soundLabel}</span>
      </button>
      {notice && createPortal(
        <aside className="new-report-notice" aria-label="New report notification">
          <strong role="status">{notice.count === 1 ? `New report · ${notice.reference}` : `${notice.count} new reports`}</strong>
          <Link href={notice.count === 1 ? `/dashboard/blotters/${notice.id}` : "/dashboard/blotters"}
            onClick={() => setNotice(null)}>{notice.count === 1 ? "View report" : "View reports"}</Link>
          <button type="button" aria-label="Dismiss report notification" onClick={() => setNotice(null)}><CloseIcon size={16} /></button>
        </aside>, document.body
      )}
    </>
  );
}
