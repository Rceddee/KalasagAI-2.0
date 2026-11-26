"use client";
import { canManageIncidents } from "@/lib/role-access";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { canTransitionIncidentStatus, type IncidentCategory, type IncidentPriority, type IncidentStatus } from "@kalasag/shared-validation";
import { useDashboardAuth } from "@/components/DashboardAuth";
import { categoryLabel, fetchStaffIncidents, formatDate, isMappedIncident, priorityLabel, statusLabel } from "@/lib/incidents";
import { getSupabase } from "@/lib/supabase";
import type { IncidentRecord, StatusHistoryRecord } from "@/lib/types";

const IncidentLocationMap = dynamic(
  () => import("@/components/IncidentLocationMap"),
  {
    ssr: false,
    loading: () => (
      <div className="incident-location-map-loading" role="status">
        Loading incident map…
      </div>
    ),
  },
);

interface Assessment {
  id: string;
  suggested_category: IncidentCategory;
  suggested_priority: IncidentPriority;
  rationale: string;
  model: string;
  created_at: string;
}

interface Review {
  id: string;
  confirmed_category: IncidentCategory;
  confirmed_priority: IncidentPriority | null;
  note: string | null;
  created_at: string;
}

interface PhotoLink {
  url: string;
  label: string;
}

interface IncidentDetailsPayload {
  incident: IncidentRecord;
  history: StatusHistoryRecord[];
  assessment: Assessment | null;
  review: Review | null;
  photos: PhotoLink[];
  reporterContact: string;
  reporterName: string;
}

const categories: IncidentCategory[] = ["fire", "flooding", "road_accident", "road_obstruction", "medical_emergency", "other"];
const statuses: IncidentStatus[] = ["pending", "in_progress", "resolved", "closed"];

export default function BlotterDetailsPage() {
  const { id } = useParams<{ id: string }>();
  return <IncidentRecordView key={id} id={id} />;
}

