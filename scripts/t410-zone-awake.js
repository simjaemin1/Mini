#!/usr/bin/env node
// === scripts/t410-zone-awake.js — 존이 자도 걷는다(T410 ②③) · 빈 존의 값 ===================================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다
//   (손잡이는 계측 팔의 환경변수뿐 — `ZONE_IDLE_SKIP=1` 이면 종전 문 · 없으면 T410 문 열림).
//
// ★모드 둘
//   load   — 한 존(한반도) · **같은 틀**(T368 b 의 대조 팔 200일 DB · 몸 1,329) · 실제 날 1,440,000ms · 관측자 0 이 기본.
//            팔을 **나란히** 띄운다(같은 벽시계 = 같은 세계 낮밤 — 주민 낮밤은 `worldPhase` 라 벽시계가 곧 시각이다).
//            60초 조각마다: 세계 phase(낮/밤) · 존 틱 p50/p95/n(`/perf?reset`) · **존 프로세스 CPU%**(`/proc/<pid>/stat`) · RSS ·
//            몸 수 · 걸음(`walk.steps`) · 행위 넷의 관측 칸(`fish`·`wood`·`forage`·`farm` — 끔이면 null).
//            ⚠나란히 도는 팔은 **가벼운 팔끼리**만 묶는다(무거운 팔은 혼자 · CPU 2 — 한 팔이 다른 팔의 틱을 먹으면 값이 섞인다).
//   zones  — 여러 존(T373 이 부팅한 9존 + 닛폰) · 새 DB · **존마다 한 프로세스** · central 하나 · 관측자 0.
//            잠(`ZONE_IDLE_SKIP=1`) 판과 깸(기본) 판을 차례로 · 존별 CPU% · RSS · 틱 p50 · 합.
//   host   — ★카드 머리 "잠든 존이 깨어 있는 존의 틱을 먹지 않는지". **한 호스트 26존 동시**: 한반도(같은 틀 · 관측자 1 =
//            깨어 있는 존)는 내내 한 프로세스로 두고, 나머지 25존(새 DB · 관측자 0)을 잠 → 깸 → 잠(A-B-A · 낮밤 흐름을 양쪽이 나눠 가진다)으로
//            갈아 띄운다. 창마다: 한반도 틱 p50/p95/max · 한반도 CPU% · 25존 CPU 합 · RSS 합 · 호스트 전체 CPU(`/proc/stat` · 코어 합).
//            부팅은 다섯씩(부팅 봉우리 메모리를 겹치지 않게 · 이 호스트 8GB). `T410_WAITDAY=1` 이면 한반도가 새 하루 경계를 한 번 넘긴 뒤 잰다.
//   step   — 새 DB 빈 존 25개(깸)가 **첫 하루 경계**를 넘으면 값이 오르나(틀 존은 오른다) — 같은 프로세스의 경계 앞 창 대 뒤 창.
//
// 실행:  node scripts/t410-zone-awake.js load   (T410_ARMS="asleep,awake,obs" · T410_SLICES=26 · T410_WAITDAY=1 이면 새 하루부터)
//        node scripts/t410-zone-awake.js zones  (T410_ZONES="europa,…" · T410_ZWARM_S=90 · T410_ZWIN_S=240)
//        node scripts/t410-zone-awake.js host   (T410_HZONES="europa,…"(기본 25존) · T410_HSEQ="asleep,awake,asleep" · T410_HPORT=4400)
//        node scripts/t410-zone-awake.js step   (같은 25존 · 깸 · 첫 하루 경계 앞 창 대 뒤 창 · T410_ZWIN_S=180 · T410_HPORT=4500)
//   T410_TMP(기본 /tmp/t410) · T410_TPL(기본 <T368 b 틀>) · T410_OUT(결과 JSON)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = process.env.T410_TMP || '/tmp/t410';
const REAL_DAY_MS = 1440000;   // = `zone-config.js` WORLD.dayLengthMs(T376 이 대조한 그 수)
const SLICE_S = parseInt(process.env.T410_SLICE_S || '60', 10);
const CLK = 100;               // getconf CLK_TCK(리눅스 기본 · /proc/<pid>/stat 의 utime·stime 단위)
const ACTS = { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1', T312_FISH_ACT: '1', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '1' };
const ARM = {
  asleep: { env: { ZONE_IDLE_SKIP: '1' }, obs: false },            // 종전 문(사람 0 · 관측자 0 = 본문 없이 돌아간다)
  awake:  { env: {}, obs: false },                                 // T410 문 열림(기본)
  obs:    { env: {}, obs: true },                                  // 관측자 하나(누가 보고 있을 때의 대조)
  acts0:  { env: Object.assign({ ZONE_IDLE_SKIP: '1' }, ACTS), obs: false },   // 행위 넷 켬 · 문 닫힘(종전 세계)
  acts:   { env: Object.assign({}, ACTS), obs: false },            // 행위 넷 켬 · 문 열림
  actsobs:{ env: Object.assign({}, ACTS), obs: true },             // 행위 넷 켬 · 관측자 하나
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const cpdb = (a, b) => { rmdb(b); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
fs.mkdirSync(TMP, { recursive: true });

// ── 프로세스 자 — /proc 에서 읽는다(계측 전용 · 새 수 0) ──────────────────────────────────
function cpuTicks(pid) {
  try { const s = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const f = s.slice(s.lastIndexOf(')') + 2).split(' '); return (+f[11]) + (+f[12]); } catch (e) { return null; }
}
function rssMB(pid) {
  try { const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)\s+kB/); return m ? +(m[1] / 1024).toFixed(1) : null; } catch (e) { return null; }
}

function bootZone(tag, zoneId, env, dayMs, zdb, cport, zport, secret, withCentral, enabled) {
  const logf = fs.openSync(`${TMP}/${tag}.log`, 'w');
  let c = null;
  if (withCentral) {
    const cdb = `${TMP}/c-${tag}.db`; rmdb(cdb);
    c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(cport), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: enabled || zoneId, CENTRAL_SECRET: secret }) });
  }
  const zenv = { PORT: String(zport), ZONE_ID: zoneId, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(cport), CENTRAL_SECRET: secret,
    DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_WAR_LOG: '0' };
  if (dayMs) zenv.VILLAGE_DAY_MS = String(dayMs);
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, zenv, env) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${zport}${p}`, { headers: { 'x-zone-secret': secret }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { return (await fetch(`http://localhost:${zport}/health`, { signal: AbortSignal.timeout(5000) })).ok; } catch (e) { return false; } };
  let ws = null, pinger = null;
  const observe = async () => {
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    const L0 = await getj('/lifedbg');
    const v0 = (L0 && L0.villages || []).find((v) => v.ccx != null) || { ccx: 0, ccy: 0 };
    const ax = v0.ccx * 32 + 16, ay = v0.ccy * 32 + 16;
    ws = new WS(`ws://localhost:${zport}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    const look = () => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: ax, y: ay, w: 2000, h: 2000 })); } catch (e) {} };
    ws.on('open', look); pinger = setInterval(look, 5000);
    return v0.name || null;
  };
  const kill = async () => { clearInterval(pinger); try { ws && ws.close(); } catch (e) {} try { z.kill('SIGINT'); } catch (e) {} await sleep(3000);
    try { z.kill('SIGKILL'); } catch (e) {} try { c && c.kill('SIGKILL'); } catch (e) {} await sleep(300); };
  return { z, c, getj, health, observe, kill, pid: () => z.pid };
}
const lifeOf = (L) => {
  if (!L || !L.villages) return null;
  let bodies = 0, farmers = 0, nonSleep = 0, dTk = 0, mTk = 0;
  for (const v of L.villages) { bodies += v.pop || 0; farmers += (v.jobs && v.jobs.farmer) || 0; dTk += v.dTk || 0; mTk += v.mTk || 0;
    for (const [k, n] of Object.entries(v.acts || {})) if (k !== '취침') nonSleep += n; }
  return { phase: L.phase, dayR: L.dayR, villages: L.villages.length, bodies, farmers, nonSleep, dTk, mTk };
};
const actOf = (p) => {
  if (!p) return null;
  const o = {};
  if (p.fish) o.fish = { walkers: p.fish.walkers, hands: p.fish.hands, delivered: p.fish.delivered, formulaPerDay: p.fish.formulaPerDay, act: p.fish.actVillages };
  if (p.wood) o.wood = { walkers: p.wood.walkers, hands: p.wood.hands, delivered: p.wood.delivered, formulaPerDay: p.wood.formulaPerDay, cutDay: p.wood.cutDay, act: p.wood.actVillages };
  if (p.forage) o.forage = { walkers: p.forage.walkers, hands: p.forage.hands, delivered: p.forage.delivered, formulaPerDay: p.forage.formulaPerDay, pickDay: p.forage.pickDay, act: p.forage.actVillages };
  if (p.farm) o.farm = { working: p.farm.working, farmers: p.farm.farmers, harvestN: p.farm.harvestN, credUnits: p.farm.credUnits, hlBody: p.farm.hlBody, hlBatch: p.farm.hlBatch, food: p.farm.food };
  return o;
};

// ── load ─────────────────────────────────────────────────────────────────────
async function modeLoad() {
  const ARMS = (process.env.T410_ARMS || 'asleep,awake,obs').split(',').filter(Boolean);
  const TPL = process.env.T410_TPL || '/tmp/t368/srv/tpl-t100.db';
  const NSL = parseInt(process.env.T410_SLICES || '26', 10);
  const OUT = process.env.T410_OUT || `${TMP}/load.json`;
  if (!fs.existsSync(TPL)) { say('틀이 없다 —', TPL); process.exit(3); }
  const res = { at: new Date().toISOString(), host: { cpus: os.cpus().length, node: process.version, mem: +(os.totalmem() / 1048576).toFixed(0) }, TPL, REAL_DAY_MS, SLICE_S, ARMS, arms: {} };
  const B = {};
  let port = parseInt(process.env.T410_PORT || '4100', 10);
  for (const a of ARMS) {
    const def = ARM[a]; if (!def) { say('모르는 팔', a); continue; }
    const zdb = `${TMP}/load-${a}.db`; cpdb(TPL, zdb);
    B[a] = bootZone('load-' + a, 'hanbando', def.env, 0, zdb, port, port + 1, 't410-' + a, true);
    res.arms[a] = { env: def.env, obs: def.obs, slices: [] };
    port += 4;
  }
  const tb = Date.now();
  for (const a of ARMS) for (let i = 0; i < 600 && !(await B[a].health()); i++) await sleep(1000);
  say(`[load] 부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초 · 팔 ${ARMS.join(' · ')} · 틀 ${path.basename(TPL)}`);
  for (const a of ARMS) if (ARM[a].obs) say(`  [${a}] 관측자 → ${await B[a].observe()}`);
  await sleep(30000);
  //   새 하루부터(선택) — 부팅이 한낮이면 농부가 출근 창을 놓쳐 그날 쉰다(T368 b 와 같은 까닭 · 행위 팔에서만 쓴다)
  if (process.env.T410_WAITDAY === '1') {
    let ph0 = null; const tw = Date.now();
    for (;;) {
      const L = lifeOf(await B[ARMS[0]].getj('/lifedbg'));
      if (L && ph0 != null && L.phase + 0.5 < ph0) break;
      if (L) ph0 = Math.max(ph0 == null ? 0 : ph0, L.phase);
      if (Date.now() - tw > REAL_DAY_MS + 120000) break;
      await sleep(5000);
    }
    say(`  새 하루 — 기다림 ${((Date.now() - tw) / 1000).toFixed(0)}초`);
  }
  const prev = {};
  for (const a of ARMS) { await B[a].getj('/perf?reset=1'); prev[a] = { t: Date.now(), c: cpuTicks(B[a].pid()) }; }
  for (let k = 0; k < NSL; k++) {
    await sleep(SLICE_S * 1000);
    for (const a of ARMS) {
      const p = await B[a].getj('/perf?reset=1'), L = lifeOf(await B[a].getj('/lifedbg'));
      const now = Date.now(), c = cpuTicks(B[a].pid());
      const cpu = (c != null && prev[a].c != null) ? +(((c - prev[a].c) / CLK) / ((now - prev[a].t) / 1000) * 100).toFixed(2) : null;
      prev[a] = { t: now, c };
      const t = p && p.tick && p.tick.ms;
      const s = { k, phase: L ? L.phase : null, night: L ? L.phase > (L.dayR != null ? L.dayR : 0.7) : null,
        p50: t ? t.p50 : null, p95: t ? t.p95 : null, max: t ? t.max : null, n: t ? t.n : null, cpu, rss: rssMB(B[a].pid()),
        bodies: L ? L.bodies : null, nonSleep: L ? L.nonSleep : null, farmers: L ? L.farmers : null, dTk: L ? L.dTk : null, mTk: L ? L.mTk : null,
        steps: p && p.walk ? p.walk.steps : null, cut: p && p.walk ? p.walk.cutTicks : null, drop: p && p.tick ? p.tick.dropN : null, lag: p && p.tick ? p.tick.lagPct : null,
        usPer: (t && L && L.bodies > 0 && t.n > 0) ? +(t.p50 * 1000 / L.bodies).toFixed(4) : null, act: actOf(p) };
      res.arms[a].slices.push(s);
      say(`  [${a}] 조각 ${k} phase ${s.phase != null ? s.phase.toFixed(3) : '?'}${s.night ? '(밤)' : '(낮)'} · p50 ${s.p50}ms · p95 ${s.p95} · n ${s.n} · CPU ${s.cpu}% · RSS ${s.rss}MB · 몸 ${s.bodies} · 걸음 ${s.steps} · 사람당 ${s.usPer}µs`);
    }
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  for (const a of ARMS) { await B[a].kill(); rmdb(`${TMP}/load-${a}.db`); }
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  say('[load] 끝 →', OUT);
}

// ── zones ────────────────────────────────────────────────────────────────────
async function modeZones() {
  const Z = (process.env.T410_ZONES || 'europa,jungwon_n,jungwon_s,centaria,hindgang,nordan,sibara,bering,sahar,nippon').split(',').filter(Boolean);
  const WARM = parseInt(process.env.T410_ZWARM_S || '90', 10), WIN = parseInt(process.env.T410_ZWIN_S || '240', 10);
  const OUT = process.env.T410_OUT || `${TMP}/zones.json`;
  const MODES = (process.env.T410_ZMODES || 'asleep,awake').split(',').filter(Boolean);
  const res = { at: new Date().toISOString(), host: { cpus: os.cpus().length, node: process.version, mem: +(os.totalmem() / 1048576).toFixed(0) }, zones: Z, WARM, WIN, modes: {} };
  for (const m of MODES) {
    const env = m === 'asleep' ? { ZONE_IDLE_SKIP: '1' } : {};
    const cport = parseInt(process.env.T410_ZPORT || '4200', 10);
    const secret = 't410-zones-' + m;
    const cdb = `${TMP}/zc-${m}.db`; rmdb(cdb);
    const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(cport), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: Z.join(','), CENTRAL_SECRET: secret }) });
    const Bz = {};
    Z.forEach((zid, i) => {
      const zdb = `${TMP}/z-${m}-${zid}.db`; rmdb(zdb);
      Bz[zid] = bootZone(`zone-${m}-${zid}`, zid, env, 0, zdb, cport, cport + 2 + i * 2, secret, false);
    });
    const tb = Date.now();
    for (const zid of Z) for (let i = 0; i < 900 && !(await Bz[zid].health()); i++) await sleep(1000);
    say(`[zones] ${m} — ${Z.length}존 부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초 · 데우기 ${WARM}초`);
    await sleep(WARM * 1000);
    const c0 = {}, t0 = Date.now();
    for (const zid of Z) { c0[zid] = cpuTicks(Bz[zid].pid()); await Bz[zid].getj('/perf?reset=1'); }
    await sleep(WIN * 1000);
    const rows = {}; let sum = 0, rsum = 0;
    const el = (Date.now() - t0) / 1000;
    for (const zid of Z) {
      const c1 = cpuTicks(Bz[zid].pid()), p = await Bz[zid].getj('/perf'), L = lifeOf(await Bz[zid].getj('/lifedbg'));
      const cpu = (c1 != null && c0[zid] != null) ? +(((c1 - c0[zid]) / CLK) / el * 100).toFixed(2) : null;
      const t = p && p.tick && p.tick.ms;
      rows[zid] = { cpu, rss: rssMB(Bz[zid].pid()), p50: t ? t.p50 : null, p95: t ? t.p95 : null, n: t ? t.n : null,
        villages: L ? L.villages : null, bodies: L ? L.bodies : null, steps: p && p.walk ? p.walk.steps : null, phase: L ? L.phase : null, alive: Bz[zid].z.exitCode == null };
      sum += cpu || 0; rsum += rows[zid].rss || 0;
      say(`  [${m}] ${zid.padEnd(10)} CPU ${cpu}% · RSS ${rows[zid].rss}MB · p50 ${rows[zid].p50}ms · n ${rows[zid].n} · 마을 ${rows[zid].villages} · 몸 ${rows[zid].bodies} · 걸음 ${rows[zid].steps}`);
    }
    res.modes[m] = { env, elapsedS: +el.toFixed(1), rows, cpuSum: +sum.toFixed(2), rssSum: +rsum.toFixed(1) };
    say(`  [${m}] 합 CPU ${sum.toFixed(2)}% · 합 RSS ${rsum.toFixed(0)}MB`);
    for (const zid of Z) await Bz[zid].kill();
    try { c.kill('SIGKILL'); } catch (e) {}
    for (const zid of Z) rmdb(`${TMP}/z-${m}-${zid}.db`);
    rmdb(cdb);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    await sleep(3000);
  }
  say('[zones] 끝 →', OUT);
}

// ── host ─────────────────────────────────────────────────────────────────────
//   호스트 전체 CPU — `/proc/stat` 첫 줄(모든 코어 합 · 단위 CLK) · 바쁨 = 전체 − idle − iowait
function hostTicks() {
  try {
    const f = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
    const tot = f.reduce((a, b) => a + b, 0), idle = (f[3] || 0) + (f[4] || 0);
    return { tot, busy: tot - idle, steal: f[7] || 0 };
  } catch (e) { return null; }
}
async function modeHost() {
  const Z = (process.env.T410_HZONES || 'europa,jungwon_n,jungwon_s,centaria,hindgang,nordan,sibara,bering,sahar,nippon,' +
    'canadia,nubiano,mayan,amazonia,patagona,atlantic,kongra,indoyang,nanyang,east_sea_s,oseania,japan_pacific,nambingyang,pacific_arctic,pacific').split(',').filter(Boolean);
  const SEQ = (process.env.T410_HSEQ || 'asleep,awake,asleep').split(',').filter(Boolean);
  const WARM = parseInt(process.env.T410_ZWARM_S || '90', 10), WIN = parseInt(process.env.T410_ZWIN_S || '240', 10);
  const TPL = process.env.T410_TPL || '/tmp/t368/srv/tpl-t100.db';
  const OUT = process.env.T410_OUT || `${TMP}/host.json`;
  if (!fs.existsSync(TPL)) { say('틀이 없다 —', TPL); process.exit(3); }
  const cport = parseInt(process.env.T410_HPORT || '4400', 10);
  const secret = 't410-host';
  const res = { at: new Date().toISOString(), host: { cpus: os.cpus().length, node: process.version, mem: +(os.totalmem() / 1048576).toFixed(0) },
    TPL, zones: Z, SEQ, WARM, WIN, rounds: [] };
  const cdb = `${TMP}/hc.db`; rmdb(cdb);
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(cport), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ['hanbando'].concat(Z).join(','), CENTRAL_SECRET: secret }) });
  const hdb = `${TMP}/h-hanbando.db`; cpdb(TPL, hdb);
  const H = bootZone('host-hanbando', 'hanbando', {}, 0, hdb, cport, cport + 2, secret, false);   // 기본 손잡이 · 관측자가 있어 문은 어느 판이든 열려 있다
  for (let i = 0; i < 600 && !(await H.health()); i++) await sleep(1000);
  say(`[host] 한반도 부팅 · 관측자 → ${await H.observe()} · 빈 존 ${Z.length} · 차례 ${SEQ.join(' → ')}`);
  await sleep(30000);
  //   ★새 하루 경계를 한 번 넘기고 잰다(`T410_WAITDAY=1`) — 틀 DB 로 띄운 존은 **부팅 뒤 첫 경계**에서 틱 값이 한 칸 오른다
  //     (load 판 실측: 깸 0.83 → 1.24ms · 관측자 1.90 → 2.02ms). A-B-A 창 사이에 그 계단이 끼면 판이 섞인다.
  if (process.env.T410_WAITDAY === '1') {
    let ph0 = null; const tw = Date.now();
    for (;;) {
      const L = lifeOf(await H.getj('/lifedbg'));
      if (L && ph0 != null && L.phase + 0.5 < ph0) break;
      if (L) ph0 = Math.max(ph0 == null ? 0 : ph0, L.phase);
      if (Date.now() - tw > REAL_DAY_MS + 120000) break;
      await sleep(5000);
    }
    say(`  새 하루 — 기다림 ${((Date.now() - tw) / 1000).toFixed(0)}초`);
    await sleep(60000);   // 경계 일(econ · 헤드리스 일괄)이 지나가게
  }
  for (let r = 0; r < SEQ.length; r++) {
    const m = SEQ[r], env = m === 'asleep' ? { ZONE_IDLE_SKIP: '1' } : {};
    const Bz = {}, tb = Date.now();
    for (let i = 0; i < Z.length; i += 5) {
      const grp = Z.slice(i, i + 5);
      grp.forEach((zid, j) => { const zdb = `${TMP}/hz-${zid}.db`; rmdb(zdb);
        Bz[zid] = bootZone(`host-${r}-${m}-${zid}`, zid, env, 0, zdb, cport, cport + 4 + (i + j) * 2, secret, false); });
      for (const zid of grp) for (let k = 0; k < 900 && !(await Bz[zid].health()); k++) await sleep(1000);
    }
    say(`[host] 판 ${r} ${m} — ${Z.length}존 부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초 · 데우기 ${WARM}초`);
    await sleep(WARM * 1000);
    const c0 = {}; for (const zid of Z) c0[zid] = cpuTicks(Bz[zid].pid());
    const hc0 = cpuTicks(H.pid()), s0 = hostTicks();
    await H.getj('/perf?reset=1');
    const t0 = Date.now();
    await sleep(WIN * 1000);
    const el = (Date.now() - t0) / 1000;
    const hp = await H.getj('/perf'), HL = lifeOf(await H.getj('/lifedbg')), hc1 = cpuTicks(H.pid()), s1 = hostTicks();
    const t = hp && hp.tick && hp.tick.ms;
    const han = { p50: t ? t.p50 : null, p95: t ? t.p95 : null, max: t ? t.max : null, n: t ? t.n : null,
      lag: hp && hp.tick ? hp.tick.lagPct : null, drop: hp && hp.tick ? hp.tick.dropN : null,
      cpu: (hc1 != null && hc0 != null) ? +(((hc1 - hc0) / CLK) / el * 100).toFixed(2) : null, rss: rssMB(H.pid()),
      phase: HL ? HL.phase : null, bodies: HL ? HL.bodies : null, steps: hp && hp.walk ? hp.walk.steps : null };
    const rows = {}; let sum = 0, rsum = 0, alive = 0;
    for (const zid of Z) {
      const c1 = cpuTicks(Bz[zid].pid());
      const cpu = (c1 != null && c0[zid] != null) ? +(((c1 - c0[zid]) / CLK) / el * 100).toFixed(2) : null;
      const ok = Bz[zid].z.exitCode == null; if (ok) alive++;
      rows[zid] = { cpu, rss: rssMB(Bz[zid].pid()), alive: ok };
      sum += cpu || 0; rsum += rows[zid].rss || 0;
    }
    const hostCpu = (s0 && s1 && s1.tot > s0.tot) ? +((s1.busy - s0.busy) / (s1.tot - s0.tot) * 100 * os.cpus().length).toFixed(1) : null;
    const hostSteal = (s0 && s1 && s1.tot > s0.tot) ? +((s1.steal - s0.steal) / (s1.tot - s0.tot) * 100 * os.cpus().length).toFixed(2) : null;
    const row = { r, m, env, elapsedS: +el.toFixed(1), han, othersCpu: +sum.toFixed(2), othersRss: +rsum.toFixed(1), alive, hostCpu, hostSteal, rows };
    res.rounds.push(row);
    say(`  [${r} ${m}] 한반도(관측자 1) p50 ${han.p50}ms · p95 ${han.p95} · max ${han.max} · n ${han.n} · CPU ${han.cpu}% · phase ${han.phase != null ? han.phase.toFixed(3) : '?'}` +
      ` │ 25존 합 CPU ${row.othersCpu}% · RSS ${(rsum / 1024).toFixed(2)}GB · 산 ${alive}/${Z.length} │ 호스트 ${hostCpu}%(코어 합) · steal ${hostSteal}%`);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    await Promise.all(Z.map((zid) => Bz[zid].kill()));
    for (const zid of Z) rmdb(`${TMP}/hz-${zid}.db`);
    await sleep(5000);
  }
  await H.kill(); try { c.kill('SIGKILL'); } catch (e) {}
  rmdb(hdb); rmdb(cdb);
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  say('[host] 끝 →', OUT);
}

// ── step — 새 DB 빈 존이 **첫 하루 경계를 넘으면** 값이 오르나(틀 존은 오른다 — load 판 깸 0.83 → 1.24ms) ──────────
//   25존(깸 · 기본 손잡이 · 관측자 0)을 한 판 띄워 **같은 프로세스**로 경계 앞 창 · 경계 뒤 창을 잰다.
//   경계 = 세계 phase 0(= 마을 하루 경계 · 둘 다 1,440,000ms · epoch 0). 창 앞은 경계 20초 전에 끝나고, 창 뒤는 경계 60초 뒤에 연다.
async function modeStep() {
  const Z = (process.env.T410_HZONES || 'europa,jungwon_n,jungwon_s,centaria,hindgang,nordan,sibara,bering,sahar,nippon,' +
    'canadia,nubiano,mayan,amazonia,patagona,atlantic,kongra,indoyang,nanyang,east_sea_s,oseania,japan_pacific,nambingyang,pacific_arctic,pacific').split(',').filter(Boolean);
  const WIN = parseInt(process.env.T410_ZWIN_S || '180', 10);
  const OUT = process.env.T410_OUT || `${TMP}/step.json`;
  const cport = parseInt(process.env.T410_HPORT || '4500', 10);
  const secret = 't410-step';
  const toWrap = () => REAL_DAY_MS - (Date.now() % REAL_DAY_MS);
  const res = { at: new Date().toISOString(), host: { cpus: os.cpus().length, node: process.version }, zones: Z, WIN, windows: {} };
  const cdb = `${TMP}/sc.db`; rmdb(cdb);
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(cport), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: Z.join(','), CENTRAL_SECRET: secret }) });
  const Bz = {}, tb = Date.now();
  for (let i = 0; i < Z.length; i += 5) {
    const grp = Z.slice(i, i + 5);
    grp.forEach((zid, j) => { const zdb = `${TMP}/sz-${zid}.db`; rmdb(zdb);
      Bz[zid] = bootZone(`step-${zid}`, zid, {}, 0, zdb, cport, cport + 2 + (i + j) * 2, secret, false); });
    for (const zid of grp) for (let k = 0; k < 900 && !(await Bz[zid].health()); k++) await sleep(1000);
  }
  say(`[step] ${Z.length}존 부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초 · 경계까지 ${(toWrap() / 1000).toFixed(0)}초`);
  if (toWrap() < (WIN + 80) * 1000) { say('  경계가 너무 가깝다 — 다음 경계를 기다린다'); await sleep(toWrap() + 5000); }
  await sleep(Math.max(0, toWrap() - (WIN + 20) * 1000));
  const win = async (tag) => {
    const c0 = {}; for (const zid of Z) { c0[zid] = cpuTicks(Bz[zid].pid()); await Bz[zid].getj('/perf?reset=1'); }
    const t0 = Date.now(), s0 = hostTicks();
    await sleep(WIN * 1000);
    const el = (Date.now() - t0) / 1000, s1 = hostTicks();
    const rows = {}; let sum = 0;
    for (const zid of Z) {
      const c1 = cpuTicks(Bz[zid].pid()), p = await Bz[zid].getj('/perf'), L = lifeOf(await Bz[zid].getj('/lifedbg'));
      const cpu = (c1 != null && c0[zid] != null) ? +(((c1 - c0[zid]) / CLK) / el * 100).toFixed(2) : null;
      const t = p && p.tick && p.tick.ms;
      rows[zid] = { cpu, p50: t ? t.p50 : null, p95: t ? t.p95 : null, n: t ? t.n : null, rss: rssMB(Bz[zid].pid()), phase: L ? L.phase : null,
        bodies: L ? L.bodies : null, dTk: L ? L.dTk : null, mTk: L ? L.mTk : null, alive: Bz[zid].z.exitCode == null };
      sum += cpu || 0;
    }
    const hostCpu = (s0 && s1 && s1.tot > s0.tot) ? +((s1.busy - s0.busy) / (s1.tot - s0.tot) * 100 * os.cpus().length).toFixed(1) : null;
    res.windows[tag] = { elapsedS: +el.toFixed(1), cpuSum: +sum.toFixed(2), hostCpu, rows };
    say(`  [${tag}] 25존 합 CPU ${sum.toFixed(2)}% · 호스트 ${hostCpu}% · ` + Z.map((z) => `${z} ${rows[z].cpu}%/${rows[z].p50}ms`).join(' · '));
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  };
  await win('before');
  await sleep(toWrap() + 60000);
  await win('after');
  await Promise.all(Z.map((zid) => Bz[zid].kill()));
  try { c.kill('SIGKILL'); } catch (e) {}
  for (const zid of Z) rmdb(`${TMP}/sz-${zid}.db`);
  rmdb(cdb);
  say('[step] 끝 →', OUT);
}

(async () => {
  const mode = process.argv[2] || 'load';
  if (mode === 'load') await modeLoad();
  else if (mode === 'zones') await modeZones();
  else if (mode === 'host') await modeHost();
  else if (mode === 'step') await modeStep();
  else { say('모드: load | zones | host | step'); process.exit(2); }
  process.exit(0);
})();
