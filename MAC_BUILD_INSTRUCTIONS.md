# iOS Build Instructions for v1.1.1

**Date:** December 19, 2025
**Current Status:** All code changes committed to main branch. Android v1.1.1 production build complete and ready for Play Store.

## What You Need to Do on Mac

### 1. Pull Latest Code
```bash
cd /path/to/recaply
git pull origin main
```

### 2. Verify You Have v1.1.1
Check these files to confirm:
- `app.json` should show `"version": "1.1.1"` and `"versionCode": 6` (Android), `"buildNumber": "6"` (iOS if present)
- `package.json` should show `"version": "1.1.1"`

### 3. What Changed in v1.1.1 (All These Are Already Committed)

**Critical Fixes:**
- ✅ Save-first architecture - recordings saved locally before upload (prevents data loss)
- ✅ Upload queue with authentication - failed uploads auto-retry with proper auth token
- ✅ Queue visibility - pending/failed uploads shown on HomeScreen with status badges
- ✅ Pull-to-refresh - processes upload queue and retries failed uploads
- ✅ Background recording - continues when phone is locked
- ✅ Lock screen notification - shows recording status with live timer
- ✅ Keep-awake - prevents phone from sleeping during recording
- ✅ Chunked transcription - handles unlimited recording length (20-min chunks)

**Backend Fixes (Already Deployed):**
- ✅ Fixed temp directory path for Railway (uses os.tmpdir())
- ✅ Fixed ffprobe race condition
- ✅ Enabled trust proxy for rate limiting
- ✅ Fixed minute deduction to use actual audio duration

**Files Modified:**
- `src/screens/RecordScreen.tsx` - Save-first, background audio, notifications, keep-awake
- `src/screens/HomeScreen.tsx` - Queue visibility, pull-to-refresh
- `src/services/uploadQueue.ts` - Authentication, backward compatibility
- `src/services/storage.ts` - Token support in queue
- `app.json` - Version bump, Android permissions
- `ios/Recaply/Info.plist` - UIBackgroundModes: ["audio"]
- `package.json` - expo-keep-awake, expo-notifications dependencies

### 4. iOS-Specific Configuration (Already Done)

The following iOS config is already in place:
- ✅ `ios/Recaply/Info.plist` has UIBackgroundModes: ["audio"]
- ✅ All shared code works on iOS (React Native)

### 5. Build iOS for App Store

**Option A: EAS Build (Recommended - No Mac Setup Required)**
```bash
npx eas-cli build --platform ios --profile production
```

**Option B: Local Build (Requires Xcode)**
```bash
cd ios
pod install
cd ..
# Then open ios/Recaply.xcworkspace in Xcode and build
```

### 6. After Build Completes

1. Download the IPA file from EAS or export from Xcode
2. Upload to App Store Connect using Transporter app
3. Fill in release notes (see RELEASE_NOTES_v1.1.1.txt)
4. Submit for review

## Release Notes for App Store

Use the content from `RELEASE_NOTES_v1.1.1.txt`:

```
Version 1.1.1 - Critical Fixes

What's Fixed:
• Fixed failed upload retry system - recordings now properly retry when upload fails
• Fixed backend transcription for recordings over 20 minutes - chunking now works correctly
• Added visibility for pending/failed uploads on home screen with status badges
• Pull-to-refresh now properly retries failed uploads
• Fixed authentication issues with upload queue
• Improved error handling and reliability

All recordings are saved locally first to prevent data loss, then uploaded automatically when connection is available.
```

## Current App Versions

- **Android:** v1.1.1 (versionCode 6) - Production AAB ready at https://expo.dev/artifacts/eas/wH4yFZT8VP1DyoKZkwqyhU.aab
- **iOS:** v1.0.0 (needs update to v1.1.1)
- **Backend:** All fixes deployed to Railway (https://web-production-abd11.up.railway.app)

## Testing Checklist Before Submission

Test these critical features on iOS:
- [ ] Record for 5+ minutes - should save successfully
- [ ] Lock phone during recording - should continue recording
- [ ] Check lock screen - should show recording notification
- [ ] Recording should auto-upload after stopping
- [ ] If upload fails, check HomeScreen - should show pending badge
- [ ] Pull down to refresh - should retry upload
- [ ] Check minutes deducted - should match actual recording duration

## Git Status

All changes are committed to `main` branch. Nothing needs to be committed on Mac - just pull and build.

Latest commits:
- `3cb7396` - Fix minute deduction - use actual audio duration from ffprobe
- `b8a074f` - v1.1.1 - Fix upload queue, chunked transcription, and queue visibility
- `f4c8349` - Enable trust proxy for Railway deployment
- `88c52ef` - Fix race condition - wait for ffprobe to finish before deleting temp file
- `b0a2906` - Add backward compatibility for queued uploads without tokens
- `f9282fd` - Fix upload queue authentication - add token to queued uploads
- `30efc09` - Show queued/pending recordings in HomeScreen with visual status
- `e66b52f` - Fix temp directory path for Railway deployment - use os.tmpdir()
- `e3d6136` - Add background recording and lock screen notification

## Questions?

If anything is unclear or you encounter issues:
1. Check that all dependencies are installed: `npm install`
2. Check iOS pods are updated: `cd ios && pod install`
3. Verify you're on the `main` branch: `git branch`
4. Verify latest code: `git log --oneline -5`

---

**Ready to build!** Just pull the code and run the EAS build command for iOS.
