import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  View,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { createUserWithEmailAndPassword, sendEmailVerification, signOut, updateProfile, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';

import { auth, db, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ShieldIcon, AlertIcon, CheckIcon, CloseIcon, GoogleIcon } from '@/components/Icons';
import { useTheme } from '@/lib/theme-context';
import { ThemeToggle } from '@/components/ThemeToggle';

function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters long.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a few minutes and try again.';
    default:
      return 'Registration failed. Please try again.';
  }
}

export default function SignupScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  // Form states
  const [fullName, setFullName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Terms & Conditions states
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  if (user) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accentRed} />
      </View>
    );
  }

  // Instant Verified Registration via Google (Approach A)
  const handleGoogleSignUp = async () => {
    if (Platform.OS !== 'web') {
      setError('Google sign-up is not configured for this Android app yet. Create an account with the form below.');
      return;
    }

    setError('');
    setGoogleLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const googleUser = result.user;

      try {
        const userDocRef = doc(db, 'citizens', googleUser.uid);
        const docSnap = await getDoc(userDocRef);
        if (!docSnap.exists()) {
          await setDoc(userDocRef, {
            name: googleUser.displayName || 'Google Citizen User',
            email: googleUser.email || '',
            contact: googleUser.phoneNumber || '',
            email_verified: true,
            verified_via: 'google_oauth',
            terms_agreed: true,
            terms_agreed_version: '2026-v1',
            created_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          });
        } else {
          await setDoc(userDocRef, {
            email_verified: true,
            terms_agreed: true,
            last_login_at: serverTimestamp(),
          }, { merge: true });
        }
      } catch (profileErr) {
        console.warn('Citizen profile setDoc skipped or restricted:', profileErr);
      }
    } catch (err: any) {
      console.error('Google Sign-up failed:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google registration was closed before completion.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // cancelled
      } else {
        setError(getErrorMessage(err.code) || err.message || 'Google registration failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Create the account and send Firebase's email verification link.
  const handleCreateAccount = async () => {
    const trimmedName = fullName.trim();
    const trimmedContact = contactNumber.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedContact) {
      setError('Please enter your contact number.');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Please enter a valid Gmail / email address.');
      return;
    }
    if (!password) {
      setError('Please enter a password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!termsAgreed) {
      setError('You must accept the Terms & Conditions regarding anti-spam and false reporting penalties.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const credential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const newUser = credential.user;
      setStep('verify');

      try {
        await updateProfile(newUser, { displayName: trimmedName });
      } catch (profileError) {
        console.warn('Could not set citizen display name:', profileError);
      }

      try {
        await setDoc(doc(db, 'citizens', newUser.uid), {
          name: trimmedName,
          contact: trimmedContact,
          email: trimmedEmail,
          email_verified: false,
          verified_via: 'firebase_email_link',
          terms_agreed: true,
          terms_agreed_version: '2026-v1',
          created_at: serverTimestamp(),
          updated_at: serverTimestamp(),
        });
      } catch (profileError) {
        console.warn('Citizen profile sync notice:', profileError);
      }

      try {
        await sendEmailVerification(newUser);
        setVerificationEmailSent(true);
      } catch (verificationError) {
        console.error('Verification email send failed:', verificationError);
        setError('Your account was created, but the verification email could not be sent. Please try resending the link.');
      }
    } catch (err: any) {
      console.error('Signup failed:', err);
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError('Please return to sign in and sign in again to request a new verification link.');
      return;
    }

    setResendingVerification(true);
    setError('');
    try {
      await sendEmailVerification(currentUser);
      setVerificationEmailSent(true);
    } catch (verificationError: any) {
      console.error('Verification email resend failed:', verificationError);
      setError(verificationError.code === 'auth/too-many-requests'
        ? 'Too many requests. Please wait before requesting another verification email.'
        : 'Could not resend the verification email. Please try again later.');
    } finally {
      setResendingVerification(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Background ambient glow circles */}
      <View style={[styles.glowRed, { backgroundColor: colors.accentRedGlow }]} />
      <View style={[styles.glowBlue, { backgroundColor: colors.accentBlueGlow }]} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Top Navigation Row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 9999, backgroundColor: colors.glassBg, borderWidth: 1, borderColor: colors.glassBorder }}
                onPress={() => router.push('/')}
                activeOpacity={0.7}
              >
                <ThemedText style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.3 }}>← PORTAL</ThemedText>
              </TouchableOpacity>
              <ThemeToggle compact={false} />
            </View>

            {/* Brand Header */}
            <Animated.View entering={FadeInDown.duration(500).delay(100)}>
              <View style={styles.brandSection}>
                <View style={[styles.logoCircle, { backgroundColor: colors.accentRedGlow }]}>
                  <ShieldIcon size={40} color={colors.accentRed} />
                </View>
                <ThemedText style={styles.brandTitle}>KALASAG AI</ThemedText>
                <ThemedText style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
                  {step === 'form' ? 'Create Citizen Account' : 'Email Verification'}
                </ThemedText>
              </View>
            </Animated.View>

            {/* Step 1: Registration Form */}
            {step === 'form' && (
              <Animated.View entering={FadeInDown.duration(600).delay(200)}>
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.glassBg,
                      borderColor: colors.glassBorder,
                    },
                    Shadows.sm,
                  ]}
                >
                  <ThemedText style={[styles.cardTitle, { color: colors.text }]}>
                    Register Citizen Profile
                  </ThemedText>
                  <ThemedText style={[styles.cardDesc, { color: colors.textSecondary }]}>
                    Sign up to submit emergency reports and receive official dispatch assistance from MDRRMO Gumaca.
                  </ThemedText>

                  {/* Error Banner */}
                  {error ? (
                    <View
                      style={[
                        styles.errorBanner,
                        {
                          backgroundColor: colors.accentRedGlow,
                          borderColor: colors.accentRed,
                        },
                      ]}
                    >
                      <AlertIcon size={14} color={colors.badgeRedText} />
                      <ThemedText style={[styles.errorText, { color: colors.badgeRedText }]}>
                        {error}
                      </ThemedText>
                    </View>
                  ) : null}

                  {Platform.OS === 'web' && (
                    <>
                      <TouchableOpacity
                        style={[
                          styles.googleBtn,
                          {
                            backgroundColor: colors.backgroundElement,
                            borderColor: colors.accentBlue,
                          },
                        ]}
                        onPress={handleGoogleSignUp}
                        disabled={loading || googleLoading}
                        activeOpacity={0.8}
                      >
                        {googleLoading ? (
                          <ActivityIndicator size="small" color={colors.accentBlue} />
                        ) : (
                          <View style={styles.googleBtnContent}>
                            <GoogleIcon size={20} />
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <ThemedText style={[styles.googleBtnTitle, { color: colors.text }]}>
                                  Instant Sign Up with Google
                                </ThemedText>
                                <View style={[styles.verifiedBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
                                  <ThemedText style={{ fontSize: 9, fontWeight: '800', color: colors.accentBlue, letterSpacing: 0.5 }}>
                                    INSTANT
                                  </ThemedText>
                                </View>
                              </View>
                              <ThemedText style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                                Auto-verified account • Bypasses manual form
                              </ThemedText>
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Divider */}
                  <View style={styles.dividerRow}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.glassBorder }]} />
                    <ThemedText style={[styles.dividerText, { color: colors.textMuted }]}>
                      {Platform.OS === 'web' ? 'or register manually below' : 'Register with email'}
                    </ThemedText>
                    <View style={[styles.dividerLine, { backgroundColor: colors.glassBorder }]} />
                  </View>

                  {/* Full Name */}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                      FULL NAME *
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                      placeholder="Juan Dela Cruz"
                      placeholderTextColor={colors.textMuted}
                      value={fullName}
                      onChangeText={setFullName}
                      autoComplete="name"
                      editable={!loading}
                    />
                  </View>

                  {/* Contact Number */}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                      CONTACT NUMBER *
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                      placeholder="09171234567"
                      placeholderTextColor={colors.textMuted}
                      value={contactNumber}
                      onChangeText={setContactNumber}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      editable={!loading}
                    />
                  </View>

                  {/* Gmail Address */}
                  <View style={styles.inputGroup}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                        GMAIL / EMAIL ADDRESS *
                      </ThemedText>
                      <ThemedText style={{ fontSize: 10, color: colors.accentBlue, fontWeight: '700' }}>
                        Verification link required
                      </ThemedText>
                    </View>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                      placeholder="juan@gmail.com"
                      placeholderTextColor={colors.textMuted}
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="email"
                      editable={!loading}
                    />
                  </View>

                  {/* Password */}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                      PASSWORD *
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                      placeholder="Minimum 6 characters"
                      placeholderTextColor={colors.textMuted}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      editable={!loading}
                    />
                  </View>

                  {/* Confirm Password */}
                  <View style={styles.inputGroup}>
                    <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                      CONFIRM PASSWORD *
                    </ThemedText>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          backgroundColor: colors.background,
                          color: colors.text,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                      placeholder="Re-enter your password"
                      placeholderTextColor={colors.textMuted}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      editable={!loading}
                    />
                  </View>

                  {/* Anti-Spam & False Reporting Terms Checkbox */}
                  <View style={[styles.termsContainer, { backgroundColor: colors.backgroundElement, borderColor: colors.glassBorder }]}>
                    <TouchableOpacity
                      style={styles.checkboxRow}
                      onPress={() => setTermsAgreed(!termsAgreed)}
                      activeOpacity={0.8}
                    >
                      <View style={[
                        styles.checkboxBox,
                        {
                          borderColor: termsAgreed ? colors.accentBlue : colors.glassBorder,
                          backgroundColor: termsAgreed ? colors.accentBlue : 'transparent',
                        }
                      ]}>
                        {termsAgreed && <CheckIcon size={14} color="#FFF" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText style={[styles.termsText, { color: colors.text }]}>
                          I agree to the <ThemedText style={{ color: colors.accentBlue, fontWeight: '800' }} onPress={() => setShowTermsModal(true)}>Terms &amp; Conditions</ThemedText> and acknowledge that submitting false, prank, or fraudulent emergency reports is strictly prohibited and punishable under Philippine law (RA 10639 &amp; PD 1727).
                        </ThemedText>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setShowTermsModal(true)}
                      style={{ marginTop: 6, alignSelf: 'flex-start' }}
                    >
                      <ThemedText style={{ fontSize: 11, fontWeight: '700', color: colors.accentBlue, textDecorationLine: 'underline' }}>
                        📖 View Penalties &amp; Anti-Spam Policy
                      </ThemedText>
                    </TouchableOpacity>
                  </View>

                  {/* Create the account and send its verification link */}
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: colors.accentRed },
                    ]}
                    onPress={handleCreateAccount}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={styles.primaryBtnText}>
                      {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT & VERIFY EMAIL'}
                    </ThemedText>
                  </TouchableOpacity>

                  {/* Back to Login */}
                  <TouchableOpacity
                    style={[
                      styles.secondaryBtn,
                      {
                        borderColor: colors.glassBorder,
                        backgroundColor: 'transparent',
                        marginTop: 4,
                      },
                    ]}
                    onPress={() => router.back()}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={[styles.secondaryBtnText, { color: colors.text }]}>
                      ALREADY HAVE AN ACCOUNT? SIGN IN
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Step 2: Email Verification */}
            {step === 'verify' && (
              <Animated.View entering={FadeInDown.duration(600)}>
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.glassBg,
                      borderColor: colors.glassBorder,
                    },
                    Shadows.sm,
                  ]}
                >
                  <View style={{ alignItems: 'center', marginBottom: 12 }}>
                    <View style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: colors.accentBlueGlow,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}>
                      <ShieldIcon size={28} color={colors.accentBlue} />
                    </View>
                    <ThemedText style={[styles.cardTitle, { color: colors.text, textAlign: 'center' }]}>
                      Verify Your Email
                    </ThemedText>
                    <ThemedText style={[styles.cardDesc, { color: colors.textSecondary, textAlign: 'center', marginTop: 4 }]}>
                      {verificationEmailSent
                        ? <>We sent a verification link to <ThemedText style={{ fontWeight: '800', color: colors.text }}>{email}</ThemedText>. Open the link, then return here and sign in.</>
                        : <>Your account is ready, but its verification email has not been sent yet. Request a new link below.</>}
                    </ThemedText>
                  </View>

                  {verificationEmailSent && (
                    <View style={[styles.otpNoticeBanner, { backgroundColor: colors.accentBlueGlow, borderColor: colors.accentBlue }]}>
                      <ThemedText style={{ fontSize: 12, fontWeight: '700', color: colors.accentBlue, textAlign: 'center' }}>
                        Check your inbox and spam folder for the Firebase verification email.
                      </ThemedText>
                    </View>
                  )}

                  {/* Error Banner */}
                  {error ? (
                    <View
                      style={[
                        styles.errorBanner,
                        {
                          backgroundColor: colors.accentRedGlow,
                          borderColor: colors.accentRed,
                        },
                      ]}
                    >
                      <AlertIcon size={14} color={colors.badgeRedText} />
                      <ThemedText style={[styles.errorText, { color: colors.badgeRedText }]}>
                        {error}
                      </ThemedText>
                    </View>
                  ) : null}

                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: resendingVerification ? colors.textMuted : colors.accentBlue },
                    ]}
                    onPress={handleResendVerification}
                    disabled={resendingVerification}
                    activeOpacity={0.8}
                  >
                    {resendingVerification ? (
                      <View style={styles.loadingRow}>
                        <ActivityIndicator size="small" color="#FFF" />
                        <ThemedText style={styles.primaryBtnText}>Sending verification link…</ThemedText>
                      </View>
                    ) : (
                      <ThemedText style={styles.primaryBtnText}>RESEND VERIFICATION EMAIL</ThemedText>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.secondaryBtn, { borderColor: colors.glassBorder, backgroundColor: 'transparent' }]}
                    onPress={async () => {
                      await signOut(auth);
                      router.replace('/login');
                    }}
                    disabled={resendingVerification}
                    activeOpacity={0.8}
                  >
                    <ThemedText style={[styles.secondaryBtnText, { color: colors.text }]}>
                      RETURN TO SIGN IN
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            {/* Footer */}
            <Animated.View entering={FadeInDown.duration(500).delay(350)}>
              <View style={styles.footer}>
                <ThemedText style={[styles.footerText, { color: colors.textMuted }]}>
                  © 2026 KALASAG MDRRMO Gumaca
                </ThemedText>
                <ThemedText style={[styles.footerText, { color: colors.textMuted }]}>
                  Anti-Spam &amp; Data Privacy Compliant (RA 10639 / RA 10173)
                </ThemedText>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Terms & Conditions Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.glassBorder }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ShieldIcon size={20} color={colors.accentRed} />
                <ThemedText style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                  Terms &amp; Penalties Policy
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => setShowTermsModal(false)} style={{ padding: 4 }}>
                <CloseIcon size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <ThemedText style={[styles.policyHeading, { color: colors.accentRed }]}>
                1. Prohibition Against False Emergency Reports
              </ThemedText>
              <ThemedText style={[styles.policyText, { color: colors.textSecondary }]}>
                Under Republic Act No. 10639 (The Free Mobile Disaster Alerts Act) and Presidential Decree No. 1727, transmitting false alarms, hoax disaster reports, fictitious distress calls, or manufactured emergencies to MDRRMO or emergency dispatchers is a criminal offense punishable by fines up to ₱40,000 and/or imprisonment.
              </ThemedText>

              <ThemedText style={[styles.policyHeading, { color: colors.accentRed, marginTop: 12 }]}>
                2. Zero Tolerance for Spamming
              </ThemedText>
              <ThemedText style={[styles.policyText, { color: colors.textSecondary }]}>
                Spamming the KalasagAI dispatch system with repetitive, non-emergency, automated, or harassment submissions will result in immediate permanent account termination, IP/device blacklisting, and forwarding of reporter credentials to the Philippine National Police (PNP) for criminal investigation.
              </ThemedText>

              <ThemedText style={[styles.policyHeading, { color: colors.accentBlue, marginTop: 12 }]}>
                3. Mandatory Identity &amp; GPS Verification
              </ThemedText>
              <ThemedText style={[styles.policyText, { color: colors.textSecondary }]}>
                All submitted emergency reports are tagged with device telemetry, GPS coordinates, and timestamp records. Your verified Gmail address is registered to establish authenticated civic responsibility and ensure rapid response coordination.
              </ThemedText>
            </ScrollView>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accentBlue, marginTop: 16 }]}
              onPress={() => {
                setTermsAgreed(true);
                setShowTermsModal(false);
              }}
            >
              <ThemedText style={styles.primaryBtnText}>I UNDERSTAND &amp; ACCEPT TERMS</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  glowRed: {
    position: 'absolute',
    top: -100,
    left: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.5,
  },
  glowBlue: {
    position: 'absolute',
    bottom: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.5,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
    maxWidth: 460,
    alignSelf: 'center',
    width: '100%',
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  brandTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  brandSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  card: {
    padding: Spacing.four,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    gap: Spacing.three,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 20,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  otpNoticeBanner: {
    alignItems: 'center',
    gap: 4,
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  inputGroup: {
    gap: 6,
  },
  googleBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  googleBtnTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  termsContainer: {
    padding: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  termsText: {
    fontSize: 11,
    lineHeight: 16,
  },
  primaryBtn: {
    paddingVertical: 15,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.four,
    gap: 4,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: 20,
  },
  policyHeading: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  policyText: {
    fontSize: 12,
    lineHeight: 18,
  },
});
