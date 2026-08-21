import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';

function durationOf(file){
  const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',file],{encoding:'utf8'});
  const n=Number(String(r.stdout||'').trim());
  if(r.status!==0||!Number.isFinite(n)||n<=0) throw new Error('ffprobe duration 확인 실패');
  return n;
}
function hashFile(file){return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');}
export function extractBestFrames({postId,videoPath,count=3}){
  const duration=durationOf(videoPath);
  const dir=path.dirname(storagePath('frames',postId,'placeholder'));
  fs.mkdirSync(dir,{recursive:true});
  const candidates=[];
  const points=Array.from({length:12},(_,i)=>Math.max(.1,duration*((i+1)/13)));
  for(let i=0;i<points.length;i++){
    const out=path.join(dir,`candidate-${String(i+1).padStart(2,'0')}.jpg`);
    const r=spawnSync('ffmpeg',['-y','-ss',String(points[i]),'-i',videoPath,'-frames:v','1','-vf','scale=min(1280\\,iw):-2','-q:v','2',out],{stdio:'ignore'});
    if(r.status===0&&fs.existsSync(out)){
      const stat=fs.statSync(out); candidates.push({timestamp:points[i],filePath:out,size:stat.size,hash:hashFile(out)});
    }
  }
  const unique=[...new Map(candidates.map(x=>[x.hash,x])).values()];
  unique.sort((a,b)=>b.size-a.size);
  return unique.slice(0,Math.max(1,Math.min(3,count))).map((x,i)=>({...x,visualScore:Number((1-i*.08).toFixed(2)),selected:true}));
}
