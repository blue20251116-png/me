import { BaseSocialCollector } from './BaseSocialCollector.js';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const IG_APP_ID='936619743392459';
const MAX_REELS_PER_ACCOUNT=3;

function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function first(...v){return v.find(x=>x!==undefined&&x!==null&&String(x).trim()!=='');}
function decodeHtml(s=''){return String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function unescapeJsonUrl(s=''){return decodeHtml(String(s||'')).replace(/\\u0026/g,'&').replace(/\\\//g,'/').replace(/\\u003d/g,'=').replace(/\\u0025/g,'%');}
function collectUrls(obj,out=[],path='',depth=0){
  if(depth>10||obj==null)return out;
  if(typeof obj==='string'){
    if(/^https?:\/\//i.test(obj))out.push({url:obj,path});
    return out;
  }
  if(Array.isArray(obj)){for(let i=0;i<obj.length;i++)collectUrls(obj[i],out,`${path}[${i}]`,depth+1);return out;}
  if(typeof obj==='object')for(const [k,v] of Object.entries(obj))collectUrls(v,out,path?`${path}.${k}`:k,depth+1);
  return out;
}
function videoUrlFrom(obj){
  const scored=collectUrls(obj).map(x=>{
    const s=`${x.path} ${x.url}`.toLowerCase();let score=0;
    if(/\.(mp4|m4v|mov)(\?|$)/i.test(x.url))score+=150;
    if(/video_url|videourl|play_url|playurl|video_versions|clips_metadata/.test(s))score+=120;
    if(/video|play|stream/.test(s))score+=60;
    if(/thumbnail|display_url|image|cover|audio|music|profile_pic/.test(s))score-=160;
    return {...x,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return scored[0]?.url||'';
}
function imageUrlFrom(obj){return collectUrls(obj).find(x=>/thumbnail|display_url|image|cover/i.test(x.path)&&/\.(jpe?g|png|webp)(\?|$)/i.test(x.url))?.url||'';}
function captionFrom(node){
  const edge=node?.edge_media_to_caption?.edges?.[0]?.node?.text;
  return String(first(edge,node?.caption?.text,node?.caption,node?.text,node?.description,'')||'');
}
function normalizeNode(node,username){
  const shortcode=String(first(node?.shortcode,node?.code,node?.shortCode,node?.pk,node?.id,'')||'').trim();
  if(!shortcode)return null;
  const sourceUrl=`https://www.instagram.com/reel/${shortcode}/`;
  const isVideo=Boolean(node?.is_video||node?.isVideo||node?.video_url||node?.videoUrl||node?.video_versions||String(node?.product_type||'').toLowerCase()==='clips');
  if(!isVideo)return null;
  return {
    externalPostId:shortcode,
    sourceUrl,
    videoUrl:videoUrlFrom(node),
    thumbnailUrl:imageUrlFrom(node),
    caption:captionFrom(node),
    authorId:String(first(node?.owner?.id,node?.user?.pk,node?.user?.id,'')||''),
    authorName:String(first(node?.owner?.username,node?.user?.username,username)||username),
    publishedAt:first(node?.taken_at_timestamp,node?.taken_at,node?.timestamp,null),
    views:num(first(node?.video_view_count,node?.video_play_count,node?.play_count,node?.view_count,0)),
    likes:num(first(node?.edge_liked_by?.count,node?.edge_media_preview_like?.count,node?.like_count,0)),
    comments:num(first(node?.edge_media_to_comment?.count,node?.comment_count,0)),
    shares:num(first(node?.share_count,0)),
    metadata:{source:'instagram-direct',raw:node}
  };
}
function uniqById(items){const m=new Map();for(const x of items||[])if(x?.externalPostId&&!m.has(x.externalPostId))m.set(x.externalPostId,x);return [...m.values()];}
function productCueScore(caption=''){
  const s=String(caption||'').toLowerCase();let score=0;
  if(/프로필|링크|인포크|구매|제품|상품|공구|추천|쿠팡/.test(s))score+=5000;
  if(/댓글|검색|궁금|정보|템|꿀템|살림|주방|수납|생활|차량|육아|반려/.test(s))score+=2500;
  return score;
}
function reelScore(x){return productCueScore(x.caption)+num(x.views)*0.02+num(x.likes)*4+num(x.comments)*3+num(x.shares)*5;}
function topReels(items){return uniqById(items).filter(x=>x?.sourceUrl&&x?.videoUrl).sort((a,b)=>reelScore(b)-reelScore(a)).slice(0,MAX_REELS_PER_ACCOUNT);}

async function igFetch(url,{json=true}={}){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':json?'*/*':'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6','x-ig-app-id':IG_APP_ID,'x-requested-with':'XMLHttpRequest','referer':'https://www.instagram.com/'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  const text=await r.text();
  if(!r.ok)throw new Error(`Instagram 직접 수집 HTTP ${r.status}: ${text.slice(0,240)}`);
  if(!json)return text;
  try{return JSON.parse(text||'{}');}catch{throw new Error('Instagram 직접 수집 응답이 JSON이 아닙니다. 로그인/차단 페이지일 수 있습니다.');}
}

async function profileApi(username){
  const u=new URL('https://www.instagram.com/api/v1/users/web_profile_info/');u.searchParams.set('username',username);
  const data=await igFetch(u.toString());
  const user=data?.data?.user||data?.user||{};
  const buckets=[user?.edge_felix_video_timeline?.edges,user?.edge_owner_to_timeline_media?.edges,user?.edge_clips_grid?.edges,user?.clips?.edges,user?.reels?.edges];
  const out=[];
  for(const bucket of buckets){for(const e of bucket||[]){const n=e?.node||e?.media||e;const x=normalizeNode(n,username);if(x)out.push(x);}}
  console.log(`[InstagramDirect] profile-api account=${username} userId=${String(first(user?.id,user?.pk,'')||'-')} reelCandidates=${out.length} withVideo=${out.filter(x=>x.videoUrl).length}`);
  return {items:uniqById(out),userId:String(first(user?.id,user?.pk,'')||''),raw:user};
}
async function clipsApi(userId,username){
  if(!userId)return [];
  const endpoints=[`https://www.instagram.com/api/v1/clips/user/?target_user_id=${encodeURIComponent(userId)}&page_size=12`,`https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(userId)}/?count=12`];
  for(const url of endpoints){
    try{
      const data=await igFetch(url);const raw=[...(data?.items||[]),...(data?.data?.items||[])];const items=raw.map(x=>normalizeNode(x?.media||x?.item||x,username)).filter(Boolean);
      console.log(`[InstagramDirect] clips-api account=${username} endpoint=${new URL(url).pathname} candidates=${items.length} withVideo=${items.filter(x=>x.videoUrl).length}`);
      if(items.length)return uniqById(items);
    }catch(err){console.warn(`[InstagramDirect] clips-api failed account=${username} reason=${String(err?.message||err)}`);}
  }
  return [];
}
function extractMeta(html,name){const re=new RegExp(`<meta[^>]+(?:property|name)=["']${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'][^>]+content=["']([^"']+)["']`,'i');return decodeHtml(html.match(re)?.[1]||'');}
function shortcodesFromHtml(html){const found=[];for(const m of html.matchAll(/\/(?:reel|reels|p)\/([A-Za-z0-9_-]{5,})\/?/g))found.push(m[1]);return [...new Set(found)];}
function embeddedVideoUrls(html){
  const found=[];
  const patterns=[
    /"video_url"\s*:\s*"([^"]+)"/g,
    /"videoUrl"\s*:\s*"([^"]+)"/g,
    /"contentUrl"\s*:\s*"([^"]+)"/g,
    /"playable_url"\s*:\s*"([^"]+)"/g,
    /"src"\s*:\s*"(https?:\\\/\\\/[^"]+\.mp4[^"]*)"/g
  ];
  for(const re of patterns){for(const m of html.matchAll(re)){const u=unescapeJsonUrl(m[1]);if(/^https?:\/\//i.test(u)&&!found.includes(u))found.push(u);}}
  return found;
}
function jsonLdVideo(html){
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const j=JSON.parse(decodeHtml(m[1]));const urls=collectUrls(j).filter(x=>/contentUrl|embedUrl|video/i.test(x.path)).map(x=>x.url);if(urls.length)return urls[0];}catch{}
  }
  return '';
}
async function hydrateFromReelPage(shortcode,username){
  try{
    const html=await igFetch(`https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/`,{json:false});
    const metaVideo=first(extractMeta(html,'og:video:secure_url'),extractMeta(html,'og:video'),extractMeta(html,'twitter:player:stream'))||'';
    const embedded=embeddedVideoUrls(html);
    const video=first(metaVideo,jsonLdVideo(html),embedded[0])||'';
    const image=first(extractMeta(html,'og:image'),extractMeta(html,'twitter:image'))||'';
    const description=first(extractMeta(html,'og:description'),extractMeta(html,'description'))||'';
    console.log(`[InstagramDirect] reel-page account=${username} code=${shortcode} html=${html.length} metaVideo=${metaVideo?'yes':'no'} embeddedVideos=${embedded.length} finalVideo=${video?'yes':'no'}`);
    return {externalPostId:shortcode,sourceUrl:`https://www.instagram.com/reel/${shortcode}/`,videoUrl:video,thumbnailUrl:image,caption:description,authorId:'',authorName:username,publishedAt:null,views:0,likes:0,comments:0,shares:0,metadata:{source:'instagram-direct-html',videoSource:metaVideo?'meta':embedded.length?'embedded':'none'}};
  }catch(err){console.warn(`[InstagramDirect] reel-page failed account=${username} code=${shortcode} reason=${String(err?.message||err)}`);return null;}
}
async function profileHtmlFallback(username){
  const html=await igFetch(`https://www.instagram.com/${encodeURIComponent(username)}/`,{json:false});
  const codes=shortcodesFromHtml(html).slice(0,12);console.log(`[InstagramDirect] profile-html account=${username} shortcodes=${codes.length} html=${html.length}`);const out=[];
  for(const code of codes){const x=await hydrateFromReelPage(code,username);if(x?.videoUrl)out.push(x);}
  return out;
}

export class DirectInstagramCollector extends BaseSocialCollector{
  constructor(){super('INSTAGRAM');}
  async discover(target){
    const username=String(target?.target_value||'').replace(/^@/,'').trim();if(!username)return [];
    console.log(`[InstagramDirect] collect start account=${username}`);
    let profile={items:[],userId:''};
    try{profile=await profileApi(username);}catch(err){console.warn(`[InstagramDirect] profile-api failed account=${username} reason=${String(err?.message||err)}`);}
    let items=[...(profile.items||[])];
    try{items=uniqById([...items,...await clipsApi(profile.userId,username)]);}catch{}
    console.log(`[InstagramDirect] merged account=${username} candidates=${items.length} withVideo=${items.filter(x=>x.videoUrl).length}`);
    const hydrated=[];
    for(const x of items.slice(0,12)){
      if(x.videoUrl){hydrated.push(x);continue;}
      const h=await hydrateFromReelPage(x.externalPostId,username);if(h?.videoUrl)hydrated.push({...x,...h,caption:x.caption||h.caption,metadata:{...x.metadata,...h.metadata}});
    }
    if(!hydrated.length){try{hydrated.push(...await profileHtmlFallback(username));}catch(err){console.warn(`[InstagramDirect] html fallback failed account=${username} reason=${String(err?.message||err)}`);}}
    const result=topReels(hydrated);
    console.log(`[InstagramDirect] collect done account=${username} selected=${result.length} hydrated=${hydrated.length} candidates=${items.length}`);
    if(!result.length)throw new Error('공개 Reel은 찾았지만 실제 영상 URL을 확보하지 못했습니다. Instagram 비로그인 응답 제한 여부를 로그에서 확인해 주세요.');
    return result;
  }
}
