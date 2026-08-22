import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';

function validDims(width,height){return Number.isFinite(width)&&Number.isFinite(height)&&width>1&&height>1;}
function parseFfmpegDims(stderr=''){
  const matches=[...String(stderr).matchAll(/Video:.*?(\d{2,5})x(\d{2,5})/g)];
  if(!matches.length)return null;
  const m=matches[matches.length-1];const width=Number(m[1]),height=Number(m[2]);
  return validDims(width,height)?{width,height}:null;
}
function parseRate(v){
  const s=String(v||'');
  if(s.includes('/')){const [a,b]=s.split('/').map(Number);return b?Math.round((a/b)*100)/100:0;}
  const n=Number(s);return Number.isFinite(n)?n:0;
}
function probeVideo(file){
  try{
    const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate,r_frame_rate','-of','json',file],{encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});
    if(r.status===0){
      const stream=JSON.parse(r.stdout||'{}')?.streams?.[0]||{};
      const width=Number(stream.width),height=Number(stream.height),fps=parseRate(stream.avg_frame_rate||stream.r_frame_rate);
      if(validDims(width,height))return {width,height,fps,method:'ffprobe'};
    }
  }catch{}

  try{
    const r=spawnSync('ffmpeg',['-hide_banner','-i',file,'-f','null','-'],{encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
    const dims=parseFfmpegDims(r.stderr||'');
    const fpsMatch=String(r.stderr||'').match(/(\d+(?:\.\d+)?)\s*fps/);
    if(dims)return {...dims,fps:Number(fpsMatch?.[1]||0),method:'ffmpeg'};
  }catch{}

  return {width:1080,height:1920,fps:30,method:'default'};
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function even(n){const x=Math.max(2,Math.round(Number(n)||2));return x%2===0?x:x-1;}
function outputCanvas(width,height){
  const maxW=1080,maxH=1920;
  if(width<=maxW&&height<=maxH)return {width:even(width),height:even(height),scaled:false};
  const ratio=Math.min(maxW/width,maxH/height);
  return {width:even(width*ratio),height:even(height*ratio),scaled:true};
}
function reusableOutput(out,inputPath){
  try{
    const outStat=fs.statSync(out),inStat=fs.statSync(inputPath);
    return outStat.size>100*1024&&outStat.mtimeMs>=inStat.mtimeMs;
  }catch{return false;}
}

export function cleanChineseSubtitles({postId,inputPath,mode='DELOGO',region=null}){
  if(!inputPath||!fs.existsSync(inputPath)) throw new Error('원본 영상 파일이 없습니다.');
  const out=storagePath('clean',`${postId}-clean.mp4`);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  if(reusableOutput(out,inputPath)){
    console.log(`[SubtitleCleaner] reuse post=${postId} clean=${out}`);
    return {outputPath:out,mode:String(mode).toUpperCase(),reused:true};
  }
  const probed=probeVideo(inputPath);
  const canvas=outputCanvas(probed.width,probed.height);
  const width=canvas.width,height=canvas.height;
  const safe=region||{};
  const x=clamp(Number(safe.x??Math.round(width*0.04)),0,width-2);
  const w=clamp(Number(safe.w??Math.round(width*0.92)),2,width-x);
  const h=clamp(Number(safe.h??Math.round(height*0.20)),2,height-2);
  const y=clamp(Number(safe.y??Math.round(height*0.74)),0,height-h);

  const filters=[];
  if(canvas.scaled)filters.push(`scale=${width}:${height}:flags=lanczos`);
  if(Number(probed.fps||0)>30)filters.push('fps=30');

  if(String(mode).toUpperCase()==='CROP'){
    const cropH=Math.max(2,y);
    filters.push(`crop=${width}:${cropH}:0:0`,`scale=${width}:${height}:force_original_aspect_ratio=increase`,`crop=${width}:${height}`);
  }else{
    filters.push(`delogo=x=${x}:y=${y}:w=${w}:h=${h}:show=0`);
  }

  const filter=filters.join(',');
  const heavy=canvas.scaled||Number(probed.fps||0)>30;
  const preset=heavy?'ultrafast':'veryfast';
  const crf=heavy?'22':'20';
  console.log(`[SubtitleCleaner] post=${postId} input=${probed.width}x${probed.height}@${probed.fps||'?'} output=${width}x${height}${Number(probed.fps||0)>30?'@30':''} heavy=${heavy?'yes':'no'}`);

  const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',inputPath,'-vf',filter,'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset',preset,'-crf',crf,'-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',out],{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
  if(r.status!==0||!fs.existsSync(out)){
    try{fs.rmSync(out,{force:true});}catch{}
    const detail=r.error?.message||String(r.stderr||'').slice(-900)||`status=${r.status}`;
    throw new Error(`자막 제거 ffmpeg 실패: ${detail}`);
  }
  return {outputPath:out,mode:String(mode).toUpperCase(),region:{x,y,w,h},width,height,sourceWidth:probed.width,sourceHeight:probed.height,fps:probed.fps,probeMethod:probed.method,downscaled:canvas.scaled,reused:false};
}
