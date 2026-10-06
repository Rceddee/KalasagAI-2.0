import React from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  Linking, 
  View, 
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { BottomTabInset, Spacing, Shadows } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PhoneIcon, ShieldIcon, FlameIcon, MedicalIcon } from '@/components/Icons';
import { GUMACA_HOTLINES, NATIONAL_EMERGENCY } from '@/constants/hotlines';

export default function GuidelinesScreen() {
  const { colors } = useTheme();
  const { user, citizenProfile, logout } = useAuth();

  const handleLogout = () => {
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
  
  const safeAreaInsets = useSafeAreaInsets();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };

  const contentPlatformStyle = {
    paddingTop: Platform.OS === 'android' ? insets.top : Spacing.four,
    paddingLeft: insets.left,
    paddingRight: insets.right,
    paddingBottom: Math.max(insets.bottom + 25, 145),
  };

  const handleCallNumber = async (num: string) => {
    try {
      await Linking.openURL(`tel:${num}`);
    } catch (error) {
      console.error('Could not open phone dialer:', error);
      Alert.alert('Unable to place call', 'Please use your phone dialer to call this emergency number.');
    }
  };

  const emergencyContacts = [
    { name: 'National Emergency Hotline', number: NATIONAL_EMERGENCY, Icon: ShieldIcon, color: colors.accentRed, type: 'Emergency Services' },
    { name: GUMACA_HOTLINES.mdrrmo.name, number: GUMACA_HOTLINES.mdrrmo.mobile, Icon: ShieldIcon, color: colors.accentRed, type: GUMACA_HOTLINES.mdrrmo.type },
    { name: GUMACA_HOTLINES.pnp.name, number: GUMACA_HOTLINES.pnp.mobile, Icon: ShieldIcon, color: colors.accentBlue, type: GUMACA_HOTLINES.pnp.type },
    { name: GUMACA_HOTLINES.bfp.name, number: GUMACA_HOTLINES.bfp.mobile, Icon: FlameIcon, color: colors.accentOrange, type: GUMACA_HOTLINES.bfp.type },
    { name: GUMACA_HOTLINES.helpdesk.name, number: GUMACA_HOTLINES.helpdesk.mobile, Icon: MedicalIcon, color: colors.accentGreen, type: GUMACA_HOTLINES.helpdesk.type },
  ];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={[styles.scrollView, { backgroundColor: colors.background }]}
          contentContainerStyle={[styles.scrollContent, contentPlatformStyle]}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)}>
            <View style={styles.header}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <ThemedText style={styles.headerTitle}>EMERGENCY DIRECTORY</ThemedText>
                <ThemeToggle compact={false} />
              </View>
              <ThemedText style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                MDRRMO Gumaca Local Guidelines & Hotlines
              </ThemedText>
            </View>
          </Animated.View>

          {/* User Profile Card */}
          <Animated.View entering={FadeInDown.duration(500).delay(150)}>
            <View style={[
              styles.profileCard, 
              { backgroundColor: colors.glassBg, borderColor: colors.glassBorder },
              Shadows.sm
            ]}>
              <View style={styles.profileTop}>
                <View style={[styles.avatarCircle, { backgroundColor: colors.accentRedGlow }]}>
                  <ThemedText style={[styles.avatarInitials, { color: colors.accentRed }]}>
                    {(citizenProfile?.name || user?.displayName || 'U')
                      .split(' ')
                      .map((w: string) => w[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.profileInfo}>
                  <ThemedText style={[styles.profileName, { color: colors.text }]}>
                    {citizenProfile?.name || user?.displayName || 'Citizen'}
                  </ThemedText>
                  <ThemedText style={[styles.profileEmail, { color: colors.textSecondary }]}>
                    {user?.email || ''}
                  </ThemedText>
                  {citizenProfile?.contact ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <PhoneIcon size={12} color={colors.textMuted} />
                      <ThemedText style={[styles.profileContact, { color: colors.textMuted }]}>
                        {citizenProfile.contact}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                style={[styles.logoutBtn, { borderColor: colors.glassBorder }]}
                onPress={handleLogout}
                activeOpacity={0.7}
              >
                <ThemedText style={[styles.logoutBtnText, { color: colors.badgeRedText }]}>Sign Out</ThemedText>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Emergency Contacts Section */}
          <Animated.View entering={FadeInDown.duration(500).delay(200)}>
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>LOCAL EMERGENCY HOTLINES</ThemedText>
              <View style={styles.contactsGrid}>
                {emergencyContacts.map((contact, idx) => {
                  const ContactIcon = contact.Icon;
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.contactCard, 
                        { backgroundColor: colors.glassBg, borderColor: colors.glassBorder },
                        Shadows.sm
                      ]}
                      onPress={() => handleCallNumber(contact.number)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.contactHeader}>
                        <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${contact.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                          <ContactIcon size={16} color={contact.color} />
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: colors.accentBlueGlow, borderColor: colors.accentBlue, borderWidth: 1 }]}>
                          <ThemedText style={[styles.typeBadgeText, { color: colors.badgeBlueText }]}>{contact.type}</ThemedText>
                        </View>
                      </View>

                      <ThemedText style={styles.contactName}>{contact.name}</ThemedText>
                      <View style={styles.callRow}>
                        <ThemedText style={[styles.contactNumber, { color: colors.badgeRedText }]}>{contact.number}</ThemedText>
                        <View style={[styles.callPill, { backgroundColor: colors.accentRed }]}>
                          <ThemedText style={styles.callPillText}>CALL</ThemedText>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Animated.View>

          {/* Preparedness Guidelines Section */}
          <Animated.View entering={FadeInDown.duration(600).delay(300)}>
            <View style={styles.section}>
              <ThemedText style={[styles.sectionTitle, { color: colors.textMuted }]}>DISASTER ACTION GUIDELINES</ThemedText>
              <View style={styles.collapsibleWrapper}>
                <Collapsible title="FLOOD PREPAREDNESS & RESPONSE">
                  <ThemedText style={[styles.bulletTitle, { color: colors.badgeRedText }]}>Before:</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Store clean drinking water and non-perishable food.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Elevate appliances and furniture to higher floors.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Charge mobile phones and power banks.</ThemedText>
                  
                  <ThemedText style={[styles.bulletTitle, { color: colors.badgeRedText }]}>During:</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Evacuate immediately if advised by local officials.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Do not walk or drive through moving flood waters.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Keep monitoring local radio or KALASAG FB updates.</ThemedText>

                  <ThemedText style={[styles.bulletTitle, { color: colors.badgeRedText }]}>After:</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Avoid downed electrical lines and sagged structures.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Discard food that has come into contact with floodwater.</ThemedText>
                </Collapsible>

                <Collapsible title="FIRE SAFETY & EVACUATION">
                  <ThemedText style={[styles.bulletTitle, { color: colors.badgeRedText }]}>Action Plan:</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Crawl low under smoke to find safety.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Touch doors with the back of your hand before opening.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• If your clothes catch fire: Stop, Drop, and Roll.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Call BFP Gumaca immediately and state your location clearly.</ThemedText>
                </Collapsible>

                <Collapsible title="TYPHOON WARNING GUIDELINES">
                  <ThemedText style={[styles.bulletTitle, { color: colors.badgeRedText }]}>Action Plan:</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Secure windows and clear loose roof parts before winds rise.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Keep a first-aid kit, flashlights, and batteries handy.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Avoid coastal or riverside areas due to storm surges.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• If water enters your home, turn off the main switch breaker.</ThemedText>
                </Collapsible>

                <Collapsible title="EARTHQUAKE SAFETY PROTOCOLS">
                  <ThemedText style={[styles.bulletTitle, { color: colors.badgeRedText }]}>Action Plan:</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• DROP, COVER, and HOLD ON under a sturdy desk or table.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• Stay away from glass windows, heavy shelves, and outer walls.</ThemedText>
                  <ThemedText style={[styles.bullet, { color: colors.textSecondary }]}>• After shaking stops, evacuate calmly to an open field area.</ThemedText>
                </Collapsible>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
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
  scrollView: {
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
  header: {
    marginBottom: 16,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  contactsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  contactCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 150,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contactIcon: {
    fontSize: 22,
  },
  typeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  contactName: {
    fontSize: 13,
    fontWeight: '800',
  },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  contactNumber: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  callPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  callPillText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  collapsibleWrapper: {
    gap: 10,
  },
  bulletTitle: {
    fontSize: 11,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 4,
  },
  bullet: {
    fontSize: 12,
    lineHeight: 18,
    marginLeft: 6,
  },
  profileCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 20,
    gap: 14,
  },
  profileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 14,
    fontWeight: '800',
  },
  profileEmail: {
    fontSize: 12,
    fontWeight: '500',
  },
  profileContact: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  logoutBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
