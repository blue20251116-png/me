import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '../db/db.js';
import { newId } from '../lib/util.js';
import { verifyAdminPin, getSecret } from '../lib/settingsStore.js';

export const browserBridgeRouter=express.Router();
const MAX_PER_RUN=3;
const state={running:false,received:0,selected:0,processed:0,succeeded:0,failed:0,lastError:null,startedAt:null,finishedAt:null};
const storageRoot=path.resolve(process.env.STORAGE_ROOT||'./storage');
const bridgeDir=path.join(storageRoot,'bridge');
fs.mkdirSync(bridgeDir,{recursive:true});

function auth(req,res,next){
  const pin=req.header('x-admin-pin')||'';
  if(!verifyAdminPin(pin))return res.status(401).json({error:'관리자 PIN이 올바르지 않습니다.'});
  next();
}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function validReelCode(code=''){const s=String(code||'').trim();return /^[A-Za-z0-9_-]{8,30}$/.test(s)&&!/^[a-z]{2}_[A-Z]{2}$/.test(s);}
function cueScore(caption=''){
  const s=String(caption||'').toLowerCase();let score=0;
  if(/프로필|링크|인포크|구매|제품|상품|공구|추천|쿠팡|공구마켓|제품정보/.test(s))score+=8000;
  if(/댓글|검색|궁금|정보|템|꿀템|살림|주방|수납|생활|차량|육아|반려|레시피/.test(s))score+=3500;
  return score;
}
function score(x){return cueScore(x.caption)+num(x.views)*0.02+num(x.likes)*4+num(x.comments)*3+num(x.shares)*5;}
function normalize(x){
  const sourceUrl=String(x?.sourceUrl||'').trim();
  const m=sourceUrl.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
  const externalPostId=String(x?.externalPostId||m?.[1]||'').trim();
  return {...x,sourceUrl,externalPostId,videoUrl:String(x?.videoUrl||'').trim(),caption:String(x?.caption||'').trim(),username:String(x?.username||x?.authorName||'').replace(/^@/,'').trim()};
}
function exists(externalPostId){return Boolean(db.prepare("SELECT 1 FROM social_posts WHERE platform='INSTAGRAM' AND external_post_id=?").get(externalPostId));}
function save(x){
  const target=db.prepare("SELECT * FROM social_monitor_targets WHERE enabled=1 AND platform='INSTAGRAM' AND target_type='ACCOUNT' AND lower(target_value)=lower(?) LIMIT 1").get(x.username);
  if(!target)return null;
  const id=newId('post');
  db.prepare(`INSERT INTO social_posts(id,target_id,platform,external_post_id,author_id,author_name,source_url,caption,published_at,views,likes,comments,shares,video_url,thumbnail_url,status,metadata_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,target.id,'INSTAGRAM',x.externalPostId,'',x.username,x.sourceUrl,x.caption,x.publishedAt||null,num(x.views),num(x.likes),num(x.comments),num(x.shares),x.videoUrl,String(x.thumbnailUrl||''),'DISCOVERED',JSON.stringify({source:'chrome-bridge',bridgeCapturedAt:new Date().toISOString(),pageText:String(x.pageText||'').slice(0,4000)}));
  return id;
}
function localBase(){return `http://127.0.0.1:${process.env.PORT||4100}`;}
function publicBase(req){return String(getSecret('PUBLIC_BASE_URL')||process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get('host')}`).replace(/\/$/,'');}
async function analyze(id){
  const r=await fetch(`${localBase()}/api/discovery/posts/${encodeURIComponent(id)}/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(180000)});
  const text=await r.text();if(!r.ok)throw new Error(text||`분석 실패 (${r.status})`);
  return JSON.parse(text||'{}');
}
async function processPosts(ids){
  state.running=true;state.processed=0;state.succeeded=0;state.failed=0;state.lastError=null;state.startedAt=new Date().toISOString();state.finishedAt=null;
  console.log(`[BrowserBridge] analyze start count=${ids.length}`);
  try{
    for(const id of ids){
      try{await analyze(id);state.succeeded++;}catch(err){state.failed++;state.lastError=String(err?.message||err).slice(0,500);console.error(`[BrowserBridge] analyze failed post=${id} reason=${state.lastError}`);}finally{state.processed++;}
    }
  }finally{state.running=false;state.finishedAt=new Date().toISOString();console.log(`[BrowserBridge] analyze done processed=${state.processed} success=${state.succeeded} failed=${state.failed}`);}
}

