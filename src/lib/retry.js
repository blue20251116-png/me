export async function withRetry(fn,{attempts=2,baseDelayMs=500,label='operation'}={}){
  let last;
  for(let i=1;i<=attempts;i++){
    try{return await fn(i);}catch(err){
      last=err;
      console.warn(`[Retry] ${label} attempt=${i}/${attempts} reason=${String(err?.message||err)}`);
      if(i<attempts) await new Promise(r=>setTimeout(r,baseDelayMs*i));
    }
  }
  throw last;
}
