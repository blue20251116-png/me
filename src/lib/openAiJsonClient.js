import { getSecret } from './settingsStore.js';
function parseJsonLoose(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(raw)}catch{}
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start)return JSON.parse(raw.slice(start,end+1));
  throw new Error('Gemini 응답 JSON 파싱 실패');
}
function extractGeminiText(data){
  return (data?.candidates?.[0]?.content?.parts||[]).map(p=>p?.text||'').join('\n').trim();
}
export async function callOpenAiJson({system,user,model=process.env.GEMINI_TEXT_MODEL||'gemini-3.5-flash-lite'}){
  const apiKey=getSecret('GEMINI_API_KEY');
  if(!apiKey)throw new Error('GEMINI_API_KEY가 설정되어 있지 않습니다. 설정 화면에서 입력해 주세요.');
  const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({systemInstruction:{parts:[{text:String(system||'')}]},contents:[{role:'user',parts:[{text:String(user||'')}]}],generationConfig:{responseMimeType:'application/json',temperature:0.7}})});
  if(!res.ok)throw new Error(`Gemini text 오류 (${res.status}): ${await res.text().catch(()=> '')}`);
  return parseJsonLoose(extractGeminiText(await res.json()));
}
