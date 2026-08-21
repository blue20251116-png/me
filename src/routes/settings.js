import express from 'express';
import { configuredServices, hasAdminPin, setAdminPin, setSecret, verifyAdminPin, settingsPersistenceInfo } from '../lib/settingsStore.js';
export const settingsRouter=express.Router();
const ALLOWED_KEYS=[
  'OPENAI_API_KEY','SERPAPI_API_KEY',
  'COUPANG_ACCESS_KEY','COUPANG_SECRET_KEY','COUPANG_SUB_ID',
  'INSTAGRAM_SESSION_ID','INSTAGRAM_CSRF_TOKEN','PUBLIC_BASE_URL'
];
settingsRouter.get('/status',(_req,res)=>res.json({pinConfigured:hasAdminPin(),services:configuredServices(),persistence:settingsPersistenceInfo()}));
settingsRouter.post('/init',(req,res)=>{try{setAdminPin(req.body?.pin);res.json({ok:true});}catch(err){res.status(400).json({error:String(err.message||err)});}});
settingsRouter.put('/keys',(req,res)=>{
  try{
    const pin=req.header('x-admin-pin')||req.body?.pin;
    if(!verifyAdminPin(pin))return res.status(401).json({error:'관리자 PIN이 올바르지 않습니다.'});
    const keys=req.body?.keys||{};
    for(const name of ALLOWED_KEYS){if(Object.prototype.hasOwnProperty.call(keys,name))setSecret(name,String(keys[name]||'').trim());}
    res.json({ok:true,services:configuredServices(),persistence:settingsPersistenceInfo()});
  }catch(err){res.status(400).json({error:String(err.message||err)});}
});
