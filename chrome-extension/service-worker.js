const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function api(baseUrl,pin,path,opt={}){
  const r=await fetch(`${baseUrl}${path}`,{...opt,headers:{'content-type':'application/json','x-admin-pin':pin,...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`ME HTTP ${r.status}`);return j;
}
async function waitTab(tabId,timeout=15000){
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(on);resolve();},timeout);
    function on(id,info){if(id===tabId&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(on);setTimeout(resolve,1400);}}
    chrome.tabs.onUpdated.addListener(on);
  });
}
async function collectLinks(tabId){
  const [{result=[]}]=await chrome.scripting.executeScript({target:{tabId},func:async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const grab=()=>[...document.querySelectorAll('a[href*="/reel/"]')].map(a=>({href:a.href,text:(a.innerText||a.parentElement?.innerText||'').trim().slice(0,1000)}));
    let all=grab();
    for(let i=0;i<3;i++){window.scrollBy(0,Math.max(window.innerHeight*1.5,900));await wait(900);all=all.concat(grab());}
    const m=new Map();for(const x of all){if(x.href&&/instagram\.com\/reel\//.test(x.href))m.set(x.href,x);}return [...m.values()].slice(0,30);
  }});return result;
}
async function collectDetail(tabId,username,sourceUrl,seedText=''){
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},args:[username,sourceUrl,seedText],func:async(username,sourceUrl,seedText)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<12;i++){const v=document.querySelector('video');if(v?.currentSrc||v?.src)break;await wait(500);}
    const v=document.querySelector('video');
    const meta=(name)=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
    const article=document.querySelector('article');
    const pageText=(article?.innerText||document.body?.innerText||'').trim();
    const caption=(meta('og:description')||pageText||seedText||'').slice(0,5000);
    const videoUrl=v?.currentSrc||v?.src||meta('og:video:secure_url')||meta('og:video')||'';
    const thumbnailUrl=v?.poster||meta('og:image')||'';
    const m=sourceUrl.match(/\/reel\/([A-Za-z0-9_-]+)/);
    return {username,sourceUrl,externalPostId:m?.[1]||'',videoUrl,thumbnailUrl,caption,pageText:pageText.slice(0,5000)};
  }});return result;
}
async function openHidden(url){const tab=await chrome.tabs.create({url,active:false});await waitTab(tab.id);return tab;}

async function runBridge(baseUrl,pin){
  const t=await api(baseUrl,pin,'/api/browser-bridge/targets');const targets=t.items||[];
  const picked=[];
  for(const target of targets){
    let tab=null;
    try{
      tab=await openHidden(`https://www.instagram.com/${encodeURIComponent(target.username)}/reels/`);
      const links=await collectLinks(tab.id);
      if(links.length){const choice=links[Math.floor(Math.random()*links.length)];picked.push({username:target.username,...choice});}
    }catch(e){console.warn('[ME Bridge] profile failed',target.username,e);}finally{if(tab?.id)await chrome.tabs.remove(tab.id).catch(()=>{});}
    await sleep(900);
  }
  const candidates=[];
  for(const p of picked){
    let tab=null;
    try{
      tab=await openHidden(p.href);
      const d=await collectDetail(tab.id,p.username,p.href,p.text);
      if(d?.videoUrl&&d?.externalPostId)candidates.push(d);
    }catch(e){console.warn('[ME Bridge] reel failed',p.href,e);}finally{if(tab?.id)await chrome.tabs.remove(tab.id).catch(()=>{});}
    await sleep(1000);
  }
  const submitted=await api(baseUrl,pin,'/api/browser-bridge/submit',{method:'POST',body:JSON.stringify({candidates})});
  return {ok:true,targets:targets.length,candidates:candidates.length,selected:submitted.selected||0};
}

chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  if(msg?.type==='RUN_BRIDGE'){
    runBridge(String(msg.baseUrl||'').replace(/\/$/,''),String(msg.pin||''))
      .then(sendResponse).catch(err=>sendResponse({ok:false,error:String(err?.message||err)}));
    return true;
  }
  if(msg?.type==='RUN_BRIDGE_FROM_ADMIN'){
    (async()=>{
      const saved=await chrome.storage.local.get(['baseUrl','pin']);
      const pageBase=String(msg.baseUrl||'').replace(/\/$/,'');
      const baseUrl=String(saved.baseUrl||pageBase).replace(/\/$/,'');
      const pin=String(saved.pin||'');
      if(!pin)throw new Error('Chrome Bridge 관리자 PIN이 저장되지 않았습니다. 확장프로그램에서 한 번만 설정해 주세요.');
      if(saved.baseUrl&&pageBase&&baseUrl!==pageBase)throw new Error('Chrome Bridge의 ME 서버 주소가 현재 관리자 페이지와 다릅니다. 확장프로그램 설정을 확인해 주세요.');
      return runBridge(baseUrl,pin);
    })().then(sendResponse).catch(err=>sendResponse({ok:false,error:String(err?.message||err)}));
    return true;
  }
});
