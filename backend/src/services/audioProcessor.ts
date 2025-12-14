import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const mkdir = promisify(fs.mkdir);

// Set FFmpeg path (it should be in PATH, but we can be explicit if needed)
// ffmpeg.setFfmpegPath('ffmpeg'); // Uses ffmpeg from PATH

/**
 * Combine multiple audio segments into a single file
 * @param segments Array of audio buffers to combine
 * @param outputFormat Output format (default: 'm4a')
 * @returns Combined audio buffer
 */
export async function combineAudioSegments(
  segments: Buffer[],
  outputFormat: string = 'm4a'
): Promise<Buffer> {
  if (segments.length === 0) {
    throw new Error('No audio segments provided');
  }

  if (segments.length === 1) {
    return segments[0];
  }

  const tempDir = path.join(process.cwd(), 'temp_audio');
  
  // Create temp directory if it doesn't exist
  try {
    await mkdir(tempDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  const timestamp = Date.now();
  const inputFiles: string[] = [];
  const outputFile = path.join(tempDir, `combined_${timestamp}.${outputFormat}`);

  try {
    // Write all segments to temporary files
    for (let i = 0; i < segments.length; i++) {
      const inputFile = path.join(tempDir, `segment_${timestamp}_${i}.m4a`);
      await writeFile(inputFile, segments[i]);
      inputFiles.push(inputFile);
    }

    // Create concat file list for ffmpeg
    const concatListFile = path.join(tempDir, `concat_${timestamp}.txt`);
    const concatList = inputFiles.map(f => `file '${f}'`).join('\n');
    await writeFile(concatListFile, concatList);

    // Combine using ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListFile)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .audioCodec('copy')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(outputFile);
    });

    // Read combined file
    const combinedBuffer = fs.readFileSync(outputFile);

    // Clean up temporary files
    await unlink(concatListFile);
    for (const inputFile of inputFiles) {
      await unlink(inputFile);
    }
    await unlink(outputFile);

    return combinedBuffer;
  } catch (error) {
    // Clean up on error
    try {
      for (const inputFile of inputFiles) {
        if (fs.existsSync(inputFile)) await unlink(inputFile);
      }
      if (fs.existsSync(outputFile)) await unlink(outputFile);
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
    }
    throw error;
  }
}
