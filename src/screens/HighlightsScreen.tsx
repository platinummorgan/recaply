import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import { getHighlightsLibrary, removeHighlightFromLibrary, type SavedHighlight } from '../services/storage';

const HIGHLIGHT_SOURCE_LABELS: Record<SavedHighlight['source'], string> = {
  summary: 'Summary',
  action_item: 'Action',
  key_point: 'Key point',
  transcript: 'Transcript',
  follow_up: 'Follow-up',
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'Date unknown';
  }
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HighlightsScreen({ navigation }: any) {
  const { token } = useAuth();
  const [highlightsLibrary, setHighlightsLibrary] = useState<SavedHighlight[]>([]);
  const [highlightRemovingId, setHighlightRemovingId] = useState<string | null>(null);
  const [openingCitationId, setOpeningCitationId] = useState<string | null>(null);
  const [showAllHighlights, setShowAllHighlights] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const visibleHighlights = useMemo(
    () => (showAllHighlights ? highlightsLibrary.slice(0, 40) : highlightsLibrary.slice(0, 12)),
    [highlightsLibrary, showAllHighlights],
  );

  const loadHighlights = useCallback(async () => {
    const highlights = await getHighlightsLibrary();
    setHighlightsLibrary(highlights);
  }, []);

  useEffect(() => {
    void loadHighlights();
  }, [loadHighlights]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') {
      return undefined;
    }
    const unsubscribe = navigation.addListener('focus', () => {
      void loadHighlights();
    });
    return unsubscribe;
  }, [loadHighlights, navigation]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await loadHighlights();
    } finally {
      setRefreshing(false);
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

  function confirmRemoveHighlight(highlight: SavedHighlight) {
    Alert.alert(
      'Remove Highlight',
      `Remove this saved highlight from "${highlight.meetingName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => void removeHighlight(highlight.id),
        },
      ],
    );
  }

  async function removeHighlight(highlightId: string) {
    if (highlightRemovingId) {
      return;
    }

    try {
      setHighlightRemovingId(highlightId);
      await removeHighlightFromLibrary(highlightId);
      setHighlightsLibrary((current) => current.filter((entry) => entry.id !== highlightId));
    } catch {
      Alert.alert('Highlights Library', 'Could not remove that highlight right now.');
    } finally {
      setHighlightRemovingId(null);
    }
  }

  async function shareHighlightsLibrary() {
    if (highlightsLibrary.length === 0) {
      Alert.alert('Highlights Library', 'Save highlights from transcripts to share them.');
      return;
    }

    const message = [
      'Recaply Highlights Library',
      '',
      ...highlightsLibrary.slice(0, 20).map((highlight, index) => (
        `${index + 1}. [${highlight.meetingName}] ${highlight.text}`
      )),
    ].join('\n');

    try {
      await Share.share({
        title: 'Recaply Highlights Library',
        message,
      });
    } catch {
      // Keep UI responsive even when share sheet fails.
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.accent]}
          tintColor={colors.accent}
        />
      }
    >
      <AppCard style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>Highlights Library</Text>
            <Text style={styles.subtitle}>Save high-signal moments and reuse them in updates and follow-ups.</Text>
          </View>
          <AppButton
            label="Share"
            variant="dark"
            style={styles.shareButton}
            onPress={() => void shareHighlightsLibrary()}
          />
        </View>
        <Text style={styles.countText}>{highlightsLibrary.length} saved highlights</Text>
      </AppCard>

      {highlightsLibrary.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No highlights yet</Text>
          <Text style={styles.emptyText}>
            Open any transcript and tap "Save highlight" on summary, action items, or key points.
          </Text>
        </AppCard>
      ) : (
        <AppCard style={styles.listCard}>
          {visibleHighlights.map((highlight) => (
            <View key={highlight.id} style={styles.highlightRow}>
              <TouchableOpacity
                style={styles.highlightContentButton}
                onPress={() => void openCitation(highlight.recordingId)}
                disabled={openingCitationId === highlight.recordingId}
              >
                <View style={styles.highlightMetaRow}>
                  <Text style={styles.highlightMeetingName} numberOfLines={1}>
                    {openingCitationId === highlight.recordingId ? 'Opening...' : highlight.meetingName}
                  </Text>
                  <View style={styles.highlightSourceChip}>
                    <Text style={styles.highlightSourceChipText}>
                      {HIGHLIGHT_SOURCE_LABELS[highlight.source]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.highlightDateText}>
                  {highlight.meetingAt ? formatDate(highlight.meetingAt) : 'Saved highlight'}
                </Text>
                <Text style={styles.highlightBodyText} numberOfLines={3}>
                  {highlight.text}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.highlightRemoveButton}
                onPress={() => confirmRemoveHighlight(highlight)}
                disabled={highlightRemovingId === highlight.id}
              >
                <Text style={styles.highlightRemoveButtonText}>
                  {highlightRemovingId === highlight.id ? '...' : 'Remove'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          {highlightsLibrary.length > 12 && (
            <TouchableOpacity
              style={styles.highlightsToggleButton}
              onPress={() => setShowAllHighlights((current) => !current)}
            >
              <Text style={styles.highlightsToggleButtonText}>
                {showAllHighlights ? 'Show fewer' : `Show all (${highlightsLibrary.length})`}
              </Text>
            </TouchableOpacity>
          )}
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
    borderColor: '#d2dff2',
    backgroundColor: '#f8fbff',
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  heroCopy: {
    flex: 1,
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
  },
  shareButton: {
    paddingHorizontal: 14,
  },
  countText: {
    marginTop: 10,
    fontSize: 12,
    color: colors.textSecondary,
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
    lineHeight: 18,
    fontFamily: typography.body,
  },
  listCard: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  highlightRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  highlightContentButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 4,
  },
  highlightMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  highlightMeetingName: {
    flex: 1,
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  highlightSourceChip: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.accentInfoSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  highlightSourceChipText: {
    fontSize: 10,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  highlightDateText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  highlightBodyText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    fontFamily: typography.body,
  },
  highlightRemoveButton: {
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  highlightRemoveButtonText: {
    fontSize: 11,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  highlightsToggleButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  highlightsToggleButtonText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
});
