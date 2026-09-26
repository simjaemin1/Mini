#!/usr/bin/env node
// === scripts/t376-body-cap.js — T376 계측기: **몸 수 상한 40 을 풀면 무엇이 되나** ==========
//   (러너 밖 — `@regress` 표 없음. 제품은 **한 글자도 안 만진다** — 손잡이는 이미 있는 환경변수뿐이다.)
//
// ★왜 [#54 · 재민 캐논 "관측자 없어도 실걸음 · 모든 NPC 는 물리 실체"]
//   `NPC_CAP_PER_VILLAGE = 40`(`villages.js:92` · 환경변수 `VILLAGE_NPC_CAP`)이 마을당 몸을 40 으로 자른다.
//   T342/T346 실측: econ 인구 2,725 중 **몸이 있는 사람은 1,718(61.4%)**. 캐논대로면 전부 몸이 있어야 한다.
//   이 계측기는 **푸는 날의 비용**을 T356·T371 이 세운 자로 잰다 — 그리고 **켜지 않는다**.
//
// ★두 국면으로 잰다 — 한 판으로는 둘 다 못 잰다:
//   ⓐ **200일 곡선**(압축 판 · `VILLAGE_DAY_MS=4000`) — 몸 수가 상한에 닿는 날 · econ 인구와의 차 ·
//      집·침상·소멸. ⚠이 판의 틱 수는 **부하 표에 못 쓴다**(하루가 360배 빠르면 하루 경계 일이 360배 자주 온다).
//   ⓑ **부하**(ⓐ 가 남긴 DB 를 **템플릿**으로 실제 날 길이 1,440,000ms 에 다시 띄운다 · T356 과 같은 꼴) —
//      존 틱 p50/p95 · 사람당 µs · drop · lag. 걸음은 켠다(`T312_FISH_ACT=1`) — T356·T324 가 쓴 그 자다.
//
// 실행: node scripts/t376-body-cap.js a          ← ⓐ 200일 세 팔(각 ~15분)
//       node scripts/t376-body-cap.js b          ← ⓑ 부하 세 팔(각 ~14분 · ⓐ 의 DB 가 있어야 한다)
//       node scripts/t376-body-cap.js table      ← 잰 것을 표로
//   T376_CAPS=40,80,999999 · T376_DAYS=200 · T376_DAY_MS=4000 · T376_LOAD_MIN=12 · T376_SLICE_S=20
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CAPS = (process.env.T376_CAPS || '40,80,999999').split(',').map((s) => s.trim()).filter(Boolean);
const DAYS = parseInt(process.env.T376_DAYS || '', 10) || 200;
const DAY_MS_A = parseInt(process.env.T376_DAY_MS || '', 10) || 4000;
const LOAD_MIN = parseInt(process.env.T376_LOAD_MIN || '', 10) || 12;
const SLICE_S = parseInt(process.env.T376_SLICE_S || '', 10) || 20;
const REAL_DAY_MS = 1440000;                   // = `zone-config.js:470` WORLD.dayLengthMs (아래에서 대조한다)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const tag = (c) => (c === '999999' || +c > 100000 ? 'inf' : c);
const F = (c) => ({ zdb: `/tmp/t376-${tag(c)}-z.db`, cdb: `/tmp/t376-${tag(c)}-c.db`,
                    curve: `/tmp/t376-${tag(c)}-curve.jsonl`, load: `/tmp/t376-${tag(c)}-load.json` });

// ── 정본 읽기(값을 옮겨 적지 않는다) ─────────────────────────────────────────
const VL = require(path.join(ROOT, 'server', 'village-layout.js'));
const { WORLD } = require(path.join(ROOT, 'server', 'zone-config.js'));
const shown = [];
function srcLine(file, re) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const hit = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => re.test(l));
  if (hit.length !== 1) { console.error(`✗ 정본 한 줄을 못 집었다: ${file} ${re} (${hit.length}건)`); process.exit(3); }
  shown.push(`${file}:${hit[0][0]}  ${hit[0][1].trim()}`);
  return hit[0][1];
}
function srcNum(file, name) {
  const l = srcLine(file, new RegExp(`\\b${name}\\s*=\\s*-?[0-9.]+`));
  return Number(l.match(new RegExp(`${name}\\s*=\\s*(-?[0-9.]+)`))[1]);
}

