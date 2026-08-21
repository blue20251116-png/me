const byId=id=>document.getElementById(id);
const BACKUP_KEY='me.discovery.settings.backup.v1';
const LOCAL_KEY='me.discovery.settings.localkey.v1';
let restoreAttempted=false;

function statusChip(label,ok){return `<span class="status-pill ${ok?'ready':''}">${label} ${ok?'연결':'미설정'}</span>`}
async function settingsApi(url,opt){const r=await fetch(url,opt);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
function b64(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function unb64(s){const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function localCryptoKey(){
  let raw=localStorage.getItem(LOCAL_KEY);
  if(!raw){const bytes=crypto.getRandomValues(new Uint8Array(32));raw=b64(bytes);localStorage.setItem(LOCAL_KEY,raw);}
  return crypto.subtle.importKey('raw',unb64(raw),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function saveLocalBackup(pin,keys){
  try{
    const current=await readLocalBackup().catch(()=>null);const merged={...(current?.keys||{}),...(keys||{})};
    const payload=JSON.stringify({pin:String(pin||current?.pin||''),keys:merged,savedAt:new Date().toISOString()});
    const iv=crypto.getRandomValues(new Uint8Array(12));const key=await localCryptoKey();
    const enc=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(payload)));
    localStorage.setItem(BACKUP_KEY,JSON.stringify({iv:b64(iv),data:b64(enc)}));
  }catch(e){console.warn('[settings backup] save failed',e);}
}
async function readLocalBackup(){
  const raw=localStorage.getItem(BACKUP_KEY);if(!raw)return null;
  const blob=JSON.parse(raw);const key=await localCryptoKey();
  const dec=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(blob.iv)},key,unb64(blob.data));
  return JSON.parse(new TextDecoder().decode(dec));
}
function missingRequired(s){const v=s?.services||{};return !s?.pinConfigured||!v.apify||!v.serpapi||!v.coupang||!v.publicBaseUrl;}
async function tryAutoRestore(s){
  if(restoreAttempted||!missingRequired(s))return s;restoreAttempted=true;
  const backup=await readLocalBackup().catch(()=>null);if(!backup?.pin||!backup?.keys||!Object.keys(backup.keys).length)return s;
  try{
    byId('connectionMsg').textContent='재빌드 후 저장 설정을 자동 복구하는 중…';
    if(!s.pinConfigured)await settingsApi('/api/settings/init',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin:backup.pin})});
    await settingsApi('/api/settings/keys',{method:'PUT',headers:{'content-type':'application/json','x-admin-pin':backup.pin},body:JSON.stringify({keys:backup.keys})});
    const restored=await settingsApi('/api/settings/status');
    byId('connectionMsg').textContent='저장된 설정을 자동 복구했습니다';
    return restored;
  }catch(e){console.warn('[settings backup] restore failed',e);byId('connectionMsg').textContent=`자동 복구 실패 · ${e.message}`;return s;}
}
async function loadConnectionStatus(){
  try{
    let s=await settingsApi('/api/settings/status');s=await tryAutoRestore(s);
    byId('pinCreateBox')?.classList.toggle('hidden',!!s.pinConfigured);
    byId('connectionForm')?.classList.toggle('hidden',!s.pinConfigured);
    const v=s.services||{};
    byId('connectionStatus').innerHTML=[statusChip('Apify',v.apify),statusChip('SerpApi',v.serpapi),statusChip('쿠팡',v.coupang),statusChip('Public URL',v.publicBaseUrl)].join('');
    if(byId('publicBaseUrl')&&!byId('publicBaseUrl').value)byId('publicBaseUrl').value=location.origin;
  }catch(e){byId('connectionMsg').textContent=e.message;}
}
byId('createAdminPin')?.addEventListener('click',async()=>{
  const pin=byId('setupAdminPin').value;
  try{await settingsApi('/api/settings/init',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({pin})});await saveLocalBackup(pin,{});byId('setupAdminPin').value='';await loadConnectionStatus();byId('connectionMsg').textContent='관리자 PIN을 만들었습니다';}catch(e){alert(e.message)}
});
byId('saveConnections')?.addEventListener('click',async()=>{
  const pin=byId('connectionPin').value.trim();if(!pin)return alert('관리자 PIN을 입력해 주세요');
  const mapping={APIFY_API_TOKEN:'apifyApiToken',SERPAPI_API_KEY:'serpApiKey',PUBLIC_BASE_URL:'publicBaseUrl',COUPANG_ACCESS_KEY:'coupangAccessKey',COUPANG_SECRET_KEY:'coupangSecretKey',COUPANG_SUB_ID:'coupangSubId'};
  const keys={};for(const [name,id] of Object.entries(mapping)){const v=byId(id)?.value?.trim();if(v)keys[name]=v;}
  if(!Object.keys(keys).length)return alert('저장할 값을 하나 이상 입력해 주세요');
  const btn=byId('saveConnections');btn.disabled=true;byId('connectionMsg').textContent='저장 중…';
  try{
    await settingsApi('/api/settings/keys',{method:'PUT',headers:{'content-type':'application/json','x-admin-pin':pin},body:JSON.stringify({keys})});
    await saveLocalBackup(pin,keys);
    for(const id of ['apifyApiToken','serpApiKey','coupangAccessKey','coupangSecretKey','coupangSubId'])if(byId(id))byId(id).value='';
    byId('publicBaseUrl').value=location.origin;
    byId('connectionMsg').textContent='저장 완료 · 재빌드 후에도 같은 브라우저에서 자동 복구됩니다';
    await loadConnectionStatus();if(typeof window.loadAutoStatus==='function')await window.loadAutoStatus();
  }catch(e){byId('connectionMsg').textContent=e.message;}finally{btn.disabled=false;}
});
loadConnectionStatus();
