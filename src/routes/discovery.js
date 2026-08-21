import express from 'express';
import path from 'node:path';
import { db } from '../db/db.js';
import { newId, contentHash, normalizeTopic } from '../lib/util.js';
import { downloadSocialVideo } from '../modules/media/SocialMediaDownloader.js';
import { extractBestFrames } from '../modules/productIdentification/FrameExtractor.js';
import { searchLens } from '../modules/productIdentification/LensService.js';
import { resolveProduct, scoreCoupangCandidate } from '../modules/productIdentification/ProductResolver.js';
import { searchCoupangProducts, createCoupangDeepLink } from '../modules/productIdentification/CoupangPartnersClient.js';
import { runPipeline } from '../workers/pipelineWorker.js';

export const discoveryRouter=express.Router();
const VALID_PLATFORMS=new Set(['DOUYIN','XIAOHONGSHU']);
const VALID_TYPES=new Set(['ACCOUNT','HASHTAG','KEYWORD']);
function log(post,stage,reason='',attempt=1){db.prepare('INSERT INTO social_job_logs(id,post_id,platform,stage,reason,attempt) VALUES(?,?,?,?,?,?)').run(newId('log'),post?.id||null,post?.platform||null,stage,String(reason||''),attempt);}
function publicFrameUrl(file){
  const base=String(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
  if(!base)return '';
  const root=path.resolve(process.env.STORAGE_ROOT||'./storage');
  const rel=path.relative(root,path.resolve(file)).split(path.sep).map(encodeURIComponent).join('/');
  return `${base}/storage/${rel}`;
}
function thresholdStatus(score){return score>=90?'AUTO_CONFIRMED':score>=70?'REVIEW_REQUIRED':'REJECTED';}

// Monitoring targets
discoveryRouter.get('/targets',(_req,res)=>res.json({items:db.prepare('SELECT * FROM social_monitor_targets ORDER BY created_at DESC').all()}));
discoveryRouter.post('/targets',(req,res)=>{
  try{
    const platform=String(req.body?.platform||'').toUpperCase(),targetType=String(req.body?.targetType||'').toUpperCase(),targetValue=String(req.body?.targetValue||'').trim();
    if(!VALID_PLATFORMS.has(platform)||!VALID_TYPES.has(targetType)||!targetValue)return res.status(400).json({error:'platform/targetType/targetValue를 확인해 주세요.'});
    const id=newId('target');
    db.prepare('INSERT INTO social_monitor_targets(id,platform,target_type,target_value,enabled) VALUES(?,?,?,?,1)').run(id,platform,targetType,targetValue);
    res.json(db.prepare('SELECT * FROM social_monitor_targets WHERE id=?').get(id));
  }catch(err){res.status(400).json({error:String(err.message||err)});}
});
discoveryRouter.patch('/targets/:id',(req,res)=>{
  const enabled=req.body?.enabled?1:0;
  const r=db.prepare('UPDATE social_monitor_targets SET enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(enabled,req.params.id);
  if(!r.changes)return res.status(404).json({error:'not found'});res.json({ok:true});
});

// Collector adapters can POST normalized discoveries here. This keeps Douyin/XHS access logic replaceable.
discoveryRouter.post('/ingest',(req,res)=>{
  try{
    const x=req.body||{}; const platform=String(x.platform||'').toUpperCase();
    if(!VALID_PLATFORMS.has(platform)||!x.externalPostId||!x.sourceUrl)return res.status(400).json({error:'platform, externalPostId, sourceUrl이 필요합니다.'});
    const existing=db.prepare('SELECT * FROM social_posts WHERE platform=? AND external_post_id=?').get(platform,String(x.externalPostId));
    if(existing)return res.json({item:existing,duplicate:true});
    const id=newId('post');
    db.prepare(`INSERT INTO social_posts(id,target_id,platform,external_post_id,author_id,author_name,source_url,caption,published_at,views,likes,comments,shares,video_url,thumbnail_url,status,metadata_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,x.targetId||null,platform,String(x.externalPostId),x.authorId||'',x.authorName||'',x.sourceUrl,x.caption||'',x.publishedAt||null,Number(x.views||0),Number(x.likes||0),Number(x.comments||0),Number(x.shares||0),x.videoUrl||'',x.thumbnailUrl||'','DISCOVERED',JSON.stringify(x.metadata||{}));
    const post=db.prepare('SELECT * FROM social_posts WHERE id=?').get(id);log(post,'DISCOVERED');res.json({item:post,duplicate:false});
  }catch(err){res.status(400).json({error:String(err.message||err)});}
});

discoveryRouter.get('/posts',(req,res)=>{
  const status=String(req.query.status||'').trim();
  const items=status?db.prepare('SELECT * FROM social_posts WHERE status=? ORDER BY created_at DESC LIMIT 100').all(status):db.prepare('SELECT * FROM social_posts ORDER BY created_at DESC LIMIT 100').all();
  res.json({items});
});
discoveryRouter.get('/posts/:id',(req,res)=>{
  const post=db.prepare('SELECT * FROM social_posts WHERE id=?').get(req.params.id);if(!post)return res.status(404).json({error:'not found'});
  const frames=db.prepare('SELECT * FROM video_frames WHERE post_id=? ORDER BY visual_score DESC').all(post.id);
  const candidate=db.prepare('SELECT * FROM product_candidates WHERE post_id=? ORDER BY created_at DESC LIMIT 1').get(post.id);
  const matches=candidate?db.prepare('SELECT * FROM coupang_matches WHERE candidate_id=? ORDER BY score DESC').all(candidate.id):[];
  const jobs=db.prepare('SELECT * FROM content_jobs WHERE post_id=? ORDER BY created_at DESC').all(post.id);
  res.json({post,frames,candidate,matches,jobs});
});

discoveryRouter.post('/posts/:id/analyze',async(req,res)=>{
  const post=db.prepare('SELECT * FROM social_posts WHERE id=?').get(req.params.id);if(!post)return res.status(404).json({error:'not found'});
  try{
    db.prepare("UPDATE social_posts SET status='DOWNLOADING',error_message=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(post.id);
    const videoPath=post.local_video_path||await downloadSocialVideo({postId:post.id,url:post.video_url});
    db.prepare("UPDATE social_posts SET local_video_path=?,status='ANALYZING',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(videoPath,post.id);log(post,'DOWNLOADED');
    db.prepare('DELETE FROM video_frames WHERE post_id=?').run(post.id);
    const frames=extractBestFrames({postId:post.id,videoPath,count:3});
    const lensResults=[];
    for(const f of frames){
      const frameId=newId('frame'),url=publicFrameUrl(f.filePath);let lens=null;
      if(url){try{lens=await searchLens(url);lensResults.push(lens);}catch(err){log(post,'LENS_FAILED',err.message);}}
      db.prepare('INSERT INTO video_frames(id,post_id,timestamp,local_path,public_url,file_size,visual_score,is_selected,lens_json) VALUES(?,?,?,?,?,?,?,?,?)').run(frameId,post.id,f.timestamp,f.filePath,url,f.size,f.visualScore,1,lens?JSON.stringify(lens):null);
    }
    const resolved=await resolveProduct({caption:post.caption||'',transcript:String(req.body?.transcript||''),ocrText:String(req.body?.ocrText||''),lensResults});
    const candidateId=newId('candidate');
    db.prepare(`INSERT INTO product_candidates(id,post_id,product_type,brand,model,material,color,features_json,usage_text,korean_name,search_queries_json,resolver_confidence,status,raw_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(candidateId,post.id,resolved.productType||'',resolved.brand||'',resolved.model||'',resolved.material||'',resolved.color||'',JSON.stringify(resolved.features||[]),resolved.usage||'',resolved.koreanName||'',JSON.stringify(resolved.searchQueries||[]),Number(resolved.confidence||0),'PRODUCT_FOUND',JSON.stringify(resolved));
    const seen=new Map();
    for(const q of (resolved.searchQueries||[]).slice(0,3)){
      for(const p of await searchCoupangProducts(q,{limit:10,subId:process.env.COUPANG_SUB_ID||''})) if(!seen.has(String(p.productId)))seen.set(String(p.productId),p);
    }
    const scored=[...seen.values()].map(p=>({...p,score:scoreCoupangCandidate(resolved,p)})).sort((a,b)=>b.score-a.score).slice(0,20);
    for(const p of scored){
      const status=thresholdStatus(p.score);let affiliateUrl='';
      if(status==='AUTO_CONFIRMED'){
        try{const d=await createCoupangDeepLink(p.productUrl,{subId:process.env.COUPANG_SUB_ID||''});affiliateUrl=d?.shortenUrl||d?.landingUrl||p.productUrl||'';}catch(err){log(post,'DEEPLINK_FAILED',err.message);}
      }
      db.prepare('INSERT INTO coupang_matches(id,candidate_id,product_id,product_name,product_price,product_url,product_image,rank,score,status,affiliate_url,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(newId('match'),candidateId,String(p.productId||''),p.productName||'',Number(p.productPrice||0),p.productUrl||'',p.productImage||'',Number(p.rank||0),p.score,status,affiliateUrl,JSON.stringify(p));
    }
    const top=db.prepare('SELECT * FROM coupang_matches WHERE candidate_id=? ORDER BY score DESC LIMIT 1').get(candidateId);
    db.prepare("UPDATE social_posts SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(top?.status||'PRODUCT_NOT_FOUND',post.id);log(post,top?.status||'PRODUCT_NOT_FOUND');
    res.json({ok:true,postId:post.id,candidate:resolved,matches:scored.slice(0,10),status:top?.status||'PRODUCT_NOT_FOUND'});
  }catch(err){db.prepare("UPDATE social_posts SET status='ANALYSIS_FAILED',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(String(err.message||err),post.id);log(post,'ANALYSIS_FAILED',err.message);res.status(500).json({error:String(err.message||err)});}
});

discoveryRouter.post('/matches/:id/confirm',async(req,res)=>{
  try{
    const m=db.prepare('SELECT m.*,c.post_id,c.korean_name,c.features_json FROM coupang_matches m JOIN product_candidates c ON c.id=m.candidate_id WHERE m.id=?').get(req.params.id);if(!m)return res.status(404).json({error:'not found'});
    let affiliate=m.affiliate_url;
    if(!affiliate){const d=await createCoupangDeepLink(m.product_url,{subId:process.env.COUPANG_SUB_ID||''});affiliate=d?.shortenUrl||d?.landingUrl||m.product_url;}
    db.prepare("UPDATE coupang_matches SET status='AUTO_CONFIRMED',affiliate_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(affiliate,m.id);
    db.prepare("UPDATE coupang_matches SET status='REJECTED',updated_at=CURRENT_TIMESTAMP WHERE candidate_id=? AND id<>?").run(m.candidate_id,m.id);
    db.prepare("UPDATE social_posts SET status='AUTO_CONFIRMED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(m.post_id);
    res.json({ok:true,affiliateUrl:affiliate});
  }catch(err){res.status(500).json({error:String(err.message||err)});}
});

discoveryRouter.post('/matches/:id/create-short',(req,res)=>{
  try{
    const m=db.prepare('SELECT m.*,c.post_id,c.korean_name,c.features_json,p.source_url FROM coupang_matches m JOIN product_candidates c ON c.id=m.candidate_id JOIN social_posts p ON p.id=c.post_id WHERE m.id=?').get(req.params.id);
    if(!m)return res.status(404).json({error:'not found'});if(m.status!=='AUTO_CONFIRMED')return res.status(400).json({error:'먼저 상품을 확정해 주세요.'});
    const topic=[m.korean_name,m.product_name].filter(Boolean).join(' - ');const projectId=newId('project');
    db.prepare('INSERT INTO shorts_projects(id,topic,source_url,source_type,voice_mode,normalized_topic,content_hash,status) VALUES(?,?,?,?,?,?,?,?)').run(projectId,topic,m.source_url,'SOCIAL_PRODUCT','AI_TTS',normalizeTopic(topic),contentHash(`${m.post_id}:${m.product_id}`),'QUEUED');
    const jobId=newId('job');db.prepare('INSERT INTO content_jobs(id,post_id,candidate_id,coupang_match_id,shorts_project_id,content_score,status) VALUES(?,?,?,?,?,?,?)').run(jobId,m.post_id,m.candidate_id,m.id,projectId,Number(req.body?.contentScore||85),'QUEUED');
    res.status(202).json({ok:true,projectId,jobId,status:'QUEUED'});
    setImmediate(()=>runPipeline(projectId).then(()=>db.prepare("UPDATE content_jobs SET status='READY',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(jobId)).catch(err=>{db.prepare("UPDATE content_jobs SET status='FAILED',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(jobId);console.error('[discovery pipeline failed]',projectId,err);}));
  }catch(err){res.status(500).json({error:String(err.message||err)});}
});

discoveryRouter.get('/dashboard',(_req,res)=>{
  const scalar=(sql)=>Number(db.prepare(sql).pluck().get()||0);
  res.json({targets:scalar('SELECT COUNT(*) FROM social_monitor_targets WHERE enabled=1'),posts:scalar('SELECT COUNT(*) FROM social_posts'),autoConfirmed:scalar("SELECT COUNT(*) FROM coupang_matches WHERE status='AUTO_CONFIRMED'"),reviewRequired:scalar("SELECT COUNT(*) FROM coupang_matches WHERE status='REVIEW_REQUIRED'"),contentJobs:scalar('SELECT COUNT(*) FROM content_jobs'),readyJobs:scalar("SELECT COUNT(*) FROM content_jobs WHERE status='READY'")});
});
