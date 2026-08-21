const byId=id=>document.getElementById(id);
function statusChip(label,ok){return `<span class="status-pill ${ok?'ready':''}">${label} ${ok?'연결':'미설정'}</span>`}
async function settingsApi(url,opt){const r=await fetch(url,opt);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
async function loadConnectionStatus(){
  try{
    const s=await settingsApi('/api/settings/status');
    byId('pinCreateBox')?.classList.toggle('hidden',!!s.pinConfigured);
    byId('connectionForm')?.classList.toggle('hidden',!s.pinConfigured);
    const v=s.services||{};
    byId('connectionStatus').innerHTML=[statusChip('Apify',v.apify),statusChip('SerpApi',v.serpapi),statusChip('쿠팡',v.coupang),statusChip('Public URL',v.publicBaseUrl)].join('');
    if(byId('publicBaseUrl')&&!byId('publicBaseUrl').value)byId('publicBaseUrl').value=location.origin;
  }catch(e){byId('connectionMsg').textContent=e.message;}
}
byId('createAdminPin')?.addEventListener('click',async()=>{
  const pin=byId('setupAdminPin').value;
  try{await settingsApi('/api/settings/init',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});byId('setupAdminPin').value='';await loadConnectionStatus();byId('connectionMsg').textContent='관리자 PIN을 만들었습니다';}catch(e){alert(e.message)}
});
byId('saveConnections')?.addEventListener('click',async()=>{
  const pin=byId('connectionPin').value.trim();if(!pin)return alert('관리자 PIN을 입력해 주세요');
  const mapping={APIFY_API_TOKEN:'apifyApiToken',SERPAPI_API_KEY:'serpApiKey',PUBLIC_BASE_URL:'publicBaseUrl',COUPANG_ACCESS_KEY:'coupangAccessKey',COUPANG_SECRET_KEY:'coupangSecretKey',COUPANG_SUB_ID:'coupangSubId'};
  const keys={};for(const [name,id] of Object.entries(mapping)){const v=byId(id)?.value?.trim();if(v)keys[name]=v;}
  if(!Object.keys(keys).length)return alert('저장할 값을 하나 이상 입력해 주세요');
  const btn=byId('saveConnections');btn.disabled=true;byId('connectionMsg').textContent='저장 중…';
  try{
    await settingsApi('/api/settings/keys',{method:'PUT',headers:{'content-type':'application/json','x-admin-pin':pin},body:JSON.stringify({keys})});
    for(const id of ['apifyApiToken','serpApiKey','coupangAccessKey','coupangSecretKey','coupangSubId'])if(byId(id))byId(id).value='';
    byId('publicBaseUrl').value=location.origin;
    byId('connectionMsg').textContent='저장 완료 · Apify가 Douyin과 Xiaohongshu를 자동 수집합니다';
    await loadConnectionStatus();if(typeof window.loadAutoStatus==='function')await window.loadAutoStatus();
  }catch(e){byId('connectionMsg').textContent=e.message;}finally{btn.disabled=false;}
});
loadConnectionStatus();
