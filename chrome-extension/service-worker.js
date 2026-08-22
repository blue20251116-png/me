const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MAX_FINAL=3;
const TARGET_BUFFER=4;
const BATCH_SIZE=2;

function validReelCode(code=''){
  const s=String(code||'').trim();
  return /^[A-Za-z0-9_-]{8,30}$/.test(s)&&!/^[a-z]{2}_[A-Z]{2}$/.test(s);
}
function uniqueUrls(values=[]){
  const seen=new Set();const out=[];
  for(const raw of values){
    const v=String(raw||'').trim();
    if(!/^https?:\/\//i.test(v)||seen.has(v))continue;
    seen.add(v);out.push(v);
  }
  return out;
}
async function api(baseUrl,pin,path,opt={}){
  const r=await fetch(`${baseUrl}${path}`,{...opt,headers:{'content-type':'application/json','x-admin-pin':pin,...(opt.headers||{})}});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||`ME HTTP ${r.status}`);
  return j;
}
async function waitTab(tabId,timeout=14000){
  return new Promise(resolve=>{
    const timer=setTimeout(()=>{chrome.tabs.onUpdated.removeListener(on);resolve();},timeout);
    function on(id,info){
      if(id===tabId&&info.status==='complete'){
        clearTimeout(timer);chrome.tabs.onUpdated.removeListener(on);setTimeout(resolve,900);
      }
    }
    chrome.tabs.onUpdated.addListener(on);
  });
}
async function openHidden(url){const tab=await chrome.tabs.create({url,active:false});await waitTab(tab.id);return tab;}

async function collectProfileCandidates(tabId,username){
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},args:[username],func:async(username)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const valid=s=>/^[A-Za-z0-9_-]{8,30}$/.test(String(s||''))&&!/^[a-z]{2}_[A-Z]{2}$/.test(String(s||''));
    const map=new Map();
    const add=(code,text='',source='dom')=>{
      if(!valid(code))return;
      const href=`https://www.instagram.com/reel/${code}/`;
      if(!map.has(href)||String(text).length>String(map.get(href)?.text||'').length)map.set(href,{href,text:String(text||'').slice(0,1400),source});
    };
    const addHref=(href,text='',source='dom')=>{
      try{const u=new URL(href,location.origin);const m=u.pathname.match(/^\/reel\/([A-Za-z0-9_-]+)/);if(m)add(m[1],text,source);}catch{}
    };
    const diag={pageUrl:location.href,title:document.title,apiStatus:0,apiEdges:0,domAnchors:0,domReels:0,htmlShortcodes:0,bodyPreview:''};
    try{
      const r=await fetch(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,{
        credentials:'include',
        headers:{'X-IG-App-ID':'936619743392459','X-Requested-With':'XMLHttpRequest','Accept':'*/*'}
      });
      diag.apiStatus=r.status;
      if(r.ok){
        const j=await r.json();
        const user=j?.data?.user||j?.user||{};
        const buckets=[user?.edge_owner_to_timeline_media?.edges,user?.edge_felix_video_timeline?.edges,user?.edge_clips_grid?.edges];
        for(const edges of buckets){
          if(!Array.isArray(edges))continue;
          diag.apiEdges+=edges.length;
          for(const e of edges){
            const n=e?.node||e?.media||e||{};
            const code=n.shortcode||n.code||n.media_code||'';
            const isVideo=n.is_video===true||n.media_type===2||n.product_type==='clips'||n.__typename==='GraphVideo';
            if(isVideo&&valid(code))add(code,n?.edge_media_to_caption?.edges?.[0]?.node?.text||n.caption?.text||'','profile-api');
          }
        }
      }
    }catch(e){diag.apiError=String(e?.message||e).slice(0,180);}
    const scanDom=()=>{
      const all=[...document.querySelectorAll('a[href]')];diag.domAnchors=Math.max(diag.domAnchors,all.length);
      for(const a of all){
        const href=a.getAttribute('href')||'';
        if(href.includes('/reel/')){diag.domReels++;addHref(href,a.innerText||a.parentElement?.innerText||'','dom');}
      }
      const html=document.documentElement?.innerHTML||'';
      for(const re of [/\\?\/reel\\?\/([A-Za-z0-9_-]{8,30})\\?\//g,/"shortcode"\s*:\s*"([A-Za-z0-9_-]{8,30})"/g]){
        let m,guard=0;while((m=re.exec(html))&&guard++<150){if(valid(m[1])){diag.htmlShortcodes++;add(m[1],'','html');}}
      }
    };
    scanDom();
    if(map.size<3){window.scrollBy(0,1000);await wait(700);scanDom();}
    if(map.size<3){window.scrollBy(0,1200);await wait(700);scanDom();}
    diag.bodyPreview=String(document.body?.innerText||'').replace(/\s+/g,' ').slice(0,220);
    return {links:[...map.values()].slice(0,15),diag};
  }});
  return result||{links:[],diag:{}};
}

