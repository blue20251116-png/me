const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MAX_FINAL=3;
const TARGET_BUFFER=4;
const BATCH_SIZE=2;

async function api(baseUrl,pin,path,opt={}){
  const r=await fetch(`${baseUrl}${path}`,{...opt,headers:{'content-type':'application/json','x-admin-pin':pin,...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`ME HTTP ${r.status}`);return j;
}
async function waitTab(tabId,timeout=12000){
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(on);resolve();},timeout);
    function on(id,info){if(id===tabId&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(on);setTimeout(resolve,1200);}}
    chrome.tabs.onUpdated.addListener(on);
  });
}
async function collectLinks(tabId){
  const [{result=[]}]=await chrome.scripting.executeScript({target:{tabId},func:async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const map=new Map();
    const add=(href,text='')=>{try{const full=new URL(href,location.origin).href;const m=full.match(/instagram\.com\/reel\/([A-Za-z0-9_-]+)/i);if(!m)return;const clean=`https://www.instagram.com/reel/${m[1]}/`;const prev=map.get(clean);if(!prev||String(text).length>String(prev.text||'').length)map.set(clean,{href:clean,text:String(text||'').trim().slice(0,1200)});}catch{}};
    const scan=()=>{
      for(const a of document.querySelectorAll('a[href*="/reel/"]'))add(a.getAttribute('href')||'',a.innerText||a.parentElement?.innerText||'');
      const html=document.documentElement?.innerHTML||'';
      for(const re of [/\\?\/reel\\?\/([A-Za-z0-9_-]{5,})\\?\//g,/"shortcode"\s*:\s*"([A-Za-z0-9_-]{5,})"/g,/"code"\s*:\s*"([A-Za-z0-9_-]{5,})"/g]){let m,guard=0;while((m=re.exec(html))&&guard++<100)add(`/reel/${m[1]}/`,'');}
    };
    scan();
    if(map.size<4){window.scrollBy(0,Math.max(window.innerHeight*1.4,900));await wait(650);scan();}
    if(map.size<4){window.scrollBy(0,Math.max(window.innerHeight*1.4,900));await wait(650);scan();}
    return [...map.values()].slice(0,12);
  }});return result;
}
function productLinkScore(x){
  const s=String(x?.text||'').toLowerCase();let score=0;
  if(/제품|상품|구매|링크|프로필|인포크|쿠팡|공구|추천|제품정보|구매정보/.test(s))score+=100;
  if(/살림|수납|주방|생활|차량|육아|반려|꿀템|아이템|템|정리|청소|가전|홈/.test(s))score+=40;
  if(/댓글|검색|궁금|정보/.test(s))score+=25;
  return score;
}
async function collectDetail(tabId,username,sourceUrl,seedText=''){
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},args:[username,sourceUrl,seedText],func:async(username,sourceUrl,seedText)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<8;i++){const v=document.querySelector('video');if(v?.currentSrc||v?.src)break;await wait(350);}
    const v=document.querySelector('video');
    const meta=name=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
    const article=document.querySelector('article');
    const pageText=(article?.innerText||document.body?.innerText||'').trim();
    const caption=(meta('og:description')||pageText||seedText||'').slice(0,5000);
    const html=document.documentElement?.innerHTML||'';
    const embedded=(html.match(/"video_url"\s*:\s*"(https:[^"]+)"/)||[])[1]||'';
    const unescapeUrl=s=>String(s||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
    const rawVideo=v?.currentSrc||v?.src||meta('og:video:secure_url')||meta('og:video')||unescapeUrl(embedded)||'';
    const m=sourceUrl.match(/\/reel\/([A-Za-z0-9_-]+)/);
    return {username,sourceUrl,externalPostId:m?.[1]||'',videoUrl:/^https?:\/\//i.test(rawVideo)?rawVideo:'',thumbnailUrl:v?.poster||meta('og:image')||'',caption,pageText:pageText.slice(0,5000)};
  }});return result;
}
async function openHidden(url){const tab=await chrome.tabs.create({url,active:false});await waitTab(tab.id);return tab;}
async function candidateFromTarget(target){
  let profileTab=null;
  try{
    profileTab=await openHidden(`https://www.instagram.com/${encodeURIComponent(target.username)}/reels/`);
    const links=(await collectLinks(profileTab.id)).sort((a,b)=>productLinkScore(b)-productLinkScore(a));
    console.log(`[ME Bridge] account=${target.username} reelLinks=${links.length}`);
    for(const choice of links.slice(0,2)){
      let detailTab=null;
      try{
        detailTab=await openHidden(choice.href);
        const d=await collectDetail(detailTab.id,target.username,choice.href,choice.text);
        if(d?.videoUrl&&d?.externalPostId){console.log(`[ME Bridge] valid account=${target.username} reel=${d.externalPostId}`);return d;}
      }catch(e){console.warn('[ME Bridge] detail failed',choice.href,e);}finally{if(detailTab?.id)await chrome.tabs.remove(detailTab.id).catch(()=>{});}
    }
  }catch(e){console.warn('[ME Bridge] profile failed',target.username,e);}finally{if(profileTab?.id)await chrome.tabs.remove(profileTab.id).catch(()=>{});}
  return null;
}

async function runBridge(baseUrl,pin){
  const t=await api(baseUrl,pin,'/api/browser-bridge/targets');const targets=t.items||[];
  const candidates=[];const seen=new Set();let checked=0;
  for(let i=0;i<targets.length&&candidates.length<TARGET_BUFFER;i+=BATCH_SIZE){
    const batch=targets.slice(i,i+BATCH_SIZE);checked+=batch.length;
    const results=await Promise.all(batch.map(candidateFromTarget));
    for(const d of results){if(!d||seen.has(d.externalPostId))continue;seen.add(d.externalPostId);candidates.push(d);if(candidates.length>=TARGET_BUFFER)break;}
    console.log(`[ME Bridge] progress checked=${checked}/${targets.length} valid=${candidates.length}/${TARGET_BUFFER}`);
    if(candidates.length>=TARGET_BUFFER)break;
    await sleep(250);
  }
  const submitted=await api(baseUrl,pin,'/api/browser-bridge/submit',{method:'POST',body:JSON.stringify({candidates:candidates.slice(0,TARGET_BUFFER)})});
  return {ok:true,targets:checked,candidates:candidates.length,selected:Math.min(Number(submitted.selected||0),MAX_FINAL),stoppedEarly:checked<targets.length};
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
