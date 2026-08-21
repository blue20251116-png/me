const autoBtn=document.querySelector('#autoDiscover');
const autoStatus=document.querySelector('#autoStatus');
let autoPoll=null;

function setAutoStatus(text,type=''){
  if(!autoStatus)return;
  autoStatus.textContent=text;
  autoStatus.className='auto-status'+(type?` ${type}`:'');
}

async function autoApi(url,opt){
  const r=await fetch(url,opt);
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);
  return j;
}

function runText(run){
  if(!run)return '';
  if(run.running){
    if(run.stage==='COLLECTING')return '1/2 중국 인기 상품영상을 찾는 중입니다';
    if(run.stage==='ANALYZING')return `2/2 영상 분석·자막 제거·쿠팡 매칭 중 ${Number(run.processed||0)}/${Number(run.queued||0)} · 성공 ${Number(run.succeeded||0)}`;
    return run.message||'자동 작업 진행 중';
  }
  if(run.stage==='DONE')return run.message||'자동 작업 완료';
  if(run.stage==='FAILED')return run.message||'자동 작업 실패';
  return '';
}

async function refreshAutoState({refreshResults=false}={}){
  const s=await autoApi('/api/discovery-auto/status');
  const connected=[];
  if(s.collectors?.DOUYIN)connected.push('Douyin');
  if(s.collectors?.XIAOHONGSHU)connected.push('Xiaohongshu');
  const r=s.run||{};
  if(r.running){
    autoBtn.disabled=true;
    autoBtn.textContent='자동 작업 진행 중…';
    setAutoStatus(runText(r),'ok');
    return true;
  }
  autoBtn.disabled=false;
  autoBtn.textContent='🚀 한 번에 전부 자동 실행';
  if(r.stage==='DONE')setAutoStatus(runText(r),'ok');
  else if(r.stage==='FAILED')setAutoStatus(runText(r),'warn');
  else if(s.ready)setAutoStatus(`${connected.join(' + ')} 자동 수집기 연결됨 · 버튼 한 번으로 수집→분석→쿠팡 매칭까지 실행됩니다`,'ok');
  else setAutoStatus('자동 수집기 연결이 필요합니다 · Collector 연결 후 버튼 한 번으로 전 과정이 실행됩니다','warn');
  if(refreshResults){
    if(typeof window.loadPosts==='function')await window.loadPosts();
    if(typeof window.loadStats==='function')await window.loadStats();
  }
  return false;
}

function startAutoPoll(){
  clearInterval(autoPoll);
  autoPoll=setInterval(async()=>{
    try{
      const running=await refreshAutoState();
      if(!running){clearInterval(autoPoll);autoPoll=null;await refreshAutoState({refreshResults:true});}
    }catch(e){clearInterval(autoPoll);autoPoll=null;autoBtn.disabled=false;autoBtn.textContent='🚀 한 번에 전부 자동 실행';setAutoStatus(e.message,'warn');}
  },2500);
}

if(autoBtn){
  autoBtn.textContent='🚀 한 번에 전부 자동 실행';
  autoBtn.addEventListener('click',async()=>{
    autoBtn.disabled=true;
    autoBtn.textContent='자동 작업 시작 중…';
    setAutoStatus('중국 인기영상 수집 → 자막 제거 → 상품 판독 → 쿠팡 매칭을 시작합니다');
    try{await autoApi('/api/discovery-auto/run',{method:'POST'});startAutoPoll();}
    catch(e){autoBtn.disabled=false;autoBtn.textContent='🚀 한 번에 전부 자동 실행';setAutoStatus(e.message,'warn');}
  });
}

refreshAutoState().then(running=>{if(running)startAutoPoll()}).catch(e=>setAutoStatus(`자동 상태 확인 실패 · ${e.message}`,'warn'));
