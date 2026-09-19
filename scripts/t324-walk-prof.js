#!/usr/bin/env node
// === scripts/t324-walk-prof.js — 걸음 하나가 어디에 250µs 를 쓰나 (T324 ① · T316 문법) ==========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 — T316: 51마을 1,476명 전원 걷기 = 존 틱 p50 **374.6ms** ⇒ 걸음 하나 **250µs**.
//   10,000명 × 30Hz 예산은 **사람당 3.3µs**(추신 1) — 75배다. 그 75배의 주인을 **추측 없이** 가른다.
//
// ★두 자를 같이 쓴다(둘 다 제품 무접촉):
//   ⓐ **호출 수** — `/perf` 의 `walk` 창(zone.js `walkPerf`): 걸음 수 · 탈출 루프에 든 걸음 · 그 루프의
//      지형 질의 수 · 지형/물/벽 술어 호출 수. **"몇 번 부르나"** 는 여기서 온다.
//   ⓑ **자리별 ms** — `node --cpu-prof` 로 존 프로세스를 뜬다. V8 샘플러가 자기시간(self time)을 함수별로
//      준다. **"한 번이 몇 µs 냐"** 는 여기서 온다. 둘을 곱하면 자리별 예산이 닫힌다(족보 223).
//
// 실행: node scripts/t324-walk-prof.js [out.json]
//   ARM=on|off(기본 on) · DAY_MS(기본 1440000 = 배포 정본 — T316 §4-ⓐ: 짧은 날로 잰 걸음 값은 못 쓴다)
//   WINDOW_S(기본 180) · PROF=1(cpu-prof 켬) · PORT_BASE(기본 3660) · TPL(기본 /tmp/t316-tpl.db)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = (process.env.ARM || 'on').trim();
const PB = parseInt(process.env.PORT_BASE || '3660', 10);
const OUT = process.argv[2] || `/tmp/t324-walk-${ARM}.json`;
const DAY_MS = parseInt(process.env.DAY_MS || '1440000', 10);
const WINDOW_S = parseInt(process.env.WINDOW_S || '180', 10);
const PROF = process.env.PROF === '1';
const PROFDIR = process.env.PROFDIR || `/tmp/t324-prof-${ARM}`;
const TPL = process.env.TPL || '/tmp/t316-tpl.db';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(`[${ARM}]`, ...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

const SECRET = 't324-' + ARM;
const CP = PB, ZP = PB + 1;
const DB = `/tmp/t324-z-${ARM}.db`;
rmdb(DB); rmdb(`/tmp/t324-c-${ARM}.db`);
for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
try { fs.mkdirSync(PROFDIR, { recursive: true }); } catch (e) {}

const logf = fs.openSync(`/tmp/t324-${ARM}.log`, 'w');
const zenv = { DB_PATH: DB, VILLAGE_WAR_LOG: '0' };
if (ARM === 'on') zenv.T312_FISH_ACT = '1';
const zargs = PROF ? ['--cpu-prof', '--cpu-prof-dir', PROFDIR, '--cpu-prof-name', `zone-${ARM}.cpuprofile`, path.join(ROOT, 'server/zone.js')]
                   : [path.join(ROOT, 'server/zone.js')];
const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
  env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t324-c-${ARM}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
const z = spawn(process.execPath, zargs, { cwd: ROOT, stdio: ['ignore', logf, logf],
  env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
const getj = async (p, h) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, h ? { headers: h } : undefined); return await r.json(); } catch (e) { return null; } };
const perf = (reset) => getj(`/perf${reset ? '?reset=1' : ''}`, { 'x-zone-secret': SECRET });
const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };

(async () => {
  for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  await sleep(20000);                 // 마을이 깨어나 걷기 시작할 시간(직업 현장 캐시가 서는 첫 틱들)
  await perf(true);                   // 영점
  const t0 = Date.now(); const track = [];
  while (Date.now() - t0 < WINDOW_S * 1000) {
    await sleep(20000);
    const p = await perf(false);
    if (p) track.push({ t: Math.round((Date.now() - t0) / 1000), walk: p.walk, p50: p.tick && p.tick.ms ? p.tick.ms.p50 : null, n: p.tick && p.tick.ms ? p.tick.ms.n : null });
  }
  const p = await perf(false);
  // ★[T324 ⓒ] 커서의 값은 ms 가 아니라 **덮는 범위**다 — T316 이 잰 결함(앞줄만 일한다)이 얼마나 줄었나.
  //   `/lifedbg` 의 라벨로 센다(손잡이 밖 · 두 팔 같은 창): 비취침 비율 · 마을별 일하는 사람 수.
  const L = await getj('/lifedbg', { 'x-zone-secret': SECRET });
  const V = (L && Array.isArray(L.villages)) ? L.villages : [];
  let nonSleep = 0, pop = 0, vilWorking = 0;
  for (const v of V) {
    const ns = Object.entries(v.acts || {}).reduce((a, [k, n]) => a + (k === '취침' ? 0 : n), 0);
    nonSleep += ns; pop += v.pop || 0; if (ns > 0) vilWorking++;
  }
  const cover = { phase: L && L.phase, pop, nonSleep, pct: pop ? +(100 * nonSleep / pop).toFixed(1) : null,
                  villages: V.length, villagesWorking: vilWorking };
  const res = { arm: ARM, at: new Date().toISOString(), DAY_MS, WINDOW_S, prof: PROF ? PROFDIR : null,
    walk: p && p.walk, tick: p && p.tick, fish: p && p.fish, cover, track };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  const w = res.walk || {};
  say(`걸음 ${w.steps} · 탈출 루프 ${w.eject}(${w.ejPerStep}/걸음 · 주민 ${w.ejectPids}명 · 질의 ${w.ejectQ} · 탈출실패 ${w.ejectFail})`);
  say(`지형 질의 ${w.terrQ}(${w.terrPerStep}/걸음) · 물 ${w.waterQ} · 벽 ${w.wallQ}(${w.wallPerStep}/걸음)`);
  say(`틱 p50 ${p && p.tick && p.tick.ms ? p.tick.ms.p50 : '?'}ms · drop ${p && p.tick ? p.tick.dropN : '?'} · lag ${p && p.tick ? p.tick.lagPct : '?'}%`);
  clearInterval(pinger); try { ws.close(); } catch (e) {}
  try { z.kill('SIGINT'); } catch (e) {} await sleep(PROF ? 8000 : 3000);
  try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {}
  await sleep(500); rmdb(DB); rmdb(`/tmp/t324-c-${ARM}.db`);
  say(`덮는 범위 — 비취침 ${cover.nonSleep}/${cover.pop}(${cover.pct}%) · 일하는 마을 ${cover.villagesWorking}/${cover.villages} · phase ${cover.phase}`);
  say('끝 →', OUT);
  process.exit(0);
})();
