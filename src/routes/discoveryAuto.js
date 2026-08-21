import express from 'express';
import { db } from '../db/db.js';
import { getSecret } from '../lib/settingsStore.js';

export const discoveryAutoRouter=express.Router();

discoveryAutoRouter.get('/status',(_req,res)=>{
  const instagramTargets=Number(db.prepare("SELECT COUNT(*) FROM social_monitor_targets WHERE enabled=1 AND platform='INSTAGRAM' AND target_type='ACCOUNT'").pluck().get()||0);
  const services={browserBridge:true,openai:!!getSecret('OPENAI_API_KEY'),serpapi:!!getSecret('SERPAPI_API_KEY'),coupang:!!getSecret('COUPANG_ACCESS_KEY')&&!!getSecret('COUPANG_SECRET_KEY'),publicBaseUrl:!!getSecret('PUBLIC_BASE_URL')};
  res.json({collectors:{CHROME_BRIDGE:true},ready:instagramTargets>0&&services.openai&&services.serpapi&&services.coupang&&services.publicBaseUrl,services,activeTargets:instagramTargets,instagramTargets,posts:Number(db.prepare("SELECT COUNT(*) FROM social_posts WHERE platform='INSTAGRAM'").pluck().get()||0),run:{running:false,stage:'BRIDGE',message:'Instagram 수집은 로그인된 Chrome 확장프로그램에서 실행합니다'}});
});

discoveryAutoRouter.post('/run',(_req,res)=>res.status(409).json({error:'Instagram 서버 직접수집은 비활성화했습니다. Chrome의 ME Instagram Reel Bridge 확장프로그램에서 수집 시작 버튼을 눌러 주세요.'}));
