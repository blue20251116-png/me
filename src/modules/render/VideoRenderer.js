import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { buildAss } from './assBuilder.js';
const execFileAsync=promisify(execFile);

export async function renderVideo({sceneFiles,sceneDurations,captions,audioPath,outputPath,assPath}){
  fs.writeFileSync(assPath,buildAss(captions),'utf8');
  const args=['-hide_banner'];

  sceneFiles.forEach((f,i)=>{
    args.push('-stream_loop','-1','-t',String(sceneDurations[i]),'-i',f);
  });
  if(audioPath) args.push('-i',audioPath);

  // Pexels clips can have very different fps/time-bases (23.98/24/25/29.97/60 etc.).
  // Normalize every scene BEFORE concat. Without this, concat can inherit an extreme
  // time-base and libx264 sees an absurd effective frame rate / MB rate.
  const labels=sceneFiles.map((_,i)=>
    `[${i}:v]`+
    `scale=1080:1920:force_original_aspect_ratio=increase,`+
    `crop=1080:1920,`+
    `fps=30,`+
    `format=yuv420p,`+
    `setsar=1,`+
    `trim=duration=${sceneDurations[i]},`+
    `setpts=N/(30*TB)[v${i}]`
  ).join(';');

  const concat=sceneFiles.map((_,i)=>`[v${i}]`).join('')+
    `concat=n=${sceneFiles.length}:v=1:a=0[base]`;
  const escapedAss=assPath.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
  const filter=`${labels};${concat};[base]fps=30,subtitles='${escapedAss}'[vout]`;

  args.push('-filter_complex',filter,'-map','[vout]');
  if(audioPath) args.push('-map',`${sceneFiles.length}:a`);

  args.push(
    '-r','30',
    '-vsync','cfr',
    '-c:v','libx264',
    '-preset','veryfast',
    '-profile:v','high',
    '-level:v','4.1',
    '-pix_fmt','yuv420p',
    '-c:a','aac',
    '-ar','44100',
    '-b:a','128k',
    '-movflags','+faststart',
    '-shortest',
    '-y',outputPath
  );

  await execFileAsync('ffmpeg',args,{maxBuffer:20*1024*1024});
  return outputPath;
}
