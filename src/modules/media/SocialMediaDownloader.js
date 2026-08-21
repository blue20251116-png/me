import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { storagePath } from '../../lib/util.js';
import { withRetry } from '../../lib/retry.js';

export async function downloadSocialVideo({postId,url}){
  if(!url) throw new Error('videoUrl이 없습니다.');
  const output=storagePath('social',`${postId}.mp4`);
  await withRetry(async()=>{
    const r=await fetch(url,{redirect:'follow',headers:{'user-agent':'Mozilla/5.0'}});
    if(!r.ok||!r.body) throw new Error(`영상 다운로드 실패 (${r.status})`);
    await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(output));
  },{attempts:3,label:`social-download:${postId}`});
  return output;
}
