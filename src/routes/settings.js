import express from 'express';
import { configuredServices, hasAdminPin, setAdminPin, setSecret, verifyAdminPin } from '../lib/settingsStore.js';
export const settingsRouter=express.Router();
settingsRouter.get('/status',(_req,res)=>res.json({pinConfigured:hasAdminPin(),services:configuredServices()}));
settingsRouter.post('/init',(req,res)=>{try{setAdminPin(req.body?.pin);res.json({ok:true});}catch(err){res.status(400).json({error:String(err.message||err)});}});
settingsRouter.put('/keys',(req,res)=>{
  try{
    const pin=req.header('x-admin-pin')||req.body?.pin;if(!verifyAdminPin(pin))return res.status(401).json({error:'관리자 PIN이 올바르지 않습니다.'});
    const keys=req.body?.keys||{};
    for(const name of ['OPENAI_API_KEY','PEXELS_API_KEY','YOUTUBE_API_KEY']) if(Object.prototype.hasOwnProperty.call(keys,name)) setSecret(name,String(keys[name]||'').trim());
    res.json({ok:true,services:configuredServices()});
  }catch(err){res.status(400).json({error:String(err.message||err)});}
});
