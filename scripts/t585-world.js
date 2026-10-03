#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T585 ⑨ 자 · 제품 무변)
// === scripts/t585-world.js — 새 세계 실서버 한 판: 개울 위 집 0 · 집터 거부(개울·개울 완충) · 걸음 ×0.5 실측 ==================
//   한반도 존 하나(새 DB = 새 세계 · 생활층 켬 · 몸 걷기)를 띄워 econ 하루가 N 번 지날 때까지 돌린다.
//   ⚠하루 길이는 `VILLAGE_DAY_MS`(기본 4,000ms — 테스트 전용 손잡이)로 줄인다: 실제 하루(24분)로 100일은 40시간이다.
//     짧은 하루에선 몸이 거두는 일이 덜 된다(T410 §2) — 이 판은 **집터·걸음**을 보는 판이지 경제 판이 아니다.
//   끝나면: 존 DB 의 집(house·phouse) 부지 원판이 개울에 걸린 수 · `/perf streams`(거부 사유 수 · 걸음당 거리 개울 위/밖).
// 쓰는 법: node scripts/t585-world.js [일수 100] [out.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.argv[2] || 100), OUT = process.argv[3] || '/tmp/t585-world.json';
const DAY_MS = +(process.env.T585_DAY_MS || 4000);
const PORT = 30600 + (process.pid % 300), ZDB = `/tmp/t585w-zone-${process.pid}.db`;
for (const f of [ZDB, ZDB + '-wal', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (s) => process.stdout.write(s + '\n');
(async () => {
  const S = require(path.join(ROOT, 'server', 'streams.js'));
  const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
  const p = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PORT: String(PORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), T585_WALK_STAT: '1', CENTRAL_URL: 'http://127.0.0.1:9' }) });
  let up = false; p.stdout.on('data', (b) => { if (/zone server up on/.test(String(b))) up = true; }); p.stderr.on('data', () => {});
  const kill = () => { try { p.kill('SIGKILL'); } catch (e) {} }; process.on('exit', kill);
  for (let i = 0; i < 600 && !up; i++) await sleep(500);
  if (!up) { say('존 기동 실패'); process.exit(1); }
  const perf = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/perf`, { signal: AbortSignal.timeout(20000) })).json(); } catch (e) { return null; } };
  let last = null, t0 = Date.now();
  for (;;) {
    await sleep(5000);
    const P = await perf(); const st = P && P.streams; if (!st) continue;
    last = st; const d = st.villages && st.villages.day;
    if (d != null && (Date.now() - t0) % 60000 < 5000) say(`  … day ${d} · 거부 개울 ${st.villages.rejLot} · 완충 ${st.villages.rejGuard} · 걸음 ${JSON.stringify(st.walk)}`);
    if (d != null && d >= DAYS) break;
    if (Date.now() - t0 > (DAYS * DAY_MS * 4 + 600000)) { say('시간 초과'); break; }
  }
  kill(); await sleep(1500);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB, { readOnly: true });
  const houses = db.prepare("select village_id, type, cx, cy from village_buildings where type in ('house','phouse','hut_site','housesite')").all();
  const ta = { isStream: (x, y) => S.isStreamCell('hanbando', x, y) };
  let onLot = 0, onGuard = 0, n = 0, nb = 0;
  for (const h of houses) { if (h.type !== 'house' && h.type !== 'phouse') continue; n++; if (VL.discHitsStream(ta, h.cx, h.cy, VL.LOT_CELLS)) onLot++; if (VL.discHitsStream(ta, h.cx, h.cy, VL.LOT_GUARD)) onGuard++; }
  const farms = db.prepare("select cx, cy from village_buildings where type in ('farmland','dryfield','nongzone','granary')").all();
  let fOn = 0; for (const f of farms) if (S.isStreamCell('hanbando', f.cx, f.cy)) fOn++;
  const terr = db.prepare("select cx, cy from village_buildings where type = 'terr'").all();
  let tOn = 0; for (const t of terr) if (S.isStreamCell('hanbando', t.cx, t.cy)) tOn++;
  const vills = db.prepare('select count(*) n, sum(population) p from villages').get();
  db.close();
  const res = { days: last && last.villages && last.villages.day, dayMs: DAY_MS, villages: vills, houses: n, housesOnStreamLot: onLot, housesOnStreamGuard: onGuard,
    farmCells: farms.length, farmOnStream: fOn, terrCells: terr.length, terrOnStream: tOn, rej: last && last.villages, walk: last && last.walk, stats: last && last.stats };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  say(JSON.stringify(res, null, 1));
  for (const f of [ZDB, ZDB + '-wal', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
})();
