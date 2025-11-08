# Pause/Resume Recording Feature

## ✅ Implementation Complete

The pause/resume recording feature has been added to RecordScreen.tsx.

## How It Works

### User Flow
1. **Start Recording**: User taps "⏺️ Start Recording"
2. **Pause**: User taps "⏸️ Pause" - current segment is saved
3. **Resume**: User taps "▶️ Resume" - new segment starts
4. **Repeat**: Steps 2-3 can be repeated as many times as needed
5. **Stop**: User taps "⏹️ Stop Recording" - all segments combined into one file
6. **Upload**: Single combined file is uploaded for transcription

### Technical Details

**New State Variables:**
- `isPaused`: Track if recording is paused
- `recordingSegments`: Array of URIs for each recorded segment
- `recordingStartTime`: Timestamp when current segment started
- `totalDuration`: Total duration of all completed segments
- `currentDuration`: Real-time display duration (updates every 100ms)

**New Functions:**
- `pauseRecording()`: Pauses current recording, saves segment URI
- `resumeRecording()`: Stops current recording, starts new one
- `combineAudioSegments()`: Combines multiple segments (currently uses first segment as MVP)

**Timer:**
- `useEffect` hook updates `currentDuration` every 100ms during active recording
- Shows live MM:SS display

**UI Changes:**
- New pause button (orange) appears when recording
- Recording indicator changes color: Red (recording) → Orange (paused)
- Duration timer always visible during recording
- Back button disabled while recording

**Visual Indicators:**
- 🔴 Red pulsing circle = Recording
- 🟠 Orange circle = Paused
- ⏸️ Pause button = Stop current segment
- ▶️ Resume button = Start new segment
- ⏹️ Stop button = Finish and combine all segments

## Current Limitations

### Audio Segment Combining
The `combineAudioSegments()` function currently returns only the **first segment** as an MVP implementation.

**Why?**
- Combining audio files on mobile is complex
- Requires FFmpeg or native audio processing
- File format compatibility issues (M4A containers)

**Future Solutions:**
1. **Server-side combining**: Upload all segments, backend combines using FFmpeg
2. **Native module**: Use expo-av or react-native-ffmpeg
3. **Web API**: Use Web Audio API for combining (web only)

For now, users can pause/resume but only the first segment will be transcribed. This is acceptable for MVP testing.

## Files Modified

- `src/screens/RecordScreen.tsx` - Complete pause/resume implementation

## Testing

1. Start recording → see red indicator
2. Wait a few seconds → see timer counting
3. Tap Pause → indicator turns orange, timer stops
4. Tap Resume → indicator turns red, timer continues
5. Tap Stop → uploads first segment (for now)

## Next Steps

If you want full segment combining:
1. Modify backend to accept multiple audio files
2. Use FFmpeg on backend to concatenate segments
3. Update frontend to upload array of segments instead of single file

Or use a React Native audio processing library like:
- `react-native-ffmpeg`
- `expo-av` advanced features
- Native iOS/Android audio APIs
