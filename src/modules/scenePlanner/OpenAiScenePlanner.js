import { callOpenAiJson } from '../../lib/openAiJsonClient.js';

export async function planScenes({topic='',hook,script,ending,estimatedDuration=25}){
  return callOpenAiJson({
    system:[
      'Break an English YouTube Shorts narration into 5-8 stock-footage-friendly visual scenes.',
      'Return JSON only and use footage only.',
      'Plan the video as ONE coherent visual story, not as unrelated keyword illustrations.',
      'Every scene must consider: the overall topic/story context, the scene role in the narrative, and continuity with the previous/next scene.',
      'Keep recurring location, subject, activity, camera mood, and color/tone consistent whenever the narration allows it.',
      'Prefer one believable setting and a small recurring set of subjects instead of jumping to unrelated people/places.',
      'visual_query must describe the full visual situation in natural English, not a single noun or isolated object.',
      'Include a shared continuity anchor in neighboring queries when appropriate, for example: same kitchen, same bathroom sink, same person, household water use, close-up documentary style.',
      'Do not invent a new person, celebration, location, or activity unless the narration actually requires it.',
      'Queries must be concise enough for Pexels but specific enough to preserve story continuity.'
    ].join(' '),
    user:`TOPIC:${topic}\nHOOK:${hook}\nSCRIPT:${script}\nENDING:${ending}\nTOTAL:${estimatedDuration}s\n\nReturn exactly this shape:\n{"story_context":{"setting":"...","primary_subject":"...","visual_tone":"...","continuity_anchor":"..."},"scenes":[{"scene_order":1,"scene_role":"hook|setup|development|solution|ending","narration":"...","duration":3,"visual_query":"...","continuity_keywords":["..."],"visual_type":"footage","transition":"cut","emphasis":[]}]}\nRules: 5-8 scenes; no photo/text_only; each visual_query must combine overall story context + this scene action + continuity anchor. Avoid one-word/object-only queries.`
  });
}
