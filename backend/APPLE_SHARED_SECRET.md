# Environment Variables Needed for App Store Purchases

## APPLE_SHARED_SECRET

Required for iOS in-app purchase receipt validation.

### How to get it:

1. Go to App Store Connect: https://appstoreconnect.apple.com
2. Select your app (Recaply)
3. Go to **App Information** > **App-Specific Shared Secret**
4. Click **Generate** if you don't have one
5. Copy the shared secret

### Add to Railway:

1. Go to your Railway project: https://railway.app
2. Select the backend service
3. Go to **Variables** tab
4. Add new variable:
   - Key: `APPLE_SHARED_SECRET`
   - Value: [paste the shared secret]
5. Redeploy the backend

### Note:
The shared secret is used to verify that purchase receipts from iOS devices are legitimate. Without it, all iOS purchases will fail verification.
