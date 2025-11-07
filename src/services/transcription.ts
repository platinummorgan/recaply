import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

/**
 * Transcribe audio using OpenAI Whisper API
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<string> {
  try {
    const formData = new FormData();
    const audioStream = Readable.from(audioBuffer);
    
    formData.append('file', audioStream, {
      filename: filename,
      contentType: 'audio/mpeg',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

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

    return response.data.text;
  } catch (error: any) {
    console.error('Transcription error:', error.response?.data || error.message);
    throw new Error('Failed to transcribe audio');
  }
}

/**
 * Estimate audio duration in minutes from file size
 * Rough estimate: 1MB ≈ 8 minutes for compressed audio
 */
export function estimateAudioMinutes(fileSizeBytes: number): number {
  const fileSizeMB = fileSizeBytes / (1024 * 1024);
  return Math.ceil(fileSizeMB * 8);
}
