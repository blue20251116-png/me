import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, persistentDataRoot, activeDbPath } from '../db/db.js';

const KEY_FILE=process.env.SETTINGS_KEY_FILE||path.join(persistentDataRoot,'.settings.key');
const ALLOWED=new Set([
  'GEMINI_API_KEY','OPENAI_API_KEY','PEXELS_API_KEY','YOUTUBE_API_KEY','SERPAPI_API_KEY','APIFY_API_TOKEN',
  'COUPANG_ACCESS_KEY','COUPANG_SECRET_KEY','COUPANG_SUB_ID',
  'DOUYIN_COLLECTOR_ENDPOINT','DOUYIN_COLLECTOR_TOKEN',
  'XIAOHONGSHU_COLLECTOR_ENDPOINT','XIAOHONGSHU_COLLECTOR_TOKEN',
  'INSTAGRAM_SESSION_ID','INSTAGRAM_CSRF_TOKEN',
  'PUBLIC_BASE_URL'
]);

function envMasterKey(){const raw=String(process.env.SETTINGS_MASTER_KEY||'').trim();return raw?crypto.createHash('sha256').update(raw).digest():null;}
function masterKey(){const envKey=envMasterKey();if(envKey)return envKey;fs.mkdirSync(path.dirname(KEY_FILE),{recursive:true});if(!fs.existsSync(KEY_FILE))fs.writeFileSync(KEY_FILE,crypto.randomBytes(32),{mode:0o600});return fs.readFileSync(KEY_FILE);}
function encrypt(value){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',masterKey(),iv);const enc=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);const tag=cipher.getAuthTag();return Buffer.concat([iv,tag,enc]).toString('base64');}
function decrypt(payload){const b=Buffer.from(payload,'base64'),iv=b.subarray(0,12),tag=b.subarray(12,28),enc=b.subarray(28);const decipher=crypto.createDecipheriv('aes-256-gcm',masterKey(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(enc),decipher.final()]).toString('utf8');}
function pinHash(pin,salt){return crypto.scryptSync(String(pin),salt,32).toString('hex');}
export function hasAdminPin(){return !!db.prepare("SELECT value FROM app_settings WHERE key='ADMIN_PIN_HASH'").get();}
export function setAdminPin(pin){if(!/^.{6,}$/.test(String(pin||'')))throw new Error('관리자 PIN은 6자 이상이어야 합니다.');if(hasAdminPin())throw new Error('관리자 PIN이 이미 설정되어 있습니다.');const salt=crypto.randomBytes(16).toString('hex');db.prepare('INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').run('ADMIN_PIN_SALT',salt);db.prepare('INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').run('ADMIN_PIN_HASH',pinHash(pin,salt));}
export function verifyAdminPin(pin){const s=db.prepare("SELECT value FROM app_settings WHERE key='ADMIN_PIN_SALT'").get()?.value;const h=db.prepare("SELECT value FROM app_settings WHERE key='ADMIN_PIN_HASH'").get()?.value;if(!s||!h)return false;const got=pinHash(pin,s);return crypto.timingSafeEqual(Buffer.from(got,'hex'),Buffer.from(h,'hex'));}
export function setSecret(name,value){if(!ALLOWED.has(name))throw new Error('지원하지 않는 설정입니다.');if(!value){db.prepare('DELETE FROM app_settings WHERE key=?').run(name);if(!process.env[name])delete process.env[name];return;}db.prepare('INSERT OR REPLACE INTO app_settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)').run(name,encrypt(value));if(!process.env[name])process.env[name]=String(value);}
export function getSecret(name){if(process.env[name])return process.env[name];const row=db.prepare('SELECT value FROM app_settings WHERE key=?').get(name);if(!row)return '';try{return decrypt(row.value)}catch{return '';}}
export function hydrateSavedSettings(){for(const name of ALLOWED){if(process.env[name])continue;const row=db.prepare('SELECT value FROM app_settings WHERE key=?').get(name);if(!row)continue;try{const value=decrypt(row.value);if(value)process.env[name]=value;}catch{}}}
export function settingsPersistenceInfo(){const persistentByEnv=Boolean(process.env.PERSISTENT_DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||process.env.DB_PATH||process.env.SETTINGS_KEY_FILE||process.env.SETTINGS_MASTER_KEY);return {persistentByEnv,dataRoot:persistentDataRoot,dbPath:activeDbPath,keyFile:envMasterKey()?'ENV:SETTINGS_MASTER_KEY':KEY_FILE};}
export function configuredServices(){const apify=!!getSecret('APIFY_API_TOKEN');const gemini=!!getSecret('GEMINI_API_KEY');return {gemini,openai:gemini,pexels:!!getSecret('PEXELS_API_KEY'),youtube:!!getSecret('YOUTUBE_API_KEY'),serpapi:!!getSecret('SERPAPI_API_KEY'),apify,instagramSession:!!getSecret('INSTAGRAM_SESSION_ID'),coupang:!!getSecret('COUPANG_ACCESS_KEY')&&!!getSecret('COUPANG_SECRET_KEY'),douyinCollector:apify||!!getSecret('DOUYIN_COLLECTOR_ENDPOINT'),xiaohongshuCollector:apify||!!getSecret('XIAOHONGSHU_COLLECTOR_ENDPOINT'),publicBaseUrl:!!getSecret('PUBLIC_BASE_URL')};}
