const autoStatus=document.querySelector('#autoStatus');
function setAutoStatus(text,type=''){if(!autoStatus)return;autoStatus.textContent=text;autoStatus.className='auto-status'+(type?` ${type}`:'');}
async function autoApi(url){const r=await fetch(url);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
async function refreshAutoState({refreshResults=false}={}){
  const s=await autoApi('/api/discovery-auto/status');
  const missing=[];if(!s.instagramTargets)missing.push('Instagram 벤치마킹 계정');if(!s.services?.openai)missing.push('OpenAI API');if(!s.services?.serpapi)missing.push('SerpApi');if(!s.services?.coupang)missing.push('쿠팡 API');if(!s.services?.publicBaseUrl)missing.push('Public URL');
  if(missing.length)setAutoStatus(`필수 설정 필요 · ${missing.join(' / ')}`,'warn');
  else setAutoStatus(`Chrome 브리지 준비 완료 · 벤치마킹 계정 ${s.instagramTargets}개 · 확장프로그램에서 수집 시작을 누르면 전체 후보 중 최대 3개만 분석합니다`,'ok');
  if(refreshResults){if(typeof window.loadPosts==='function')await window.loadPosts();if(typeof window.loadStats==='function')await window.loadStats();}
  return s;
}
window.loadAutoStatus=()=>refreshAutoState();
refreshAutoState().catch(e=>setAutoStatus(`브리지 상태 확인 실패 · ${e.message}`,'warn'));
setInterval(()=>refreshAutoState({refreshResults:true}).catch(()=>{}),10000);
