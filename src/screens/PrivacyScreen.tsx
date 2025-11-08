import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

export const PrivacyScreen: React.FC = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last Updated: November 7, 2025</Text>

        <Text style={styles.sectionTitle}>1. Information We Collect</Text>
        <Text style={styles.paragraph}>
          Recaply collects the following information to provide our meeting transcription and AI summarization services:
        </Text>
        <Text style={styles.bullet}>• Audio recordings from meetings you choose to record</Text>
        <Text style={styles.bullet}>• Transcribed text from your audio recordings</Text>
        <Text style={styles.bullet}>• Account information (email, name)</Text>
        <Text style={styles.bullet}>• Device information and usage analytics</Text>
        <Text style={styles.bullet}>• Payment information (processed by third-party providers)</Text>

        <Text style={styles.sectionTitle}>2. How We Use Your Information</Text>
        <Text style={styles.paragraph}>
          Your information is used exclusively for:
        </Text>
        <Text style={styles.bullet}>• Transcribing your audio recordings</Text>
        <Text style={styles.bullet}>• Generating AI-powered summaries and action items</Text>
        <Text style={styles.bullet}>• Improving our transcription and summarization accuracy</Text>
        <Text style={styles.bullet}>• Providing customer support</Text>
        <Text style={styles.bullet}>• Processing payments and subscriptions</Text>

        <Text style={styles.sectionTitle}>3. Data Storage & Security</Text>
        <Text style={styles.paragraph}>
          We take data security seriously:
        </Text>
        <Text style={styles.bullet}>• Audio files are encrypted in transit and at rest</Text>
        <Text style={styles.bullet}>• Data is stored on secure cloud servers with encryption</Text>
        <Text style={styles.bullet}>• Local cache on your device is encrypted</Text>
        <Text style={styles.bullet}>• Access to your data is restricted to authorized personnel only</Text>
        <Text style={styles.bullet}>• We use industry-standard security practices</Text>

        <Text style={styles.sectionTitle}>4. Data Sharing</Text>
        <Text style={styles.paragraph}>
          We do NOT sell your data. We may share your information only with:
        </Text>
        <Text style={styles.bullet}>• AI service providers (Whisper, LLM APIs) for processing</Text>
        <Text style={styles.bullet}>• Cloud storage providers for data storage</Text>
        <Text style={styles.bullet}>• Payment processors for subscription management</Text>
        <Text style={styles.bullet}>• Law enforcement if legally required</Text>

        <Text style={styles.sectionTitle}>5. Your Rights</Text>
        <Text style={styles.paragraph}>
          You have the right to:
        </Text>
        <Text style={styles.bullet}>• Access all your data at any time</Text>
        <Text style={styles.bullet}>• Export your transcripts and summaries</Text>
        <Text style={styles.bullet}>• Delete specific recordings or all data</Text>
        <Text style={styles.bullet}>• Opt out of analytics and non-essential data collection</Text>
        <Text style={styles.bullet}>• Request account deletion at any time</Text>

        <Text style={styles.sectionTitle}>6. Data Retention</Text>
        <Text style={styles.paragraph}>
          • Active recordings: Stored until you delete them
        </Text>
        <Text style={styles.paragraph}>
          • Deleted recordings: Permanently removed within 30 days
        </Text>
        <Text style={styles.paragraph}>
          • Canceled accounts: All data deleted within 90 days
        </Text>
        <Text style={styles.paragraph}>
          • Backups: Purged from backup systems within 90 days
        </Text>

        <Text style={styles.sectionTitle}>7. Children's Privacy</Text>
        <Text style={styles.paragraph}>
          Recaply is not intended for users under 13 years of age. We do not knowingly collect information from children.
        </Text>

        <Text style={styles.sectionTitle}>8. International Users</Text>
        <Text style={styles.paragraph}>
          If you are using Recaply outside the United States, your data may be transferred to and processed in the United States or other countries where our service providers operate.
        </Text>

        <Text style={styles.sectionTitle}>9. Changes to This Policy</Text>
        <Text style={styles.paragraph}>
          We may update this Privacy Policy from time to time. You will be notified of significant changes through the app or via email.
        </Text>

        <Text style={styles.sectionTitle}>10. Contact Us</Text>
        <Text style={styles.paragraph}>
          For privacy questions or concerns, contact us at:
        </Text>
        <Text style={styles.paragraph}>Email: privacy@recaply.app</Text>
        <Text style={styles.paragraph}>Address: [Your Company Address]</Text>

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
  spacing: {
    height: 40,
  },
});
