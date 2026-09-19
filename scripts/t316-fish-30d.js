#!/usr/bin/env node
// === scripts/t316-fish-30d.js — 30일 뒤 어부 수: 그림자가격이 사람을 옮기나 (T316 ③) =======
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 — `t316-fish-perf.js` 는 **부하**를 잰다(짧은 창 · 틱 p50/p95). 이 자는 **배분**을 잰다:
//   어부가 진짜로 걸어가 낚아 오면 그 마을의 식량 그림자가격이 내려간다 ⇒ econ 이 다음 날
//   사람을 다른 직업으로 옮긴다. 그 이동이 **30일 뒤 어부 수**로 나타나는가. 카드 ③의 그 항이다.
//   특히 `land.water < 1/JOBS.fisher.base`(≈0.833) 인 **얇은 물** 마을 — T297 §2 가
//   "어부가 제 입을 못 채운다"고 판정한 자리들이 어떻게 되는가가 축이다.
//
// ★자는 손잡이와 무관해야 한다 — `fishPerf()` 는 끈 팔에서 **null** 이다(손잡이 뒤).
//   그래서 직업 수는 **`/lifedbg` 의 `econCounts`** 로 읽는다(두 팔이 같은 창으로 보인다).
//   물 값(`land.water`)은 켠 팔의 `fishPerf().thin` 이 이름으로 준다 — 지형은 두 팔이 같으므로
//   그 이름 집합을 **끈 팔에도 그대로** 댄다(족보 204 — 집합은 한 팔에서 뽑고 양쪽에 같이 댄다).
//
// 실행: ARM=off|on PORT_BASE=3650 node scripts/t316-fish-30d.js /tmp/out.json
//   RUN_DAYS(기본 30) · DAY_MS(기본 120000 — 통근 가능한 최소 낮 길이) · TPL(기본 /tmp/t316-tpl.db)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = (process.env.ARM || 'on').trim();
const PB = parseInt(process.env.PORT_BASE || '3650', 10);
const OUT = process.argv[2] || `/tmp/t316-30d-${ARM}.json`;
const RUN_DAYS = parseInt(process.env.RUN_DAYS || '30', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '120000', 10);
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(`[${ARM}]`, ...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

const SECRET = 't316-30d-' + ARM;
const CP = PB, ZP = PB + 1;
const DB = `/tmp/t316-30d-z-${ARM}.db`;
rmdb(DB); rmdb(`/tmp/t316-30d-c-${ARM}.db`);
for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }

const logf = fs.openSync(`/tmp/t316-30d-${ARM}.log`, 'w');
const zenv = { DB_PATH: DB, VILLAGE_WAR_LOG: '0' };
if (ARM === 'on') zenv.T312_FISH_ACT = '1';
const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
  env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t316-30d-c-${ARM}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
  env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
const getj = async (p, hdr) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, hdr ? { headers: hdr } : undefined); return await r.json(); } catch (e) { return null; } };
const perf = () => getj('/perf', { 'x-zone-secret': SECRET });
// ⚠`/lifedbg` 도 T225 안 문 뒤다 — `/perf` 와 **같은 열쇠**를 내밀어야 답한다(없으면 404 객체가 온다).
const lifedbg = () => getj('/lifedbg', { 'x-zone-secret': SECRET });
const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
// 직업 수 전수 — 이름 → econCounts(끈 팔에서도 보인다)
// ⚠`lifeDebug()` 는 **객체**를 돌려준다(`{t, phase, totals, villages:[…]}`) — 배열이 아니다.
//   첫 판은 그걸 배열로 알고 받아 `day0`/`dayEnd` 가 통째로 비었다(50분을 헛될 뻔했다).
const jobsOf = (L) => { const A = Array.isArray(L) ? L : (L && Array.isArray(L.villages) ? L.villages : null);
  if (!A) return { _err: JSON.stringify(L || null).slice(0, 200) };
  const m = {}; for (const v of A) m[v.name] = { pop: v.pop, carrying: v.carrying, c: v.econCounts || {} }; return m; };

(async () => {
  for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  // ⚠`econTick.last.day` 는 **첫 econ 하루가 끝나야** 채워진다 — 부팅 직후엔 0 이다.
  //   그 0 을 기준일로 잡으면 `d < d0 + RUN_DAYS` 가 첫 경계에서 바로 참이 되어 자가 일찍 닫힌다(첫 판의 실수).
  //   ⇒ **진짜 날이 보일 때까지 기다렸다가** 기준을 잡는다.
  let d0 = 0;
  for (let i = 0; i < 400 && !(d0 > 0); i++) { await sleep(15000); d0 = dayOf(await perf()); }
  const res = { arm: ARM, at: new Date().toISOString(), DAY_MS, RUN_DAYS, d0, day0: jobsOf(await lifedbg()), thin0: (await perf() || {}).fish || null, track: [] };
  say('시작 day', d0);
  let d = d0; const t0 = Date.now();
  while (d < d0 + RUN_DAYS && Date.now() - t0 < 150 * 60000) {
    await sleep(30000);
    const p = await perf(); d = dayOf(p);
    res.track.push({ t: Math.round((Date.now() - t0) / 1000), day: d,
      walkers: p && p.fish ? p.fish.walkers : null, delivered: p && p.fish ? p.fish.delivered : null,
      formulaPerDay: p && p.fish ? p.fish.formulaPerDay : null,
      tickP50: p && p.tick && p.tick.ms ? p.tick.ms.p50 : null });
    if (res.track.length % 10 === 0) { say('day', d, '/', d0 + RUN_DAYS); fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); }
  }
  const p = await perf();
  res.dEnd = dayOf(p);
  res.dayEnd = jobsOf(await lifedbg());
  res.fishEnd = p && p.fish || null;
  res.tickEnd = p && p.tick || null;
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  say('끝 day', res.dEnd, '→', OUT);
  clearInterval(pinger); try { ws.close(); } catch (e) {}
  try { z.kill('SIGINT'); } catch (e) {} await sleep(3000);
  try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {}
  await sleep(500); rmdb(DB); rmdb(`/tmp/t316-30d-c-${ARM}.db`);
  process.exit(0);
})();
