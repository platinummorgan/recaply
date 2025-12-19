# Recaply v1.1.0 - Recording Reliability Update

**Release Date:** December 19, 2025  
**Version:** 1.1.0 (Build 5)  
**Platform:** Android & iOS

---

## 🎯 What's New

### Critical Recording Fixes
This release focuses on making recordings bulletproof - no more lost recordings!

### 🛡️ Recording Protection
- **Save-First Architecture**: All recordings are now saved locally BEFORE upload attempts
- **Automatic Retry Queue**: Failed uploads automatically queue for retry when network improves
- **No More Lost Recordings**: Even if upload fails or times out, your recording is safely stored

### ⏱️ Extended Timeout Support
- **Backend Processing**: Extended from 5 minutes to 30 minutes (supports recordings up to 25+ minutes)
- **Client Timeout**: Extended to 2 hours to handle upload + transcription for very long recordings
- **File Size Limit**: 500MB capacity supports 60+ minute recordings

### 📊 Better User Feedback
- **Progress Messages**: Clear feedback during long uploads ("This may take a few minutes...")
- **20-Minute Warning**: Alerts users when approaching limits that may cause slower processing
- **Smart Error Messages**: Distinguishes between timeout and other errors with actionable guidance
- **Status Updates**: Always tells users where their recording is and what's happening

### 🔄 Enhanced Reliability
- **Timeout Recovery**: Graceful handling of network timeouts with local backup
- **Upload Retry Logic**: Automatic retry mechanism for failed uploads
- **Data Preservation**: No recordings lost due to network issues or timeouts

---

## 🐛 Bug Fixes

- Fixed: 5-minute recordings failing due to timeout constraints
- Fixed: Lost recordings when upload or transcription failed
- Fixed: Silent failures with no user feedback
- Fixed: No timeout protection on client-side requests
- Fixed: Recording data loss on network errors

---

## 📱 Platform Support

### Android
- **Version:** 1.1.0 (Build 5)
- **Minimum SDK:** 21 (Android 5.0+)
- **Target SDK:** 34 (Android 14)

### iOS
- **Version:** 1.1.0
- **Minimum iOS:** 13.0+
- **Compatible with:** iPhone, iPad

---

## 🔧 Technical Details

### Recording Limits by Tier
- **Free Tier**: Up to 30 minutes per recording
- **Lite Tier**: Up to 120 minutes per recording
- **Pro Tier**: Unlimited recording duration

### Timeout Configuration
- Backend transcription timeout: 30 minutes
- Client upload timeout: 2 hours
- File size limit: 500MB
- All recordings saved locally regardless of upload status

---

## 📝 Developer Notes

### Files Changed
- `src/screens/RecordScreen.tsx` - Save-first logic, timeout handling, retry queue
- `backend/src/services/transcription.ts` - Extended timeout from 5 to 30 minutes
- `app.json` - Version bump to 1.1.0, versionCode 5
- `package.json` - Version bump to 1.1.0

### Breaking Changes
None - fully backward compatible

### Migration Notes
- No database migrations required
- No user data migration needed
- Existing queued recordings will work with new retry logic

---

## 🚀 Deployment Instructions

### Google Play Store (Android)
```bash
# Build the production bundle
eas build --platform android --profile production

# Submit to Google Play
eas submit -p android
```

### App Store (iOS)
```bash
# Build for App Store
eas build --platform ios --profile production

# Submit to App Store
eas submit -p ios
```

---

## ✅ Testing Checklist

- [x] Test 5-minute recording (original bug scenario)
- [x] Test 20+ minute recording with warning
- [x] Test timeout scenario with local save
- [x] Test offline recording queue
- [x] Verify recording list shows queued items
- [x] Test manual retry from recordings screen
- [x] Verify minutes deduction after successful upload
- [x] Test all three subscription tiers

---

## 🎉 User Impact

**Before v1.1.0:**
- 5+ minute recordings could fail
- Timeouts resulted in lost recordings
- No way to recover from upload failures
- Poor user feedback on what went wrong

**After v1.1.0:**
- ✅ Record as long as your plan allows
- ✅ Recordings never lost, always saved locally
- ✅ Automatic retry on failure
- ✅ Clear feedback and guidance
- ✅ Supports up to 60+ minute recordings reliably

---

## 📞 Support

For issues or questions:
- Email: support@recaply.app
- In-app: Settings → Help & Support

---

**Full Changelog:** https://github.com/yourusername/recaply/compare/v1.0.0...v1.1.0
