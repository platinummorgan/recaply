/**
 * Example usage of LLM Service
 * This file demonstrates how to use the LLM service in your application
 */

import {
  generateMeetingSummary,
  generateQuickSummary,
  extractActionItems,
  testLLMConnection,
  estimateTokens,
  estimateCost,
} from '../services/LLMService';

import {getCurrentProvider} from '../services/LLMConfigService';
import type {LLMProvider} from '../types/llm';

// Example 1: Generate a full meeting summary
export async function exampleFullSummary() {
  const transcript = `
    Meeting: Product Planning Session
    Date: November 7, 2025
    Attendees: John (PM), Sarah (Eng), Mike (Design)

    John: Let's discuss the Q4 roadmap. We have three major features to consider.
    Sarah: I think we should prioritize the mobile app. Our analytics show 60% mobile users.
    Mike: Agreed. I can start on the UI mockups this week.
    John: Great. Sarah, can you estimate the development time?
    Sarah: About 6 weeks with proper testing. I'll need one more engineer.
    John: Approved. Mike, please have designs ready by next Friday.
    Mike: Will do.
    John: Let's schedule weekly check-ins every Monday at 2 PM.
    
    Decision: Prioritize mobile app for Q4.
    Action items: Mike - designs by Friday, John - hire additional engineer.
  `;

  try {
    console.log('Generating full summary...');
    const summary = await generateMeetingSummary(transcript);

    console.log('Summary:', summary.summary);
    console.log('Key Points:', summary.keyPoints);
    console.log('Decisions:', summary.decisions);
    console.log('Action Items:', summary.actionItems);
    console.log('Sentiment:', summary.sentiment);

    return summary;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Example 2: Generate a quick summary (faster, shorter)
export async function exampleQuickSummary() {
  const transcript = 'Brief team standup. Everyone provided updates. No blockers.';

  try {
    const summary = await generateQuickSummary(transcript);
    console.log('Quick Summary:', summary);
    return summary;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Example 3: Extract only action items
export async function exampleExtractActions() {
  const transcript = `
    Action items from meeting:
    - John to review the proposal by Friday
    - Sarah to schedule follow-up meeting with client
    - Mike to update documentation by end of week
  `;

  try {
    const actionItems = await extractActionItems(transcript);
    console.log('Action Items:', actionItems);
    return actionItems;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Example 4: Test LLM connection before use
export async function exampleTestConnection() {
  try {
    console.log('Testing LLM connection...');
    const provider = await getCurrentProvider();
    const isConnected = await testLLMConnection(provider);

    if (isConnected) {
      console.log('✅ LLM connection successful');
    } else {
      console.log('❌ LLM connection failed');
    }

    return isConnected;
  } catch (error) {
    console.error('Connection test error:', error);
    return false;
  }
}

// Example 5: Use custom LLM provider
export async function exampleCustomProvider() {
  const customProvider: LLMProvider = {
    name: 'openai',
    apiKey: 'your-api-key',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4',
  };

  const transcript = 'Sample meeting transcript...';

  try {
    const summary = await generateMeetingSummary(transcript, customProvider);
    console.log('Summary with custom provider:', summary);
    return summary;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Example 6: Estimate costs before processing
export async function exampleEstimateCost() {
  const transcript = 'This is a sample transcript...'.repeat(100); // Longer transcript

  const estimatedTokens = estimateTokens(transcript);
  const estimatedCost = estimateCost(estimatedTokens, 'gpt-4');

  console.log(`Estimated tokens: ${estimatedTokens}`);
  console.log(`Estimated cost: $${estimatedCost.toFixed(4)}`);

  // Only proceed if cost is acceptable
  if (estimatedCost < 0.50) {
    const summary = await generateMeetingSummary(transcript);
    return summary;
  } else {
    console.warn('Cost too high, skipping...');
    return null;
  }
}

// Example 7: Batch processing multiple transcripts
export async function exampleBatchProcessing(transcripts: string[]) {
  const summaries = [];

  for (let i = 0; i < transcripts.length; i++) {
    console.log(`Processing transcript ${i + 1}/${transcripts.length}...`);

    try {
      const summary = await generateMeetingSummary(transcripts[i]);
      summaries.push(summary);

      // Add delay to avoid rate limiting
      if (i < transcripts.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    } catch (error) {
      console.error(`Error processing transcript ${i + 1}:`, error);
      summaries.push(null);
    }
  }

  return summaries;
}

// Example 8: Error handling and retries
export async function exampleWithRetry(transcript: string, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);
      const summary = await generateMeetingSummary(transcript);
      console.log('Success!');
      return summary;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      lastError = error;

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`Waiting ${delay / 1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All retries failed
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError}`);
}

// Example 9: Using with React Native component
export function useLLMSummary() {
  const [loading, setLoading] = React.useState(false);
  const [summary, setSummary] = React.useState(null);
  const [error, setError] = React.useState(null);

  const generateSummary = async (transcript: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await generateMeetingSummary(transcript);
      setSummary(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return {loading, summary, error, generateSummary};
}

// Example 10: Complete workflow
export async function exampleCompleteWorkflow(audioPath: string) {
  console.log('Starting complete workflow...');

  // Step 1: Test connection
  console.log('1. Testing LLM connection...');
  const isConnected = await exampleTestConnection();
  if (!isConnected) {
    throw new Error('LLM not configured or connection failed');
  }

  // Step 2: Transcribe audio (placeholder - would use Whisper API)
  console.log('2. Transcribing audio...');
  const transcript = 'Mock transcript from audio file...';

  // Step 3: Estimate cost
  console.log('3. Estimating cost...');
  const tokens = estimateTokens(transcript);
  const cost = estimateCost(tokens);
  console.log(`Estimated cost: $${cost.toFixed(4)}`);

  // Step 4: Generate summary
  console.log('4. Generating summary...');
  const summary = await generateMeetingSummary(transcript);

  // Step 5: Return complete result
  return {
    transcript,
    summary,
    metadata: {
      audioPath,
      tokens,
      estimatedCost: cost,
      timestamp: new Date().toISOString(),
    },
  };
}
