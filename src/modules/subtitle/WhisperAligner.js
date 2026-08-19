import fs from 'node:fs';
import { getSecret } from '../../lib/settingsStore.js';
export async function alignWithWhisper({audioPath, scriptText}) {
  const apiKey=getSecret('OPENAI_API_KEY'); if(!apiKey) throw new Error('OPENAI_API_KEY가 설정되어 있지 않습니다. 설정 화면에서 입력해 주세요.');
  const form=new FormData();
  form.append('file',new Blob([fs.readFileSync(audioPath)]), 'speech.mp3');
  form.append('model','whisper-1');
  form.append('response_format','verbose_json');
  form.append('timestamp_granularities[]','word');
  form.append('prompt',scriptText);
  const res=await fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`},body:form});
  if(!res.ok) throw new Error(`Whisper 오류 (${res.status}): ${await res.text().catch(()=> '')}`);
  const data=await res.json();
  return (data.words||[]).map(w=>({text:w.word,start:w.start,end:w.end,highlight:false}));
}
