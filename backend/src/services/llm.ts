import axios from 'axios';
import { logger, serializeError } from './logger';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

export interface MeetingSummary {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  participants?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface ActionItem {
  task: string;
  assignee?: string;
  priority?: 'high' | 'medium' | 'low';
  deadline?: string;
}

export interface AskMeetingInput {
  id: string;
  meetingName: string;
  meetingAt?: string;
  transcript: string;
}

export interface AskCitation {
  recordingId: string;
  reason: string;
}

export interface AskAnswer {
  answer: string;
  citations: AskCitation[];
  followUpQuestions: string[];
}

export interface MeetingBreakdownInput {
  summary?: string;
  keyPoints?: string[];
  decisions?: string[];
  actionItems?: Array<ActionItem | string>;
  participants?: string[];
  sentiment?: 'positive' | 'neutral' | 'negative';
}

export interface FollowUpDraftInput {
  meetingName?: string;
  meetingAt?: string;
  meetingLocation?: string;
  meetingContext?: string;
  meetingType?: string;
  templateStyle?: string;
  participants?: string[];
  summary?: MeetingBreakdownInput | null;
  transcript?: string | null;
  tone?: 'formal' | 'friendly' | 'neutral';
}

export interface FollowUpDraftResult {
  subject: string;
  emailBody: string;
  slackMessage: string;
  actionChecklist: string[];
  tone: 'formal' | 'friendly' | 'neutral';
}

export interface MeetingPrepBriefInput {
  meetingName?: string;
  meetingAt?: string;
  meetingLocation?: string;
  meetingContext?: string;
  meetingType?: string;
  participants?: string[];
  summary?: MeetingBreakdownInput | null;
  transcript?: string | null;
  prepGoal?: string;
  prepTone?: 'balanced' | 'challenger' | 'supportive';
}

export interface MeetingPrepBriefResult {
  briefSummary: string;
  strategicFocus: string[];
  likelyRisks: string[];
  preCallQuestions: string[];
  openingScript: string;
  prepTone: 'balanced' | 'challenger' | 'supportive';
}

const SUMMARY_PROMPT = `You are an expert meeting assistant specialized in analyzing meeting transcripts.

Analyze the transcript and generate a structured JSON response with:
- summary: A concise 2-3 paragraph overview
- keyPoints: Array of 3-7 most important points (strings)
- decisions: Array of key decisions made (strings)
- actionItems: Array of objects with: task, assignee, priority ("high"/"medium"/"low"), deadline
- participants: Array of participant names (if mentioned)
- sentiment: "positive", "neutral", or "negative"

Be concise and actionable. Return ONLY valid JSON.`;

const ASK_PROMPT = `You are Recaply's cross-meeting memory assistant.

You must only use the provided meeting transcripts.
If the user asks for information not present in the provided meetings, clearly say so.
Do not invent facts, dates, names, or decisions.

Return ONLY valid JSON with:
- answer: concise, directly answering the question
- citations: array of objects with { recordingId, reason } referencing supporting meetings
- followUpQuestions: array of up to 3 suggested next questions

Keep citations focused (max 4).`;

const TRANSLATE_BREAKDOWN_PROMPT = `You are Recaply's translation assistant.

Translate meeting breakdown content into the user's target language.
You must preserve structure and meaning while translating user-facing text.
Keep names, product names, dates, and numeric values intact.

Return ONLY valid JSON with:
- summary: translated paragraph text
- keyPoints: translated array of strings
- decisions: translated array of strings
- actionItems: translated array of objects with { task, assignee, priority, deadline }
- participants: translated array of strings
- sentiment: one of "positive", "neutral", or "negative"

Do not add commentary.`;

const TRANSLATE_TRANSCRIPT_PROMPT = `You are Recaply's translation assistant.

Translate the provided transcript content to the requested target language.
Keep formatting, paragraph breaks, bullet structure, timestamps, speaker labels, names, and numbers intact.
Return only the translated transcript text with no extra commentary.`;

const FOLLOWUP_DRAFT_PROMPT = `You are Recaply's follow-up drafting assistant.

Use only provided meeting context. Do not invent facts, owners, dates, or commitments.
Honor meetingType/templateStyle when provided to shape structure and emphasis.

Return ONLY valid JSON with:
- subject: concise follow-up email subject line (max 90 chars)
- emailBody: polished follow-up email body with:
  - brief recap
  - decisions
  - action items with owners/deadlines when available
  - clear next-step ask
- slackMessage: concise team update suitable for Slack
- actionChecklist: array of short checklist lines (max 8)
- tone: one of "formal", "friendly", or "neutral"

If information is missing, note it clearly (for example "Owner not specified").`;

const PREP_BRIEF_PROMPT = `You are Recaply's meeting prep strategist.

Generate a prep brief and pre-call question kit using only provided meeting context.
Do not invent facts, owners, dates, risks, or commitments.
If information is missing, clearly say so.

Return ONLY valid JSON with:
- briefSummary: concise prep-oriented summary (max 220 words)
- strategicFocus: array of 3-6 focus bullets for the next call
- likelyRisks: array of 2-5 risks/unknowns to validate
- preCallQuestions: array of 5-10 sharp questions to ask
- openingScript: short opening script (4-8 sentences) for the call
- prepTone: one of "balanced", "challenger", or "supportive"

Keep outputs practical, specific, and actionable.`;

function normalizeStringList(value: unknown, maxItems = 20, maxLength = 400): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((entry) => entry.slice(0, maxLength));
}

