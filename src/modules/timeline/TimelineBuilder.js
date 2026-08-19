export function buildTimeline({scenes,captions,audioDuration}){
  const weights=scenes.map(s=>Math.max(1,(s.narration||'').split(/\s+/).length));
  const total=weights.reduce((a,b)=>a+b,0)||1;
  let cursor=0;
  const out=scenes.map((s,i)=>{let d=Math.max(1.5,Math.min(6,audioDuration*(weights[i]/total))); const row={...s,start:cursor,final_duration:d}; cursor+=d; return row;});
  if(out.length){const diff=audioDuration-cursor; out[out.length-1].final_duration=Math.max(1.5,out[out.length-1].final_duration+diff);}
  return {scenes:out,captions,duration:audioDuration};
}
