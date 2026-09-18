#!/usr/bin/env node
// === scripts/war-world-perf.js — 실체 전쟁의 비용을 **세계 전체 부하 위에서** 잰다 (T284 ④) ==============
//
// ★★계측기다. 하네스가 아니다 — 러너에 넣지 마라(첫 줄 등재 표 없음 · 판정하지 않고 수를 낸다).
// ★[재민 확정 2026-09-14] 전쟁만 재는 마이크로벤치는 자로 안 쓴다. 같은 세계(실지도 마을 전부 · 생활층 · 야생 ·
//   캐러밴 · 시드 1020)를 존으로 띄우고, 관측자 하나를 붙여 존 틱 본문이 전부 돌게 한 뒤 팔을 가른다:
//     팔 W0/W1/W3/W6 — 전쟁 0·1·3·6건(WAR_FIXTURE=assault*N · WAR_FIXTURE_REPEAT=1 로 창 내내 N건 · 표본 상한 기본 34)
//     팔 S*        — 병사 수 팔(VILLAGE_WAR_SAMPLE 로 표본 상한을 올리고 전쟁 수로 100·300·600 을 겨냥 — 실제 수는 soldiersMax)
//   각 팔: 같은 틀 DB(세계를 WARM_DAYS 일 키운 것)를 복사 → 기동 → 창 WINDOW_S 초 → /perf 한 번.
//   내는 수: 존 틱 본문 p50/p95/max(ms) · 틱 빚 drop · 전쟁 틱(전체·교전 중) p50/p95 · 병사 최대 · 전이 통계 · 루프 지연.
// ⚠컨테이너 2코어 기준이다 — VPS 와 절대값이 다르다. 팔 사이 **비율**만 믿는다.
//
// 실행: node scripts/war-world-perf.js [out.json]
//   WARM_DAYS(기본 150) · DAY_MS(기본 20000) · WINDOW_S(기본 420) · ARMS="W0,W1,W3,W6,S100,S300,S600"
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/war-world-perf.json';
const WARM_DAYS = parseInt(process.env.WARM_DAYS || '150', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '20000', 10);
const WINDOW_S = parseInt(process.env.WINDOW_S || '420', 10);
const ARM_DEFS = {
  W0: { wars: 0 }, W1: { wars: 1 }, W3: { wars: 3 }, W6: { wars: 6 },
  S100: { wars: 2, sample: 80 }, S300: { wars: 5, sample: 80 }, S600: { wars: 10, sample: 80 },
  SMAX: { wars: 25, sample: 80 },   // 51마을이 낼 수 있는 최대(겹치지 않는 쌍 25 · 마을당 pid 상한 40)
};
const ARMS = (process.env.ARMS || 'W0,W1,W3,W6,S100,S300,S600').split(',').filter(a => ARM_DEFS[a]);
const TPL = '/tmp/war-world-tpl.db';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function boot(tag, zenv) {
  const SECRET = 'wwp-' + tag;
  const CP = 3610, ZP = 3620;
  const logf = fs.openSync(`/tmp/wwp-${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/wwp-c-${tag}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
  const perf = async (reset) => { try { const r = await fetch(`http://localhost:${ZP}/perf${reset ? '?reset=1' : ''}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  let ws = null;
  let pinger = null;
  // 관측자 — 30초 무응답이면 존이 끊는다(STALE_WS_MS) ⇒ 5초마다 ping(클라와 같은 말).
  const observe = () => { const WS = require(path.join(ROOT, 'node_modules', 'ws')); ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000); };
  return { z, perf, health, kill, observe, closeWs: () => { clearInterval(pinger); try { ws && ws.close(); } catch (e) {} } };
}
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

(async () => {
  const res = { at: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version }, WARM_DAYS, DAY_MS, WINDOW_S, arms: {} };
  // ── 틀: 세계를 WARM_DAYS 일 키운다(인구가 자라야 병사 표본이 찬다) ──
  if (!fs.existsSync(TPL) || process.env.REWARM === '1') {
    rmdb('/tmp/wwp-z-warm.db');
    say(`틀 세계 굽기 — ${WARM_DAYS}일 × ${DAY_MS / 1000 / 10}s`);
    const b = boot('warm', { DB_PATH: '/tmp/wwp-z-warm.db', VILLAGE_DAY_MS: String(Math.max(1500, Math.floor(DAY_MS / 10))) });
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    let d = 0; const t0 = Date.now();
    while (d < WARM_DAYS && Date.now() - t0 < 90 * 60000) { await sleep(10000); d = dayOf(await b.perf(false)); if ((Date.now() - t0) % 60000 < 10000) say('  틀 day', d); }
    await sleep(8000);   // 저장 큐 흘림
    await b.kill();
    rmdb(TPL);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync('/tmp/wwp-z-warm.db' + s, TPL + s); } catch (e) {} }
    res.warmDay = d;
    say('틀 완료 day', d);
  }
  for (const arm of ARMS) {
    const A = ARM_DEFS[arm];
    const db = `/tmp/wwp-z-${arm}.db`; rmdb(db);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, db + s); } catch (e) {} }
    const env = { DB_PATH: db, VILLAGE_WAR_LOG: '0' };
    if (A.wars > 0) { env.WAR_FIXTURE = `assault*${A.wars}`; env.WAR_FIXTURE_DAY = '1'; env.WAR_FIXTURE_REPEAT = '1'; }   // 끝난 만큼 다시 선포 — 창 내내 N건
    if (A.sample) env.VILLAGE_WAR_SAMPLE = String(A.sample);
    say(`팔 ${arm} — 전쟁 ${A.wars} · 표본 ${A.sample || '기본'}`);
    const b = boot(arm, env);
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    b.observe();
    // 첫 하루 경계(픽스처) + 한 날 뒤에 창을 연다
    const d0 = dayOf(await b.perf(false)); let d = d0;
    for (let i = 0; i < 120 && d < d0 + 1; i++) { await sleep(2000); d = dayOf(await b.perf(false)); }
    await b.perf(true);
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < WINDOW_S * 1000) { await sleep(30000); const p = await b.perf(false); if (p && p.war) samples.push({ t: Math.round((Date.now() - t0) / 1000), soldiers: p.war.soldiers, fighting: p.war.fighting, engaged: p.war.engaged, bodies: p.war.bodies }); }
    const p = await b.perf(false);
    res.arms[arm] = { def: A, day: dayOf(p), tick: p && p.tick ? { ms: p.tick.ms, dropN: p.tick.dropN, lagPct: p.tick.lagPct, maxGap: p.tick.maxGap } : null,
      war: p && p.war, loop: p && p.loop, samples };
    say(`  ${arm}: 틱 p50 ${p && p.tick && p.tick.ms ? p.tick.ms.p50 : '?'} p95 ${p && p.tick && p.tick.ms ? p.tick.ms.p95 : '?'} · 전쟁 p95 ${p && p.war ? p.war.p95 : '?'} 교전 p95 ${p && p.war ? p.war.engP95 : '?'} · 병사 최대 ${p && p.war ? p.war.soldiersMax : '?'} · drop ${p && p.tick ? p.tick.dropN : '?'}`);
    b.closeWs();
    await b.kill();
    rmdb(db);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  say('끝 →', OUT);
  process.exit(0);
})();