function normalizeActionItems(value: unknown): ActionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === 'string') {
        const task = item.trim().slice(0, 300);
        if (!task) {
          return null;
        }
        return { task } as ActionItem;
      }

      if (!item || typeof item !== 'object') {
        return null;
      }

      const task = String((item as any).task || '').trim().slice(0, 300);
      if (!task) {
        return null;
      }

      const assignee = String((item as any).assignee || '').trim().slice(0, 120);
      const deadline = String((item as any).deadline || '').trim().slice(0, 120);
      const priorityValue = String((item as any).priority || '').trim().toLowerCase();
      const priority = priorityValue === 'high' || priorityValue === 'medium' || priorityValue === 'low'
        ? priorityValue
        : undefined;

      return {
        task,
        assignee: assignee || undefined,
        deadline: deadline || undefined,
        priority,
      } as ActionItem;
    })
    .filter((entry): entry is ActionItem => Boolean(entry))
    .slice(0, 20);
}

function normalizeMeetingBreakdownInput(input: MeetingBreakdownInput): MeetingSummary {
  const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 8000) : '';
  const keyPoints = normalizeStringList(input.keyPoints, 20, 400);
  const decisions = normalizeStringList(input.decisions, 20, 400);
  const actionItems = normalizeActionItems(input.actionItems);
  const participants = normalizeStringList(input.participants, 30, 120);
  const sentiment = input.sentiment === 'positive' || input.sentiment === 'negative' || input.sentiment === 'neutral'
    ? input.sentiment
    : 'neutral';

  return {
    summary,
    keyPoints,
    decisions,
    actionItems,
    participants,
    sentiment,
  };
}

function normalizeFollowUpTone(value: unknown): 'formal' | 'friendly' | 'neutral' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'formal' || normalized === 'friendly' || normalized === 'neutral') {
    return normalized;
  }
  return 'neutral';
}

function normalizePrepTone(value: unknown): 'balanced' | 'challenger' | 'supportive' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'balanced' || normalized === 'challenger' || normalized === 'supportive') {
    return normalized;
  }
  return 'balanced';
}

function normalizeFollowUpDraftResult(
  value: unknown,
  fallbackTone: 'formal' | 'friendly' | 'neutral',
): FollowUpDraftResult {
  const parsed = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const subject = String(parsed.subject || '').trim().slice(0, 90) || 'Meeting follow-up';
  const emailBody = String(parsed.emailBody || '').trim().slice(0, 6000)
    || 'Thanks everyone for the meeting. Please review key decisions and action items.';
  const slackMessage = String(parsed.slackMessage || '').trim().slice(0, 2000)
    || 'Meeting recap is ready. Please review key decisions and action items.';
  const actionChecklist = normalizeStringList(parsed.actionChecklist, 8, 240);
  const tone = normalizeFollowUpTone(parsed.tone || fallbackTone);

  return {
    subject,
    emailBody,
    slackMessage,
    actionChecklist,
    tone,
  };
}

function normalizeMeetingPrepBriefResult(
  value: unknown,
  fallbackTone: 'balanced' | 'challenger' | 'supportive',
): MeetingPrepBriefResult {
  const parsed = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const briefSummary = String(parsed.briefSummary || '').trim().slice(0, 3000)
    || 'No prep summary available from the provided meeting context.';
  const strategicFocus = normalizeStringList(parsed.strategicFocus, 8, 260);
  const likelyRisks = normalizeStringList(parsed.likelyRisks, 8, 260);
  const preCallQuestions = normalizeStringList(parsed.preCallQuestions, 12, 260);
  const openingScript = String(parsed.openingScript || '').trim().slice(0, 2200)
    || 'Thanks for joining. Let us quickly align on priorities and open risks before we begin.';
  const prepTone = normalizePrepTone(parsed.prepTone || fallbackTone);

  return {
    briefSummary,
    strategicFocus,
    likelyRisks,
    preCallQuestions,
    openingScript,
    prepTone,
  };
}

