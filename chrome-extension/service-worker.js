const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function api(baseUrl,pin,path,opt={}){
  const r=await fetch(`${baseUrl}${path}`,{...opt,headers:{'content-type':'application/json','x-admin-pin':pin,...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`ME HTTP ${r.status}`);return j;
}
async function waitTab(tabId,timeout=25000){
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(on);resolve();},timeout);
    function on(id,info){if(id===tabId&&info.status==='complete'){clearTimeout(timer);chrome.tabs.onUpdated.removeListener(on);setTimeout(resolve,2800);}}
    chrome.tabs.onUpdated.addListener(on);
  });
}
async function collectLinks(tabId){
  const [{result={links:[],debug:{}}}]=await chrome.scripting.executeScript({target:{tabId},func:async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const normalizeHref=h=>{try{return new URL(h,location.origin).href}catch{return ''}};
    const map=new Map();
    function add(href,text=''){
      const full=normalizeHref(href);
      const m=full.match(/instagram\.com\/reel\/([A-Za-z0-9_-]+)/i);
      if(!m)return;
      const clean=`https://www.instagram.com/reel/${m[1]}/`;
      const prev=map.get(clean);
      if(!prev||String(text).length>String(prev.text||'').length)map.set(clean,{href:clean,text:String(text||'').trim().slice(0,1600)});
    }
    function scanDom(){
      for(const a of document.querySelectorAll('a[href]')){
        const h=a.getAttribute('href')||'';
        if(h.includes('/reel/'))add(h,a.innerText||a.parentElement?.innerText||'');
      }
    }
    function scanHtml(){
      const html=document.documentElement?.innerHTML||'';
      const patterns=[
        /(?:https?:\\?\/\\?\/www\.instagram\.com)?\\?\/reel\\?\/([A-Za-z0-9_-]{5,})\\?\//g,
        /"shortcode"\s*:\s*"([A-Za-z0-9_-]{5,})"/g,
        /"code"\s*:\s*"([A-Za-z0-9_-]{5,})"/g
      ];
      for(const re of patterns){let m;let guard=0;while((m=re.exec(html))&&guard++<200)add(`/reel/${m[1]}/`,'');}
    }
    scanDom();scanHtml();
    for(let i=0;i<6;i++){
      window.scrollBy(0,Math.max(window.innerHeight*1.7,1100));
      await wait(1400);
      scanDom();scanHtml();
      if(map.size>=12)break;
    }
    const body=(document.body?.innerText||'').slice(0,2500);
    return {links:[...map.values()].slice(0,40),debug:{url:location.href,title:document.title,count:map.size,body:body.slice(0,500)}};
  }});
  console.log('[ME Bridge] link scan',result?.debug||{});
  return result?.links||[];
}
function productLinkScore(x){
  const s=String(x?.text||'').toLowerCase();let score=0;
  if(/제품|상품|구매|링크|프로필|인포크|쿠팡|공구|추천|제품정보|구매정보/.test(s))score+=100;
  if(/살림|수납|주방|생활|차량|육아|반려|꿀템|아이템|템|정리|청소|가전|홈/.test(s))score+=40;
  if(/댓글|검색|궁금|정보/.test(s))score+=25;
  return score+Math.random()*3;
}
async function collectDetail(tabId,username,sourceUrl,seedText=''){
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},args:[username,sourceUrl,seedText],func:async(username,sourceUrl,seedText)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<20;i++){const v=document.querySelector('video');if(v?.currentSrc||v?.src)break;await wait(600);}
    const v=document.querySelector('video');
    const meta=(name)=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
    const article=document.querySelector('article');
    const pageText=(article?.innerText||document.body?.innerText||'').trim();
    const caption=(meta('og:description')||pageText||seedText||'').slice(0,5000);
    const html=document.documentElement?.innerHTML||'';
    const embedded=(html.match(/"video_url"\s*:\s*"(https:[^"]+)"/)||[])[1]||'';
    const unescapeUrl=s=>String(s||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/');
    const rawVideo=v?.currentSrc||v?.src||meta('og:video:secure_url')||meta('og:video')||unescapeUrl(embedded)||'';
    const videoUrl=/^https?:\/\//i.test(rawVideo)?rawVideo:'';
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
      console.log(`[ME Bridge] account=${target.username} reelLinks=${links.length}`);
      if(links.length){const choice=[...links].sort((a,b)=>productLinkScore(b)-productLinkScore(a))[0];picked.push({username:target.username,...choice});}
    }catch(e){console.warn('[ME Bridge] profile failed',target.username,e);}finally{if(tab?.id)await chrome.tabs.remove(tab.id).catch(()=>{});}
    await sleep(1200);
  }
  const candidates=[];
  for(const p of picked){
    let tab=null;
    try{
      tab=await openHidden(p.href);
      const d=await collectDetail(tab.id,p.username,p.href,p.text);
      console.log(`[ME Bridge] reel=${p.href} video=${d?.videoUrl?'yes':'no'}`);
      if(d?.videoUrl&&d?.externalPostId)candidates.push(d);
    }catch(e){console.warn('[ME Bridge] reel failed',p.href,e);}finally{if(tab?.id)await chrome.tabs.remove(tab.id).catch(()=>{});}
    await sleep(1200);
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
