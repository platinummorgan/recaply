# Supabase Setup for Recaply

## Why Supabase?

- ✅ **You already know it** from previous projects
- ✅ Hosted PostgreSQL (no local setup needed)
- ✅ Free tier with 500MB database
- ✅ Built-in auth (optional)
- ✅ Auto-generated API
- ✅ Real-time subscriptions
- ✅ Built-in storage for audio files (optional)

## Setup Steps

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Sign in / Create account
3. Click "New Project"
4. Name: `recaply`
5. Database password: (save this!)
6. Region: Choose closest to your users
7. Click "Create new project"

### 2. Create Database Tables

Go to SQL Editor in Supabase dashboard and run:

\`\`\`sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free' 
    CHECK (subscription_tier IN ('free', 'lite', 'pro')),
  minutes_used INTEGER NOT NULL DEFAULT 0,
  minutes_limit INTEGER NOT NULL DEFAULT 30,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Usage records
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes_used INTEGER NOT NULL,
  action_type VARCHAR(50) NOT NULL 
    CHECK (action_type IN ('transcription', 'summary')),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Recordings (optional - to save transcripts)
CREATE TABLE recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(500),
  duration_minutes INTEGER,
  transcript TEXT,
  summary_json JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_usage_user_id ON usage_records(user_id);
CREATE INDEX idx_recordings_user_id ON recordings(user_id);

-- Function to increment minutes (for atomic updates)
CREATE OR REPLACE FUNCTION increment_minutes(user_id UUID, amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_value INTEGER;
BEGIN
  UPDATE users 
  SET minutes_used = minutes_used + amount
  WHERE id = user_id
  RETURNING minutes_used INTO new_value;
  
  RETURN new_value;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at();
\`\`\`

### 3. Get API Keys

In Supabase dashboard:
1. Go to "Settings" → "API"
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGc...` (for mobile app)
   - **service_role key**: `eyJhbGc...` (for backend - KEEP SECRET!)

### 4. Configure Backend

Edit `backend/.env`:

\`\`\`bash
# Supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGc... (anon key)
SUPABASE_SERVICE_KEY=eyJhbGc... (service role key - NEVER expose!)

# Other keys
OPENAI_API_KEY=sk-your-openai-key
JWT_SECRET=your-random-secret-string
STRIPE_SECRET_KEY=sk_test_your-stripe-key
\`\`\`

### 5. Test Connection

\`\`\`bash
cd backend
npm install
npm run dev
\`\`\`

Visit: http://localhost:3000/health

Should see: `{"status":"ok"}`

## Supabase vs Regular PostgreSQL

| Feature | Supabase | PostgreSQL |
|---------|----------|------------|
| Setup | 5 minutes | 30+ minutes |
| Hosting | Free tier | Need to pay/setup |
| Backups | Automatic | Manual |
| Scaling | Automatic | Manual |
| Dashboard | Beautiful UI | Command line |
| Cost | Free → $25/mo | $0 → $50/mo |

## Alternative: Neon

If you prefer **Neon** instead:

1. Go to https://neon.tech
2. Create project: `recaply`
3. Copy connection string
4. Update `backend/.env`:
   \`\`\`
   DATABASE_URL=postgresql://user:pass@xxx.neon.tech/recaply
   \`\`\`
5. Use the old `database.ts` file (PostgreSQL)

**But I recommend Supabase** - it's easier and has more features!

## Next Steps

1. ✅ Create Supabase project
2. ✅ Run SQL to create tables
3. ✅ Copy API keys to `.env`
4. ✅ Test backend connection
5. ✅ Deploy backend (Railway/Heroku)
6. ✅ Update mobile app with backend URL

Much easier than setting up PostgreSQL locally! 🎉