function IncidentRecordView({ id }: { id: string }) {
  const requestVersion = useRef(0);
  const { role } = useDashboardAuth();
  const canManage = canManageIncidents(role);
  const [incident, setIncident] = useState<IncidentRecord | null>(null);
  const [history, setHistory] = useState<StatusHistoryRecord[]>([]);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [photos, setPhotos] = useState<PhotoLink[]>([]);
  const [reporterContact, setReporterContact] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<IncidentCategory>("other");
  const [selectedPriority, setSelectedPriority] = useState<IncidentPriority | "">("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [requestingAi, setRequestingAi] = useState(false);

  const fetchDetails = useCallback(async (): Promise<IncidentDetailsPayload> => {
    if (!id) throw new Error("Incident not found or access denied.");
    const [records, historyResult, assessmentsResult, reviewsResult, photosResult] = await Promise.all([
      fetchStaffIncidents(getSupabase(), id),
      getSupabase().from("incident_status_history").select("id, incident_id, from_status, to_status, actor_id, note, created_at").eq("incident_id", id).order("created_at", { ascending: true }),
      getSupabase().rpc("get_staff_ai_assessment", { p_incident_id: id }),
      getSupabase().from("classification_reviews").select("id, confirmed_category, confirmed_priority, note, created_at").eq("incident_id", id).order("created_at", { ascending: false }).limit(1),
      getSupabase().from("incident_photos").select("storage_path").eq("incident_id", id),
    ]);
    const current = records.find((item) => item.id === id);
    if (!current) throw new Error("Incident not found or access denied.");
    if (historyResult.error || assessmentsResult.error || reviewsResult.error || photosResult.error) {
      throw historyResult.error ?? assessmentsResult.error ?? reviewsResult.error ?? photosResult.error;
    }

    const latestAssessment = (assessmentsResult.data?.[0] as Assessment | undefined) ?? null;
    const latestReview = (reviewsResult.data?.[0] as Review | undefined) ?? null;
    const photoLinks = await Promise.all((photosResult.data ?? []).map(async (photo, index) => {
      const { data, error: signedError } = await getSupabase()
        .storage.from("incident-evidence").createSignedUrl(photo.storage_path, 120);
      if (signedError) throw signedError;
      return { url: data.signedUrl, label: `Evidence ${index + 1}` };
    }));
    let reporterContact = "";
    let reporterName = "";
    if (canManage) {
      try {
        const { data: sessionData } = await getSupabase().auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          const res = await fetch(`/api/incident/${id}/reporter`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (data.fullName) reporterName = data.fullName;
            if (data.contactNumber) reporterContact = data.contactNumber;
          }
        }
      } catch {
        // Fallback
      }

      if (!reporterContact) {
        const { data: contact, error: contactError } = await getSupabase()
          .rpc("get_incident_contact", { p_incident_id: id });
        if (contactError) throw contactError;
        reporterContact = contact;
      }
    }

    return {
      incident: current,
      history: historyResult.data as StatusHistoryRecord[],
      assessment: latestAssessment,
      review: latestReview,
      photos: photoLinks,
      reporterContact,
      reporterName,
    };
  }, [canManage, id]);

  const applyDetails = useCallback((details: IncidentDetailsPayload) => {
    setIncident(details.incident);
    setHistory(details.history);
    setAssessment(details.assessment);
    setReview(details.review);
    setSelectedCategory(details.review?.confirmed_category ?? details.assessment?.suggested_category ?? "other");
    setSelectedPriority(details.review?.confirmed_priority ?? details.assessment?.suggested_priority ?? "");
    setPhotos(details.photos);
    setReporterContact(details.reporterContact);
    setReporterName(details.reporterName);
  }, []);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const result = await fetchDetails();
      if (version === requestVersion.current) applyDetails(result);
    } catch (reason) {
      if (version === requestVersion.current) setError(reason instanceof Error ? reason.message : "Unable to load this incident.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [applyDetails, fetchDetails]);

  useEffect(() => {
    let active = true;
    const currentRequestVersion = requestVersion;
    queueMicrotask(() => { if (active) void load(); });
    const channel = getSupabase()
      .channel(`incident-details-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents", filter: `id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "incident_status_history", filter: `incident_id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_assessments", filter: `incident_id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "classification_reviews", filter: `incident_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => {
      active = false;
      currentRequestVersion.current++;
      void getSupabase().removeChannel(channel);
    };
  }, [id, load]);

  async function updateStatus(next: IncidentStatus) {
    if (!canManage || !incident || !canTransitionIncidentStatus(incident.status, next)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: updateError } = await getSupabase().rpc("update_incident_status", {
        p_incident_id: incident.id,
        p_status: next,
        p_note: statusNote.trim() || null,
      });
      if (updateError) throw updateError;
      setMessage(`Status updated to ${statusLabel(next)}.`);
      setStatusNote("");
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to update incident status.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewClassification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!incident || !canManage || !selectedPriority) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: reviewError } = await getSupabase().rpc("review_incident_classification", {
        p_incident_id: incident.id,
        p_category: selectedCategory,
        p_priority: selectedPriority,
        p_assessment_id: assessment?.id ?? null,
        p_note: reviewNote.trim() || null,
      });
      if (reviewError) throw reviewError;
      setMessage("Human category and priority review recorded.");
      setReviewNote("");
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to record classification review.");
    } finally {
      setBusy(false);
    }
  }

  async function requestAiClassification() {
    if (!incident || !canManage) return;
    setBusy(true);
    setRequestingAi(true);
    setError("");
    setMessage("");
    try {
      const { error: classificationError } = await getSupabase().functions.invoke("classify-incident", {
        body: { incidentId: incident.id },
      });
      if (classificationError) throw classificationError;
      setMessage("AI suggestion saved for mandatory human review. Operational status was not changed.");
      await load();
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : "Unable to request an AI classification.");
    } finally {
      setBusy(false);
      setRequestingAi(false);
    }
  }

  return (
    <div className="incident-record-page">
      <header className="incident-record-header">
        <div>
          <p className="eyebrow">INCIDENT REPORT</p>
          <h1>Report details</h1>
          <p className="incident-record-subtitle">Review what was reported, the AI suggestion, photos, and response status.</p>
        </div>
        <Link className="record-back-link" href="/dashboard/blotters">← Back to reports</Link>
      </header>

      {loading ? (
        <div className="record-state-card" role="status">Loading incident record…</div>
      ) : !incident ? (
        <div className="record-alert record-alert-error" role="alert">{error || "Incident not found."}</div>
      ) : (
        <>
          {error && <div className="record-alert record-alert-error" role="alert">{error}</div>}
          {message && <div className="record-alert record-alert-success" role="status">{message}</div>}

          <div className="incident-record-layout">
            <div className="incident-record-main">
              <section aria-labelledby="record-overview-heading" className="record-card record-overview">
                <div className="record-overview-heading">
                  <div>
                    <p className="record-card-kicker">Report ID</p>
                    <h2 id="record-overview-heading">{incident.reference}</h2>
                  </div>
                  <span className={`record-status-tag record-status-${incident.status}`}>
                    {statusLabel(incident.status)}
                  </span>
                </div>
                <div className="record-overview-facts">
                  <div>
                    <span>Category</span>
                    <strong>{categoryLabel(incident.confirmed_category ?? incident.suggested_category ?? "other")}</strong>
                  </div>
                  <div>
                    <span>Current priority</span>
                    <strong>{incident.priority_level ? priorityLabel(incident.priority_level) : "Awaiting assessment"}</strong>
                  </div>
                  <div>
                    <span>Reported</span>
                    <time dateTime={incident.created_at}>{formatDate(incident.created_at)}</time>
                  </div>
                </div>
                <div className="record-description">
                  <h3>Incident description</h3>
                  <p>{incident.description}</p>
                </div>
              </section>

              <section aria-labelledby="record-location-heading" className="record-card">
                <div className="record-section-heading">
                  <div>
                    <p className="record-card-kicker">LOCATION</p>
                    <h2 id="record-location-heading">Where it happened</h2>
                  </div>
                  {isMappedIncident(incident) && (
                    <a
                      className="record-text-link"
                      href={`https://www.openstreetmap.org/?mlat=${incident.latitude}&mlon=${incident.longitude}#map=17/${incident.latitude}/${incident.longitude}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open map ↗
                    </a>
                  )}
                </div>
                <div className="record-location-facts">
                  <div>
                    <span>Location label</span>
                    <strong>{incident.location_label || "Location not provided"}</strong>
                  </div>
                  <div>
                    <span>Coordinates</span>
                    <strong>
                      {isMappedIncident(incident)
                        ? `${incident.latitude.toFixed(6)}, ${incident.longitude.toFixed(6)}`
                        : "Unavailable"}
                    </strong>
                  </div>
                </div>
                {isMappedIncident(incident) ? (
                  <IncidentLocationMap
                    latitude={incident.latitude}
                    longitude={incident.longitude}
                    reference={incident.reference}
                    locationLabel={incident.location_label}
                  />
                ) : (
                  <p className="record-empty-note">A map is unavailable because this report has no valid location coordinates.</p>
                )}
              </section>

              <section aria-labelledby="record-classification-heading" className="record-card">
                <div className="record-section-heading">
                  <div>
                    <p className="record-card-kicker">CATEGORY AND PRIORITY</p>
                    <h2 id="record-classification-heading">AI suggestion and staff review</h2>
                  </div>
                  <span className={`record-review-state ${review ? "is-confirmed" : "is-pending"}`}>
                    {review ? "Reviewed by personnel" : "Needs personnel review"}
                  </span>
                </div>
                <div className="record-classification-grid">
                  <article className="record-classification-result ai-result">
                    <p className="record-card-kicker">AI suggestion</p>
                    {assessment ? (
                      <>
                        <strong>{categoryLabel(assessment.suggested_category)}</strong>
                        <span>{priorityLabel(assessment.suggested_priority)} priority</span>
                        <p>{assessment.rationale}</p>
                        <small>{assessment.model} · {formatDate(assessment.created_at)}</small>
                      </>
                    ) : (
                      <p className="record-empty-note">
                        The AI suggestion is pending or unavailable. It does not approve the report or dispatch a response.
                      </p>
                    )}
                    {canManage && !assessment && (
                      <button
                        className="record-secondary-button"
                        disabled={busy}
                        onClick={() => void requestAiClassification()}
                        type="button"
                      >
                        {requestingAi ? "Requesting suggestion…" : "Try AI suggestion again"}
                      </button>
                    )}
                  </article>
                  <article className="record-classification-result human-result">
                    <p className="record-card-kicker">Personnel review</p>
                    {review ? (
                      <>
                        <strong>{categoryLabel(review.confirmed_category)}</strong>
                        <span>{review.confirmed_priority ? `${priorityLabel(review.confirmed_priority)} priority` : "Priority not recorded"}</span>
                        <p>{review.note || "No review note was added."}</p>
                        <small>Reviewed {formatDate(review.created_at)}</small>
                      </>
                    ) : (
                      <p className="record-empty-note">
                        Personnel have not reviewed this suggestion yet. Check it before relying on the category or priority.
                      </p>
                    )}
                  </article>
                </div>
              </section>

              <div className={`record-support-grid${canManage ? "" : " record-support-single"}`}>
                {canManage && (
                  <section aria-labelledby="record-reporter-heading" className="record-card">
                    <p className="record-card-kicker">PRIVATE INFORMATION</p>
                    <h2 id="record-reporter-heading">Reporter contact</h2>
                    <div className="record-reporter-details">
                      <div>
                        <span>Name</span>
                        <strong>{reporterName || "Unavailable"}</strong>
                      </div>
                      <div>
                        <span>Contact number</span>
                        {reporterContact
                          ? <a href={`tel:${reporterContact}`}>{reporterContact}</a>
                          : <strong>Unavailable</strong>}
                      </div>
                    </div>
                    <p className="record-private-note">Visible only to authorized personnel.</p>
                  </section>
                )}

                <section aria-labelledby="record-evidence-heading" className="record-card">
                  <div className="record-section-heading">
                    <div>
                      <p className="record-card-kicker">ATTACHMENTS</p>
                      <h2 id="record-evidence-heading">Photo evidence</h2>
                    </div>
                    <span className="record-count">{photos.length}</span>
                  </div>
                  {photos.length ? (
                    <div className="record-evidence-grid">
                      {photos.map((photo) => (
                        <a href={photo.url} key={photo.url} rel="noreferrer" target="_blank">
                          <Image
                            src={photo.url}
                            alt={`${photo.label} for ${incident.reference}`}
                            width={960}
                            height={720}
                            unoptimized
                          />
                          <span>{photo.label} · View full image ↗</span>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="record-empty-note">No photo evidence was attached to this report.</p>
                  )}
                </section>
              </div>
            </div>

            <aside className="incident-record-sidebar">
              <section aria-labelledby="record-timeline-heading" className="record-card">
                <p className="record-card-kicker">STATUS HISTORY</p>
                <h2 id="record-timeline-heading">Report timeline</h2>
                {history.length ? (
                  <ol className="record-timeline">
                    {history.map((event) => (
                      <li key={event.id}>
                        <span className="record-timeline-marker" aria-hidden="true" />
                        <div>
                          <strong>{statusLabel(event.to_status)}</strong>
                          <time dateTime={event.created_at}>{formatDate(event.created_at)}</time>
                          {event.note && <p>{event.note}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="record-empty-note">No status history is available.</p>
                )}
              </section>

              {canManage && incident.status !== "closed" && (
                <section aria-labelledby="record-status-actions-heading" className="record-card">
                  <p className="record-card-kicker">PERSONNEL ACTION</p>
                  <h2 id="record-status-actions-heading">Update incident status</h2>
                  <p className="record-action-help">Add an optional note to explain why the status changed.</p>
                  <label className="record-field">
                    <span>Status note</span>
                    <textarea
                      maxLength={1000}
                      onChange={(event) => setStatusNote(event.target.value)}
                      rows={3}
                      value={statusNote}
                    />
                  </label>
                  <div className="record-status-actions">
                    {statuses.filter((next) => canTransitionIncidentStatus(incident.status, next)).map((next) => (
                      <button
                        className="record-primary-button"
                        disabled={busy}
                        key={next}
                        onClick={() => void updateStatus(next)}
                        type="button"
                      >
                        {busy ? "Saving…" : `Set status to ${statusLabel(next)}`}
                      </button>
                    ))}
                    {statuses.filter((next) => canTransitionIncidentStatus(incident.status, next)).length === 0 && (
                      <p className="record-empty-note">No further status changes are available.</p>
                    )}
                  </div>
                </section>
              )}
            </aside>
          </div>

          {canManage && (
            <section aria-labelledby="record-review-form-heading" className="record-card record-review-form-card">
              <div className="record-section-heading">
                <div>
                  <p className="record-card-kicker">PERSONNEL REVIEW</p>
                  <h2 id="record-review-form-heading">Review the AI suggestion</h2>
                  <p className="record-action-help">
                    Confirm or correct the suggested category and priority. Saving this review does not change report status or dispatch a response.
                  </p>
                </div>
              </div>
              <form className="record-review-form" onSubmit={(event) => void reviewClassification(event)}>
                <label className="record-field">
                  <span>Confirmed category</span>
                  <select
                    onChange={(event) => setSelectedCategory(event.target.value as IncidentCategory)}
                    value={selectedCategory}
                  >
                    {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
                  </select>
                </label>
                <label className="record-field">
                  <span>Confirmed priority</span>
                  <select
                    onChange={(event) => setSelectedPriority(event.target.value as IncidentPriority | "")}
                    value={selectedPriority}
                  >
                    <option value="">Select priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="record-field record-review-note-field">
                  <span>Review note <small>Optional</small></span>
                  <textarea
                    maxLength={1000}
                    onChange={(event) => setReviewNote(event.target.value)}
                    placeholder="Explain what you confirmed or corrected"
                    rows={3}
                    value={reviewNote}
                  />
                </label>
                <button className="record-primary-button" disabled={busy || !selectedPriority} type="submit">
                  {busy ? "Saving review…" : "Save review"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
