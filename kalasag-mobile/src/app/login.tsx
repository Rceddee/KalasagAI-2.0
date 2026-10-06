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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { reload, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';

import { auth, db, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ShieldIcon, AlertIcon, GoogleIcon } from '@/components/Icons';
import { useTheme } from '@/lib/theme-context';
import { ThemeToggle } from '@/components/ThemeToggle';

function getErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Invalid email or password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact MDRRMO for assistance.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}


export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

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

  const handleLogin = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setError('');
    setResetMessage('');
    setLoading(true);

    try {
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      await reload(credential.user);
      if (!credential.user.emailVerified) {
        let verificationSent = false;
        try {
          await sendEmailVerification(credential.user);
          verificationSent = true;
        } catch (verificationError) {
          console.warn('Could not resend verification email:', verificationError);
        }
        await signOut(auth);
        setError(verificationSent
          ? 'Please verify your email using the link we just sent before signing in.'
          : 'Please verify your email using the link sent during signup before signing in.');
        return;
      }

      try {
        await setDoc(doc(db, 'citizens', credential.user.uid), {
          email_verified: true,
          last_login_at: serverTimestamp(),
        }, { merge: true });
      } catch (profileError) {
        console.warn('Could not update citizen verification status:', profileError);
      }
      // Auth state change will be picked up by AuthProvider → navigates to tabs
    } catch (err: any) {
      console.error('Login failed:', err);
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Enter your email address above and try again.');
      setResetMessage('');
      return;
    }

    setResetLoading(true);
    setError('');
    setResetMessage('');
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetMessage('If an account exists for this email, a password reset link has been sent. Check your inbox and spam folder.');
    } catch (resetError: any) {
      console.error('Password reset request failed:', resetError);
      setError(resetError.code === 'auth/network-request-failed'
        ? 'Network error. Check your internet connection and try again.'
        : 'Could not send a password reset email. Please try again later.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (Platform.OS !== 'web') {
      setError('Google sign-in is not configured for this Android app yet. Sign in with your email and password.');
      return;
    }

    setError('');
    setGoogleLoading(true);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const googleUser = result.user;

      // Auto-provision citizen record in Firestore if not already present
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
            last_login_at: serverTimestamp(),
          }, { merge: true });
        }
      } catch (profileErr) {
        console.warn('Citizen profile sync notice:', profileErr);
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in was closed before completion.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // user clicked again or cancelled
      } else {
        setError(getErrorMessage(err.code) || err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {/* Background ambient glow circles matching dashboard login */}
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
                  <ShieldIcon size={48} color={colors.accentRed} />
                </View>
                <ThemedText style={styles.brandTitle}>KALASAG AI</ThemedText>
                <ThemedText style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
                  Citizen Emergency Portal
                </ThemedText>
              </View>
            </Animated.View>

            {/* Login Card */}
            <Animated.View entering={FadeInDown.duration(600).delay(250)}>
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
                  Sign In
                </ThemedText>
                <ThemedText style={[styles.cardDesc, { color: colors.textSecondary }]}>
                  Sign in with your registered account to report emergencies.
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

                {resetMessage ? (
                  <View
                    style={[
                      styles.errorBanner,
                      {
                        backgroundColor: colors.accentBlueGlow,
                        borderColor: colors.accentBlue,
                      },
                    ]}
                  >
                    <ThemedText style={[styles.errorText, { color: colors.badgeBlueText }]}>
                      {resetMessage}
                    </ThemedText>
                  </View>
                ) : null}

                {Platform.OS === 'web' && (
                  <>
                    {/* Browser Google sign-in requires a popup and is not supported by native Firebase Auth. */}
                    <TouchableOpacity
                      style={[
                        styles.googleBtn,
                        {
                          backgroundColor: colors.backgroundElement,
                          borderColor: colors.glassBorder,
                        },
                      ]}
                      onPress={handleGoogleSignIn}
                      disabled={loading || googleLoading}
                      activeOpacity={0.8}
                    >
                      {googleLoading ? (
                        <ActivityIndicator size="small" color={colors.accentBlue} />
                      ) : (
                        <View style={styles.googleBtnContent}>
                          <GoogleIcon size={18} />
                          <ThemedText style={[styles.googleBtnText, { color: colors.text }]}>
                            Continue with Google
                          </ThemedText>
                          <View style={[styles.verifiedBadge, { backgroundColor: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
                            <ThemedText style={{ fontSize: 9, fontWeight: '800', color: colors.accentBlue, letterSpacing: 0.5 }}>
                              VERIFIED
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
                    {Platform.OS === 'web' ? 'or sign in with email' : 'Sign in with email'}
                  </ThemedText>
                  <View style={[styles.dividerLine, { backgroundColor: colors.glassBorder }]} />
                </View>

                {/* Email Input */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    EMAIL ADDRESS
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
                    placeholder="Enter your email"
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

                {/* Password Input */}
                <View style={styles.inputGroup}>
                  <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>
                    PASSWORD
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
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete="current-password"
                    editable={!loading}
                  />
                </View>

                <TouchableOpacity
                  onPress={handlePasswordReset}
                  disabled={loading || resetLoading}
                  activeOpacity={0.7}
                  style={{ alignSelf: 'flex-end', paddingVertical: 4 }}
                >
                  <ThemedText style={{ color: colors.accentBlue, fontSize: 12, fontWeight: '700' }}>
                    {resetLoading ? 'SENDING RESET LINK…' : 'FORGOT PASSWORD?'}
                  </ThemedText>
                </TouchableOpacity>

                {/* Sign In Button */}
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: loading ? colors.textMuted : colors.accentRed },
                  ]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <ThemedText style={styles.primaryBtnText}>SIGN IN</ThemedText>
                  )}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.dividerRow}>
                  <View style={[styles.dividerLine, { backgroundColor: colors.glassBorder }]} />
                  <ThemedText style={[styles.dividerText, { color: colors.textMuted }]}>
                    or
                  </ThemedText>
                  <View style={[styles.dividerLine, { backgroundColor: colors.glassBorder }]} />
                </View>

                {/* Sign Up Link */}
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    {
                      borderColor: colors.glassBorder,
                      backgroundColor: 'transparent',
                    },
                  ]}
                  onPress={() => router.push('/signup')}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <ThemedText style={[styles.secondaryBtnText, { color: colors.text }]}>
                    CREATE NEW ACCOUNT
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {/* Footer */}
            <Animated.View entering={FadeInDown.duration(500).delay(400)}>
              <View style={styles.footer}>
                <ThemedText style={[styles.footerText, { color: colors.textMuted }]}>
                  © 2026 KALASAG MDRRMO Gumaca
                </ThemedText>
                <ThemedText style={[styles.footerText, { color: colors.textMuted }]}>
                  Data Privacy Act of 2012 (RA 10173) Compliant
                </ThemedText>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
    paddingVertical: Spacing.six,
    maxWidth: 460,
    alignSelf: 'center',
    width: '100%',
  },
  brandSection: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  brandTitle: {
    fontSize: 28,
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
  inputGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  googleBtn: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  verifiedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: 'center',
    marginTop: Spacing.five,
    gap: 4,
  },
  footerText: {
    fontSize: 10,
    fontWeight: '500',
  },
});
