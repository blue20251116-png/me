import express from 'express';
import { db } from '../db/db.js';
import { newId } from '../lib/util.js';
import { runSocialMonitorOnce } from '../workers/socialMonitor.js';

export const discoveryAutoRouter=express.Router();

const DEFAULT_TARGETS={
  DOUYIN:['收纳神器','厨房神器','车载好物','家居好物','宠物用品'],
  XIAOHONGSHU:['收纳好物','家居好物','厨房好物','车载好物','生活好物']
};

function collectorStatus(){
  return {
    DOUYIN:Boolean(process.env.DOUYIN_COLLECTOR_ENDPOINT),
    XIAOHONGSHU:Boolean(process.env.XIAOHONGSHU_COLLECTOR_ENDPOINT)
  };
}

function ensureDefaultTargets(){
  const status=collectorStatus();
  let added=0;
  for(const [platform,values] of Object.entries(DEFAULT_TARGETS)){
    if(!status[platform])continue;
    for(const value of values){
      const exists=db.prepare('SELECT id FROM social_monitor_targets WHERE platform=? AND target_type=? AND target_value=?').get(platform,'KEYWORD',value);
      if(exists){
        db.prepare('UPDATE social_monitor_targets SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(exists.id);
        continue;
      }
      db.prepare('INSERT INTO social_monitor_targets(id,platform,target_type,target_value,enabled) VALUES(?,?,?,?,1)').run(newId('target'),platform,'KEYWORD',value);
      added++;
    }
  }
  return added;
}

discoveryAutoRouter.get('/status',(_req,res)=>{
  const collectors=collectorStatus();
  res.json({
    collectors,
    ready:Object.values(collectors).some(Boolean),
    activeTargets:Number(db.prepare('SELECT COUNT(*) FROM social_monitor_targets WHERE enabled=1').pluck().get()||0),
    posts:Number(db.prepare('SELECT COUNT(*) FROM social_posts').pluck().get()||0)
  });
});

discoveryAutoRouter.post('/run',async(_req,res)=>{
  const collectors=collectorStatus();
  if(!Object.values(collectors).some(Boolean)){
    return res.status(503).json({
      error:'중국 SNS 자동 수집기가 아직 연결되지 않았습니다. Railway Variables에 DOUYIN_COLLECTOR_ENDPOINT 또는 XIAOHONGSHU_COLLECTOR_ENDPOINT를 설정해 주세요.',
      collectors
    });
  }
  try{
    const seeded=ensureDefaultTargets();
    const before=Number(db.prepare('SELECT COUNT(*) FROM social_posts').pluck().get()||0);
    const result=await runSocialMonitorOnce();
    const after=Number(db.prepare('SELECT COUNT(*) FROM social_posts').pluck().get()||0);
    res.json({ok:true,seeded,collectors,...result,newPosts:Math.max(0,after-before),totalPosts:after});
  }catch(err){
    res.status(500).json({error:String(err?.message||err)});
  }
});
