# Google Sign-In Setup Guide

## ✅ Completed Steps

### 1. Frontend Implementation
- ✅ Installed `@react-native-google-signin/google-signin` package
- ✅ Created `src/config/googleSignIn.ts` with Web Client ID configuration
- ✅ Added plugin to `app.json`
- ✅ Extended `AuthContext` with `loginWithGoogle()` method
- ✅ Added Google Sign-In button UI to `LoginScreen.tsx`
- ✅ Added Google Sign-In button UI to `RegisterScreen.tsx`

### 2. Backend Implementation
- ✅ Added `/api/auth/google` endpoint in `backend/src/routes/auth.ts`
- ✅ Added Google OAuth2 client verification logic
- ✅ Added `GOOGLE_CLIENT_ID` to backend `.env` and `.env.example`
- ✅ Backend creates new users automatically on first Google sign-in

## 🔧 Required Steps for You

### Step 1: Get SHA-1 Fingerprint

Run this command in PowerShell:
```powershell
cd D:\Dev\recaply
npx eas-cli credentials -p android
```

1. Select **production** profile
2. Look for **SHA-1 Fingerprint** in the output
3. Copy it (something like `AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12`)

### Step 2: Create Android OAuth Client in Google Cloud Console

1. Go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials)
2. Select your existing OAuth project
3. Click **"+ CREATE CREDENTIALS"** → **OAuth client ID**
4. Application type: **Android**
5. Fill in:
   - **Name**: `Recaply Android App`
   - **Package name**: `com.recaply.app`
   - **SHA-1 certificate fingerprint**: (paste the SHA-1 from Step 1)
6. Click **CREATE**

### Step 3: Update Backend Environment Variable on Railway

Since your backend is deployed on Railway, you need to add the environment variable there:

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Select your **Recaply Backend** project
3. Go to **Variables** tab
4. Add new variable:
   - **Key**: `GOOGLE_CLIENT_ID`
   - **Value**: `903412447976-ieci4go8faog9qvbnu6eb893tafgckjs.apps.googleusercontent.com`
5. Railway will automatically redeploy with the new variable

### Step 4: Rebuild and Deploy Backend

Your backend has been updated with the new Google Sign-In endpoint. You need to push it to Railway:

```powershell
cd D:\Dev\recaply\backend
git add .
git commit -m "Add Google Sign-In authentication endpoint"
git push origin main
```

Railway will automatically rebuild and redeploy (takes ~2-5 minutes).

### Step 5: Build and Test App

Once Railway deployment completes:

1. **Build new APK** (EAS will rebuild with new config):
   ```powershell
   cd D:\Dev\recaply
   npx eas-build --platform android --profile production
   ```

2. **Download and install** the APK on your test device

3. **Test Google Sign-In**:
   - Open the app
   - Go to Login or Register screen
   - Tap **"🔍 Continue with Google"**
   - Sign in with your Google account
   - App should authenticate and navigate to Home screen

## 🎯 How It Works

### Frontend Flow
1. User taps "Continue with Google" button
2. Google Sign-In SDK opens authentication dialog
3. User selects Google account and grants permissions
4. SDK returns ID token to app
5. App sends ID token to backend `/api/auth/google`
6. Backend returns JWT token
7. App stores JWT and navigates to Home screen

### Backend Flow
1. Receives Google ID token from app
2. Verifies token with Google's servers using OAuth2Client
3. Extracts email from verified token
4. Checks if user exists in database:
   - **Existing user**: Returns JWT token with user data
   - **New user**: Creates account automatically, returns JWT token
5. User is now authenticated!

## 🔒 Security Notes

- ✅ ID tokens are verified server-side using Google's OAuth2 library
- ✅ SHA-1 fingerprint ensures only your signed app can use Google Sign-In
- ✅ Web Client ID is public (safe to include in code)
- ✅ Backend validates every Google authentication request
- ✅ JWT tokens expire after 30 days for security

## 📝 Configuration Summary

**Web Client ID** (already configured):
```
903412447976-ieci4go8faog9qvbnu6eb893tafgckjs.apps.googleusercontent.com
```

**Android Package Name**:
```
com.recaply.app
```

**Backend API URL**:
```
https://web-production-abd11.up.railway.app
```

**Backend Endpoint**:
```
POST https://web-production-abd11.up.railway.app/api/auth/google
Body: { "idToken": "google_id_token_here" }
Response: { "token": "jwt_token", "user": {...} }
```

## 🐛 Troubleshooting

### "Sign in failed" error
- Check Railway logs to see backend error
- Verify `GOOGLE_CLIENT_ID` is set in Railway variables
- Ensure backend deployed successfully

### "Play Services not available"
- Google Play Services required on device
- Use real Android device or emulator with Play Services
- Cannot test on iOS or devices without Play Services

### "Invalid Client" error
- SHA-1 fingerprint mismatch
- Make sure you used the production keystore SHA-1
- Check that package name matches exactly: `com.recaply.app`

### Backend 500 error
- Check Railway logs: `railway logs --follow`
- Verify `GOOGLE_CLIENT_ID` environment variable is set
- Make sure `google-auth-library` is in package.json (it's in `googleapis`)

## 🎉 Next Steps

After Google Sign-In is working:

1. **Onboarding Tutorial** - Create walkthrough for new users
2. **Play Store Screenshots** - Update with feature highlights
3. **Testing** - Get community testers to try Google Sign-In
4. **Analytics** - Track Google vs email sign-ups

---

**Your OAuth Web Client ID**: 903412447976-ieci4go8faog9qvbnu6eb893tafgckjs.apps.googleusercontent.com

**Current Status**: ✅ Code complete, pending Google Cloud Console setup and Railway deployment
