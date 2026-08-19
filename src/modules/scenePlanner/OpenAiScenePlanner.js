import { callOpenAiJson } from '../../lib/openAiJsonClient.js';

const MAX_ATTEMPTS=2;

async function auditPlan(topic,plan){
  const scenes=Array.isArray(plan?.scenes)?plan.scenes:[];
  if(scenes.length<5) return {ok:false,reason:'fewer than 5 scenes'};
  if(scenes.some(s=>String(s.visual_query||'').trim().split(/\s+/).length<4)) return {ok:false,reason:'visual query too short/object-only'};
  const audit=await callOpenAiJson({
    system:'You are a strict visual continuity reviewer for stock-footage YouTube Shorts. Return JSON only. Reject plans that jump between unrelated places, people, celebrations, activities, or visual moods without narration requiring the change. Neighboring scenes should feel like one coherent story and share setting/subject/tone anchors where possible.',
    user:`TOPIC:${topic}\nPLAN:${JSON.stringify(plan)}\nReturn exactly {"continuous":true,"reason":""}. Set continuous=false if the scenes look like unrelated keyword illustrations rather than one coherent visual sequence.`
  });
  return {ok:audit?.continuous===true,reason:String(audit?.reason||'continuity audit failed')};
}

export async function planScenes({topic='',hook,script,ending,estimatedDuration=25}){
  let lastReason='';
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const plan=await callOpenAiJson({
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
      user:`TOPIC:${topic}\nHOOK:${hook}\nSCRIPT:${script}\nENDING:${ending}\nTOTAL:${estimatedDuration}s\n${lastReason?`PREVIOUS PLAN WAS REJECTED: ${lastReason}. Re-plan with stronger continuity.\n`:''}\nReturn exactly this shape:\n{"story_context":{"setting":"...","primary_subject":"...","visual_tone":"...","continuity_anchor":"..."},"scenes":[{"scene_order":1,"scene_role":"hook|setup|development|solution|ending","narration":"...","duration":3,"visual_query":"...","continuity_keywords":["..."],"visual_type":"footage","transition":"cut","emphasis":[]}]}\nRules: 5-8 scenes; no photo/text_only; each visual_query must combine overall story context + this scene action + continuity anchor. Avoid one-word/object-only queries.`
    });
    const audit=await auditPlan(topic,plan);
    if(audit.ok) return plan;
    lastReason=audit.reason;
    console.warn(`[ScenePlanner][CONTINUITY VALIDATION] retry ${attempt}/${MAX_ATTEMPTS}: ${lastReason}`);
  }
  throw new Error(`ScenePlanner continuity validation failed after ${MAX_ATTEMPTS} attempts: ${lastReason}`);
}
