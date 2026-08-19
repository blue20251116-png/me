import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const dbPath=process.env.DB_PATH||'./storage/yt_shorts_global.db';
fs.mkdirSync(path.dirname(dbPath),{recursive:true});
export const db=new Database(dbPath);
export function initSchema(){db.exec(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));}
