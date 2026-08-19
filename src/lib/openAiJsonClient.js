import { getSecret } from './settingsStore.js';
function extractOutputText(data){
  if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text;
  const parts=[];
  for(const item of data?.output||[]){for(const c of item?.content||[]){if(typeof c?.text==='string')parts.push(c.text);}}
  return parts.join('\n');
}
function parseJsonLoose(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(raw)}catch{}
  const start=raw.indexOf('{'),end=raw.lastIndexOf('}');
  if(start>=0&&end>start)return JSON.parse(raw.slice(start,end+1));
  throw new Error('OpenAI 응답 JSON 파싱 실패');
}
export async function callOpenAiJson({system,user,model=process.env.OPENAI_TEXT_MODEL||'gpt-5-mini'}){
  const apiKey=getSecret('OPENAI_API_KEY');
  if(!apiKey)throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다. 설정 화면에서 입력해 주세요.');
  const res=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,instructions:system,input:user})});
  if(!res.ok)throw new Error(`OpenAI text 오류 (${res.status}): ${await res.text().catch(()=> '')}`);
  return parseJsonLoose(extractOutputText(await res.json()));
}
