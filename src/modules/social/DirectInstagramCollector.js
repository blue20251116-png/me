import { BaseSocialCollector } from './BaseSocialCollector.js';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_REELS_PER_ACCOUNT=3;
const MAX_HTML_CODES=10;

function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function first(...v){return v.find(x=>x!==undefined&&x!==null&&String(x).trim()!=='');}
function decodeHtml(s=''){return String(s).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function unescapeJson(s=''){return decodeHtml(String(s||'')).replace(/\\u0026/gi,'&').replace(/\\u002f/gi,'/').replace(/\\u003d/gi,'=').replace(/\\\//g,'/').replace(/\\"/g,'"');}
function collectUrls(obj,out=[],path='',depth=0){
  if(depth>10||obj==null)return out;
  if(typeof obj==='string'){if(/^https?:\/\//i.test(obj))out.push({url:obj,path});return out;}
  if(Array.isArray(obj)){for(let i=0;i<obj.length;i++)collectUrls(obj[i],out,`${path}[${i}]`,depth+1);return out;}
  if(typeof obj==='object')for(const [k,v] of Object.entries(obj))collectUrls(v,out,path?`${path}.${k}`:k,depth+1);
  return out;
}
function videoUrlFrom(obj){
  const scored=collectUrls(obj).map(x=>{const s=`${x.path} ${x.url}`.toLowerCase();let score=0;if(/\.(mp4|m4v|mov)(\?|$)/i.test(x.url))score+=150;if(/video_url|videourl|play_url|playurl|video_versions|clips_metadata/.test(s))score+=120;if(/video|play|stream/.test(s))score+=60;if(/thumbnail|display_url|image|cover|audio|music|profile_pic/.test(s))score-=160;return {...x,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  return scored[0]?.url||'';
}
function imageUrlFrom(obj){return collectUrls(obj).find(x=>/thumbnail|display_url|image|cover/i.test(x.path)&&/\.(jpe?g|png|webp)(\?|$)/i.test(x.url))?.url||'';}
function captionFrom(node){const edge=node?.edge_media_to_caption?.edges?.[0]?.node?.text;return String(first(edge,node?.caption?.text,node?.caption,node?.text,node?.description,'')||'');}
function normalizeNode(node,username){
  const shortcode=String(first(node?.shortcode,node?.code,node?.shortCode,node?.pk,node?.id,'')||'').trim();if(!shortcode)return null;
  const isVideo=Boolean(node?.is_video||node?.isVideo||node?.video_url||node?.videoUrl||node?.video_versions||String(node?.product_type||'').toLowerCase()==='clips');if(!isVideo)return null;
  return {externalPostId:shortcode,sourceUrl:`https://www.instagram.com/reel/${shortcode}/`,videoUrl:videoUrlFrom(node),thumbnailUrl:imageUrlFrom(node),caption:captionFrom(node),authorId:String(first(node?.owner?.id,node?.user?.pk,node?.user?.id,'')||''),authorName:String(first(node?.owner?.username,node?.user?.username,username)||username),publishedAt:first(node?.taken_at_timestamp,node?.taken_at,node?.timestamp,null),views:num(first(node?.video_view_count,node?.video_play_count,node?.play_count,node?.view_count,0)),likes:num(first(node?.edge_liked_by?.count,node?.edge_media_preview_like?.count,node?.like_count,0)),comments:num(first(node?.edge_media_to_comment?.count,node?.comment_count,0)),shares:num(first(node?.share_count,0)),metadata:{source:'instagram-direct-html',raw:node}};
}
function uniqById(items){const m=new Map();for(const x of items||[])if(x?.externalPostId&&!m.has(x.externalPostId))m.set(x.externalPostId,x);return [...m.values()];}
function productCueScore(caption=''){const s=String(caption||'').toLowerCase();let score=0;if(/프로필|링크|인포크|구매|제품|상품|공구|추천|쿠팡|공구마켓/.test(s))score+=5000;if(/댓글|검색|궁금|정보|템|꿀템|살림|주방|수납|생활|차량|육아|반려|레시피/.test(s))score+=2500;return score;}
function reelScore(x){return productCueScore(x.caption)+num(x.views)*0.02+num(x.likes)*4+num(x.comments)*3+num(x.shares)*5;}
function topReels(items){return uniqById(items).filter(x=>x?.sourceUrl&&x?.videoUrl).sort((a,b)=>reelScore(b)-reelScore(a)).slice(0,MAX_REELS_PER_ACCOUNT);}

async function igHtml(url){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9,en-US;q=0.7,en;q=0.6','referer':'https://www.instagram.com/'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  const text=await r.text();if(!r.ok)throw new Error(`Instagram HTML HTTP ${r.status}: ${text.slice(0,160)}`);return text;
}
function extractMeta(html,name){const safe=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${safe}["'][^>]+content=["']([^"']+)["']`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${safe}["']`,'i')];for(const re of patterns){const m=html.match(re);if(m?.[1])return decodeHtml(m[1]);}return '';}
function embeddedVideoUrls(html){
  const found=[];const patterns=[/"video_url"\s*:\s*"([^"]+)"/g,/\\"video_url\\"\s*:\s*\\"([^\\"]+)\\"/g,/"videoUrl"\s*:\s*"([^"]+)"/g,/"contentUrl"\s*:\s*"([^"]+)"/g,/"playable_url"\s*:\s*"([^"]+)"/g,/"src"\s*:\s*"(https?:\\\/\\\/[^"]+\.mp4[^"]*)"/g];
  for(const re of patterns)for(const m of html.matchAll(re)){const u=unescapeJson(m[1]);if(/^https?:\/\//i.test(u)&&!found.includes(u))found.push(u);}return found;
}
function shortcodesFromHtml(html){
  const text=String(html||'');const found=[];const add=x=>{x=String(x||'').trim();if(/^[A-Za-z0-9_-]{5,20}$/.test(x)&&!found.includes(x))found.push(x);};
  const patterns=[
    /\/(?:reel|reels)\/([A-Za-z0-9_-]{5,20})\/?/g,
    /\\\/(?:reel|reels)\\\/([A-Za-z0-9_-]{5,20})\\\/?/g,
    /\\u002f(?:reel|reels)\\u002f([A-Za-z0-9_-]{5,20})/gi,
    /"shortcode"\s*:\s*"([A-Za-z0-9_-]{5,20})"/g,
    /\\"shortcode\\"\s*:\s*\\"([A-Za-z0-9_-]{5,20})\\"/g,
    /"code"\s*:\s*"([A-Za-z0-9_-]{8,20})"/g
  ];
  for(const re of patterns)for(const m of text.matchAll(re))add(m[1]);return found.slice(0,MAX_HTML_CODES);
}
function embeddedNodes(html,username){
  const out=[];const text=unescapeJson(html);
  const re=/\{[^{}]{0,4000}"(?:shortcode|code)"\s*:\s*"([A-Za-z0-9_-]{5,20})"[^{}]{0,8000}\}/g;
  for(const m of text.matchAll(re)){try{const x=normalizeNode(JSON.parse(m[0]),username);if(x)out.push(x);}catch{}}
  return uniqById(out);
}
async function hydrateFromReelPage(shortcode,username){
  try{
    const html=await igHtml(`https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/`);
    const metaVideo=first(extractMeta(html,'og:video:secure_url'),extractMeta(html,'og:video'),extractMeta(html,'twitter:player:stream'))||'';const embedded=embeddedVideoUrls(html);const video=first(metaVideo,embedded[0])||'';const image=first(extractMeta(html,'og:image'),extractMeta(html,'twitter:image'))||'';const description=first(extractMeta(html,'og:description'),extractMeta(html,'description'))||'';
    console.log(`[InstagramDirect] reel-page account=${username} code=${shortcode} html=${html.length} metaVideo=${metaVideo?'yes':'no'} embeddedVideos=${embedded.length} finalVideo=${video?'yes':'no'}`);
    return {externalPostId:shortcode,sourceUrl:`https://www.instagram.com/reel/${shortcode}/`,videoUrl:video,thumbnailUrl:image,caption:description,authorId:'',authorName:username,publishedAt:null,views:0,likes:0,comments:0,shares:0,metadata:{source:'instagram-direct-reel-html'}};
  }catch(err){console.warn(`[InstagramDirect] reel-page failed account=${username} code=${shortcode} reason=${String(err?.message||err)}`);return null;}
}
async function collectFromPublicHtml(username){
  const pages=[`https://www.instagram.com/${encodeURIComponent(username)}/reels/`,`https://www.instagram.com/${encodeURIComponent(username)}/`];const nodes=[];const codes=[];
  for(const url of pages){
    try{const html=await igHtml(url);const pageCodes=shortcodesFromHtml(html);const pageNodes=embeddedNodes(html,username);console.log(`[InstagramDirect] html account=${username} path=${new URL(url).pathname} bytes=${html.length} codes=${pageCodes.length} nodes=${pageNodes.length}`);nodes.push(...pageNodes);for(const c of pageCodes)if(!codes.includes(c))codes.push(c);}catch(err){console.warn(`[InstagramDirect] html failed account=${username} path=${new URL(url).pathname} reason=${String(err?.message||err)}`);}
    if(codes.length>=MAX_HTML_CODES)break;
  }
  const hydrated=[...uniqById(nodes).filter(x=>x.videoUrl)];
  for(const code of codes.slice(0,MAX_HTML_CODES)){if(hydrated.some(x=>x.externalPostId===code))continue;const h=await hydrateFromReelPage(code,username);if(h?.videoUrl)hydrated.push(h);}
  return uniqById(hydrated);
}

export class DirectInstagramCollector extends BaseSocialCollector{
  constructor(){super('INSTAGRAM');}
  async discover(target){
    const username=String(target?.target_value||'').replace(/^@/,'').trim();if(!username)return [];
    console.log(`[InstagramDirect] collect start account=${username} mode=HTML_ONLY`);
    const items=await collectFromPublicHtml(username);const result=topReels(items);
    console.log(`[InstagramDirect] collect done account=${username} selected=${result.length} candidates=${items.length}`);
    if(!result.length)throw new Error('Instagram 공개 HTML에서 Reel 영상 URL을 확보하지 못했습니다. Railway IP에 대한 Instagram 제한 또는 HTML 구조 변경 가능성이 있습니다.');
    return result;
  }
}
