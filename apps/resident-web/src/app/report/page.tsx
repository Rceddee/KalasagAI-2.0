"use client";

import React, { useState, useEffect, useRef, useCallback, type ChangeEvent, type FormEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  validateEvidenceFile,
  validateIncidentDescription,
  validateIncidentLocation,
  validateIncidentLocationLabel,
} from "@kalasag/shared-validation";
import { ResidentShell } from "@/components/ResidentShell";
import { useResidentAuth } from "@/components/AuthProvider";
import { getSupabase } from "@/lib/supabase";
import { REPORT_SUBMISSION_STATUS_MESSAGE } from "@/lib/report-messages";
import { getIncidentEvidenceStoragePath, isDefinitiveSubmissionFailure } from "@/lib/report-submission";
import { getLocationLimitStatus } from "@/lib/boundary-helper";
import {
  ShieldIcon,
  PinIcon,
  CameraIcon,
  AlertIcon,
  CheckIcon,
  CloseIcon,
  RefreshIcon,
} from "@/components/Icons";
import { useToast } from "@/components/Toast";

const IncidentLocationPicker = dynamic(
  () => import("@/components/IncidentLocationPicker").then((module) => module.IncidentLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: "220px", display: "grid", placeItems: "center", background: "var(--bg-tertiary)", borderRadius: "12px", color: "var(--text-muted)", fontSize: "12px" }}>
        Loading location map…
      </div>
    ),
  }
);

const QUICK_CATEGORIES = [
  { id: "flooding", label: "Flooding", tagalog: "Baha", color: "#1E88E5", sample: "May baha na abot-tuhod sa " },
  { id: "fire", label: "Fire Incident", tagalog: "Sunog", color: "#E53935", sample: "May sunog at makapal na usok sa " },
  { id: "medical_emergency", label: "Medical Emergency", tagalog: "Medikal", color: "#FDD835", sample: "Kailangan ng ambulansya at paunang lunas para sa " },
  { id: "road_accident", label: "Road Accident", tagalog: "Aksidente", color: "#FB8C00", sample: "Aksidente sa kalsada sa may " },
  { id: "road_obstruction", label: "Obstruction", tagalog: "Harang", color: "#FB8C00", sample: "May nakaharang na puno o poste sa kalsada ng " },
  { id: "other", label: "Other Hazard", tagalog: "Iba Pa", color: "#43A047", sample: "Emergency report tungkol sa " },
];

interface PendingSubmissionAttempt {
  residentId: string;
  idempotencyKey: string;
  photoPath: string;
  description: string;
  locationLabel: string;
  latitude: number;
  longitude: number;
  photo: File;
  submissionAttempted: boolean;
}

