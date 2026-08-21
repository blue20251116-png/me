const autoBtn=document.querySelector('#autoDiscover');
const autoStatus=document.querySelector('#autoStatus');
let bridgeReady=false;
let runTimer=null;
let pingTimer=null;
let bridgeRunning=false;
function setAutoStatus(text,type=''){if(!autoStatus)return;autoStatus.textContent=text;autoStatus.className='auto-status'+(type?` ${type}`:'');}
async function autoApi(url){const r=await fetch(url);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
function pingBridge(){window.postMessage({source:'ME_ADMIN',type:'PING_INSTAGRAM_BRIDGE'},'*');}
async function refreshAutoState({refreshResults=false}={}){
  const s=await autoApi('/api/discovery-auto/status');
  const missing=[];if(!s.instagramTargets)missing.push('벤치마킹 계정');if(!s.services?.openai)missing.push('OpenAI');if(!s.services?.serpapi)missing.push('SerpApi');if(!s.services?.coupang)missing.push('쿠팡 API');if(!s.services?.publicBaseUrl)missing.push('Public URL');
  if(bridgeRunning){if(autoBtn)autoBtn.disabled=true;setAutoStatus('Chrome Bridge 수집 진행 중 · Instagram 계정과 Reel 페이지를 순서대로 확인하고 있습니다','ok');}
  else if(missing.length){setAutoStatus(`관리자 설정 필요 · ${missing.join(' / ')}`,'warn');if(autoBtn)autoBtn.disabled=true;}
  else if(!bridgeReady){setAutoStatus('Chrome Bridge 연결 확인 중 · 확장프로그램이 설치되어 있고 이 사이트 접근 권한이 허용되어 있어야 합니다','warn');if(autoBtn)autoBtn.disabled=true;pingBridge();}
  else{if(autoBtn)autoBtn.disabled=false;setAutoStatus(`Chrome Bridge 연결됨 · 벤치마킹 계정 ${s.instagramTargets}개 · 실행 시 전체 후보 중 최대 3개만 분석합니다`,'ok');}
  if(refreshResults){if(typeof window.loadPosts==='function')await window.loadPosts();if(typeof window.loadStats==='function')await window.loadStats();}
  return s;
}
window.addEventListener('message',event=>{
  const msg=event.data||{};if(msg?.source!=='ME_INSTAGRAM_BRIDGE')return;
  if(msg.type==='READY'){
    bridgeReady=true;
    if(pingTimer){clearInterval(pingTimer);pingTimer=null;}
    if(!bridgeRunning)refreshAutoState().catch(()=>{});
    return;
  }
  if(msg.type==='STARTED'){
    clearTimeout(runTimer);runTimer=null;bridgeRunning=true;
    if(autoBtn){autoBtn.disabled=true;autoBtn.textContent='Instagram 수집 진행 중…';}
    setAutoStatus('Chrome Bridge 실행 시작됨 · 벤치마킹 계정을 순회하고 있습니다','ok');
    return;
  }
  if(msg.type==='RESULT'){
    clearTimeout(runTimer);runTimer=null;bridgeRunning=false;if(autoBtn){autoBtn.disabled=false;autoBtn.textContent='🚀 Instagram 수집 시작';}
    const r=msg.result||{};
    if(!r.ok){setAutoStatus(`수집 실패 · ${r.error||'알 수 없는 오류'}`,'warn');return;}
    setAutoStatus(`수집 완료 · 계정 ${r.targets||0}개 확인 · 후보 ${r.candidates||0}개 · ME 저장 ${r.selected||0}개 · 자동 분석 진행 중`,'ok');
    setTimeout(()=>refreshAutoState({refreshResults:true}).catch(()=>{}),2500);
    setTimeout(()=>refreshAutoState({refreshResults:true}).catch(()=>{}),10000);
  }
});
if(autoBtn){
  autoBtn.addEventListener('click',async()=>{
    try{
      const s=await refreshAutoState();
      if(!bridgeReady){setAutoStatus('Chrome Bridge가 아직 연결되지 않았습니다 · chrome://extensions → ME Instagram Reel Bridge → 세부정보 → 사이트 액세스에서 현재 ME 사이트를 허용한 뒤 이 페이지를 새로고침해 주세요','warn');return;}
      if(!s.instagramTargets||!s.services?.openai||!s.services?.serpapi||!s.services?.coupang||!s.services?.publicBaseUrl)return;
      autoBtn.disabled=true;autoBtn.textContent='Chrome에 작업 요청 중…';setAutoStatus('Chrome Bridge에 Instagram 수집 작업을 요청하고 있습니다','ok');
      window.postMessage({source:'ME_ADMIN',type:'RUN_INSTAGRAM_BRIDGE'},'*');
      clearTimeout(runTimer);runTimer=setTimeout(()=>{if(bridgeRunning)return;autoBtn.disabled=false;autoBtn.textContent='🚀 Instagram 수집 시작';setAutoStatus('Chrome Bridge 시작 확인을 받지 못했습니다 · 확장프로그램과 ME 페이지를 모두 새로고침해 주세요','warn');},8000);
    }catch(e){bridgeRunning=false;autoBtn.disabled=false;autoBtn.textContent='🚀 Instagram 수집 시작';setAutoStatus(e.message,'warn');}
  });
}
window.loadAutoStatus=()=>refreshAutoState();
pingBridge();
pingTimer=setInterval(()=>{if(!bridgeReady)pingBridge();else{clearInterval(pingTimer);pingTimer=null;}},1000);
refreshAutoState().catch(e=>setAutoStatus(`상태 확인 실패 · ${e.message}`,'warn'));
setInterval(()=>refreshAutoState().catch(()=>{}),15000);
