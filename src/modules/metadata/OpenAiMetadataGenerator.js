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
      'You create metadata for English YouTube Shorts.',
      'Return JSON only.',
      'The metadata must accurately match the video content.',
      'Avoid deceptive claims, fake urgency, and generic hashtag spam.',
      'Generate five title candidates, score them, then select the best one.'
    ].join(' '),
    user:`TOPIC: ${topic}\nHOOK: ${hook}\nSCRIPT: ${script}\nENDING: ${ending}\n\nReturn exactly this shape:\n{"title":"...","description":"...","hashtags":["#shorts","#topic"],"title_candidates":[{"title":"...","score":92,"reason":"..."}]}\nRules: title in natural English, concise and curiosity-driven, ideally under 70 characters; description 1-3 short sentences; hashtags 3-6 total including #shorts; use category/topic-specific hashtags over #viral/#fyp.`
  });

  const candidates=Array.isArray(result.title_candidates)?result.title_candidates:[];
  let title=String(result.title||'').trim();
  if(!title && candidates.length){
    title=String([...candidates].sort((a,b)=>Number(b.score||0)-Number(a.score||0))[0]?.title||'').trim();
  }
  if(!title) title=String(topic||'YouTube Short').slice(0,90);

  return {
    title:title.slice(0,100),
    description:String(result.description||'').trim().slice(0,5000),
    hashtags:cleanHashtags(result.hashtags),
    title_candidates:candidates.slice(0,5)
  };
}
