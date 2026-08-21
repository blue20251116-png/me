import { BaseSocialCollector } from './BaseSocialCollector.js';
import { getSecret } from '../../lib/settingsStore.js';
import { withRetry } from '../../lib/retry.js';

const APIFY_BASE='https://api.apify.com/v2';
const DOUYIN_ACTOR='vulnv~douyin-search-scraper';
const XHS_SEARCH_ACTOR='easyapi~all-in-one-rednote-xiaohongshu-scraper';
const XHS_VIDEO_ACTOR='easyapi~rednote-xiaohongshu-video-downloader';

function token(){const t=getSecret('APIFY_API_TOKEN');if(!t)throw new Error('APIFY_API_TOKEN이 설정되어 있지 않습니다.');return t;}
async function runActor(actorId,input,timeoutMs=120000){
  return withRetry(async()=>{
    const u=new URL(`${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items`);u.searchParams.set('token',token());
    const r=await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(timeoutMs)});
    const text=await r.text();if(!r.ok)throw new Error(`Apify ${actorId} 오류 (${r.status}): ${text.slice(0,500)}`);
    const json=JSON.parse(text||'[]');return Array.isArray(json)?json:[];
  },{attempts:2,label:`apify:${actorId}`});
}
function num(v){const n=Number(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:0;}
function first(...v){return v.find(x=>x!==undefined&&x!==null&&String(x).trim()!=='');}
function walkUrls(obj,pred,out=[],depth=0){
  if(depth>7||obj==null)return out;
  if(typeof obj==='string'){if(/^https?:\/\//i.test(obj)&&pred(obj,''))out.push(obj);return out;}
  if(Array.isArray(obj)){for(const x of obj)walkUrls(x,pred,out,depth+1);return out;}
  if(typeof obj==='object')for(const [k,v] of Object.entries(obj)){
    if(typeof v==='string'&&/^https?:\/\//i.test(v)&&pred(v,k))out.push(v);else walkUrls(v,pred,out,depth+1);
  }
  return out;
}
function videoUrlFrom(x){
  const urls=walkUrls(x,(u,k)=>/video|play|download|media|mp4|stream/i.test(k)||/\.mp4(?:\?|$)/i.test(u));
  return urls.find(u=>/\.mp4(?:\?|$)/i.test(u))||urls[0]||'';
}
function imageUrlFrom(x){return walkUrls(x,(u,k)=>/cover|thumb|image|poster/i.test(k)||/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(u))[0]||'';}
function douyinNormalize(raw){
  const x=raw?.item||raw||{};const stat=x.statistics||x.stats||{};const author=x.author||x.creator||{};
  const id=String(first(x.awemeId,x.aweme_id,x.videoId,x.id,x.itemId,'')).trim();
  if(!id)return null;
  return {
    externalPostId:id,
    sourceUrl:first(x.sourceUrl,x.url,x.shareUrl,x.share_url,`https://www.douyin.com/video/${id}`),
    videoUrl:videoUrlFrom(x),thumbnailUrl:imageUrlFrom(x),
    caption:String(first(x.desc,x.caption,x.title,x.description,'')),
    authorId:String(first(author.secUid,author.uid,author.id,x.authorId,'')),authorName:String(first(author.nickname,author.name,x.authorName,'')),
    publishedAt:first(x.createTime,x.create_time,x.publishedAt,null),
    views:num(first(stat.playCount,stat.play_count,x.views,x.playCount,0)),likes:num(first(stat.diggCount,stat.likeCount,stat.digg_count,x.likes,x.likeCount,0)),comments:num(first(stat.commentCount,stat.comment_count,x.comments,0)),shares:num(first(stat.shareCount,stat.share_count,x.shares,0)),metadata:raw
  };
}
function xhsSearchNormalize(raw){
  const outer=raw?.item?raw:{item:raw};const x=outer.item||{};const card=x.note_card||x.noteCard||x.postData||x;
  const id=String(first(x.id,card.note_id,card.noteId,card.id,'')).trim();if(!id)return null;
  const user=card.user||{};const interact=card.interact_info||card.interactInfo||{};const xsec=first(card.xsec_token,card.xsecToken,user.xsec_token,user.xsecToken,'');
  const sourceUrl=first(x.postUrl,card.postUrl,raw?.postUrl,`https://www.xiaohongshu.com/explore/${id}${xsec?`?xsec_token=${encodeURIComponent(xsec)}`:''}`);
  return {externalPostId:id,sourceUrl,videoUrl:videoUrlFrom(card),thumbnailUrl:imageUrlFrom(card),caption:String(first(card.display_title,card.displayTitle,card.title,x.title,'')),authorId:String(first(user.user_id,user.userId,user.id,'')),authorName:String(first(user.nick_name,user.nickName,user.nickname,user.name,'')),publishedAt:first(card.time,card.timestamp,x.scrapedAt,null),views:num(first(interact.view_count,interact.viewCount,card.views,0)),likes:num(first(interact.liked_count,interact.likedCount,card.likes,0)),comments:num(first(interact.comment_count,interact.commentCount,card.comments,0)),shares:num(first(interact.share_count,interact.shareCount,card.shares,0)),metadata:raw};
}
function xhsDownloadedUrl(raw){
  const result=raw?.result||raw||{};const medias=Array.isArray(result.medias)?result.medias:[];
  return medias.find(m=>String(m?.type||'').toLowerCase()==='video'&&/^https?:\/\//i.test(m?.url||''))?.url||videoUrlFrom(result);
}
function popularity(x){return Number(x.likes||0)*4+Number(x.comments||0)*3+Number(x.shares||0)*5+Number(x.views||0)*0.02;}

export class ApifyDouyinCollector extends BaseSocialCollector{
  constructor(){super('DOUYIN');}
  async discover(target){
    const keyword=String(target.target_value||'').trim();if(!keyword)return [];
    const items=await runActor(DOUYIN_ACTOR,{keywords:[keyword],maxResultsPerQuery:10,sort:'most_liked',publishTime:'one_week',duration:'under_1m',shouldDownloadVideos:true});
    return items.map(douyinNormalize).filter(x=>x?.sourceUrl&&x?.videoUrl);
  }
}
export class ApifyXiaohongshuCollector extends BaseSocialCollector{
  constructor(){super('XIAOHONGSHU');}
  async discover(target){
    const keyword=String(target.target_value||'').trim();if(!keyword)return [];
    // EasyApi actor schema requires maxItems >= 30. Fetch the minimum allowed,
    // then keep only the top 10 candidates locally to control downstream cost.
    const search=await runActor(XHS_SEARCH_ACTOR,{mode:'search',keywords:[keyword],maxItems:30});
    const normalized=search.map(xhsSearchNormalize).filter(x=>x?.sourceUrl).sort((a,b)=>popularity(b)-popularity(a)).slice(0,10);
    const need=normalized.filter(x=>!x.videoUrl).slice(0,10);
    if(need.length){
      const downloaded=await runActor(XHS_VIDEO_ACTOR,{links:need.map(x=>x.sourceUrl)});
      const byUrl=new Map(downloaded.map(x=>[String(x.url||x?.result?.url||''),xhsDownloadedUrl(x)]));
      for(const x of need)x.videoUrl=byUrl.get(String(x.sourceUrl))||'';
    }
    return normalized.filter(x=>x.videoUrl);
  }
}
