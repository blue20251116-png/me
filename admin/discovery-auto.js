const autoBtn=document.querySelector('#autoDiscover');
const autoStatus=document.querySelector('#autoStatus');
let autoPoll=null;

function setAutoStatus(text,type=''){
  if(!autoStatus)return;
  autoStatus.textContent=text;
  autoStatus.className='auto-status'+(type?` ${type}`:'');
}
async function autoApi(url,opt){const r=await fetch(url,opt);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
function runText(run){
  if(!run)return '';
  if(run.running){
    if(run.stage==='COLLECTING')return '1/2 Instagram 공개 프로필에서 새 Reels를 직접 찾는 중입니다';
    if(run.stage==='ANALYZING')return `2/2 영상 분석·인포크/쿠팡 매칭 중 ${Number(run.processed||0)}/${Number(run.queued||0)} · 성공 ${Number(run.succeeded||0)} · 실패 ${Number(run.failed||0)}`;
    return run.message||'자동 작업 진행 중';
  }
  if(run.stage==='DONE')return run.message||'자동 작업 완료';
  if(run.stage==='FAILED')return run.message||'자동 작업 실패';
  return '';
}
async function refreshAutoState({refreshResults=false}={}){
  const s=await autoApi('/api/discovery-auto/status');const r=s.run||{};
  if(r.running){autoBtn.disabled=true;autoBtn.textContent='Instagram 자동 작업 진행 중…';setAutoStatus(runText(r),'ok');return true;}
  autoBtn.disabled=false;autoBtn.textContent='🚀 Instagram 한 번에 자동 실행';
  if(r.stage==='DONE')setAutoStatus(runText(r),'ok');
  else if(r.stage==='FAILED')setAutoStatus(runText(r),'warn');
  else if(s.instagramTargets>0&&s.services?.openai&&s.services?.serpapi&&s.services?.coupang&&s.services?.publicBaseUrl)setAutoStatus('Instagram 직접수집 + OpenAI + SerpApi + 쿠팡 준비 완료 · Apify 없이 실행됩니다','ok');
  else{
    const missing=[];if(!s.instagramTargets)missing.push('Instagram 벤치마킹 계정');if(!s.services?.openai)missing.push('OpenAI API');if(!s.services?.serpapi)missing.push('SerpApi');if(!s.services?.coupang)missing.push('쿠팡 API');if(!s.services?.publicBaseUrl)missing.push('Public URL');
    setAutoStatus(`필수 설정 필요 · ${missing.join(' / ')}`,'warn');
  }
  if(refreshResults){if(typeof window.loadPosts==='function')await window.loadPosts();if(typeof window.loadStats==='function')await window.loadStats();}
  return false;
}
function startAutoPoll(){
  clearInterval(autoPoll);autoPoll=setInterval(async()=>{try{const running=await refreshAutoState();if(!running){clearInterval(autoPoll);autoPoll=null;await refreshAutoState({refreshResults:true});}}catch(e){clearInterval(autoPoll);autoPoll=null;autoBtn.disabled=false;autoBtn.textContent='🚀 Instagram 한 번에 자동 실행';setAutoStatus(e.message,'warn');}},2500);
}
if(autoBtn){
  autoBtn.textContent='🚀 Instagram 한 번에 자동 실행';
  autoBtn.addEventListener('click',async()=>{autoBtn.disabled=true;autoBtn.textContent='자동 작업 시작 중…';setAutoStatus('Instagram 직접 수집 → 인포크 상품 확인 → 필요 시 Lens/AI → 쿠팡 매칭을 시작합니다');try{await autoApi('/api/discovery-auto/run',{method:'POST'});startAutoPoll();}catch(e){autoBtn.disabled=false;autoBtn.textContent='🚀 Instagram 한 번에 자동 실행';setAutoStatus(e.message,'warn');}});
}
window.loadAutoStatus=()=>refreshAutoState();
refreshAutoState().then(running=>{if(running)startAutoPoll()}).catch(e=>setAutoStatus(`자동 상태 확인 실패 · ${e.message}`,'warn'));
