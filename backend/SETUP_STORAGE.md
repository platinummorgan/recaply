# Supabase Storage Setup for Audio Playback

## 1. Create Storage Bucket

Go to your Supabase dashboard: https://negarkyrbnblogrzkyft.supabase.co

### Steps:
1. Click **Storage** in the left sidebar
2. Click **New bucket**
3. Settings:
   - **Name**: `recordings`
   - **Public bucket**: ✅ **Yes** (so users can play audio)
   - **File size limit**: 50 MB (free tier limit)
   - **Allowed MIME types**: `audio/m4a, audio/mp4, audio/mpeg`

4. Click **Create bucket**

## 2. Add audio_url Column to Database

Go to **SQL Editor** and run:

```sql
-- Add audio_url column to recordings table
ALTER TABLE recordings 
ADD COLUMN audio_url TEXT;

-- Add index for faster queries
CREATE INDEX idx_recordings_audio_url ON recordings(audio_url);
```

## 3. That's it!

Now recordings will be stored in Supabase Storage and users can play them back.

## Storage Limits

**Free Tier:**
- 1GB total storage
- 50MB per file
- Bandwidth: 2GB/month

**Calculations:**
- 1MB per minute of audio
- 1GB = ~1000 minutes = ~16 hours total storage
- With 30 min/month free tier, can store ~33 users' monthly usage

**Paid Tier ($25/month):**
- 100GB storage
- 5GB bandwidth
- Much better for production
