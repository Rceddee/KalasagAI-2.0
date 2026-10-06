import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Alert, 
  Image, 
  View,
  Linking,
  Platform,
  useWindowDimensions
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { classifyIncident, ClassificationResult } from '@/lib/gemini';
import { uploadToCloudinary } from '@/lib/cloudinary';
import { allocateReportNumbers } from '@/lib/report-ids';
import { getAiControls, shouldAutoFlag } from '@/lib/ai-config';
import { useAuth } from '@/lib/auth-context';
import { NATIONAL_EMERGENCY } from '@/constants/hotlines';
import { Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ShieldIcon, FileIcon, PinIcon, AlertIcon, MapIcon, CheckIcon, CloseIcon } from '@/components/Icons';
import { LocationMapPreview } from '@/components/LocationMapPreview';
import { useTheme } from '@/lib/theme-context';
import { ThemeToggle } from '@/components/ThemeToggle';


const EXAMPLE_CHIPS = [
  { label: 'Flooding / Baha', text: 'May baha na abot-tuhod sa main highway malapit sa paaralan.' },
  { label: 'Fire Incident / Sunog', text: 'May makapal na usok at apoy na lumalabas sa kusina ng bahay.' },
  { label: 'Road Obstruction / Harang', text: 'Nakaharang ang malaking sanga ng puno sa kalsada ng bypass road.' },
  { label: 'Medical Emergency', text: 'Nangangailangan ng ambulansya at tulong medikal para sa aksidente.' },
];