// ── 관측자(딴 프로세스) · 곡선 표본(딴 프로세스) — `spawnSync` 가 루프를 멈추므로 ──────
if (process.argv[2] === '__sample') {          // 곡선 표본: /lifedbg 를 적는다
  const zp = parseInt(process.argv[3], 10), out = process.argv[4];
  const w = fs.createWriteStream(out, { flags: 'a' });
  let stop = false;
  for (const sg of ['SIGTERM', 'SIGINT']) process.on(sg, () => { stop = true; try { w.end(); } catch (e) {} process.exit(0); });
  (async () => {
    while (!stop) {
      try {
        const j = await (await fetch(`http://localhost:${zp}/lifedbg`, { headers: { 'x-zone-secret': process.env.T376_SECRET || '' } })).json();
        let pop = 0, gone = 0, over = 0;
        for (const v of (j.villages || [])) { pop += v.pop | 0; if (!(v.pop | 0)) gone++; }
        w.write(JSON.stringify({ t: Date.now(), phase: j.phase, bodies: (j.totals && j.totals.pop) || pop,
          villages: (j.villages || []).length, gone, act: (j.totals && j.totals.actN) || 0,
          per: (j.villages || []).map((v) => v.pop | 0) }) + '\n');
      } catch (e) {}
      await sleep(3000);
    }
  })();
  return;
}
if (process.argv[2] === '__watch') {           // 관측자 하나 — 활성 청크가 서야 걷는다(T356 과 같은 꼴)
  const zp = parseInt(process.argv[3], 10), sec = process.argv[4] || '';
  //   ⚠`/lifedbg` 는 **안 문**(T225)이다 — 비밀머리가 없으면 404 다. 첫 판에서 이걸 빼먹어 관측자가 안 섰고
  //     활성 청크가 없어 틱 본문이 조기 반환해 **p50 이 0** 으로 나왔다(자가수리).
  (async () => {
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    for (let i = 0; i < 600; i++) {
      try {
        const j = await (await fetch(`http://localhost:${zp}/lifedbg`, { headers: { 'x-zone-secret': sec } })).json();
        const v = (j.villages || [])[0];
        if (v && v.ccx != null) {
          const ax = v.ccx * 32 + 16, ay = v.ccy * 32 + 16;
          const w = new WS(`ws://localhost:${zp}/?observer=1`);
          w.on('error', () => {}); w.on('message', () => {});
          w.on('open', () => { const s = () => { try { w.send(JSON.stringify({ type: 'viewport_update', x: ax, y: ay, w: 2000, h: 2000 })); } catch (e) {} }; s(); setInterval(s, 5000); });
          break;
        }
      } catch (e) {}
      await sleep(3000);
    }
    setInterval(() => {}, 1 << 30);
  })();
  return;
}

// ── ⓐ 200일 곡선 ─────────────────────────────────────────────────────────────
function phaseA() {
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i], f = F(c);
    if (process.env.T376_REUSE === '1') { try { if (fs.statSync(f.zdb).size > 1e6) { console.log(`  · ⓐ 상한 ${c} — 이미 있다(재사용)`); continue; } } catch (e) {} }
    rmdb(f.zdb); rmdb(f.cdb); try { fs.unlinkSync(f.curve); } catch (e) {}
    const cport = 3760 + i * 20, zport = cport + 10;
    console.log(`  · ⓐ 상한 ${c} — ${DAYS}일 × ${DAY_MS_A}ms ≈ ${Math.round(DAYS * DAY_MS_A / 1000)}초 · :${zport}`);
    const smp = spawn(process.execPath, [__filename, '__sample', String(zport), f.curve], { cwd: ROOT, stdio: 'ignore' });
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 't212-beds.js')], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], timeout: 1000 * 60 * 40,
      env: Object.assign({}, process.env, {
        T212_DAYS: String(DAYS), T212_DAY_MS: String(DAY_MS_A),
        T212_DB: f.zdb, T212_CDB: f.cdb, T212_SNAP: `/tmp/t376-${tag(c)}-snap.json`,
        T212_CPORT: String(cport), T212_ZPORT: String(zport),
        T212_ENV: `VILLAGE_NPC_CAP=${c}`,
      }),
    });
    try { smp.kill('SIGTERM'); } catch (e) {}
    if (r.status !== 0) { console.error(`✗ ⓐ 상한 ${c} 실패 rc=${r.status}`); process.exit(4); }
  }
}

