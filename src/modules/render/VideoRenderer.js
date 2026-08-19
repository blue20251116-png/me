import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import { buildAss } from './assBuilder.js';
const execFileAsync=promisify(execFile);
export async function renderVideo({sceneFiles,sceneDurations,captions,audioPath,outputPath,assPath}){
  fs.writeFileSync(assPath,buildAss(captions),'utf8');
  const args=[];
  sceneFiles.forEach((f,i)=>{args.push('-stream_loop','-1','-t',String(sceneDurations[i]),'-i',f)});
  if(audioPath) args.push('-i',audioPath);
  const labels=sceneFiles.map((_,i)=>`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,trim=duration=${sceneDurations[i]},setpts=PTS-STARTPTS[v${i}]`).join(';');
  const concat=sceneFiles.map((_,i)=>`[v${i}]`).join('')+`concat=n=${sceneFiles.length}:v=1:a=0[base]`;
  const filter=`${labels};${concat};[base]subtitles=${assPath.replace(/:/g,'\\:')}[vout]`;
  args.push('-filter_complex',filter,'-map','[vout]');
  if(audioPath) args.push('-map',`${sceneFiles.length}:a`);
  args.push('-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-shortest','-y',outputPath);
  await execFileAsync('ffmpeg',args,{maxBuffer:10*1024*1024});
  return outputPath;
}
