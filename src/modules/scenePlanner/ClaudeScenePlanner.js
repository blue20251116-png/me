import { callClaudeJson } from '../../lib/claudeClient.js';
export async function planScenes({ hook, script, ending, estimatedDuration = 25 }) {
  return callClaudeJson({
    system: 'Break a Shorts narration into visual scenes. Generate stock-footage-friendly search queries. Return JSON only.',
    user: `HOOK:${hook}\nSCRIPT:${script}\nENDING:${ending}\nTOTAL:${estimatedDuration}s\nReturn {"scenes":[{"scene_order":1,"narration":"...","duration":3,"visual_query":"...","visual_type":"footage","transition":"cut","emphasis":[]}]} with 5-8 scenes.`
  });
}