// ── ⓑ 부하(실제 날 길이 · ⓐ 의 DB 를 템플릿으로) ──────────────────────────────
async function phaseB() {
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i], f = F(c);
    if (process.env.T376_REUSE === '1') { try { if (fs.statSync(f.load).size > 100) { console.log(`  · ⓑ 상한 ${c} — 이미 있다(재사용)`); continue; } } catch (e) {} }
    const CP = 3820 + i * 4, ZP = CP + 1, SECRET = 't376-' + tag(c);
    const DB = `/tmp/t376-load-${tag(c)}-z.db`, CDB = `/tmp/t376-load-${tag(c)}-c.db`;
    rmdb(DB); rmdb(CDB);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(f.zdb + s, DB + s); } catch (e) {} }
    const logf = fs.openSync(`/tmp/t376-load-${tag(c)}.log`, 'w');
    const cp = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
    const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
      env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
        CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(REAL_DAY_MS), DB_PATH: DB, VILLAGE_WAR_LOG: '0',
        VILLAGE_NPC_CAP: c, T312_FISH_ACT: '1' }) });     // ★걸음 켬 = T356·T324 의 그 자
    const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
    const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
    console.log(`  · ⓑ 상한 ${c} — 실제 날 ${REAL_DAY_MS}ms · :${ZP} · ${LOAD_MIN}분`);
    for (let k = 0; k < 900 && !(await health()); k++) await sleep(1000);
    //   ★관측자는 **이 프로세스에서** 연다 — 여기는 `spawnSync` 가 없어 루프가 산다(t356 과 같은 꼴).
    //     ⚠없으면 존이 `!hasHuman && !hasObserver` 에서 **본문 없이 조기 반환**하고 틱 표본이 0 이 된다
    //       (`zone.js:11468` · 첫 판에서 실제로 p50 0 · steps 0 을 봤다 — 자가수리).
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    const L0 = await getj('/lifedbg');
    const v0 = (L0 && L0.villages || []).find((v) => v.ccx != null) || { ccx: 0, ccy: 0 };
    const ax = v0.ccx * 32 + 16, ay = v0.ccy * 32 + 16;
    const ws = new WS(`ws://localhost:${ZP}/?observer=1`);
    ws.on('error', () => {}); ws.on('message', () => {});
    const look = () => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: ax, y: ay, w: 2000, h: 2000 })); } catch (e) {} };
    ws.on('open', look);
    const ping = setInterval(look, 5000);
    await sleep(30000);                                    // 마을이 깨어나 걷는다 + 미리 굽기
    // ★[T433 ② 규약 ⓐ·ⓓ] `T376_WAITDAY=1` — 첫 하루 경계 뒤 · `T376_PH_LO`/`T376_PH_HI` — 그 띠에 들 때 조각을 시작한다
    //   (팔 여럿을 견줄 때 **같은 창**. 둘 다 기본 끔 = 종전 값 무변 — 종전엔 부팅한 국면에서 바로 잤다).
    if (process.env.T376_WAITDAY === '1') { const w = await require('./lib-tick-rule').waitDayBoundary(async () => { const L = await getj('/lifedbg'); return L && L.phase; }); console.log(`      첫 하루 경계 ${w.crossed ? '넘김' : '못 넘김'} · phase ${w.phase}`); }
    if (process.env.T376_PH_LO) { const lo = +process.env.T376_PH_LO, hi = +(process.env.T376_PH_HI || 1);
      for (let k = 0; k < 2000; k++) { const L = await getj('/lifedbg'); if (L && L.phase != null && L.phase >= lo && L.phase <= hi) { console.log(`      창 진입 phase ${L.phase.toFixed(3)} · 띠 ${lo}~${hi}`); break; } await sleep(5000); } }
    { const p0 = await getj('/perf'); console.log(`      관측자 ${(p0 && p0.tick && p0.tick.ms && p0.tick.ms.n) || 0} 표본 · 걸음 ${(p0 && p0.walk && p0.walk.steps) || 0}`); }
    const slices = [];
    const n = Math.max(1, Math.floor(LOAD_MIN * 60 / SLICE_S));
    for (let k = 0; k < n; k++) {
      await getj('/perf?reset=1');
      await sleep(SLICE_S * 1000);
      const p = await getj('/perf'), L = await getj('/lifedbg');
      const t = p && p.tick && p.tick.ms;
      if (!t || !L) { continue; }
      let nonSleep = 0;
      for (const v of (L.villages || [])) for (const [kk, nn] of Object.entries(v.acts || {})) if (kk !== '취침') nonSleep += nn;
      slices.push({ k, phase: L.phase, night: L.phase != null && L.phase > (L.dayR != null ? L.dayR : 0.7),
        p50: t.p50, p95: t.p95, max: t.max, ticks: p.tick.n, bodies: (L.totals && L.totals.pop) || 0,
        nonSleep, drop: p.tick.dropN, dropped: p.tick.dropped, lag: p.tick.lagPct,
        loopP99: p.loop && (p.loop.p99 != null ? p.loop.p99 : null), steps: p.walk && p.walk.steps });
      const s = slices[slices.length - 1];
      console.log(`      조각 ${k} phase ${s.phase != null ? s.phase.toFixed(3) : '?'}${s.night ? '(밤)' : '(낮)'} · p50 ${s.p50}ms · p95 ${s.p95} · 몸 ${s.bodies} · 비취침 ${s.nonSleep} · drop ${s.drop} · lag ${s.lag}`);
    }
    clearInterval(ping); try { ws.close(); } catch (e) {} try { z.kill(); } catch (e) {} try { cp.kill(); } catch (e) {}
    await sleep(1500); rmdb(DB); rmdb(CDB);
    fs.writeFileSync(f.load, JSON.stringify({ cap: c, realDayMs: REAL_DAY_MS, sliceS: SLICE_S, slices }, null, 1));
  }
}

