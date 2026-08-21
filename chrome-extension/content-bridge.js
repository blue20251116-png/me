(()=>{
  if(window.__ME_INSTAGRAM_BRIDGE_CONTENT__)return;
  window.__ME_INSTAGRAM_BRIDGE_CONTENT__=true;
  window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'READY'},'*');
  window.addEventListener('message',async(event)=>{
    const msg=event.data||{};
    if(msg?.source!=='ME_ADMIN'||msg?.type!=='RUN_INSTAGRAM_BRIDGE')return;
    try{
      const result=await chrome.runtime.sendMessage({type:'RUN_BRIDGE_FROM_ADMIN',baseUrl:location.origin});
      window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'RESULT',result},'*');
    }catch(err){
      window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'RESULT',result:{ok:false,error:String(err?.message||err)}},'*');
    }
  });
})();
