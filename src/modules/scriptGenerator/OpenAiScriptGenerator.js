import { callOpenAiJson } from '../../lib/openAiJsonClient.js';

const MAX_ATTEMPTS = 3;

function hasNonAsciiText(value=''){
  // Allow ordinary English punctuation/whitespace, but reject non-ASCII script characters.
  return /[^\x00-\x7F]/.test(String(value||''));
}

async function auditEnglishOnly(result){
  const text=[result?.hook,result?.script,result?.ending].filter(Boolean).join(' ');
  if(!text.trim()) return {ok:false,reason:'empty script'};
  if(hasNonAsciiText(text)) return {ok:false,reason:'non-ASCII characters detected'};

  // Romanized non-English phrases (e.g. "pani ki barbadi") are ASCII, so a character
  // check alone cannot catch them. Run a lightweight language audit before accepting.
  const audit=await callOpenAiJson({
    system:'You are a strict language validator. Return JSON only. Determine whether every meaningful word and phrase in the supplied narration is natural English. Romanized Hindi, Spanish, Korean, or any other non-English wording counts as NOT English. Proper nouns and universally used brand names are allowed.',
    user:`TEXT: ${text}\nReturn exactly {"english_only":true,"reason":""}. Set english_only=false if any non-English word or phrase is present.`
  });
  return {ok:audit?.english_only===true,reason:String(audit?.reason||'language audit failed')};
}

export async function generateScript({topic,sourceAnalysis=null,durationTarget=25}){
  let lastReason='';
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    const result=await callOpenAiJson({
      system:[
        'Write concise, natural English YouTube Shorts scripts for global audiences.',
        'ABSOLUTE LANGUAGE RULE: write in English only.',
        'Do not include Hindi, Hinglish, romanized Hindi, Korean, Spanish, or words/phrases from any other language for any reason, even if they appear in the topic or source material.',
        'If the source contains a foreign-language phrase, translate its meaning into natural English instead of copying or transliterating it.',
        'Use ASCII English wording wherever possible; ordinary English punctuation is allowed.',
        'No greetings. Hook in the first 1-2 seconds. Avoid unsupported factual claims.',
        'Return JSON only.'
      ].join(' '),
      user:`TOPIC: ${topic}\nSOURCE ANALYSIS: ${JSON.stringify(sourceAnalysis)}\nTARGET: about ${durationTarget} seconds\n${lastReason?`PREVIOUS OUTPUT WAS REJECTED: ${lastReason}. Regenerate from scratch in English only.\n`:''}Return exactly this JSON shape: {"hook":"...","script":"...","ending":"...","estimated_duration":25,"hook_type":"statement","ending_type":"question","caption_keywords":[]}`
    });

    const audit=await auditEnglishOnly(result);
    if(audit.ok) return result;
    lastReason=audit.reason||'English-only validation failed';
    console.warn(`[ScriptGenerator][ENGLISH VALIDATION] retry ${attempt}/${MAX_ATTEMPTS}: ${lastReason}`);
  }
  throw new Error(`ScriptGenerator English-only validation failed after ${MAX_ATTEMPTS} attempts: ${lastReason}`);
}
