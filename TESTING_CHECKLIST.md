# Google Sign-In Testing Checklist

## ⏳ Build Status
🔄 **EAS Build in Progress**: [View build logs](https://expo.dev/accounts/platinummorgan/projects/recaply/builds/45b8ead3-acd5-426b-bf23-9820f6043b25)

## 📋 Pre-Testing Checklist

### 1. ✅ Backend Deployment
- [x] Backend code pushed to Railway
- [ ] Verify Railway deployment succeeded
- [ ] Add `GOOGLE_CLIENT_ID` environment variable in Railway dashboard

**Action Required:**
1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select your Recaply Backend project
3. Go to **Variables** tab
4. Click **New Variable**
5. Add:
   - **Key**: `GOOGLE_CLIENT_ID`
   - **Value**: `903412447976-ieci4go8faog9qvbnu6eb893tafgckjs.apps.googleusercontent.com`
6. Wait ~1 minute for automatic redeploy

### 2. ⏳ Google Cloud Console Setup
- [ ] Get SHA-1 fingerprint from EAS
- [ ] Create Android OAuth client in Google Cloud Console

**Action Required:**
Run this after the build completes:
```powershell
npx eas-cli credentials -p android
```
1. Select **production** profile
2. Copy the **SHA-1 Fingerprint**
3. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. Select **Android**
6. Fill in:
   - Name: `Recaply Android App`
   - Package name: `com.recaply.app`
   - SHA-1: (paste the fingerprint)
7. Click **CREATE**

### 3. ⏳ APK Download & Install
- [ ] Download APK from EAS build
- [ ] Transfer to phone
- [ ] Install on device

**Action Required:**
1. Wait for EAS build to complete
2. Download APK from the build URL
3. Transfer to your Android phone (USB, Drive, etc.)
4. Install the APK

## 🧪 Testing Steps

### Test 1: Email/Password Login (Existing Feature)
1. Open the app
2. Try logging in with existing account
3. ✅ Should work as before

### Test 2: Password Visibility Toggle (New Feature)
1. On Login screen, enter password
2. Tap the eye icon 👁️
3. ✅ Password should become visible
4. Tap again
5. ✅ Password should be hidden

### Test 3: Google Sign-In (New Feature)
1. On Login screen, tap **"🔍 Continue with Google"**
2. Google account picker should appear
3. Select your Google account
4. Grant permissions
5. ✅ Should authenticate and navigate to Home screen
6. Verify your email appears in settings

### Test 4: Google Sign-In from Register Screen
1. Logout from settings
2. Go to Register screen
3. Tap **"🔍 Continue with Google"**
4. Select Google account
5. ✅ Should authenticate (create account if new user)
6. ✅ Should navigate to Home screen

### Test 5: Logout and Re-login with Google
1. Logout from settings
2. Login again with Google
3. ✅ Should be faster (account already created)
4. ✅ Should navigate to Home screen

## 🐛 Troubleshooting

### "Sign in failed" or "Google Sign-In Failed"
**Possible causes:**
- Railway backend doesn't have `GOOGLE_CLIENT_ID` env variable
- Backend hasn't finished deploying
- Network connectivity issue

**Fix:**
1. Check Railway logs for errors
2. Verify environment variable is set
3. Wait a few minutes for deployment

### "Play Services not available"
**Possible causes:**
- Testing on device without Google Play Services
- Play Services outdated

**Fix:**
1. Update Google Play Services on device
2. Use a device with Google Play Services installed

### "Invalid Client" error
**Possible causes:**
- SHA-1 fingerprint not added to Google Cloud Console
- SHA-1 mismatch
- Wrong package name

**Fix:**
1. Verify SHA-1 fingerprint matches EAS credentials
2. Check package name is exactly: `com.recaply.app`
3. Wait a few minutes after creating OAuth client (can take time to propagate)

### Backend 500 error
**Check Railway logs:**
```powershell
# If you have Railway CLI installed
railway logs --follow
```

Or view logs in Railway dashboard

## 📊 Expected Results

✅ **Success Indicators:**
- Google account picker appears
- User authenticates smoothly
- App navigates to Home screen
- User email visible in Settings
- Can logout and re-login
- Works for both new and existing users

❌ **Failure Indicators:**
- Error alerts appear
- App crashes
- Stuck on login screen
- Network errors

## 🎯 Next Steps After Testing

Once Google Sign-In works:
1. ✅ Mark Google Sign-In complete
2. 📱 Start onboarding tutorial implementation
3. 📸 Update Play Store screenshots
4. 🎉 Get tester community feedback on new features

---

## Quick Links

- **EAS Build**: https://expo.dev/accounts/platinummorgan/projects/recaply/builds/45b8ead3-acd5-426b-bf23-9820f6043b25
- **Railway Dashboard**: https://railway.app/dashboard
- **Google Cloud Console**: https://console.cloud.google.com/apis/credentials
- **Backend API**: https://web-production-abd11.up.railway.app
- **Setup Guide**: GOOGLE_SIGNIN_SETUP.md

---

**Web Client ID**: `903412447976-ieci4go8faog9qvbnu6eb893tafgckjs.apps.googleusercontent.com`
**Package Name**: `com.recaply.app`
