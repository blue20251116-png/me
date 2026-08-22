import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';
import { getSecret } from '../../lib/settingsStore.js';
import { callOpenAiJson } from '../../lib/openAiJsonClient.js';

const UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

function decodeHtml(s=''){return String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function stripTags(s=''){return decodeHtml(String(s).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function normalizeText(s=''){return String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
function tokens(s=''){return new Set(normalizeText(s).split(' ').filter(x=>x.length>1));}
function scoreText(query,title){const a=tokens(query),b=tokens(title);if(!a.size||!b.size)return 0;const common=[...a].filter(x=>b.has(x)).length;return Math.round(common/Math.max(1,Math.min(a.size,b.size))*100);}
function normalizeUrl(value=''){
  let s=decodeHtml(String(value||'').trim()).replace(/^['"]+|['"]+$/g,'');
  if(!s)return '';
  s=s.replace(/\\u0026/g,'&').replace(/\\\//g,'/');
  if(/^\/\//.test(s))s=`https:${s}`;
  else if(!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)&&/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(s))s=`https://${s}`;
  try{return new URL(s).toString();}catch{return s;}
}
function collectUrls(obj,out=[],depth=0){
  if(depth>7||obj==null)return out;
  if(typeof obj==='string'){
    const raw=String(obj).replace(/\\u0026/g,'&').replace(/\\\//g,'/');
    for(const m of raw.matchAll(/(?:https?:\/\/|\/\/)?(?:link\.inpock\.co\.kr|moneying\.biz|m\.site\.naver\.com|[^\s"'<>]+\.coupang\.com)\/[^\s"'<>]*/gi)){
      const u=normalizeUrl(m[0]);if(u)out.push(u);
    }
    for(const m of raw.matchAll(/https?:\/\/[^\s"'<>]+/g)){const u=normalizeUrl(m[0]);if(u)out.push(u);}
    return out;
  }
  if(Array.isArray(obj)){for(const v of obj)collectUrls(v,out,depth+1);return out;}
  if(typeof obj==='object')for(const v of Object.values(obj))collectUrls(v,out,depth+1);
  return out;
}
export function findInpockUrlInMetadata(metadata){
  return collectUrls(metadata).find(u=>/(?:link\.inpock\.co\.kr|moneying\.biz\/link\/gooditem)/i.test(u))||'';
}

export async function detectInpockProfileUrl(username,metadata={}){
  const fromMeta=normalizeUrl(findInpockUrlInMetadata(metadata));if(fromMeta)return fromMeta;
  const user=String(username||'').replace(/^@/,'').trim();if(!user)return '';
  try{
    const r=await fetch(`https://www.instagram.com/${encodeURIComponent(user)}/`,{headers:{'user-agent':UA,'accept-language':'ko-KR,ko;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(15000)});
    const html=await r.text();
    const raw=html.replace(/\\u0026/g,'&').replace(/\\\//g,'/');
    const m=raw.match(/(?:https?:\/\/)?(?:link\.inpock\.co\.kr|moneying\.biz\/link\/gooditem)[A-Za-z0-9_?=&%./:-]*/i);
    return normalizeUrl(m?.[0]||'');
  }catch{return '';}
}

export async function transcribeVideoAudio({postId,videoPath}){
  const apiKey=getSecret('OPENAI_API_KEY');if(!apiKey)throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.');
  const audioPath=storagePath('uploads',`${postId}-source-audio.mp3`);
  const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',videoPath,'-vn','-ac','1','-ar','16000','-b:a','64k',audioPath],{encoding:'utf8',timeout:60000});
  if(ff.status!==0||!fs.existsSync(audioPath))throw new Error(`원본 음성 추출 실패: ${String(ff.stderr||'').slice(-500)}`);
  const form=new FormData();
  form.append('model','gpt-4o-mini-transcribe');
  form.append('response_format','json');
  form.append('file',new Blob([fs.readFileSync(audioPath)],{type:'audio/mpeg'}),`${postId}.mp3`);
  const r=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form,signal:AbortSignal.timeout(90000)});
  const text=await r.text();if(!r.ok)throw new Error(`OpenAI transcription 오류 (${r.status}): ${text.slice(0,500)}`);
  try{return String(JSON.parse(text)?.text||'').trim();}catch{return text.trim();}
}

export async function rewriteInstagramScript({caption='',transcript='',productName=''}){
  const result=await callOpenAiJson({
    system:'너는 짧은 한국어 쇼핑 릴스 대본 작가다. 원문의 사실과 제품 사용 맥락만 참고하고 문장 구조와 표현은 새로 쓴다. 과장·허위 표현을 만들지 않는다. 다른 제작자의 고유 문구를 그대로 복제하지 않는다. JSON만 반환한다.',
    user:`Instagram Reel 본문:\n${caption}\n\n원본 음성 전사:\n${transcript}\n\n확정 또는 후보 상품:\n${productName}\n\n15~25초 분량의 자연스러운 한국어 대본으로 다시 작성해라. 반환 JSON: {"hook":"","body":"","ending":"","fullScript":"","searchKeywords":[""]}`
  });
  if(!result.fullScript)result.fullScript=[result.hook,result.body,result.ending].filter(Boolean).join(' ');
  return result;
}

async function fetchInpockCatalog(inpockUrl){
  const normalizedInpockUrl=normalizeUrl(inpockUrl);
  if(!normalizedInpockUrl)return [];
  const r=await fetch(normalizedInpockUrl,{headers:{'user-agent':UA,'accept-language':'ko-KR,ko;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  const html=await r.text();if(!r.ok)throw new Error(`인포크 페이지 오류 (${r.status})`);
  const items=[];
  const anchorRe=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for(const m of html.matchAll(anchorRe)){
    let href=normalizeUrl(decodeHtml(m[1]));const title=stripTags(m[2]);
    try{href=new URL(href,r.url).toString();}catch{}
    if(/^https?:\/\//i.test(href)&&title)items.push({title,href});
  }
  const raw=html.replace(/\\u0026/g,'&').replace(/\\\//g,'/');
  const urls=[...raw.matchAll(/(?:https?:\/\/|\/\/)?(?:[^\s"'<>]*coupang[^\s"'<>]*|link\.inpock\.co\.kr\/[^\s"'<>]*|moneying\.biz\/[^\s"'<>]*)/gi)].map(m=>normalizeUrl(m[0])).filter(Boolean);
  for(const href of urls){if(/coupang|link\.coupang|inpock|moneying/i.test(href))items.push({title:'',href});}
  const seen=new Set();return items.filter(x=>{const k=`${x.title}|${x.href}`;if(seen.has(k))return false;seen.add(k);return true;});
}

async function resolveFinalUrl(url){
  const normalized=normalizeUrl(url);if(!normalized)return '';
  try{const r=await fetch(normalized,{method:'GET',headers:{'user-agent':UA},redirect:'follow',signal:AbortSignal.timeout(15000)});return r.url||normalized;}catch{return normalized;}
}
function isCanonicalCoupangProductUrl(url=''){
  try{
    const u=new URL(normalizeUrl(url));
    return /(^|\.)coupang\.com$/i.test(u.hostname)&&/^\/vp\/products\/\d+/i.test(u.pathname);
  }catch{return false;}
}

export async function matchInpockProduct({inpockUrl,caption='',transcript='',rewrittenScript=null}){
  const normalizedInpockUrl=normalizeUrl(inpockUrl);if(!normalizedInpockUrl)return null;
  const catalog=await fetchInpockCatalog(normalizedInpockUrl);
  if(!catalog.length)return null;
  const explicit=[caption,transcript,...(rewrittenScript?.searchKeywords||[])].filter(Boolean).join(' ');
  const ranked=catalog.map(x=>({...x,score:scoreText(explicit,x.title)})).sort((a,b)=>b.score-a.score);
  let best=ranked.find(x=>x.score>=35)||ranked.find(x=>/coupang|link\.coupang/i.test(x.href));
  if(!best)return null;
  const finalUrl=await resolveFinalUrl(best.href);
  // Only canonical product pages are sent directly to Coupang deeplink API.
  // Tracking/app/redirect URLs fall back to normal Coupang product search in discovery.js.
  const isCoupang=isCanonicalCoupangProductUrl(finalUrl);
  return {...best,finalUrl,isCoupang,catalogCount:catalog.length};
}
