# Railway Deployment Guide

## Prerequisites
- Railway account with Pro Plan ✅
- GitHub account
- Your backend code

## Step 1: Push Code to GitHub

If you haven't already:
```bash
cd D:\Dev\recaply\backend
git init
git add .
git commit -m "Initial backend deployment"
git remote add origin https://github.com/YOUR_USERNAME/recaply-backend.git
git push -u origin main
```

## Step 2: Create New Project in Railway

1. Go to https://railway.app/dashboard
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Authorize Railway to access your GitHub
5. Select your `recaply-backend` repository
6. Railway will auto-detect Node.js and start deploying

## Step 3: Set Environment Variables

In Railway dashboard, go to your project → Variables tab → Add these:

```
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=generate_new_strong_secret_here
PORT=3000
NODE_ENV=production
```

### Generate Strong JWT Secret
Run this in PowerShell to generate a new secure JWT secret:
```powershell
[Convert]::ToBase64String((1..64 | ForEach-Object { Get-Random -Maximum 256 }))
```

## Step 4: Get Your Production URL

After deployment completes (~2-5 minutes):
1. Go to Settings → Domains
2. Railway gives you a URL like: `https://recaply-backend-production.up.railway.app`
3. Or add a custom domain if you have one

## Step 5: Update Frontend API_URL

In your React Native app, update the API URL:

**File:** `src/screens/RecordScreen.tsx`, `HomeScreen.tsx`, `TranscriptScreen.tsx`, `SettingsScreen.tsx`

Change:
```typescript
const API_URL = 'http://192.168.0.12:3000';
```

To:
```typescript
const API_URL = 'https://recaply-backend-production.up.railway.app';
```

Or better yet, create a config file:

**File:** `src/config.ts`
```typescript
export const API_URL = __DEV__ 
  ? 'http://192.168.0.12:3000'  // Development
  : 'https://recaply-backend-production.up.railway.app';  // Production
```

Then import it:
```typescript
import { API_URL } from '../config';
```

## Step 6: Test Deployment

1. Check Railway logs for any errors
2. Visit your URL in browser: `https://your-url.up.railway.app/`
3. Should see: "Recaply API Server is running"
4. Test an endpoint: `https://your-url.up.railway.app/api/user/me` (should return 401 without auth)

## Step 7: Deploy Frontend

Once backend is working:
1. Update all API_URL references in frontend
2. Build production APK with `eas build`
3. Test on device with production backend

## Troubleshooting

### FFmpeg not found
- Check Railway logs
- nixpacks.toml should include ffmpeg in nixPkgs
- Railway will install it automatically

### Environment variables not loading
- Make sure they're set in Railway dashboard (not .env file)
- Restart deployment after adding variables

### Port issues
- Railway auto-assigns PORT environment variable
- Make sure your server.ts uses: `process.env.PORT || 3000`

### Build fails
- Check Node version compatibility
- Ensure all dependencies in package.json
- Check Railway build logs for specific errors

## Monitoring

Railway dashboard shows:
- Real-time logs
- CPU/Memory usage
- Request metrics
- Deployment history

## Costs

With Pro Plan ($20/month):
- 32 GB RAM, 32 vCPU
- $0.000463/GB-hour for usage beyond plan
- Likely $20-30/month total for your app

## Auto-Deployment

Every time you push to GitHub:
1. Railway detects the push
2. Rebuilds your backend
3. Deploys automatically
4. Zero-downtime deployment

Your app stays online during updates! 🚀
