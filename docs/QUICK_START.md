# Quick Start: Testing LLM Integration

This guide will help you quickly test the LLM integration without recording actual meetings.

## Step 1: Install Dependencies

```bash
cd d:\Dev\recaply
npm install
```

## Step 2: Configure Environment

Copy `.env.example` to `.env`:
```bash
Copy-Item .env.example .env
```

Edit `.env` and add your API key:
```
LLM_API_KEY=sk-your-openai-key-here
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=gpt-4
```

## Step 3: Test LLM Service (Optional)

Create a test script to verify LLM connection:

```typescript
// test-llm.ts
import { generateMeetingSummary } from './src/services/LLMService';

const testTranscript = `
Meeting started at 10:00 AM with John, Sarah, and Mike.

John: Let's discuss the Q4 roadmap. We need to prioritize features.
Sarah: I think we should focus on the mobile app first.
Mike: Agreed. The analytics show 60% of users are on mobile.
John: Great. Sarah, can you lead the mobile initiative?
Sarah: Yes, I'll prepare a proposal by Friday.
Mike: I'll help with the backend API updates.
John: Perfect. Let's schedule weekly check-ins on Mondays at 2 PM.

Meeting adjourned at 10:30 AM.
`;

generateMeetingSummary(testTranscript)
  .then(summary => {
    console.log('Summary:', summary.summary);
    console.log('Key Points:', summary.keyPoints);
    console.log('Decisions:', summary.decisions);
    console.log('Action Items:', summary.actionItems);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

Run the test:
```bash
npx ts-node test-llm.ts
```

## Step 4: Test in App

1. **Start the app**:
```bash
npm run android
```

2. **Configure LLM in-app**:
   - Open app
   - Tap Settings icon (top right)
   - Tap "LLM Configuration"
   - Select "OpenAI (GPT)" as provider
   - Enter your API key
   - Select model (e.g., gpt-4)
   - Tap "Test Connection"
   - Wait for success message ✅

3. **Test with sample recording**:
   - Go back to home screen
   - Tap "Record" button
   - Say a few test sentences (or just wait 10 seconds)
   - Tap "Stop"
   - When prompted, tap "Transcribe"
   - After transcription, tap "Generate Summary"
   - View the AI-generated summary!

## Step 5: Review Results

The summary should include:
- ✅ Concise overview paragraph
- ✅ Key points (bullet list)
- ✅ Decisions made
- ✅ Action items with assignees
- ✅ Meeting sentiment

## Troubleshooting

### Can't install dependencies
```bash
# Clear cache and retry
npm cache clean --force
Remove-Item node_modules -Recurse -Force
npm install
```

### LLM connection fails
- Verify API key is correct
- Check internet connection
- Ensure you have API credits
- Try the test script first

### App won't build
```bash
# Clean and rebuild
cd android
.\gradlew clean
cd ..
npm run android
```

### No summary generated
- Check LLM configuration in Settings
- Verify API key is saved
- Look at app logs for errors
- Try "Test Connection" button

## Expected Costs

For testing (assuming 10 test meetings):
- **OpenAI GPT-4**: ~$0.40 total
- **OpenAI GPT-3.5**: ~$0.05 total  
- **Groq**: ~$0.01 total
- **Local LLM**: $0 (free)

## Next Steps

Once LLM is working:
1. ✅ Configure Whisper for transcription
2. ✅ Test full workflow (record → transcribe → summarize)
3. ✅ Customize settings (temperature, max tokens)
4. ✅ Try different LLM providers
5. ✅ Set up local LLM for privacy

## Sample Test Transcript

Use this for manual testing:

```
Team standup meeting, November 7, 2025

Alice: Good morning everyone. Let's start with updates.

Bob: I finished the login feature yesterday. It's ready for QA testing. Alice, can you review the PR?

Alice: Sure, I'll review it by end of day. I've been working on the dashboard redesign. Should be done by Friday.

Charlie: I'm blocked on the API integration. The third-party service is down. I'll try contacting their support.

Alice: Okay, let me know if you need help. In the meantime, can you work on the error handling?

Charlie: Yes, good idea. I'll focus on that today.

Bob: One more thing - we need to discuss the database migration for next week.

Alice: Let's schedule a separate meeting for that. I'll send a calendar invite. How about Tuesday at 3 PM?

Bob: Works for me.

Charlie: Same here.

Alice: Great. Anything else? No? Okay, let's get to work. Thanks everyone!

Meeting ended.
```

Expected summary:
- Overview: Team standup with updates on login feature, dashboard, and API integration
- Key points: Login ready for QA, dashboard in progress, API blocked
- Decisions: Schedule database migration meeting for Tuesday 3 PM
- Action items: Alice to review PR, contact API support, Charlie to work on error handling

Happy testing! 🎉
