import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const CHUNK_DURATION_MINUTES = 20; // Process 20-minute chunks to stay well under 30-min timeout
const MAX_RETRIES = 3;

interface TranscriptionResult {
  text: string;
  durationSeconds: number;
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(audioBuffer: Buffer): Promise<number> {
  const tempDir = path.join(os.tmpdir(), 'recaply_audio');
  await mkdir(tempDir, { recursive: true });
  
  const tempFile = path.join(tempDir, `probe_${Date.now()}.m4a`);
  
  try {
    await writeFile(tempFile, audioBuffer);
    
    const duration = await new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(tempFile, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
    
    // Clean up after getting duration
    try {
      if (fs.existsSync(tempFile)) await unlink(tempFile);
    } catch (e) {
      console.error('Error cleaning up probe file:', e);
    }
    
    return duration;
  } catch (error) {
    // Clean up on error too
    try {
      if (fs.existsSync(tempFile)) await unlink(tempFile);
    } catch (e) {
      console.error('Error cleaning up probe file after error:', e);
    }
    throw error;
  }
}

/**
 * Split audio buffer into chunks of specified duration
 */
async function splitAudioIntoChunks(
  audioBuffer: Buffer,
  chunkDurationSeconds: number
): Promise<Buffer[]> {
  const tempDir = path.join(os.tmpdir(), 'recaply_audio');
  await mkdir(tempDir, { recursive: true });
  
  const timestamp = Date.now();
  const inputFile = path.join(tempDir, `input_${timestamp}.m4a`);
  const outputPattern = path.join(tempDir, `chunk_${timestamp}_%03d.m4a`);
  
  try {
    // Write input file
    await writeFile(inputFile, audioBuffer);
    
    // Split using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputFile)
        .outputOptions([
          '-f', 'segment',
          '-segment_time', String(chunkDurationSeconds),
          '-c', 'copy', // Copy codec, don't re-encode
          '-reset_timestamps', '1'
        ])
        .output(outputPattern)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run();
    });
    
    // Read all chunk files
    const chunks: Buffer[] = [];
    let chunkIndex = 0;
    
    while (true) {
      const chunkFile = path.join(tempDir, `chunk_${timestamp}_${String(chunkIndex).padStart(3, '0')}.m4a`);
      if (!fs.existsSync(chunkFile)) break;
      
      chunks.push(fs.readFileSync(chunkFile));
      await unlink(chunkFile);
      chunkIndex++;
    }
    
    // Clean up input file
    await unlink(inputFile);
    
    return chunks;
  } catch (error) {
    console.error('Error splitting audio:', error);
    throw new Error('Failed to split audio into chunks');
  }
}

/**
 * Transcribe a single audio chunk with retry logic
 */
async function transcribeChunk(
  audioBuffer: Buffer,
  chunkIndex: number,
  retries: number = MAX_RETRIES
): Promise<{ text: string; durationSeconds: number }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const formData = new FormData();
      const audioStream = Readable.from(audioBuffer);
      
      formData.append('file', audioStream, {
        filename: `chunk_${chunkIndex}.m4a`,
        contentType: 'audio/mpeg',
      });
      formData.append('model', 'whisper-1');
      formData.append('language', 'en');
      formData.append('response_format', 'verbose_json');

      const response = await axios.post(
        'https://api.openai.com/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          timeout: 1800000, // 30 minutes
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      return {
        text: response.data.text,
        durationSeconds: response.data.duration || 0
      };
    } catch (error: any) {
      console.error(`Transcription attempt ${attempt + 1} failed for chunk ${chunkIndex}:`, error.message);
      
      if (attempt === retries) {
        throw new Error(`Failed to transcribe chunk ${chunkIndex} after ${retries + 1} attempts`);
      }
      
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error('Unexpected error in transcribeChunk');
}

/**
 * Transcribe audio with automatic chunking for long files
 * Handles files of any length by splitting into processable chunks
 */
export async function transcribeAudioWithChunking(
  audioBuffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  try {
    // Get audio duration
    const durationSeconds = await getAudioDuration(audioBuffer);
    const durationMinutes = durationSeconds / 60;
    
    console.log(`Audio duration: ${durationMinutes.toFixed(2)} minutes`);
    
    // If under threshold, transcribe normally
    if (durationMinutes <= CHUNK_DURATION_MINUTES) {
      console.log('Audio under chunk threshold, transcribing normally...');
      return await transcribeChunk(audioBuffer, 0);
    }
    
    // Split into chunks
    console.log(`Audio over ${CHUNK_DURATION_MINUTES} minutes, splitting into chunks...`);
    const chunkDurationSeconds = CHUNK_DURATION_MINUTES * 60;
    const chunks = await splitAudioIntoChunks(audioBuffer, chunkDurationSeconds);
    
    console.log(`Split into ${chunks.length} chunks`);
    
    // Transcribe all chunks in parallel (with concurrency limit)
    const CONCURRENCY_LIMIT = 3; // Process 3 chunks at a time
    const results: { text: string; durationSeconds: number }[] = [];
    
    for (let i = 0; i < chunks.length; i += CONCURRENCY_LIMIT) {
      const batch = chunks.slice(i, i + CONCURRENCY_LIMIT);
      const batchPromises = batch.map((chunk, batchIndex) => 
        transcribeChunk(chunk, i + batchIndex)
      );
      
      console.log(`Processing batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1}/${Math.ceil(chunks.length / CONCURRENCY_LIMIT)}...`);
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    // Combine all transcriptions
    const combinedText = results.map(r => r.text).join(' ');
    const totalDuration = results.reduce((sum, r) => sum + r.durationSeconds, 0);
    
    console.log(`Transcription complete. Total duration: ${totalDuration} seconds`);
    
    return {
      text: combinedText,
      durationSeconds: totalDuration
    };
  } catch (error: any) {
    console.error('Chunked transcription error:', error.message);
    throw new Error(`Failed to transcribe audio: ${error.message}`);
  }
}

/**
 * Backward-compatible wrapper that uses chunking automatically
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  return transcribeAudioWithChunking(audioBuffer, filename);
}
