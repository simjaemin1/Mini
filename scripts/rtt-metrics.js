#!/usr/bin/env node
// === scripts/rtt-metrics.js — RTT 스파이크와 서버 무거운 작업의 **시간 상관** ==========
//
// ★[재민 지시 2026-08-30] *"서버 틱 소요(econ 하루 틱 346ms·주기 저장)와 RTT 스파이크의
//   시간 상관을 계측 로그로 — **수리는 이번이 아니다**. 상관 확인되면 econ 틱 분산을 회부로."*
//
// ★★계측기지 하네스가 아니다 — 러너에 넣지 마라. 판정을 안 하고 **수치를 낸다**.
//
// 방법:
//   · 진짜 WS 로 붙어 200ms 마다 ping → pong 왕복을 잰다(클라와 같은 경로).
//   · 서버 `/perf` 가 무거운 작업(`econ_day`·`save`·`tick`)의 시각·소요를 링으로 내준다.
//   · 두 시계열을 맞춰 **무거운 순간 ±창 안의 RTT** 와 **바깥 RTT** 를 비교한다.
//   ★하루를 짧게(`VILLAGE_DAY_MS`) 돌려 econ 경계를 여러 번 만든다 —
//     안 그러면 24분에 한 번이라 한 판에 표본이 0~1 개다(그래서 상관을 못 본다).
//
// 실행: node scripts/rtt-metrics.js [초=180] [VILLAGE_DAY_MS=8000]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const SECS = parseInt(process.argv[2], 10) || 180;
const DAY_MS = parseInt(process.argv[3], 10) || 8000;
const CPORT = 3010, ZPORT = 3020;
// ★DB 를 **재사용**한다 — 51마을 시딩이 첫 부팅에 수 분 걸린다(그건 재는 대상이 아니다).
//   두 번째 실행부터는 곧바로 뜬다. 지우고 싶으면 이 파일들을 지워라.
const CDB = '/tmp/rtt-central.db', ZDB = '/tmp/rtt-zone.db';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
    cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'],
  });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } }
process.on('exit', killAll);
async function waitHttp(url, tries = 300) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

(async () => {
  console.log(`\n=== RTT × 서버 무거운 작업 상관 (${SECS}초 · 하루 ${DAY_MS}ms) ===`);
  boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await waitHttp(`http://localhost:${CPORT}/zones`);
  boot('zone', 'zone.js', {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_DAY_MS: String(DAY_MS), ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    SAVE_INTERVAL_MS: '5000',
  });
  const _up = await waitHttp(`http://localhost:${ZPORT}/health`, 600);
  if (!_up) { console.error('  ✗ zone 이 안 떴다(첫 부팅은 51마을 시딩에 수 분 걸린다 — 다시 실행하면 빠르다)'); killAll(); process.exit(1); }
  await sleep(2000);

  const samples = [];   // {t, rtt}
  const ws = new WebSocket(`ws://localhost:${ZPORT}/?username=&password=`);
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  let welcomed = false;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.type === 'welcome') welcomed = true;
    if (m.type === 'pong' && typeof m.t === 'number') samples.push({ t: Date.now(), rtt: Date.now() - m.t });
  });
  for (let i = 0; i < 60 && !welcomed; i++) await sleep(200);
  console.log(welcomed ? '  접속 ok — 표본 수집 시작' : '  ⚠welcome 미도달(그래도 ping 은 답한다)');

  const iv = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 200);
  for (let s = 0; s < SECS; s++) { await sleep(1000); if ((s + 1) % 30 === 0) process.stdout.write(`  … ${s + 1}s (${samples.length}표본)\n`); }
  clearInterval(iv);

  const perf = await (await fetch(`http://localhost:${ZPORT}/perf`)).json();
  const ev = perf.events || [];
  try { ws.close(); } catch (e) {}

  const rtts = samples.map((x) => x.rtt);
  console.log(`\n  RTT 표본 ${rtts.length} — 중앙 ${pct(rtts, 0.5)}ms · p95 ${pct(rtts, 0.95)}ms · p99 ${pct(rtts, 0.99)}ms · 최대 ${Math.max(0, ...rtts)}ms`);
  const byKind = {};
  for (const e of ev) { (byKind[e.kind] = byKind[e.kind] || []).push(e.ms); }
  console.log('  서버 무거운 작업:');
  for (const [k, arr] of Object.entries(byKind)) {
    console.log(`    ${k.padEnd(9)} ${String(arr.length).padStart(4)}회 · 중앙 ${pct(arr, 0.5)}ms · 최대 ${Math.max(...arr)}ms`);
  }
  if (!ev.length) console.log('    (없음 — 이 판에선 무거운 작업이 한 번도 안 잡혔다)');

  // ★상관 — 무거운 작업 시각 ±WIN 안의 RTT 와 바깥 RTT
  const WIN = 600;
  for (const kind of Object.keys(byKind)) {
    const times = ev.filter((e) => e.kind === kind).map((e) => e.t);
    const near = [], far = [];
    for (const sm of samples) {
      const hit = times.some((t) => Math.abs(sm.t - t) <= WIN);
      (hit ? near : far).push(sm.rtt);
    }
    if (!near.length) { console.log(`  [${kind}] 창 안 표본 0 — 상관 판정 불가`); continue; }
    const mn = mean(near), mf = mean(far);
    const ratio = mf > 0 ? mn / mf : 0;
    console.log(`  [${kind}] ±${WIN}ms 창 안 RTT 평균 ${mn.toFixed(1)}ms (n=${near.length})`
      + ` vs 바깥 ${mf.toFixed(1)}ms (n=${far.length})  → ×${ratio.toFixed(2)}`
      + (ratio >= 1.5 ? '  ★상관 있음' : (ratio >= 1.15 ? '  · 약한 상관' : '  · 상관 없음')));
  }
  console.log('\n  ※이 스크립트는 **계측기**다 — 판정하지 않고 수치를 낸다. 수리는 회부(econ 틱 분산).');
  killAll();
  process.exit(0);
})().catch((e) => { console.error('계측기 크래시:', e); killAll(); process.exit(1); });
