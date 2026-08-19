import { callClaudeJson } from '../../lib/claudeClient.js';
export async function generateScript({ topic, sourceAnalysis = null, durationTarget = 25 }) {
  return callClaudeJson({
    system: 'Write concise, natural English YouTube Shorts scripts. No greetings. Hook in first 1-2 seconds. Return JSON only.',
    user: `TOPIC: ${topic}\nSOURCE ANALYSIS: ${JSON.stringify(sourceAnalysis)}\nTarget duration: ${durationTarget}s\nReturn {"hook":"...","script":"...","ending":"...","estimated_duration":25,"hook_type":"statement","ending_type":"question","caption_keywords":[]}`
  });
}
