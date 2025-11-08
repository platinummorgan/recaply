import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { getPendingCount, getUploadQueue } from '../services/storage';
import { useAuth } from '../context/AuthContext';

const API_URL = 'https://web-production-abd11.up.railway.app';

export default function HomeScreen({ navigation }: any) {
  const { user, token } = useAuth();
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetchRecordings();
    loadPendingCount();
    
    // Refresh pending count every 5 seconds
    const interval = setInterval(loadPendingCount, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadPendingCount() {
    const count = await getPendingCount();
    setPendingCount(count);
  }

  async function fetchRecordings() {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/audio/recordings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setRecordings(data.recordings || []);
      await loadPendingCount(); // Refresh pending count too
    } catch (error) {
      console.error('Error fetching recordings:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🎙️ Recaply</Text>
      <Text style={styles.subtitle}>AI Meeting Assistant</Text>
      
      {/* Usage Info */}
      {user && (
        <View style={styles.usageCard}>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Plan:</Text>
            <View style={styles.planBadge}>
              <Text style={styles.planText}>{user.subscriptionTier.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Minutes used:</Text>
            <Text style={styles.usageValue}>
              {user.minutesUsed || 0} / {user.subscriptionTier === 'pro' ? '∞' : user.minutesLimit || 30}
            </Text>
          </View>
          {user.subscriptionTier !== 'pro' && (
            <TouchableOpacity 
              style={styles.upgradeLink}
              onPress={() => navigation.navigate('Subscription')}
            >
              <Text style={styles.upgradeLinkText}>⬆️ Upgrade Plan</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      
      <TouchableOpacity 
        style={styles.recordButton}
        onPress={() => navigation.navigate('Record')}
      >
        <Text style={styles.recordButtonText}>⏺️ New Recording</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Recordings</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {pendingCount > 0 && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>⏱️ {pendingCount} pending</Text>
              </View>
            )}
            <TouchableOpacity onPress={fetchRecordings}>
              <Text style={styles.refreshText}>↻ Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : recordings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No recordings yet</Text>
            <Text style={styles.emptySubtext}>Tap "New Recording" to get started</Text>
          </View>
        ) : (
          recordings.map((recording) => (
            <TouchableOpacity
              key={recording.id}
              style={styles.recordingCard}
              onPress={() => navigation.navigate('Transcript', {
                transcription: recording.transcript || recording.transcription,
                filename: recording.filename,
                recordingId: recording.id,
              })}
            >
              <Text style={styles.recordingTitle}>{recording.filename}</Text>
              <Text style={styles.recordingDate}>{formatDate(recording.created_at)}</Text>
              <Text style={styles.recordingPreview} numberOfLines={2}>
                {recording.transcript || recording.transcription}
              </Text>
              {recording.summary_json && (
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeText}>✨ Summarized</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      <TouchableOpacity 
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Settings')}
      >
        <Text style={styles.settingsButtonText}>⚙️ Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#6366f1',
    marginTop: 40,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
    marginBottom: 20,
    textAlign: 'center',
  },
  usageCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  usageLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  usageValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  planBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  upgradeLink: {
    marginTop: 8,
    padding: 8,
    alignItems: 'center',
  },
  upgradeLinkText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  recordButton: {
    backgroundColor: '#ef4444',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  recordButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  section: {
    marginTop: 30,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  refreshText: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '500',
  },
  emptyState: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  recordingCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  recordingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  recordingDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  recordingPreview: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  summaryBadge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  summaryBadgeText: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '500',
  },
  settingsButton: {
    marginTop: 30,
    marginHorizontal: 20,
    marginBottom: 40,
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  settingsButtonText: {
    fontSize: 16,
    color: '#6366f1',
    fontWeight: '600',
  },
  pendingBadge: {
    backgroundColor: '#fff7ed',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  pendingText: {
    fontSize: 12,
    color: '#ea580c',
    fontWeight: '500',
  },
});
