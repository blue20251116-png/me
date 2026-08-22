(()=>{
  if(window.__ME_INSTAGRAM_BRIDGE_CONTENT__)return;
  window.__ME_INSTAGRAM_BRIDGE_CONTENT__=true;
  function announce(){window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'READY',version:'1.1.7'},'*');}
  announce();setTimeout(announce,500);setTimeout(announce,1500);
  window.addEventListener('message',async(event)=>{
    const msg=event.data||{};
    if(msg?.source!=='ME_ADMIN')return;
    if(msg.type==='PING_INSTAGRAM_BRIDGE'){announce();return;}
    if(msg.type!=='RUN_INSTAGRAM_BRIDGE')return;
    window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'STARTED'},'*');
    try{
      const result=await chrome.runtime.sendMessage({type:'RUN_BRIDGE_FROM_ADMIN',baseUrl:location.origin});
      window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'RESULT',result},'*');
    }catch(err){
      window.postMessage({source:'ME_INSTAGRAM_BRIDGE',type:'RESULT',result:{ok:false,error:String(err?.message||err)}},'*');
    }
  });
})();
