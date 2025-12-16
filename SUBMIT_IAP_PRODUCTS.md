# How to Submit In-App Purchase Products for Review

Apple requires that your in-app purchase products be submitted for review along with your app binary.

## Steps:

### 1. Create App Review Screenshot
1. Take a screenshot of your subscription screen showing the pricing
2. This screenshot will be uploaded when creating the IAP products

### 2. Go to App Store Connect
Visit: https://appstoreconnect.apple.com/apps/6756546657/appstore/subscriptions

### 3. Create Subscription Group (if not exists)
1. Click **+** to create a new subscription group
2. Name it: "Recaply Subscriptions"
3. Save

### 4. Create Lite Subscription
1. Click **+** in the subscription group
2. Enter details:
   - **Reference Name**: Recaply Lite Monthly
   - **Product ID**: `recaply_lite_monthly`
   - **Subscription Duration**: 1 Month
3. Add pricing:
   - Select your base region (e.g., USA)
   - Set price: $4.99/month
4. Add localizations:
   - **Display Name**: Recaply Lite
   - **Description**: Get 120 minutes of AI transcription per month with Recaply Lite
5. Upload **App Review screenshot** (screenshot of your subscription screen)
6. Click **Save**
7. Click **Submit for Review** button

### 5. Create Pro Subscription
1. Click **+** in the subscription group
2. Enter details:
   - **Reference Name**: Recaply Pro Monthly
   - **Product ID**: `recaply_pro_monthly`
   - **Subscription Duration**: 1 Month
3. Add pricing:
   - Select your base region
   - Set price: $14.99/month
4. Add localizations:
   - **Display Name**: Recaply Pro
   - **Description**: Get unlimited AI transcription minutes with Recaply Pro, plus priority support
5. Upload **App Review screenshot**
6. Click **Save**
7. Click **Submit for Review** button

### 6. Check Paid Apps Agreement
1. Go to **Agreements, Tax, and Banking** in App Store Connect
2. Make sure **Paid Applications Agreement** is signed
3. If not signed, the Account Holder must sign it

### 7. Verify Products are Submitted
Go back to: https://appstoreconnect.apple.com/apps/6756546657/appstore/subscriptions

Both products should show status: **Waiting for Review** or **In Review**

## Important Notes:

- Products don't need to be approved before app review
- They just need to be **submitted for review** at the same time
- Apple will review them together with your app
- The shared secret must be configured for receipt validation to work
- During review, Apple tests purchases in the sandbox environment

## Product IDs to use:
- Lite: `recaply_lite_monthly`
- Pro: `recaply_pro_monthly`

These must match exactly what's in your app code.
