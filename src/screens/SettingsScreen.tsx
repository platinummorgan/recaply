import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  TextInput,
} from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings, updateSettings as updateAppSettings, getPendingCount, clearUploadQueue } from '../services/storage';
import { processQueue } from '../services/uploadQueue';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import {
  getEngagementPreferences,
  updateEngagementPreferences,
  type WinBackCadence,
} from '../services/engagement';
import { colors, radii, spacing } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { SectionShell } from '../components/ui/SectionShell';
import {
  getFollowUpStrategyTaggingLiveAt,
  resetFollowUpStrategyTaggingLiveAt,
  setFollowUpStrategyTaggingLiveAt,
  toDateInputValue,
} from '../services/growthInsightsSettings';

type SettingsScreenNavigationProp = StackNavigationProp<any, 'Settings'>;

interface SettingsScreenProps {
  navigation: SettingsScreenNavigationProp;
}

type ReminderTimeOption = {
  label: string;
  hour: number;
  minute: number;
};

const REMINDER_TIME_OPTIONS: ReminderTimeOption[] = [
  { label: '9:00 AM', hour: 9, minute: 0 },
  { label: '12:30 PM', hour: 12, minute: 30 },
  { label: '6:15 PM', hour: 18, minute: 15 },
  { label: '8:30 PM', hour: 20, minute: 30 },
];

