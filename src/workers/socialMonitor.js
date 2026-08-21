import { db } from '../db/db.js';
import { newId } from '../lib/util.js';
import { collectorFor } from '../modules/social/RemoteSocialCollector.js';

function saveDiscovered(target,x){
  const platform=String(target.platform||'').toUpperCase();
  const externalId=String(x.externalPostId||x.id||'').trim();
  const sourceUrl=String(x.sourceUrl||x.url||'').trim();
  if(!externalId||!sourceUrl)return false;
  const exists=db.prepare('SELECT id FROM social_posts WHERE platform=? AND external_post_id=?').get(platform,externalId);
  if(exists)return false;
  db.prepare(`INSERT INTO social_posts(id,target_id,platform,external_post_id,author_id,author_name,source_url,caption,published_at,views,likes,comments,shares,video_url,thumbnail_url,status,metadata_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(newId('post'),target.id,platform,externalId,x.authorId||'',x.authorName||'',sourceUrl,x.caption||'',x.publishedAt||null,Number(x.views||0),Number(x.likes||0),Number(x.comments||0),Number(x.shares||0),x.videoUrl||'',x.thumbnailUrl||'','DISCOVERED',JSON.stringify(x.metadata||x));
  return true;
}

export async function runSocialMonitorOnce(){
  const targets=db.prepare("SELECT * FROM social_monitor_targets WHERE enabled=1 AND platform='INSTAGRAM' AND target_type='ACCOUNT' ORDER BY last_checked_at IS NOT NULL,last_checked_at ASC").all();
  let discovered=0;
  for(const target of targets){
    try{
      const collector=collectorFor('INSTAGRAM');
      const items=await collector.discover(target);
      for(const item of items)if(saveDiscovered(target,item))discovered++;
      db.prepare('UPDATE social_monitor_targets SET last_checked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(target.id);
    }catch(err){
      console.error(`[InstagramMonitor] account=${target.target_value} reason=${String(err?.message||err)}`);
    }
  }
  return {targets:targets.length,discovered,platform:'INSTAGRAM'};
}

export function startSocialMonitor(){
  const minutes=Number(process.env.SOCIAL_POLL_MINUTES||0);
  if(!Number.isFinite(minutes)||minutes<=0)return null;
  const ms=Math.max(5,minutes)*60_000;
  const tick=()=>runSocialMonitorOnce().catch(err=>console.error('[InstagramMonitor]',err));
  setTimeout(tick,5000);
  const timer=setInterval(tick,ms);timer.unref?.();return timer;
}
