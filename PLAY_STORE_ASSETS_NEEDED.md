# Play Store Assets Checklist

## Required Assets for Google Play Closed Testing

### 1. App Icons (REQUIRED)
Create these files and place them in `assets/` folder:

- **icon.png** - 1024x1024px
  - Square app icon
  - Will be displayed in app stores
  - Should have transparent or white background
  - Represents Recaply brand

- **adaptive-icon.png** - 1024x1024px  
  - Foreground layer for Android adaptive icons
  - Center 66% will always be visible (safe zone)
  - Outer 33% may be masked into different shapes
  - Background color: #10b981 (emerald green - already configured)

- **splash.png** - 1284x2778px
  - Loading screen shown when app starts
  - Background: #10b981 (emerald green)
  - Logo/text centered

### 2. Play Store Listing Graphics

- **Feature Graphic** - 1024x500px (REQUIRED)
  - Banner image shown at top of Play Store listing
  - JPG or 24-bit PNG (no alpha)
  - Should showcase app name and key feature

- **Screenshots** - At least 2 required, max 8
  - Minimum: 320px
  - Maximum: 3840px
  - Portrait or landscape (must be consistent)
  - JPEG or 24-bit PNG
  - Should show: Login, Recording screen, Transcription view, Playback

### 3. App Description Text

**Short Description** (80 characters max):
```
AI-powered voice notes: Record, transcribe, and summarize instantly
```

**Full Description** (4000 characters max):
```
🎤 Turn Your Voice into Organized Notes

Recaply uses cutting-edge AI to transform your voice recordings into searchable, organized text notes. Perfect for meetings, lectures, interviews, brainstorming sessions, and daily memos.

✨ KEY FEATURES

• One-Tap Recording
  Start recording instantly with our intuitive interface. Pause and resume anytime.

• AI Transcription
  Powered by OpenAI's Whisper - the most accurate speech-to-text available

• Smart Summaries  
  Get AI-generated summaries of your recordings with key points highlighted

• Audio Playback
  Listen to your recordings with a seek bar to jump to any moment

• Cloud Sync
  Access your recordings and transcriptions across all your devices

• Organized Library
  Browse all your recordings with dates and searchable transcriptions

📊 FLEXIBLE PLANS

Free Tier: 30 minutes/month
Lite Plan: 120 minutes/month - $4.99
Pro Plan: Unlimited - $14.99

🔒 PRIVACY & SECURITY

• End-to-end encryption
• Your data is never shared or sold
• Delete your recordings anytime
• GDPR and CCPA compliant

📱 PERFECT FOR

• Students recording lectures
• Professionals capturing meeting notes
• Journalists conducting interviews
• Content creators brainstorming ideas
• Anyone who prefers voice over typing

🚀 GET STARTED

1. Create your free account
2. Press record and start talking
3. Get instant transcription
4. Generate AI summaries
5. Search and organize your notes

Support: support@recaply.app
Privacy Policy: https://recaply.app/privacy
```

### 4. Store Listing Details

- **Category:** Productivity
- **Content Rating:** Everyone
- **Contact Email:** support@recaply.app (create this email!)
- **Privacy Policy URL:** https://recaply.app/privacy (need to host PRIVACY_POLICY.md)
- **App Website:** https://recaply.app (optional but recommended)

### 5. Content Rating Questionnaire

Google will ask questions like:
- Does your app contain violence? **NO**
- Does your app contain sexual content? **NO**  
- Does your app contain profanity? **NO**
- Does your app allow user-generated content? **YES** (users create recordings)
- Does your app use location services? **NO**
- Does your app contain ads? **NO**
- Does your app have in-app purchases? **YES** (subscriptions)

## Design Recommendations

### Color Scheme
- Primary: #10b981 (Emerald Green)
- Secondary: #059669 (Dark Emerald)
- Accent: #34d399 (Light Emerald)
- Text: #1f2937 (Dark Gray)

### Icon Ideas
- Microphone with waveform
- Voice recording with text lines
- Audio wave transforming into document
- Circular record button with transcript icon

### Tools for Creating Assets

**Free Tools:**
- Canva (web-based, has templates)
- Figma (professional design tool)
- GIMP (open-source Photoshop alternative)
- Inkscape (vector graphics)

**Quick Option:**
- Use Canva's "App Icon" template
- Search for "microphone" or "voice recording" graphics
- Use brand colors (#10b981)

## Next Steps After Assets Are Ready

1. Place icon files in `assets/` folder
2. Update `app.json` if needed (already configured)
3. Run `npx eas build --platform android --profile production`
4. Create Google Play Console account ($25 one-time fee)
5. Upload AAB file to closed testing
6. Add testers (email addresses)
7. Submit for review

## Temporary Solution for Testing

If you want to skip asset creation for now, I can:
1. Generate placeholder icons programmatically
2. Use text-based designs
3. Focus on functionality testing first

Let me know if you want to create proper assets or use placeholders!
