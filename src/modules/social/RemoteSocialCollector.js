import { BaseSocialCollector } from './BaseSocialCollector.js';
import { withRetry } from '../../lib/retry.js';

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
  if(p==='DOUYIN')return new RemoteSocialCollector('DOUYIN',process.env.DOUYIN_COLLECTOR_ENDPOINT,process.env.DOUYIN_COLLECTOR_TOKEN||'');
  if(p==='XIAOHONGSHU')return new RemoteSocialCollector('XIAOHONGSHU',process.env.XIAOHONGSHU_COLLECTOR_ENDPOINT,process.env.XIAOHONGSHU_COLLECTOR_TOKEN||'');
  throw new Error(`지원하지 않는 플랫폼: ${p}`);
}
