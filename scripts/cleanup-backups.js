import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const DAYS = Number(process.env.CPBL_BACKUP_RETENTION_DAYS || 30);
const cutoff = Date.now() - DAYS * 86400000;
const roots = ["data/live/backups", "data/live/backup", "data/farm/backup", "logs"];
let removed = 0;

async function walk(dir) {
  let entries = [];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { await walk(full); continue; }
    const stat = await fs.stat(full);
    if (stat.mtimeMs < cutoff && /\.(json|bak|log)$/i.test(entry.name)) {
      await fs.rm(full, { force: true });
      removed += 1;
    }
  }
}
for (const rel of roots) await walk(path.join(ROOT, rel));
console.log(`🧹 已清除 ${removed} 個超過 ${DAYS} 天的備份／紀錄檔。`);
