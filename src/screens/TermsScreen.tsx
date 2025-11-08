import React from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

export const TermsScreen: React.FC = () => {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Last Updated: November 7, 2025</Text>

        <Text style={styles.paragraph}>
          Welcome to Recaply. By using our app, you agree to these Terms of Service. Please read them carefully.
        </Text>

        <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
        <Text style={styles.paragraph}>
          By accessing or using Recaply, you agree to be bound by these Terms of Service and all applicable laws and regulations. If you do not agree with any of these terms, you are prohibited from using this app.
        </Text>

        <Text style={styles.sectionTitle}>2. Service Description</Text>
        <Text style={styles.paragraph}>
          Recaply provides:
        </Text>
        <Text style={styles.bullet}>• Audio recording capabilities for meetings and conversations</Text>
        <Text style={styles.bullet}>• AI-powered transcription services</Text>
        <Text style={styles.bullet}>• Automated summary generation with action items</Text>
        <Text style={styles.bullet}>• Export and sharing functionality</Text>

        <Text style={styles.sectionTitle}>3. User Responsibilities</Text>
        <Text style={styles.paragraph}>You agree to:</Text>
        <Text style={styles.bullet}>• Obtain consent before recording any conversation where required by law</Text>
        <Text style={styles.bullet}>• Comply with all local, state, and federal recording laws</Text>
        <Text style={styles.bullet}>• Use the service only for lawful purposes</Text>
        <Text style={styles.bullet}>• Not record confidential information without proper authorization</Text>
        <Text style={styles.bullet}>• Not use the service to harm, harass, or violate others' rights</Text>

        <Text style={styles.sectionTitle}>4. Recording Consent Laws</Text>
        <Text style={styles.paragraph}>
          IMPORTANT: You are solely responsible for ensuring you have legal permission to record conversations. Recording laws vary by jurisdiction. Some require all-party consent, others require only one-party consent. Recaply is not liable for your failure to obtain proper consent.
        </Text>

        <Text style={styles.sectionTitle}>5. Subscription & Payment</Text>
        <Text style={styles.paragraph}>
          • Free Tier: 30 minutes per month
        </Text>
        <Text style={styles.paragraph}>
          • Lite Plan: $9/month for 300 minutes
        </Text>
        <Text style={styles.paragraph}>
          • Pro Plan: $19/month for unlimited minutes
        </Text>
        <Text style={styles.paragraph}>
          • Metered credits available at $0.10 per minute
        </Text>
        <Text style={styles.paragraph}>
          Subscriptions auto-renew unless canceled at least 24 hours before renewal. No refunds for partial months.
        </Text>

        <Text style={styles.sectionTitle}>6. AI Processing Disclaimer</Text>
        <Text style={styles.paragraph}>
          Our AI transcription and summarization services aim for high accuracy but are not perfect. You are responsible for reviewing and verifying all transcripts and summaries. Do not rely solely on AI output for critical decisions, legal matters, or medical information.
        </Text>

        <Text style={styles.sectionTitle}>7. Content Ownership</Text>
        <Text style={styles.paragraph}>
          You retain all rights to your recordings and content. By using Recaply, you grant us a limited license to process your content for the purpose of providing our services (transcription, summarization, storage).
        </Text>

        <Text style={styles.sectionTitle}>8. Prohibited Uses</Text>
        <Text style={styles.paragraph}>You may NOT use Recaply to:</Text>
        <Text style={styles.bullet}>• Record conversations without required consent</Text>
        <Text style={styles.bullet}>• Violate any laws or regulations</Text>
        <Text style={styles.bullet}>• Infringe on others' intellectual property or privacy rights</Text>
        <Text style={styles.bullet}>• Upload malicious content or malware</Text>
        <Text style={styles.bullet}>• Attempt to hack, reverse engineer, or exploit the service</Text>
        <Text style={styles.bullet}>• Resell or redistribute our services without authorization</Text>

        <Text style={styles.sectionTitle}>9. Service Availability</Text>
        <Text style={styles.paragraph}>
          We strive for 99.9% uptime but cannot guarantee uninterrupted service. We reserve the right to modify, suspend, or discontinue any aspect of the service at any time.
        </Text>

        <Text style={styles.sectionTitle}>10. Limitation of Liability</Text>
        <Text style={styles.paragraph}>
          Recaply is provided "AS IS" without warranties of any kind. We are not liable for:
        </Text>
        <Text style={styles.bullet}>• Lost or corrupted recordings</Text>
        <Text style={styles.bullet}>• Transcription errors or inaccuracies</Text>
        <Text style={styles.bullet}>• Service interruptions or data loss</Text>
        <Text style={styles.bullet}>• Damages resulting from unauthorized recording</Text>
        <Text style={styles.bullet}>• Any indirect, incidental, or consequential damages</Text>

        <Text style={styles.sectionTitle}>11. Account Termination</Text>
        <Text style={styles.paragraph}>
          We reserve the right to suspend or terminate your account if you violate these terms or engage in illegal or abusive behavior. You may cancel your account at any time through the app settings.
        </Text>

        <Text style={styles.sectionTitle}>12. Indemnification</Text>
        <Text style={styles.paragraph}>
          You agree to indemnify and hold Recaply harmless from any claims, damages, or expenses arising from your use of the service, including violations of recording consent laws.
        </Text>

        <Text style={styles.sectionTitle}>13. Governing Law</Text>
        <Text style={styles.paragraph}>
          These Terms are governed by the laws of [Your State/Country]. Any disputes shall be resolved in the courts of [Your Jurisdiction].
        </Text>

        <Text style={styles.sectionTitle}>14. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We may modify these Terms at any time. Continued use of the app after changes constitutes acceptance of the new terms. Material changes will be notified through the app.
        </Text>

        <Text style={styles.sectionTitle}>15. Contact Information</Text>
        <Text style={styles.paragraph}>
          For questions about these Terms, contact us at:
        </Text>
        <Text style={styles.paragraph}>Email: legal@recaply.app</Text>
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
