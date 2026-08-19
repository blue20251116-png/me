import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildAss } from './assBuilder.js';
const execFileAsync=promisify(execFile);

function ffmpegTail(err){
  return String(err?.stderr||'').split('\n').slice(-50).join('\n');
}
async function runFfmpeg(args,label){
  try{
    return await execFileAsync('ffmpeg',['-hide_banner',...args],{maxBuffer:50*1024*1024});
  }catch(err){
    const code=err?.code!=null?` code=${err.code}`:'';
    const signal=err?.signal?` signal=${err.signal}`:'';
    const wrapped=new Error(`${label} failed${code}${signal}\n${ffmpegTail(err)}`);
    wrapped.cause=err;
    throw wrapped;
  }
}
function concatLine(p){
  return `file '${p.replace(/'/g,"'\\''")}'`;
}

export async function renderVideo({sceneFiles,sceneDurations,captions,audioPath,outputPath,assPath}){
  fs.writeFileSync(assPath,buildAss(captions),'utf8');
  if(!sceneFiles?.length) throw new Error('렌더링할 scene 영상이 없습니다.');

  // Railway 메모리 절약: 6~8개 1080x1920 영상을 한 번에 디코드/스케일하지 않고
  // scene 하나씩 30fps/1080x1920로 정규화한 뒤 concat한다.
  const tmpDir=fs.mkdtempSync(path.join(os.tmpdir(),'global-shorts-'));
  const normalized=[];

  try{
    for(let i=0;i<sceneFiles.length;i++){
      const duration=Math.max(0.1,Number(sceneDurations[i]||0.1));
      const out=path.join(tmpDir,`scene-${String(i).padStart(2,'0')}.mp4`);
      await runFfmpeg([
        '-stream_loop','-1',
        '-t',String(duration),
        '-i',sceneFiles[i],
        '-an',
        '-vf','scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=yuv420p,setsar=1',
        '-r','30',
        '-fps_mode','cfr',
        '-c:v','libx264',
        '-preset','ultrafast',
        '-profile:v','high',
        '-level:v','4.1',
        '-threads','1',
        '-pix_fmt','yuv420p',
        '-movflags','+faststart',
        '-y',out
      ],`FFmpeg scene ${i+1}/${sceneFiles.length}`);
      normalized.push(out);
    }

    const listPath=path.join(tmpDir,'concat.txt');
    fs.writeFileSync(listPath,normalized.map(concatLine).join('\n'),'utf8');
    const joined=path.join(tmpDir,'joined.mp4');

    await runFfmpeg([
      '-f','concat','-safe','0','-i',listPath,
      '-c','copy',
      '-y',joined
    ],'FFmpeg concat');

    const escapedAss=assPath.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
    const finalArgs=['-i',joined];
    if(audioPath) finalArgs.push('-i',audioPath);
    finalArgs.push(
      '-vf',`subtitles='${escapedAss}'`,
      '-r','30',
      '-fps_mode','cfr',
      '-c:v','libx264',
      '-preset','veryfast',
      '-profile:v','high',
      '-level:v','4.1',
      '-threads','2',
      '-pix_fmt','yuv420p'
    );
    if(audioPath){
      finalArgs.push('-map','0:v:0','-map','1:a:0','-c:a','aac','-ar','44100','-b:a','128k','-shortest');
    }else{
      finalArgs.push('-map','0:v:0','-an');
    }
    finalArgs.push('-movflags','+faststart','-y',outputPath);

    await runFfmpeg(finalArgs,'FFmpeg final render');
    return outputPath;
  } finally {
    try{fs.rmSync(tmpDir,{recursive:true,force:true});}catch{}
  }
}
