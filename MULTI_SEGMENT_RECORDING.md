# Multi-Segment Audio Recording - Server-Side Combining

## ✅ Implementation Complete

Full server-side audio segment combining has been implemented. When you pause/resume recording multiple times, all segments will now be combined into one audio file and transcribed as a single recording.

## How It Works

### Frontend (RecordScreen.tsx)
1. User records → pauses → resumes → pauses → resumes → stops
2. Each pause/resume creates a new segment (saved as separate URIs)
3. On stop: All segment URIs collected into an array
4. Frontend detects multiple segments and calls `/api/audio/upload-segments` instead of `/api/audio/upload`
5. All segments uploaded to backend in one request

### Backend (New Endpoint)
**POST `/api/audio/upload-segments`**
- Accepts `segments` field (array of audio files)
- Uses FFmpeg to combine all segments into one M4A file
- Transcribes the combined audio (Whisper gets full meeting, not just first segment)
- Uploads combined file to Supabase Storage
- Saves to database as single recording
- Deducts minutes based on total duration

### Audio Combining (audioProcessor.ts)
**`combineAudioSegments()` function:**
```typescript
- Writes all segments to temp files
- Creates FFmpeg concat file
- Uses `ffmpeg -f concat` to merge segments
- Returns combined audio buffer
- Cleans up temp files
```

## Files Modified

1. **backend/src/services/audioProcessor.ts** (NEW)
   - `combineAudioSegments()` function
   - FFmpeg integration
   - Temp file management

2. **backend/src/routes/audio.ts**
   - Added `POST /api/audio/upload-segments` endpoint
   - Imports `combineAudioSegments`
   - Handles array of segments

3. **backend/package.json**
   - Added `fluent-ffmpeg` dependency
   - Added `@types/fluent-ffmpeg`

4. **src/screens/RecordScreen.tsx**
   - Updated `stopRecording()` to collect all segments
   - Updated `handleRecordingStopped()` to accept array
   - Updated `uploadToBackend()` to handle both single URI and segment array
   - Auto-detects: 1 segment = single upload, 2+ segments = multi-segment upload

## Dependencies

### Backend Requirements
- **FFmpeg** must be installed on the system
  - Windows: Download from https://ffmpeg.org/download.html
  - Mac: `brew install ffmpeg`
  - Linux: `apt-get install ffmpeg`
  - ✅ Already installed on your system (version 8.0)

- **fluent-ffmpeg** npm package
  - ✅ Already installed via `npm install fluent-ffmpeg --legacy-peer-deps`

## Testing

1. **Single Segment (No Pause)**
   - Record → Stop
   - Uses `/api/audio/upload` (existing endpoint)
   - Works exactly as before

2. **Multiple Segments (With Pause/Resume)**
   - Record → Pause → Resume → Pause → Resume → Stop
   - Uses `/api/audio/upload-segments` (new endpoint)
   - Backend combines all 3 segments
   - Transcribes full combined audio
   - Returns single transcript

3. **What You Should See**
   - Backend logs: "Combining 3 audio segments for user..."
   - Backend logs: "Combined audio size: X bytes"
   - Frontend receives: Full transcript of ALL segments
   - Database shows: One recording with complete transcription

## Limitations Resolved

❌ **Before:** Only first segment transcribed (other segments lost)
✅ **Now:** All segments combined and transcribed together

## Network Flow

```
Frontend (3 segments)
  ↓
Upload all 3 via FormData
  ↓
Backend receives array
  ↓
FFmpeg combines → single M4A
  ↓
Whisper transcribes combined audio
  ↓
Upload to Supabase Storage
  ↓
Save to database
  ↓
Return full transcript to frontend
```

## Error Handling

- If FFmpeg fails: Returns 500 error with message
- Temp files always cleaned up (even on error)
- Falls back to single upload if only 1 segment
- Offline mode: Still saves first segment locally (limitation for offline queue)

## Performance

- 3 segments of ~30 seconds each = ~90 seconds total
- Combining time: ~1-2 seconds (FFmpeg is fast)
- Transcription time: Based on total duration (~90 seconds)
- Storage: Single combined file (not 3 separate files)

## Next Steps

To test:
1. Restart backend: `npm run dev` in backend folder
2. Record on device
3. Pause 2-3 times to create multiple segments
4. Stop recording
5. Check backend logs for "Combining X audio segments"
6. Verify transcript includes all segments

## Production Deployment

When deploying to production:
1. Ensure FFmpeg is installed on server
2. If using Docker: Add FFmpeg to Dockerfile
3. Consider temp file storage limits
4. Monitor disk space in temp directory

Example Dockerfile addition:
```dockerfile
RUN apt-get update && apt-get install -y ffmpeg
```
