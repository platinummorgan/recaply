# Recaply Backend API

Backend server for Recaply - Meeting Note AI Assistant

## Features

- 🔐 User authentication (JWT)
- 📊 Subscription management (Free, Lite, Pro)
- 🎙️ Audio transcription (OpenAI Whisper)
- 🤖 AI summarization (GPT-4)
- 💳 Payment processing (Stripe)
- 📈 Usage tracking & limits
- 🔒 Secure API endpoints

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Setup PostgreSQL Database

```bash
# Install PostgreSQL if not already installed
# Create database
createdb recaply

# Run schema
psql recaply < database/schema.sql
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your keys:
- `OPENAI_API_KEY` - Your OpenAI API key (you pay for this)
- `JWT_SECRET` - Random secret string for JWT tokens
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `DATABASE_URL` - PostgreSQL connection string

### 4. Start Server

Development mode:
```bash
npm run dev
```

Production build:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication

**POST** `/api/auth/register`
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**POST** `/api/auth/login`
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

### Audio Processing

**POST** `/api/audio/transcribe` (requires auth)
- Upload audio file
- Returns transcript
- Deducts minutes from user account

**POST** `/api/audio/summarize` (requires auth)
```json
{
  "transcript": "Meeting transcript text..."
}
```

**POST** `/api/audio/process` (requires auth)
- Upload audio file
- Returns transcript + summary in one call

### User

**GET** `/api/user/usage` (requires auth)
- Returns user's usage stats

### Subscription

**POST** `/api/subscription/create-checkout` (requires auth)
```json
{
  "plan": "lite" // or "pro"
}
```

**POST** `/api/subscription/webhook`
- Stripe webhook endpoint
- Handles subscription events

## Subscription Tiers

| Tier | Price | Minutes/Month |
|------|-------|---------------|
| Free | $0 | 30 |
| Lite | $9 | 300 |
| Pro | $19 | Unlimited |

## Cost Management

**YOU** pay for OpenAI API costs:
- Transcription: ~$0.006 per minute (Whisper)
- Summarization: ~$0.03 per minute (GPT-4)
- **Total**: ~$0.04 per minute

Example monthly costs:
- Free tier (30 min): ~$1.20
- Lite tier (300 min): ~$12
- Pro tier (depends on usage)

Build in profit margin with pricing!

## Security

- JWT authentication on all protected routes
- Rate limiting (100 req/15min per IP)
- Helmet.js security headers
- CORS configuration
- Password hashing with bcrypt

## Mobile App Integration

Update mobile app to call YOUR backend instead of OpenAI directly:

```typescript
// Instead of calling OpenAI directly:
const response = await axios.post('https://api.openai.com/...')

// Call your backend:
const response = await axios.post('https://your-api.com/api/audio/transcribe', formData, {
  headers: {
    'Authorization': `Bearer ${userToken}`,
  }
});
```

## Deployment

### Option 1: Railway
```bash
railway login
railway init
railway up
```

### Option 2: Heroku
```bash
heroku create recaply-api
heroku addons:create heroku-postgresql
git push heroku main
```

### Option 3: DigitalOcean App Platform
- Connect GitHub repo
- Configure environment variables
- Deploy

## Environment Variables

Required:
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - JWT signing secret
- `OPENAI_API_KEY` - OpenAI API key
- `STRIPE_SECRET_KEY` - Stripe secret
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `FRONTEND_URL` - Mobile app URL (for CORS)

## Monitoring

TODO: Add monitoring service:
- Sentry for error tracking
- LogRocket for session replay
- DataDog for performance

## License

Proprietary
