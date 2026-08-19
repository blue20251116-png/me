import { db } from '../db/db.js';
import { newId, storagePath } from '../lib/util.js';
import { generateScript } from '../modules/scriptGenerator/OpenAiScriptGenerator.js';
import { planScenes } from '../modules/scenePlanner/OpenAiScenePlanner.js';
import { searchPexels } from '../modules/media/PexelsMediaProvider.js';
import { generateSpeech } from '../modules/tts/OpenAiTts.js';
import { alignWithWhisper } from '../modules/subtitle/WhisperAligner.js';
import { buildTimeline } from '../modules/timeline/TimelineBuilder.js';
import { downloadToFile } from '../lib/download.js';
import { renderVideo } from '../modules/render/VideoRenderer.js';
import { generateYoutubeMetadata } from '../modules/metadata/OpenAiMetadataGenerator.js';

export async function runPipeline(projectId){
  const p=db.prepare('SELECT * FROM shorts_projects WHERE id=?').get(projectId); if(!p) throw new Error('project not found');
  try{
    db.prepare("UPDATE shorts_projects SET status='ANALYZING',error_message=NULL WHERE id=?").run(projectId);
    const script=await generateScript({topic:p.topic||'Interesting global fact'});
    const sid=newId('script'); db.prepare('INSERT INTO shorts_scripts(id,project_id,hook,script,ending,duration,hook_type,ending_type,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)').run(sid,projectId,script.hook,script.script,script.ending,script.estimated_duration,script.hook_type,script.ending_type,JSON.stringify(script));
    db.prepare("UPDATE shorts_projects SET status='SCRIPT_READY' WHERE id=?").run(projectId);

    const planned=await planScenes({hook:script.hook,script:script.script,ending:script.ending,estimatedDuration:script.estimated_duration,topic:p.topic});
    db.prepare("UPDATE shorts_projects SET status='PLANNING' WHERE id=?").run(projectId);
    const sceneRows=[];
    for(const s of planned.scenes||[]){
      const id=newId('scene');
      db.prepare('INSERT INTO shorts_scenes(id,project_id,script_id,scene_order,narration,estimated_duration,visual_query,visual_type,transition,emphasis_json) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,projectId,sid,s.scene_order,s.narration,s.duration,s.visual_query,'footage',s.transition||'cut',JSON.stringify(s.emphasis||[]));
      sceneRows.push({...s,id});
    }

    // Select stock footage sequentially so each search can use continuity from the
    // previously selected scene instead of treating every scene as an isolated query.
    let previousSelection=null;
    const storyAnchor=planned?.story_context?.continuity_anchor||planned?.story_context?.setting||p.topic||'';
    for(const s of sceneRows){
      const continuity={
        anchor:storyAnchor,
        previousQuery:previousSelection?.query||'',
        previousCreator:previousSelection?.creatorName||'',
        keywords:Array.isArray(s.continuity_keywords)?s.continuity_keywords:[]
      };
      const {candidates}=await searchPexels(s.visual_query,s.duration,{continuity,maxResults:10});
      for(let i=0;i<candidates.length;i++){
        const c=candidates[i],mid=newId('media');
        db.prepare('INSERT INTO shorts_media(id,project_id,scene_id,source_type,duration,provider,external_id,search_query,license_type,preview_url,download_url,width,height,score,is_selected,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(mid,projectId,s.id,'STOCK',c.duration,c.provider,c.externalId,s.visual_query,c.licenseType,c.previewUrl,c.downloadUrl,c.width,c.height,c.score,i===0?1:0,JSON.stringify({creatorName:c.creatorName||'',sourceUrl:c.sourceUrl||'',sceneRole:s.scene_role||'',continuityKeywords:s.continuity_keywords||[],storyContext:planned.story_context||{}}));
      }
      if(candidates[0]) previousSelection={...candidates[0],query:s.visual_query};
    }
    db.prepare("UPDATE shorts_projects SET status='MEDIA_READY' WHERE id=?").run(projectId);

    const full=[script.hook,script.script,script.ending].filter(Boolean).join(' ');
    const audio=storagePath('uploads',`${projectId}-tts.mp3`);
    const tts=await generateSpeech({text:full,outputPath:audio});
    db.prepare("UPDATE shorts_projects SET status='TTS_READY' WHERE id=?").run(projectId);

    const captions=await alignWithWhisper({audioPath:audio,scriptText:full});
    db.prepare("UPDATE shorts_projects SET status='CAPTIONS_READY' WHERE id=?").run(projectId);
    const timeline=buildTimeline({scenes:sceneRows,captions,audioDuration:tts.duration});
    const files=[]; const durations=[];
    for(const s of timeline.scenes){
      const m=db.prepare('SELECT * FROM shorts_media WHERE scene_id=? AND is_selected=1').get(s.id); if(!m) continue;
      const fp=storagePath('uploads',`${m.id}.mp4`);
      await downloadToFile(m.download_url,fp);
      files.push(fp); durations.push(s.final_duration);
      db.prepare('UPDATE shorts_scenes SET final_duration=?,media_id=? WHERE id=?').run(s.final_duration,m.id,s.id);
    }

    db.prepare("UPDATE shorts_projects SET status='RENDERING' WHERE id=?").run(projectId);
    const capId=newId('cap');
    db.prepare('INSERT INTO shorts_captions(id,project_id,source,captions_json) VALUES(?,?,?,?)').run(capId,projectId,'whisper',JSON.stringify(captions));
    const out=storagePath('renders',`${projectId}.mp4`);
    const ass=storagePath('renders',`${projectId}.ass`);
    await renderVideo({sceneFiles:files,sceneDurations:durations,captions,audioPath:audio,outputPath:out,assPath:ass});
    const rid=newId('render');
    db.prepare("INSERT INTO shorts_renders(id,project_id,file_path,duration,status,timeline_json) VALUES(?,?,?,?,?,?)").run(rid,projectId,out,tts.duration,'READY',JSON.stringify({...timeline,story_context:planned.story_context||{}}));

    const yt=await generateYoutubeMetadata({topic:p.topic,hook:script.hook,script:script.script,ending:script.ending});
    const pubId=newId('pub');
    const packedDescription=[yt.description,`HOOK_TEXT::${yt.hook_text}`,`THUMBNAIL_TEXT::${yt.thumbnail_text}`].filter(Boolean).join('\n');
    db.prepare('INSERT INTO shorts_publications(id,project_id,title,description,hashtags,status) VALUES(?,?,?,?,?,?)').run(pubId,projectId,yt.title,packedDescription,yt.hashtags.join(' '),'METADATA_READY');

    db.prepare("UPDATE shorts_projects SET status='READY' WHERE id=?").run(projectId);
    return {ok:true,renderId:rid,filePath:out,metadata:yt};
  }catch(err){
    db.prepare("UPDATE shorts_projects SET status='FAILED',error_message=? WHERE id=?").run(String(err.message||err),projectId);
    throw err;
  }
}
export async function rerenderFromCurrentState(projectId){return runPipeline(projectId);}