browserBridgeRouter.get('/targets',auth,(_req,res)=>{
  const items=db.prepare("SELECT id,target_value FROM social_monitor_targets WHERE enabled=1 AND platform='INSTAGRAM' AND target_type='ACCOUNT' ORDER BY created_at ASC").all();
  res.json({items:items.map(x=>({id:x.id,username:x.target_value}))});
});

browserBridgeRouter.get('/status',auth,(_req,res)=>res.json({ok:true,maxPerRun:MAX_PER_RUN,state:{...state}}));

browserBridgeRouter.post('/upload-video/:externalPostId',auth,express.raw({type:['application/octet-stream','video/*'],limit:'100mb'}),(req,res)=>{
  try{
    const externalPostId=String(req.params.externalPostId||'').trim();
    if(!validReelCode(externalPostId))return res.status(400).json({error:'유효한 Instagram Reel ID가 아닙니다.'});
    if(!Buffer.isBuffer(req.body)||req.body.length<100*1024)return res.status(400).json({error:'영상 데이터가 너무 작거나 비어 있습니다.'});
    const signature=req.body.length>=8?req.body.subarray(4,8).toString('ascii'):'';
    if(signature!=='ftyp')return res.status(400).json({error:'MP4 파일 형식이 아닙니다.'});
    const file=`${externalPostId}.mp4`;const target=path.join(bridgeDir,file);
    fs.writeFileSync(target,req.body);
    const url=`${publicBase(req)}/storage/bridge/${encodeURIComponent(file)}`;
    console.log(`[BrowserBridge] video mirrored reel=${externalPostId} bytes=${req.body.length}`);
    res.json({ok:true,url,bytes:req.body.length});
  }catch(err){res.status(500).json({error:String(err?.message||err)});}
});

browserBridgeRouter.post('/submit',auth,(req,res)=>{
  try{
    const input=Array.isArray(req.body?.candidates)?req.body.candidates:[];state.received=input.length;
    const diag=req.body?.diagnostics&&typeof req.body.diagnostics==='object'?req.body.diagnostics:{};
    const clean=[];const seen=new Set();
    for(const raw of input){const x=normalize(raw);const sourceId=(x.sourceUrl.match(/instagram\.com\/(?:reel|reels)\/([A-Za-z0-9_-]+)/i)||[])[1]||'';if(!validReelCode(x.externalPostId)||sourceId!==x.externalPostId||!x.sourceUrl||!x.videoUrl||!x.username||seen.has(x.externalPostId)||exists(x.externalPostId))continue;seen.add(x.externalPostId);clean.push(x);}
    clean.sort((a,b)=>score(b)-score(a));
    const selected=clean.slice(0,MAX_PER_RUN);state.selected=selected.length;
    const ids=[];for(const x of selected){const id=save(x);if(id)ids.push(id);}
    console.log(`[BrowserBridge] submit received=${input.length} eligible=${clean.length} selected=${ids.length} max=${MAX_PER_RUN} accounts=${num(diag.accountsChecked)} links=${num(diag.linksFound)} details=${num(diag.detailsTried)} videoUrl=${num(diag.videoUrlFound)} mirrored=${num(diag.mirrored)} mirrorFailed=${num(diag.mirrorFailed)}`);
    if(ids.length)setImmediate(()=>processPosts(ids));
    res.status(202).json({ok:true,received:input.length,eligible:clean.length,selected:ids.length,postIds:ids,diagnostics:diag,message:ids.length?`상품 Reel ${ids.length}개를 저장했고 자동 분석을 시작했습니다`:'새로 저장할 Reel이 없습니다'});
  }catch(err){res.status(400).json({error:String(err?.message||err)});}
});
