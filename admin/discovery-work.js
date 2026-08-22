const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const FINAL_STATUSES=new Set(['AUTO_CONFIRMED','REJECTED']);
const BATCH_BASELINE_KEY='me.discovery.batch.baseline.v1';
let showCompleted=false;
async function api(url,opt){const r=await fetch(url,opt);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j}
async function copyText(text){try{await navigator.clipboard.writeText(text);return true}catch{return false}}
function videoUrl(kind,id){return kind==='clean'?`/storage/clean/${encodeURIComponent(id)}-clean-v4.mp4`:`/storage/social/${encodeURIComponent(id)}.mp4`}
function mediaBox(title,url,note,fileName){return `<div class="video-box"><h4>${esc(title)}</h4><video controls preload="metadata" src="${esc(url)}?v=4"></video><div class="video-actions"><a class="btn-primary" href="${esc(url)}" download="${esc(fileName)}">⬇ MP4 다운로드</a><a class="btn-secondary" href="${esc(url)}?v=4" target="_blank" rel="noopener">새 탭에서 열기</a></div><div class="muted">${esc(note)}</div></div>`}
async function loadStats(){const s=await api('/api/discovery/dashboard');$('#stats').innerHTML=`<span class="status-pill">Instagram Reel ${s.instagram||0}</span><span class="status-pill ready">자동확정 ${s.autoConfirmed}</span><span class="status-pill">검토 ${s.reviewRequired}</span><span class="status-pill">콘텐츠 ${s.contentJobs}</span>`}
function renderCandidate(c){if(!c)return '<div class="ai-box"><b>AI 상품 판독</b><div class="muted">아직 분석 전입니다</div></div>';let features=[];try{features=JSON.parse(c.features_json||'[]')}catch{}return `<div class="ai-box"><b>AI 상품 판독</b><h3>${esc(c.korean_name||'상품명 미확정')}</h3><div>${esc(c.product_type||'')}</div>${features.length?`<div class="muted">${features.map(esc).join(' · ')}</div>`:''}<div class="muted">판독 신뢰도 ${Math.round(Number(c.resolver_confidence||0))}%</div></div>`}
function renderInstagram(meta){const ig=meta?.instagram;if(!ig)return '';const r=ig.rewrittenScript||{};return `<div class="script-box"><b>Instagram 원본 대본 → 새 대본</b><div class="muted" style="margin-top:8px">원본 음성 전사</div><div>${esc(ig.transcript||'음성 없음')}</div><div class="muted" style="margin-top:10px">재작성 대본</div><div><b>${esc(r.fullScript||[r.hook,r.body,r.ending].filter(Boolean).join(' ')||'')}</b></div>${ig.inpockUrl?`<div class="muted" style="margin-top:8px">인포크 ${esc(ig.inpockUrl)}</div>`:''}${ig.inpockMatch?`<div class="muted">인포크 매칭 ${esc(ig.inpockMatch.title||'상품')} · ${Math.round(Number(ig.inpockMatch.score||0))}점</div>`:''}</div>`}
function renderMatch(m){const confirmed=m.status==='AUTO_CONFIRMED';return `<div class="match ${confirmed?'confirmed':''}">${m.product_image?`<img src="${esc(m.product_image)}" alt="상품 이미지">`:'<div></div>'}<div><b>${esc(m.product_name||'')}</b><div>${Number(m.product_price||0).toLocaleString()}원</div><div class="score">매칭 ${Math.round(Number(m.score||0))}점 · ${esc(m.status)}</div><div class="row">${!confirmed?`<button class="btn-secondary confirm" data-id="${esc(m.id)}">이 상품 확정</button>`:''}${m.product_url?`<a class="btn-secondary" href="${esc(m.product_url)}" target="_blank" rel="noopener">쿠팡 상품 보기</a>`:''}</div>${confirmed?`<div class="affiliate"><b>내 쿠파스 링크</b><br>${esc(m.affiliate_url||'딥링크 생성 대기')}</div><div class="row">${m.affiliate_url?`<button class="btn-primary copy-link" data-link="${esc(m.affiliate_url)}">링크 복사</button>`:''}<button class="btn-secondary create-short" data-id="${esc(m.id)}">새 대본으로 쇼츠 제작</button></div>`:''}</div></div>`}
function readBatchBaseline(){try{return new Set(JSON.parse(sessionStorage.getItem(BATCH_BASELINE_KEY)||'[]'))}catch{return new Set()}}
async function loadPosts(){
  const j=await api('/api/discovery/posts');
  const allInstagram=(j.items||[]).filter(x=>x.platform==='INSTAGRAM');
  const baseline=readBatchBaseline();
  const scoped=baseline.size?allInstagram.filter(x=>!baseline.has(x.id)):allInstagram.slice(0,3);
  const completed=scoped.filter(x=>FINAL_STATUSES.has(x.status));
  const pending=scoped.filter(x=>!FINAL_STATUSES.has(x.status));
  const items=showCompleted?scoped:pending;
  const box=$('#posts');box.innerHTML='';
  const count=$('#resultCount');if(count)count.textContent=`이번 실행 결과 ${scoped.length}개 · 처리할 항목 ${pending.length}개 · 완료 ${completed.length}개${showCompleted?' · 완료 포함 표시 중':''}`;
  const toggle=$('#toggleCompleted');if(toggle)toggle.textContent=showCompleted?'처리완료 숨기기':`처리완료 보기 (${completed.length})`;
  if(!items.length){box.innerHTML='<div class="empty-video">이번 실행에서 새로 수집된 Reel이 없습니다</div>';return;}
  for(const p of items){
    const d=await api('/api/discovery/posts/'+encodeURIComponent(p.id));const matches=d.matches||[];
    const original=videoUrl('original',p.id),clean=videoUrl('clean',p.id);
    box.insertAdjacentHTML('beforeend',`<div class="card"><div class="toolbar"><div><div class="row"><span class="status-pill">INSTAGRAM</span><span class="status-pill ${p.status==='AUTO_CONFIRMED'?'ready':''}">${esc(p.status)}</span></div><h3 class="post-title">${esc(p.caption||p.external_post_id)}</h3><a href="${esc(p.source_url)}" target="_blank" rel="noopener">Instagram 원본 Reel 열기</a></div><button class="btn-primary analyze" data-id="${esc(p.id)}">${p.status==='DISCOVERED'?'분석 시작':'다시 분석'}</button></div><div class="review-grid"><div><h3 class="section-title">영상 확인</h3><div class="video-grid">${mediaBox('원본 영상',original,'ME 서버에 저장된 원본 Reel',`${p.external_post_id||p.id}-original.mp4`)}${mediaBox('자막/워터마크 클리닝본',clean,'V4 가장자리 정리 + Gemini 중앙 오버레이 탐지',`${p.external_post_id||p.id}-clean-v4.mp4`)}</div>${renderInstagram(d.post?.metadata||{})}</div><div><h3 class="section-title">쿠팡 상품 매칭</h3>${renderCandidate(d.candidate)}<div>${matches.length?matches.map(renderMatch).join(''):'<div class="empty-video">분석 후 쿠팡 후보가 여기에 표시됩니다</div>'}</div></div></div></div>`)
  }
  document.querySelectorAll('.analyze').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='분석 중…';try{await api('/api/discovery/posts/'+encodeURIComponent(b.dataset.id)+'/analyze',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});await loadPosts();await loadStats()}catch(e){alert(e.message)}finally{b.disabled=false}});
  document.querySelectorAll('.confirm').forEach(b=>b.onclick=async()=>{try{const j=await api('/api/discovery/matches/'+encodeURIComponent(b.dataset.id)+'/confirm',{method:'POST'});await loadPosts();await loadStats();if(j.affiliateUrl)alert('상품 확정 완료\n내 쿠파스 링크도 생성됐습니다')}catch(e){alert(e.message)}});
  document.querySelectorAll('.copy-link').forEach(b=>b.onclick=async()=>alert(await copyText(b.dataset.link)?'쿠파스 링크를 복사했습니다':'복사에 실패했습니다'));
  document.querySelectorAll('.create-short').forEach(b=>b.onclick=async()=>{try{const j=await api('/api/discovery/matches/'+encodeURIComponent(b.dataset.id)+'/create-short',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contentScore:85})});localStorage.setItem('globalShortsProjects',JSON.stringify([j.projectId,...JSON.parse(localStorage.getItem('globalShortsProjects')||'[]').filter(x=>x!==j.projectId)].slice(0,30)));alert('쇼츠 제작을 시작했습니다')}catch(e){alert(e.message)}})
}
window.prepareDiscoveryBatch=async function(){const j=await api('/api/discovery/posts');const ids=(j.items||[]).filter(x=>x.platform==='INSTAGRAM').map(x=>x.id);sessionStorage.setItem(BATCH_BASELINE_KEY,JSON.stringify(ids));showCompleted=false;await loadPosts();};
$('#toggleCompleted')?.addEventListener('click',()=>{showCompleted=!showCompleted;loadPosts().catch(e=>alert(e.message))});
$('#refresh').onclick=()=>Promise.all([loadPosts(),loadStats()]);
window.loadPosts=loadPosts;window.loadStats=loadStats;Promise.all([loadStats(),loadPosts()]).catch(e=>alert(e.message));
