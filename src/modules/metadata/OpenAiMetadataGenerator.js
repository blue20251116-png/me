import { callOpenAiJson } from '../../lib/openAiJsonClient.js';

function cleanHashtags(items=[]){
  const out=[];
  for(const raw of items||[]){
    let s=String(raw||'').trim();
    if(!s) continue;
    if(!s.startsWith('#')) s='#'+s;
    s=s.replace(/\s+/g,'');
    if(/^#[\p{L}\p{N}_]+$/u.test(s) && !out.includes(s)) out.push(s);
    if(out.length>=6) break;
  }
  if(!out.some(x=>x.toLowerCase()==='#shorts')) out.unshift('#shorts');
  return out.slice(0,6);
}

export async function generateYoutubeMetadata({topic,hook,script,ending}){
  const result=await callOpenAiJson({
    system:[
      'You create upload-ready metadata and opening hooks for English YouTube Shorts.',
      'Return JSON only.',
      'Everything must accurately match the video content.',
      'Avoid deceptive claims, fake urgency, and generic hashtag spam.',
      'The opening hook must work visually in the first 1-2 seconds on a vertical phone screen.',
      'Generate five title candidates, score them, then select the best one.'
    ].join(' '),
    user:`TOPIC: ${topic}\nHOOK: ${hook}\nSCRIPT: ${script}\nENDING: ${ending}\n\nReturn exactly this shape:\n{"title":"...","description":"...","hashtags":["#shorts","#topic"],"hook_text":"...","thumbnail_text":"...","title_candidates":[{"title":"...","score":92,"reason":"..."}]}\nRules:\n- title: natural English, concise and curiosity-driven, ideally under 70 characters.\n- description: 1-3 short sentences.\n- hashtags: 3-6 total including #shorts; prefer category/topic-specific tags over #viral/#fyp.\n- hook_text: 3-8 English words, immediately understandable, strong curiosity, suitable as the first 1-2 second on-screen text. Do not invent facts.\n- thumbnail_text: 2-6 English words, punchier than the title, readable at phone size, no generic CLICK/WATCH THIS wording.\n- hook_text and thumbnail_text should complement the title rather than simply repeat it.`
  });

  const candidates=Array.isArray(result.title_candidates)?result.title_candidates:[];
  let title=String(result.title||'').trim();
  if(!title && candidates.length){
    title=String([...candidates].sort((a,b)=>Number(b.score||0)-Number(a.score||0))[0]?.title||'').trim();
  }
  if(!title) title=String(topic||'YouTube Short').slice(0,90);

  const hookText=String(result.hook_text||hook||'').trim().replace(/\s+/g,' ').slice(0,100);
  const thumbnailText=String(result.thumbnail_text||hookText||title).trim().replace(/\s+/g,' ').slice(0,80);

  return {
    title:title.slice(0,100),
    description:String(result.description||'').trim().slice(0,5000),
    hashtags:cleanHashtags(result.hashtags),
    hook_text:hookText,
    thumbnail_text:thumbnailText,
    title_candidates:candidates.slice(0,5)
  };
}
