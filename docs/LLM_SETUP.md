# LLM Setup Guide for Recaply

This guide will help you configure the Large Language Model (LLM) integration for generating AI-powered meeting summaries.

## Overview

Recaply uses LLMs to:
- Generate concise meeting summaries
- Extract key points and decisions
- Identify action items with assignees
- Analyze meeting sentiment

## Supported Providers

### 1. OpenAI (GPT-4, GPT-3.5)
**Best for**: High-quality summaries, reliable performance
**Cost**: ~$0.04 per minute of audio
**Models**: 
- `gpt-4` - Most accurate (recommended)
- `gpt-4-turbo` - Faster, good quality
- `gpt-3.5-turbo` - Cheapest option

**Setup**:
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Copy the key (starts with `sk-`)
4. In Recaply: Settings → LLM Configuration
5. Select "OpenAI (GPT)" as provider
6. Paste your API key
7. Choose your model
8. Test connection

### 2. Anthropic (Claude)
**Best for**: Longer transcripts, nuanced understanding
**Cost**: ~$0.04 per minute of audio
**Models**:
- `claude-3-opus-20240229` - Most capable
- `claude-3-sonnet-20240229` - Balanced (recommended)
- `claude-3-haiku-20240307` - Fastest, cheapest

**Setup**:
1. Go to https://console.anthropic.com/settings/keys
2. Create a new API key
3. Copy the key (starts with `sk-ant-`)
4. In Recaply: Settings → LLM Configuration
5. Select "Anthropic (Claude)" as provider
6. Paste your API key
7. Choose your model
8. Test connection

### 3. Groq (Fast Inference)
**Best for**: Speed, cost-effective
**Cost**: ~$0.001 per minute (very cheap!)
**Models**:
- `mixtral-8x7b-32768` - High quality, fast
- `llama2-70b-4096` - Good for summaries

**Setup**:
1. Go to https://console.groq.com/keys
2. Create a new API key
3. Copy the key (starts with `gsk_`)
4. In Recaply: Settings → LLM Configuration
5. Select "Groq (Fast)" as provider
6. Paste your API key
7. Choose your model
8. Test connection

### 4. Local LLM (Ollama/LM Studio)
**Best for**: Privacy, no API costs, offline use
**Cost**: Free (requires local hardware)
**Models**: Any model you have installed locally

**Setup with Ollama**:
1. Install Ollama: https://ollama.ai/download
2. Pull a model: `ollama pull llama2`
3. Start Ollama server
4. In Recaply: Settings → LLM Configuration
5. Select "Local/Custom" as provider
6. Set API URL: `http://localhost:11434/v1/chat/completions`
7. Enter model name (e.g., `llama2`)
8. Test connection

**Setup with LM Studio**:
1. Install LM Studio: https://lmstudio.ai/
2. Download a model (recommend: Mistral 7B or Llama 2)
3. Start local server in LM Studio
4. Note the server URL (usually `http://localhost:1234/v1/chat/completions`)
5. In Recaply: Settings → LLM Configuration
6. Select "Local/Custom" as provider
7. Set API URL from step 4
8. Enter model name
9. Test connection

## Configuration Options

### Temperature (0.0 - 1.0)
- **0.0 - 0.3**: Very focused, deterministic output (recommended for business meetings)
- **0.4 - 0.7**: Balanced creativity and consistency (default: 0.7)
- **0.8 - 1.0**: More creative, varied output

### Max Tokens
- **500-1000**: Brief summaries
- **1500-2000**: Standard summaries (recommended, default: 2000)
- **3000+**: Detailed summaries with extensive context

## Environment Variables

For advanced users, you can set default LLM configuration via `.env` file:

```bash
# LLM Configuration
LLM_API_KEY=your_api_key_here
LLM_API_URL=https://api.openai.com/v1/chat/completions
LLM_MODEL=gpt-4

# Whisper Configuration (for transcription)
WHISPER_API_KEY=your_whisper_key_here
WHISPER_API_URL=https://api.openai.com/v1/audio/transcriptions
```

## Cost Estimates

Based on average 10-minute meeting:

| Provider | Model | Cost per Meeting | Cost per Month (20 meetings) |
|----------|-------|------------------|------------------------------|
| OpenAI | GPT-4 | ~$0.40 | ~$8.00 |
| OpenAI | GPT-3.5 | ~$0.05 | ~$1.00 |
| Anthropic | Claude Opus | ~$0.45 | ~$9.00 |
| Anthropic | Claude Sonnet | ~$0.15 | ~$3.00 |
| Groq | Mixtral | ~$0.01 | ~$0.20 |
| Local | Any | $0 | $0 |

*Note: Transcription costs are separate (Whisper API)*

## Testing Your Configuration

After setting up:

1. Go to Settings → LLM Configuration
2. Click "Test Connection"
3. Wait for response
4. ✅ Success = Ready to use
5. ❌ Failed = Check API key and URL

## Troubleshooting

### "Connection Failed"
- Check internet connection
- Verify API key is correct
- Ensure API URL is properly formatted
- Check if you have API credits/quota remaining

### "Invalid API Key"
- Verify key format matches provider
- OpenAI keys start with `sk-`
- Anthropic keys start with `sk-ant-`
- Groq keys start with `gsk_`

### "Rate Limited"
- You've hit API rate limits
- Wait a few minutes
- Upgrade your API plan
- Switch to different provider

### "Poor Summary Quality"
- Try a more capable model (e.g., GPT-4 instead of GPT-3.5)
- Adjust temperature (lower for more focused)
- Ensure transcript quality is good
- Increase max tokens for longer summaries

### Local LLM Not Connecting
- Ensure Ollama/LM Studio is running
- Check server URL is correct
- Try `http://localhost:11434/v1/chat/completions` for Ollama
- Verify firewall isn't blocking local connections

## Privacy Considerations

### Cloud Providers (OpenAI, Anthropic, Groq)
- Your meeting transcripts are sent to their servers
- Data is processed according to their privacy policies
- OpenAI/Anthropic: Data not used for training (per their enterprise policies)
- Connection is encrypted (HTTPS)

### Local LLM
- ✅ Complete privacy - data never leaves your device
- ✅ Works offline
- ✅ No per-request costs
- ⚠️ Requires decent hardware (8GB+ RAM recommended)
- ⚠️ May be slower than cloud APIs
- ⚠️ Quality depends on model size

## Recommendations

**For Best Quality**: OpenAI GPT-4 or Anthropic Claude Opus
**For Best Value**: Groq or OpenAI GPT-3.5
**For Privacy**: Local LLM (Ollama with Llama 2 or Mistral)
**For Speed**: Groq or Claude Haiku
**For Beginners**: OpenAI GPT-4 (easiest setup, most reliable)

## Getting Help

If you need assistance:
- Email: support@recaply.app
- Check API provider status pages
- Review API provider documentation
- Ensure you have sufficient API credits

## Next Steps

After configuring LLM:
1. Record a test meeting
2. Generate transcript
3. Click "Generate Summary"
4. Review the AI-generated summary
5. Adjust settings if needed (temperature, model, etc.)

Enjoy your AI-powered meeting summaries! 🚀
