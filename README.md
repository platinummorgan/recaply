# Recaply - Meeting Note AI Assistant

A mobile app for recording meetings, transcribing audio, and generating AI-powered summaries with action items.

## Features

- **One-tap Recording**: Quick start meeting recording before/after meetings
- **Transcription**: AI-powered speech-to-text using Whisper/ASR
- **Smart Summaries**: LLM-generated summaries with bullets, decisions, and tasks
- **Offline Support**: Cache recordings locally, sync when online
- **Easy Sharing**: Export to Gmail, Google Drive, and Notion
- **Monetization**: Metered credits for minutes + subscription plans ($9-$19/mo)

## Tech Stack

- **Framework**: React Native
- **Platform**: Android
- **Audio**: react-native-audio-recorder-player
- **Storage**: AsyncStorage + react-native-fs
- **Navigation**: React Navigation
- **AI Services**: 
  - Whisper/ASR for transcription
  - LLM API for summarization

## Project Structure

```
recaply/
├── src/
│   ├── screens/           # App screens
│   │   ├── RecorderScreen.tsx
│   │   ├── TranscriptScreen.tsx
│   │   ├── SummaryScreen.tsx
│   │   └── ExportScreen.tsx
│   ├── services/          # Business logic
│   │   ├── AudioService.ts
│   │   ├── TranscriptionService.ts
│   │   ├── SummaryService.ts
│   │   └── ShareService.ts
│   ├── types/             # TypeScript types
│   │   └── index.ts
│   └── navigation/        # Navigation setup
│       └── AppNavigator.tsx
├── android/               # Android native code
├── App.tsx               # Root component
└── package.json
```

## Setup Instructions

### Prerequisites

- Node.js (v18+)
- React Native CLI
- Android Studio
- Java JDK 17+

### Installation

1. **Clone and install dependencies**:
```bash
cd d:\Dev\recaply
npm install
```

2. **Set up environment variables**:
Create `.env` file with your API keys:
```
# Whisper API for transcription
WHISPER_API_KEY=your_whisper_key
WHISPER_API_URL=https://api.openai.com/v1/audio/transcriptions

# LLM API for summarization
LLM_API_KEY=your_llm_key
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=gpt-4
```

**Or configure in-app**: Go to Settings → LLM Configuration (recommended)

See [LLM Setup Guide](docs/LLM_SETUP.md) for detailed configuration instructions.

3. **Android Setup**:
```bash
# Link native modules
npx react-native link

# For audio permissions, ensure android/app/src/main/AndroidManifest.xml has:
# <uses-permission android:name="android.permission.RECORD_AUDIO" />
# <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
# <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
```

4. **Run on Android**:
```bash
npm run android
```

## Development

### Running the app
```bash
# Start Metro bundler
npm start

# Run on Android device/emulator
npm run android
```

### Building for production
```bash
cd android
./gradlew assembleRelease
```

## App Flow

1. **Record/Upload**: User taps to start recording or uploads audio file
2. **Transcribe**: Audio sent to Whisper/ASR for speech-to-text
3. **Summary/Actions**: LLM generates summary with bullets, decisions, and tasks
4. **Share**: Export to Gmail, Google Drive, or Notion

## Screens

### 1. RecorderScreen
- Start/stop recording button
- Audio waveform visualization
- Duration timer
- Upload existing audio file option
- Settings button in header

### 2. TranscriptScreen
- Full text transcript
- Speaker detection (future)
- Edit capability
- Timestamp markers

### 3. SummaryScreen
- AI-generated summary
- Key decisions
- Action items with assignees
- Tags and keywords

### 4. ExportScreen
- Share to email (Gmail)
- Save to Google Drive
- Send to Notion
- Copy to clipboard
- Download as PDF/TXT

### 5. SettingsScreen
- Recording quality settings
- Auto-upload toggle
- Notification preferences
- Storage management
- Clear cache
- Account deletion
- Access to Privacy Policy, Terms, and Data Usage

### 6. Privacy, Terms & Data Usage
- Complete privacy policy (in-app, no external links)
- Terms of service with recording consent laws
- Data usage and retention policies
- All legal information accessible within the app

## Monetization Model

- **Free Tier**: 30 minutes/month
- **Metered Credits**: $0.10 per minute
- **Lite Plan**: $9/mo - 300 minutes
- **Pro Plan**: $19/mo - Unlimited minutes

## Native Capabilities

- **Microphone Access**: Record high-quality audio
- **Offline Cache**: Store recordings locally
- **Background Recording**: Continue recording when app is backgrounded
- **Share Intent**: Native sharing to other apps
- **Push Notifications**: Remind users of pending transcriptions

## AI Services

### LLM Integration
Recaply supports multiple LLM providers for generating summaries:

- **OpenAI** (GPT-4, GPT-3.5-turbo) - Best quality
- **Anthropic** (Claude 3) - Long context, nuanced understanding  
- **Groq** - Ultra-fast, cost-effective
- **Local LLM** (Ollama, LM Studio) - Privacy-focused, offline

Configure your preferred LLM provider in-app: **Settings → LLM Configuration**

For detailed setup instructions, see [LLM Setup Guide](docs/LLM_SETUP.md)

### Transcription API
```typescript
POST /api/transcribe
Body: { audioFile: File }
Response: { text: string, segments: Array }
```

### Summary API
```typescript
POST /api/summarize
Body: { text: string }
Response: { 
  summary: string,
  decisions: string[],
  actionItems: Array<{ task: string, assignee?: string }>
}
```

## Future Enhancements

- Multi-language support
- Real-time transcription
- Meeting calendar integration
- Team collaboration features
- Voice commands
- Smart reminders for action items

## License

Proprietary - All rights reserved

## Support

For issues or questions, contact: support@recaply.app
