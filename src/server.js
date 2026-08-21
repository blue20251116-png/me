import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initSchema } from './db/db.js';
import { projectsRouter } from './routes/projects.js';
import { trendsRouter } from './routes/trends.js';
import { settingsRouter } from './routes/settings.js';
import { discoveryRouter } from './routes/discovery.js';
import { discoveryAutoRouter } from './routes/discoveryAuto.js';
import { browserBridgeRouter } from './routes/browserBridge.js';
import { configuredServices, hydrateSavedSettings } from './lib/settingsStore.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
initSchema();
hydrateSavedSettings();
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/api/projects', projectsRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/discovery', discoveryRouter);
app.use('/api/discovery-auto', discoveryAutoRouter);
app.use('/api/browser-bridge', browserBridgeRouter);

const storageRoot=path.resolve(process.env.STORAGE_ROOT||path.join(__dirname,'..','storage'));
app.use('/storage',express.static(storageRoot,{fallthrough:true}));
app.use('/storage',(err,req,res,next)=>{
  if(err?.status===416||err?.statusCode===416){res.status(416).set('Content-Range','bytes */0').end();return;}
  next(err);
});
app.use('/', express.static(path.join(__dirname, '..', 'admin')));
function commandAvailable(command){
  try{const r=spawnSync(command,['-version'],{stdio:'ignore'});return !r.error && r.status===0;}catch{return false;}
}
app.get('/api/health', (_req, res) => {
  const services=configuredServices();
  res.json({ok:true,services:{...services,instagramCollection:'CHROME_BRIDGE',ffmpeg:commandAvailable('ffmpeg'),ffprobe:commandAvailable('ffprobe')}});
});
const port = process.env.PORT || 4100;
app.listen(port, () => {
  console.log(`yt-shorts-global API listening on :${port}`);
  console.log('[Instagram] collection mode=CHROME_BRIDGE server-side polling=disabled');
});
