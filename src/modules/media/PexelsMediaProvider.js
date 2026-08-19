import { getSecret } from '../../lib/settingsStore.js';
const PEXELS_SEARCH_URL = 'https://api.pexels.com/videos/search';
const MIN_DURATION = 2;
const MAX_DURATION = 60;
function scoreCandidate(video, sceneDuration) {
  let score = 0;
  const files = video.video_files || [];
  if (files.some((f) => f.height > f.width) || video.height > video.width) score += 0.3;
  const maxHeight = Math.max(0, ...files.map(f=>f.height||0));
  if (maxHeight >= 1080) score += 0.2; else if (maxHeight >= 720) score += 0.1;
  const d = video.duration || 0;
  if (d < MIN_DURATION || d > MAX_DURATION) return 0;
  score += d >= sceneDuration ? 0.3 : 0.3 * d / sceneDuration;
  score += Math.max(0, 0.2 - (video._rank || 0) * 0.04);
  return Math.round(score * 1000) / 1000;
}
function chooseFile(files=[]) {
  const portrait = files.filter(f=>f.height>f.width).sort((a,b)=>Math.abs((a.width||0)-1080)+Math.abs((a.height||0)-1920) - (Math.abs((b.width||0)-1080)+Math.abs((b.height||0)-1920)));
  const pool = portrait.length ? portrait : files;
  return pool.find(f=>(f.height||0)>=720) || pool[0] || null;
}
export async function searchPexels(query, sceneDuration=3, options={}) {
  const apiKey = getSecret('PEXELS_API_KEY');
  if (!apiKey) throw new Error('PEXELS_API_KEY가 설정되어 있지 않습니다. 설정 화면에서 입력해 주세요.');
  const url = `${PEXELS_SEARCH_URL}?query=${encodeURIComponent(query)}&orientation=portrait&per_page=${options.maxResults||8}`;
  const res = await fetch(url,{headers:{Authorization:apiKey}});
  if(!res.ok) throw new Error(`Pexels API 오류 (${res.status})`);
  const data=await res.json();
  const candidates=(data.videos||[]).map((v,i)=>{v._rank=i; const f=chooseFile(v.video_files); return f?{externalId:String(v.id),provider:'pexels',previewUrl:v.image,downloadUrl:f.link,duration:v.duration,width:f.width,height:f.height,licenseType:'Pexels License',score:scoreCandidate(v,sceneDuration)}:null;}).filter(Boolean).filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
  return {candidates,fallbackNeeded:candidates.length===0};
}
