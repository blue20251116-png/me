import { getSecret } from '../../lib/settingsStore.js';
import { withRetry } from '../../lib/retry.js';

export async function searchLens(imageUrl){
  const apiKey=getSecret('SERPAPI_API_KEY');
  if(!apiKey) throw new Error('SERPAPI_API_KEY가 설정되어 있지 않습니다.');
  if(!/^https?:\/\//i.test(String(imageUrl||''))) throw new Error('Google Lens에는 외부에서 접근 가능한 이미지 URL이 필요합니다. PUBLIC_BASE_URL을 설정해 주세요.');
  return withRetry(async()=>{
    const u=new URL('https://serpapi.com/search.json');
    u.searchParams.set('engine','google_lens');
    u.searchParams.set('url',imageUrl);
    u.searchParams.set('api_key',apiKey);
    const r=await fetch(u,{signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error(`SerpApi Lens 오류 (${r.status}): ${await r.text().catch(()=> '')}`);
    const data=await r.json();
    const visualMatches=(data.visual_matches||[]).slice(0,15).map(x=>({title:x.title||'',link:x.link||'',source:x.source||'',thumbnail:x.thumbnail||''}));
    const products=(data.products||[]).slice(0,15).map(x=>({title:x.title||'',link:x.link||'',source:x.source||'',price:x.price||'',thumbnail:x.thumbnail||''}));
    return {visualMatches,products,raw:data};
  },{attempts:2,label:'serpapi-lens'});
}
