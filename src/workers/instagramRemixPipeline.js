import fs from 'node:fs';
import { db } from '../db/db.js';
import { storagePath,newId } from '../lib/util.js';
import { generateSpeech } from '../modules/tts/OpenAiTts.js';
import { alignWithWhisper } from '../modules/subtitle/WhisperAligner.js';
import { renderVideo } from '../modules/render/VideoRenderer.js';
import { cleanChineseSubtitles } from '../modules/media/SubtitleCleaner.js';

export async function runInstagramRemixPipeline({projectId,postId,scriptText}){
  const post=db.prepare('SELECT * FROM social_posts WHERE id=?').get(postId);if(!post)throw new Error('Instagram post not found');
  const source=post.local_video_path;if(!source||!fs.existsSync(source))throw new Error('Instagram 원본 영상 파일이 없습니다.');
  let clean=storagePath('clean',`${postId}-clean.mp4`);
  if(!fs.existsSync(clean)){
    const result=cleanChineseSubtitles({postId,inputPath:source,mode:'DELOGO'});
    clean=result.outputPath;
  }
  const audio=storagePath('uploads',`${projectId}-tts.mp3`);
  const tts=await generateSpeech({text:scriptText,outputPath:audio});
  const captions=await alignWithWhisper({audioPath:audio,scriptText});
  const out=storagePath('renders',`${projectId}.mp4`),ass=storagePath('renders',`${projectId}.ass`);
  await renderVideo({sceneFiles:[clean],sceneDurations:[tts.duration],captions,audioPath:audio,outputPath:out,assPath:ass});
  const sid=newId('script');db.prepare('INSERT INTO shorts_scripts(id,project_id,hook,script,ending,duration,metadata_json) VALUES(?,?,?,?,?,?,?)').run(sid,projectId,'',scriptText,'',tts.duration,JSON.stringify({source:'instagram_rewrite'}));
  const cid=newId('cap');db.prepare('INSERT INTO shorts_captions(id,project_id,source,captions_json) VALUES(?,?,?,?)').run(cid,projectId,'whisper',JSON.stringify(captions));
  const rid=newId('render');db.prepare('INSERT INTO shorts_renders(id,project_id,file_path,duration,status,timeline_json) VALUES(?,?,?,?,?,?)').run(rid,projectId,out,tts.duration,'READY',JSON.stringify({sourcePostId:postId,sourceVideo:clean}));
  db.prepare("UPDATE shorts_projects SET status='READY',error_message=NULL WHERE id=?").run(projectId);
  return {ok:true,renderId:rid,filePath:out};
}
