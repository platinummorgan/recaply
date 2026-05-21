import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Animated,
  Easing,
  Share,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { Paths, File, Directory } from 'expo-file-system';
import { Audio } from 'expo-av';
import Slider from '@react-native-community/slider';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config/api';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { AppCard } from '../components/ui/AppCard';
import { AppButton } from '../components/ui/AppButton';
import {
  getDefaultTranslationLanguage,
  setDefaultTranslationLanguage,
  TRANSLATION_LANGUAGE_OPTIONS,
} from '../services/translationPreferences';
import { trackTranslationEvent, type TranslationEventName } from '../services/translationAnalytics';
import { trackActivationEvent, type ActivationEventName } from '../services/activationAnalytics';
import {
  getFollowUpStrategyRecommendation,
  recordFollowUpStrategyUsage,
  saveHighlightToLibrary,
  type FollowUpStrategyRecommendation as StoredFollowUpStrategyRecommendation,
  type SavedHighlightSource,
} from '../services/storage';

type SummaryActionItem = {
  task?: string;
  assignee?: string;
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
};

type SummaryData = {
  summary?: string;
  actionItems?: (string | SummaryActionItem)[];
  keyPoints?: string[];
};

type FollowUpTone = 'formal' | 'friendly' | 'neutral';
type PrepTone = 'balanced' | 'challenger' | 'supportive';
type FollowUpMeetingType =
  | 'general'
  | 'project_update'
  | 'sales_call'
  | 'client_success'
  | 'one_on_one'
  | 'interview';
type FollowUpTemplateStyle =
  | 'decision_recap'
  | 'action_push'
  | 'client_update'
  | 'risk_alert'
  | 'next_steps';
type CrmTarget = 'salesforce' | 'hubspot' | 'notion';
type FollowUpReminderCadence = 24 | 48 | 168;
type FollowUpReminderPersona = 'team' | 'executive' | 'client';
type FollowUpEscalationThresholdHours = 0 | 24 | 72;

type FollowUpActionCandidate = {
  id: string;
  text: string;
  owner?: string;
  due?: string;
  priority?: 'high' | 'medium' | 'low';
  source: 'summary' | 'checklist';
};

type FollowUpDraftData = {
  subject: string;
  emailBody: string;
  slackMessage: string;
  actionChecklist: string[];
  tone: FollowUpTone;
};

type MeetingPrepBriefData = {
  briefSummary: string;
  strategicFocus: string[];
  likelyRisks: string[];
  preCallQuestions: string[];
  openingScript: string;
  prepTone: PrepTone;
};

type RecordingMetaState = {
  meetingName?: string;
  meetingLocation?: string;
  meetingContext?: string;
  meetingAt?: string;
  meetingParticipants?: string[];
};

type ExportPreset = 'full' | 'brief' | 'actions';
type SummaryViewMode = 'original' | 'translated';
type TranslationEventSource = 'transcript_translate' | 'transcript_share';
type TranslationLanguage = {
  code: string;
  label: string;
};

type SavedTranslationEntry = {
  targetLanguage: string;
  translatedSummary: SummaryData | null;
  translatedTranscript: string | null;
  updatedAt?: string;
};

type SavedTranslationMap = Record<string, SavedTranslationEntry>;
type TranslationFetchResult = {
  targetLanguage: string;
  translatedSummary: SummaryData | null;
  translatedTranscript: string | null;
};

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

type FollowUpToneOption = {
  value: FollowUpTone;
  label: string;
  hint: string;
};

type PrepToneOption = {
  value: PrepTone;
  label: string;
  hint: string;
};

type FollowUpMeetingTypeOption = {
  value: FollowUpMeetingType;
  label: string;
  hint: string;
};

type FollowUpTemplateOption = {
  value: FollowUpTemplateStyle;
  label: string;
  hint: string;
};

type FollowUpReminderPersonaOption = {
  value: FollowUpReminderPersona;
  label: string;
  hint: string;
};

type FollowUpEscalationThresholdOption = {
  value: FollowUpEscalationThresholdHours;
  label: string;
  hint: string;
};

type OutputTemplateId = 'executive_update' | 'client_recap' | 'project_status';

type OutputTemplateOption = {
  value: OutputTemplateId;
  label: string;
  hint: string;
};

type ShareBundleFormat = 'compact' | 'story';

type ShareBundleFormatOption = {
  value: ShareBundleFormat;
  label: string;
  hint: string;
};

const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  ...TRANSLATION_LANGUAGE_OPTIONS.map((language) => ({
    code: language,
    label: language,
  })),
];

const FOLLOW_UP_TONE_OPTIONS: FollowUpToneOption[] = [
  { value: 'neutral', label: 'Neutral', hint: 'Balanced and professional' },
  { value: 'friendly', label: 'Friendly', hint: 'Warm and approachable' },
  { value: 'formal', label: 'Formal', hint: 'Structured executive tone' },
];

const PREP_BRIEF_TONE_OPTIONS: PrepToneOption[] = [
  { value: 'balanced', label: 'Balanced', hint: 'Neutral prep with practical tradeoffs' },
  { value: 'challenger', label: 'Challenger', hint: 'Push on assumptions, risks, and weak spots' },
  { value: 'supportive', label: 'Supportive', hint: 'Align team confidence and smooth delivery' },
];

const FOLLOW_UP_MEETING_TYPE_OPTIONS: FollowUpMeetingTypeOption[] = [
  { value: 'general', label: 'General', hint: 'Default structure for most meetings' },
  { value: 'project_update', label: 'Project Update', hint: 'Progress, blockers, and deadlines' },
  { value: 'sales_call', label: 'Sales Call', hint: 'Opportunities, objections, and next touchpoint' },
  { value: 'client_success', label: 'Client Success', hint: 'Health check, outcomes, and commitments' },
  { value: 'one_on_one', label: '1:1', hint: 'Coaching points and owner clarity' },
  { value: 'interview', label: 'Interview', hint: 'Candidate signals and decision path' },
];

const FOLLOW_UP_TEMPLATE_OPTIONS: FollowUpTemplateOption[] = [
  { value: 'decision_recap', label: 'Decision Recap', hint: 'Emphasize decisions and rationale' },
  { value: 'action_push', label: 'Action Push', hint: 'Drive execution with owner/date focus' },
  { value: 'client_update', label: 'Client Update', hint: 'Customer-friendly status and next steps' },
  { value: 'risk_alert', label: 'Risk Alert', hint: 'Highlight blockers and mitigation asks' },
  { value: 'next_steps', label: 'Next Steps', hint: 'Simple concise next-step alignment' },
];

const FOLLOW_UP_TEMPLATES_BY_MEETING_TYPE: Record<FollowUpMeetingType, FollowUpTemplateStyle[]> = {
  general: ['next_steps', 'decision_recap', 'action_push'],
  project_update: ['action_push', 'risk_alert', 'decision_recap'],
  sales_call: ['client_update', 'next_steps', 'action_push'],
  client_success: ['client_update', 'next_steps', 'risk_alert'],
  one_on_one: ['next_steps', 'action_push', 'decision_recap'],
  interview: ['decision_recap', 'next_steps', 'risk_alert'],
};

const CRM_TARGET_LABELS: Record<CrmTarget, string> = {
  salesforce: 'Salesforce',
  hubspot: 'HubSpot',
  notion: 'Notion',
};

const FOLLOW_UP_REMINDER_CADENCE_OPTIONS: {
  value: FollowUpReminderCadence;
  label: string;
}[] = [
  { value: 24, label: '24h' },
  { value: 48, label: '48h' },
  { value: 168, label: '1 week' },
];

const FOLLOW_UP_REMINDER_PERSONA_OPTIONS: FollowUpReminderPersonaOption[] = [
  { value: 'team', label: 'Team', hint: 'Warm execution nudge for internal collaborators' },
  { value: 'executive', label: 'Executive', hint: 'Crisp status ask with owners and ETAs' },
  { value: 'client', label: 'Client', hint: 'Customer-facing update tone with accountability' },
];

const FOLLOW_UP_ESCALATION_THRESHOLD_OPTIONS: FollowUpEscalationThresholdOption[] = [
  { value: 0, label: 'Any overdue', hint: 'Escalate as soon as due date passes' },
  { value: 24, label: '24h overdue', hint: 'Escalate after one day overdue' },
  { value: 72, label: '72h overdue', hint: 'Escalate after three days overdue' },
];

const OUTPUT_TEMPLATE_OPTIONS: OutputTemplateOption[] = [
  {
    value: 'executive_update',
    label: 'Executive Update',
    hint: 'Leadership snapshot with decisions, risk, and owners',
  },
  {
    value: 'client_recap',
    label: 'Client Recap',
    hint: 'Customer-safe recap with commitments and timeline',
  },
  {
    value: 'project_status',
    label: 'Project Status',
    hint: 'Delivery status with workstream progress and next steps',
  },
];

const SHARE_BUNDLE_FORMAT_OPTIONS: ShareBundleFormatOption[] = [
  {
    value: 'compact',
    label: 'Compact Format',
    hint: 'Short branded bundle with summary + top actions',
  },
  {
    value: 'story',
    label: 'Story Format',
    hint: 'Long-form branded bundle for full context handoff',
  },
];

const RECAPLY_DEEP_LINK_SCHEME = 'recaply';
const RECAPLY_INSTALL_URL = 'https://play.google.com/store/apps/details?id=com.recaply.app';

function normalizeSummary(value: unknown): SummaryData | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as SummaryData;
    } catch {
      return { summary: value };
    }
  }

  if (typeof value === 'object') {
    return value as SummaryData;
  }

  return null;
}

function normalizeFollowUpDraft(value: unknown): FollowUpDraftData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const subject = String(parsed.subject || '').trim();
  const emailBody = String(parsed.emailBody || '').trim();
  const slackMessage = String(parsed.slackMessage || '').trim();
  const actionChecklist = Array.isArray(parsed.actionChecklist)
    ? parsed.actionChecklist.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const toneRaw = String(parsed.tone || '').trim().toLowerCase();
  const tone: FollowUpTone =
    toneRaw === 'formal' || toneRaw === 'friendly' || toneRaw === 'neutral'
      ? toneRaw
      : 'neutral';

  if (!subject && !emailBody && !slackMessage && actionChecklist.length === 0) {
    return null;
  }

  return {
    subject: subject || 'Meeting follow-up',
    emailBody: emailBody || 'Thanks everyone for the meeting. Please review the recap and action items.',
    slackMessage: slackMessage || 'Meeting follow-up is ready. Please review action items.',
    actionChecklist,
    tone,
  };
}

function normalizeMeetingPrepBrief(value: unknown): MeetingPrepBriefData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const briefSummary = String(parsed.briefSummary || '').trim();
  const strategicFocus = Array.isArray(parsed.strategicFocus)
    ? parsed.strategicFocus.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const likelyRisks = Array.isArray(parsed.likelyRisks)
    ? parsed.likelyRisks.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
    : [];
  const preCallQuestions = Array.isArray(parsed.preCallQuestions)
    ? parsed.preCallQuestions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 12)
    : [];
  const openingScript = String(parsed.openingScript || '').trim();
  const prepToneRaw = String(parsed.prepTone || '').trim().toLowerCase();
  const prepTone: PrepTone =
    prepToneRaw === 'balanced' || prepToneRaw === 'challenger' || prepToneRaw === 'supportive'
      ? prepToneRaw
      : 'balanced';

  if (!briefSummary && strategicFocus.length === 0 && likelyRisks.length === 0 && preCallQuestions.length === 0 && !openingScript) {
    return null;
  }

  return {
    briefSummary: briefSummary || 'No prep summary available.',
    strategicFocus,
    likelyRisks,
    preCallQuestions,
    openingScript: openingScript || 'No opening script generated.',
    prepTone,
  };
}

function normalizeTranslationKey(value: string): string {
  return value.trim().toLowerCase().slice(0, 60);
}

function toTrackingErrorCode(error: unknown): string | undefined {
  const raw = String((error as any)?.message || error || '').trim();
  if (!raw) {
    return undefined;
  }

  return raw
    .slice(0, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSavedTranslations(value: unknown): SavedTranslationMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const parsed: SavedTranslationMap = {};
  const entries = Object.entries(value as Record<string, unknown>);
  for (const [fallbackLanguage, entry] of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }

    const maybeEntry = entry as Record<string, unknown>;
    const targetLanguage = typeof maybeEntry.targetLanguage === 'string'
      ? maybeEntry.targetLanguage.trim().slice(0, 60)
      : fallbackLanguage.trim().slice(0, 60);
    if (!targetLanguage) {
      continue;
    }

    const translatedSummary = normalizeSummary(maybeEntry.translatedSummary);
    const translatedTranscript = typeof maybeEntry.translatedTranscript === 'string'
      ? maybeEntry.translatedTranscript.trim()
      : '';
    if (!translatedSummary && !translatedTranscript) {
      continue;
    }

    parsed[normalizeTranslationKey(targetLanguage)] = {
      targetLanguage,
      translatedSummary,
      translatedTranscript: translatedTranscript || null,
      updatedAt: typeof maybeEntry.updatedAt === 'string' ? maybeEntry.updatedAt : undefined,
    };
  }

  return parsed;
}

function normalizeParticipants(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry).trim())
      .filter((entry) => entry.length > 0);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .map((entry) => String(entry).trim())
            .filter((entry) => entry.length > 0);
        }
      } catch {
        // Fall through to comma split parsing.
      }
    }

    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return [];
}

function getExportPresetLabel(preset: ExportPreset): string {
  if (preset === 'brief') {
    return 'Brief';
  }
  if (preset === 'actions') {
    return 'Actions';
  }
  return 'Full';
}

function getExportPresetHint(preset: ExportPreset): string {
  if (preset === 'brief') {
    return 'Summary + key points snapshot for quick updates.';
  }
  if (preset === 'actions') {
    return 'Action-owner checklist for follow-through.';
  }
  return 'Complete package: metadata, transcript, summary, actions, and key points.';
}

function getFollowUpMeetingTypeLabel(value: FollowUpMeetingType): string {
  return FOLLOW_UP_MEETING_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'General';
}

function getFollowUpTemplateLabel(value: FollowUpTemplateStyle): string {
  return FOLLOW_UP_TEMPLATE_OPTIONS.find((option) => option.value === value)?.label || 'Next Steps';
}

function normalizeActionKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function buildActionCandidateId(source: 'summary' | 'checklist', index: number, text: string): string {
  return `${source}_${index}_${normalizeActionKey(text)}`;
}

function getReminderCadenceLabel(value: FollowUpReminderCadence): string {
  return FOLLOW_UP_REMINDER_CADENCE_OPTIONS.find((option) => option.value === value)?.label || '24h';
}

function getFollowUpReminderPersonaLabel(value: FollowUpReminderPersona): string {
  return FOLLOW_UP_REMINDER_PERSONA_OPTIONS.find((option) => option.value === value)?.label || 'Team';
}

function getFollowUpEscalationThresholdLabel(value: FollowUpEscalationThresholdHours): string {
  return FOLLOW_UP_ESCALATION_THRESHOLD_OPTIONS.find((option) => option.value === value)?.label || '24h overdue';
}

function parseDueTimestamp(value?: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getTime();
}

function getActionOverdueHours(action: FollowUpActionCandidate, now: number = Date.now()): number | null {
  const dueTimestamp = parseDueTimestamp(action.due);
  if (dueTimestamp == null || dueTimestamp >= now) {
    return null;
  }
  return (now - dueTimestamp) / (1000 * 60 * 60);
}

function getActionPriorityWeight(priority?: 'high' | 'medium' | 'low'): number {
  if (priority === 'high') {
    return 40;
  }
  if (priority === 'medium') {
    return 24;
  }
  if (priority === 'low') {
    return 10;
  }
  return 0;
}

function getActionDueWeight(dueTimestamp: number | null, now: number): number {
  if (dueTimestamp == null) {
    return 0;
  }
  const msPerDay = 1000 * 60 * 60 * 24;
  const deltaDays = (dueTimestamp - now) / msPerDay;

  if (deltaDays < 0) {
    return 70;
  }
  if (deltaDays <= 1) {
    return 55;
  }
  if (deltaDays <= 3) {
    return 38;
  }
  if (deltaDays <= 7) {
    return 22;
  }
  if (deltaDays <= 14) {
    return 12;
  }
  return 6;
}

function computeFollowUpActionRiskScore(action: FollowUpActionCandidate, now: number = Date.now()): number {
  const sourceWeight = action.source === 'summary' ? 12 : 4;
  const dueWeight = getActionDueWeight(parseDueTimestamp(action.due), now);
  const priorityWeight = getActionPriorityWeight(action.priority);
  return sourceWeight + dueWeight + priorityWeight;
}

function getFollowUpRiskLabel(score: number): 'Urgent' | 'High' | 'Medium' | 'Low' {
  if (score >= 90) {
    return 'Urgent';
  }
  if (score >= 60) {
    return 'High';
  }
  if (score >= 32) {
    return 'Medium';
  }
  return 'Low';
}

function formatCitationDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'Date unknown';
  }
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function TranscriptScreen({ route, navigation }: any) {
  const { token } = useAuth();
  const {
    transcription,
    filename,
    recordingId,
    audioUrl,
    meetingName: routeMeetingName,
    meetingLocation: routeMeetingLocation,
    meetingContext: routeMeetingContext,
    meetingAt: routeMeetingAt,
    meetingParticipants: routeMeetingParticipants,
  } = route.params || {};
  const transcriptText = typeof transcription === 'string' ? transcription : '';
  const normalizedFilename = typeof filename === 'string' && filename.trim() ? filename : 'recording.m4a';
  const normalizedRecordingId = typeof recordingId === 'string' ? recordingId : undefined;

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [translatedSummary, setTranslatedSummary] = useState<SummaryData | null>(null);
  const [translatedTranscript, setTranslatedTranscript] = useState<string | null>(null);
  const [summaryViewMode, setSummaryViewMode] = useState<SummaryViewMode>('original');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(TRANSLATION_LANGUAGES[0].code);
  const [customLanguageInput, setCustomLanguageInput] = useState('');
  const [activeTranslatedLanguage, setActiveTranslatedLanguage] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationShareLoading, setTranslationShareLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [savedTranslations, setSavedTranslations] = useState<SavedTranslationMap>({});
  const [loading, setLoading] = useState(false);
  const [askQuery, setAskQuery] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResponse, setAskResponse] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [openingCitationId, setOpeningCitationId] = useState<string | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraftData | null>(null);
  const [followUpTone, setFollowUpTone] = useState<FollowUpTone>('neutral');
  const [followUpMeetingType, setFollowUpMeetingType] = useState<FollowUpMeetingType>('general');
  const [followUpTemplateStyle, setFollowUpTemplateStyle] = useState<FollowUpTemplateStyle>('next_steps');
  const [prepBrief, setPrepBrief] = useState<MeetingPrepBriefData | null>(null);
  const [prepTone, setPrepTone] = useState<PrepTone>('balanced');
  const [prepGoal, setPrepGoal] = useState('');
  const [prepBriefLoading, setPrepBriefLoading] = useState(false);
  const [prepBriefError, setPrepBriefError] = useState<string | null>(null);
  const [followUpReminderCadence, setFollowUpReminderCadence] = useState<FollowUpReminderCadence>(24);
  const [followUpReminderPersona, setFollowUpReminderPersona] = useState<FollowUpReminderPersona>('team');
  const [followUpAutoEscalationEnabled, setFollowUpAutoEscalationEnabled] = useState(false);
  const [followUpEscalationThresholdHours, setFollowUpEscalationThresholdHours] =
    useState<FollowUpEscalationThresholdHours>(24);
  const [followUpStrategyRecommendation, setFollowUpStrategyRecommendation] =
    useState<StoredFollowUpStrategyRecommendation | null>(null);
  const [resolvedFollowUpActionIds, setResolvedFollowUpActionIds] = useState<string[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [selectedOutputTemplate, setSelectedOutputTemplate] = useState<OutputTemplateId>('executive_update');
  const [selectedShareBundleFormat, setSelectedShareBundleFormat] = useState<ShareBundleFormat>('compact');
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrlFromDB, setAudioUrlFromDB] = useState<string | null>(audioUrl || null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [showValueStoryExpanded, setShowValueStoryExpanded] = useState(false);
  const [recordingMeta, setRecordingMeta] = useState<RecordingMetaState>({
    meetingName: typeof routeMeetingName === 'string' ? routeMeetingName : undefined,
    meetingLocation: typeof routeMeetingLocation === 'string' ? routeMeetingLocation : undefined,
    meetingContext: typeof routeMeetingContext === 'string' ? routeMeetingContext : undefined,
    meetingAt: typeof routeMeetingAt === 'string' ? routeMeetingAt : undefined,
    meetingParticipants: normalizeParticipants(routeMeetingParticipants),
  });
  const [exportPreset, setExportPreset] = useState<ExportPreset>('full');
  const heroMotion = useRef(new Animated.Value(0)).current;
  const bodyMotion = useRef(new Animated.Value(0)).current;

  const activeTranscript = summaryViewMode === 'translated' && translatedTranscript
    ? translatedTranscript
    : transcriptText;
  const wordCount = useMemo(() => {
    if (!activeTranscript.trim()) {
      return 0;
    }
    return activeTranscript.trim().split(/\s+/).length;
  }, [activeTranscript]);

  const activeSummary = summaryViewMode === 'translated' && translatedSummary
    ? translatedSummary
    : summary;
  const summaryActionCount = activeSummary?.actionItems?.length || 0;
  const summaryPointCount = activeSummary?.keyPoints?.length || 0;
  const summaryStatus = summary ? 'AI summary ready' : 'Summary pending';
  const summaryNarrative = (activeSummary?.summary || '').trim();
  const summaryWordCount = useMemo(() => {
    if (!summaryNarrative) {
      return 0;
    }
    return summaryNarrative.split(/\s+/).length;
  }, [summaryNarrative]);
  const rawReadMinutes = Math.max(1, Math.round(wordCount / 180));
  const summaryReadMinutes = summaryWordCount > 0
    ? Math.max(1, Math.round(summaryWordCount / 180))
    : 0;
  const readMinutesSaved = summaryWordCount > 0
    ? Math.max(rawReadMinutes - summaryReadMinutes, 0)
    : 0;
  const compressionPercent = summaryNarrative.length > 0 && activeTranscript.length > 0
    ? Math.max(
      0,
      Math.min(99, Math.round((1 - (summaryNarrative.length / Math.max(activeTranscript.length, 1))) * 100)),
    )
    : 0;
  const rawTranscriptPreview = useMemo(() => {
    const trimmed = activeTranscript.trim();
    if (!trimmed) {
      return 'No transcript text yet. Capture or load a recording to view the original notes.';
    }
    return `Raw note preview: ${trimmed}`;
  }, [activeTranscript]);
  const recapPreview = summaryNarrative
    ? `AI recap: ${summaryNarrative}`
    : 'Generate AI Summary to turn raw notes into a clean executive recap.';
  const valueStorySignal = summaryNarrative
    ? `${readMinutesSaved} min faster read`
    : 'Generate summary to unlock recap speed';
  const languageSignal = summaryViewMode === 'translated'
    ? `Language: ${activeTranslatedLanguage || selectedLanguage}`
    : 'Language: Original';
  const viewModeLabel = summaryViewMode === 'translated'
    ? `Translated · ${activeTranslatedLanguage || selectedLanguage}`
    : 'Original view';
  const savedTranslationLanguages = useMemo(() => (
    Object.values(savedTranslations)
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .map((entry) => entry.targetLanguage)
  ), [savedTranslations]);
  const recommendedFollowUpTemplates = useMemo(() => {
    const templateOrder = FOLLOW_UP_TEMPLATES_BY_MEETING_TYPE[followUpMeetingType];
    return FOLLOW_UP_TEMPLATE_OPTIONS.filter((option) => templateOrder.includes(option.value))
      .sort((a, b) => templateOrder.indexOf(a.value) - templateOrder.indexOf(b.value));
  }, [followUpMeetingType]);
  const followUpActionCandidates = useMemo<FollowUpActionCandidate[]>(() => {
    const candidates: FollowUpActionCandidate[] = [];
    const seen = new Set<string>();

    if (activeSummary?.actionItems) {
      activeSummary.actionItems.forEach((item, index) => {
        const task = typeof item === 'string' ? item.trim() : String(item?.task || '').trim();
        if (!task) {
          return;
        }
        const dedupeKey = `summary_${normalizeActionKey(task)}`;
        if (seen.has(dedupeKey)) {
          return;
        }
        seen.add(dedupeKey);
        candidates.push({
          id: buildActionCandidateId('summary', index, task),
          text: task,
          owner: typeof item === 'object' ? item.assignee : undefined,
          due: typeof item === 'object' ? item.deadline : undefined,
          priority: typeof item === 'object' ? item.priority : undefined,
          source: 'summary',
        });
      });
    }

    if (followUpDraft?.actionChecklist) {
      followUpDraft.actionChecklist.forEach((item, index) => {
        const task = String(item || '').trim();
        if (!task) {
          return;
        }
        const dedupeKey = `checklist_${normalizeActionKey(task)}`;
        if (seen.has(dedupeKey)) {
          return;
        }
        seen.add(dedupeKey);
        candidates.push({
          id: buildActionCandidateId('checklist', index, task),
          text: task,
          source: 'checklist',
        });
      });
    }

    const now = Date.now();
    return candidates
      .sort((a, b) => {
        const riskDelta = computeFollowUpActionRiskScore(b, now) - computeFollowUpActionRiskScore(a, now);
        if (riskDelta !== 0) {
          return riskDelta;
        }

        const dueA = parseDueTimestamp(a.due);
        const dueB = parseDueTimestamp(b.due);
        if (dueA != null && dueB != null && dueA !== dueB) {
          return dueA - dueB;
        }
        if (dueA != null && dueB == null) {
          return -1;
        }
        if (dueA == null && dueB != null) {
          return 1;
        }

        return a.text.localeCompare(b.text);
      })
      .slice(0, 12);
  }, [activeSummary?.actionItems, followUpDraft?.actionChecklist]);
  const pendingFollowUpActions = useMemo(
    () => followUpActionCandidates.filter((action) => !resolvedFollowUpActionIds.includes(action.id)),
    [followUpActionCandidates, resolvedFollowUpActionIds],
  );
  const completedFollowUpActionCount = Math.max(
    followUpActionCandidates.length - pendingFollowUpActions.length,
    0,
  );
  const escalationEligiblePendingFollowUpActions = useMemo(() => {
    if (!followUpAutoEscalationEnabled) {
      return [];
    }
    const now = Date.now();
    return pendingFollowUpActions.filter((action) => {
      const overdueHours = getActionOverdueHours(action, now);
      return overdueHours != null && overdueHours >= followUpEscalationThresholdHours;
    });
  }, [followUpAutoEscalationEnabled, followUpEscalationThresholdHours, pendingFollowUpActions]);
  const followUpStrategyRecommendationMatchesCurrent = useMemo(() => {
    if (!followUpStrategyRecommendation) {
      return false;
    }
    return (
      followUpStrategyRecommendation.persona === followUpReminderPersona &&
      followUpStrategyRecommendation.escalationEnabled === followUpAutoEscalationEnabled &&
      followUpStrategyRecommendation.escalationThresholdHours === followUpEscalationThresholdHours
    );
  }, [
    followUpAutoEscalationEnabled,
    followUpEscalationThresholdHours,
    followUpReminderPersona,
    followUpStrategyRecommendation,
  ]);

  const heroMotionStyle = useMemo(
    () => ({
      opacity: heroMotion,
      transform: [
        {
          translateY: heroMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0],
          }),
        },
      ],
    }),
    [heroMotion],
  );

  const bodyMotionStyle = useMemo(
    () => ({
      opacity: bodyMotion,
      transform: [
        {
          translateY: bodyMotion.interpolate({
            inputRange: [0, 1],
            outputRange: [20, 0],
          }),
        },
      ],
    }),
    [bodyMotion],
  );

  useEffect(() => {
    if (recordingId) {
      void loadRecording();
    }
  }, [recordingId]);

  useEffect(() => {
    void loadPreferredTranslationLanguage();
  }, []);

  useEffect(() => {
    void refreshFollowUpStrategyRecommendation(followUpMeetingType, true);
  }, [followUpMeetingType]);

  useEffect(() => {
    heroMotion.setValue(0);
    bodyMotion.setValue(0);
    const heroAnimation = Animated.timing(heroMotion, {
      toValue: 1,
      duration: 340,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const bodyAnimation = Animated.timing(bodyMotion, {
      toValue: 1,
      duration: 420,
      delay: 80,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const animation = Animated.parallel([heroAnimation, bodyAnimation]);
    animation.start();
    return () => {
      animation.stop();
    };
  }, [recordingId, heroMotion, bodyMotion]);

  useEffect(() => {
    return () => {
      if (sound) {
        void sound.unloadAsync();
      }
    };
  }, [sound]);

  async function trackTranslation(
    eventName: TranslationEventName,
    source: TranslationEventSource,
    details?: {
      targetLanguage?: string;
      outcome?: string;
      errorCode?: string;
    },
  ) {
    await trackTranslationEvent(token, {
      eventName,
      source,
      targetLanguage: details?.targetLanguage,
      outcome: details?.outcome,
      errorCode: details?.errorCode,
      recordingId: normalizedRecordingId,
    });
  }

  async function trackActivation(
    eventName: ActivationEventName,
    source: string,
    details?: {
      outcome?: string;
      step?: string;
      errorCode?: string;
    },
  ) {
    await trackActivationEvent(token, {
      eventName,
      source,
      outcome: details?.outcome,
      step: details?.step,
      errorCode: details?.errorCode,
      recordingId: normalizedRecordingId,
    });
  }

  function applyFollowUpStrategyRecommendation(
    recommendation: StoredFollowUpStrategyRecommendation,
    trackApply: boolean,
  ) {
    setFollowUpReminderPersona(recommendation.persona);
    setFollowUpAutoEscalationEnabled(recommendation.escalationEnabled);
    setFollowUpEscalationThresholdHours(recommendation.escalationThresholdHours);
    if (trackApply) {
      void trackActivation('summary_followup_reminder_tapped', 'transcript_screen', {
        outcome: `strategy_${recommendation.persona}_${recommendation.escalationEnabled ? 'escalation_on' : 'escalation_off'}_${recommendation.escalationThresholdHours}h`,
        step: 'followup_strategy_recommendation_apply',
      });
    }
  }

  async function refreshFollowUpStrategyRecommendation(meetingType: FollowUpMeetingType, autoApply: boolean) {
    try {
      const recommendation = await getFollowUpStrategyRecommendation(meetingType);
      setFollowUpStrategyRecommendation(recommendation);
      void trackActivation('summary_followup_reminder_tapped', 'transcript_screen', {
        outcome: `strategy_${recommendation.persona}_${recommendation.escalationEnabled ? 'escalation_on' : 'escalation_off'}_${recommendation.escalationThresholdHours}h`,
        step: 'followup_strategy_recommendation_shown',
      });
      if (autoApply) {
        applyFollowUpStrategyRecommendation(recommendation, false);
      }
    } catch {
      // Do not block follow-up flow if recommendation lookup fails.
    }
  }

  function applySavedTranslation(targetLanguage: string): boolean {
    const entry = savedTranslations[normalizeTranslationKey(targetLanguage)];
    if (!entry || (!entry.translatedSummary && !entry.translatedTranscript)) {
      return false;
    }

    setTranslatedSummary(entry.translatedSummary);
    setTranslatedTranscript(entry.translatedTranscript);
    setSummaryViewMode('translated');
    setActiveTranslatedLanguage(entry.targetLanguage);
    setTranslationError(null);
    return true;
  }

  async function loadPreferredTranslationLanguage() {
    const preferred = await getDefaultTranslationLanguage();
    if (preferred) {
      setSelectedLanguage(preferred);
    }
  }

  async function loadRecording() {
    try {
      const response = await fetch(apiUrl(`/audio/recordings/${recordingId}`), {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const recording = await response.json();
        const existingSummary = normalizeSummary(recording.summary_json);
        if (existingSummary) {
          setSummary(existingSummary);
          setTranslatedSummary(null);
          setTranslatedTranscript(null);
          setSummaryViewMode('original');
          setActiveTranslatedLanguage(null);
          setTranslationError(null);
        }
        if (recording.audio_url) {
          setAudioUrlFromDB(recording.audio_url);
        }
        setRecordingMeta({
          meetingName: recording.meeting_name || recording.meetingName || undefined,
          meetingLocation: recording.meeting_location || recording.meetingLocation || undefined,
          meetingContext: recording.meeting_context || recording.meetingContext || undefined,
          meetingAt: recording.meeting_at || recording.meetingAt || undefined,
          meetingParticipants: normalizeParticipants(
            recording.meeting_participants || recording.meetingParticipants,
          ),
        });
        setSavedTranslations(
          normalizeSavedTranslations(
            recording.translation_cache_json || recording.translationCacheJson,
          ),
        );
      }
    } catch {
      // Keep screen usable even if refresh fails.
    }
  }

  async function playAudio() {
    try {
      if (!audioUrlFromDB) {
        Alert.alert('No Audio', 'Audio file not available for this recording');
        return;
      }

      if (isPlaying && sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: audioUrlFromDB },
          { shouldPlay: true },
          onPlaybackStatusUpdate,
        );
        setSound(newSound);
        setIsPlaying(true);
      }
    } catch (error: any) {
      Alert.alert('Playback Error', error.message);
    }
  }

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis);
      setDuration(status.durationMillis || 0);

      if (status.didJustFinish && !status.isLooping) {
        setIsPlaying(false);
        setPosition(0);
      }
    }
  };

  const onSeek = async (value: number) => {
    if (sound) {
      await sound.setPositionAsync(value);
    }
  };

  const formatTime = (millis: number) => {
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  async function generateSummary() {
    try {
      setLoading(true);
      void trackActivation('summary_generate_tapped', 'transcript_screen', {
        step: 'generate_summary_button',
      });

      const response = await fetch(apiUrl('/audio/summary'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          transcript: transcriptText,
          recordingId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }

      const data = await response.json();
      setSummary(normalizeSummary(data));
      setTranslatedSummary(null);
      setTranslatedTranscript(null);
      setSummaryViewMode('original');
      setActiveTranslatedLanguage(null);
      setTranslationError(null);
      setFollowUpDraft(null);
      setFollowUpError(null);
      setResolvedFollowUpActionIds([]);
      setFollowUpReminderCadence(24);
      void trackActivation('summary_generate_completed', 'transcript_screen', {
        outcome: 'success',
        step: 'summary_ready',
      });
    } catch (err: any) {
      void trackActivation('summary_generate_failed', 'transcript_screen', {
        outcome: 'failed',
        step: 'summary_request',
        errorCode: toTrackingErrorCode(err),
      });
      Alert.alert('Error', `Could not generate summary: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

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

  async function openCitation(sourceRecordingId: string) {
    if (!token) {
      return;
    }

    try {
      setOpeningCitationId(sourceRecordingId);
      const response = await fetch(apiUrl(`/audio/recordings/${sourceRecordingId}`), {
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

  async function saveHighlight(source: SavedHighlightSource, text: string) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      Alert.alert('Highlights Library', 'There is no text to save yet.');
      return;
    }
    if (!normalizedRecordingId) {
      Alert.alert('Highlights Library', 'Save this meeting first, then add highlights.');
      return;
    }

    const saved = await saveHighlightToLibrary({
      recordingId: normalizedRecordingId,
      meetingName: transcriptTitle,
      meetingAt: recordingMeta.meetingAt,
      source,
      text: trimmed,
    });

    if (!saved) {
      Alert.alert('Highlights Library', 'Could not save this highlight right now.');
      return;
    }

    Alert.alert('Saved', 'Added to Highlights Library.');
  }

  function buildOutputActionLines(limit: number = 5): string[] {
    const items = activeSummary?.actionItems || [];
    const lines = items
      .slice(0, limit)
      .map((item, index) => {
        const task = typeof item === 'string' ? item : item.task || 'Untitled task';
        const owner = typeof item === 'string' ? '' : (item.assignee ? ` (Owner: ${item.assignee})` : '');
        const due = typeof item === 'string' ? '' : (item.deadline ? ` (Due: ${item.deadline})` : '');
        return `${index + 1}. ${task}${owner}${due}`;
      });
    return lines.length > 0 ? lines : ['No action items captured yet.'];
  }

  function buildOutputKeyPointLines(limit: number = 5): string[] {
    const points = activeSummary?.keyPoints || [];
    const lines = points.slice(0, limit).map((point, index) => `${index + 1}. ${point}`);
    return lines.length > 0 ? lines : ['No key points captured yet.'];
  }

  function buildOutputTemplateContent(templateId: OutputTemplateId): string {
    const title = recordingMeta.meetingName || normalizedFilename || 'Recording';
    const meta = formatMeetingMeta() || 'Not specified';
    const participants = (recordingMeta.meetingParticipants || []).join(', ') || 'Not specified';
    const context = recordingMeta.meetingContext || 'Not specified';
    const summaryText = (activeSummary?.summary || '').trim() || 'No summary available.';
    const actionLines = buildOutputActionLines();
    const keyPointLines = buildOutputKeyPointLines();

    if (templateId === 'executive_update') {
      return [
        `Executive Update - ${title}`,
        `Date/Location: ${meta}`,
        `Participants: ${participants}`,
        `Context: ${context}`,
        '',
        'Decision Summary:',
        summaryText,
        '',
        'Top Signals:',
        ...keyPointLines,
        '',
        'Execution Priorities:',
        ...actionLines,
      ].join('\n');
    }

    if (templateId === 'client_recap') {
      return [
        `Client Recap - ${title}`,
        `Date/Location: ${meta}`,
        '',
        'What We Covered:',
        summaryText,
        '',
        'Key Takeaways:',
        ...keyPointLines,
        '',
        'Confirmed Next Steps:',
        ...actionLines,
        '',
        'Please reply with any updates or questions before next sync.',
      ].join('\n');
    }

    return [
      `Project Status - ${title}`,
      `Date/Location: ${meta}`,
      `Participants: ${participants}`,
      '',
      'Current Status:',
      summaryText,
      '',
      'Workstream Highlights:',
      ...keyPointLines,
      '',
      'Next Actions:',
      ...actionLines,
      '',
      `Follow-up Draft Ready: ${followUpDraft ? 'Yes' : 'Not yet'}`,
    ].join('\n');
  }

  const selectedOutputTemplateContent = useMemo(
    () => buildOutputTemplateContent(selectedOutputTemplate),
    [activeSummary, followUpDraft, recordingMeta, selectedOutputTemplate],
  );
  const selectedOutputTemplateLabel = useMemo(
    () => OUTPUT_TEMPLATE_OPTIONS.find((option) => option.value === selectedOutputTemplate)?.label || 'Template Pack',
    [selectedOutputTemplate],
  );
  const shareBundleId = useMemo(() => {
    const baseDate = recordingMeta.meetingAt ? new Date(recordingMeta.meetingAt) : new Date();
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const idSeed = String(normalizedRecordingId || 'local')
      .replace(/[^a-z0-9]/ig, '')
      .slice(0, 6)
      .toUpperCase()
      || 'LOCAL';
    return `RCP-${year}${month}${day}-${idSeed}`;
  }, [normalizedRecordingId, recordingMeta.meetingAt]);
  const recaplyDeepLink = useMemo(() => (
    normalizedRecordingId
      ? `${RECAPLY_DEEP_LINK_SCHEME}://transcript?recordingId=${encodeURIComponent(normalizedRecordingId)}`
      : `${RECAPLY_DEEP_LINK_SCHEME}://home`
  ), [normalizedRecordingId]);

  async function copyOutputTemplate() {
    try {
      await Clipboard.setStringAsync(selectedOutputTemplateContent);
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: selectedOutputTemplate,
        step: 'template_pack_copy',
      });
      Alert.alert('Copied!', 'Template pack copied to clipboard.');
    } catch (error: any) {
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedOutputTemplate}_copy_failed`,
        step: 'template_pack_copy_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Template Pack', 'Could not copy this template pack.');
    }
  }

  async function shareOutputTemplate() {
    try {
      await Share.share({
        title: selectedOutputTemplateLabel,
        message: selectedOutputTemplateContent,
      });
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedOutputTemplate}_share`,
        step: 'template_pack_share',
      });
    } catch (error: any) {
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedOutputTemplate}_share_failed`,
        step: 'template_pack_share_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Template Pack', 'Could not open share sheet.');
    }
  }

  function buildBrandedShareBundle(format: ShareBundleFormat): string {
    const meetingTitle = recordingMeta.meetingName || normalizedFilename || 'Recording';
    const meta = formatMeetingMeta() || 'Not specified';
    const participants = (recordingMeta.meetingParticipants || []).join(', ') || 'Not specified';
    const summaryText = (activeSummary?.summary || '').trim() || 'No summary available.';
    const topActions = buildOutputActionLines(3);
    const topPoints = buildOutputKeyPointLines(3);
    const compactPreview = summaryText.length > 320 ? `${summaryText.slice(0, 320).trim()}...` : summaryText;

    if (format === 'compact') {
      return [
        'Recaply Share Bundle',
        `Bundle ID: ${shareBundleId}`,
        `Meeting: ${meetingTitle}`,
        `Audience Pack: ${selectedOutputTemplateLabel}`,
        `Meta: ${meta}`,
        '',
        'Summary Snapshot:',
        compactPreview,
        '',
        'Top Actions:',
        ...topActions,
        '',
        `Open in Recaply: ${recaplyDeepLink}`,
        `Install Recaply: ${RECAPLY_INSTALL_URL}`,
      ].join('\n');
    }

    return [
      'Recaply Share Bundle',
      `Bundle ID: ${shareBundleId}`,
      `Meeting: ${meetingTitle}`,
      `Audience Pack: ${selectedOutputTemplateLabel}`,
      `Meta: ${meta}`,
      `Participants: ${participants}`,
      '',
      'Summary Narrative:',
      summaryText,
      '',
      'Key Points:',
      ...topPoints,
      '',
      'Action Commitments:',
      ...topActions,
      '',
      'Template Output:',
      selectedOutputTemplateContent,
      '',
      `Open in Recaply: ${recaplyDeepLink}`,
      `Install Recaply: ${RECAPLY_INSTALL_URL}`,
    ].join('\n');
  }

  const brandedShareBundleContent = useMemo(
    () => buildBrandedShareBundle(selectedShareBundleFormat),
    [
      activeSummary,
      recaplyDeepLink,
      recordingMeta,
      selectedOutputTemplateContent,
      selectedOutputTemplateLabel,
      selectedShareBundleFormat,
      shareBundleId,
    ],
  );

  async function copyShareBundleLink() {
    try {
      await Clipboard.setStringAsync(recaplyDeepLink);
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedShareBundleFormat}_link_copy`,
        step: 'share_bundle_link_copy',
      });
      Alert.alert('Copied!', 'Share link copied.');
    } catch (error: any) {
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedShareBundleFormat}_link_copy_failed`,
        step: 'share_bundle_link_copy_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Share Bundle', 'Could not copy share link.');
    }
  }

  async function copyBrandedShareBundle() {
    try {
      await Clipboard.setStringAsync(brandedShareBundleContent);
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedShareBundleFormat}_bundle_copy`,
        step: 'share_bundle_copy',
      });
      Alert.alert('Copied!', 'Branded share bundle copied.');
    } catch (error: any) {
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedShareBundleFormat}_bundle_copy_failed`,
        step: 'share_bundle_copy_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Share Bundle', 'Could not copy share bundle.');
    }
  }

  async function shareBrandedShareBundle() {
    try {
      await Share.share({
        title: `Recaply Share Bundle (${selectedShareBundleFormat === 'compact' ? 'Compact' : 'Story'})`,
        message: brandedShareBundleContent,
      });
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedShareBundleFormat}_bundle_share`,
        step: 'share_bundle_share',
      });
    } catch (error: any) {
      void trackActivation('summary_export_tapped', 'transcript_screen', {
        outcome: `${selectedShareBundleFormat}_bundle_share_failed`,
        step: 'share_bundle_share_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Share Bundle', 'Could not open share sheet.');
    }
  }

  function applyTranslationResult(result: TranslationFetchResult) {
    setTranslatedSummary(result.translatedSummary);
    setTranslatedTranscript(result.translatedTranscript);
    setSummaryViewMode('translated');
    setActiveTranslatedLanguage(result.targetLanguage);
    void setDefaultTranslationLanguage(result.targetLanguage);
    setSavedTranslations((prev) => ({
      ...prev,
      [normalizeTranslationKey(result.targetLanguage)]: {
        targetLanguage: result.targetLanguage,
        translatedSummary: result.translatedSummary,
        translatedTranscript: result.translatedTranscript,
        updatedAt: new Date().toISOString(),
      },
    }));
    setTranslationError(null);
  }

  function getSavedTranslation(targetLanguage: string): TranslationFetchResult | null {
    const entry = savedTranslations[normalizeTranslationKey(targetLanguage)];
    if (!entry || (!entry.translatedSummary && !entry.translatedTranscript)) {
      return null;
    }
    return {
      targetLanguage: entry.targetLanguage,
      translatedSummary: entry.translatedSummary,
      translatedTranscript: entry.translatedTranscript,
    };
  }

  async function requestTranslation(targetLanguage: string): Promise<TranslationFetchResult> {
    const response = await fetch(apiUrl('/audio/translate-breakdown'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        summary,
        transcript: transcriptText,
        targetLanguage,
        recordingId,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = payload?.error || `Failed: ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    const translatedSummaryContent = normalizeSummary(data?.translatedSummary || data?.summary);
    const translatedTranscriptText = typeof data?.translatedTranscript === 'string'
      ? data.translatedTranscript.trim()
      : '';
    const resolvedLanguage = typeof data?.targetLanguage === 'string' && data.targetLanguage.trim()
      ? data.targetLanguage.trim()
      : targetLanguage;

    if (!translatedSummaryContent && !translatedTranscriptText) {
      throw new Error('No translated content was returned');
    }

    return {
      targetLanguage: resolvedLanguage,
      translatedSummary: translatedSummaryContent,
      translatedTranscript: translatedTranscriptText || null,
    };
  }

  async function translateBreakdown(
    targetLanguageOverride?: string,
    options?: { suppressErrorAlert?: boolean; skipLoadingState?: boolean; source?: TranslationEventSource },
  ): Promise<TranslationFetchResult | null> {
    const targetLanguage = (targetLanguageOverride || customLanguageInput.trim() || selectedLanguage).trim();
    const source = options?.source || 'transcript_translate';
    if (!targetLanguage) {
      if (!options?.suppressErrorAlert) {
        Alert.alert('Translate Breakdown', 'Select or enter a target language first.');
      }
      return null;
    }

    if (!summary && !transcriptText.trim()) {
      if (!options?.suppressErrorAlert) {
        Alert.alert('Translate Breakdown', 'No transcript or summary content is available to translate.');
      }
      return null;
    }

    void trackTranslation('translation_action_started', source, {
      targetLanguage,
    });

    const saved = getSavedTranslation(targetLanguage);
    if (saved) {
      applyTranslationResult(saved);
      void trackTranslation('translation_content_ready', source, {
        targetLanguage: saved.targetLanguage,
        outcome: 'cache',
      });
      return saved;
    }

    try {
      if (!options?.skipLoadingState) {
        setTranslationLoading(true);
      }
      setTranslationError(null);

      const result = await requestTranslation(targetLanguage);
      applyTranslationResult(result);
      void trackTranslation('translation_content_ready', source, {
        targetLanguage: result.targetLanguage,
        outcome: 'fresh',
      });
      return result;
    } catch (error: any) {
      const message = String(error?.message || 'Could not translate breakdown');
      void trackTranslation('translation_request_failed', source, {
        targetLanguage,
        errorCode: toTrackingErrorCode(error),
      });
      setTranslationError(message);
      if (!options?.suppressErrorAlert) {
        Alert.alert('Translation Error', message);
      }
      return null;
    } finally {
      if (!options?.skipLoadingState) {
        setTranslationLoading(false);
      }
    }
  }

  function buildMultilingualShareMessage(result: TranslationFetchResult): string {
    const meetingTitle = recordingMeta.meetingName || normalizedFilename;
    const summaryText = result.translatedSummary?.summary || 'No translated summary available.';
    const actions = result.translatedSummary?.actionItems || [];
    const keyPoints = result.translatedSummary?.keyPoints || [];
    const transcriptSnippet = (result.translatedTranscript || '').trim();

    const actionLines = actions
      .slice(0, 5)
      .map((item, index) => {
        const task = typeof item === 'string' ? item : item.task || 'Untitled task';
        return `${index + 1}. ${task}`;
      });
    const keyPointLines = keyPoints
      .slice(0, 5)
      .map((point, index) => `${index + 1}. ${point}`);
    const transcriptPreview = transcriptSnippet.length > 420
      ? `${transcriptSnippet.slice(0, 420).trim()}...`
      : transcriptSnippet;

    const lines = [
      `Recaply Multilingual Meeting Recap (${result.targetLanguage})`,
      `Meeting: ${meetingTitle}`,
      transcriptMetaLine ? `Meta: ${transcriptMetaLine}` : '',
      '',
      'Summary:',
      summaryText,
      '',
      'Action Items:',
      ...(actionLines.length > 0 ? actionLines : ['No action items available.']),
      '',
      'Key Points:',
      ...(keyPointLines.length > 0 ? keyPointLines : ['No key points available.']),
      transcriptPreview ? '' : '',
      transcriptPreview ? 'Transcript Snapshot:' : '',
      transcriptPreview || '',
    ].filter((line) => line !== '');

    return lines.join('\n');
  }

  async function shareMultilingualRecap() {
    const targetLanguage = (customLanguageInput.trim() || selectedLanguage).trim();
    if (!targetLanguage) {
      Alert.alert('Share Translation', 'Select or enter a target language first.');
      return;
    }

    try {
      void trackActivation('summary_share_translation_tapped', 'transcript_screen', {
        outcome: normalizeTranslationKey(targetLanguage),
        step: 'translate_share_cta',
      });
      setTranslationShareLoading(true);
      const result = await translateBreakdown(targetLanguage, {
        suppressErrorAlert: true,
        skipLoadingState: true,
        source: 'transcript_share',
      });
      if (!result) {
        void trackTranslation('translation_share_failed', 'transcript_share', {
          targetLanguage,
          outcome: 'content_unavailable',
        });
        Alert.alert('Share Translation', 'Could not prepare translated content to share.');
        return;
      }

      void trackTranslation('translation_share_started', 'transcript_share', {
        targetLanguage: result.targetLanguage,
      });
      const message = buildMultilingualShareMessage(result);
      await Share.share({
        title: `Recaply Recap (${result.targetLanguage})`,
        message,
      });
      void trackTranslation('translation_share_completed', 'transcript_share', {
        targetLanguage: result.targetLanguage,
      });
    } catch {
      void trackTranslation('translation_share_failed', 'transcript_share', {
        targetLanguage,
        errorCode: 'share_sheet_failed',
      });
      Alert.alert('Share Translation', 'Could not open share sheet.');
    } finally {
      setTranslationShareLoading(false);
    }
  }

  function buildFollowUpDraftClipboardText(draft: FollowUpDraftData): string {
    const title = recordingMeta.meetingName || normalizedFilename;
    const lines = [
      `Recaply Follow-up Draft (${draft.tone})`,
      `Meeting: ${title}`,
      `Meeting Type: ${getFollowUpMeetingTypeLabel(followUpMeetingType)}`,
      `Template: ${getFollowUpTemplateLabel(followUpTemplateStyle)}`,
      transcriptMetaLine ? `Meta: ${transcriptMetaLine}` : '',
      '',
      `Subject: ${draft.subject}`,
      '',
      'Email Draft:',
      draft.emailBody,
      '',
      'Slack Draft:',
      draft.slackMessage,
      '',
      'Checklist:',
      ...(draft.actionChecklist.length > 0 ? draft.actionChecklist.map((item, idx) => `${idx + 1}. ${item}`) : ['No checklist items generated.']),
    ].filter(Boolean);
    return lines.join('\n');
  }

  function buildFollowUpChecklistText(draft: FollowUpDraftData): string {
    if (draft.actionChecklist.length === 0) {
      return 'No checklist items generated.';
    }

    return draft.actionChecklist.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
  }

  function buildFollowUpShareText(channel: 'email' | 'slack', draft: FollowUpDraftData): string {
    const title = recordingMeta.meetingName || normalizedFilename;
    const header = [
      `Recaply Follow-up (${draft.tone})`,
      `Meeting: ${title}`,
      `Meeting Type: ${getFollowUpMeetingTypeLabel(followUpMeetingType)}`,
      `Template: ${getFollowUpTemplateLabel(followUpTemplateStyle)}`,
      '',
    ].join('\n');
    if (channel === 'email') {
      return [
        header,
        `Subject: ${draft.subject}`,
        '',
        draft.emailBody,
        '',
        'Checklist:',
        buildFollowUpChecklistText(draft),
      ].join('\n');
    }

    return [
      header,
      draft.slackMessage,
      '',
      'Checklist:',
      buildFollowUpChecklistText(draft),
    ].join('\n');
  }

  function selectFollowUpMeetingType(meetingType: FollowUpMeetingType) {
    setFollowUpMeetingType(meetingType);
    const recommended = FOLLOW_UP_TEMPLATES_BY_MEETING_TYPE[meetingType];
    if (recommended.length > 0 && !recommended.includes(followUpTemplateStyle)) {
      setFollowUpTemplateStyle(recommended[0]);
    }
    setFollowUpDraft(null);
    setResolvedFollowUpActionIds([]);
    void trackActivation('summary_followup_meeting_type_selected', 'transcript_screen', {
      outcome: meetingType,
      step: 'followup_meeting_type_selector',
    });
  }

  function selectFollowUpTemplateStyle(templateStyle: FollowUpTemplateStyle) {
    setFollowUpTemplateStyle(templateStyle);
    setFollowUpDraft(null);
    setResolvedFollowUpActionIds([]);
    void trackActivation('summary_followup_template_selected', 'transcript_screen', {
      outcome: templateStyle,
      step: 'followup_template_selector',
    });
  }

  function selectFollowUpTone(tone: FollowUpTone) {
    setFollowUpTone(tone);
    if (followUpDraft && followUpDraft.tone !== tone) {
      setFollowUpDraft(null);
      setResolvedFollowUpActionIds([]);
    }
    void trackActivation('summary_followup_tone_selected', 'transcript_screen', {
      outcome: tone,
      step: 'followup_tone_selector',
    });
  }

  function selectPrepTone(tone: PrepTone) {
    setPrepTone(tone);
    if (prepBrief && prepBrief.prepTone !== tone) {
      setPrepBrief(null);
    }
    setPrepBriefError(null);
  }

  async function copyFollowUpSection(channel: 'full' | 'email' | 'slack' | 'checklist') {
    if (!followUpDraft) {
      return;
    }

    const payload =
      channel === 'full'
        ? buildFollowUpDraftClipboardText(followUpDraft)
        : channel === 'email'
          ? followUpDraft.emailBody
          : channel === 'slack'
            ? followUpDraft.slackMessage
            : buildFollowUpChecklistText(followUpDraft);

    try {
      await Clipboard.setStringAsync(payload);
      void trackActivation('summary_followup_copy_tapped', 'transcript_screen', {
        outcome: channel,
        step: 'followup_copy_completed',
      });
      Alert.alert('Copied!', `${channel[0].toUpperCase()}${channel.slice(1)} follow-up copied.`);
    } catch (error: any) {
      void trackActivation('summary_followup_copy_tapped', 'transcript_screen', {
        outcome: `${channel}_failed`,
        step: 'followup_copy_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Error', `Could not copy follow-up draft: ${error.message}`);
    }
  }

  async function shareFollowUpSection(channel: 'email' | 'slack') {
    if (!followUpDraft) {
      return;
    }

    try {
      await Share.share({
        title: channel === 'email' ? 'Follow-up Email Draft' : 'Follow-up Slack Draft',
        message: buildFollowUpShareText(channel, followUpDraft),
      });
      void trackActivation('summary_followup_share_tapped', 'transcript_screen', {
        outcome: channel,
        step: 'followup_share_completed',
      });
    } catch (error: any) {
      void trackActivation('summary_followup_share_tapped', 'transcript_screen', {
        outcome: `${channel}_failed`,
        step: 'followup_share_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Share Follow-up', 'Could not open share sheet.');
    }
  }

  function buildCrmExportText(target: CrmTarget, draft: FollowUpDraftData): string {
    const title = recordingMeta.meetingName || normalizedFilename;
    const participants = (recordingMeta.meetingParticipants || []).join(', ') || 'Not specified';
    const meetingDate = transcriptMetaLine || 'Not specified';
    const meetingTypeLabel = getFollowUpMeetingTypeLabel(followUpMeetingType);
    const templateLabel = getFollowUpTemplateLabel(followUpTemplateStyle);
    const checklist = buildFollowUpChecklistText(draft);

    if (target === 'salesforce') {
      return [
        'Salesforce Activity Note',
        `Meeting: ${title}`,
        `Date/Location: ${meetingDate}`,
        `Participants: ${participants}`,
        `Meeting Type: ${meetingTypeLabel}`,
        `Follow-up Template: ${templateLabel}`,
        '',
        `Subject: ${draft.subject}`,
        '',
        'Summary:',
        draft.emailBody,
        '',
        'Action Checklist:',
        checklist,
      ].join('\n');
    }

    if (target === 'hubspot') {
      return [
        'HubSpot Engagement Update',
        `Title: ${title}`,
        `Meeting Type: ${meetingTypeLabel}`,
        `Template: ${templateLabel}`,
        `Attendees: ${participants}`,
        '',
        'Key Update:',
        draft.slackMessage,
        '',
        'Email Follow-up:',
        draft.emailBody,
        '',
        'Next Actions:',
        checklist,
      ].join('\n');
    }

    return [
      '# Notion Follow-up Update',
      `**Meeting:** ${title}`,
      `**Type:** ${meetingTypeLabel}`,
      `**Template:** ${templateLabel}`,
      `**Participants:** ${participants}`,
      '',
      '## Subject',
      draft.subject,
      '',
      '## Recap',
      draft.emailBody,
      '',
      '## Team Update',
      draft.slackMessage,
      '',
      '## Action Checklist',
      checklist,
    ].join('\n');
  }

  async function copyCrmExport(target: CrmTarget) {
    if (!followUpDraft) {
      return;
    }

    try {
      await Clipboard.setStringAsync(buildCrmExportText(target, followUpDraft));
      void trackActivation('summary_followup_crm_export_tapped', 'transcript_screen', {
        outcome: `${target}_copy`,
        step: 'followup_crm_export',
      });
      Alert.alert('Copied!', `${CRM_TARGET_LABELS[target]} export copied.`);
    } catch (error: any) {
      void trackActivation('summary_followup_crm_export_tapped', 'transcript_screen', {
        outcome: `${target}_copy_failed`,
        step: 'followup_crm_export_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('CRM Export', `Could not copy ${CRM_TARGET_LABELS[target]} export.`);
    }
  }

  async function shareCrmPacket() {
    if (!followUpDraft) {
      return;
    }

    const packet = [
      buildCrmExportText('salesforce', followUpDraft),
      '',
      '---',
      '',
      buildCrmExportText('hubspot', followUpDraft),
      '',
      '---',
      '',
      buildCrmExportText('notion', followUpDraft),
    ].join('\n');

    try {
      await Share.share({
        title: 'CRM Follow-up Packet',
        message: packet,
      });
      void trackActivation('summary_followup_crm_export_tapped', 'transcript_screen', {
        outcome: 'packet_share',
        step: 'followup_crm_export',
      });
    } catch (error: any) {
      void trackActivation('summary_followup_crm_export_tapped', 'transcript_screen', {
        outcome: 'packet_share_failed',
        step: 'followup_crm_export_failed',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('CRM Export', 'Could not open share sheet.');
    }
  }

  function selectFollowUpReminderCadence(cadence: FollowUpReminderCadence) {
    setFollowUpReminderCadence(cadence);
    void trackActivation('summary_followup_reminder_tapped', 'transcript_screen', {
      outcome: `cadence_${getReminderCadenceLabel(cadence).toLowerCase().replace(/\s+/g, '_')}`,
      step: 'followup_reminder_cadence',
    });
  }

  function selectFollowUpReminderPersona(persona: FollowUpReminderPersona) {
    setFollowUpReminderPersona(persona);
    void trackActivation('summary_followup_persona_selected', 'transcript_screen', {
      outcome: persona,
      step: 'followup_persona_selector',
    });
  }

  function setFollowUpEscalationEnabled(enabled: boolean) {
    setFollowUpAutoEscalationEnabled(enabled);
    void trackActivation('summary_followup_escalation_tapped', 'transcript_screen', {
      outcome: enabled ? 'enabled' : 'disabled',
      step: 'followup_escalation_toggle',
    });
  }

  function selectFollowUpEscalationThreshold(hours: FollowUpEscalationThresholdHours) {
    setFollowUpEscalationThresholdHours(hours);
    void trackActivation('summary_followup_escalation_tapped', 'transcript_screen', {
      outcome: `threshold_${hours}h`,
      step: 'followup_escalation_threshold',
    });
  }

  function toggleFollowUpActionResolved(actionId: string) {
    setResolvedFollowUpActionIds((prev) => {
      const currentlyResolved = prev.includes(actionId);
      const next = currentlyResolved ? prev.filter((id) => id !== actionId) : [...prev, actionId];
      void trackActivation('summary_followup_reminder_tapped', 'transcript_screen', {
        outcome: currentlyResolved ? 'action_reopened' : 'action_resolved',
        step: 'followup_action_toggle',
      });
      return next;
    });
  }

  function buildReminderResendMessage(channel: 'email' | 'slack'): {
    message: string;
    escalationTriggered: boolean;
  } {
    const title = recordingMeta.meetingName || normalizedFilename;
    const cadenceLabel = getReminderCadenceLabel(followUpReminderCadence);
    const personaLabel = getFollowUpReminderPersonaLabel(followUpReminderPersona);
    const now = Date.now();
    const escalationActionIds = new Set(escalationEligiblePendingFollowUpActions.map((action) => action.id));
    const escalationTriggered = followUpAutoEscalationEnabled && escalationActionIds.size > 0;
    const escalationWindowLabel =
      followUpEscalationThresholdHours === 0
        ? 'any overdue threshold'
        : `${followUpEscalationThresholdHours}h overdue threshold`;
    const pendingLines = pendingFollowUpActions
      .map((action, index) => {
        const owner = action.owner ? ` (Owner: ${action.owner})` : '';
        const due = action.due ? ` (Due: ${action.due})` : '';
        const overdueHours = getActionOverdueHours(action, now);
        const overdueFlag = overdueHours != null ? ` (Overdue: ${Math.max(1, Math.round(overdueHours))}h)` : '';
        const escalationFlag = escalationActionIds.has(action.id) ? ' [ESCALATED]' : '';
        return `${index + 1}. ${action.text}${owner}${due}${overdueFlag}${escalationFlag}`;
      })
      .join('\n');

    const emailLead =
      followUpReminderPersona === 'executive'
        ? `Executive check-in (${cadenceLabel} follow-up): please confirm owner, ETA, and blockers for each open item.`
        : followUpReminderPersona === 'client'
          ? `Client-facing check-in (${cadenceLabel} follow-up): please confirm progress and expected delivery timing.`
          : `Team check-in (${cadenceLabel} follow-up): please confirm updates on each open item.`;
    const slackLead =
      followUpReminderPersona === 'executive'
        ? `Executive status check (${cadenceLabel}) for *${title}*.`
        : followUpReminderPersona === 'client'
          ? `Client delivery check (${cadenceLabel}) for *${title}*.`
          : `Team reminder (${cadenceLabel}) for *${title}*.`;
    const emailClose =
      followUpReminderPersona === 'executive'
        ? 'Reply with status + ETA + blocker owner.'
        : followUpReminderPersona === 'client'
          ? 'Reply with customer-safe status updates and risks.'
          : 'Reply with status updates or blockers.';
    const slackClose =
      followUpReminderPersona === 'executive'
        ? 'Please post status + ETA + blockers in thread.'
        : followUpReminderPersona === 'client'
          ? 'Please post customer-ready status + blockers in thread.'
          : 'Please drop status/blockers in thread.';
    const escalationLine = escalationTriggered
      ? `Escalation triggered: ${escalationActionIds.size} item(s) crossed the ${escalationWindowLabel}.`
      : '';

    if (channel === 'email') {
      return {
        message: [
          `Subject: ${escalationTriggered ? 'Escalation' : 'Reminder'} - Pending actions from ${title}`,
          '',
          `Persona: ${personaLabel}`,
          emailLead,
          escalationLine,
          '',
          pendingLines || 'No pending actions.',
          '',
          emailClose,
        ]
          .filter(Boolean)
          .join('\n'),
        escalationTriggered,
      };
    }

    return {
      message: [
        `${escalationTriggered ? 'Escalation' : 'Reminder'} (${cadenceLabel}) for *${title}*`,
        `Persona: ${personaLabel}`,
        slackLead,
        escalationLine,
        'Open action items:',
        pendingLines || 'No pending actions.',
        slackClose,
      ]
        .filter(Boolean)
        .join('\n'),
      escalationTriggered,
    };
  }

  async function resendPendingActions(channel: 'email' | 'slack') {
    if (!followUpDraft) {
      return;
    }
    if (pendingFollowUpActions.length === 0) {
      Alert.alert('Follow-up Reminder', 'No pending actions left. Great work.');
      return;
    }

    const strategyMode = followUpStrategyRecommendationMatchesCurrent ? 'recommended' : 'manual';

    try {
      const { message, escalationTriggered } = buildReminderResendMessage(channel);
      await Share.share({
        title: channel === 'email' ? 'Resend Email Reminder' : 'Resend Slack Reminder',
        message,
      });
      await recordFollowUpStrategyUsage({
        meetingType: followUpMeetingType,
        persona: followUpReminderPersona,
        escalationEnabled: followUpAutoEscalationEnabled,
        escalationThresholdHours: followUpEscalationThresholdHours,
        success: true,
      });
      void trackActivation('summary_followup_resend_tapped', 'transcript_screen', {
        outcome: `${channel}_${getReminderCadenceLabel(followUpReminderCadence).toLowerCase().replace(/\s+/g, '_')}_${followUpReminderPersona}${escalationTriggered ? '_escalated' : ''}_${strategyMode}`,
        step: 'followup_resend',
      });
      if (escalationTriggered) {
        void trackActivation('summary_followup_escalation_triggered', 'transcript_screen', {
          outcome: `${channel}_${followUpReminderPersona}`,
          step: 'followup_escalation_send',
        });
      }
      void refreshFollowUpStrategyRecommendation(followUpMeetingType, false);
    } catch (error: any) {
      await recordFollowUpStrategyUsage({
        meetingType: followUpMeetingType,
        persona: followUpReminderPersona,
        escalationEnabled: followUpAutoEscalationEnabled,
        escalationThresholdHours: followUpEscalationThresholdHours,
        success: false,
      });
      void trackActivation('summary_followup_resend_tapped', 'transcript_screen', {
        outcome: `${channel}_failed_${strategyMode}`,
        step: 'followup_resend_failed',
        errorCode: toTrackingErrorCode(error),
      });
      void refreshFollowUpStrategyRecommendation(followUpMeetingType, false);
      Alert.alert('Follow-up Reminder', 'Could not open share sheet.');
    }
  }

  async function copyFollowUpDraft() {
    await copyFollowUpSection('full');
  }

  async function generateFollowUpDraft() {
    if (!summary && !transcriptText.trim()) {
      Alert.alert('Follow-up Draft', 'Generate a summary or provide transcript text first.');
      return;
    }

    try {
      setFollowUpLoading(true);
      setFollowUpError(null);
      void trackActivation('summary_followup_draft_tapped', 'transcript_screen', {
        outcome: followUpTone,
        step: 'followup_draft_button',
      });

      const response = await fetch(apiUrl('/audio/followup-draft'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recordingId: normalizedRecordingId,
          transcript: activeTranscript,
          summary: activeSummary || summary,
          meetingName: recordingMeta.meetingName,
          meetingLocation: recordingMeta.meetingLocation,
          meetingContext: recordingMeta.meetingContext,
          meetingAt: recordingMeta.meetingAt,
          meetingParticipants: recordingMeta.meetingParticipants || [],
          meetingType: followUpMeetingType,
          templateStyle: followUpTemplateStyle,
          tone: followUpTone,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.message || payload?.error || `Failed: ${response.status}`));
      }

      const payload = await response.json();
      const normalized = normalizeFollowUpDraft(payload);
      if (!normalized) {
        throw new Error('No follow-up draft content was returned');
      }

      setFollowUpDraft(normalized);
      setResolvedFollowUpActionIds([]);
      void trackActivation('summary_followup_draft_completed', 'transcript_screen', {
        outcome: normalized.tone,
        step: 'followup_draft_ready',
      });
    } catch (error: any) {
      const message = String(error?.message || 'Could not generate follow-up draft');
      setFollowUpError(message);
      void trackActivation('summary_followup_draft_failed', 'transcript_screen', {
        outcome: 'failed',
        step: 'followup_draft_request',
        errorCode: toTrackingErrorCode(error),
      });
      Alert.alert('Follow-up Draft', message);
    } finally {
      setFollowUpLoading(false);
    }
  }

  function buildPrepBriefClipboardText(data: MeetingPrepBriefData): string {
    const title = recordingMeta.meetingName || normalizedFilename;
    const focus = data.strategicFocus.length > 0
      ? data.strategicFocus.map((item, index) => `${index + 1}. ${item}`)
      : ['No strategic focus points generated.'];
    const risks = data.likelyRisks.length > 0
      ? data.likelyRisks.map((item, index) => `${index + 1}. ${item}`)
      : ['No likely risks generated.'];
    const questions = data.preCallQuestions.length > 0
      ? data.preCallQuestions.map((item, index) => `${index + 1}. ${item}`)
      : ['No pre-call questions generated.'];

    return [
      `Recaply Meeting Prep Brief (${data.prepTone})`,
      `Meeting: ${title}`,
      prepGoal.trim() ? `Prep Goal: ${prepGoal.trim()}` : '',
      transcriptMetaLine ? `Meta: ${transcriptMetaLine}` : '',
      '',
      'Brief Summary:',
      data.briefSummary,
      '',
      'Strategic Focus:',
      ...focus,
      '',
      'Likely Risks / Unknowns:',
      ...risks,
      '',
      'Pre-call Questions:',
      ...questions,
      '',
      'Opening Script:',
      data.openingScript,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function copyPrepBrief() {
    if (!prepBrief) {
      return;
    }

    try {
      await Clipboard.setStringAsync(buildPrepBriefClipboardText(prepBrief));
      Alert.alert('Copied!', 'Meeting prep brief copied.');
    } catch (error: any) {
      Alert.alert('Meeting Prep Brief', `Could not copy prep brief: ${error.message}`);
    }
  }

  async function sharePrepBrief() {
    if (!prepBrief) {
      return;
    }

    try {
      await Share.share({
        title: 'Recaply Meeting Prep Brief',
        message: buildPrepBriefClipboardText(prepBrief),
      });
    } catch {
      Alert.alert('Meeting Prep Brief', 'Could not open share sheet.');
    }
  }

  async function generatePrepBrief() {
    if (!summary && !transcriptText.trim()) {
      Alert.alert('Meeting Prep Brief', 'Generate a summary or provide transcript text first.');
      return;
    }

    try {
      setPrepBriefLoading(true);
      setPrepBriefError(null);

      const response = await fetch(apiUrl('/audio/prep-brief'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          recordingId: normalizedRecordingId,
          transcript: activeTranscript,
          summary: activeSummary || summary,
          meetingName: recordingMeta.meetingName,
          meetingLocation: recordingMeta.meetingLocation,
          meetingContext: recordingMeta.meetingContext,
          meetingAt: recordingMeta.meetingAt,
          meetingParticipants: recordingMeta.meetingParticipants || [],
          meetingType: followUpMeetingType,
          prepGoal: prepGoal.trim() || undefined,
          prepTone,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(String(payload?.message || payload?.error || `Failed: ${response.status}`));
      }

      const payload = await response.json();
      const normalized = normalizeMeetingPrepBrief(payload);
      if (!normalized) {
        throw new Error('No prep brief content was returned');
      }

      setPrepBrief(normalized);
    } catch (error: any) {
      const message = String(error?.message || 'Could not generate prep brief');
      setPrepBriefError(message);
      Alert.alert('Meeting Prep Brief', message);
    } finally {
      setPrepBriefLoading(false);
    }
  }

  function buildExportContent(preset: ExportPreset = exportPreset): string {
    const summaryForExport = summaryViewMode === 'translated' && translatedSummary
      ? translatedSummary
      : summary;
    const transcriptForExport = summaryViewMode === 'translated' && translatedTranscript
      ? translatedTranscript
      : transcriptText;
    const meetingTitle = recordingMeta.meetingName || normalizedFilename;
    const recordedAt = recordingMeta.meetingAt
      ? new Date(recordingMeta.meetingAt).toLocaleString()
      : new Date().toLocaleString();
    const participants = recordingMeta.meetingParticipants || [];

    let content = `Recording: ${meetingTitle}\n`;
    content += `Recorded At: ${recordedAt}\n`;
    if (recordingMeta.meetingLocation) {
      content += `Location: ${recordingMeta.meetingLocation}\n`;
    }
    if (participants.length > 0) {
      content += `Participants: ${participants.join(', ')}\n`;
    }
    if (recordingMeta.meetingContext) {
      content += `Context: ${recordingMeta.meetingContext}\n`;
    }
    content += '\n';

    if (preset === 'actions') {
      content += '=== ACTION CHECKLIST ===\n\n';
      if (summaryForExport?.actionItems && summaryForExport.actionItems.length > 0) {
        summaryForExport.actionItems.forEach((item, index) => {
          const task = typeof item === 'string' ? item : item.task || 'Untitled task';
          const owner = typeof item === 'string' ? '' : (item.assignee ? ` (Owner: ${item.assignee})` : '');
          const due = typeof item === 'string' ? '' : (item.deadline ? ` (Due: ${item.deadline})` : '');
          content += `${index + 1}. ${task}${owner}${due}\n`;
        });
      } else {
        content += 'No action items available.\n';
      }
      return content;
    }

    if (preset === 'brief') {
      content += '=== MEETING SNAPSHOT ===\n\n';
      content += `${summaryForExport?.summary || 'No summary available.'}\n\n`;

      if (summaryForExport?.keyPoints && summaryForExport.keyPoints.length > 0) {
        content += 'Top Key Points:\n';
        summaryForExport.keyPoints.slice(0, 5).forEach((point, index) => {
          content += `${index + 1}. ${point}\n`;
        });
        content += '\n';
      }

      if (summaryForExport?.actionItems && summaryForExport.actionItems.length > 0) {
        content += 'Top Actions:\n';
        summaryForExport.actionItems.slice(0, 3).forEach((item, index) => {
          const task = typeof item === 'string' ? item : item.task || 'Untitled task';
          content += `${index + 1}. ${task}\n`;
        });
      }
      return content;
    }

    content += `=== TRANSCRIPT ===\n\n${transcriptForExport}\n\n`;
    if (summaryForExport) {
      content += `=== SUMMARY ===\n\n${summaryForExport.summary || 'No summary available'}\n\n`;

      if (summaryForExport.actionItems && summaryForExport.actionItems.length > 0) {
        content += '=== ACTION ITEMS ===\n\n';
        summaryForExport.actionItems.forEach((item, index) => {
          const task = typeof item === 'string' ? item : item.task || 'Untitled task';
          content += `${index + 1}. ${task}\n`;
        });
        content += '\n';
      }

      if (summaryForExport.keyPoints && summaryForExport.keyPoints.length > 0) {
        content += '=== KEY POINTS ===\n\n';
        summaryForExport.keyPoints.forEach((point, index) => {
          content += `${index + 1}. ${point}\n`;
        });
      }
    }

    return content;
  }

  async function deleteRecording() {
    Alert.alert(
      'Delete Recording',
      'Are you sure you want to delete this recording? This is permanent and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(apiUrl(`/audio/recordings/${recordingId}`), {
                method: 'DELETE',
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              });

              if (response.ok) {
                Alert.alert('Deleted', 'Recording deleted successfully');
                navigation.navigate('Home');
              } else {
                Alert.alert('Error', 'Could not delete recording');
              }
            } catch {
              Alert.alert('Error', 'Could not delete recording');
            }
          },
        },
      ],
    );
  }

  async function saveToDownloads() {
    try {
      const content = buildExportContent();
      const downloadsPath = 'file:///storage/emulated/0/Download';
      const downloadsDir = new Directory(downloadsPath);
      const fileName = `${normalizedFilename.replace('.m4a', '')}_transcript_${Date.now()}.txt`;
      const file = new File(downloadsDir, fileName);

      const writer = file.writableStream().getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(content));
      await writer.close();

      Alert.alert(
        'Saved to Downloads!',
        `File: ${fileName}\n\nLocation: Downloads folder\n\nOpen your Files app to view it.`,
      );
    } catch (error: any) {
      Alert.alert('Error', `Could not save to Downloads: ${error.message}\n\nTry "Share/Save File" instead.`);
    }
  }

  async function copyToClipboard() {
    try {
      void trackActivation('summary_copy_tapped', 'transcript_screen', {
        outcome: getExportPresetLabel(exportPreset).toLowerCase(),
        step: 'copy_text',
      });
      await Clipboard.setStringAsync(buildExportContent());
      Alert.alert('Copied!', 'Transcript copied to clipboard. You can paste it into any app or save it to a file.');
    } catch (error: any) {
      Alert.alert('Error', `Could not copy to clipboard: ${error.message}`);
    }
  }

  async function shareFile() {
    try {
      const fileName = `${normalizedFilename.replace('.m4a', '')}_transcript.txt`;
      const file = new File(Paths.cache, fileName);
      const writer = file.writableStream().getWriter();
      const encoder = new TextEncoder();
      await writer.write(encoder.encode(buildExportContent()));
      await writer.close();

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/plain',
          dialogTitle: 'Export Transcript',
          UTI: 'public.plain-text',
        });
      } else {
        Alert.alert('Not Available', 'Sharing is not available on this device');
      }
    } catch (error: any) {
      Alert.alert('Error', `Could not export transcript: ${error.message}`);
    }
  }

  async function exportTranscript() {
    void trackActivation('summary_export_tapped', 'transcript_screen', {
      outcome: getExportPresetLabel(exportPreset).toLowerCase(),
      step: 'export_transcript',
    });
    Alert.alert('Export Transcript', `Template: ${getExportPresetLabel(exportPreset)}\nChoose export method:`, [
      { text: 'Save to Downloads', onPress: saveToDownloads },
      { text: 'Copy to Clipboard', onPress: copyToClipboard },
      { text: 'Share/Save File', onPress: shareFile },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handleDonePress() {
    void trackActivation('summary_done_tapped', 'transcript_screen', {
      outcome: summary ? 'summary_ready' : 'summary_pending',
      step: 'done_navigation',
    });
    navigation.navigate('Home');
  }

  function formatMeetingMeta(): string {
    const parts: string[] = [];
    if (recordingMeta.meetingAt) {
      const parsed = new Date(recordingMeta.meetingAt);
      if (!Number.isNaN(parsed.getTime())) {
        parts.push(parsed.toLocaleDateString() + ' ' + parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    }
    if (recordingMeta.meetingLocation) {
      parts.push(recordingMeta.meetingLocation);
    }
    return parts.join('  •  ');
  }

  const transcriptTitle = recordingMeta.meetingName || normalizedFilename || 'Recording';
  const transcriptMetaLine = formatMeetingMeta();
  const transcriptParticipants = recordingMeta.meetingParticipants || [];
  const hasMeetingDetails = Boolean(
    transcriptMetaLine
      || recordingMeta.meetingContext
      || transcriptParticipants.length > 0,
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View pointerEvents="none" style={styles.bgOrbTop} />
      <View pointerEvents="none" style={styles.bgOrbBottom} />

      <Animated.View style={heroMotionStyle}>
        <AppCard variant="dark" style={styles.headerCard}>
          <View style={styles.headerGlowPrimary} />
          <View style={styles.headerGlowSecondary} />
          <View style={styles.headerTopRow}>
            <View style={styles.headerTitleBlock}>
              <Text style={styles.headerKicker}>Meeting Intelligence</Text>
              <Text style={styles.title}>Transcript</Text>
            </View>
            <View style={[styles.viewModePill, summaryViewMode === 'translated' && styles.viewModePillActive]}>
              <Text style={[styles.viewModePillText, summaryViewMode === 'translated' && styles.viewModePillTextActive]}>
                {summaryViewMode === 'translated' ? 'Translated' : 'Original'}
              </Text>
            </View>
          </View>
          <Text style={styles.filename} numberOfLines={1}>{transcriptTitle}</Text>
          {transcriptMetaLine !== '' && (
            <Text style={styles.meetingMeta}>{transcriptMetaLine}</Text>
          )}
          {recordingMeta.meetingContext && (
            <Text style={styles.meetingContext} numberOfLines={2}>{recordingMeta.meetingContext}</Text>
          )}
          <View style={styles.signalRow}>
            <View style={styles.signalChip}>
              <Text style={styles.signalChipText}>{summaryStatus}</Text>
            </View>
            <View style={styles.signalChip}>
              <Text style={styles.signalChipText}>{viewModeLabel}</Text>
            </View>
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{wordCount}</Text>
              <Text style={styles.statLabel}>Words</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{summaryPointCount}</Text>
              <Text style={styles.statLabel}>Key Points</Text>
            </View>
            <View style={styles.statPill}>
              <Text style={styles.statValue}>{summaryActionCount}</Text>
              <Text style={styles.statLabel}>Actions</Text>
            </View>
          </View>
        </AppCard>
      </Animated.View>

      <Animated.View style={bodyMotionStyle}>
      <AppCard variant="dark" style={styles.valueStoryCard}>
        <View style={styles.valueStoryGlowPrimary} />
        <View style={styles.valueStoryGlowSecondary} />
        <Text style={styles.valueStoryKicker}>First-Session Wow</Text>
        <Text style={styles.valueStoryTitle}>From raw notes to executive clarity</Text>
        <Text style={styles.valueStorySubtitle}>
          Recaply compresses long transcripts into share-ready decision intelligence.
        </Text>
        <View style={styles.valueStorySignalRow}>
          <View style={styles.valueStorySignalChip}>
            <Text style={styles.valueStorySignalText}>{valueStorySignal}</Text>
          </View>
          <View style={styles.valueStorySignalChip}>
            <Text style={styles.valueStorySignalText}>{compressionPercent}% shorter narrative</Text>
          </View>
          <View style={styles.valueStorySignalChip}>
            <Text style={styles.valueStorySignalText}>{languageSignal}</Text>
          </View>
        </View>
        <View style={styles.valueStoryCompareRow}>
          <View style={styles.valueStoryPanel}>
            <Text style={styles.valueStoryPanelLabel}>Raw Notes</Text>
            <Text style={styles.valueStoryPanelText} numberOfLines={showValueStoryExpanded ? 8 : 3}>
              {rawTranscriptPreview}
            </Text>
            <Text style={styles.valueStoryPanelMeta}>{wordCount} words • ~{rawReadMinutes} min read</Text>
          </View>
          <View style={styles.valueStoryPanel}>
            <Text style={styles.valueStoryPanelLabel}>Executive Recap</Text>
            <Text style={styles.valueStoryPanelText} numberOfLines={showValueStoryExpanded ? 8 : 3}>
              {recapPreview}
            </Text>
            <Text style={styles.valueStoryPanelMeta}>
              {summaryWordCount > 0 ? `${summaryWordCount} words • ~${summaryReadMinutes} min read` : 'Summary pending'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.valueStoryToggle}
          onPress={() => setShowValueStoryExpanded((current) => !current)}
        >
          <Text style={styles.valueStoryToggleText}>
            {showValueStoryExpanded ? 'Collapse preview' : 'Expand preview'}
          </Text>
        </TouchableOpacity>
      </AppCard>

      {hasMeetingDetails && (
        <AppCard style={styles.meetingDetailsCard}>
          <Text style={styles.meetingDetailsTitle}>Meeting Details</Text>
          {transcriptMetaLine !== '' && (
            <Text style={styles.meetingDetailsMeta}>{transcriptMetaLine}</Text>
          )}
          {recordingMeta.meetingContext ? (
            <Text style={styles.meetingDetailsContext}>{recordingMeta.meetingContext}</Text>
          ) : null}
          {transcriptParticipants.length > 0 && (
            <View style={styles.participantsBlock}>
              <Text style={styles.participantsLabel}>Participants</Text>
              <View style={styles.participantsRow}>
                {transcriptParticipants.map((participant) => (
                  <View key={participant} style={styles.participantChip}>
                    <Text style={styles.participantChipText}>{participant}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </AppCard>
      )}

      <AppCard style={styles.askCard}>
        <Text style={styles.askTitle}>Ask Recaply</Text>
        <Text style={styles.askSubtitle}>Search your recent meetings with AI and open source evidence.</Text>
        <View style={styles.askInputRow}>
          <TextInput
            style={styles.askInput}
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
        {askError && <Text style={styles.askError}>{askError}</Text>}
        {askResponse && (
          <View style={styles.askResultArea}>
            <Text style={styles.askAnswerText}>{askResponse.answer}</Text>
            {askResponse.citations.length > 0 && (
              <View style={styles.askCitationsBlock}>
                <Text style={styles.askSectionLabel}>Sources</Text>
                {askResponse.citations.map((citation) => (
                  <TouchableOpacity
                    key={`${citation.recordingId}-${citation.meetingName}`}
                    style={styles.askCitationCard}
                    onPress={() => void openCitation(citation.recordingId)}
                    disabled={openingCitationId === citation.recordingId}
                  >
                    <Text style={styles.askCitationTitle}>
                      {openingCitationId === citation.recordingId ? 'Opening...' : citation.meetingName}
                    </Text>
                    {citation.meetingAt && (
                      <Text style={styles.askCitationMeta}>{formatCitationDate(citation.meetingAt)}</Text>
                    )}
                    {citation.reason ? <Text style={styles.askCitationReason}>{citation.reason}</Text> : null}
                    {citation.snippet ? <Text style={styles.askCitationSnippet} numberOfLines={2}>{citation.snippet}</Text> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {askResponse.followUpQuestions.length > 0 && (
              <View style={styles.askFollowUpBlock}>
                <Text style={styles.askSectionLabel}>Try next</Text>
                <View style={styles.askFollowUpRow}>
                  {askResponse.followUpQuestions.map((question) => (
                    <TouchableOpacity
                      key={question}
                      style={styles.askFollowUpChip}
                      onPress={() => setAskQuery(question)}
                    >
                      <Text style={styles.askFollowUpChipText}>{question}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </AppCard>

      {audioUrlFromDB && (
        <AppCard style={styles.audioPlayerContainer}>
          <View style={styles.audioHeaderRow}>
            <Text style={styles.audioHeaderTitle}>Playback</Text>
            <AppButton
              label={isPlaying ? '⏸️ Pause' : '▶️ Play'}
              style={styles.playButton}
              textStyle={styles.playButtonText}
              onPress={playAudio}
            />
          </View>

          {duration > 0 && (
            <View style={styles.seekBarContainer}>
              <Text style={styles.timeText}>{formatTime(position)}</Text>
              <Slider
                style={styles.slider}
                minimumValue={0}
                maximumValue={duration}
                value={position}
                onValueChange={onSeek}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor="#d1d5db"
                thumbTintColor={colors.accent}
              />
              <Text style={styles.timeText}>{formatTime(duration)}</Text>
            </View>
          )}
        </AppCard>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transcription</Text>
          <TouchableOpacity
            style={styles.showToggle}
            onPress={() => setShowFullTranscript((prev) => !prev)}
          >
            <Text style={styles.showToggleText}>{showFullTranscript ? 'Show less' : 'Show full'}</Text>
          </TouchableOpacity>
        </View>
        <AppCard style={styles.card}>
          <Text style={styles.text} numberOfLines={showFullTranscript ? undefined : 8}>
            {activeTranscript}
          </Text>
        </AppCard>
      </View>

      {(summary || transcriptText.trim()) && (
        <AppCard style={styles.translateCard}>
          <View style={styles.translateHeaderRow}>
            <Text style={styles.translateTitle}>🌐 Translate Content</Text>
            {(translatedSummary || translatedTranscript) && (
              <TouchableOpacity
                style={styles.translationResetButton}
                onPress={() => {
                  setTranslatedSummary(null);
                  setTranslatedTranscript(null);
                  setSummaryViewMode('original');
                  setActiveTranslatedLanguage(null);
                  setTranslationError(null);
                }}
              >
                <Text style={styles.translationResetButtonText}>Reset</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.translateSubtitle}>
            Translate transcript and AI breakdown into any language.
          </Text>
          <View style={styles.translateLanguageRow}>
            {TRANSLATION_LANGUAGES.map((language) => {
              const isSelected = selectedLanguage === language.code;
              return (
                <TouchableOpacity
                  key={language.code}
                  style={[styles.translateLanguageChip, isSelected && styles.translateLanguageChipActive]}
                  onPress={() => {
                    setSelectedLanguage(language.code);
                    setCustomLanguageInput('');
                    void setDefaultTranslationLanguage(language.code);
                  }}
                >
                  <Text
                    style={[
                      styles.translateLanguageChipText,
                      isSelected && styles.translateLanguageChipTextActive,
                    ]}
                  >
                    {language.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={customLanguageInput}
            onChangeText={setCustomLanguageInput}
            placeholder="Or type any language (e.g., Swahili, Tagalog, Dutch)"
            placeholderTextColor={colors.textMuted}
            style={styles.translateLanguageInput}
            autoCapitalize="words"
          />
          {savedTranslationLanguages.length > 0 && (
            <View style={styles.savedTranslationsSection}>
              <Text style={styles.savedTranslationsLabel}>Saved for this recording:</Text>
              <View style={styles.savedTranslationsRow}>
                {savedTranslationLanguages.map((language) => {
                  const isActive = summaryViewMode === 'translated'
                    && normalizeTranslationKey(activeTranslatedLanguage || '') === normalizeTranslationKey(language);
                  return (
                    <TouchableOpacity
                      key={normalizeTranslationKey(language)}
                      style={[styles.savedTranslationChip, isActive && styles.savedTranslationChipActive]}
                      onPress={() => {
                        setSelectedLanguage(language);
                        setCustomLanguageInput('');
                        void setDefaultTranslationLanguage(language);
                        applySavedTranslation(language);
                      }}
                    >
                      <Text
                        style={[
                          styles.savedTranslationChipText,
                          isActive && styles.savedTranslationChipTextActive,
                        ]}
                      >
                        {language}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <View style={styles.translateActionsRow}>
            <AppButton
              label={translationLoading ? 'Translating...' : 'Translate'}
              variant="info"
              style={styles.translateButton}
              onPress={translateBreakdown}
              loading={translationLoading}
              disabled={translationLoading || translationShareLoading}
            />
            <AppButton
              label={translationShareLoading ? 'Preparing share...' : 'Share in Selected Language'}
              variant="dark"
              style={styles.translateShareButton}
              onPress={() => void shareMultilingualRecap()}
              loading={translationShareLoading}
              disabled={translationLoading || translationShareLoading}
            />
            {(translatedSummary || translatedTranscript) && (
              <View style={styles.translationViewToggleRow}>
                <TouchableOpacity
                  style={[
                    styles.translationViewToggle,
                    summaryViewMode === 'original' && styles.translationViewToggleActive,
                  ]}
                  onPress={() => setSummaryViewMode('original')}
                >
                  <Text
                    style={[
                      styles.translationViewToggleText,
                      summaryViewMode === 'original' && styles.translationViewToggleTextActive,
                    ]}
                  >
                    Original
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.translationViewToggle,
                    summaryViewMode === 'translated' && styles.translationViewToggleActive,
                  ]}
                  onPress={() => setSummaryViewMode('translated')}
                >
                  <Text
                    style={[
                      styles.translationViewToggleText,
                      summaryViewMode === 'translated' && styles.translationViewToggleTextActive,
                    ]}
                  >
                    Translated
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {summaryViewMode === 'translated' && (translatedSummary || translatedTranscript) && (
            <Text style={styles.translationViewHint}>
              Viewing translated content in {activeTranslatedLanguage || selectedLanguage}.
            </Text>
          )}
          {translationError && <Text style={styles.translationErrorText}>{translationError}</Text>}
        </AppCard>
      )}

      {!summary && (
        <AppButton
          label="✨ Generate AI Summary"
          variant="warning"
          style={styles.generateButton}
          textStyle={styles.buttonText}
          onPress={generateSummary}
          loading={loading}
          disabled={loading}
        />
      )}

      {summary && (
        <>
          <View style={styles.section}>
            <View style={styles.summaryHeaderRow}>
              <Text style={styles.sectionTitle}>📝 Summary</Text>
              <TouchableOpacity
                style={styles.highlightSaveButton}
                onPress={() => void saveHighlight('summary', activeSummary?.summary || '')}
              >
                <Text style={styles.highlightSaveButtonText}>Save Highlight</Text>
              </TouchableOpacity>
            </View>
            <AppCard style={styles.card}>
              <Text style={styles.text}>{activeSummary?.summary || 'No summary available.'}</Text>
            </AppCard>
          </View>

          <AppCard style={styles.outputTemplateCard}>
            <Text style={styles.outputTemplateTitle}>Template Output Packs</Text>
            <Text style={styles.outputTemplateSubtitle}>
              One tap generates polished updates for different audiences.
            </Text>
            <View style={styles.outputTemplateChipRow}>
              {OUTPUT_TEMPLATE_OPTIONS.map((option) => {
                const selected = selectedOutputTemplate === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.outputTemplateChip, selected && styles.outputTemplateChipActive]}
                    onPress={() => setSelectedOutputTemplate(option.value)}
                  >
                    <Text style={[styles.outputTemplateChipText, selected && styles.outputTemplateChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.outputTemplateHint}>
              {OUTPUT_TEMPLATE_OPTIONS.find((option) => option.value === selectedOutputTemplate)?.hint}
            </Text>
            <View style={styles.outputTemplatePreviewCard}>
              <Text style={styles.outputTemplatePreviewText}>{selectedOutputTemplateContent}</Text>
            </View>
            <View style={styles.outputTemplateActionRow}>
              <AppButton
                label="Copy Pack"
                variant="info"
                style={styles.outputTemplateActionButton}
                onPress={() => void copyOutputTemplate()}
              />
              <AppButton
                label="Share Pack"
                variant="dark"
                style={styles.outputTemplateActionButton}
                onPress={() => void shareOutputTemplate()}
              />
            </View>
          </AppCard>

          <AppCard style={styles.shareBundleCard}>
            <Text style={styles.shareBundleTitle}>Branded Share Bundle</Text>
            <Text style={styles.shareBundleSubtitle}>
              Create a polished share packet with a direct Recaply link and install fallback.
            </Text>
            <View style={styles.shareBundleChipRow}>
              {SHARE_BUNDLE_FORMAT_OPTIONS.map((option) => {
                const selected = selectedShareBundleFormat === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.shareBundleChip, selected && styles.shareBundleChipActive]}
                    onPress={() => setSelectedShareBundleFormat(option.value)}
                  >
                    <Text style={[styles.shareBundleChipText, selected && styles.shareBundleChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.shareBundleHint}>
              {SHARE_BUNDLE_FORMAT_OPTIONS.find((option) => option.value === selectedShareBundleFormat)?.hint}
            </Text>
            <View style={styles.shareBundleMetaCard}>
              <Text style={styles.shareBundleMetaText}>Bundle ID: {shareBundleId}</Text>
              <Text style={styles.shareBundleLinkText}>{recaplyDeepLink}</Text>
            </View>
            <View style={styles.shareBundlePreviewCard}>
              <Text style={styles.shareBundlePreviewText}>{brandedShareBundleContent}</Text>
            </View>
            <View style={styles.shareBundleActionRow}>
              <AppButton
                label="Copy Link"
                variant="info"
                style={styles.shareBundleActionButton}
                onPress={() => void copyShareBundleLink()}
              />
              <AppButton
                label="Copy Bundle"
                variant="dark"
                style={styles.shareBundleActionButton}
                onPress={() => void copyBrandedShareBundle()}
              />
            </View>
            <AppButton
              label="Share Bundle"
              variant="dark"
              style={styles.shareBundleShareButton}
              onPress={() => void shareBrandedShareBundle()}
            />
          </AppCard>

          <AppCard style={styles.followUpCard}>
            <View style={styles.followUpHeaderRow}>
              <Text style={styles.followUpTitle}>✉️ Follow-up Draft</Text>
              {followUpDraft && (
                <View style={styles.followUpTonePill}>
                  <Text style={styles.followUpToneText}>{followUpDraft.tone}</Text>
                </View>
              )}
            </View>
            <Text style={styles.followUpSubtitle}>
              Generate a polished email, Slack update, and checklist from this meeting.
            </Text>
            <Text style={styles.followUpSelectorLabel}>Meeting Type</Text>
            <View style={styles.followUpMeetingTypeRow}>
              {FOLLOW_UP_MEETING_TYPE_OPTIONS.map((option) => {
                const selected = followUpMeetingType === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.followUpMeetingTypeChip,
                      selected && styles.followUpMeetingTypeChipActive,
                    ]}
                    onPress={() => selectFollowUpMeetingType(option.value)}
                  >
                    <Text
                      style={[
                        styles.followUpMeetingTypeText,
                        selected && styles.followUpMeetingTypeTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.followUpSelectorHint}>
              {FOLLOW_UP_MEETING_TYPE_OPTIONS.find((option) => option.value === followUpMeetingType)?.hint}
            </Text>

            <Text style={styles.followUpSelectorLabel}>Template Focus</Text>
            <View style={styles.followUpTemplateRow}>
              {recommendedFollowUpTemplates.map((option) => {
                const selected = followUpTemplateStyle === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.followUpTemplateChip,
                      selected && styles.followUpTemplateChipActive,
                    ]}
                    onPress={() => selectFollowUpTemplateStyle(option.value)}
                  >
                    <Text
                      style={[
                        styles.followUpTemplateText,
                        selected && styles.followUpTemplateTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.followUpSelectorHint}>
              {recommendedFollowUpTemplates.find((option) => option.value === followUpTemplateStyle)?.hint}
            </Text>

            <Text style={styles.followUpSelectorLabel}>Tone</Text>
            <View style={styles.followUpToneSelectorRow}>
              {FOLLOW_UP_TONE_OPTIONS.map((option) => {
                const selected = followUpTone === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.followUpToneOptionChip,
                      selected && styles.followUpToneOptionChipActive,
                    ]}
                    onPress={() => selectFollowUpTone(option.value)}
                  >
                    <Text
                      style={[
                        styles.followUpToneOptionText,
                        selected && styles.followUpToneOptionTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.followUpToneHint}>
              {FOLLOW_UP_TONE_OPTIONS.find((option) => option.value === followUpTone)?.hint}
            </Text>
            <View style={styles.followUpActionRow}>
              <AppButton
                label={followUpLoading ? 'Drafting...' : 'Draft Follow-up'}
                variant="info"
                style={styles.followUpPrimaryButton}
                onPress={generateFollowUpDraft}
                loading={followUpLoading}
                disabled={followUpLoading}
              />
              <AppButton
                label="Copy Follow-up"
                variant="dark"
                style={styles.followUpSecondaryButton}
                onPress={copyFollowUpDraft}
                disabled={followUpLoading || !followUpDraft}
              />
            </View>
            {followUpError && <Text style={styles.followUpErrorText}>{followUpError}</Text>}
            {followUpDraft && (
              <View style={styles.followUpContent}>
                <View style={styles.followUpChannelRow}>
                  <AppButton
                    label="Copy Email"
                    variant="info"
                    style={styles.followUpChannelButton}
                    onPress={() => void copyFollowUpSection('email')}
                  />
                  <AppButton
                    label="Share Email"
                    variant="dark"
                    style={styles.followUpChannelButton}
                    onPress={() => void shareFollowUpSection('email')}
                  />
                </View>
                <View style={styles.followUpChannelRow}>
                  <AppButton
                    label="Copy Slack"
                    variant="info"
                    style={styles.followUpChannelButton}
                    onPress={() => void copyFollowUpSection('slack')}
                  />
                  <AppButton
                    label="Share Slack"
                    variant="dark"
                    style={styles.followUpChannelButton}
                    onPress={() => void shareFollowUpSection('slack')}
                  />
                </View>
                <View style={styles.followUpChannelRow}>
                  <AppButton
                    label="Copy Checklist"
                    variant="dark"
                    style={styles.followUpChannelButtonSingle}
                    onPress={() => void copyFollowUpSection('checklist')}
                  />
                </View>
                <Text style={styles.followUpLabel}>CRM / PM Exports</Text>
                <View style={styles.followUpChannelRow}>
                  <AppButton
                    label="Copy Salesforce"
                    variant="info"
                    style={styles.followUpChannelButton}
                    onPress={() => void copyCrmExport('salesforce')}
                  />
                  <AppButton
                    label="Copy HubSpot"
                    variant="info"
                    style={styles.followUpChannelButton}
                    onPress={() => void copyCrmExport('hubspot')}
                  />
                </View>
                <View style={styles.followUpChannelRow}>
                  <AppButton
                    label="Copy Notion"
                    variant="dark"
                    style={styles.followUpChannelButton}
                    onPress={() => void copyCrmExport('notion')}
                  />
                  <AppButton
                    label="Share CRM Packet"
                    variant="dark"
                    style={styles.followUpChannelButton}
                    onPress={() => void shareCrmPacket()}
                  />
                </View>
                <Text style={styles.followUpLabel}>Action Follow-through</Text>
                <Text style={styles.followUpMetaText}>
                  {pendingFollowUpActions.length} pending • {completedFollowUpActionCount} resolved
                </Text>
                <Text style={styles.followUpPrioritizationHint}>
                  Ordered by risk and due date (urgent items first).
                </Text>
                <View style={styles.followUpCadenceRow}>
                  {FOLLOW_UP_REMINDER_CADENCE_OPTIONS.map((option) => {
                    const selected = followUpReminderCadence === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.followUpCadenceChip,
                          selected && styles.followUpCadenceChipActive,
                        ]}
                        onPress={() => selectFollowUpReminderCadence(option.value)}
                      >
                        <Text
                          style={[
                            styles.followUpCadenceChipText,
                            selected && styles.followUpCadenceChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {followUpStrategyRecommendation && (
                  <View style={styles.followUpStrategyCard}>
                    <Text style={styles.followUpStrategyTitle}>Strategy Autopilot</Text>
                    <Text style={styles.followUpStrategyBody}>
                      Recommended: {getFollowUpReminderPersonaLabel(followUpStrategyRecommendation.persona)} persona •
                      {' '}Escalation {followUpStrategyRecommendation.escalationEnabled ? 'On' : 'Off'}
                      {followUpStrategyRecommendation.escalationEnabled
                        ? ` (${getFollowUpEscalationThresholdLabel(followUpStrategyRecommendation.escalationThresholdHours)})`
                        : ''}
                    </Text>
                    <Text style={styles.followUpStrategyMeta}>
                      {followUpStrategyRecommendation.reason}
                    </Text>
                    <Text style={styles.followUpStrategyMeta}>
                      Source: {followUpStrategyRecommendation.source} • Sample: {followUpStrategyRecommendation.sampleSize}
                    </Text>
                    {!followUpStrategyRecommendationMatchesCurrent && (
                      <AppButton
                        label="Apply Recommendation"
                        variant="dark"
                        style={styles.followUpStrategyButton}
                        onPress={() => applyFollowUpStrategyRecommendation(followUpStrategyRecommendation, true)}
                      />
                    )}
                  </View>
                )}
                <Text style={styles.followUpSelectorLabel}>Reminder Persona</Text>
                <View style={styles.followUpCadenceRow}>
                  {FOLLOW_UP_REMINDER_PERSONA_OPTIONS.map((option) => {
                    const selected = followUpReminderPersona === option.value;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.followUpCadenceChip,
                          selected && styles.followUpCadenceChipActive,
                        ]}
                        onPress={() => selectFollowUpReminderPersona(option.value)}
                      >
                        <Text
                          style={[
                            styles.followUpCadenceChipText,
                            selected && styles.followUpCadenceChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.followUpSelectorHint}>
                  {FOLLOW_UP_REMINDER_PERSONA_OPTIONS.find((option) => option.value === followUpReminderPersona)?.hint}
                </Text>
                <Text style={styles.followUpSelectorLabel}>Overdue Escalation</Text>
                <View style={styles.followUpEscalationToggleRow}>
                  <TouchableOpacity
                    style={[
                      styles.followUpEscalationToggleChip,
                      !followUpAutoEscalationEnabled && styles.followUpEscalationToggleChipActive,
                    ]}
                    onPress={() => setFollowUpEscalationEnabled(false)}
                  >
                    <Text
                      style={[
                        styles.followUpEscalationToggleText,
                        !followUpAutoEscalationEnabled && styles.followUpEscalationToggleTextActive,
                      ]}
                    >
                      Escalation Off
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.followUpEscalationToggleChip,
                      followUpAutoEscalationEnabled && styles.followUpEscalationToggleChipActive,
                    ]}
                    onPress={() => setFollowUpEscalationEnabled(true)}
                  >
                    <Text
                      style={[
                        styles.followUpEscalationToggleText,
                        followUpAutoEscalationEnabled && styles.followUpEscalationToggleTextActive,
                      ]}
                    >
                      Escalation On
                    </Text>
                  </TouchableOpacity>
                </View>
                {followUpAutoEscalationEnabled ? (
                  <>
                    <View style={styles.followUpCadenceRow}>
                      {FOLLOW_UP_ESCALATION_THRESHOLD_OPTIONS.map((option) => {
                        const selected = followUpEscalationThresholdHours === option.value;
                        return (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.followUpCadenceChip,
                              selected && styles.followUpCadenceChipActive,
                            ]}
                            onPress={() => selectFollowUpEscalationThreshold(option.value)}
                          >
                            <Text
                              style={[
                                styles.followUpCadenceChipText,
                                selected && styles.followUpCadenceChipTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.followUpEscalationHint}>
                      {FOLLOW_UP_ESCALATION_THRESHOLD_OPTIONS.find(
                        (option) => option.value === followUpEscalationThresholdHours,
                      )?.hint}
                    </Text>
                    <Text style={styles.followUpEscalationHint}>
                      {escalationEligiblePendingFollowUpActions.length > 0
                        ? `${escalationEligiblePendingFollowUpActions.length} pending action(s) currently meet the escalation threshold.`
                        : 'No pending actions currently meet the escalation threshold.'}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.followUpEscalationHint}>
                    Escalation is off. Resend reminders stay as gentle nudges.
                  </Text>
                )}
                {followUpActionCandidates.length > 0 ? (
                  <View style={styles.followUpActionChecklistBlock}>
                    {followUpActionCandidates.map((action) => {
                      const resolved = resolvedFollowUpActionIds.includes(action.id);
                      const riskScore = computeFollowUpActionRiskScore(action);
                      const riskLabel = getFollowUpRiskLabel(riskScore);
                      return (
                        <View key={action.id} style={styles.followUpTrackedActionRow}>
                          <View style={styles.followUpTrackedActionTextBlock}>
                            <Text
                              style={[
                                styles.followUpTrackedActionText,
                                resolved && styles.followUpTrackedActionTextResolved,
                              ]}
                            >
                              {action.text}
                            </Text>
                            {(action.owner || action.due) && (
                              <Text style={styles.followUpTrackedActionMeta}>
                                {action.owner ? `Owner: ${action.owner}` : 'Owner: Unassigned'}
                                {action.due ? ` • Due: ${action.due}` : ''}
                              </Text>
                            )}
                            <Text style={styles.followUpTrackedActionMeta}>
                              Risk: {riskLabel}
                              {action.priority ? ` • Priority: ${action.priority}` : ''}
                              {action.source === 'checklist' ? ' • Source: Draft checklist' : ''}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[styles.followUpResolveChip, resolved && styles.followUpResolveChipActive]}
                            onPress={() => toggleFollowUpActionResolved(action.id)}
                          >
                            <Text
                              style={[
                                styles.followUpResolveChipText,
                                resolved && styles.followUpResolveChipTextActive,
                              ]}
                            >
                              {resolved ? 'Undo' : 'Done'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.followUpBodyText}>No action items available to track.</Text>
                )}
                <View style={styles.followUpChannelRow}>
                  <AppButton
                    label="Resend Email Reminder"
                    variant="info"
                    style={styles.followUpChannelButton}
                    onPress={() => void resendPendingActions('email')}
                  />
                  <AppButton
                    label="Resend Slack Nudge"
                    variant="dark"
                    style={styles.followUpChannelButton}
                    onPress={() => void resendPendingActions('slack')}
                  />
                </View>
                <Text style={styles.followUpLabel}>Subject</Text>
                <Text style={styles.followUpBodyText}>{followUpDraft.subject}</Text>

                <Text style={styles.followUpLabel}>Email Draft</Text>
                <Text style={styles.followUpBodyText}>{followUpDraft.emailBody}</Text>

                <Text style={styles.followUpLabel}>Slack Draft</Text>
                <Text style={styles.followUpBodyText}>{followUpDraft.slackMessage}</Text>

                <Text style={styles.followUpLabel}>Checklist</Text>
                {followUpDraft.actionChecklist.length > 0 ? (
                  followUpDraft.actionChecklist.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.followUpChecklistItem}>
                      {index + 1}. {item}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.followUpBodyText}>No checklist items generated yet.</Text>
                )}
              </View>
            )}
          </AppCard>

          <AppCard style={styles.prepBriefCard}>
            <View style={styles.prepBriefHeaderRow}>
              <Text style={styles.prepBriefTitle}>🧠 Meeting Prep Brief</Text>
              {prepBrief && (
                <View style={styles.prepBriefTonePill}>
                  <Text style={styles.prepBriefToneText}>{prepBrief.prepTone}</Text>
                </View>
              )}
            </View>
            <Text style={styles.prepBriefSubtitle}>
              Build a pre-call strategy brief with risks, sharp questions, and a ready opening script.
            </Text>
            <Text style={styles.prepBriefSelectorLabel}>Prep Goal (Optional)</Text>
            <TextInput
              value={prepGoal}
              onChangeText={setPrepGoal}
              placeholder="Example: Align on timeline risks and secure owner commitments"
              placeholderTextColor={colors.textMuted}
              style={styles.prepBriefGoalInput}
              autoCapitalize="sentences"
              multiline
            />
            <Text style={styles.prepBriefSelectorLabel}>Prep Tone</Text>
            <View style={styles.prepBriefToneRow}>
              {PREP_BRIEF_TONE_OPTIONS.map((option) => {
                const selected = prepTone === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.prepBriefToneChip, selected && styles.prepBriefToneChipActive]}
                    onPress={() => selectPrepTone(option.value)}
                  >
                    <Text
                      style={[
                        styles.prepBriefToneChipText,
                        selected && styles.prepBriefToneChipTextActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.prepBriefSelectorHint}>
              {PREP_BRIEF_TONE_OPTIONS.find((option) => option.value === prepTone)?.hint}
            </Text>
            <View style={styles.prepBriefActionRow}>
              <AppButton
                label={prepBriefLoading ? 'Building...' : 'Generate Prep Brief'}
                variant="info"
                style={styles.prepBriefPrimaryButton}
                onPress={generatePrepBrief}
                loading={prepBriefLoading}
                disabled={prepBriefLoading}
              />
              <AppButton
                label="Copy Brief"
                variant="dark"
                style={styles.prepBriefSecondaryButton}
                onPress={() => void copyPrepBrief()}
                disabled={prepBriefLoading || !prepBrief}
              />
            </View>
            <AppButton
              label="Share Brief"
              variant="dark"
              style={styles.prepBriefShareButton}
              onPress={() => void sharePrepBrief()}
              disabled={prepBriefLoading || !prepBrief}
            />
            {prepBriefError && <Text style={styles.prepBriefErrorText}>{prepBriefError}</Text>}
            {prepBrief && (
              <View style={styles.prepBriefContent}>
                <Text style={styles.prepBriefLabel}>Brief Summary</Text>
                <Text style={styles.prepBriefBodyText}>{prepBrief.briefSummary}</Text>

                <Text style={styles.prepBriefLabel}>Strategic Focus</Text>
                {prepBrief.strategicFocus.length > 0 ? (
                  prepBrief.strategicFocus.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.prepBriefListItem}>
                      {index + 1}. {item}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.prepBriefBodyText}>No strategic focus points generated.</Text>
                )}

                <Text style={styles.prepBriefLabel}>Likely Risks / Unknowns</Text>
                {prepBrief.likelyRisks.length > 0 ? (
                  prepBrief.likelyRisks.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.prepBriefListItem}>
                      {index + 1}. {item}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.prepBriefBodyText}>No likely risks generated.</Text>
                )}

                <Text style={styles.prepBriefLabel}>Pre-call Questions</Text>
                {prepBrief.preCallQuestions.length > 0 ? (
                  prepBrief.preCallQuestions.map((item, index) => (
                    <Text key={`${item}-${index}`} style={styles.prepBriefListItem}>
                      {index + 1}. {item}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.prepBriefBodyText}>No pre-call questions generated.</Text>
                )}

                <Text style={styles.prepBriefLabel}>Opening Script</Text>
                <Text style={styles.prepBriefBodyText}>{prepBrief.openingScript}</Text>
              </View>
            )}
          </AppCard>

          {activeSummary?.actionItems && activeSummary.actionItems.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✅ Action Items</Text>
              {activeSummary.actionItems.map((item, index) => {
                const task = typeof item === 'string' ? item : item.task || 'Untitled task';
                const assignee = typeof item === 'object' ? item.assignee : undefined;
                const priority = typeof item === 'object' ? item.priority : undefined;
                const deadline = typeof item === 'object' ? item.deadline : undefined;

                return (
                  <AppCard key={index} style={styles.actionItem}>
                    <View style={styles.actionDot} />
                    <View style={styles.actionContent}>
                      <Text style={styles.actionText}>{task}</Text>
                      <TouchableOpacity
                        style={styles.inlineHighlightSaveChip}
                        onPress={() => void saveHighlight('action_item', task)}
                      >
                        <Text style={styles.inlineHighlightSaveChipText}>Save highlight</Text>
                      </TouchableOpacity>
                      {(assignee || priority || deadline) && (
                        <View style={styles.actionMetadata}>
                          {assignee && assignee !== 'self' && <Text style={styles.metadataText}>Owner: {assignee}</Text>}
                          {priority && (
                            <Text
                              style={[
                                styles.metadataText,
                                priority === 'high' && styles.priorityHigh,
                                priority === 'medium' && styles.priorityMedium,
                                priority === 'low' && styles.priorityLow,
                              ]}
                            >
                              Priority: {priority}
                            </Text>
                          )}
                          {deadline && <Text style={styles.metadataText}>Due: {deadline}</Text>}
                        </View>
                      )}
                    </View>
                  </AppCard>
                );
              })}
            </View>
          )}

          {activeSummary?.keyPoints && activeSummary.keyPoints.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🎯 Key Points</Text>
              {activeSummary.keyPoints.map((point, index) => (
                <AppCard key={index} style={styles.actionItem}>
                  <View style={[styles.actionDot, styles.keyPointDot]} />
                  <View style={styles.actionContent}>
                    <Text style={styles.actionText}>{point}</Text>
                    <TouchableOpacity
                      style={styles.inlineHighlightSaveChip}
                      onPress={() => void saveHighlight('key_point', point)}
                    >
                      <Text style={styles.inlineHighlightSaveChipText}>Save highlight</Text>
                    </TouchableOpacity>
                  </View>
                </AppCard>
              ))}
            </View>
          )}
        </>
      )}

      <AppCard style={styles.exportPresetCard}>
        <Text style={styles.exportPresetTitle}>Export Template</Text>
        <View style={styles.exportPresetRow}>
          {(['full', 'brief', 'actions'] as ExportPreset[]).map((preset) => {
            const active = exportPreset === preset;
            return (
              <TouchableOpacity
                key={preset}
                style={[styles.exportPresetChip, active && styles.exportPresetChipActive]}
                onPress={() => setExportPreset(preset)}
              >
                <Text style={[styles.exportPresetChipText, active && styles.exportPresetChipTextActive]}>
                  {getExportPresetLabel(preset)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.exportPresetHint}>{getExportPresetHint(exportPreset)}</Text>
      </AppCard>

      <AppButton
        label="Done"
        variant="dark"
        style={styles.doneButton}
        textStyle={styles.doneButtonText}
        onPress={handleDonePress}
      />

      <View style={styles.secondaryActions}>
        <AppButton
          label="📤 Export Transcript"
          variant="info"
          style={styles.exportButton}
          textStyle={styles.exportButtonText}
          onPress={exportTranscript}
        />
        <AppButton
          label="Copy Text"
          variant="dark"
          style={styles.clipboardButton}
          textStyle={styles.clipboardButtonText}
          onPress={copyToClipboard}
        />
      </View>

      {recordingId && (
        <AppButton
          label="🗑️ Delete Recording"
          variant="danger"
          style={styles.deleteButton}
          textStyle={styles.deleteButtonText}
          onPress={deleteRecording}
        />
      )}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },
  content: {
    paddingTop: 8,
    paddingBottom: 30,
  },
  bgOrbTop: {
    position: 'absolute',
    top: -110,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#d9e7ff',
    opacity: 0.75,
  },
  bgOrbBottom: {
    position: 'absolute',
    top: 260,
    left: -60,
    width: 180,
    height: 180,
    borderRadius: 999,
    backgroundColor: '#edf4ff',
    opacity: 0.9,
  },
  headerCard: {
    marginTop: 18,
    marginHorizontal: spacing.md,
    borderRadius: radii.xl,
    padding: spacing.lg,
    borderColor: '#2d4865',
    overflow: 'hidden',
  },
  headerGlowPrimary: {
    position: 'absolute',
    top: -60,
    right: -25,
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: '#2169ff',
    opacity: 0.34,
  },
  headerGlowSecondary: {
    position: 'absolute',
    bottom: -90,
    left: -45,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#2e5b8d',
    opacity: 0.34,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitleBlock: {
    flex: 1,
  },
  headerKicker: {
    fontSize: 11,
    color: colors.textOnDarkMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontFamily: typography.heading,
  },
  viewModePill: {
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  viewModePillActive: {
    backgroundColor: '#0b5fff',
    borderColor: '#79a3ff',
  },
  viewModePillText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  viewModePillTextActive: {
    color: colors.surface,
  },
  title: {
    marginTop: 6,
    fontSize: 28,
    lineHeight: 32,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  filename: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  meetingMeta: {
    fontSize: 12,
    color: colors.textOnDarkMuted,
    marginTop: 4,
    fontFamily: typography.body,
  },
  meetingContext: {
    marginTop: 6,
    fontSize: 12,
    color: colors.textOnDarkMuted,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  signalRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  signalChip: {
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  signalChipText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  valueStoryCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderColor: '#2f4d6f',
    overflow: 'hidden',
  },
  valueStoryGlowPrimary: {
    position: 'absolute',
    top: -90,
    right: -20,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#1d70ff',
    opacity: 0.24,
  },
  valueStoryGlowSecondary: {
    position: 'absolute',
    bottom: -120,
    left: -40,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: '#2d5b8d',
    opacity: 0.24,
  },
  valueStoryKicker: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  valueStoryTitle: {
    marginTop: 6,
    fontSize: 22,
    lineHeight: 27,
    color: colors.textOnDark,
    fontFamily: typography.display,
  },
  valueStorySubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textOnDarkMuted,
    fontFamily: typography.body,
  },
  valueStorySignalRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  valueStorySignalChip: {
    borderWidth: 1,
    borderColor: '#4a6d94',
    borderRadius: radii.pill,
    backgroundColor: '#18334d',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  valueStorySignalText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  valueStoryCompareRow: {
    marginTop: 12,
    gap: 8,
  },
  valueStoryPanel: {
    borderWidth: 1,
    borderColor: '#4d7098',
    borderRadius: radii.md,
    backgroundColor: '#17314a',
    padding: 10,
  },
  valueStoryPanelLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#a7c6e6',
    fontFamily: typography.heading,
  },
  valueStoryPanelText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textOnDark,
    fontFamily: typography.body,
  },
  valueStoryPanelMeta: {
    marginTop: 8,
    fontSize: 11,
    color: colors.textOnDarkMuted,
    fontFamily: typography.heading,
  },
  valueStoryToggle: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#6c95c2',
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#224564',
  },
  valueStoryToggleText: {
    fontSize: 11,
    color: colors.textOnDark,
    fontFamily: typography.heading,
  },
  meetingDetailsCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    padding: 14,
    borderColor: '#d2dff2',
    backgroundColor: '#fbfdff',
  },
  meetingDetailsTitle: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 6,
    fontFamily: typography.heading,
  },
  meetingDetailsMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  meetingDetailsContext: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  participantsBlock: {
    marginTop: 10,
    gap: 6,
  },
  participantsLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  participantsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  participantChip: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  participantChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  askCard: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: '#d2dff2',
    borderRadius: radii.lg,
    backgroundColor: '#f8fbff',
    padding: 14,
  },
  askTitle: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  askSubtitle: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  askInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  askInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: typography.body,
  },
  askButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  askError: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  askResultArea: {
    marginTop: 10,
    gap: 10,
  },
  askAnswerText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
    fontFamily: typography.body,
  },
  askCitationsBlock: {
    gap: 8,
  },
  askSectionLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  askCitationCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 10,
    gap: 2,
  },
  askCitationTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  askCitationMeta: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
  },
  askCitationReason: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  askCitationSnippet: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    fontFamily: typography.body,
  },
  askFollowUpBlock: {
    gap: 6,
  },
  askFollowUpRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  askFollowUpChip: {
    backgroundColor: colors.accentInfoSoft,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  askFollowUpChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  statPill: {
    flex: 1,
    backgroundColor: '#17314a',
    borderWidth: 1,
    borderColor: '#355474',
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    color: colors.textOnDark,
    fontSize: 18,
    fontFamily: typography.display,
  },
  statLabel: {
    color: colors.textOnDarkMuted,
    fontSize: 11,
    marginTop: 2,
    fontFamily: typography.heading,
  },
  audioPlayerContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    padding: 14,
    borderColor: '#d2dff2',
    backgroundColor: '#fbfdff',
  },
  audioHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  audioHeaderTitle: {
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  playButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontFamily: typography.heading,
  },
  seekBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  slider: {
    flex: 1,
    marginHorizontal: 8,
  },
  timeText: {
    fontSize: 12,
    color: colors.textSecondary,
    width: 40,
    textAlign: 'center',
    fontFamily: typography.body,
  },
  section: {
    marginTop: 14,
    marginHorizontal: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 19,
    color: colors.textPrimary,
    marginBottom: 2,
    fontFamily: typography.display,
  },
  highlightSaveButton: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.accentInfoSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  highlightSaveButtonText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  showToggle: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  showToggleText: {
    fontSize: 12,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  card: {
    borderRadius: radii.lg,
    padding: spacing.md,
    borderColor: '#d9e4f4',
    backgroundColor: '#fcfdff',
  },
  text: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 23,
    fontFamily: typography.body,
  },
  generateButton: {
    marginHorizontal: spacing.md,
    marginTop: 14,
    padding: spacing.md,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontFamily: typography.heading,
  },
  translateCard: {
    marginTop: 12,
    marginHorizontal: spacing.md,
    padding: 14,
    borderWidth: 1,
    borderColor: '#c8daff',
    borderRadius: radii.lg,
    backgroundColor: '#eff5ff',
  },
  translateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  translateTitle: {
    flex: 1,
    fontSize: 16,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  translationResetButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  translationResetButtonText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  translateSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  translateLanguageRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  translateLanguageChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  translateLanguageChipActive: {
    backgroundColor: colors.surfaceDark,
    borderColor: colors.surfaceDark,
  },
  translateLanguageChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  translateLanguageChipTextActive: {
    color: colors.textOnDark,
  },
  translateLanguageInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: typography.body,
  },
  savedTranslationsSection: {
    marginTop: 10,
    gap: 8,
  },
  savedTranslationsLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  savedTranslationsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedTranslationChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  savedTranslationChipActive: {
    backgroundColor: colors.surfaceDark,
    borderColor: colors.surfaceDark,
  },
  savedTranslationChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  savedTranslationChipTextActive: {
    color: colors.textOnDark,
  },
  translateActionsRow: {
    marginTop: 10,
    gap: 10,
  },
  translateButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  translateShareButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
  },
  translationViewToggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  translationViewToggle: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  translationViewToggleActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  translationViewToggleText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  translationViewToggleTextActive: {
    color: colors.textOnDark,
  },
  translationViewHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  translationErrorText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  actionItem: {
    flexDirection: 'row',
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
  },
  outputTemplateCard: {
    marginHorizontal: spacing.md,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#c8daff',
    borderRadius: radii.lg,
    backgroundColor: '#eef5ff',
  },
  outputTemplateTitle: {
    fontSize: 16,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  outputTemplateSubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  outputTemplateChipRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  outputTemplateChip: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  outputTemplateChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  outputTemplateChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  outputTemplateChipTextActive: {
    color: colors.textOnDark,
  },
  outputTemplateHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  outputTemplatePreviewCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d6e2f4',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 10,
  },
  outputTemplatePreviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    fontFamily: typography.body,
  },
  outputTemplateActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  outputTemplateActionButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  shareBundleCard: {
    marginHorizontal: spacing.md,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#b8d0ff',
    borderRadius: radii.lg,
    backgroundColor: '#edf4ff',
  },
  shareBundleTitle: {
    fontSize: 16,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  shareBundleSubtitle: {
    marginTop: 5,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  shareBundleChipRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  shareBundleChip: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareBundleChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  shareBundleChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  shareBundleChipTextActive: {
    color: colors.textOnDark,
  },
  shareBundleHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  shareBundleMetaCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#c8daff',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 10,
    gap: 4,
  },
  shareBundleMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  shareBundleLinkText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.body,
  },
  shareBundlePreviewCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#d6e2f4',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 10,
  },
  shareBundlePreviewText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textPrimary,
    fontFamily: typography.body,
  },
  shareBundleActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
  },
  shareBundleActionButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  shareBundleShareButton: {
    marginTop: 8,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  followUpCard: {
    marginHorizontal: spacing.md,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#d6e2f4',
    borderRadius: radii.lg,
    backgroundColor: '#f7fbff',
  },
  followUpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  followUpTitle: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  followUpTonePill: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  followUpToneText: {
    fontSize: 11,
    color: colors.accentInfoText,
    textTransform: 'capitalize',
    fontFamily: typography.heading,
  },
  followUpSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  followUpSelectorLabel: {
    marginTop: 10,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  followUpMeetingTypeRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  followUpMeetingTypeChip: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followUpMeetingTypeChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  followUpMeetingTypeText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  followUpMeetingTypeTextActive: {
    color: colors.textOnDark,
  },
  followUpTemplateRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  followUpTemplateChip: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followUpTemplateChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  followUpTemplateText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  followUpTemplateTextActive: {
    color: colors.textOnDark,
  },
  followUpSelectorHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  followUpToneSelectorRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  followUpToneOptionChip: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followUpToneOptionChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  followUpToneOptionText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  followUpToneOptionTextActive: {
    color: colors.textOnDark,
  },
  followUpToneHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  followUpActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  followUpPrimaryButton: {
    flex: 1,
    paddingHorizontal: 12,
  },
  followUpSecondaryButton: {
    flex: 1,
    paddingHorizontal: 12,
  },
  followUpErrorText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  followUpContent: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#d6e2f4',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
  },
  followUpChannelRow: {
    flexDirection: 'row',
    gap: 8,
  },
  followUpChannelButton: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  followUpChannelButtonSingle: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  followUpMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  followUpPrioritizationHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  followUpCadenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  followUpStrategyCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: 10,
    gap: 4,
  },
  followUpStrategyTitle: {
    fontSize: 12,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  followUpStrategyBody: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
    lineHeight: 18,
  },
  followUpStrategyMeta: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: typography.body,
    lineHeight: 16,
  },
  followUpStrategyButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
  },
  followUpCadenceChip: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followUpCadenceChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  followUpCadenceChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  followUpCadenceChipTextActive: {
    color: colors.textOnDark,
  },
  followUpEscalationToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  followUpEscalationToggleChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
  },
  followUpEscalationToggleChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  followUpEscalationToggleText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  followUpEscalationToggleTextActive: {
    color: colors.textOnDark,
  },
  followUpEscalationHint: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  followUpActionChecklistBlock: {
    marginTop: 2,
    gap: 8,
  },
  followUpTrackedActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  followUpTrackedActionTextBlock: {
    flex: 1,
    gap: 2,
  },
  followUpTrackedActionText: {
    fontSize: 13,
    color: colors.textPrimary,
    fontFamily: typography.body,
    lineHeight: 18,
  },
  followUpTrackedActionTextResolved: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  followUpTrackedActionMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  followUpResolveChip: {
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followUpResolveChipActive: {
    borderColor: colors.success,
    backgroundColor: '#e7f9ef',
  },
  followUpResolveChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  followUpResolveChipTextActive: {
    color: '#176b3b',
  },
  followUpLabel: {
    marginTop: 4,
    fontSize: 12,
    color: colors.accentInfoText,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: typography.heading,
  },
  followUpBodyText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  followUpChecklistItem: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  prepBriefCard: {
    marginHorizontal: spacing.md,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#cde4d5',
    borderRadius: radii.lg,
    backgroundColor: '#f3fbf6',
  },
  prepBriefHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  prepBriefTitle: {
    flex: 1,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: typography.heading,
  },
  prepBriefTonePill: {
    borderWidth: 1,
    borderColor: '#9ec6ab',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  prepBriefToneText: {
    fontSize: 11,
    color: '#23613b',
    textTransform: 'capitalize',
    fontFamily: typography.heading,
  },
  prepBriefSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    fontFamily: typography.body,
  },
  prepBriefSelectorLabel: {
    marginTop: 10,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  prepBriefGoalInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#c8dfcf',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 64,
    textAlignVertical: 'top',
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 18,
  },
  prepBriefToneRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  prepBriefToneChip: {
    borderWidth: 1,
    borderColor: '#9ec6ab',
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  prepBriefToneChipActive: {
    borderColor: colors.surfaceDark,
    backgroundColor: colors.surfaceDark,
  },
  prepBriefToneChipText: {
    fontSize: 11,
    color: '#23613b',
    fontFamily: typography.heading,
  },
  prepBriefToneChipTextActive: {
    color: colors.textOnDark,
  },
  prepBriefSelectorHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: typography.body,
  },
  prepBriefActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
  },
  prepBriefPrimaryButton: {
    flex: 1,
    paddingHorizontal: 12,
  },
  prepBriefSecondaryButton: {
    flex: 1,
    paddingHorizontal: 12,
  },
  prepBriefShareButton: {
    marginTop: 8,
    paddingHorizontal: 12,
  },
  prepBriefErrorText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.danger,
    fontFamily: typography.heading,
  },
  prepBriefContent: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#cde4d5',
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 8,
  },
  prepBriefLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#23613b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: typography.heading,
  },
  prepBriefBodyText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  prepBriefListItem: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 21,
    fontFamily: typography.body,
  },
  actionDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    marginTop: 7,
    marginRight: 10,
  },
  keyPointDot: {
    backgroundColor: colors.success,
  },
  actionContent: {
    flex: 1,
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
    fontFamily: typography.body,
  },
  inlineHighlightSaveChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accentInfoBorder,
    borderRadius: radii.pill,
    backgroundColor: colors.accentInfoSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inlineHighlightSaveChipText: {
    fontSize: 11,
    color: colors.accentInfoText,
    fontFamily: typography.heading,
  },
  actionMetadata: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  metadataText: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontFamily: typography.body,
  },
  priorityHigh: {
    backgroundColor: '#fee2e2',
    color: '#991b1b',
  },
  priorityMedium: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
  },
  priorityLow: {
    backgroundColor: '#dcfce7',
    color: '#166534',
  },
  doneButton: {
    marginHorizontal: spacing.md,
    marginTop: 18,
    padding: spacing.md,
  },
  doneButtonText: {
    color: colors.textOnDark,
    fontSize: 16,
    fontFamily: typography.heading,
  },
  exportPresetCard: {
    marginHorizontal: spacing.md,
    marginTop: 12,
    padding: 12,
    borderColor: '#d2dff2',
    backgroundColor: '#fbfdff',
  },
  exportPresetTitle: {
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
    fontFamily: typography.heading,
  },
  exportPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exportPresetChip: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  exportPresetChipActive: {
    backgroundColor: colors.surfaceDark,
    borderColor: colors.surfaceDark,
  },
  exportPresetChipText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontFamily: typography.heading,
  },
  exportPresetChipTextActive: {
    color: colors.textOnDark,
  },
  exportPresetHint: {
    marginTop: 8,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    fontFamily: typography.body,
  },
  secondaryActions: {
    flexDirection: 'row',
    marginTop: 10,
    marginHorizontal: spacing.md,
    gap: 10,
  },
  exportButton: {
    flex: 1,
    padding: 14,
  },
  exportButtonText: {
    color: colors.accentInfoText,
    fontSize: 14,
    fontFamily: typography.heading,
  },
  clipboardButton: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  clipboardButtonText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontFamily: typography.heading,
  },
  deleteButton: {
    marginHorizontal: spacing.md,
    marginTop: 12,
    marginBottom: 10,
    padding: 14,
  },
  deleteButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontFamily: typography.heading,
  },
});
