import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';

const CLEAN_VERSION='v3';
function validDims(w,h){return Number.isFinite(w)&&Number.isFinite(h)&&w>1&&h>1;}
function parseRate(v){const s=String(v||'');if(s.includes('/')){const[a,b]=s.split('/').map(Number);return b?a/b:0;}return Number(s)||0;}
function probeVideo(file){try{const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate','-of','json',file],{encoding:'utf8',timeout:15000});const s=JSON.parse(r.stdout||'{}')?.streams?.[0]||{};if(validDims(+s.width,+s.height))return{width:+s.width,height:+s.height,fps:parseRate(s.avg_frame_rate)};}catch{}return{width:1080,height:1920,fps:30};}
function even(n){n=Math.max(2,Math.round(n));return n%2?n-1:n;}
function reusable(out,input){try{const a=fs.statSync(out),b=fs.statSync(input);return a.size>100*1024&&a.mtimeMs>=b.mtimeMs;}catch{return false;}}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}

export function cleanChineseSubtitles({postId,inputPath,mode='AUTO',region=null}){
  if(!inputPath||!fs.existsSync(inputPath))throw new Error('원본 영상 파일이 없습니다.');
  const out=storagePath('clean',`${postId}-clean-${CLEAN_VERSION}.mp4`);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  if(reusable(out,inputPath)){
    console.log(`[SubtitleCleanerV3] reuse post=${postId}`);
    return{outputPath:out,mode:'V3',reused:true};
  }

  const p=probeVideo(inputPath),w=even(p.width),h=even(p.height);
  const requested=String(mode||'AUTO').toUpperCase();
  if(requested==='NONE'){
    console.log(`[SubtitleCleanerV3] no-clean post=${postId}`);
    return{outputPath:inputPath,mode:'NONE',reused:true};
  }

  const filters=[];
  if(p.fps>30)filters.push('fps=30');
  let strategy='edge-crop-v3';

  if(region&&Number(region.w)>0&&Number(region.h)>0){
    const x=clamp(Math.round(Number(region.x)||0),0,w-2);
    const y=clamp(Math.round(Number(region.y)||0),0,h-2);
    const rw=clamp(Math.round(Number(region.w)),2,w-x);
    const rh=clamp(Math.round(Number(region.h)),2,h-y);
    filters.push(`delogo=x=${x}:y=${y}:w=${rw}:h=${rh}:show=0`);
    strategy='targeted-delogo';
  }else{
    // V3: 자막/워터마크가 주로 붙는 가장자리 자체를 제거한다.
    // 좌우 4%, 상단 4%, 하단 15%를 잘라낸 뒤 원래 9:16 캔버스로 복원한다.
    // V2처럼 하단 11%만 자르는 것보다 워터마크/하단 자막 제거 범위를 넓히되,
    // 화면 중앙을 delogo로 뭉개지는 않는다.
    const left=even(w*0.04);
    const top=even(h*0.04);
    const right=even(w*0.04);
    const bottom=even(h*0.15);
    const cropW=even(w-left-right);
    const cropH=even(h-top-bottom);
    filters.push(
      `crop=${cropW}:${cropH}:${left}:${top}`,
      `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos`,
      `crop=${w}:${h}`
    );
  }

  const r=spawnSync('ffmpeg',[
    '-hide_banner','-loglevel','error','-y','-i',inputPath,
    '-vf',filters.join(','),'-map','0:v:0','-map','0:a?',
    '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-movflags','+faststart',out
  ],{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});

  if(r.status!==0||!fs.existsSync(out)){
    try{fs.rmSync(out,{force:true});}catch{}
    throw new Error(`자막/워터마크 제거 V3 실패: ${r.error?.message||String(r.stderr||'').slice(-700)}`);
  }

  console.log(`[SubtitleCleanerV3] post=${postId} input=${p.width}x${p.height}@${Math.round(p.fps||0)} strategy=${strategy} output=${out}`);
  return{outputPath:out,mode:'V3',strategy,width:w,height:h,reused:false};
}
