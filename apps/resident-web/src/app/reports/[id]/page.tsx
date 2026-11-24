"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Image from "next/image";
import { ResidentShell } from "@/components/ResidentShell";
import { useResidentAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import {
  FileIcon,
  PinIcon,
  AlertIcon,
  ClockIcon,
} from "@/components/Icons";
import type { IncidentHistoryEntry, ResidentIncident } from "@/lib/types";

function getStatusStyle(status: string) {
  switch (status) {
    case "in_progress":
      return { label: "IN PROGRESS", className: "status-tag-responding" };
    case "resolved":
    case "closed":
      return { label: "COMPLETED", className: "status-tag-completed" };
    default:
      return { label: "RECEIVED", className: "status-tag-received" };
  }
}

export default function IncidentDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useResidentAuth();
  const userId = user?.id;

  const [incident, setIncident] = useState<ResidentIncident | null>(null);
  const [review, setReview] = useState<{ confirmed_category: string; confirmed_priority: string | null } | null | undefined>();
  const [history, setHistory] = useState<IncidentHistoryEntry[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [loadedFor, setLoadedFor] = useState<{ userId: string; incidentId: string } | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const requestId = useRef(0);
  const requestKey = `${userId ?? ""}:${id ?? ""}`;
  const error = loadError?.key === requestKey ? loadError.message : "";
  const hasCurrentDetails = loadedFor !== null
    && loadedFor.userId === userId
    && loadedFor.incidentId === id
    && incident?.id === id;

  const loadDetails = useCallback(async (refresh = false) => {
    if (!userId || !id) return;
    const currentRequestId = ++requestId.current;
    setRefreshing(refresh);
    setLoadError(null);

    try {
      const supabase = getSupabase();
      const { data, error: incidentErr } = await supabase
        .from("incidents")
        .select("id, reference, description, location_label, latitude, longitude, status, created_at")
        .eq("id", id)
        .eq("resident_id", userId)
        .single();

      if (incidentErr) throw incidentErr;

      const [
        { data: historyRows, error: historyError },
        { data: photos, error: photosError },
        reviewResult,
      ] = await Promise.all([
        supabase
          .from("incident_status_history")
          .select("id, from_status, to_status, note, created_at")
          .eq("incident_id", id)
          .order("created_at", { ascending: true }),
        supabase
          .from("incident_photos")
          .select("storage_path")
          .eq("incident_id", id)
          .limit(1),
        supabase.rpc("my_report_review", { p_incident_id: id }).maybeSingle<{ confirmed_category: string; confirmed_priority: string | null }>(),
      ]);

      if (historyError) throw historyError;
      if (photosError) throw photosError;

      let nextPhotoUrl = "";
      if (photos?.[0]) {
        const { data: signed, error: signedUrlError } = await supabase.storage
          .from("incident-evidence")
          .createSignedUrl(photos[0].storage_path, 3600);
        if (signedUrlError) throw signedUrlError;
        nextPhotoUrl = signed?.signedUrl ?? "";
      }

      if (requestId.current !== currentRequestId) return;
      setIncident(data as ResidentIncident);
      setHistory((historyRows || []) as IncidentHistoryEntry[]);
      setPhotoUrl(nextPhotoUrl);
      setReview(reviewResult.error ? undefined : reviewResult.data);
      setLastRefreshedAt(new Date());
      setLoadedFor({ userId, incidentId: id });
    } catch (err: unknown) {
      console.error("Failed to load incident detail:", err);
      if (requestId.current === currentRequestId) {
        const isNotFound = (err as { code?: string })?.code === "PGRST116" ||
          (err instanceof Error && err.message.includes("JSON object requested"));
        setLoadError({
          key: `${userId}:${id}`,
          message: isNotFound
            ? "Report not found or unavailable."
            : (err instanceof Error ? err.message : "Could not load report details."),
        });
      }
    } finally {
      if (requestId.current === currentRequestId) {
        setRefreshing(false);
      }
    }
  }, [id, userId]);

  useEffect(() => {
    if (!userId || !id) {
      requestId.current += 1;
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) void loadDetails();
    });
    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [id, loadDetails, userId]);

  if (!userId) {
    return (
      <ResidentShell>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Sign in to view this report.
        </div>
      </ResidentShell>
    );
  }

  if (!hasCurrentDetails && !error) {
    return (
      <ResidentShell>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading incident details…
        </div>
      </ResidentShell>
    );
  }

  if (!hasCurrentDetails || !incident) {
    return (
      <ResidentShell>
        <div style={{ padding: "30px 20px", textAlign: "center" }}>
          <AlertIcon size={32} color="var(--color-red)" style={{ margin: "0 auto 12px", display: "block" }} />
          <h2 style={{ fontSize: "16px", color: "var(--text-primary)" }}>{error || "Report not found"}</h2>
          <Link href="/reports" className="btn-submit-emergency" style={{ width: "auto", display: "inline-block", margin: "16px auto", padding: "10px 20px" }}>
            Return to My Reports
          </Link>
        </div>
      </ResidentShell>
    );
  }

  const statusInfo = getStatusStyle(incident.status);

  return (
    <ResidentShell>
      <div style={{ padding: "16px" }}>
        {/* Navigation Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <Link href="/reports" style={{ color: "var(--color-blue)", textDecoration: "none", fontSize: "13px", fontWeight: "700" }}>
            ← Back to My Reports
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className={statusInfo.className} aria-label={`Operational status: ${statusInfo.label}`}>
              {statusInfo.label}
            </span>
            <button
              type="button"
              onClick={() => void loadDetails(true)}
              disabled={refreshing}
              aria-label="Refresh incident status and history"
              style={{ border: "1px solid var(--glass-border)", borderRadius: "8px", padding: "8px 10px", background: "var(--bg-secondary)", color: "var(--color-blue)", fontSize: "12px", fontWeight: 700, cursor: refreshing ? "default" : "pointer" }}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ marginBottom: "16px", padding: "12px", borderRadius: "10px", background: "rgba(229, 57, 53, 0.12)", color: "var(--text-danger)", fontSize: "12px" }}>
            The latest status could not be refreshed: {error}
          </div>
        )}

        {/* Main Card */}
        <div className="resident-content-card" style={{ margin: 0, marginBottom: "16px" }}>
          <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
            OFFICIAL REFERENCE
          </span>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: "var(--text-primary)", margin: "4px 0 12px" }}>
            {incident.reference}
          </h1>
          <p>Reviewed category: {review === undefined ? "Unavailable" : review?.confirmed_category.replaceAll("_", " ") ?? "Awaiting review"}</p>
          {review?.confirmed_priority && <p>Reviewed priority: {review.confirmed_priority}</p>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "12px", borderTop: "1px solid var(--glass-border)", paddingTop: "12px" }}>
            <div>
              <span style={{ color: "var(--text-muted)", display: "block" }}>Date Filed</span>
              <strong style={{ color: "var(--text-primary)" }}>
                {new Date(incident.created_at).toLocaleString("en-PH")}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--text-muted)", display: "block" }}>Location</span>
              <strong style={{ color: "var(--text-primary)" }}>{incident.location_label}</strong>
            </div>
          </div>
        </div>

        {/* Narrative Description */}
        <div className="resident-content-card" style={{ margin: 0, marginBottom: "16px" }}>
          <h2 className="resident-card-title">
            <FileIcon size={18} color="var(--color-blue)" />
            <span>Incident Description</span>
          </h2>
          <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--text-secondary)" }}>
            {incident.description}
          </p>
        </div>

        {/* Photo Evidence */}
        {photoUrl && (
          <div className="resident-content-card" style={{ margin: 0, marginBottom: "16px" }}>
            <h2 className="resident-card-title">
              <PinIcon size={18} color="var(--color-green)" />
              <span>Uploaded Photo Evidence</span>
            </h2>
            <div style={{ width: "100%", height: "220px", borderRadius: "12px", overflow: "hidden", border: "1px solid var(--glass-border)" }}>
              <Image src={photoUrl} alt="Incident evidence" width={800} height={600} unoptimized style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          </div>
        )}

        {/* Response History & Timeline */}
        <div className="resident-content-card" style={{ margin: 0, marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <h2 className="resident-card-title" style={{ margin: 0 }}>
              <ClockIcon size={18} color="var(--color-yellow)" />
              <span>Status History</span>
            </h2>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "var(--color-blue)", background: "rgba(30, 136, 229, 0.12)", padding: "2px 8px", borderRadius: "4px" }}>
              {lastRefreshedAt ? `CHECKED ${lastRefreshedAt.toLocaleTimeString("en-PH")}` : "STATUS SNAPSHOT"}
            </span>
          </div>
          <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "0 0 14px" }}>
            Status and history are shown from the last server refresh. Tap Refresh to check for updates.
          </p>

          <div style={{ position: "relative", paddingLeft: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Vertical connector line */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                bottom: "10px",
                left: "7px",
                width: "2px",
                background: "var(--glass-border)",
              }}
            />

            {/* Step 1: Submission */}
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: "-24px",
                  top: "2px",
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: "var(--color-blue)",
                  border: "3px solid var(--bg-secondary)",
                  boxShadow: "0 0 0 2px var(--color-blue)",
                }}
              />
              <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                Report Received by MDRRMO
              </strong>
              <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0" }}>
                {new Date(incident.created_at).toLocaleString("en-PH")}
              </p>
            </div>

            {/* Status updates from history */}
            {history.map((h, idx) => {
              const isLatest = idx === history.length - 1;
              const isResolved = h.to_status === "resolved" || h.to_status === "closed";
              const dotColor = isResolved ? "var(--color-green)" : "var(--color-orange)";

              return (
                <div key={h.id} style={{ position: "relative" }}>
                  <div
                    style={{
                      position: "absolute",
                      left: "-24px",
                      top: "2px",
                      width: "16px",
                      height: "16px",
                      borderRadius: "50%",
                      background: dotColor,
                      border: "3px solid var(--bg-secondary)",
                      boxShadow: isLatest ? `0 0 0 3px ${dotColor}50` : `0 0 0 2px ${dotColor}`,
                    }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)", textTransform: "capitalize" }}>
                      Status: {h.to_status.replace("_", " ")}
                    </strong>
                    {isLatest && (
                      <span style={{ fontSize: "10px", fontWeight: "700", background: "var(--color-green)", color: "#fff", padding: "1px 6px", borderRadius: "4px" }}>
                        CURRENT
                      </span>
                    )}
                  </div>
                  {h.note && (
                    <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "3px 0 2px" }}>
                      {h.note}
                    </p>
                  )}
                  <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
                    {new Date(h.created_at).toLocaleString("en-PH")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ResidentShell>
  );
}
