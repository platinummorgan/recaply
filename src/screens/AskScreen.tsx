import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';

type AskCitation = {
  recordingId: string;
  meetingName: string;
  meetingAt?: string | null;
  reason?: string;
  snippet?: string;
};

type AskResponse = {
  answer: string;
  citations: AskCitation[];
  followUpQuestions: string[];
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'Date unknown';
  }
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AskScreen({ navigation }: any) {
  const { token } = useAuth();
  const [askQuery, setAskQuery] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [openingCitationId, setOpeningCitationId] = useState<string | null>(null);

  async function askAcrossMeetings() {
    const question = askQuery.trim();
    if (!question) {
      Alert.alert('Ask Recaply', 'Enter a question first.');
      return;
    }
    if (!token) {
      Alert.alert('Ask Recaply', 'You need to be signed in.');
      return;
    }

    try {
      setAskLoading(true);
      setAskError(null);
      const response = await fetch(apiUrl('/audio/ask'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question,
          limit: 20,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || `Failed (${response.status})`);
      }

      const data = await response.json();
      setAskResponse({
        answer: String(data.answer || ''),
        citations: Array.isArray(data.citations) ? data.citations : [],
        followUpQuestions: Array.isArray(data.followUpQuestions) ? data.followUpQuestions : [],
      });
    } catch (error: any) {
      setAskError(error.message || 'Could not answer right now.');
    } finally {
      setAskLoading(false);
    }
  }

  async function openCitation(recordingId: string) {
    if (!token) {
      return;
    }

    try {
      setOpeningCitationId(recordingId);
      const response = await fetch(apiUrl(`/audio/recordings/${recordingId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load source meeting');
      }

      const recording = await response.json();
      navigation.navigate('Transcript', {
        transcription: recording.transcript || recording.transcription || '',
        filename: recording.filename,
        recordingId: recording.id,
        audioUrl: recording.audio_url,
        meetingName: recording.meeting_name,
        meetingLocation: recording.meeting_location,
        meetingContext: recording.meeting_context,
        meetingAt: recording.meeting_at,
        meetingParticipants: recording.meeting_participants,
      });
    } catch (error: any) {
      Alert.alert('Open Source', error.message || 'Could not open source meeting');
    } finally {
      setOpeningCitationId(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <AppCard style={styles.heroCard}>
        <Text style={styles.title}>Ask Recaply</Text>
        <Text style={styles.subtitle}>Ask cross-meeting questions and verify answers with source citations.</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Example: what deadlines did we commit to this week?"
            placeholderTextColor={colors.textMuted}
            value={askQuery}
            onChangeText={setAskQuery}
            onSubmitEditing={() => void askAcrossMeetings()}
          />
          <AppButton
            label={askLoading ? 'Asking...' : 'Ask'}
            variant="dark"
            style={styles.askButton}
            onPress={askAcrossMeetings}
            disabled={askLoading}
            loading={askLoading}
          />
        </View>
        {askError && <Text style={styles.errorText}>{askError}</Text>}
      </AppCard>

      {askResponse ? (
        <AppCard style={styles.responseCard}>
          <Text style={styles.answerText}>{askResponse.answer}</Text>
          {askResponse.citations.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Sources</Text>
              {askResponse.citations.map((citation) => (
                <TouchableOpacity
                  key={`${citation.recordingId}-${citation.meetingName}`}
                  style={styles.citationCard}
                  onPress={() => void openCitation(citation.recordingId)}
                  disabled={openingCitationId === citation.recordingId}
                >
                  <Text style={styles.citationTitle}>
                    {openingCitationId === citation.recordingId ? 'Opening...' : citation.meetingName}
                  </Text>
                  {citation.meetingAt && (
                    <Text style={styles.citationMeta}>{formatDate(citation.meetingAt)}</Text>
                  )}
                  {citation.reason ? <Text style={styles.citationReason}>{citation.reason}</Text> : null}
                  {citation.snippet ? <Text style={styles.citationSnippet} numberOfLines={2}>{citation.snippet}</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {askResponse.followUpQuestions.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Try next</Text>
              <View style={styles.followUpRow}>
                {askResponse.followUpQuestions.map((question) => (
                  <TouchableOpacity
                    key={question}
                    style={styles.followUpChip}
                    onPress={() => setAskQuery(question)}
                  >
                    <Text style={styles.followUpChipText}>{question}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </AppCard>
      ) : (
        <AppCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No answer yet</Text>
          <Text style={styles.emptyText}>Ask about decisions, deadlines, owners, blockers, or next steps.</Text>
        </AppCard>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  heroCard: {
    borderWidth: 1,
    borderColor: '#d2ddf0',
    backgroundColor: '#f8fbff',
  },
  title: {
    fontSize: 24,
    color: colors.textPrimary,
    fontFamily: typography.display,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    fontFamily: typography.body,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
  },
  askButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontWeight: '600',
  },
  responseCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  answerText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    fontFamily: typography.body,
  },
  block: {
    marginTop: 12,
    gap: 8,
  },
  blockTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  citationCard: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 10,
    gap: 2,
  },
  citationTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  citationMeta: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  citationReason: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  citationSnippet: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    fontFamily: typography.body,
  },
  followUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  followUpChip: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followUpChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  emptyText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
});
