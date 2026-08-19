import express from 'express';
export const trendsRouter=express.Router();

const categorySeeds={
  mystery:['mystery facts','unexplained places','strange discoveries'],
  travel:['beautiful places','hidden travel destinations','unreal places'],
  animals:['amazing animals','rare animal facts','animal discoveries'],
  science:['science facts','space discoveries','amazing science'],
  history:['history facts','ancient discoveries','lost civilizations'],
  general:['amazing facts','things you did not know','viral shorts']
};

function isoDurationToSeconds(v='PT0S'){
  const m=v.match(/P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?/i);
  if(!m)return 0;return (+m[1]||0)*86400+(+m[2]||0)*3600+(+m[3]||0)*60+(+m[4]||0);
}
function clamp(n,min=0,max=100){return Math.max(min,Math.min(max,n));}
function scoreCandidate({views,subs,ageHours,duration,title,description}){
  const velocity=views/Math.max(ageHours,1);
  const ratio=views/Math.max(subs,1000);
  const velocityScore=clamp(Math.log10(velocity+1)*17);
  const ratioScore=clamp(Math.log10(ratio+1)*28);
  const recentScore=clamp(100-(ageHours/168)*80);
  const viewsScore=clamp(Math.log10(views+1)*13);
  const shortsHint=/#shorts\b/i.test(`${title} ${description}`)?100:(duration<=180?65:0);
  const score=Math.round(velocityScore*.30+recentScore*.20+ratioScore*.20+viewsScore*.20+shortsHint*.10);
  return {score,velocity:Math.round(velocity),ratio:Number(ratio.toFixed(2))};
}
async function yt(path,params,key){const u=new URL(`https://www.googleapis.com/youtube/v3/${path}`);Object.entries({...params,key}).forEach(([k,v])=>v!=null&&u.searchParams.set(k,String(v)));const r=await fetch(u);if(!r.ok)throw new Error(`YouTube API 오류 (${r.status}): ${await r.text().catch(()=> '')}`);return r.json();}

trendsRouter.get('/',async(req,res)=>{
  try{
    const key=process.env.YOUTUBE_API_KEY;if(!key)return res.status(400).json({error:'YOUTUBE_API_KEY가 설정되어 있지 않습니다.'});
    const region=String(req.query.region||'US').toUpperCase();
    const category=String(req.query.category||'general');
    const days=Math.max(1,Math.min(30,Number(req.query.days||7)));
    const publishedAfter=new Date(Date.now()-days*86400000).toISOString();
    const seeds=categorySeeds[category]||categorySeeds.general;
    const searchResults=[];
    for(const q of seeds){
      const s=await yt('search',{part:'snippet',type:'video',q,regionCode:region,order:'viewCount',publishedAfter,maxResults:12,videoDuration:'short'},key);
      searchResults.push(...(s.items||[]));
    }
    const unique=[...new Map(searchResults.map(x=>[x.id?.videoId,x])).values()].filter(x=>x.id?.videoId).slice(0,30);
    if(!unique.length)return res.json({items:[]});
    const ids=unique.map(x=>x.id.videoId).join(',');
    const videos=await yt('videos',{part:'snippet,statistics,contentDetails',id:ids},key);
    const channelIds=[...new Set((videos.items||[]).map(v=>v.snippet?.channelId).filter(Boolean))];
    const channels=channelIds.length?await yt('channels',{part:'statistics',id:channelIds.join(',')},key):{items:[]};
    const subsByChannel=new Map((channels.items||[]).map(c=>[c.id,Number(c.statistics?.subscriberCount||0)]));
    const items=(videos.items||[]).map(v=>{
      const views=Number(v.statistics?.viewCount||0),subs=subsByChannel.get(v.snippet?.channelId)||0;
      const ageHours=Math.max(1,(Date.now()-new Date(v.snippet?.publishedAt).getTime())/3600000);
      const duration=isoDurationToSeconds(v.contentDetails?.duration);
      const scored=scoreCandidate({views,subs,ageHours,duration,title:v.snippet?.title||'',description:v.snippet?.description||''});
      return {videoId:v.id,title:v.snippet?.title||'',channelTitle:v.snippet?.channelTitle||'',publishedAt:v.snippet?.publishedAt,views,subscribers:subs,duration,thumbnail:v.snippet?.thumbnails?.high?.url||v.snippet?.thumbnails?.medium?.url||'',url:`https://www.youtube.com/watch?v=${v.id}`,...scored};
    }).filter(x=>x.duration>0&&x.duration<=180).sort((a,b)=>b.score-a.score).slice(0,10);
    res.json({region,category,days,note:'YouTube API에는 Shorts 전용 검색 필터가 없어 3분 이하 영상과 Shorts 신호를 이용한 후보 점수입니다.',items});
  }catch(err){res.status(500).json({error:String(err.message||err)});}
});
