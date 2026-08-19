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

  // Force every source onto the same 30fps / 1:30 time base before concat.
  // Pexels sources commonly mix 23.98/25/29.97/60fps and unusual tbn values.
  const labels=sceneFiles.map((_,i)=>
    `[${i}:v]`+
    `scale=1080:1920:force_original_aspect_ratio=increase,`+
    `crop=1080:1920,`+
    `fps=30,`+
    `format=yuv420p,`+
    `setsar=1,`+
    `trim=duration=${sceneDurations[i]},`+
    `settb=expr=1/30,`+
    `setpts=N/TB/30[v${i}]`
  ).join(';');

  const concat=sceneFiles.map((_,i)=>`[v${i}]`).join('')+
    `concat=n=${sceneFiles.length}:v=1:a=0[base]`;
  const escapedAss=assPath.replace(/\\/g,'/').replace(/:/g,'\\:').replace(/'/g,"\\'");
  const filter=`${labels};${concat};[base]fps=30,settb=expr=1/30,subtitles='${escapedAss}'[vout]`;

  args.push('-filter_complex',filter,'-map','[vout]');
  if(audioPath) args.push('-map',`${sceneFiles.length}:a`);

  args.push(
    '-fps_mode','cfr',
    '-r','30',
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

  try {
    await execFileAsync('ffmpeg',args,{maxBuffer:50*1024*1024});
  } catch (err) {
    // Preserve the useful tail of ffmpeg stderr instead of flooding the UI with input metadata.
    const stderr=String(err?.stderr||'');
    const tail=stderr.split('\n').slice(-40).join('\n');
    const wrapped=new Error(`FFmpeg render failed\n${tail}`);
    wrapped.cause=err;
    throw wrapped;
  }
  return outputPath;
}
