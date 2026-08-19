export function buildSceneFilters(count){
  const parts=[];
  for(let i=0;i<count;i++) parts.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1[v${i}]`);
  parts.push(Array.from({length:count},(_,i)=>`[v${i}]`).join('')+`concat=n=${count}:v=1:a=0[vout]`);
  return parts.join(';');
}