const SettingsScreen: React.FC<SettingsScreenProps> = ({navigation}) => {
  const { user, logout, token } = useAuth();
  const [autoUpload, setAutoUpload] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [notificationCadence, setNotificationCadence] = useState<WinBackCadence>('smart');
  const [reminderHour, setReminderHour] = useState(18);
  const [reminderMinute, setReminderMinute] = useState(15);
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [highQualityAudio, setHighQualityAudio] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [allowCellular, setAllowCellular] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [strategyTaggingLiveDateDraft, setStrategyTaggingLiveDateDraft] = useState('');
  const [strategyTaggingLiveDateSaved, setStrategyTaggingLiveDateSaved] = useState('');
  const plan = user?.subscriptionTier || 'free';
  const minutesUsed = user?.minutesUsed || 0;
  const minutesLimit = user?.minutesLimit || 30;
  const isPro = plan === 'pro';
  const usagePercent = isPro ? 0 : Math.min(100, Math.round((minutesUsed / Math.max(minutesLimit, 1)) * 100));
  const minutesSummary = isPro ? 'Unlimited minutes' : `${Math.max(minutesLimit - minutesUsed, 0).toFixed(0)} min left`;

  useEffect(() => {
    loadNetworkSettings();
    loadPendingCount();
    loadEngagementPrefs();
    loadGrowthExperimentSettings();
  }, []);

  async function loadNetworkSettings() {
    const settings = await getSettings();
    setWifiOnly(settings.wifiOnly);
    setAllowCellular(settings.allowCellular);
  }

  async function loadPendingCount() {
    const count = await getPendingCount();
    setPendingCount(count);
  }

  async function loadEngagementPrefs() {
    const prefs = await getEngagementPreferences();
    setNotifications(prefs.notificationsEnabled);
    setNotificationCadence(prefs.winBackCadence);
    setReminderHour(prefs.reminderHour);
    setReminderMinute(prefs.reminderMinute);
  }

  async function loadGrowthExperimentSettings() {
    const value = await getFollowUpStrategyTaggingLiveAt();
    setStrategyTaggingLiveDateSaved(value);
    setStrategyTaggingLiveDateDraft(toDateInputValue(value));
  }

  async function toggleWifiOnly(value: boolean) {
    setWifiOnly(value);
    await updateAppSettings({ wifiOnly: value });
    if (!value) processQueue();
  }

  async function toggleAllowCellular(value: boolean) {
    setAllowCellular(value);
    await updateAppSettings({ allowCellular: value });
    if (value) processQueue();
  }

  async function toggleEngagementNotifications(value: boolean) {
    setNotifications(value);
    try {
      await updateEngagementPreferences({ notificationsEnabled: value });
    } catch {
      Alert.alert('Update Failed', 'Could not update notification preference.');
      setNotifications((current) => !current);
    }
  }

  async function selectReminderCadence(value: WinBackCadence) {
    setNotificationCadence(value);
    try {
      await updateEngagementPreferences({ winBackCadence: value });
    } catch {
      Alert.alert('Update Failed', 'Could not update reminder cadence.');
      setNotificationCadence((current) => (current === 'smart' ? 'daily' : 'smart'));
    }
  }

  async function selectReminderTime(option: ReminderTimeOption) {
    setReminderHour(option.hour);
    setReminderMinute(option.minute);
    try {
      await updateEngagementPreferences({
        reminderHour: option.hour,
        reminderMinute: option.minute,
      });
    } catch {
      Alert.alert('Update Failed', 'Could not update reminder time.');
      void loadEngagementPrefs();
    }
  }

  function formatReminderTime(hour: number, minute: number) {
    const value = new Date();
    value.setHours(hour, minute, 0, 0);
    return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  async function manualUpload() {
    if (pendingCount === 0) {
      Alert.alert('No Pending Uploads', 'All recordings are already uploaded.');
      return;
    }
    setIsProcessing(true);
    try {
      await processQueue();
      await loadPendingCount();
      Alert.alert('Upload Complete', 'All pending recordings have been uploaded.');
    } catch (error: any) {
      Alert.alert('Upload Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  }

  const handleToggle = async (key: string, value: boolean, setter: (val: boolean) => void) => {
    setter(value);
    await AsyncStorage.setItem(key, JSON.stringify(value));
  };

  const clearCache = () => {
    Alert.alert(
      'Clear Cache',
      'Are you sure you want to clear all cached recordings?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            // Clear cache logic here
            Alert.alert('Success', 'Cache cleared successfully');
          },
        },
      ],
    );
  };

  const deleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) {
              Alert.alert('Error', 'You must be logged in to delete your account.');
              return;
            }

            setIsDeletingAccount(true);
            try {
              const response = await fetch(apiUrl('/user/account'), {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.error || 'Failed to delete account');
              }

              await clearUploadQueue();
              await logout();

              Alert.alert('Account Deleted', 'Your account and data have been deleted.');
            } catch (error: any) {
              Alert.alert('Delete Failed', error.message || 'Failed to delete account.');
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
    );
  };

  function formatDateLabel(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return `${parsed.toLocaleDateString()} (UTC ${parsed.toISOString().slice(0, 10)})`;
  }

  async function saveStrategyTaggingLiveDate() {
    try {
      const normalized = await setFollowUpStrategyTaggingLiveAt(strategyTaggingLiveDateDraft);
      setStrategyTaggingLiveDateSaved(normalized);
      setStrategyTaggingLiveDateDraft(toDateInputValue(normalized));
      Alert.alert('Saved', 'Growth Insights strategy tagging date updated.');
    } catch (error: any) {
      Alert.alert('Invalid Date', String(error?.message || 'Enter date as YYYY-MM-DD.'));
    }
  }

  async function resetStrategyTaggingLiveDate() {
    const normalized = await resetFollowUpStrategyTaggingLiveAt();
    setStrategyTaggingLiveDateSaved(normalized);
    setStrategyTaggingLiveDateDraft(toDateInputValue(normalized));
    Alert.alert('Reset', 'Growth Insights strategy tagging date reset to default.');
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppCard variant="dark" style={styles.heroCard}>
        <Text style={styles.heroTitle}>Settings</Text>
        <Text style={styles.heroSubtitle}>Account, upload behavior, and privacy controls.</Text>

        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Email</Text>
          <Text style={styles.accountValue}>{user?.email}</Text>
        </View>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Plan</Text>
          <View style={[styles.planBadge, isPro && styles.planBadgePro]}>
            <Text style={styles.planBadgeText}>{plan.toUpperCase()}</Text>
          </View>
        </View>

        {!isPro && (
          <>
            <View style={styles.usageTrack}>
              <View style={[styles.usageFill, { width: `${usagePercent}%` }]} />
            </View>
            <View style={styles.usageMeta}>
              <Text style={styles.usageMetaText}>{minutesUsed.toFixed(0)} / {minutesLimit.toFixed(0)} min used</Text>
              <Text style={styles.usageMetaText}>{minutesSummary}</Text>
            </View>
          </>
        )}

        {isPro && <Text style={styles.usageMetaText}>Unlimited minutes active</Text>}

        <AppButton
          label="Manage Subscription"
          variant="primary"
          style={styles.manageButton}
          onPress={() => navigation.navigate('Subscription')}
        />
      </AppCard>

      {/* Network & Upload Section */}
      <SectionShell title="Network & Upload" style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>WiFi Only Mode</Text>
            <Text style={styles.settingDescription}>Only upload on WiFi</Text>
          </View>
          <Switch
            value={wifiOnly}
            onValueChange={toggleWifiOnly}
            trackColor={{ false: '#d1d5db', true: colors.accent }}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Allow Cellular Data</Text>
            <Text style={styles.settingDescription}>Upload over mobile data</Text>
          </View>
          <Switch
            value={allowCellular}
            onValueChange={toggleAllowCellular}
            trackColor={{ false: '#d1d5db', true: colors.accent }}
            disabled={wifiOnly}
          />
        </View>

        {pendingCount > 0 && (
          <>
            <Text style={styles.pendingInfo}>
              {pendingCount} recording{pendingCount > 1 ? 's' : ''} pending upload
            </Text>
            <AppButton
              label="⬆️ Upload Now"
              onPress={manualUpload}
              loading={isProcessing}
            />
          </>
        )}
      </SectionShell>

      <SectionShell title="Recording" style={styles.section}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>High Quality Audio</Text>
          <Switch
            value={highQualityAudio}
            onValueChange={val => handleToggle('highQualityAudio', val, setHighQualityAudio)}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Auto Upload</Text>
          <Switch
            value={autoUpload}
            onValueChange={val => handleToggle('autoUpload', val, setAutoUpload)}
          />
        </View>
      </SectionShell>

      <SectionShell title="Notifications" style={styles.section}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Win-back reminders</Text>
            <Text style={styles.settingDescription}>
              Prompt users back when capture momentum drops.
            </Text>
          </View>
          <Switch
            value={notifications}
            onValueChange={toggleEngagementNotifications}
            trackColor={{ false: '#d1d5db', true: colors.accent }}
          />
        </View>
        {notifications && (
          <View style={styles.notificationPanel}>
            <Text style={styles.panelCaption}>Cadence</Text>
            <View style={styles.panelChipRow}>
              {(['smart', 'daily'] as WinBackCadence[]).map((option) => {
                const selected = notificationCadence === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.panelChip, selected && styles.panelChipActive]}
                    onPress={() => void selectReminderCadence(option)}
                  >
                    <Text style={[styles.panelChipText, selected && styles.panelChipTextActive]}>
                      {option === 'smart' ? 'Smart (Recommended)' : 'Daily'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.panelCaption}>Reminder Time</Text>
            <View style={styles.panelChipRow}>
              {REMINDER_TIME_OPTIONS.map((option) => {
                const selected = reminderHour === option.hour && reminderMinute === option.minute;
                return (
                  <TouchableOpacity
                    key={option.label}
                    style={[styles.panelChip, selected && styles.panelChipActive]}
                    onPress={() => void selectReminderTime(option)}
                  >
                    <Text style={[styles.panelChipText, selected && styles.panelChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.panelSummaryText}>
              Current reminder time: {formatReminderTime(reminderHour, reminderMinute)}
            </Text>
          </View>
        )}
      </SectionShell>

      <SectionShell title="Storage" style={styles.section}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Save to Cloud</Text>
          <Switch
            value={saveToCloud}
            onValueChange={val => handleToggle('saveToCloud', val, setSaveToCloud)}
          />
        </View>

        <AppButton label="Clear Cache" onPress={clearCache} />
      </SectionShell>

      <SectionShell title="Legal & Privacy" style={styles.section}>
        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => Linking.openURL('https://htmlpreview.github.io/?https://github.com/platinummorgan/recaply/blob/main/docs/privacy.html')}
        >
          <Text style={styles.settingLabel}>Privacy Policy</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.settingRow}
          onPress={() => Linking.openURL('https://htmlpreview.github.io/?https://github.com/platinummorgan/recaply/blob/main/docs/terms.html')}
        >
          <Text style={styles.settingLabel}>Terms of Service</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      </SectionShell>

      <SectionShell title="Growth & Experiments" style={styles.section}>
        <Text style={styles.settingDescription}>
          Review live paywall and translation conversion counters.
        </Text>
        <Text style={styles.panelCaption}>Strategy Tagging Live Date (UTC)</Text>
        <TextInput
          value={strategyTaggingLiveDateDraft}
          onChangeText={setStrategyTaggingLiveDateDraft}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.growthInput}
        />
        <Text style={styles.panelSummaryText}>
          Current: {strategyTaggingLiveDateSaved ? formatDateLabel(strategyTaggingLiveDateSaved) : 'Not set'}
        </Text>
        <View style={styles.growthActionRow}>
          <AppButton
            label="Save Date"
            variant="info"
            style={styles.growthActionButton}
            onPress={() => void saveStrategyTaggingLiveDate()}
          />
          <AppButton
            label="Reset Default"
            variant="warning"
            style={styles.growthActionButton}
            onPress={() => void resetStrategyTaggingLiveDate()}
          />
        </View>
        <AppButton
          label="Open Growth Insights"
          variant="info"
          style={styles.experimentButton}
          onPress={() => navigation.navigate('PaywallInsights')}
        />
      </SectionShell>

      <SectionShell title="Account Actions" style={styles.section}>
        <AppButton
          label="Logout"
          variant="danger"
          onPress={handleLogout}
        />

        <AppButton
          label={isDeletingAccount ? 'Deleting Account...' : 'Delete Account'}
          variant="danger"
          style={styles.deleteButton}
          onPress={deleteAccount}
          disabled={isDeletingAccount}
        />
      </SectionShell>

      <View style={styles.footer}>
        <Text style={styles.version}>Recaply v1.1.1</Text>
        <Text style={styles.copyright}>© 2025 Recaply. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingBottom: 24,
  },
  heroCard: {
    backgroundColor: colors.surfaceDark,
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textOnDark,
  },
  heroSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    color: colors.textOnDarkMuted,
  },
  section: {
    marginTop: 14,
    marginHorizontal: spacing.md,
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  accountLabel: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
  accountValue: {
    fontSize: 13,
    color: colors.border,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  planBadge: {
    backgroundColor: colors.accentStrong,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  planBadgePro: {
    backgroundColor: colors.successDark,
    borderColor: colors.success,
  },
  planBadgeText: {
    fontSize: 11,
    color: colors.surface,
    fontWeight: '700',
  },
  usageTrack: {
    marginTop: 6,
    height: 9,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceDarkElevated,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  usageMeta: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  usageMetaText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  manageButton: {
    marginTop: 8,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  settingLabel: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  deleteButton: {
    marginTop: 12,
  },
  linkButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  linkText: {
    fontSize: 16,
    color: colors.accent,
  },
  arrow: {
    fontSize: 24,
    color: '#ccc',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  version: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  copyright: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  chevron: {
    fontSize: 20,
    color: colors.textMuted,
    marginLeft: 8,
  },
  settingDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notificationPanel: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 12,
  },
  panelCaption: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 6,
  },
  panelChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  panelChip: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  panelChipActive: {
    borderColor: colors.accent,
    backgroundColor: '#e8f0ff',
  },
  panelChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  panelChipTextActive: {
    color: colors.accentInfoText,
  },
  panelSummaryText: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pendingInfo: {
    fontSize: 14,
    color: colors.warning,
    padding: 12,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.sm,
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  experimentButton: {
    marginTop: 10,
  },
  growthInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  growthActionRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 8,
  },
  growthActionButton: {
    flex: 1,
  },
});

export default SettingsScreen;
