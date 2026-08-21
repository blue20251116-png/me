import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));

function dataRoot(){
  if(process.env.PERSISTENT_DATA_DIR)return process.env.PERSISTENT_DATA_DIR;
  if(process.env.RAILWAY_VOLUME_MOUNT_PATH)return process.env.RAILWAY_VOLUME_MOUNT_PATH;
  try{if(fs.existsSync('/data')&&fs.statSync('/data').isDirectory())return '/data';}catch{}
  return './storage';
}

export const persistentDataRoot=dataRoot();
const dbPath=process.env.DB_PATH||path.join(persistentDataRoot,'yt_shorts_global.db');
fs.mkdirSync(path.dirname(dbPath),{recursive:true});
export const db=new Database(dbPath);
export const activeDbPath=dbPath;
export function initSchema(){db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));}
