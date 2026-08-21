import { callOpenAiJson } from '../../lib/openAiJsonClient.js';

export async function resolveProduct({caption='',transcript='',ocrText='',lensResults=[]}){
  const lensTitles=lensResults.flatMap(x=>[
    ...(x.visualMatches||[]).map(v=>v.title),
    ...(x.products||[]).map(v=>v.title)
  ]).filter(Boolean).slice(0,30);
  const resolved=await callOpenAiJson({
    system:'너는 SNS 영상에서 실제 판매 상품을 식별하고 한국 쇼핑 검색어로 정규화하는 상품 리졸버다. 과장하지 말고 JSON만 반환한다. 쿠팡 검색 API 호출을 최소화해야 하므로 searchQueries는 가장 정확한 검색어를 최대 2개만 반환한다.',
    user:`다음 정보를 바탕으로 상품을 식별해라.\n게시물:${caption}\n음성:${transcript}\nOCR:${ocrText}\nLens:${lensTitles.join(' | ')}\n\n반환 JSON 스키마:{"productType":"","brand":"","model":"","material":"","color":"","features":[],"usage":"","koreanName":"","searchQueries":["가장 정확한 검색어","필요할 때만 보조 검색어"],"confidence":0}`
  });
  const queries=[];
  for(const q of Array.isArray(resolved?.searchQueries)?resolved.searchQueries:[]){
    const v=String(q||'').trim();
    if(v&&!queries.includes(v))queries.push(v);
    if(queries.length>=2)break;
  }
  if(!queries.length&&String(resolved?.koreanName||'').trim())queries.push(String(resolved.koreanName).trim());
  return {...resolved,searchQueries:queries.slice(0,2)};
}

function tokens(s){return new Set(String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>1));}
export function scoreCoupangCandidate(resolved,product){
  const a=tokens([resolved.koreanName,...(resolved.searchQueries||[]),...(resolved.features||[])].join(' '));
  const b=tokens(product.productName||'');
  const common=[...a].filter(x=>b.has(x)).length;
  const union=new Set([...a,...b]).size||1;
  const lexical=common/union;
  const brand=resolved.brand&&String(product.productName||'').toLowerCase().includes(String(resolved.brand).toLowerCase())?1:0;
  const model=resolved.model&&String(product.productName||'').toLowerCase().includes(String(resolved.model).toLowerCase())?1:0;
  const resolverConfidence=Math.max(0,Math.min(1,Number(resolved.confidence||0)/100));
  const score=Math.round((lexical*.55+brand*.15+model*.15+resolverConfidence*.15)*100);
  return Math.max(0,Math.min(100,score));
}
