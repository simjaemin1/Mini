#!/usr/bin/env node
// === scripts/t1379-snap.js — 판을 멈추지 않고 100날마다 DB 사본(`.backup`) [T1379 · S11 · 2026-11-21] ==============
// (@regress 없음 — 러너 밖 · 판 도구 · 제품 무접촉 — sqlite 를 읽기만 한다)
//
// 쓰는 법: node scripts/t1379-snap.js --db <판 DB> --log <아이 로그> --out <사본 폴더> [--every 100] [--max 800] [--pid <판 자 pid>]
// ★지금 날: 아이 존 로그의 하루 한 줄 `답압 길 day N`(T990 — 길의 날 = econ 날 · 부팅 때 한 번 벽시계에 맞춘 축)의 첫 값과의 차 + 1.
//   (`econ dN` 은 캐러밴 "도착 예정" 날이라 앞날을 가리킬 수 있어 안 쓴다.)
// ★사본: better-sqlite3 `backup()`(온라인 백업 — 판은 계속 쓴다) → `<out>/d<N>.db` · 뜬 순간의 날 · 초를 `<out>/snaps.json` 에 적는다.
// ★판이 끝나면(판 자 pid 가 없어지면) 마지막 DB 를 `<out>/dEnd.db` 로 한 번 더 뜬다(그날 = 로그의 마지막 날).
'use strict';
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const DB = arg('db'), LOG = arg('log'), OUT = arg('out'), EVERY = +arg('every', 100), MAX = +arg('max', 800), PID = +arg('pid', 0);
fs.mkdirSync(OUT, { recursive: true });
const META = path.join(OUT, 'snaps.json');
const snaps = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let r0 = null, day = 0, pos = 0, tail = '';
function readDay() {
  if (!fs.existsSync(LOG)) return day;
  const st = fs.statSync(LOG); if (st.size < pos) pos = 0;
  if (st.size > pos) {
    const fd = fs.openSync(LOG, 'r'); const len = Math.min(st.size - pos, 64 << 20); const b = Buffer.alloc(len);
    fs.readSync(fd, b, 0, len, pos); fs.closeSync(fd); pos += len;
    const s = tail + b.toString('utf8'); const cut = s.lastIndexOf('\n'); tail = cut >= 0 ? s.slice(cut + 1) : s;
    const re = /답압 길 day (\d+)/g; let m;
    while ((m = re.exec(cut >= 0 ? s.slice(0, cut) : '')) !== null) { const v = +m[1]; if (r0 === null) r0 = v; day = Math.max(day, v - r0 + 1); }
  }
  return day;
}
const alive = (p) => { if (!p) return true; try { process.kill(p, 0); return true; } catch (e) { return false; } };
async function snap(name, d) {
  if (!fs.existsSync(DB)) return;
  const t0 = Date.now(), dest = path.join(OUT, name + '.db');
  try { fs.unlinkSync(dest); } catch (e) {}
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try { await db.backup(dest); } finally { db.close(); }
  snaps.push({ name, day: d, at: new Date().toISOString(), sec: +((Date.now() - t0) / 1000).toFixed(1), bytes: fs.statSync(dest).size });
  fs.writeFileSync(META, JSON.stringify(snaps, null, 1));
  console.log(`[t1379-snap] ${name} 날 ${d} · ${(fs.statSync(dest).size / 1e6).toFixed(1)}MB · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
}
(async () => {
  let next = EVERY; while (snaps.some((s) => s.name === 'd' + next)) next += EVERY;
  for (;;) {
    const d = readDay();
    while (d >= next && next <= MAX) { await snap('d' + next, d); next += EVERY; }
    if (!alive(PID)) break;
    await sleep(5000);
  }
  await sleep(3000); readDay();
  await snap('dEnd', day);
  console.log('[t1379-snap] 끝 — 마지막 날', day);
})().catch((e) => { console.error(e); process.exit(1); });