function productLinkScore(x){
  const s=String(x?.text||'').toLowerCase();let score=0;
  if(/제품|상품|구매|링크|프로필|인포크|쿠팡|공구|추천|제품정보|구매정보/.test(s))score+=100;
  if(/살림|수납|주방|생활|차량|육아|반려|꿀템|아이템|템|정리|청소|가전|홈/.test(s))score+=40;
  if(/댓글|검색|궁금|정보/.test(s))score+=25;
  if(x?.source==='profile-api')score+=15;
  return score;
}

async function collectDetail(tabId,username,sourceUrl,seedText=''){
  const [{result}]=await chrome.scripting.executeScript({target:{tabId},args:[username,sourceUrl,seedText],func:async(username,sourceUrl,seedText)=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    for(let i=0;i<12;i++){
      const v=document.querySelector('video');const src=v?.currentSrc||v?.src||v?.querySelector('source')?.src;
      if(src&&src!=='about:blank')break;await wait(350);
    }
    const v=document.querySelector('video');
    const meta=name=>document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.content||'';
    const article=document.querySelector('article');
    const pageText=(article?.innerText||document.body?.innerText||'').trim();
    const caption=(meta('og:description')||pageText||seedText||'').slice(0,5000);
    const html=document.documentElement?.innerHTML||'';
    const unescapeUrl=s=>String(s||'').replace(/\\u0026/g,'&').replace(/\\u0025/g,'%').replace(/\\\//g,'/').replace(/&amp;/g,'&');
    const embedded=[];
    for(const re of [/"video_url"\s*:\s*"(https:[^"]+)"/g,/"url"\s*:\s*"(https:[^"]+(?:cdninstagram|fbcdn)[^"]*)"/g]){
      let m,guard=0;while((m=re.exec(html))&&guard++<80)embedded.push(unescapeUrl(m[1]));
    }
    const perf=(performance.getEntriesByType('resource')||[])
      .map(x=>String(x.name||''))
      .filter(x=>/^https:\/\//.test(x)&&/(cdninstagram|fbcdn)/i.test(x)&&/(video|\.mp4|bytestart|byteend|oe=)/i.test(x));
    const dom=v?.currentSrc||v?.src||v?.querySelector('source')?.src||'';
    const all=[dom,meta('og:video:secure_url'),meta('og:video'),...embedded,...perf].map(unescapeUrl).filter(x=>/^https?:\/\//i.test(x));
    const uniq=[...new Set(all)].slice(0,12);
    const m=sourceUrl.match(/\/reel\/([A-Za-z0-9_-]+)/);
    return {username,sourceUrl,externalPostId:m?.[1]||'',videoUrl:uniq[0]||'',videoUrls:uniq,thumbnailUrl:v?.poster||meta('og:image')||'',caption,pageText:pageText.slice(0,5000)};
  }});
  return result;
}

function noteMirrorError(diag,reel,reason){
  diag.mirrorErrors=diag.mirrorErrors||[];
  if(diag.mirrorErrors.length<12)diag.mirrorErrors.push({reel:String(reel||''),reason:String(reason||'').slice(0,180)});
}
async function fetchCandidateBuffer(url){
  const tries=[
    {credentials:'include',cache:'no-store'},
    {credentials:'omit',cache:'no-store'},
    {credentials:'include',cache:'no-store',headers:{Range:'bytes=0-'}}
  ];
  let last='';
  for(const opt of tries){
    try{
      const r=await fetch(url,opt);
      if(!r.ok){last=`CDN HTTP ${r.status}`;continue;}
      const contentType=String(r.headers.get('content-type')||'').toLowerCase();
      if(contentType&&(contentType.startsWith('text/')||contentType.startsWith('image/')||contentType.includes('json'))){last=`not-video ${contentType}`;continue;}
      const blob=await r.blob();
      if(blob.size<100*1024){last=`too-small ${blob.size}`;continue;}
      if(blob.size>95*1024*1024){last=`too-large ${blob.size}`;continue;}
      const buffer=await blob.arrayBuffer();
      const head=new Uint8Array(buffer.slice(0,32));
      const text=String.fromCharCode(...head);
      if(!text.includes('ftyp')){last=`no-ftyp size=${blob.size}`;continue;}
      return {buffer,size:blob.size,contentType};
    }catch(e){last=String(e?.message||e);}
  }
  throw new Error(last||'video fetch failed');
}
async function mirrorVideo(baseUrl,pin,d,diag){
  const urls=uniqueUrls([...(Array.isArray(d?.videoUrls)?d.videoUrls:[]),d?.videoUrl]).slice(0,8);
  if(!urls.length||!validReelCode(d.externalPostId))return d;
  diag.videoUrlFound++;
  let lastError='';
  for(let i=0;i<urls.length;i++){
    try{
      const got=await fetchCandidateBuffer(urls[i]);
      const up=await fetch(`${baseUrl}/api/browser-bridge/upload-video/${encodeURIComponent(d.externalPostId)}`,{
        method:'POST',headers:{'x-admin-pin':pin,'content-type':'video/mp4'},body:got.buffer
      });
      const j=await up.json().catch(()=>({}));
      if(!up.ok)throw new Error(j.error||`upload HTTP ${up.status}`);
      diag.mirrored++;
      console.log(`[ME Bridge] mirrored reel=${d.externalPostId} candidate=${i+1}/${urls.length} bytes=${j.bytes||got.size}`);
      return {...d,videoUrl:j.url||urls[i],videoUrls:urls,mirrored:true};
    }catch(e){
      lastError=`candidate ${i+1}/${urls.length}: ${String(e?.message||e)}`;
      console.warn(`[ME Bridge] mirror candidate failed reel=${d.externalPostId} ${lastError}`);
    }
  }
  diag.mirrorFailed++;
  noteMirrorError(diag,d.externalPostId,lastError);
  return {...d,videoUrl:'',videoUrls:urls,mirrored:false};
}

async function candidateFromTarget(target,baseUrl,pin,diag){
  diag.accountsChecked++;
  let profileTab=null;
  try{
    profileTab=await openHidden(`https://www.instagram.com/${encodeURIComponent(target.username)}/`);
    const found=await collectProfileCandidates(profileTab.id,target.username);
    const links=(found.links||[]).sort((a,b)=>productLinkScore(b)-productLinkScore(a));
    diag.linksFound+=links.length;
    diag.profileDiagnostics=diag.profileDiagnostics||[];
    diag.profileDiagnostics.push({username:target.username,...(found.diag||{}),links:links.length});
    console.log(`[ME Bridge] account=${target.username} links=${links.length} apiStatus=${found.diag?.apiStatus||0} apiEdges=${found.diag?.apiEdges||0} domReels=${found.diag?.domReels||0} url=${found.diag?.pageUrl||'-'} title=${found.diag?.title||'-'}`);
    for(const choice of links.slice(0,3)){
      let detailTab=null;
      try{
        diag.detailsTried++;
        detailTab=await openHidden(choice.href);
        let d=await collectDetail(detailTab.id,target.username,choice.href,choice.text);
        if(!validReelCode(d?.externalPostId))continue;
        if((d?.videoUrls?.length||0)>0){d=await mirrorVideo(baseUrl,pin,d,diag);if(d?.mirrored)return d;}
      }catch(e){console.warn('[ME Bridge] detail failed',choice.href,e);}finally{if(detailTab?.id)await chrome.tabs.remove(detailTab.id).catch(()=>{});}
    }
  }catch(e){console.warn('[ME Bridge] profile failed',target.username,e);}finally{if(profileTab?.id)await chrome.tabs.remove(profileTab.id).catch(()=>{});}
  return null;
}

async function runBridge(baseUrl,pin){
  const t=await api(baseUrl,pin,'/api/browser-bridge/targets');const targets=t.items||[];
  const candidates=[];const seen=new Set();let checked=0;
  const diagnostics={accountsChecked:0,linksFound:0,detailsTried:0,videoUrlFound:0,mirrored:0,mirrorFailed:0,mirrorErrors:[],profileDiagnostics:[]};
  for(let i=0;i<targets.length&&candidates.length<TARGET_BUFFER;i+=BATCH_SIZE){
    const batch=targets.slice(i,i+BATCH_SIZE);checked+=batch.length;
    const results=await Promise.all(batch.map(target=>candidateFromTarget(target,baseUrl,pin,diagnostics)));
    for(const d of results){if(!d||!validReelCode(d.externalPostId)||seen.has(d.externalPostId))continue;seen.add(d.externalPostId);candidates.push(d);if(candidates.length>=TARGET_BUFFER)break;}
    console.log(`[ME Bridge] progress checked=${checked}/${targets.length} valid=${candidates.length}/${TARGET_BUFFER}`);
    if(candidates.length>=TARGET_BUFFER)break;
    await sleep(200);
  }
  const submitted=await api(baseUrl,pin,'/api/browser-bridge/submit',{method:'POST',body:JSON.stringify({candidates:candidates.slice(0,TARGET_BUFFER),diagnostics})});
  return {ok:true,targets:checked,candidates:candidates.length,selected:Math.min(Number(submitted.selected||0),MAX_FINAL),stoppedEarly:checked<targets.length,diagnostics};
}

chrome.runtime.onMessage.addListener((msg,_sender,sendResponse)=>{
  if(msg?.type==='RUN_BRIDGE'){
    runBridge(String(msg.baseUrl||'').replace(/\/$/,''),String(msg.pin||'')).then(sendResponse).catch(err=>sendResponse({ok:false,error:String(err?.message||err)}));return true;
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
    })().then(sendResponse).catch(err=>sendResponse({ok:false,error:String(err?.message||err)}));return true;
  }
});