function splitTranscriptIntoChunks(transcript: string, maxChunkLength = 4000): string[] {
  const normalized = transcript.trim();
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChunkLength) {
    return [normalized];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < normalized.length) {
    const targetEnd = Math.min(cursor + maxChunkLength, normalized.length);
    if (targetEnd === normalized.length) {
      chunks.push(normalized.slice(cursor));
      break;
    }

    const minBreak = cursor + Math.floor(maxChunkLength * 0.6);
    const paragraphBreak = normalized.lastIndexOf('\n\n', targetEnd);
    const sentenceBreak = normalized.lastIndexOf('. ', targetEnd);
    const lineBreak = normalized.lastIndexOf('\n', targetEnd);
    const bestBreak = [paragraphBreak, sentenceBreak, lineBreak]
      .filter((value) => value >= minBreak)
      .sort((a, b) => b - a)[0];

    const nextCursor = bestBreak && bestBreak > cursor ? bestBreak + 1 : targetEnd;
    chunks.push(normalized.slice(cursor, nextCursor));
    cursor = nextCursor;
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

/**
 * Generate meeting summary using GPT-4
 */
export async function generateSummary(transcript: string): Promise<MeetingSummary> {
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: SUMMARY_PROMPT,
          },
          {
            role: 'user',
            content: `Analyze this meeting transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    const content = response.data.choices[0].message.content;
    const summary = JSON.parse(content);

    return {
      summary: summary.summary || 'No summary available',
      keyPoints: summary.keyPoints || [],
      decisions: summary.decisions || [],
      actionItems: summary.actionItems || [],
      participants: summary.participants || [],
      sentiment: summary.sentiment || 'neutral',
    };
  } catch (error: any) {
    logger.error('summary_generation_failed', {
      transcriptLength: transcript.length,
      providerResponse: error?.response?.data,
      ...serializeError(error),
    });
    throw new Error('Failed to generate summary');
  }
}

/**
 * Answer a question across multiple meetings with citations.
 */
export async function generateCrossMeetingAnswer(
  question: string,
  meetings: AskMeetingInput[],
): Promise<AskAnswer> {
  try {
    const meetingsPayload = meetings.map((meeting) => ({
      recordingId: meeting.id,
      meetingName: meeting.meetingName,
      meetingAt: meeting.meetingAt || null,
      transcript: meeting.transcript,
    }));

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: ASK_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              question,
              meetings: meetingsPayload,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    const citations = Array.isArray(parsed.citations)
      ? parsed.citations
        .map((citation: any) => ({
          recordingId: String(citation?.recordingId || '').trim(),
          reason: String(citation?.reason || '').trim(),
        }))
        .filter((citation: AskCitation) => citation.recordingId.length > 0)
      : [];

    const followUpQuestions = Array.isArray(parsed.followUpQuestions)
      ? parsed.followUpQuestions.map((item: any) => String(item || '').trim()).filter(Boolean).slice(0, 3)
      : [];

    const answer = String(parsed.answer || '').trim() || 'I could not find enough information in your meeting history to answer that confidently.';

    return {
      answer,
      citations: citations.slice(0, 4),
      followUpQuestions,
    };
  } catch (error: any) {
    logger.error('cross_meeting_answer_generation_failed', {
      questionLength: question.length,
      meetingCount: meetings.length,
      providerResponse: error?.response?.data,
      ...serializeError(error),
    });
    throw new Error('Failed to answer question across meetings');
  }
}

/**
 * Translate meeting breakdown content into a target language.
 */
export async function translateMeetingBreakdown(
  input: MeetingBreakdownInput,
  targetLanguage: string,
): Promise<MeetingSummary> {
  try {
    const normalizedLanguage = String(targetLanguage || '').trim().slice(0, 60);
    const breakdown = normalizeMeetingBreakdownInput(input);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: TRANSLATE_BREAKDOWN_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              targetLanguage: normalizedLanguage,
              breakdown,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : breakdown.summary || 'No summary available',
      keyPoints: normalizeStringList(parsed.keyPoints, 20, 400),
      decisions: normalizeStringList(parsed.decisions, 20, 400),
      actionItems: normalizeActionItems(parsed.actionItems),
      participants: normalizeStringList(parsed.participants, 30, 120),
      sentiment: parsed.sentiment === 'positive' || parsed.sentiment === 'negative' || parsed.sentiment === 'neutral'
        ? parsed.sentiment
        : breakdown.sentiment || 'neutral',
    };
  } catch (error: any) {
    logger.error('summary_translation_failed', {
      targetLanguage: String(targetLanguage || ''),
      providerResponse: error?.response?.data,
      ...serializeError(error),
    });
    throw new Error('Failed to translate meeting breakdown');
  }
}

/**
 * Translate full transcript text into a target language.
 */
export async function translateTranscriptText(
  transcript: string,
  targetLanguage: string,
): Promise<string> {
  try {
    const normalizedLanguage = String(targetLanguage || '').trim().slice(0, 60);
    const normalizedTranscript = String(transcript || '').trim();
    if (!normalizedTranscript) {
      return '';
    }

    const chunks = splitTranscriptIntoChunks(normalizedTranscript, 4000);
    const translatedChunks: string[] = [];

    for (const chunk of chunks) {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: TRANSLATE_TRANSCRIPT_PROMPT,
            },
            {
              role: 'user',
              content: JSON.stringify({
                targetLanguage: normalizedLanguage,
                transcriptChunk: chunk,
              }),
            },
          ],
          temperature: 0.1,
          max_tokens: 2500,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        },
      );

      const translatedChunk = String(response.data.choices?.[0]?.message?.content || '').trim();
      if (translatedChunk.length > 0) {
        translatedChunks.push(translatedChunk);
      }
    }

    return translatedChunks.join('\n\n').trim();
  } catch (error: any) {
    logger.error('transcript_translation_failed', {
      targetLanguage: String(targetLanguage || ''),
      transcriptLength: String(transcript || '').length,
      providerResponse: error?.response?.data,
      ...serializeError(error),
    });
    throw new Error('Failed to translate transcript');
  }
}

/**
 * Generate follow-up draft artifacts (email + Slack + checklist) from meeting context.
 */
export async function generateFollowUpDraft(input: FollowUpDraftInput): Promise<FollowUpDraftResult> {
  const tone = normalizeFollowUpTone(input.tone);
  const meetingName = String(input.meetingName || '').trim().slice(0, 120);
  const meetingAt = String(input.meetingAt || '').trim().slice(0, 80);
  const meetingLocation = String(input.meetingLocation || '').trim().slice(0, 160);
  const meetingContext = String(input.meetingContext || '').trim().slice(0, 2000);
  const meetingType = String(input.meetingType || '').trim().slice(0, 60);
  const templateStyle = String(input.templateStyle || '').trim().slice(0, 60);
  const participants = normalizeStringList(input.participants, 30, 120);
  const transcript = String(input.transcript || '').trim().slice(0, 12000);
  const summary = input.summary ? normalizeMeetingBreakdownInput(input.summary) : null;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: FOLLOWUP_DRAFT_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              meetingName: meetingName || null,
              meetingAt: meetingAt || null,
              meetingLocation: meetingLocation || null,
              meetingContext: meetingContext || null,
              meetingType: meetingType || null,
              templateStyle: templateStyle || null,
              participants,
              tone,
              summary,
              transcript,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return normalizeFollowUpDraftResult(parsed, tone);
  } catch (error: any) {
    logger.error('followup_draft_generation_failed', {
      tone,
      meetingType,
      templateStyle,
      hasSummary: Boolean(summary),
      transcriptLength: transcript.length,
      providerResponse: error?.response?.data,
      ...serializeError(error),
    });
    throw new Error('Failed to generate follow-up draft');
  }
}

/**
 * Generate AI meeting prep brief and pre-call question kit.
 */
export async function generateMeetingPrepBrief(input: MeetingPrepBriefInput): Promise<MeetingPrepBriefResult> {
  const prepTone = normalizePrepTone(input.prepTone);
  const meetingName = String(input.meetingName || '').trim().slice(0, 120);
  const meetingAt = String(input.meetingAt || '').trim().slice(0, 80);
  const meetingLocation = String(input.meetingLocation || '').trim().slice(0, 160);
  const meetingContext = String(input.meetingContext || '').trim().slice(0, 2000);
  const meetingType = String(input.meetingType || '').trim().slice(0, 60);
  const participants = normalizeStringList(input.participants, 30, 120);
  const prepGoal = String(input.prepGoal || '').trim().slice(0, 400);
  const transcript = String(input.transcript || '').trim().slice(0, 12000);
  const summary = input.summary ? normalizeMeetingBreakdownInput(input.summary) : null;

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: PREP_BRIEF_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              meetingName: meetingName || null,
              meetingAt: meetingAt || null,
              meetingLocation: meetingLocation || null,
              meetingContext: meetingContext || null,
              meetingType: meetingType || null,
              participants,
              prepGoal: prepGoal || null,
              prepTone,
              summary,
              transcript,
            }),
          },
        ],
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      },
    );

    const content = response.data.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return normalizeMeetingPrepBriefResult(parsed, prepTone);
  } catch (error: any) {
    logger.error('meeting_prep_brief_generation_failed', {
      prepTone,
      meetingType,
      prepGoalLength: prepGoal.length,
      hasSummary: Boolean(summary),
      transcriptLength: transcript.length,
      providerResponse: error?.response?.data,
      ...serializeError(error),
    });
    throw new Error('Failed to generate meeting prep brief');
  }
}
