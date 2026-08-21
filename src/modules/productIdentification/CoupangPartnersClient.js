import crypto from 'node:crypto';
import { getSecret } from '../../lib/settingsStore.js';
import { withRetry } from '../../lib/retry.js';

const HOST='https://api-gateway.coupang.com';
const BASE='/v2/providers/affiliate_open_api/apis/openapi/v1';
const SEARCH_MAX_PER_MINUTE=40;
const SEARCH_RESULT_LIMIT=2;
const searchCalls=[];
function signedDate(){return new Date().toISOString().slice(2,19).replace(/[-:]/g,'')+'Z';}
function auth(method,path,query=''){
  const accessKey=getSecret('COUPANG_ACCESS_KEY');
  const secretKey=getSecret('COUPANG_SECRET_KEY');
  if(!accessKey||!secretKey) throw new Error('COUPANG_ACCESS_KEY/COUPANG_SECRET_KEY가 설정되어 있지 않습니다.');
  const datetime=signedDate();
  const message=datetime+method+path+query;
  const signature=crypto.createHmac('sha256',secretKey).update(message).digest('hex');
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function waitForSearchSlot(){
  while(true){
    const now=Date.now();
    while(searchCalls.length&&now-searchCalls[0]>=60_000)searchCalls.shift();
    if(searchCalls.length<SEARCH_MAX_PER_MINUTE){searchCalls.push(now);return;}
    const wait=Math.max(250,60_000-(now-searchCalls[0])+100);
    console.warn(`[Coupang][RATE GUARD] search ${searchCalls.length}/${SEARCH_MAX_PER_MINUTE} · ${wait}ms 대기`);
    await sleep(wait);
  }
}
async function request(method,path,query='',body=null){
  return withRetry(async()=>{
    const url=`${HOST}${path}${query?`?${query}`:''}`;
    const r=await fetch(url,{method,headers:{Authorization:auth(method,path,query),'content-type':'application/json;charset=UTF-8'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const text=await r.text();
    if(!r.ok) throw new Error(`쿠팡 파트너스 API 오류 (${r.status}): ${text}`);
    const json=JSON.parse(text||'{}');
    if(String(json.rCode??'0')!=='0') throw new Error(`쿠팡 파트너스 오류: ${json.rMessage||json.rCode}`);
    return json.data;
  },{attempts:2,label:`coupang:${method}:${path}`});
}
export async function searchCoupangProducts(keyword,{limit=SEARCH_RESULT_LIMIT,subId=''}={}){
  await waitForSearchSlot();
  const path=`${BASE}/products/search`;
  const safeLimit=Math.max(1,Math.min(SEARCH_RESULT_LIMIT,Number(limit)||SEARCH_RESULT_LIMIT));
  const qs=new URLSearchParams({keyword:String(keyword),limit:String(safeLimit),imageSize:'512x512',srpLinkOnly:'false'});
  if(subId) qs.set('subId',subId);
  const data=await request('GET',path,qs.toString());
  return Array.isArray(data?.productData)?data.productData.slice(0,SEARCH_RESULT_LIMIT):[];
}
export async function createCoupangDeepLink(coupangUrl,{subId=''}={}){
  const path=`${BASE}/deeplink`;
  const data=await request('POST',path,'',{coupangUrls:[coupangUrl],...(subId?{subId}:{})});
  return Array.isArray(data)?data[0]||null:null;
}
