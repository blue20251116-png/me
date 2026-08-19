import { callOpenAiJson } from '../../lib/openAiJsonClient.js';
export async function planScenes({hook,script,ending,estimatedDuration=25}){
  return callOpenAiJson({
    system:'Break a YouTube Shorts narration into 5-8 stock-footage-friendly visual scenes. Search queries must be concise English phrases suitable for Pexels. Use footage only. Return JSON only.',
    user:`HOOK:${hook}\nSCRIPT:${script}\nENDING:${ending}\nTOTAL:${estimatedDuration}s\nReturn {"scenes":[{"scene_order":1,"narration":"...","duration":3,"visual_query":"...","visual_type":"footage","transition":"cut","emphasis":[]}]} with 5-8 scenes. No photo or text_only scenes.`
  });
}
