import express from 'express';
import { db } from '../db/db.js';
import { newId } from '../lib/util.js';
import { runSocialMonitorOnce } from '../workers/socialMonitor.js';

export const discoveryAutoRouter=express.Router();

const DEFAULT_TARGETS={
  DOUYIN:['收纳神器','厨房神器','车载好物','家居好物','宠物用品'],
  XIAOHONGSHU:['收纳好物','家居好物','厨房好物','车载好物','生活好物']
};

const runState={running:false,stage:'IDLE',message:'대기 중',startedAt:null,finishedAt:null,newPosts:0,totalPosts:0,queued:0,processed:0,succeeded:0,failed:0,currentPostId:null,lastError:null};

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
      if(exists){db.prepare('UPDATE social_monitor_targets SET enabled=1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(exists.id);continue;}
      db.prepare('INSERT INTO social_monitor_targets(id,platform,target_type,target_value,enabled) VALUES(?,?,?,?,1)').run(newId('target'),platform,'KEYWORD',value);
      added++;
    }
  }
  return added;
}

function localBase(){return `http://127.0.0.1:${process.env.PORT||4100}`;}

async function analyzePost(postId){
  const r=await fetch(`${localBase()}/api/discovery/posts/${encodeURIComponent(postId)}/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(180000)});
  const text=await r.text();
  if(!r.ok)throw new Error(text||`분석 실패 (${r.status})`);
  return JSON.parse(text||'{}');
}

async function executeOneClick(){
  runState.running=true;runState.stage='COLLECTING';runState.message='중국 인기 상품영상을 찾고 있습니다';runState.startedAt=new Date().toISOString();runState.finishedAt=null;runState.newPosts=0;runState.queued=0;runState.processed=0;runState.succeeded=0;runState.failed=0;runState.currentPostId=null;runState.lastError=null;
  try{
    ensureDefaultTargets();
    const before=Number(db.prepare('SELECT COUNT(*) FROM social_posts').pluck().get()||0);
    await runSocialMonitorOnce();
    const after=Number(db.prepare('SELECT COUNT(*) FROM social_posts').pluck().get()||0);
    runState.newPosts=Math.max(0,after-before);runState.totalPosts=after;

    const posts=db.prepare("SELECT id FROM social_posts WHERE status='DISCOVERED' AND COALESCE(video_url,'')<>'' ORDER BY created_at DESC LIMIT 20").all();
    runState.queued=posts.length;runState.stage='ANALYZING';runState.message=posts.length?`새 영상 ${posts.length}개를 자동 분석하고 있습니다`:'새로 분석할 영상이 없습니다';

    for(const p of posts){
      runState.currentPostId=p.id;
      try{await analyzePost(p.id);runState.succeeded++;}
      catch(err){runState.failed++;runState.lastError=String(err?.message||err).slice(0,500);}
      finally{runState.processed++;}
    }
    runState.stage='DONE';runState.message=`완료 · 영상 ${runState.processed}개 처리 · 성공 ${runState.succeeded} · 실패 ${runState.failed}`;
  }catch(err){runState.stage='FAILED';runState.lastError=String(err?.message||err);runState.message=`자동 실행 실패 · ${runState.lastError}`;}
  finally{runState.running=false;runState.currentPostId=null;runState.finishedAt=new Date().toISOString();}
}

discoveryAutoRouter.get('/status',(_req,res)=>{
  const collectors=collectorStatus();
  res.json({collectors,ready:Object.values(collectors).some(Boolean),activeTargets:Number(db.prepare('SELECT COUNT(*) FROM social_monitor_targets WHERE enabled=1').pluck().get()||0),posts:Number(db.prepare('SELECT COUNT(*) FROM social_posts').pluck().get()||0),run:{...runState}});
});

discoveryAutoRouter.post('/run',(req,res)=>{
  const collectors=collectorStatus();
  if(!Object.values(collectors).some(Boolean))return res.status(503).json({error:'중국 SNS 자동 수집기가 아직 연결되지 않았습니다. DOUYIN_COLLECTOR_ENDPOINT 또는 XIAOHONGSHU_COLLECTOR_ENDPOINT가 필요합니다.',collectors});
  if(runState.running)return res.status(409).json({error:'이미 자동 작업이 진행 중입니다.',run:{...runState}});
  setImmediate(()=>executeOneClick());
  res.status(202).json({ok:true,status:'STARTED',message:'중국 인기영상 수집부터 쿠팡 매칭까지 자동 작업을 시작했습니다.'});
});
