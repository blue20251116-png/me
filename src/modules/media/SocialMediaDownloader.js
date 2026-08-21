import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn,spawnSync } from 'node:child_process';
import { storagePath } from '../../lib/util.js';
import { withRetry } from '../../lib/retry.js';
import { cleanChineseSubtitles } from './SubtitleCleaner.js';

const UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

function refererFor(platform,sourceUrl=''){
  const p=String(platform||'').toUpperCase();
  if(p==='DOUYIN')return 'https://www.douyin.com/';
  if(p==='XIAOHONGSHU')return 'https://www.xiaohongshu.com/';
  try{return new URL(sourceUrl).origin+'/';}catch{return '';}
}

function validFile(file){
  try{return fs.statSync(file).size>4096;}catch{return false;}
}
function assertVideoStream(file){
  const r=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_type,codec_name,codec_tag_string,width,height','-of','json',file],{encoding:'utf8'});
  let stream=null;
  try{stream=JSON.parse(r.stdout||'{}')?.streams?.[0]||null;}catch{}
  if(r.status!==0||!stream||stream.codec_type!=='video'||!Number(stream.width)||!Number(stream.height)){
    let detail=String(r.stderr||'').trim().slice(-300);
    if(!detail){
      const f=spawnSync('ffmpeg',['-hide_banner','-i',file],{encoding:'utf8'});
      detail=String(f.stderr||'').trim().slice(-500);
    }
    throw new Error(`비디오 스트림이 없는 미디어입니다${detail?`: ${detail}`:''}`);
  }

  // Some Douyin files expose dimensions in ffprobe but use a codec (e.g. bvc2)
  // that this Railway ffmpeg build cannot decode. Decode exactly one frame now so
  // we can skip the bad candidate immediately instead of failing later in delogo/frame extraction.
  const d=spawnSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-frames:v','1','-f','null','-'],{encoding:'utf8',timeout:15000});
  if(d.error||d.status!==0){
    const codec=String(stream.codec_name||stream.codec_tag_string||'unknown');
    const detail=String(d.stderr||d.error?.message||'').trim().slice(-500);
    throw new Error(`지원하지 않는 영상 코덱입니다 codec=${codec}${detail?`: ${detail}`:''}`);
  }
}

async function fetchDownload({url,output,referer}){
  const headers={
    'user-agent':UA,
    'accept':'video/mp4,video/*;q=0.9,*/*;q=0.8',
    'accept-language':'zh-CN,zh;q=0.9,en;q=0.7',
    ...(referer?{referer}: {})
  };
  const r=await fetch(url,{redirect:'follow',headers,signal:AbortSignal.timeout(60000)});
  if(!r.ok||!r.body)throw new Error(`HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(output));
  if(!validFile(output))throw new Error('다운로드 파일이 비어 있거나 너무 작습니다.');
  assertVideoStream(output);
}

function ffmpegDownload({url,output,referer}){
  return new Promise((resolve,reject)=>{
    const headerLines=[referer?`Referer: ${referer}`:'','Accept: video/mp4,video/*;q=0.9,*/*;q=0.8','Accept-Language: zh-CN,zh;q=0.9,en;q=0.7'].filter(Boolean).join('\r\n')+'\r\n';
    const args=['-hide_banner','-loglevel','error','-y','-user_agent',UA,'-headers',headerLines,'-i',url,'-c','copy',output];
    const child=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
    let err='';
    child.stderr.on('data',d=>{err+=String(d);if(err.length>4000)err=err.slice(-4000);});
    child.on('error',reject);
    child.on('close',code=>{
      if(code!==0||!validFile(output))return reject(new Error(`ffmpeg 다운로드 실패 code=${code}${err?` ${err.trim()}`:''}`));
      try{assertVideoStream(output);resolve();}catch(e){reject(e);}
    });
  });
}

async function downloadWithFallback({postId,url,output,platform,sourceUrl}){
  const referer=refererFor(platform,sourceUrl);
  let fetchError='';
  try{
    await withRetry(async()=>{
      try{fs.rmSync(output,{force:true});}catch{}
      await fetchDownload({url,output,referer});
    },{attempts:2,label:`social-download-fetch:${postId}`});
    console.log(`[SocialVideo] download success method=fetch post=${postId}`);
    return;
  }catch(err){
    fetchError=String(err?.message||err);
    console.warn(`[SocialVideo] fetch download failed post=${postId} fallback=ffmpeg reason=${fetchError}`);
  }

  try{fs.rmSync(output,{force:true});}catch{}
  try{
    await ffmpegDownload({url,output,referer});
    console.log(`[SocialVideo] download success method=ffmpeg post=${postId}`);
  }catch(err){
    try{fs.rmSync(output,{force:true});}catch{}
    throw new Error(`영상 다운로드 최종 실패: fetch=${fetchError} / ffmpeg=${String(err?.message||err)}`);
  }
}

export async function downloadSocialVideo({postId,url,platform='',sourceUrl='',cleanSubtitles=true,subtitleMode=process.env.SUBTITLE_CLEAN_MODE||'DELOGO'}){
  if(!url) throw new Error('videoUrl이 없습니다.');
  const original=storagePath('social',`${postId}.mp4`);
  await downloadWithFallback({postId,url,output:original,platform,sourceUrl});

  if(!cleanSubtitles)return original;
  try{
    const cleaned=cleanChineseSubtitles({postId,inputPath:original,mode:subtitleMode});
    console.log(`[SocialVideo] subtitle-clean success post=${postId} mode=${cleaned.mode} original=${original} clean=${cleaned.outputPath}`);
    return cleaned.outputPath;
  }catch(err){
    console.warn(`[SocialVideo] subtitle-clean failed post=${postId} fallback=original reason=${String(err?.message||err)}`);
    return original;
  }
}
