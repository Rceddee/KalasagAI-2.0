"use client";

import { useState, useEffect } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import {
  signInWithPopup,
  linkWithPopup,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { ShieldIcon, AlertIcon, DownloadIcon, SmartphoneIcon, CloseIcon, AppleIcon, ShareIcon, GitHubIcon } from "@/components/Icons";
import { useTheme } from "@/components/ThemeContext";
import { SunIcon, MoonIcon } from "@/components/Icons";


export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingLinkUser, setPendingLinkUser] = useState(null);
  const [showApkModal, setShowApkModal] = useState(false);
  const [mobileTab, setMobileTab] = useState("android"); // 'android' | 'ios'
  const { theme, toggleTheme } = useTheme();

  const getGoogleErrorMessage = (code) => {
    switch (code) {
      case "auth/unauthorized-domain":
        return "This address is not authorized for Google sign-in. Add it in Firebase Authentication settings.";
      case "auth/operation-not-allowed":
        return "Google sign-in is not enabled for this Firebase project.";
      case "auth/account-exists-with-different-credential":
        return "This email is already registered with email/password. Sign in with your password below to link Google.";
      case "auth/network-request-failed":
        return "Network error. Check your connection and try again.";
      case "auth/popup-closed-by-user":
      case "auth/cancelled-popup-request":
        return "";
      case "auth/popup-blocked":
        return "Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.";
      default:
        return "Google sign-in could not be completed. Please try again.";
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // If user is signed in and we are NOT in the middle of linking Google
      if (user && !pendingLinkUser) {
        router.replace("/dashboard");
        return;
      }

      const authError = sessionStorage.getItem("auth_error");
      if (authError) {
        setError(authError);
        sessionStorage.removeItem("auth_error");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router, pendingLinkUser]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
      router.replace("/dashboard");
    } catch (err) {
      // User closed the popup — not an error
      if (
        err.code === "auth/popup-closed-by-user" ||
        err.code === "auth/cancelled-popup-request"
      ) {
        setSigningIn(false);
        return;
      }

      // Email already registered with password — prompt to link
      if (err.code === "auth/account-exists-with-different-credential") {
        setError(getGoogleErrorMessage(err.code));
        setSigningIn(false);
        return;
      }

      console.error("Google sign-in failed:", err);
      setError(getGoogleErrorMessage(err.code));
      setSigningIn(false);
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setSigningIn(true);
    setError("");
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );

      // If we were asked to link Google after email sign-in, do it now
      if (pendingLinkUser) {
        try {
          await linkWithPopup(credential.user, googleProvider);
          setPendingLinkUser(null);
        } catch (linkErr) {
          // If linking fails (e.g. user closes popup), proceed anyway —
          // they are already signed in with email
          console.warn("Google account linking skipped:", linkErr.code);
        }
      }

      router.replace("/dashboard");
    } catch (err) {
      console.error("Email login failed:", err);
      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password"
      ) {
        // Check if the account exists but only has Google provider (no password)
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email.trim());
          if (methods.length > 0 && !methods.includes("password")) {
            setError(
              "This account was created with Google Sign-In and has no password. Please use the “Sign in with Google” button below."
            );
          } else {
            setError("Invalid email or password. Please check your credentials.");
          }
        } catch {
          // fetchSignInMethodsForEmail may be blocked by email enumeration protection
          setError("Invalid email or password. If you previously signed in with Google, try the Google button instead.");
        }
      } else if (err.code === "auth/too-many-requests") {
        setError("Too many failed attempts. Please try again later.");
      } else {
        setError("Sign-in failed. Please try again.");
      }
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <div className="login-container" id="login-screen-loading">
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="login-container" id="login-screen">
      <div className="glow-circle glow-red"></div>
      <button
        className="login-theme-toggle"
        onClick={toggleTheme}
        type="button"
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
      >
        {theme === "dark" ? (
          <SunIcon size={17} color="var(--color-yellow)" />
        ) : (
          <MoonIcon size={17} color="var(--color-blue)" />
        )}
        <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
      </button>
      <div className="glow-circle glow-blue"></div>
      <div className="login-card" id="auth-login-card">
        <div className="logo-header">
          <div className="shield-icon">
            <ShieldIcon size={48} color="var(--color-red)" />
          </div>
          <h1 id="app-heading">KALASAG AI</h1>
          <p className="subtitle">Gumaca Incident Management Portal</p>
        </div>
        <div className="divider"></div>
        <p className="card-description login-access-note">
          Authorized staff only. Accounts are created by an administrator; public sign-up is disabled.
        </p>
        {error && (
          <div
            className="error-message"
            id="login-error-alert"
            role="alert"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <AlertIcon size={16} color="var(--text-danger)" />
            <span>{error}</span>
          </div>
        )}

        {/* Email/Password Login Form */}
        <form
          className="login-form"
          onSubmit={handleEmailLogin}
          id="email-login-form"
        >
          <input
            type="email"
            className="login-input"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={signingIn}
            id="login-email-input"
            autoComplete="email"
          />
          <input
            type="password"
            className="login-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={signingIn}
            id="login-password-input"
            autoComplete="current-password"
          />
          <button
            type="submit"
            className="btn btn-primary"
            id="email-signin-btn"
            disabled={signingIn}
          >
            {signingIn ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Divider */}
        <div className="login-divider">
          <span>or</span>
        </div>

        {/* Google Login */}
        <button
          id="google-signin-btn"
          className="btn btn-google"
          onClick={handleGoogleLogin}
          disabled={signingIn}
        >
          <svg
            className="google-logo"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            aria-hidden="true"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62Z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z"
            />
          </svg>
          Sign in with Google
        </button>

        {/* Citizen app downloads */}
        <div className="login-apk-banner">
          <div className="login-apk-info">
            <span className="login-apk-badge">Citizen Mobile App</span>
            <p className="login-apk-text">Choose your device to report an emergency.</p>
          </div>
          <div className="login-apk-actions">
            <a
              href="https://github.com/Rceddee/Kalasag-AI/releases/latest/download/kalasag-resident.apk"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-apk-download"
              id="resident-github-apk-link"
              title="Direct download APK from GitHub Releases"
            >
              <GitHubIcon size={16} />
              <span>Android: GitHub Download</span>
            </a>
            <button
              type="button"
              className="btn-ios-guide"
              id="resident-android-instructions"
              onClick={() => {
                setMobileTab("android");
                setShowApkModal(true);
              }}
              title="View download mirrors and install instructions"
            >
              <DownloadIcon size={16} />
              <span>Mirrors &amp; Install Help</span>
            </button>
            <button
              type="button"
              className="btn-ios-guide"
              id="resident-ios-instructions"
              onClick={() => {
                setMobileTab("ios");
                setShowApkModal(true);
              }}
            >
              <AppleIcon size={16} />
              <span>iPhone: Setup</span>
            </button>
          </div>
          <div className="login-apk-help">
            <span>Official release · v1.0.3 · 109 MiB</span>
            <span aria-hidden="true">·</span>
            <a
              href="https://github.com/Rceddee/Kalasag-AI/releases"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub Releases
            </a>
            <span aria-hidden="true">·</span>
            <a href="https://kalasag-mobile.web.app" target="_blank" rel="noopener noreferrer">
              Open citizen web app
            </a>
          </div>
        </div>
      </div>

      {/* Mobile App Download & Installation Modal (Android & iOS) */}
      {showApkModal && (
        <div className="modal-overlay" id="apk-download-modal" onClick={() => setShowApkModal(false)}>
          <div className="modal-card apk-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div className="apk-shield-badge">
                  {mobileTab === "ios" ? (
                    <AppleIcon size={22} color="var(--color-blue)" />
                  ) : (
                    <SmartphoneIcon size={22} color="var(--color-red)" />
                  )}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800" }}>KalasagAI Citizen App</h3>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    MDRRMO Gumaca Emergency Reporting Client
                  </span>
                </div>
              </div>
              <button 
                className="modal-close" 
                onClick={() => setShowApkModal(false)}
                aria-label="Close modal"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Platform Switcher Tabs */}
              <div className="mobile-platform-tabs">
                <button
                  type="button"
                  className={`platform-tab-btn ${mobileTab === "android" ? "active" : ""}`}
                  onClick={() => setMobileTab("android")}
                >
                  <SmartphoneIcon size={15} />
                  <span>Android (.APK)</span>
                </button>
                <button
                  type="button"
                  className={`platform-tab-btn ${mobileTab === "ios" ? "active tab-apple" : ""}`}
                  onClick={() => setMobileTab("ios")}
                >
                  <AppleIcon size={15} />
                  <span>iOS / iPhone</span>
                </button>
              </div>

              {mobileTab === "android" ? (
                <>
                  <div className="apk-specs-grid">
                    <div className="apk-spec-item">
                      <span className="apk-spec-label">Version</span>
                      <span className="apk-spec-val">1.0.3 (Build 4 · Release)</span>
                    </div>
                    <div className="apk-spec-item">
                      <span className="apk-spec-label">Compatibility</span>
                      <span className="apk-spec-val">Android 7.0 &amp; Above</span>
                    </div>
                    <div className="apk-spec-item">
                      <span className="apk-spec-label">Package</span>
                      <span className="apk-spec-val">kalasag-resident.apk (~109 MiB)</span>
                    </div>
                    <div className="apk-spec-item">
                      <span className="apk-spec-label">Jurisdiction</span>
                      <span className="apk-spec-val">Gumaca, Quezon</span>
                    </div>
                  </div>

                  <div className="apk-guide-box">
                    <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", fontWeight: "700", color: "var(--color-yellow)" }}>
                      Quick Android Installation Steps:
                    </h4>
                    <p style={{ margin: "0 0 8px", fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                      Choose your preferred download source below (GitHub CDN is recommended for fast downloads).
                    </p>
                    <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.7" }}>
                      <li>Click <strong>Download via GitHub</strong> or <strong>Google Drive Mirror</strong>.</li>
                      <li>When prompted by Android, tap <strong>Download anyway</strong>.</li>
                      <li>Open the downloaded <code>.apk</code> file in your notification bar or Files app.</li>
                      <li>If prompted, enable <em>&ldquo;Allow install from unknown sources&rdquo;</em> in Settings.</li>
                      <li>Tap <strong>Install</strong>, then launch KalasagAI to report emergencies.</li>
                    </ol>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                      <a
                        href="https://github.com/Rceddee/Kalasag-AI/releases/latest/download/kalasag-resident.apk"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary"
                        style={{ flex: 1, minWidth: "200px", textDecoration: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", height: "46px" }}
                        id="github-apk-download-link"
                      >
                        <GitHubIcon size={18} />
                        Download via GitHub (Recommended)
                      </a>
                      <a
                        href="https://drive.google.com/uc?export=download&id=1BnVtrQbC49d0KQi70od3hRvYAUpWSO3e"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-google"
                        style={{ textDecoration: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", height: "46px", padding: "0 18px" }}
                        id="gdrive-apk-download-link"
                        title="Download backup from Google Drive"
                      >
                        <DownloadIcon size={16} />
                        Drive Mirror
                      </a>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                      <a
                        href="https://github.com/Rceddee/Kalasag-AI/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "12px", color: "var(--color-blue)", textDecoration: "underline" }}
                      >
                        View all Releases &amp; Changelogs on GitHub →
                      </a>
                      <button
                        type="button"
                        className="btn btn-google"
                        style={{ width: "auto", padding: "0 16px", height: "34px", fontSize: "12px" }}
                        onClick={() => setShowApkModal(false)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="ios-policy-note">
                    <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                      <AppleIcon size={20} color="var(--text-primary)" />
                      <div>
                        <strong style={{ fontSize: "12px", color: "var(--text-primary)" }}>Why can&apos;t iPhones install .APK files directly?</strong>
                        <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                          An Android <code>.apk</code> cannot be installed on iPhone. Use the citizen portal in Safari and add it to your Home Screen instead:
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Method 1: Instant Safari PWA (Recommended for Residents) */}
                  <div className="apk-guide-box" style={{ borderColor: "rgba(59, 130, 246, 0.4)", background: "rgba(21, 101, 192, 0.08)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                      <h4 style={{ margin: 0, fontSize: "13px", fontWeight: "700", color: "var(--color-blue)", display: "flex", alignItems: "center", gap: "6px" }}>
                        <ShareIcon size={15} color="var(--color-blue)" />
                        Method 1: Add to Home Screen (Instant PWA — No App Store Needed)
                      </h4>
                      <span style={{ fontSize: "9px", fontWeight: "800", color: "var(--color-green)", background: "rgba(46, 125, 50, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
                        RECOMMENDED
                      </span>
                    </div>
                    <p style={{ margin: "0 0 8px 0", fontSize: "11px", color: "var(--text-secondary)" }}>
                      Built on React Native Web. Runs in full-screen standalone mode on iPhone with live camera, GPS geotagging, emergency hotlines, and instant updates.
                    </p>
                    <ol style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.7" }}>
                      <li>Open the <strong>Citizen Portal</strong> in <strong>Safari</strong> on your iPhone.</li>
                      <li>Tap the iOS <strong>Share button</strong> (<ShareIcon size={12} style={{ display: "inline", verticalAlign: "middle" }} /> at the bottom center of Safari).</li>
                      <li>Scroll down the share sheet and tap <strong>&ldquo;Add to Home Screen&rdquo;</strong> (➕).</li>
                      <li>Tap <strong>Add</strong>. KalasagAI appears on your home screen with a native icon!</li>
                    </ol>
                  </div>

                  <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", height: "46px" }}
                      onClick={() => {
                        if (typeof window !== "undefined" && navigator.clipboard) {
                          navigator.clipboard.writeText("https://kalasag-mobile.web.app");
                          alert("Citizen Portal URL copied to clipboard! Open Safari on your iPhone to access it.");
                        } else if (typeof window !== "undefined") {
                          window.open("https://kalasag-mobile.web.app", "_blank", "noopener,noreferrer");
                        }
                      }}
                    >
                      <ShareIcon size={16} />
                      Copy iPhone Safari Portal Link
                    </button>
                    <button
                      type="button"
                      className="btn btn-google"
                      style={{ width: "auto", padding: "0 20px" }}
                      onClick={() => setShowApkModal(false)}
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <footer className="login-footer">
        <p>&copy; 2026 KALASAG MDRRMO Gumaca. All rights reserved.</p>
        <p>Data Privacy Act of 2012 (RA 10173) Compliant.</p>
      </footer>
    </div>
  );
}