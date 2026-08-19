import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const newId = (prefix) => `${prefix}_${uuidv4()}`;
export function storagePath(...segments) {
  const root = process.env.STORAGE_ROOT || './storage';
  const p = path.join(root, ...segments);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
export function safeJsonParse(str, fallback = null) { if (!str) return fallback; try { return JSON.parse(str); } catch { return fallback; } }
export function normalizeTopic(text) { return (text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim(); }
export function contentHash(text) { return crypto.createHash('sha1').update(normalizeTopic(text)).digest('hex'); }
