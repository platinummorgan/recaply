import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

export const DataUsageScreen: React.FC = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Data Usage & Retention</Text>
        <Text style={styles.updated}>Last Updated: November 7, 2025</Text>

        <Text style={styles.paragraph}>
          This document explains what data Recaply collects, how long we keep it, and how you can manage your data.
        </Text>

        <Text style={styles.sectionTitle}>What Data We Collect</Text>
        
        <Text style={styles.subTitle}>1. Audio Recordings</Text>
        <Text style={styles.bullet}>• Your recorded meeting audio files</Text>
        <Text style={styles.bullet}>• File metadata (duration, date, size)</Text>
        <Text style={styles.bullet}>• Recording location (if enabled)</Text>
        <Text style={styles.paragraph}>
          Purpose: To provide transcription and summarization services.
        </Text>

        <Text style={styles.subTitle}>2. Transcripts & Summaries</Text>
        <Text style={styles.bullet}>• Text transcriptions of your recordings</Text>
        <Text style={styles.bullet}>• AI-generated summaries</Text>
        <Text style={styles.bullet}>• Action items and key decisions</Text>
        <Text style={styles.bullet}>• Tags and categories you create</Text>
        <Text style={styles.paragraph}>
          Purpose: To display, edit, and export your meeting notes.
        </Text>

        <Text style={styles.subTitle}>3. Account Information</Text>
        <Text style={styles.bullet}>• Email address</Text>
        <Text style={styles.bullet}>• Name (optional)</Text>
        <Text style={styles.bullet}>• Profile picture (optional)</Text>
        <Text style={styles.bullet}>• Subscription tier and payment status</Text>
        <Text style={styles.paragraph}>
          Purpose: Account management and authentication.
        </Text>

        <Text style={styles.subTitle}>4. Usage Analytics</Text>
        <Text style={styles.bullet}>• App open/close events</Text>
        <Text style={styles.bullet}>• Feature usage (recording, transcription, export)</Text>
        <Text style={styles.bullet}>• Error logs and crash reports</Text>
        <Text style={styles.bullet}>• Device type and OS version</Text>
        <Text style={styles.paragraph}>
          Purpose: Improve app performance and user experience.
        </Text>

        <Text style={styles.sectionTitle}>Data Retention Periods</Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Active Recordings:</Text>
          <Text style={styles.dataValue}> Indefinite (until you delete)</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Deleted Recordings:</Text>
          <Text style={styles.dataValue}> 30 days (recoverable)</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Permanently Deleted:</Text>
          <Text style={styles.dataValue}> Immediate (cannot recover)</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Transcripts & Summaries:</Text>
          <Text style={styles.dataValue}> Indefinite (until you delete)</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Account Data:</Text>
          <Text style={styles.dataValue}> Duration of account + 90 days</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Analytics Data:</Text>
          <Text style={styles.dataValue}> 12 months</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Payment Records:</Text>
          <Text style={styles.dataValue}> 7 years (tax/legal requirements)</Text>
        </Text>

        <Text style={styles.dataRow}>
          <Text style={styles.dataLabel}>Backup Systems:</Text>
          <Text style={styles.dataValue}> 90 days after deletion</Text>
        </Text>

        <Text style={styles.sectionTitle}>Where Your Data is Stored</Text>
        <Text style={styles.paragraph}>
          • On your device (encrypted local cache)
        </Text>
        <Text style={styles.paragraph}>
          • Secure cloud servers (encrypted at rest)
        </Text>
        <Text style={styles.paragraph}>
          • Third-party AI processors (temporary, for processing only)
        </Text>
        <Text style={styles.paragraph}>
          All data in transit is encrypted using industry-standard TLS/SSL protocols.
        </Text>

        <Text style={styles.sectionTitle}>Third-Party Data Processing</Text>
        <Text style={styles.paragraph}>
          Your audio and text data may be temporarily processed by:
        </Text>
        <Text style={styles.bullet}>• OpenAI Whisper API (transcription)</Text>
        <Text style={styles.bullet}>• LLM providers (summarization)</Text>
        <Text style={styles.bullet}>• Cloud storage providers (AWS, Google Cloud, etc.)</Text>
        <Text style={styles.paragraph}>
          These processors do NOT retain your data after processing is complete, per our agreements with them.
        </Text>

        <Text style={styles.sectionTitle}>Your Data Control Rights</Text>

        <Text style={styles.subTitle}>Access Your Data</Text>
        <Text style={styles.paragraph}>
          You can view all your recordings, transcripts, and summaries directly in the app at any time.
        </Text>

        <Text style={styles.subTitle}>Export Your Data</Text>
        <Text style={styles.paragraph}>
          Export individual or bulk recordings in multiple formats (audio, text, PDF) via the Export screen.
        </Text>

        <Text style={styles.subTitle}>Delete Specific Items</Text>
        <Text style={styles.paragraph}>
          Delete individual recordings, transcripts, or summaries at any time. Items go to a 30-day recovery period before permanent deletion.
        </Text>

        <Text style={styles.subTitle}>Delete All Data</Text>
        <Text style={styles.paragraph}>
          Go to Settings → Account → Delete Account to permanently remove all your data within 90 days.
        </Text>

        <Text style={styles.subTitle}>Opt-Out of Analytics</Text>
        <Text style={styles.paragraph}>
          Disable usage analytics in Settings. Note: Crash reports may still be sent to maintain app stability.
        </Text>

        <Text style={styles.sectionTitle}>Data Minimization</Text>
        <Text style={styles.paragraph}>
          We only collect data necessary to provide our services. You can minimize data collection by:
        </Text>
        <Text style={styles.bullet}>• Disabling location services</Text>
        <Text style={styles.bullet}>• Turning off auto-upload</Text>
        <Text style={styles.bullet}>• Opting out of analytics</Text>
        <Text style={styles.bullet}>• Deleting recordings after export</Text>

        <Text style={styles.sectionTitle}>Children's Data</Text>
        <Text style={styles.paragraph}>
          We do not knowingly collect data from children under 13. If we discover such data, it will be deleted immediately.
        </Text>

        <Text style={styles.sectionTitle}>Data Breach Notification</Text>
        <Text style={styles.paragraph}>
          In the event of a data breach affecting your information, we will notify you within 72 hours via email and in-app notification.
        </Text>

        <Text style={styles.sectionTitle}>Contact Us</Text>
        <Text style={styles.paragraph}>
          For data-related questions or to exercise your rights:
        </Text>
        <Text style={styles.paragraph}>Email: data@recaply.app</Text>
        <Text style={styles.paragraph}>Response time: Within 30 days</Text>

        <View style={styles.spacing} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  updated: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginTop: 25,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#444',
    marginTop: 15,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    marginBottom: 10,
  },
  bullet: {
    fontSize: 16,
    color: '#555',
    lineHeight: 24,
    marginLeft: 10,
    marginBottom: 5,
  },
  dataRow: {
    fontSize: 16,
    color: '#555',
    lineHeight: 28,
    marginBottom: 5,
  },
  dataLabel: {
    fontWeight: '600',
    color: '#333',
  },
  dataValue: {
    color: '#555',
  },
  spacing: {
    height: 40,
  },
});
