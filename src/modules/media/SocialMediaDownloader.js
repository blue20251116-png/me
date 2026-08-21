import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { storagePath } from '../../lib/util.js';
import { withRetry } from '../../lib/retry.js';
import { cleanChineseSubtitles } from './SubtitleCleaner.js';

export async function downloadSocialVideo({postId,url,cleanSubtitles=true,subtitleMode=process.env.SUBTITLE_CLEAN_MODE||'DELOGO'}){
  if(!url) throw new Error('videoUrl이 없습니다.');
  const original=storagePath('social',`${postId}.mp4`);
  await withRetry(async()=>{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0'}});
    if(!r.ok||!r.body) throw new Error(`영상 다운로드 실패 (${r.status})`);
    await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(original));
  },{attempts:3,label:`social-download:${postId}`});

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
