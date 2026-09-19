#!/usr/bin/env node
// === scripts/t316-fish-perf.js — 세계 위 자: 어부 행위의 값 (T316 ③ · T284 문법) ============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// ★왜 — T297 은 **브라우저 랩**에서 실걸음 비용을 재고 51마을로 **외삽**했다(하루 10~32분).
//   T312 는 어부를 옮겼고 T316 이 관측자 없는 마을도 걷게 했다. 그 값을 이제 **세계 위에서** 잰다.
//   자는 `scripts/war-world-perf.js`(T284)의 그 자다 — 같은 부팅·같은 창·같은 `/perf`. 팔만 다르다.
//
// ★팔 둘 — 같은 틀 DB 에서 갈라진다(세계가 같아야 두 수가 비교된다):
//     off  `T312_FISH_ACT` 미설정   — 종전 수식 · 관측자 없는 마을은 안 걷는다
//     on   `T312_FISH_ACT=1`        — 어부가 걷고 낚고 나른다 · **관측자와 무관하게**
//
// ★내는 수: 존 틱 본문 p50/p95/max · 틱 빚(dropN · lagPct) · 걷는 어부 수 · 손에 든 사람·kg ·
//           **첫날 어획 합 ↔ 수식**(`delivered` ↔ `formulaPerDay`) · `land.water < 0.833` 마을의 어부 수
//
// 실행: node scripts/t316-fish-perf.js [out.json]
//   WARM_DAYS(기본 60) · DAY_MS(기본 20000) · WINDOW_S(기본 300) · ARMS="off,on"
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t316-fish-perf.json';
const WARM_DAYS = parseInt(process.env.WARM_DAYS || '60', 10);
const DAY_MS = parseInt(process.env.DAY_MS || '20000', 10);
const WINDOW_S = parseInt(process.env.WINDOW_S || '300', 10);
const TPL = '/tmp/t316-tpl.db';
const ARMS = (process.env.ARMS || 'off,on').split(',').filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);

function boot(tag, zenv) {
  const SECRET = 't316-' + tag;
  const CP = 3630, ZP = 3640;
  const logf = fs.openSync(`/tmp/t316-${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: `/tmp/t316-c-${tag}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS) }, zenv) });
  const perf = async (reset) => { try { const r = await fetch(`http://localhost:${ZP}/perf${reset ? '?reset=1' : ''}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(3000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  let ws = null, pinger = null;
  // 관측자 하나 — 카드 ③ 의 조건(그리고 존이 30초 무응답이면 끊으므로 5초 ping)
  const observe = () => { const WS = require(path.join(ROOT, 'node_modules', 'ws')); ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    pinger = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000); };
  return { z, perf, health, kill, observe, closeWs: () => { clearInterval(pinger); try { ws && ws.close(); } catch (e) {} } };
}
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

(async () => {
  const res = { at: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version }, WARM_DAYS, DAY_MS, WINDOW_S, arms: {} };
  // ── 틀 — 세계를 키운다(어부가 서려면 인구가 자라야 한다). **끈 팔로 굽는다**(두 팔이 같은 세계에서 갈라지게).
  if (!fs.existsSync(TPL) || process.env.REWARM === '1') {
    rmdb('/tmp/t316-z-warm.db');
    say(`틀 세계 굽기 — ${WARM_DAYS}일`);
    const b = boot('warm', { DB_PATH: '/tmp/t316-z-warm.db', VILLAGE_DAY_MS: String(Math.max(1500, Math.floor(DAY_MS / 10))) });
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    let d = 0; const t0 = Date.now();
    while (d < WARM_DAYS && Date.now() - t0 < 60 * 60000) { await sleep(10000); d = dayOf(await b.perf(false)); if ((Date.now() - t0) % 60000 < 10000) say('  틀 day', d); }
    await sleep(8000); await b.kill();
    rmdb(TPL);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync('/tmp/t316-z-warm.db' + s, TPL + s); } catch (e) {} }
    res.warmDay = d; say('틀 완료 day', d);
  }
  for (const arm of ARMS) {
    const db = `/tmp/t316-z-${arm}.db`; rmdb(db);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, db + s); } catch (e) {} }
    const env = { DB_PATH: db, VILLAGE_WAR_LOG: '0' };
    if (arm === 'on') env.T312_FISH_ACT = '1';
    say(`팔 ${arm} — T312_FISH_ACT ${arm === 'on' ? '1' : '(미설정)'}`);
    const b = boot(arm, env);
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    b.observe();
    // 첫 하루 경계를 지나 창을 연다 — **첫날 어획**은 그 경계 직후에 읽는다(등가 자)
    const d0 = dayOf(await b.perf(false)); let d = d0;
    const first = [];
    for (let i = 0; i < 120 && d < d0 + 2; i++) { await sleep(2000); const p = await b.perf(false); d = dayOf(p); if (p && p.fish) first.push({ d, delivered: p.fish.delivered, formulaPerDay: p.fish.formulaPerDay, cells: p.fish.cells, act: p.fish.actVillages }); }
    await b.perf(true);
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < WINDOW_S * 1000) { await sleep(20000); const p = await b.perf(false); if (p) samples.push({ t: Math.round((Date.now() - t0) / 1000), day: dayOf(p), walkers: p.fish ? p.fish.walkers : null, hands: p.fish ? p.fish.hands : null, delivered: p.fish ? p.fish.delivered : null }); }
    const p = await b.perf(false);
    res.arms[arm] = { day: dayOf(p),
      tick: p && p.tick ? { ms: p.tick.ms, dropN: p.tick.dropN, lagPct: p.tick.lagPct, maxGap: p.tick.maxGap, wall: p.tick.wall, sim: p.tick.sim } : null,
      loop: p && p.loop, fish: p && p.fish, first, samples };
    const t = p && p.tick && p.tick.ms;
    say(`  ${arm}: 틱 p50 ${t ? t.p50 : '?'} p95 ${t ? t.p95 : '?'} max ${t ? t.max : '?'} · drop ${p && p.tick ? p.tick.dropN : '?'} · lag ${p && p.tick ? p.tick.lagPct : '?'}%`
      + (p && p.fish ? ` · 걷는 어부 ${p.fish.walkers} · 손 ${p.fish.hands}(${p.fish.handKg}kg) · 입고 ${p.fish.delivered} · 수식/일 ${p.fish.formulaPerDay} · 얇은 마을 ${p.fish.thinN}` : ''));
    b.closeWs(); await b.kill(); rmdb(db);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  say('끝 →', OUT);
  process.exit(0);
})();
