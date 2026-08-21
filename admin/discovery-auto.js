const autoBtn=document.querySelector('#autoDiscover');
const autoStatus=document.querySelector('#autoStatus');

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

async function loadAutoStatus(){
  try{
    const s=await autoApi('/api/discovery-auto/status');
    const connected=[];
    if(s.collectors?.DOUYIN)connected.push('Douyin');
    if(s.collectors?.XIAOHONGSHU)connected.push('Xiaohongshu');
    if(s.ready){
      setAutoStatus(`${connected.join(' + ')} 자동 수집기 연결됨 · 현재 수집 영상 ${Number(s.posts||0)}개`,'ok');
    }else{
      setAutoStatus('자동 수집기 연결이 필요합니다 · Railway Variables에 DOUYIN_COLLECTOR_ENDPOINT 또는 XIAOHONGSHU_COLLECTOR_ENDPOINT를 설정해 주세요','warn');
    }
  }catch(e){
    setAutoStatus(`자동 수집 상태 확인 실패 · ${e.message}`,'warn');
  }
}

if(autoBtn){
  autoBtn.addEventListener('click',async()=>{
    const old=autoBtn.textContent;
    autoBtn.disabled=true;
    autoBtn.textContent='중국 인기 영상 찾는 중…';
    setAutoStatus('도우인·샤오홍슈 인기 상품 키워드를 검색하고 있습니다');
    try{
      const r=await autoApi('/api/discovery-auto/run',{method:'POST'});
      setAutoStatus(`완료 · 새 영상 ${Number(r.newPosts||0)}개 발견 · 전체 ${Number(r.totalPosts||0)}개`,'ok');
      if(typeof window.loadPosts==='function')await window.loadPosts();
      if(typeof window.loadStats==='function')await window.loadStats();
    }catch(e){
      setAutoStatus(e.message,'warn');
    }finally{
      autoBtn.disabled=false;
      autoBtn.textContent=old;
    }
  });
}

loadAutoStatus();
