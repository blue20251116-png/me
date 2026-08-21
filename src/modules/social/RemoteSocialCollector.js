import { BaseSocialCollector } from './BaseSocialCollector.js';
import { getSecret } from '../../lib/settingsStore.js';
import { withRetry } from '../../lib/retry.js';
import { ApifyDouyinCollector, ApifyXiaohongshuCollector, ApifyInstagramCollector } from './ApifySocialCollector.js';

export class RemoteSocialCollector extends BaseSocialCollector {
  constructor(platform,endpoint,token=''){super(platform);this.endpoint=String(endpoint||'').replace(/\/$/,'');this.token=token;}
  async discover(target){
    if(!this.endpoint) throw new Error(`${this.platform} collector endpoint가 설정되어 있지 않습니다.`);
    return withRetry(async()=>{
      const r=await fetch(`${this.endpoint}/discover`,{method:'POST',headers:{'content-type':'application/json',...(this.token?{authorization:`Bearer ${this.token}`}:{})},body:JSON.stringify({platform:this.platform,targetType:target.target_type,targetValue:target.target_value}),signal:AbortSignal.timeout(30000)});
      const text=await r.text();if(!r.ok)throw new Error(`${this.platform} collector 오류 (${r.status}): ${text}`);
      const json=JSON.parse(text||'{}');return Array.isArray(json.items)?json.items:[];
    },{attempts:2,label:`collector:${this.platform}`});
  }
}
export function collectorFor(platform){
  const p=String(platform||'').toUpperCase();
  if(getSecret('APIFY_API_TOKEN')){
    if(p==='DOUYIN')return new ApifyDouyinCollector();
    if(p==='XIAOHONGSHU')return new ApifyXiaohongshuCollector();
    if(p==='INSTAGRAM')return new ApifyInstagramCollector();
  }
  if(p==='DOUYIN')return new RemoteSocialCollector('DOUYIN',getSecret('DOUYIN_COLLECTOR_ENDPOINT'),getSecret('DOUYIN_COLLECTOR_TOKEN'));
  if(p==='XIAOHONGSHU')return new RemoteSocialCollector('XIAOHONGSHU',getSecret('XIAOHONGSHU_COLLECTOR_ENDPOINT'),getSecret('XIAOHONGSHU_COLLECTOR_TOKEN'));
  if(p==='INSTAGRAM')throw new Error('Instagram 벤치마킹 수집에는 Apify API Token이 필요합니다.');
  throw new Error(`지원하지 않는 플랫폼: ${p}`);
}
