import { db } from '../db/db.js';
import { newId } from '../lib/util.js';
import { collectorFor } from '../modules/social/RemoteSocialCollector.js';

const MAX_NEW_REELS_PER_RUN=3;
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function productCueScore(caption=''){const s=String(caption||'').toLowerCase();let score=0;if(/프로필|링크|인포크|구매|제품|상품|공구|추천|쿠팡|공구마켓/.test(s))score+=5000;if(/댓글|검색|궁금|정보|템|꿀템|살림|주방|수납|생활|차량|육아|반려|레시피/.test(s))score+=2500;return score;}
function candidateScore(x){return productCueScore(x?.caption)+num(x?.views)*0.02+num(x?.likes)*4+num(x?.comments)*3+num(x?.shares)*5;}
function alreadyExists(platform,externalId){return Boolean(db.prepare('SELECT id FROM social_posts WHERE platform=? AND external_post_id=?').get(platform,externalId));}
function saveDiscovered(target,x){
  const platform=String(target.platform||'').toUpperCase();const externalId=String(x.externalPostId||x.id||'').trim();const sourceUrl=String(x.sourceUrl||x.url||'').trim();if(!externalId||!sourceUrl||alreadyExists(platform,externalId))return null;
  const id=newId('post');
  db.prepare(`INSERT INTO social_posts(id,target_id,platform,external_post_id,author_id,author_name,source_url,caption,published_at,views,likes,comments,shares,video_url,thumbnail_url,status,metadata_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,target.id,platform,externalId,x.authorId||'',x.authorName||'',sourceUrl,x.caption||'',x.publishedAt||null,Number(x.views||0),Number(x.likes||0),Number(x.comments||0),Number(x.shares||0),x.videoUrl||'',x.thumbnailUrl||'','DISCOVERED',JSON.stringify(x.metadata||x));
  return id;
}

export async function runSocialMonitorOnce(){
  const targets=db.prepare("SELECT * FROM social_monitor_targets WHERE enabled=1 AND platform='INSTAGRAM' AND target_type='ACCOUNT' ORDER BY last_checked_at IS NOT NULL,last_checked_at ASC").all();
  const collector=collectorFor('INSTAGRAM');const pool=[];let failedTargets=0;
  for(const target of targets){
    try{
      const items=await collector.discover(target);
      for(const item of items){const externalId=String(item?.externalPostId||item?.id||'').trim();if(!externalId||alreadyExists('INSTAGRAM',externalId))continue;pool.push({target,item,score:candidateScore(item)});}
      db.prepare('UPDATE social_monitor_targets SET last_checked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(target.id);
    }catch(err){failedTargets++;console.error(`[InstagramDirect] account=${target.target_value} failed reason=${String(err?.message||err)}`);}
  }
  pool.sort((a,b)=>b.score-a.score);
  const selected=[];const seen=new Set();
  for(const c of pool){const key=String(c.item?.externalPostId||'');if(!key||seen.has(key))continue;seen.add(key);selected.push(c);if(selected.length>=MAX_NEW_REELS_PER_RUN)break;}
  const newPostIds=[];
  for(const c of selected){const id=saveDiscovered(c.target,c.item);if(id)newPostIds.push(id);}
  console.log(`[InstagramDirect] run selection pool=${pool.length} selected=${newPostIds.length} max=${MAX_NEW_REELS_PER_RUN}`);
  return {targets:targets.length,discovered:newPostIds.length,newPostIds,failedTargets,platform:'INSTAGRAM',collector:'DIRECT',candidatePool:pool.length,maxPerRun:MAX_NEW_REELS_PER_RUN};
}

export function startSocialMonitor(){
  const minutes=Number(process.env.SOCIAL_POLL_MINUTES||0);if(!Number.isFinite(minutes)||minutes<=0)return null;
  const ms=Math.max(5,minutes)*60_000;const tick=()=>runSocialMonitorOnce().catch(err=>console.error('[InstagramDirect]',err));setTimeout(tick,5000);const timer=setInterval(tick,ms);timer.unref?.();return timer;
}
