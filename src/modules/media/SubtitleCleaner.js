import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';
const CLEAN_VERSION='v2';
function validDims(w,h){return Number.isFinite(w)&&Number.isFinite(h)&&w>1&&h>1;}
function parseRate(v){const s=String(v||'');if(s.includes('/')){const[a,b]=s.split('/').map(Number);return b?a/b:0;}return Number(s)||0;}
function probeVideo(file){try{const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,avg_frame_rate','-of','json',file],{encoding:'utf8',timeout:15000});const s=JSON.parse(r.stdout||'{}')?.streams?.[0]||{};if(validDims(+s.width,+s.height))return{width:+s.width,height:+s.height,fps:parseRate(s.avg_frame_rate)};}catch{}return{width:1080,height:1920,fps:30};}
function even(n){n=Math.max(2,Math.round(n));return n%2?n-1:n;}
function reusable(out,input){try{const a=fs.statSync(out),b=fs.statSync(input);return a.size>100*1024&&a.mtimeMs>=b.mtimeMs;}catch{return false;}}
export function cleanChineseSubtitles({postId,inputPath,mode='AUTO',region=null}){
 if(!inputPath||!fs.existsSync(inputPath))throw new Error('원본 영상 파일이 없습니다.');
 const out=storagePath('clean',`${postId}-clean-${CLEAN_VERSION}.mp4`);fs.mkdirSync(path.dirname(out),{recursive:true});
 if(reusable(out,inputPath)){console.log(`[SubtitleCleanerV2] reuse post=${postId}`);return{outputPath:out,mode:'V2',reused:true};}
 const p=probeVideo(inputPath),w=even(p.width),h=even(p.height);const requested=String(mode||'AUTO').toUpperCase();
 // V2 safety: never blur the old 92% x 20% rectangle. If no explicit region is supplied,
 // remove only the bottom subtitle band by cropping a conservative 11% and scaling back.
 let filters=[];if(p.fps>30)filters.push('fps=30');
 if(region&&Number(region.w)>0&&Number(region.h)>0){const x=Math.max(0,Math.min(w-2,Math.round(region.x||0))),y=Math.max(0,Math.min(h-2,Math.round(region.y||0))),rw=Math.max(2,Math.min(w-x,Math.round(region.w))),rh=Math.max(2,Math.min(h-y,Math.round(region.h)));filters.push(`delogo=x=${x}:y=${y}:w=${rw}:h=${rh}:show=0`);}
 else if(requested==='NONE'){console.log(`[SubtitleCleanerV2] no-clean post=${postId}`);return{outputPath:inputPath,mode:'NONE',reused:true};}
 else {const cropH=even(h*0.89);filters.push(`crop=${w}:${cropH}:0:0`,`scale=${w}:${h}:force_original_aspect_ratio=increase`,`crop=${w}:${h}`);}
 const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',inputPath,'-vf',filters.join(','),'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart',out],{encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 if(r.status!==0||!fs.existsSync(out)){try{fs.rmSync(out,{force:true});}catch{}throw new Error(`자막 제거 V2 실패: ${r.error?.message||String(r.stderr||'').slice(-700)}`);}
 console.log(`[SubtitleCleanerV2] post=${postId} input=${p.width}x${p.height}@${Math.round(p.fps||0)} strategy=${region?'targeted-delogo':'safe-bottom-crop'} output=${out}`);
 return{outputPath:out,mode:'V2',strategy:region?'targeted-delogo':'safe-bottom-crop',width:w,height:h,reused:false};
}