// ── 표 ────────────────────────────────────────────────────────────────────────
function readDb(p) {
  const Database = require('better-sqlite3');
  const db = new Database(p, { readonly: true, fileMustExist: true });
  const vr = db.prepare('SELECT id, name, econ_state FROM villages').all();
  const br = db.prepare("SELECT village_id, type, floors FROM village_buildings WHERE type IN ('house','phouse','shelter')").all();
  db.close();
  let econ = 0, gone = 0, houses = 0, floors = 0; const pops = [];
  const V = new Map();
  for (const v of vr) { let pop = 0; try { pop = (JSON.parse(v.econ_state || '{}').npcs || []).length; } catch (e) {} V.set(v.id, pop); econ += pop; pops.push(pop); if (!pop) gone++; }
  for (const b of br) { houses++; floors += Math.max(1, b.floors | 0); }
  return { econ, gone, houses, beds: floors * VL.HOUSE_CAP_PER_FLOOR, villages: vr.length, pops };
}
function q(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
function table() {
  console.log('\n═══ §0 정본 — 읽은 줄 ═══');
  const CAP_L = srcLine('server/villages.js', /const NPC_CAP_PER_VILLAGE = /);
  srcLine('server/villages.js', /const POP_SYNC_PER_DAY = /);
  const LSP = srcNum('server/villages.js', 'LIFE_STAGE_PDAY');
  const LCR = srcNum('server/villages.js', 'LIFE_CREW');
  const LBS = srcNum('lab/마을실험실.html', 'L_BUILDSEC');
  const LBC = srcNum('lab/마을실험실.html', 'L_BUILDCAP');
  const LBR = srcNum('lab/마을실험실.html', 'L_BUILDRATE');
  srcLine('server/zone-config.js', /dayLengthMs: 24 \* 60 \* 1000,/);
  for (const s of shown) console.log('  ' + s);
  if (WORLD.dayLengthMs !== REAL_DAY_MS) { console.error('✗ 날 길이 정본이 바뀌었다 — 계측기를 고쳐라'); process.exit(3); }
  const BUDGET = 1000 / 30;                    // 30Hz 예산 — T324·T356 이 쓴 그 자

  console.log('\n═══ ① 몸 수 · 부하 — 세 팔 ═══');
  const rows = [];
  for (const c of CAPS) {
    const f = F(c);
    let d = null; try { d = readDb(f.zdb); } catch (e) {}
    let curve = []; try { curve = fs.readFileSync(f.curve, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } catch (e) {}
    let load = null; try { load = JSON.parse(fs.readFileSync(f.load, 'utf8')); } catch (e) {}
    const day = load ? load.slices.filter((s) => !s.night) : [], night = load ? load.slices.filter((s) => s.night) : [];
    const bodies = load && load.slices.length ? q(load.slices.map((s) => s.bodies), 0.5) : (curve.length ? curve[curve.length - 1].bodies : null);
    const capN = +c;
    const overV = d ? d.pops.filter((p) => p > capN).length : null;      // 상한에 닿은 마을
    const predBodies = d ? d.pops.reduce((s, p) => s + Math.min(p, capN), 0) : null;   // Σ min(인구, 상한) — T346 의 등식
    rows.push({ cap: c, econ: d && d.econ, bodies, predBodies, overV, gone: d && d.gone,
      houses: d && d.houses, beds: d && d.beds, villages: d && d.villages,
      dayP50: q(day.map((s) => s.p50), 0.5), dayP95: q(day.map((s) => s.p95), 0.5),
      nightP50: q(night.map((s) => s.p50), 0.5), nightP95: q(night.map((s) => s.p95), 0.5),
      dayN: day.length, nightN: night.length,
      drop: load ? Math.max(0, ...load.slices.map((s) => s.drop | 0)) : null,
      lag: load ? q(load.slices.map((s) => s.lag || 0), 0.5) : null,
      nonSleep: q(day.map((s) => s.nonSleep), 0.5),
      //   ★★틱이 예산에 묶이면 비용은 **틱 시간이 아니라 몫**으로 나타난다(T324 "예산은 두되 이어 돌기").
      //     한 몸이 한 틱에 받는 걸음 수 = steps ÷ (틱 × 몸) — 이게 줄면 세계가 느려진 것이다.
      stepShare: (() => { const a = day.filter((s) => s.steps && s.ticks && s.bodies).map((s) => s.steps / (s.ticks * s.bodies)); return a.length ? +q(a, 0.5).toFixed(4) : null; })(),
      //   ★닿은 날 — 표본은 3초마다이고 게임일은 `DAY_MS_A` ms 라 **한 표본 = 3000/DAY_MS_A 게임일**이다
      //     (판이 벽시계에 균일하므로 이 환산이 정확하다 · `/lifedbg` 에 게임일 칸이 없어서 이렇게 센다).
      capDay: (() => { if (!curve.length) return null; const i = curve.findIndex((x) => x.per && x.per.some((p) => p >= capN)); return i < 0 ? null : Math.round(i * 3000 / DAY_MS_A); })(),
      curve: (() => { if (!curve.length) return null; const n = curve.length; const at = (f) => { const x = curve[Math.min(n - 1, Math.floor(n * f))]; return x ? x.bodies : null; };
        return { d0: curve[0].bodies, q25: at(0.25), q50: at(0.5), q75: at(0.75), end: curve[n - 1].bodies, samples: n, endDay: Math.round((n - 1) * 3000 / DAY_MS_A) }; })() });
  }
  const pct = (x) => (x == null ? '—' : `${(100 * x / BUDGET).toFixed(0)}%`);
  console.log(`  예산 ${BUDGET.toFixed(1)}ms(30Hz) · 걸음 켬(T312_FISH_ACT=1 · T356·T324 의 자) · ${require('./lib-tick-rule').DENOM.village}(★규약 ⓔ)`);
  console.log('  ⚠ⓐ 의 집·침상·닿은 날은 **압축 시계(게임일 4초)의 값**이다 — 몸 행위(시공)는 실제 날 자로만 읽는다(★규약 ⓒ · T368 §4-ⓒ)');
  console.log('  ┌ 상한 ── econ 인구 ─ 몸 수 ─ Σmin(인구,상한) ─ 몸없는이 ─ 닿은마을 ─ 집 ─ 침상 ─ 소멸 ─│ 낮 p50/p95 ─ 예산 ─ 밤 p50/p95 ─ drop ─ lag% ─ 비취침');
  for (const r of rows) {
    console.log(`  │ ${String(r.cap).padStart(6)} ${String(r.econ).padStart(9)} ${String(r.bodies).padStart(7)} ${String(r.predBodies).padStart(16)} `
      + `${String(r.econ != null && r.bodies != null ? r.econ - r.bodies : '—').padStart(9)} ${String(r.overV).padStart(9)} ${String(r.houses).padStart(5)} ${String(r.beds).padStart(6)} ${String(r.gone).padStart(5)} │ `
      + `${String(r.dayP50).padStart(7)}/${String(r.dayP95).padStart(7)} ${pct(r.dayP50).padStart(5)} ${String(r.nightP50).padStart(6)}/${String(r.nightP95).padStart(6)} ${String(r.drop).padStart(5)} ${String(r.lag).padStart(6)} ${String(r.nonSleep).padStart(7)}`);
  }
  console.log('\n  몸 수 곡선(200일 · 표본 3초 = ' + (3000 / DAY_MS_A).toFixed(2) + ' 게임일)');
  console.log('  ┌ 상한 ── 시작 ─ 25% ─ 50% ─ 75% ─ 끝 ── 상한에 닿은 날 ─ 표본 ─ 끝 날');
  for (const r of rows) { const c2 = r.curve;
    console.log(`  │ ${String(r.cap).padStart(6)} ${String(c2 && c2.d0).padStart(6)} ${String(c2 && c2.q25).padStart(5)} ${String(c2 && c2.q50).padStart(5)} ${String(c2 && c2.q75).padStart(5)} ${String(c2 && c2.end).padStart(5)}   ${String(r.capDay == null ? '안 닿음' : r.capDay + '일').padStart(11)} ${String(c2 && c2.samples).padStart(6)} ${String(c2 && c2.endDay).padStart(6)}`); }
  //   사람당 µs · 10,000명 외삽 — T352 문법 `C + N×s`(두 팔 이상이면 최소제곱 대신 **두 끝점**으로 가른다)
  const ok = rows.filter((r) => r.dayP50 != null && r.bodies);
  if (ok.length >= 2) {
    const lo = ok[0], hi = ok[ok.length - 1];
    const s = (hi.dayP50 - lo.dayP50) / (hi.bodies - lo.bodies);        // ms/사람
    const C = lo.dayP50 - s * lo.bodies;
    console.log(`\n  ★사람당 — 한계 **${(s * 1000).toFixed(2)} µs/사람** · 상수항 **${C.toFixed(3)} ms**  (두 끝점 ${lo.cap}↔${hi.cap} · T352 문법 C + N×s)`);
    for (const r of ok) console.log(`      상한 ${String(r.cap).padStart(6)} — 몸 ${r.bodies} · 낮 p50 ${r.dayP50}ms · **사람당 ${(1000 * r.dayP50 / r.bodies).toFixed(2)} µs**(평균) · 비취침 ${r.nonSleep} · 몸당 걸음/틱 ${r.stepShare}`);
    const N10 = 10000, ms10 = C + s * N10;
    console.log(`  ★10,000명 외삽 — ${C.toFixed(2)} + 10,000 × ${(s * 1000).toFixed(2)}µs = **${ms10.toFixed(1)} ms** = 예산의 **${(ms10 / BUDGET).toFixed(2)}배**`);
    const Nmax = Math.floor((BUDGET - C) / s);
    console.log(`  ★예산이 버티는 몸 수 — (33.3 − ${C.toFixed(2)}) ÷ ${(s * 1000).toFixed(2)}µs = **${Nmax.toLocaleString()}명**`);
  }

  console.log('\n═══ ② 시공 자 하나 — 4,600 ↔ 5,760 ═══');
  const stages = 4;                              // `HUT_STAGES` 4단계 — T361 이 소스에서 읽어 확정
  const dayS = WORLD.dayLengthMs * WORLD.dayPhaseRatio / 1000;
  const srvSec = stages * (WORLD.dayLengthMs / 1000 / LSP);
  console.log(`  랩 : L_BUILDSEC = ${LBS} 인·초/층  ← **직접 적은 수**(리터럴 · 주석 "2인×반나절≈800/일이면 ~5.8일/층")`);
  console.log(`  서버: ${stages}단계 × (dayLengthMs ${WORLD.dayLengthMs}ms ÷ LIFE_STAGE_PDAY ${LSP}) = **${srvSec} 인·초/채**  ← **파생**(날 길이의 함수)`);
  console.log(`  비  : ${srvSec} ÷ ${LBS} = **${(srvSec / LBS).toFixed(3)}배**   — villages.js:4397 주석이 "랩 L_BUILDSEC=4600인·초 **근사**" 라 적은 그 관계`);
  console.log(`  ⇒ 꼴은 서버 쪽이 **파생**(날 길이의 함수) · 랩 쪽이 **리터럴**이다. 그런데 **어느 쪽도 유도가 아니다** —`);
  console.log(`     둘 다 노동 교정값이고, 서버의 LIFE_STAGE_PDAY ${LSP} 은 주석이 스스로 "랩 4,600 **근사**" 라 적었다.`);
  console.log(`     ⇒ 계보는 **랩 → 서버**다(4,600 이 먼저 있고 "1인 하루 1단계" 가 그것을 반올림했다).`);
  //   ★★그 반올림에서 "하루" 의 뜻이 갈렸다 — 이 표의 요점
  const stageThresh = WORLD.dayLengthMs / 1000 / LSP;         // 지금 문턱(초) — `villages.js:6797` 의 `dayMs / LIFE_STAGE_PDAY`
  const workDay = dayS;                                       // 사람이 실제로 쌓는 하루 = **낮**(밤엔 집에 간다 · prog 는 유지된다)
  const srvSecIfDaylight = stages * workDay;
  console.log(`\n  ★★갈린 까닭 — **"하루" 의 뜻이 두 곳에서 다르다.**`);
  console.log(`     문턱은 **벽시계 하루** ${stageThresh}초/단계 다(villages.js:6797 \`dayMs / LIFE_STAGE_PDAY\`).`);
  console.log(`     그런데 크루는 **낮에만** 쌓는다 ${workDay.toFixed(0)}초(밤엔 취침 — 다만 prog 는 유지된다 · villages.js:6759 주석).`);
  console.log(`     ⇒ 뜻대로("1인 **일하는** 하루 1단계") 읽으면 한 채 = ${stages} × ${workDay.toFixed(0)} = **${srvSecIfDaylight.toFixed(0)} 인·초** ⇒ 랩 대비 **${(srvSecIfDaylight / LBS).toFixed(2)}배**(차 ${Math.abs(100 * (srvSecIfDaylight / LBS - 1)).toFixed(0)}%)`);
  console.log(`     ⇒ 지금 코드대로(벽시계) 읽으면 **${srvSec} 인·초** ⇒ 랩 대비 **${(srvSec / LBS).toFixed(2)}배**(차 ${Math.abs(100 * (srvSec / LBS - 1)).toFixed(0)}%)`);
  console.log(`     ★즉 **1.25배는 노동량의 불일치가 아니라 단위의 불일치**다. 낮으로 맞추면 ${(srvSecIfDaylight / LBS).toFixed(2)}배로 붙는다.`);
  console.log(`     ⚠그리고 지금 문턱은 한 단계에 **${(stageThresh / workDay).toFixed(2)} 낮**이 든다 — 상수가 말하는 "하루 1단계" 보다 그만큼 느리다.`);
  console.log(`  ⚠날 길이 의존 — 서버 축은 dayLengthMs 의 함수라 **24분을 바꾸면 집값이 바뀐다**(10분이면 ${(stages * 600).toFixed(0)} 인·초).`);
  console.log(`     랩 축은 안 바뀐다. 다만 하루 24분·365일은 **불변 캐논**이라 지금은 둘이 같은 말을 다른 단위로 하는 것뿐이다.`);
  console.log(`  정본을 하나로 하면 남는 값:`);
  console.log(`     ⓐ 랩을 정본으로 → 한 채 ${LBS} 인·초 · 크루 ${LCR}명이 낮 ${dayS}초를 다 쓰면 ${(LBS / (LCR * dayS)).toFixed(2)}일/채`);
  console.log(`     ⓑ 서버를 정본으로 → 한 채 ${srvSec} 인·초 · 같은 셈 ${(srvSec / (LCR * dayS)).toFixed(2)}일/채`);
  console.log(`     ⓒ 랩 상한 L_BUILDCAP ${LBC}/일 ⇒ ${(1 / LBC).toFixed(2)}일/채 · 랩 정가 L_BUILDRATE ${LBR}/일 ⇒ ${(1 / LBR).toFixed(1)}일/채`);
  console.log(`  ★값은 바꾸지 않았다 — 정본 선택은 PM(행위 카드에서 한 번에).`);
}

const mode = process.argv[2];
if (mode === 'a') { phaseA(); table(); }
else if (mode === 'b') { phaseB().then(table); }
else if (mode === 'ab') { phaseA(); phaseB().then(table); }
else if (mode === 'table' || !mode) { table(); }
else { console.error('쓰는 법: node scripts/t376-body-cap.js a|b|ab|table'); process.exit(2); }