export default function ReportPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, profile } = useResidentAuth();

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const locationLabelRef = useRef("");
  const autoLocationLabelRef = useRef<string | null>(null);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [pendingAttempt, setPendingAttempt] = useState<PendingSubmissionAttempt | null>(null);
  const pendingAttemptRef = useRef<PendingSubmissionAttempt | null>(null);
  const [error, setError] = useState("");
  const [successModalOpen, setSuccessModalOpen] = useState(false);

  const [submittedResult, setSubmittedResult] = useState<{
    residentId: string;
    reference: string;
  } | null>(null);

  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const handleLocationChange = useCallback((latitude: number, longitude: number) => {
    setCoords([latitude, longitude]);

    if (!locationLabelRef.current.trim() || locationLabelRef.current === autoLocationLabelRef.current) {
      const autoLabel = `Coordinates: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      locationLabelRef.current = autoLabel;
      setLocationLabel(autoLabel);
      autoLocationLabelRef.current = autoLabel;
    }
  }, []);

  // Tag Current GPS Location via Geolocation API
  const handleGetLocation = () => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    setLocLoading(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        handleLocationChange(lat, lng);
        setLocLoading(false);
        const limitStatus = getLocationLimitStatus(lat, lng);
        toast.info(`GPS Acquired: ${limitStatus.badge}`);
      },
      (err) => {
        console.warn("Geolocation error:", err);
        setLocLoading(false);
        toast.error("Could not acquire GPS position. Tap the map to select your location.");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const processFile = (file: File) => {
    const validation = validateEvidenceFile(file);
    if (validation) {
      const errMsg =
        validation === "invalid_type"
          ? "Only JPG, PNG, and WebP images are allowed."
          : validation === "too_large"
          ? "Image size cannot exceed 10 MB."
          : "Selected file is empty.";
      setError(errMsg);
      toast.error(errMsg);
      return;
    }

    setError("");
    setPhoto(file);

    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch {
        // ignore
      }
    }

    const objectUrl = URL.createObjectURL(file);
    previewUrlRef.current = objectUrl;
    setPreviewUrl(objectUrl);

    toast.success(`Photo attached: ${file.name}`);
    if (pendingAttemptRef.current) {
      pendingAttemptRef.current = null;
      setPendingAttempt(null);
    }
  };

  const handlePhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const removePhoto = () => {
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch {
        // ignore
      }
    }
    previewUrlRef.current = null;
    setPhoto(null);
    setPreviewUrl(null);
    setError("");
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    toast.info("Photo removed.");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!submitting) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (submitting) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (submitting) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          processFile(file);
          break;
        }
      }
    }
  };

  // Submit handler
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in to submit a report.");
      return;
    }

    if (!profile?.contact_number) {
      setError("A verified contact number is required by MDRRMO before submitting reports. Please update your profile.");
      router.push("/profile");
      return;
    }

    if (!validateIncidentDescription(description)) {
      setError("Please describe the emergency in at least 10 characters.");
      return;
    }

    if (!coords || !validateIncidentLocation(coords[0], coords[1])) {
      setError("Please select a valid incident location on the map.");
      return;
    }

    if (!validateIncidentLocationLabel(locationLabel)) {
      setError("Enter a landmark, street, or barangay for the incident location.");
      return;
    }

    if (!photo) {
      setError("Valid photo evidence is required for all emergency reports. Please capture or attach an image.");
      return;
    }

    const previousAttempt = pendingAttemptRef.current;
    if (previousAttempt && previousAttempt.residentId !== user.id) {
      setError("This report attempt belongs to a different resident account. Sign back in as the original account to retry it.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const supabase = getSupabase();
      const createAttempt = (): PendingSubmissionAttempt => {
        const idempotencyKey = crypto.randomUUID();
        return {
          residentId: user.id,
          idempotencyKey,
          photoPath: getIncidentEvidenceStoragePath(user.id, idempotencyKey, photo.type),
          description: description.trim(),
          locationLabel: locationLabel.trim(),
          latitude: coords[0],
          longitude: coords[1],
          photo,
          submissionAttempted: false,
        };
      };
      const attempt = previousAttempt ?? createAttempt();

      if (!previousAttempt) {
        pendingAttemptRef.current = attempt;
        setPendingAttempt(attempt);
      }

      const evidenceBucket = supabase.storage.from("incident-evidence");
      if (previousAttempt) {
        const folder = attempt.photoPath.slice(0, attempt.photoPath.lastIndexOf("/"));
        const fileName = attempt.photoPath.slice(attempt.photoPath.lastIndexOf("/") + 1);
        const { data: existingFiles, error: listError } = await evidenceBucket.list(folder);
        if (listError) {
          throw new Error(`Could not verify the previous evidence upload: ${listError.message}`);
        }
        if (!existingFiles) {
          throw new Error("Could not verify the previous evidence upload.");
        }

        if (!existingFiles.some((file) => file.name === fileName)) {
          const { error: uploadError } = await evidenceBucket.upload(attempt.photoPath, attempt.photo, {
            cacheControl: "3600",
            contentType: attempt.photo.type,
            upsert: false,
          });
          if (uploadError) {
            throw new Error(`Photo upload failed or could not be confirmed: ${uploadError.message}`);
          }
        }
      } else {
        const { error: uploadError } = await evidenceBucket.upload(attempt.photoPath, attempt.photo, {
          cacheControl: "3600",
          contentType: attempt.photo.type,
          upsert: false,
        });
        if (uploadError) {
          throw new Error(`Photo upload failed or could not be confirmed: ${uploadError.message}`);
        }
      }

      attempt.submissionAttempted = true;
      const { data: incident, error: submitError } = await supabase.rpc("submit_incident", {
        p_idempotency_key: attempt.idempotencyKey,
        p_description: attempt.description,
        p_location_label: attempt.locationLabel,
        p_latitude: attempt.latitude,
        p_longitude: attempt.longitude,
        p_photo_paths: [attempt.photoPath],
      });

      let reference = incident?.reference;
      let incidentId = incident?.id;
      if (submitError || !reference) {
        const { data: existingIncident, error: lookupError } = await supabase
          .from("incidents")
          .select("id, reference")
          .eq("resident_id", attempt.residentId)
          .eq("idempotency_key", attempt.idempotencyKey)
          .maybeSingle();

        if (lookupError) {
          throw new Error(`Could not check whether the report was accepted: ${lookupError.message}`);
        }

        reference = existingIncident?.reference;
        incidentId = existingIncident?.id;
        if (!reference && submitError && isDefinitiveSubmissionFailure(submitError.code)) {
          const { error: cleanupError } = await evidenceBucket.remove([attempt.photoPath]);
          if (cleanupError) {
            console.error("Failed to remove evidence for a rejected incident submission:", cleanupError);
            setError(`The report was rejected, but its private evidence could not be removed. Retry to confirm cleanup. ${cleanupError.message}`);
            return;
          }
          pendingAttemptRef.current = null;
          setPendingAttempt(null);
          throw submitError;
        }

        if (!reference && submitError) {
          throw new Error(`The database response could not be confirmed: ${submitError.message}`);
        }

        if (!reference) {
          throw new Error("The submission response did not include a report reference.");
        }
      }

      setSubmittedResult({
        residentId: attempt.residentId,
        reference,
      });

      // Automatically trigger backend operations AI classification for the blotter record
      if (incidentId) {
        void supabase.functions.invoke("classify-incident", {
          body: { incidentId },
        }).catch((classifyErr) => {
          console.warn("Background AI classification invocation warning:", classifyErr);
        });
      }

      pendingAttemptRef.current = null;
      setPendingAttempt(null);
      setSuccessModalOpen(true);
      setDescription("");
      setPhoto(null);
      setPreviewUrl(null);
    } catch (err: unknown) {
      console.error("Submission error:", err);
      const message = err instanceof Error ? err.message : "Failed to submit emergency report. Please try again.";
      const currentAttempt = pendingAttemptRef.current;
      if (currentAttempt?.submissionAttempted) {
        setError(`The report's status is uncertain. ${message} Retry this unchanged report to reuse the same submission and evidence identifiers.`);
      } else if (currentAttempt) {
        setError(`The report was not submitted because its evidence upload did not complete. ${message} Retry without changing the report.`);
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const limitStatus = coords ? getLocationLimitStatus(coords[0], coords[1]) : null;
  const pendingAccountMismatch = pendingAttempt !== null && pendingAttempt.residentId !== user?.id;

  return (
    <ResidentShell>
      <div className="resident-report-page" style={{ padding: "16px 0" }}>
        <header className="resident-report-intro">
          <span className="resident-report-eyebrow">Incident reporting</span>
          <h1>Report an emergency</h1>
          <p>Tell us what happened, mark the location, and add a photo so the response team can review your report.</p>
        </header>

        {profile && !profile.contact_number && (
          <div style={{ margin: "0 16px 16px", padding: "14px 16px", borderRadius: "12px", background: "var(--color-orange-glow)", border: "1px solid var(--color-orange)", color: "var(--text-primary)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <AlertIcon size={20} color="var(--color-orange)" />
              <div style={{ fontSize: "12px", lineHeight: 1.4 }}>
                <strong>Contact Number Required</strong>
                <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>
                  MDRRMO requires a Philippine mobile number to contact you about your emergency report.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push("/profile")}
              style={{
                background: "var(--color-orange)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "8px 12px",
                fontSize: "11px",
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Add Phone
            </button>
          </div>
        )}

        {error && (
          <div style={{ margin: "0 16px 16px", padding: "12px 16px", borderRadius: "10px", background: "rgba(229, 57, 53, 0.15)", border: "1px solid var(--color-red)", color: "var(--text-danger)", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>
            <AlertIcon size={18} color="var(--color-red)" />
            <span>{error}</span>
          </div>
        )}

        {pendingAccountMismatch ? (
          <div role="alert" style={{ margin: "16px", padding: "14px", borderRadius: "10px", background: "var(--color-orange-glow)", color: "var(--text-primary)", fontSize: "13px" }}>
            A report attempt from another resident account is still being confirmed. Sign back in as that resident to review or retry it.
          </div>
        ) : (
        <form className="resident-report-form" onSubmit={handleSubmit}>
          {pendingAttempt && (
            <div
              role="status"
              style={{
                margin: "0 16px 16px",
                padding: "12px 16px",
                borderRadius: "10px",
                background: "var(--color-orange-glow)",
                border: "1px solid var(--color-orange)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
              }}
            >
              <div style={{ fontSize: "12px", color: "var(--text-primary)" }}>
                <strong>Previous Submission Retry Active</strong>
                <div style={{ color: "var(--text-secondary)", marginTop: "2px" }}>
                  The outcome of this submission is being confirmed. Click submit to retry unchanged, or reset to attach a new photo.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  pendingAttemptRef.current = null;
                  setPendingAttempt(null);
                  setError("");
                  toast.info("Report retry cleared. You can now edit fields and select a new photo.");
                }}
                style={{
                  background: "transparent",
                  border: "1px solid var(--text-secondary)",
                  color: "var(--text-primary)",
                  borderRadius: "6px",
                  padding: "6px 10px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Reset
              </button>
            </div>
          )}
          {/* Incident Description Card */}
          <div className="resident-content-card resident-report-details">
            <h2 className="resident-card-title">
              <ShieldIcon size={18} color="var(--color-red)" />
              <span>What happened?</span>
            </h2>

            <div className="resident-form-field">
              <span className="resident-field-label">Choose an incident type</span>
              <div className="resident-category-grid">
                {QUICK_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className="resident-category-button"
                      disabled={submitting}
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (pendingAttempt) {
                          pendingAttemptRef.current = null;
                          setPendingAttempt(null);
                        }
                        setSelectedCategory(cat.id);
                        if (!description || QUICK_CATEGORIES.some((c) => description.startsWith(c.sample))) {
                          setDescription(cat.sample);
                        }
                      }}
                      style={{
                        background: isSelected ? `${cat.color}22` : "var(--chip-bg)",
                        border: isSelected ? `2px solid ${cat.color}` : "1px solid var(--chip-border)",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 700,
                          color: isSelected ? cat.color : "var(--text-primary)",
                          lineHeight: 1.2,
                        }}
                      >
                        {cat.label}
                      </span>
                      <span
                        style={{
                          fontSize: "12px",
                          color: isSelected ? cat.color : "var(--text-muted)",
                        }}
                      >
                        {cat.tagalog}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="resident-field-label" htmlFor="incident-description">
              Describe the situation
            </label>
            <textarea
              id="incident-description"
              className="resident-textarea"
              aria-describedby="incident-description-help"
              placeholder="Include any immediate danger, injuries, or people who need help."
              value={description}
              onChange={(e) => {
                if (pendingAttempt) {
                  pendingAttemptRef.current = null;
                  setPendingAttempt(null);
                }
                setDescription(e.target.value);
              }}
              disabled={submitting}
              required
              minLength={10}
              maxLength={2000}
            />
            <p className="resident-field-help" id="incident-description-help">
              You can write in English, Filipino, or Taglish.
            </p>
            <div className="char-counter">
              {description.length} / 2000 characters
            </div>
          </div>

          {/* Location Card with Map Preview */}
          <div className="resident-content-card resident-report-location">
            <h2 className="resident-card-title">
              <PinIcon size={18} color="var(--color-blue)" />
              <span>Where is it?</span>
            </h2>
            <p className="resident-section-help">Place the pin at the incident, then add a nearby street or landmark.</p>

            <div className="location-status-box">
              <div>
                <div className="location-info-coords">
                  {coords ? "Current map pin" : "No map pin selected"}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                  {limitStatus?.description || "Gumaca, Quezon"}
                </div>
              </div>
              {limitStatus && (
                <span
                  className="location-info-badge"
                  style={{
                    background: `${limitStatus.color}20`,
                    color: limitStatus.color,
                    border: `1px solid ${limitStatus.color}`,
                  }}
                >
                  {limitStatus.badge}
                </span>
              )}
            </div>

            <label
              htmlFor="incident-location-label"
              className="resident-field-label"
            >
              Location details
            </label>
            <p className="resident-field-help" id="incident-location-help">
              Coordinates fill in automatically. Add a street, barangay, or landmark if you know it.
            </p>
            <input
              id="incident-location-label"
              className="resident-text-input"
              type="text"
              value={locationLabel}
              disabled={submitting}
              aria-describedby="incident-location-help"
              onChange={(event) => {
                if (pendingAttempt) {
                  pendingAttemptRef.current = null;
                  setPendingAttempt(null);
                }
                const value = event.target.value;
                locationLabelRef.current = value;
                if (value !== autoLocationLabelRef.current) {
                  autoLocationLabelRef.current = null;
                }
                setLocationLabel(value);
              }}
              placeholder="e.g. Barangay Rosario, near the municipal hall"
              autoComplete="street-address"
              minLength={2}
              maxLength={250}
              required
            />

            <button
              type="button"
              className="btn-tag-gps"
              onClick={handleGetLocation}
              disabled={locLoading || submitting}
              style={{ marginBottom: "14px" }}
            >
              {locLoading ? <RefreshIcon size={16} /> : <PinIcon size={16} />}
              <span>{locLoading ? "Finding your location…" : "Use my current location"}</span>
            </button>

            <div
              className="resident-report-map"
              style={{ pointerEvents: pendingAttempt ? "none" : undefined, opacity: pendingAttempt ? 0.7 : undefined }}
            >
              <IncidentLocationPicker
                location={coords}
                onChoose={handleLocationChange}
              />
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "6px", textAlign: "center" }}>
              You can also drag the pin to the exact spot.
            </span>
          </div>

          {/* Photo Evidence Card */}
          <div className="resident-content-card resident-report-photo">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <h2 className="resident-card-title" style={{ margin: 0 }}>
                <CameraIcon size={18} color="var(--color-green)" />
                <span>Add a photo</span>
              </h2>
              <span className="resident-required-badge">Required</span>
            </div>

            <p className="resident-section-help resident-photo-help">
              A clear photo helps the response team verify the report. If AI processing is enabled, your description and photo are sent to Gemini for a category and priority suggestion; personnel review it. JPG, PNG, or WebP up to 10 MB.
            </p>

            <div
              className="photo-upload-wrap"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onPaste={handlePaste}
            >
              <input
                id="resident-gallery-input"
                accept="image/jpeg,image/png,image/webp,image/*,.jpg,.jpeg,.png,.webp,.jfif"
                className="resident-photo-file-input"
                onChange={handlePhotoSelect}
                ref={galleryInputRef}
                disabled={submitting}
                type="file"
              />
              <input
                id="resident-camera-input"
                accept="image/jpeg,image/png,image/webp,image/*,.jpg,.jpeg,.png,.webp,.jfif"
                capture="environment"
                className="resident-photo-file-input"
                onChange={handlePhotoSelect}
                ref={cameraInputRef}
                disabled={submitting}
                type="file"
              />
              {previewUrl ? (
                <>
                  <div className="photo-preview-container">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Evidence preview"
                      className="photo-preview-img"
                    />
                    <button
                      type="button"
                      className="btn-remove-photo"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        removePhoto();
                      }}
                      disabled={submitting}
                      title="Remove Photo"
                    >
                      <CloseIcon size={16} />
                    </button>
                    <div className="photo-preview-details">
                      <span>{photo?.name}</span>
                      <span>{photo ? (photo.size / (1024 * 1024)).toFixed(2) + " MB" : ""}</span>
                    </div>
                  </div>
                  <div className="upload-button-row">
                    <label
                      htmlFor="resident-gallery-input"
                      className="btn-upload-choice"
                      style={{ cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
                    >
                      Choose a different photo
                    </label>
                    <label
                      htmlFor="resident-camera-input"
                      className="btn-upload-choice"
                      style={{ cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
                    >
                      Take another photo
                    </label>
                  </div>
                </>
              ) : (
                <div
                  className="photo-dropzone"
                  style={{
                    border: isDragging ? "2px dashed var(--color-blue)" : "2px dashed var(--glass-border)",
                    background: isDragging ? "var(--color-blue-glow)" : "var(--glass-bg)",
                    borderRadius: "12px",
                    padding: "24px 16px",
                    textAlign: "center",
                    cursor: submitting ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "10px",
                  }}
                  onClick={() => {
                    if (!submitting) {
                      galleryInputRef.current?.click();
                    }
                  }}
                >
                  <CameraIcon size={32} color={isDragging ? "var(--color-blue)" : "var(--color-green)"} />
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                    {isDragging ? "Drop your photo here" : "Click to select a photo, or drag and drop"}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    JPG, JPEG, PNG, or WebP up to 10 MB (or paste with Ctrl+V)
                  </div>
                  <div className="upload-button-row" style={{ marginTop: "8px", width: "100%", maxWidth: "340px" }} onClick={(e) => e.stopPropagation()}>
                    <label
                      htmlFor="resident-gallery-input"
                      className="btn-upload-choice"
                      style={{ cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
                    >
                      Choose from device
                    </label>
                    <label
                      htmlFor="resident-camera-input"
                      className="btn-upload-choice"
                      style={{ cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.6 : 1 }}
                    >
                      <CameraIcon size={18} color="var(--color-blue)" />
                      Take a photo
                    </label>
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "12px", color: "var(--text-muted)" }} onClick={(e) => e.stopPropagation()}>
                    Trouble choosing a file?{" "}
                    <label
                      htmlFor="resident-gallery-input"
                      style={{
                        color: "var(--color-blue)",
                        textDecoration: "underline",
                        cursor: submitting ? "not-allowed" : "pointer",
                        fontWeight: 600,
                      }}
                    >
                      Click here to browse
                    </label>
                  </div>
                </div>
              )}
              <p className="resident-photo-upload-note" role="status">
                {photo
                  ? "Photo attached. It will upload securely when you submit the report."
                  : "Choose a JPG, PNG, or WebP image up to 10 MB, or take a new photo."}
              </p>
            </div>
          </div>

          {/* Reporter Contact Info Card */}
          <div className="resident-content-card resident-report-contact">
            <h2 className="resident-card-title">
              <CheckIcon size={18} color="var(--color-yellow)" />
              <span>Your contact details</span>
            </h2>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
              <span style={{ color: "var(--text-muted)" }}>Name</span>
              <strong style={{ color: "var(--text-primary)" }}>{profile?.full_name || user?.email}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginTop: "6px" }}>
              <span style={{ color: "var(--text-muted)" }}>Mobile number</span>
              <strong style={{ color: profile?.contact_number ? "var(--color-blue)" : "var(--text-muted)" }}>
                {profile?.contact_number || "Not provided"}
              </strong>
            </div>
          </div>

          {/* Submit Emergency Report Button */}
          <button
            type="submit"
            className="btn-submit-emergency resident-report-submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <RefreshIcon size={18} />
                <span>Classifying &amp; Submitting Report…</span>
              </>
            ) : (
              <>
                <ShieldIcon size={20} color="#FFFFFF" />
                <span>{pendingAttempt ? "Retry submission" : "Submit emergency report"}</span>
              </>
            )}
          </button>
        </form>
        )}
      </div>

      {successModalOpen && submittedResult && submittedResult.residentId === user?.id && (
        <div className="resident-modal-backdrop" onClick={() => setSuccessModalOpen(false)}>
          <div className="resident-modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ textAlign: "center", marginBottom: "16px" }}>
              <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "var(--color-green-glow)", border: "2px solid var(--color-green)", color: "var(--color-green)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
                <CheckIcon size={28} />
              </div>
              <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-primary)" }}>
                Report received
              </h2>
              <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                MDRRMO Gumaca Operations Center received your report.
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px", lineHeight: "1.5" }}>
                {REPORT_SUBMISSION_STATUS_MESSAGE}
              </p>
            </div>

            <div style={{ background: "var(--bg-tertiary)", borderRadius: "12px", padding: "14px", marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Report reference</span>
                <strong style={{ fontSize: "13px", color: "var(--color-blue)" }}>{submittedResult.reference}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                className="btn-submit-emergency"
                style={{ margin: 0, flex: 1, padding: "12px" }}
                onClick={() => {
                  setSuccessModalOpen(false);
                  router.push("/reports");
                }}
              >
                View in My Reports
              </button>
              <button
                type="button"
                style={{ padding: "12px 18px", borderRadius: "12px", border: "1px solid var(--glass-border)", background: "transparent", color: "var(--text-secondary)", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
                onClick={() => setSuccessModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </ResidentShell>
  );
}
