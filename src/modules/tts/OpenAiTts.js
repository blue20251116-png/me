import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync=promisify(execFile);
export async function generateSpeech({text,voice='alloy',outputPath}){
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey) throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다.');
  const res=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:'tts-1',voice,input:text,response_format:'mp3'})});
  if(!res.ok) throw new Error(`OpenAI TTS 오류 (${res.status}): ${await res.text().catch(()=> '')}`);
  fs.writeFileSync(outputPath,Buffer.from(await res.arrayBuffer()));
  const {stdout}=await execFileAsync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',outputPath]);
  return {filePath:outputPath,duration:parseFloat(stdout.trim())};
}
