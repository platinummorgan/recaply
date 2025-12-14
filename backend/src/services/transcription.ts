import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

/**
 * Transcribe audio using OpenAI Whisper API
 * Returns both text and actual duration in seconds
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<{ text: string; durationSeconds: number }> {
  try {
    const formData = new FormData();
    const audioStream = Readable.from(audioBuffer);
    
    formData.append('file', audioStream, {
      filename: filename,
      contentType: 'audio/mpeg',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');
    formData.append('response_format', 'verbose_json'); // Get duration info

    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        timeout: 300000, // 5 minute timeout for long meetings
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    return {
      text: response.data.text,
      durationSeconds: response.data.duration || 0
    };
  } catch (error: any) {
    console.error('Transcription error:', error.response?.data || error.message);
    throw new Error('Failed to transcribe audio');
  }
}