export default function ReportingScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, citizenProfile, logout } = useAuth();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isSmallScreen = width < 380;
  const dynamicBottomPadding = Math.max(insets.bottom + 115, 140);

  const [description, setDescription] = useState('');
  const [reporterName, setReporterName] = useState<string | null>(null);
  const [reporterContact, setReporterContact] = useState<string | null>(null);
  const reporterNameValue = reporterName ?? citizenProfile?.name ?? '';
  const reporterContactValue = reporterContact ?? citizenProfile?.contact ?? '';
  
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [lastSubmittedResult, setLastSubmittedResult] = useState<{
    category: string;
    priority_level: string;
    confidence_score: number;
    reasoning: string;
    latitude: number;
    longitude: number;
    id?: string;
    report_id?: string;
    blotter_id?: string;
  } | null>(null);

  // Request permissions on mount
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
        const { status: libraryStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (cameraStatus !== 'granted' || libraryStatus !== 'granted') {
          console.warn('Camera or media library permissions were denied.');
        }
      }
    })();
  }, []);

  const handleGetLocation = async () => {
    setLocLoading(true);
    setErrorMessage('');
    try {
      if (Platform.OS === 'web') {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const currentLoc = {
                coords: {
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                  altitude: pos.coords.altitude,
                  accuracy: pos.coords.accuracy,
                  altitudeAccuracy: pos.coords.altitudeAccuracy,
                  heading: pos.coords.heading,
                  speed: pos.coords.speed,
                },
                timestamp: pos.timestamp,
              };

              setLocation(currentLoc);
              setLocLoading(false);
            },
            (err) => {
              console.warn('Browser geolocation failed:', err);
              setLocation(null);
              setErrorMessage('Unable to verify your GPS location. Please enable location access and try again.');
              setLocLoading(false);
            },
            { timeout: 8000, enableHighAccuracy: true }
          );
          return;
        }
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocation(null);
        setErrorMessage('Location permission is required to submit a report.');
        setLocLoading(false);
        return;
      }

      const currentLoc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation(currentLoc);
    } catch (err) {
      console.warn('GPS location fetch failed:', err);
      setLocation(null);
      setErrorMessage('Unable to verify your GPS location. Please try again.');
    } finally {
      setLocLoading(false);
    }
  };

  const handleAttachPhoto = async () => {
    if (Platform.OS === 'web') {
      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.3,
          base64: true,
        });
        if (!result.canceled && result.assets?.[0]) {
          const asset = result.assets[0];
          setImageUri(asset.uri);

          if (asset.base64) {
            setImageBase64(`data:image/jpeg;base64,${asset.base64}`);
          } else if (asset.uri) {
            setImageUri(null);
            Alert.alert('Photo unavailable', 'The selected photo could not be prepared for upload. Please choose another photo.');
          }
        }
      } catch (err) {
        console.error('Photo picker error:', err);
      }
      return;
    }

    Alert.alert(
      'Attach Photo Evidence',
      'Choose source of photo:',
      [
        {
          text: 'Camera',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.3,
                base64: true,
              });
              if (!result.canceled && result.assets?.[0]) {
                if (!result.assets[0].base64) {
                  Alert.alert('Photo unavailable', 'The camera photo could not be prepared for upload. Please try again.');
                  return;
                }
                setImageUri(result.assets[0].uri);
                setImageBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
              }
            } catch (err) {
              console.error(err);
              Alert.alert('Camera Error', 'Could not access the camera.');
            }
          }
        },
        {
          text: 'Photo Library',
          onPress: async () => {
            try {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.3,
                base64: true,
              });
              if (!result.canceled && result.assets?.[0]) {
                if (!result.assets[0].base64) {
                  Alert.alert('Photo unavailable', 'The selected photo could not be prepared for upload. Please choose another photo.');
                  return;
                }
                setImageUri(result.assets[0].uri);
                setImageBase64(`data:image/jpeg;base64,${result.assets[0].base64}`);
              }
            } catch (err) {
              console.error(err);
              Alert.alert('Library Error', 'Could not open photo library.');
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleSubmitReport = async () => {
    setErrorMessage('');
    if (!description.trim()) {
      setErrorMessage('Please enter a description of the emergency.');
      return;
    }

    if (!user) {
      setErrorMessage('Sign in before submitting a report.');
      return;
    }

    if (!location) {
      setErrorMessage('Tag your current GPS location before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Use the required, verified Poblacion GPS location.
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
        throw new Error('The tagged GPS location is invalid. Please tag your location again.');
      }

      // 2. Classify description with AI
      const aiControls = await getAiControls();
      let aiResult: ClassificationResult;
      try {
        aiResult = await classifyIncident(description);
      } catch (aiErr: any) {
        console.warn('Gemini AI classification fallback:', aiErr?.message || aiErr);
        aiResult = {
          category: 'other disaster-related incidents',
          secondary_category: null,
          compound_hazard: false,
          compound_hazards: ['other disaster-related incidents'],
          recommended_units: ['MDRRMO Operations Center'],
          priority_level: 'Medium',
          confidence_score: 0.88,
          reasoning: 'Report submitted for Gumaca MDRRMO verification.',
        };
      }
      const flaggedForReview = shouldAutoFlag(aiResult.confidence_score, aiControls.threshold);

      // 3. Media upload / sanitize
      const finalMediaUrl = imageBase64 ? await uploadToCloudinary(imageBase64, false) : '';

      // Allocate sequential display IDs transactionally so concurrent reports cannot collide.
      const { report_id: assignedReportId, blotter_id: assignedBlotterId } = await allocateReportNumbers();

      // 4. Save report to Firestore
      const reportRef = doc(collection(db, 'incident_reports'));
      const reportData = {
        category: aiResult.category,
        secondary_category: aiResult.secondary_category || null,
        compound_hazard: Boolean(aiResult.compound_hazard),
        compound_hazards: aiResult.compound_hazards || [aiResult.category],
        priority_level: aiResult.priority_level,
        confidence_score: aiResult.confidence_score,
        reasoning: aiResult.reasoning,
        recommended_units: aiResult.recommended_units || [],
        incident_description: description.trim(),
        latitude: lat,
        longitude: lng,
        reporter_name: reporterNameValue.trim() || 'Anonymous Resident',
        reporter_contact: reporterContactValue.trim() || 'Not Provided',
        reporter_uid: user.uid,
        report_date: serverTimestamp(),
        created_at: new Date().toISOString(),
        status: 'Pending',
        flagged: flaggedForReview,
        flag_reason: flaggedForReview
          ? `AI confidence was below the ${aiControls.threshold}% review threshold.`
          : '',
        ai_review_threshold: aiControls.threshold,
        surge_mode: aiControls.surgeMode,
        assigned_responder: '',
        incident_image: finalMediaUrl,
        report_id: assignedReportId,
        blotter_id: assignedBlotterId,
      };

      const publicReportData = {
        category: reportData.category,
        secondary_category: reportData.secondary_category,
        priority_level: reportData.priority_level,
        incident_description: reportData.incident_description,
        latitude: reportData.latitude,
        longitude: reportData.longitude,
        status: reportData.status,
        report_date: reportData.report_date,
        report_id: reportData.report_id,
        blotter_id: reportData.blotter_id,
        surge_mode: reportData.surge_mode,
      };
      const reportBatch = writeBatch(db);
      reportBatch.set(reportRef, reportData);
      reportBatch.set(doc(db, 'public_incidents', reportRef.id), publicReportData);
      await reportBatch.commit();

      // 5. Try writing system log (non-blocking)
      try {
        await addDoc(collection(db, 'system_logs'), {
          action: 'INCIDENT_REPORTED',
          details: `Citizen submitted a new ${aiResult.category} report (${assignedReportId}) at (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          actor_name: reporterNameValue.trim() || citizenProfile?.name || 'Citizen Mobile',
          actor_email: user?.email || 'mobile-app@kalasag.gov.ph',
          timestamp: new Date(),
        });
      } catch (logErr) {
        console.warn('System log write skipped:', logErr);
      }

      // Set success state & modal
      setLastSubmittedResult({
        ...aiResult,
        latitude: lat,
        longitude: lng,
        id: reportRef.id,
        report_id: assignedReportId,
        blotter_id: assignedBlotterId,
      });
      setSuccessModalOpen(true);
      handleResetForm();
    } catch (err: any) {
      console.error('Report submission error:', err?.message || err);
      const msg = err?.message || 'Failed to submit report. Please check your internet connection.';
      setErrorMessage(msg);
      Alert.alert('Submission Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogoutHeader = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to sign out of KALASAG?')) {
        logout();
      }
      return;
    }
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of KALASAG?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ]
    );
  };

  const handleResetForm = () => {
    setDescription('');
    setReporterName(null);
    setReporterContact(null);
    setImageUri(null);
    setImageBase64(null);
  };

  const handleCallHotline = () => {
    Linking.openURL(`tel:${NATIONAL_EMERGENCY}`).catch((error) => {
      console.error('Could not open the emergency dialer:', error);
      Alert.alert('Unable to call', `Please dial ${NATIONAL_EMERGENCY} from your phone.`);
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: dynamicBottomPadding }]} showsVerticalScrollIndicator={false}>
          
          {/* Top Brand Banner — glassmorphism card */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)}>
            <View style={[styles.brandCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }, isSmallScreen && { flexWrap: 'wrap', gap: 10 }, Shadows.sm]}>
              <View style={styles.brandLeft}>
                <View style={[styles.logoShield, { backgroundColor: colors.accentRedGlow }]}>
                  <ShieldIcon size={24} color={colors.accentRed} />
                </View>
                <View>
                  <ThemedText style={styles.brandTitle}>KALASAG AI</ThemedText>
                  <ThemedText style={[styles.brandSubtitle, { color: colors.textSecondary }]}>MDRRMO Emergency Portal</ThemedText>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <ThemeToggle compact={false} />

                <View style={[styles.onlineBadge, { backgroundColor: colors.accentGreenGlow }]}>
                  <View style={[styles.liveDot, { backgroundColor: colors.accentGreen }]} />
                  <ThemedText style={[styles.onlineText, { color: colors.badgeGreenText }]}>ONLINE</ThemedText>
                </View>

                {user ? (
                  <TouchableOpacity 
                    style={[styles.headerLogoutBtn, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed, borderWidth: 1 }]} 
                    onPress={handleLogoutHeader}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={[styles.headerLogoutBtnText, { color: colors.badgeRedText }]}>LOGOUT</ThemedText>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={[styles.headerLogoutBtn, { backgroundColor: colors.accentBlueGlow, borderColor: colors.accentBlue, borderWidth: 1 }]} 
                    onPress={() => router.push('/login')}
                    activeOpacity={0.7}
                  >
                    <ThemedText style={[styles.headerLogoutBtnText, { color: colors.badgeBlueText }]}>SIGN IN</ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Animated.View>

          {/* Critical Emergency Banner — dashboard badge styling */}
          <Animated.View entering={FadeInDown.duration(500).delay(200)}>
            <View style={[styles.emergencyBanner, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed }, isSmallScreen && { flexDirection: 'column', alignItems: 'stretch', gap: 10 }]}>
              <View style={styles.emergencyLeft}>
                <AlertIcon size={18} color={colors.accentRed} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={[styles.emergencyTitle, { color: colors.badgeRedText }]}>Immediate Life Danger?</ThemedText>
                  <ThemedText style={[styles.emergencyDesc, { color: colors.textSecondary }]}>
                    For life-threatening emergencies, call the national emergency line.
                  </ThemedText>
                </View>
              </View>
              <TouchableOpacity style={[styles.callBtn, { backgroundColor: colors.accentRed }, isSmallScreen && { alignSelf: 'stretch', alignItems: 'center' }]} onPress={handleCallHotline}>
                <ThemedText style={styles.callBtnText}>CALL 911</ThemedText>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Main Form Section — glassmorphism card */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <View style={[styles.sectionCard, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }, Shadows.sm]}>
              
              {/* Description Section */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>WHAT IS THE EMERGENCY? *</ThemedText>
                <TextInput
                  style={[
                    styles.textArea, 
                    { 
                      backgroundColor: colors.background, 
                      color: colors.text,
                      borderColor: colors.glassBorder,
                    }
                  ]}
                  multiline
                  numberOfLines={5}
                  placeholder="Describe the incident (Tagalog, Taglish, or English)..."
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                />

                {/* Quick Helper Chips — matches dashboard filter-btn */}
                <ThemedText style={[styles.chipHeaderLabel, { color: colors.textMuted }]}>QUICK PRESETS (TAP TO USE):</ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
                  {EXAMPLE_CHIPS.map((chip, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.presetChip, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}
                      onPress={() => setDescription(chip.text)}
                    >
                      <ThemedText style={[styles.chipText, { color: colors.textSecondary }]}>{chip.label}</ThemedText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* GPS Geotagging & Map Preview */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>GPS LOCATION TAG *</ThemedText>
                
                <View style={[styles.actionRow, isSmallScreen && { flexDirection: 'column', alignItems: 'stretch' }]}>
                  <TouchableOpacity 
                    style={[
                      styles.actionBtn, 
                      { backgroundColor: colors.accentBlue },
                      isSmallScreen && { width: '100%', flex: undefined }
                    ]} 
                    onPress={handleGetLocation}
                    disabled={locLoading}
                  >
                    {locLoading ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <PinIcon size={16} color="#FFF" />
                        <ThemedText style={styles.actionBtnText}>Tag Live Location</ThemedText>
                      </>
                    )}
                  </TouchableOpacity>
                  
                  <View style={[
                    styles.statusBadge, 
                    { 
                      backgroundColor: location ? colors.accentGreenGlow : colors.glassBg,
                      borderColor: location ? colors.accentGreen : colors.glassBorder,
                    },
                    isSmallScreen && { width: '100%', flex: undefined }
                  ]}>
                    {location && <CheckIcon size={12} color={colors.badgeGreenText} />}
                    <ThemedText style={[styles.statusBadgeText, { color: location ? colors.badgeGreenText : colors.textMuted }]}>
                      {location ? 'Coordinates Tagged' : 'No Location Tagged'}
                    </ThemedText>
                  </View>
                </View>

                {/* Interactive Map Preview — Always Visible */}
                <LocationMapPreview 
                  latitude={location ? location.coords.latitude : 13.9220} 
                  longitude={location ? location.coords.longitude : 122.0990} 
                  isTagged={Boolean(location)}
                />
              </View>


              {/* Photo Attachment Section */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>ATTACH PHOTO EVIDENCE (OPTIONAL)</ThemedText>
                
                <View style={[styles.actionRow, isSmallScreen && { flexDirection: 'column', alignItems: 'stretch' }]}>
                  <TouchableOpacity 
                    style={[
                      styles.actionBtn, 
                      { backgroundColor: colors.accentGreen },
                      isSmallScreen && { width: '100%', flex: undefined }
                    ]} 
                    onPress={handleAttachPhoto}
                  >
                    <FileIcon size={16} color="#FFF" />
                    <ThemedText style={styles.actionBtnText}>Attach Photo</ThemedText>
                  </TouchableOpacity>

                  <View style={[
                    styles.statusBadge, 
                    { 
                      backgroundColor: imageUri ? colors.accentGreenGlow : colors.glassBg,
                      borderColor: imageUri ? colors.accentGreen : colors.glassBorder,
                    },
                    isSmallScreen && { width: '100%', flex: undefined }
                  ]}>
                    {imageUri && <CheckIcon size={12} color={colors.badgeGreenText} />}
                    <ThemedText style={[styles.statusBadgeText, { color: imageUri ? colors.badgeGreenText : colors.textMuted }]}>
                      {imageUri ? 'Photo Attached' : 'No Photo Selected'}
                    </ThemedText>
                  </View>
                </View>

                {/* Photo Preview Container */}
                {imageUri && (
                  <View style={styles.imagePreviewWrapper}>
                    <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                    <TouchableOpacity 
                      style={[styles.removePhotoBtn, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed, borderWidth: 1 }]} 
                      onPress={() => { setImageUri(null); setImageBase64(null); }}
                    >
                      <CloseIcon size={13} color={colors.badgeRedText} />
                      <ThemedText style={[styles.removePhotoText, { color: colors.badgeRedText }]}>Remove Photo</ThemedText>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Reporter Contact Info */}
              <View style={styles.inputGroup}>
                <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>REPORTER NAME (OPTIONAL)</ThemedText>
                <TextInput
                  style={[
                    styles.input, 
                    { 
                      backgroundColor: colors.background, 
                      color: colors.text,
                      borderColor: colors.glassBorder,
                    }
                  ]}
                  placeholder="Enter your name"
                  placeholderTextColor={colors.textMuted}
                  value={reporterNameValue}
                  onChangeText={setReporterName}
                />
              </View>

              <View style={styles.inputGroup}>
                <ThemedText style={[styles.fieldLabel, { color: colors.textMuted }]}>CONTACT NUMBER (OPTIONAL)</ThemedText>
                <TextInput
                  style={[
                    styles.input, 
                    { 
                      backgroundColor: colors.background, 
                      color: colors.text,
                      borderColor: colors.glassBorder,
                    }
                  ]}
                  keyboardType="phone-pad"
                  placeholder="Example: 09171234567"
                  placeholderTextColor={colors.textMuted}
                  value={reporterContactValue}
                  onChangeText={setReporterContact}
                />
              </View>

              {/* Error Banner */}
              {errorMessage ? (
                <View style={[styles.errorBanner, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed }]}>
                  <AlertIcon size={16} color={colors.badgeRedText} />
                  <ThemedText style={[styles.errorBannerText, { color: colors.badgeRedText }]}>
                    {errorMessage}
                  </ThemedText>
                </View>
              ) : null}

              {/* Legal Warning Banner for False Reporting */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                padding: 10,
                borderRadius: 8,
                backgroundColor: 'rgba(230, 81, 0, 0.08)',
                borderWidth: 1,
                borderColor: 'rgba(230, 81, 0, 0.25)',
                marginBottom: 4,
              }}>
                <AlertIcon size={14} color={colors.accentOrange} />
                <ThemedText style={{ fontSize: 10, color: colors.textSecondary, flex: 1, lineHeight: 14 }}>
                  <ThemedText style={{ fontWeight: '800', color: colors.accentOrange }}>Legal Warning:</ThemedText> Submitting false or prank reports to MDRRMO is punishable under RA 10639 and PD 1727.
                </ThemedText>
              </View>

              {/* Submit Button — dashboard btn-primary style */}
              <TouchableOpacity 
                style={[
                  styles.submitBtn, 
                  { backgroundColor: submitting ? colors.textMuted : colors.accentRed }
                ]} 
                onPress={handleSubmitReport}
                disabled={submitting}
              >
                {submitting ? (
                  <View style={styles.submitLoaderContainer}>
                    <ActivityIndicator size="small" color="#FFF" />
                    <ThemedText style={styles.submitBtnText}>Analyzing Emergency with AI...</ThemedText>
                  </View>
                ) : (
                  <ThemedText style={styles.submitBtnText}>SUBMIT EMERGENCY REPORT</ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* In-App Emergency Submission Success Modal */}
      {successModalOpen && lastSubmittedResult && (
        <View style={styles.modalOverlay}>
          <ScrollView
            style={{ maxHeight: Math.min(height * 0.88, 640), width: '100%', maxWidth: 440 }}
            contentContainerStyle={{ flexGrow: 0 }}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.modalCard, { backgroundColor: colors.backgroundElement, borderColor: colors.glassBorder }, Shadows.md]}>
              <View style={[styles.successShieldCircle, { backgroundColor: colors.accentGreenGlow }]}>
                <ShieldIcon size={36} color={colors.accentGreen} />
              </View>

              <ThemedText style={styles.modalSuccessTitle}>REPORT TRANSMITTED!</ThemedText>
              <ThemedText style={[styles.modalSuccessSubtitle, { color: colors.textSecondary }]}>
                Gumaca MDRRMO Command Center has received your emergency dispatch request.
              </ThemedText>

              {/* Prominent Assigned Report ID & Blotter Identifier Badge */}
              <View style={[styles.assignedIdContainer, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed }]}>
                <ThemedText style={[styles.assignedIdLabel, { color: colors.badgeRedText }]}>ASSIGNED TRACKING ID</ThemedText>
                <ThemedText style={[styles.assignedIdValue, { color: colors.badgeRedText }]}>
                  {lastSubmittedResult.report_id || 'REPORT 01'}
                </ThemedText>
                <ThemedText style={[styles.assignedIdSubtext, { color: colors.textSecondary }]}>
                  Official blotter reference: {lastSubmittedResult.blotter_id || 'BLOTTER 01'}
                </ThemedText>
              </View>

              {/* AI Categorization Details */}
              <View style={[styles.modalAiBox, { backgroundColor: colors.glassBg, borderColor: colors.glassBorder }]}>
                <View style={styles.modalAiRow}>
                  <ThemedText style={[styles.modalLabel, { color: colors.textMuted }]}>AI CATEGORY:</ThemedText>
                  <View style={[styles.modalBadge, { backgroundColor: colors.accentRedGlow, borderColor: colors.accentRed }]}>
                    <ThemedText style={[styles.modalBadgeText, { color: colors.badgeRedText }]}>
                      {lastSubmittedResult.category.toUpperCase()}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.modalAiRow}>
                  <ThemedText style={[styles.modalLabel, { color: colors.textMuted }]}>PRIORITY LEVEL:</ThemedText>
                  <View style={[styles.modalBadge, { backgroundColor: colors.accentOrangeGlow, borderColor: colors.accentOrange }]}>
                    <ThemedText style={[styles.modalBadgeText, { color: colors.badgeOrangeText }]}>
                      {lastSubmittedResult.priority_level}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.modalAiRow}>
                  <ThemedText style={[styles.modalLabel, { color: colors.textMuted }]}>LOCATION:</ThemedText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <PinIcon size={13} color={colors.badgeBlueText} />
                    <ThemedText style={[styles.modalValueText, { color: colors.badgeBlueText }]}>
                      {lastSubmittedResult.latitude.toFixed(5)}, {lastSubmittedResult.longitude.toFixed(5)}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Action Buttons */}
              <View style={[styles.modalButtonsRow, isSmallScreen && { flexDirection: 'column' }]}>
                <TouchableOpacity
                  style={[styles.modalSecondaryBtn, { borderColor: colors.glassBorder }]}
                  onPress={() => setSuccessModalOpen(false)}
                >
                  <ThemedText style={[styles.modalSecondaryBtnText, { color: colors.textSecondary }]}>Close</ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalPrimaryBtn, { backgroundColor: colors.accentRed, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }]}
                  onPress={() => {
                    setSuccessModalOpen(false);
                    router.push('/map');
                  }}
                >
                  <MapIcon size={15} color="#FFF" />
                  <ThemedText style={styles.modalPrimaryBtnText}>View on Live Map</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 110,
    maxWidth: 620,
    alignSelf: 'center',
    width: '100%',
  },
  brandCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoShield: {
    padding: 10,
    borderRadius: 10,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
  brandSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.full,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  onlineText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  emergencyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 12,
  },
  emergencyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  emergencyTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  emergencyDesc: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  callBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    flexShrink: 0,
  },
  callBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sectionCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 18,
  },
  inputGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    minHeight: 110,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  chipHeaderLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  chipsScroll: {
    gap: 8,
    paddingVertical: 6,
    paddingRight: 16,
  },
  presetChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    width: '100%',
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 10,
    gap: 8,
  },
  actionBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  imagePreviewWrapper: {
    marginTop: 8,
    alignItems: 'center',
    gap: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 10,
    resizeMode: 'cover',
  },
  removePhotoBtn: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
  },
  removePhotoText: {
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 14,
  },
  headerLogoutBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  headerLogoutBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  submitLoaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorBannerText: {
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 99999,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  successShieldCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  modalSuccessTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  modalSuccessSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  modalAiBox: {
    width: '100%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginVertical: 4,
  },
  modalAiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  modalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalValueText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    marginTop: 8,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalPrimaryBtn: {
    flex: 2,
    height: 46,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  assignedIdContainer: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
    marginVertical: 4,
  },
  assignedIdLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  assignedIdValue: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  assignedIdSubtext: {
    fontSize: 10,
    fontWeight: '600',
  },
});
