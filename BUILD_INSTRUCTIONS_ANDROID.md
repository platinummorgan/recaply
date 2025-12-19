# Google Play Store Build Instructions

## Version: 1.1.0 (Build 5)

### Option 1: Build with EAS (Recommended)

```bash
# Login to Expo (if not already)
npx eas-cli login

# Build Android App Bundle for Play Store
npx eas-cli build --platform android --profile production --non-interactive

# After build completes, submit to Play Store
npx eas-cli submit --platform android --latest
```

### Option 2: Manual Build

```bash
# Install dependencies
npm install

# Build locally (requires Android Studio)
npx expo run:android --variant release

# Or build APK for testing
npx eas-cli build --platform android --profile preview
```

### Build Configuration
- **Version:** 1.1.0
- **Build Number:** 5
- **Package:** com.recaply.app
- **Build Type:** app-bundle (AAB for Play Store)

### Troubleshooting

If you see expo-apple-authentication errors on Android build:
1. This is expected - it's iOS-only plugin
2. The build should still complete
3. If build fails, try: `npm install` first

### After Build Completes

1. Download the .aab file from EAS dashboard or build output
2. Go to Google Play Console: https://play.google.com/console
3. Navigate to: Recaply → Production → Create new release
4. Upload the .aab file
5. Copy release notes from RELEASE_NOTES_PLAY_STORE.txt
6. Submit for review

### Google Play Console Link
https://play.google.com/console/u/0/developers/YOUR_DEVELOPER_ID/app/YOUR_APP_ID

---

## Release Notes for Play Store

Copy the content from `RELEASE_NOTES_PLAY_STORE.txt` into the "Release notes" field.

**Character count:** ~560 characters (within Play Store limits)
