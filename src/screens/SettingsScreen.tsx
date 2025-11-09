import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings, updateSettings as updateAppSettings, getPendingCount } from '../services/storage';
import { processQueue } from '../services/uploadQueue';
import { useAuth } from '../context/AuthContext';

interface SettingsScreenProps {
  navigation: any;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({navigation}) => {
  const { user, logout, token, refreshUser } = useAuth();
  const [autoUpload, setAutoUpload] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [saveToCloud, setSaveToCloud] = useState(true);
  const [highQualityAudio, setHighQualityAudio] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [allowCellular, setAllowCellular] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');

  const API_URL = 'https://web-production-abd11.up.railway.app';

  useEffect(() => {
    loadNetworkSettings();
    loadPendingCount();
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
          onPress: () => {
            // Delete account logic here
            Alert.alert('Account Deleted', 'Your account has been deleted.');
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

  const setUsage = async (minutes: number) => {
    try {
      const response = await fetch(`${API_URL}/api/user/set-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ minutesUsed: minutes }),
      });

      if (!response.ok) {
        throw new Error('Failed to set usage');
      }

      await refreshUser();
      Alert.alert('Success', `Usage set to ${minutes} minutes`);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const testUsageScenarios = () => {
    Alert.alert(
      'Test Usage Scenarios',
      'Choose a scenario to test:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Custom Amount...', onPress: () => promptCustomUsage() },
        { text: 'Reset to 0', onPress: () => setUsage(0) },
        { text: 'Set to 5', onPress: () => setUsage(5) },
        { text: 'Set to 15', onPress: () => setUsage(15) },
        { text: 'Set to 27 (90%)', onPress: () => setUsage(27) },
        { text: 'Set to 28', onPress: () => setUsage(28) },
        { text: 'Set to 29', onPress: () => setUsage(29) },
        { text: 'Set to 29.5 (near limit)', onPress: () => setUsage(29.5) },
        { text: 'Set to 30 (at limit)', onPress: () => setUsage(30) },
        { text: 'Set to 31 (over limit)', onPress: () => setUsage(31) },
      ],
      { cancelable: true }
    );
  };

  const promptCustomUsage = () => {
    setCustomMinutes('');
    setShowCustomInput(true);
  };

  const handleSetCustomUsage = () => {
    const minutes = parseFloat(customMinutes);
    if (isNaN(minutes) || minutes < 0) {
      Alert.alert('Invalid Input', 'Please enter a valid number.');
      return;
    }
    setShowCustomInput(false);
    setUsage(minutes);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Account Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <View style={styles.accountCard}>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Email:</Text>
            <Text style={styles.accountValue}>{user?.email}</Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Plan:</Text>
            <Text style={[styles.accountValue, styles.planValue]}>
              {user?.subscriptionTier.toUpperCase()}
            </Text>
          </View>
          <View style={styles.accountRow}>
            <Text style={styles.accountLabel}>Minutes:</Text>
            <Text style={styles.accountValue}>
              {user?.minutesUsed || 0} / {user?.subscriptionTier === 'pro' ? '∞' : user?.minutesLimit || 30}
            </Text>
          </View>
          
          <TouchableOpacity
            style={styles.manageButton}
            onPress={() => navigation.navigate('Subscription')}
          >
            <Text style={styles.manageButtonText}>Manage Subscription</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Network & Upload Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network & Upload</Text>
        
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>WiFi Only Mode</Text>
            <Text style={styles.settingDescription}>Only upload on WiFi</Text>
          </View>
          <Switch
            value={wifiOnly}
            onValueChange={toggleWifiOnly}
            trackColor={{ false: '#d1d5db', true: '#6366f1' }}
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
            trackColor={{ false: '#d1d5db', true: '#6366f1' }}
            disabled={wifiOnly}
          />
        </View>

        {pendingCount > 0 && (
          <>
            <Text style={styles.pendingInfo}>
              {pendingCount} recording{pendingCount > 1 ? 's' : ''} pending upload
            </Text>
            <TouchableOpacity
              style={[styles.button, isProcessing && styles.buttonDisabled]}
              onPress={manualUpload}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>⬆️ Upload Now</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recording</Text>
        
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
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Enable Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={val => handleToggle('notifications', val, setNotifications)}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Storage</Text>
        
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Save to Cloud</Text>
          <Switch
            value={saveToCloud}
            onValueChange={val => handleToggle('saveToCloud', val, setSaveToCloud)}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={clearCache}>
          <Text style={styles.buttonText}>Clear Cache</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI & Services</Text>
        <Text style={styles.settingLabel}>LLM Configuration - Coming Soon</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal & Privacy</Text>
        <Text style={styles.settingLabel}>Privacy Policy - Coming Soon</Text>
        <Text style={styles.settingLabel}>Terms of Service - Coming Soon</Text>
        <Text style={styles.settingLabel}>Data Usage - Coming Soon</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        
        <TouchableOpacity
          style={[styles.button, styles.testButton]}
          onPress={testUsageScenarios}>
          <Text style={[styles.buttonText, styles.testText]}>🧪 Test Usage Scenarios</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.dangerButton, {marginTop: 12}]}
          onPress={handleLogout}>
          <Text style={[styles.buttonText, styles.dangerText]}>Logout</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.button, styles.dangerButton, {marginTop: 12}]}
          onPress={deleteAccount}>
          <Text style={[styles.buttonText, styles.dangerText]}>Delete Account</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.version}>Recaply v1.0.0</Text>
        <Text style={styles.copyright}>© 2025 Recaply. All rights reserved.</Text>
      </View>

      {/* Custom Usage Input Modal */}
      <Modal
        visible={showCustomInput}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCustomInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Custom Usage</Text>
            <Text style={styles.modalDescription}>Enter minutes used (0-999):</Text>
            
            <TextInput
              style={styles.modalInput}
              value={customMinutes}
              onChangeText={setCustomMinutes}
              keyboardType="numeric"
              placeholder="e.g., 28"
              autoFocus={true}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCustomInput(false)}
              >
                <Text style={styles.modalButtonTextCancel}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonConfirm]}
                onPress={handleSetCustomUsage}
              >
                <Text style={styles.modalButtonText}>Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: 'white',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  accountCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  accountLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  accountValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  planValue: {
    color: '#007AFF',
  },
  manageButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  manageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 16,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  dangerText: {
    color: 'white',
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
    color: '#007AFF',
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
    color: '#999',
    marginBottom: 5,
  },
  copyright: {
    fontSize: 12,
    color: '#999',
  },
  settingInfo: {
    flex: 1,
    marginRight: 12,
  },
  settingDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  pendingInfo: {
    fontSize: 14,
    color: '#ea580c',
    padding: 12,
    backgroundColor: '#fff7ed',
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  testButton: {
    backgroundColor: '#f59e0b',
    borderWidth: 1,
    borderColor: '#d97706',
  },
  testText: {
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f3f4f6',
  },
  modalButtonConfirm: {
    backgroundColor: '#6366f1',
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextCancel: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default SettingsScreen;
