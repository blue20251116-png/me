import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';

function probeVideo(file){
  const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{encoding:'utf8'});
  if(r.status!==0) throw new Error('ffprobe 영상 크기 확인 실패');
  const stream=JSON.parse(r.stdout||'{}')?.streams?.[0]||{};
  const width=Number(stream.width),height=Number(stream.height);
  if(!width||!height) throw new Error('영상 해상도 확인 실패');
  return {width,height};
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function cleanChineseSubtitles({postId,inputPath,mode='DELOGO',region=null}){
  if(!inputPath||!fs.existsSync(inputPath)) throw new Error('원본 영상 파일이 없습니다.');
  const {width,height}=probeVideo(inputPath);
  const safe=region||{};
  const x=clamp(Number(safe.x??Math.round(width*0.04)),0,width-2);
  const w=clamp(Number(safe.w??Math.round(width*0.92)),2,width-x);
  const h=clamp(Number(safe.h??Math.round(height*0.20)),2,height-2);
  const y=clamp(Number(safe.y??Math.round(height*0.74)),0,height-h);
  const out=storagePath('clean',`${postId}-clean.mp4`);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  let filter;
  if(String(mode).toUpperCase()==='CROP'){
    const cropH=Math.max(2,y);
    filter=`crop=${width}:${cropH}:0:0,scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  }else{
    filter=`delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`;
  }
  const r=spawnSync('ffmpeg',['-y','-i',inputPath,'-vf',filter,'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','20','-c:a','aac','-b:a','160k','-movflags','+faststart',out],{encoding:'utf8'});
  if(r.status!==0||!fs.existsSync(out)) throw new Error(`자막 제거 ffmpeg 실패: ${String(r.stderr||'').slice(-500)}`);
  return {outputPath:out,mode:String(mode).toUpperCase(),region:{x,y,w,h},width,height};
}
