import express from 'express';
import { db } from '../db/db.js';
import { newId, normalizeTopic, contentHash, safeJsonParse } from '../lib/util.js';
import { runPipeline } from '../workers/pipelineWorker.js';
export const projectsRouter=express.Router();

projectsRouter.post('/',(req,res)=>{
  const {topic,source_url=null,source_type='TOPIC',voice_mode='AI_TTS'}=req.body||{};
  if(source_type!=='TOPIC') return res.status(400).json({error:'V1에서는 TOPIC만 지원합니다.'});
  if(!topic) return res.status(400).json({error:'topic이 필요합니다.'});
  const id=newId('project'); const norm=normalizeTopic(topic);
  db.prepare('INSERT INTO shorts_projects(id,topic,source_url,source_type,voice_mode,normalized_topic,content_hash) VALUES(?,?,?,?,?,?,?)').run(id,topic,source_url,source_type,voice_mode,norm,contentHash(topic));
  res.json({id,status:'DRAFT'});
});

projectsRouter.get('/:id',(req,res)=>{
  const p=db.prepare('SELECT * FROM shorts_projects WHERE id=?').get(req.params.id);
  if(!p) return res.status(404).json({error:'not found'});
  const script=db.prepare('SELECT * FROM shorts_scripts WHERE project_id=? ORDER BY created_at DESC LIMIT 1').get(p.id);
  const scenes=db.prepare('SELECT * FROM shorts_scenes WHERE project_id=? ORDER BY scene_order').all(p.id).map(s=>({...s,candidates:db.prepare('SELECT * FROM shorts_media WHERE scene_id=? ORDER BY score DESC').all(s.id)}));
  const cap=db.prepare('SELECT * FROM shorts_captions WHERE project_id=? ORDER BY created_at DESC LIMIT 1').get(p.id);
  const renders=db.prepare('SELECT * FROM shorts_renders WHERE project_id=? ORDER BY created_at DESC').all(p.id);
  const publication=db.prepare('SELECT * FROM shorts_publications WHERE project_id=? ORDER BY rowid DESC LIMIT 1').get(p.id);
  let pub=null;
  if(publication){
    const lines=String(publication.description||'').split('\n');
    const hookLine=lines.find(x=>x.startsWith('HOOK_TEXT::'))||'';
    const thumbLine=lines.find(x=>x.startsWith('THUMBNAIL_TEXT::'))||'';
    const description=lines.filter(x=>!x.startsWith('HOOK_TEXT::')&&!x.startsWith('THUMBNAIL_TEXT::')).join('\n').trim();
    pub={...publication,description,hook_text:hookLine.slice('HOOK_TEXT::'.length),thumbnail_text:thumbLine.slice('THUMBNAIL_TEXT::'.length),hashtags:String(publication.hashtags||'').split(/\s+/).filter(Boolean)};
  }
  res.json({project:p,script,scenes,captions:cap?{...cap,captions:safeJsonParse(cap.captions_json,[])}:null,renders,publication:pub});
});

projectsRouter.post('/:id/run',(req,res)=>{
  const id=req.params.id;
  const p=db.prepare('SELECT id,status FROM shorts_projects WHERE id=?').get(id);
  if(!p) return res.status(404).json({error:'not found'});
  db.prepare("UPDATE shorts_projects SET status='QUEUED',error_message=NULL WHERE id=?").run(id);
  res.status(202).json({ok:true,status:'QUEUED'});
  setImmediate(()=>runPipeline(id).catch(err=>console.error('[pipeline failed]',id,err)));
});
