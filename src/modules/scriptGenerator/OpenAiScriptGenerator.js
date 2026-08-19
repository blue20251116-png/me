import { callOpenAiJson } from '../../lib/openAiJsonClient.js';
export async function generateScript({topic,sourceAnalysis=null,durationTarget=25}){
  return callOpenAiJson({
    system:'Write concise, natural English YouTube Shorts scripts for global audiences. No greetings. Hook in the first 1-2 seconds. Avoid unsupported factual claims. Return JSON only.',
    user:`TOPIC: ${topic}\nSOURCE ANALYSIS: ${JSON.stringify(sourceAnalysis)}\nTARGET: about ${durationTarget} seconds\nReturn exactly this JSON shape: {"hook":"...","script":"...","ending":"...","estimated_duration":25,"hook_type":"statement","ending_type":"question","caption_keywords":[]}`
  });
}
