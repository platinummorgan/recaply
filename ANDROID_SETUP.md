# Recaply - Quick Android Setup Guide

## Prerequisites
You need:
- Android Studio installed ✅
- Android SDK installed
- Phone with USB debugging enabled

## Setup Steps

### 1. Set Environment Variables
Add these to your system PATH:
```
ANDROID_HOME=C:\Users\YOUR_USERNAME\AppData\Local\Android\Sdk
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
```

### 2. Add to PATH:
```
%ANDROID_HOME%\platform-tools
%ANDROID_HOME%\tools
%JAVA_HOME%\bin
```

### 3. Open in Android Studio (EASIEST)
1. Open Android Studio
2. File → Open → Select `D:\Dev\recaply\android`
3. Wait for Gradle sync
4. Connect phone via USB
5. Enable USB debugging on phone
6. Click green "Run" button

### 4. OR Use Command Line
Once environment is set:
```powershell
cd D:\Dev\recaply
npx react-native run-android
```

## Backend Setup
Backend is already running on port 3000!
Your phone will connect to: http://192.168.0.12:3000/api

## Troubleshooting

### If phone can't reach backend:
```powershell
adb reverse tcp:3000 tcp:3000
```

Then change `.env` to:
```
API_BASE_URL=http://localhost:3000/api
```

### Check phone connection:
```powershell
adb devices
```

Should show your device.
