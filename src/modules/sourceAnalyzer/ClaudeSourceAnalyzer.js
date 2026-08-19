import { callClaudeJson } from '../../lib/claudeClient.js';
export async function analyzeSource({ sourceType, rawText }) {
  return callClaudeJson({
    system: 'You analyze source material for short-form English video creation. Return JSON only.',
    user: `Analyze this source for a global English YouTube Short.\nSOURCE_TYPE=${sourceType}\nSOURCE:\n${rawText}\nReturn JSON: {"language":"en","category":"...","topic":"...","summary":"...","interesting_points":[],"viral_angle":"...","recommended_duration":25,"recommended_voice":true,"confidence":0.9}`
  });
}
