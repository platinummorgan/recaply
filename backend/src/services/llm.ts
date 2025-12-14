import axios from 'axios';

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

const SUMMARY_PROMPT = `You are an expert meeting assistant specialized in analyzing meeting transcripts.

Analyze the transcript and generate a structured JSON response with:
- summary: A concise 2-3 paragraph overview
- keyPoints: Array of 3-7 most important points (strings)
- decisions: Array of key decisions made (strings)
- actionItems: Array of objects with: task, assignee, priority ("high"/"medium"/"low"), deadline
- participants: Array of participant names (if mentioned)
- sentiment: "positive", "neutral", or "negative"

Be concise and actionable. Return ONLY valid JSON.`;

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
    console.error('Summary error:', error.response?.data || error.message);
    throw new Error('Failed to generate summary');
  }
}
