#!/usr/bin/env node
// === scripts/t368-farm-day.js — 실서버 위 자: 농부 행위의 값 (T368 ③ · T326 자 · T347·T376 문법) ==============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드는 한 글자도 안 만진다.
//
// ★왜 — `t176-ab` 는 밭을 **헤드리스로** 돈다(`__labProbe._cropProbe` → `lifeFarmDay` · 몸이 없다).
//   그래서 ①(품목)은 거기서 보이지만 ②(몸 — 농부가 관측자 없이 걷는다)는 **존 위**에서만 보인다.
//
// ★국면 둘 — T376 이 적어 둔 그대로: **압축 판의 틱은 부하 표에 못 쓴다**(하루가 360배 빠르면 하루 경계 일이 360배 자주 온다).
//   a  곡선 — 50마을(실서버 시딩 · T326 과 같다) · 200일 · 게임일 4초(T326 자 · `t212-beds` 의 그 시계) · 팔마다 새 DB · `/perf`·`/lifedbg` 하루 한 줄
//        t100    `T100_FIELD_YIELD=1` · 관측자 하나   — 밭이 곳간에 닿는다(건수 × `T100_K` · 헤드리스가 밭을 돈다)
//        on      + `T368_FARM_ACT=1` · 관측자 하나    — 존이 깨어 있다 ⇒ **농부 몸이 밭을 한다**(헤드리스 농부 몫 0)
//        onidle  + `T368_FARM_ACT=1` · 관측자 **없음** — 존이 통째로 잔다 ⇒ 몸 0 · 그날은 일괄이 그 몫(① 품목만 보인다)
//      ⚠★**압축 시계에서 몸은 밭을 못 돈다 — 시계가 둘이다.** 마을 하루(`gameDayOf` · `VILLAGE_DAY_MS`)는 줄지만 주민의
//        낮밤(`worldPhase` · `WORLD.dayLengthMs` 24분)은 **안 준다**. 농부는 "오늘"(마을 하루)이 바뀐 뒤 출근 창(세계 낮의 13.7%)
//        밖이면 그날을 쉰다(`_fOutD`) ⇒ 24분 한 바퀴에 마을 하루가 360번(4초 시계) · 12번(2분 시계) 지나가는데 몸이 일하는
//        날은 그중 한두 날이다. ⇒ **몸을 재는 자는 실제 날(`VILLAGE_DAY_MS` = 24분) 하나뿐**이다(b 국면).
//        (2분 시계로 새 세계 30일을 나란히 도는 판을 세웠다가 이것을 보고 걷었다 — 5일 동안 몸 0건 · 일괄 2,164건.)
//   b  부하 — a 의 `t100` 끝 DB 를 **틀로** 실제 날 1,440,000ms 에 다시 띄운다(두 팔이 같은 세계에서 갈라진다 · 관측자 하나 ·
//        T376 ⓑ 와 같은 꼴). 새 하루가 밝을 때까지 기다렸다가(농부 출근 창 `SCH_FARMW_R` — 창 밖에 깬 농부는 그날 쉰다)
//        **그 하루를 60초 조각으로 끝까지** 잰다: 조각별 p50/p95 · 낮/밤 · 몸 수 · **사람당 µs** · 밭에 선 농부 · 손 ·
//        곳간 왕복 · 오늘 작물 일(Σ`mTk`) · 하루 끝 Σ`dTk`(그 하루에 한 작물 일 전부) ↔ 헤드리스 예산(농부 × `tkPday`).
//        `onidle` 팔(관측자 없음 · 존 잠 · 거의 CPU 0)을 **곁에 같이** 돌리면 같은 틀·같은 하루의 **일괄** 짝이 선다 —
//        몸(on)이 한 하루 ↔ 일괄(onidle)이 한 하루(T297 "관찰 ↔ 빨리감기" 등가의 서버판 · `T368_PORT`·`T368_LOAD_OUT` 로 가른다).
//        ⚠틀의 작물 날 번호는 a 판(4초 시계)의 것이다(`gameDayOf` 절대값) — 실제 날로 띄우면 심은 날이 **먼 미래**라 익는 작물이 없다.
//          ⇒ b 가 재는 몸의 일은 **파종·돌보기·순찰**이고 수확·곳간 왕복은 아니다(그 값은 새 세계를 실제 날로 24일 넘게 돌려야 선다).
//
// 실행: node scripts/t368-farm-day.js a|b|ab
//   T368_TMP(기본 /tmp/t368) · T368_DAYS(기본 200) · T368_DAY_MS(기본 4000) · T368_ARMS(기본 "t100,on,onidle")
//   T368_LOAD_ARMS(기본 "t100,on") · T368_SLICE_S(기본 60) · T368_SLICES(조각 수 · 기본 하루 끝까지) · T368_NOWAIT=1(낮이면 바로 — 몸 안 걷는 대조 팔)
//   T368_PORT(기본 3950) · T368_LOAD_OUT(기본 <TMP>/farm-load.json) · T368_TPL(기본 <TMP>/tpl-t100.db) · T368_REUSE=1(끝난 팔 재사용)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TMP = process.env.T368_TMP || '/tmp/t368';
const DAYS = parseInt(process.env.T368_DAYS || '200', 10);
const DAY_MS = parseInt(process.env.T368_DAY_MS || '4000', 10);
const ARMS = (process.env.T368_ARMS || 't100,on,onidle').split(',').filter(Boolean);
const LOAD_ARMS = (process.env.T368_LOAD_ARMS || 't100,on').split(',').filter(Boolean);
const SLICE_S = parseInt(process.env.T368_SLICE_S || '60', 10);
const REAL_DAY_MS = 1440000;   // = `zone-config.js` WORLD.dayLengthMs(T376 이 대조한 그 수)
const ENV = { base: {}, t100: { T100_FIELD_YIELD: '1' }, on: { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' }, onidle: { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' } };
const OBS = { base: true, t100: true, on: true, onidle: false };
// ★[T410 ③] 행위 넷 켬 팔 셋 — 어부(T312)·나무꾼(T325)·채집(T347)·농부(T368 + 4판) · 존의 idle 문 닫힘(`ZONE_IDLE_SKIP=1` 종전) / 열림(기본)
//   acts0 = 관측자 0 · 문 닫힘(종전 세계) · acts = 관측자 0 · 문 열림 · actsobs = 관측자 하나 · 문 열림(관측자 무관 게이트의 짝)
{ const A = { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1', T312_FISH_ACT: '1', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '1' };
  ENV.acts0 = Object.assign({ ZONE_IDLE_SKIP: '1' }, A); ENV.acts = Object.assign({}, A); ENV.actsobs = Object.assign({}, A);
  OBS.acts0 = false; OBS.acts = false; OBS.actsobs = true; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const cpdb = (a, b) => { rmdb(b); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(a + s, b + s); } catch (e) {} } };
fs.mkdirSync(TMP, { recursive: true });

function boot(tag, zenv, dayMs, zdb, port) {
  const SECRET = 't368-' + tag;
  const CP = port, ZP = port + 10;
  const cdb = `${TMP}/c-${tag}.db`; rmdb(cdb);
  const logf = fs.openSync(`${TMP}/${tag}.log`, 'w');
  const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(dayMs), VILLAGE_WAR_LOG: '0' }, zenv) });
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
  const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
  const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(4000); try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  //   ★관측자 하나 — **이 프로세스에서** 연다(`spawnSync` 0 · t356·t376 과 같은 꼴). 없으면 존이 `!hasHuman && !hasObserver`
  //     에서 본문 없이 조기 반환한다(p50 0 · 걸음 0 — T376 자가수리 ② · 이 카드 첫 판도 그랬다: 농부 152 · 밭 0).
  let ws = null, pinger = null;
  const observe = async () => {
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    const L0 = await getj('/lifedbg');
    const v0 = (L0 && L0.villages || []).find((v) => v.ccx != null) || { ccx: 0, ccy: 0 };
    const ax = v0.ccx * 32 + 16, ay = v0.ccy * 32 + 16;
    ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    const look = () => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: ax, y: ay, w: 2000, h: 2000 })); } catch (e) {} };
    ws.on('open', look); pinger = setInterval(look, 5000);
    return v0.name || null;
  };
  const closeWs = () => { clearInterval(pinger); try { ws && ws.close(); } catch (e) {} };
  return { getj, health, kill, observe, closeWs };
}
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
//   `/lifedbg` 에서 이 자가 쓰는 칸만(작물 일 · 몸 · 직업) — 새 계측 0(이미 내주는 칸)
function lifeSum(L) {
  if (!L || !L.villages) return null;
  let mTk = 0, dTk = 0, farmers = 0, bodies = 0, farmAct = 0, nonSleep = 0, crop = 0, farm = 0, dCl = 0, dSt = 0, clearCrew = 0, buildCrew = 0, sites = 0;
  const FA = new Set(['경작', '파종', '모내기', '수확', '방제', '물대기', '김매기', '논매기', '개간', '출근']);
  for (const v of L.villages) {
    mTk += v.mTk || 0; dTk += v.dTk || 0; bodies += v.pop || 0; crop += v.crop || 0; farm += v.farm || 0;
    dCl += v.dCl || 0; dSt += v.dSt || 0; clearCrew += v.clearCrew || 0; buildCrew += v.buildCrew || 0; if (v.site != null) sites++;
    farmers += (v.jobs && v.jobs.farmer) || 0;
    for (const [k, n] of Object.entries(v.acts || {})) { if (FA.has(k)) farmAct += n; if (k !== '취침') nonSleep += n; }
  }
  return { phase: L.phase, dayR: L.dayR, tkPday: L.totals && L.totals.tkPday, mTk, dTk, farmers, bodies, farmAct, nonSleep, crop, farm, dCl, dSt, clearCrew, buildCrew, sites };
}

// ── a 곡선 ───────────────────────────────────────────────────────────────────
async function phaseA() {
  const OUT = `${TMP}/farm-day.json`;
  let res = { at: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version }, DAYS, DAY_MS, ARMS, arms: {} };
  try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.arms) res.arms = o.arms; } catch (e) {}
  for (const arm of ARMS) {
    const env = ENV[arm]; if (!env) { say('모르는 팔', arm); continue; }
    if (process.env.T368_REUSE === '1' && res.arms[arm] && res.arms[arm].done) { say(`팔 ${arm} — 이미 있다(재사용)`); continue; }
    say(`\n[a] 팔 ${arm} — ${JSON.stringify(env)} · 관측자 ${OBS[arm] ? '하나' : '없음'} · ${DAYS}일 × ${DAY_MS}ms`);
    const zdb = `${TMP}/z-${arm}.db`; rmdb(zdb);
    const b = boot(arm, env, DAY_MS, zdb, parseInt(process.env.T368_PORT || '3910', 10));   // ★[T410] 여러 팔을 나란히 띄울 때 가른다
    const tb = Date.now();
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    say(`  부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초`);
    if (OBS[arm]) say(`  관측자 → ${await b.observe()}`);
    await b.getj('/perf?reset=1');
    const curve = [];
    let last = -1;
    const t0 = Date.now();
    while (Date.now() - t0 < (DAYS * DAY_MS * 3 + 600000)) {
      await sleep(Math.max(500, Math.floor(DAY_MS / 4)));
      const p = await b.getj('/perf');
      const d = dayOf(p);
      if (!p || d === last) continue;
      last = d;
      const L = lifeSum(await b.getj('/lifedbg'));
      const f = p.farm || null, t = p.tick && p.tick.ms;
      const pop = f ? f.pop : null;
      curve.push({ day: d, pop, farmers: f && f.farmers, working: f && f.working, hands: f && f.hands, handU: f && f.handU,
        trips: f && f.trips, delivered: f && f.delivered, harvestN: f && f.harvestN, credUnits: f && f.credUnits, credFoodEq: f && f.credFoodEq,
        t100Eq: f && f.t100Eq, pendUnits: f && f.pendUnits, food: f && f.food, foodEq: f && f.foodEq, gran: f && f.gran, hlBody: f && f.hlBody, hlBatch: f && f.hlBatch,
        dTk: L && L.dTk, tkPday: L && L.tkPday, lifeFarmers: L && L.farmers, bodies: L && L.bodies, crop: L && L.crop, farm: L && L.farm,
        dCl: L && L.dCl, dSt: L && L.dSt, clearCrew: L && L.clearCrew, buildCrew: L && L.buildCrew, sites: L && L.sites,
        p50: t ? t.p50 : null, p95: t ? t.p95 : null, n: t ? t.n : null,
        dropN: p.tick ? p.tick.dropN : null, lagPct: p.tick ? p.tick.lagPct : null,
        walk: p.walk ? { steps: p.walk.steps, cut: p.walk.cutTicks } : null,
        //   ★[T410 ③] 행위 셋의 관측 칸(끔이면 null) — 누계 입고 · 걷는 이 · 손
        fish: p.fish ? { delivered: p.fish.delivered, walkers: p.fish.walkers, hands: p.fish.hands } : null,
        wood: p.wood ? { delivered: p.wood.delivered, walkers: p.wood.walkers, hands: p.wood.hands, cutDay: p.wood.cutDay } : null,
        forage: p.forage ? { delivered: p.forage.delivered, walkers: p.forage.walkers, hands: p.forage.hands, pickDay: p.forage.pickDay } : null });
      await b.getj('/perf?reset=1');   // 그날 창 — 틱 표본을 하루마다 영점 조정
      if (d % 10 === 0) say(`  day ${d} · 인구 ${pop} · 농부 ${f && f.farmers}(밭 ${f && f.working}) · 헤드리스 몸/일괄 ${f && f.hlBody}/${f && f.hlBatch} · 수확 ${f && f.harvestN} · 입고 낱개 ${f && f.credUnits} · 식량등가 ${f && f.credFoodEq} / 대조 ${f && f.t100Eq} · 곳간 ${f && f.food} · 작물 일 어제 ${L && L.dTk}(예산 ${L && L.farmers}×${L && L.tkPday}) · p50 ${t ? t.p50 : '?'}ms`);
      if (d >= DAYS) break;
    }
    const p = await b.getj('/perf');
    await sleep(5000);   // 마지막 영속(틀로 쓴다 — b 국면)
    b.closeWs(); await b.kill();
    const tpl = `${TMP}/tpl-${arm}.db`; cpdb(zdb, tpl);
    res.arms[arm] = { env, obs: OBS[arm], bootS: +((Date.now() - tb) / 1000).toFixed(0), curve, end: p ? { farm: p.farm, tick: p.tick, walk: p.walk } : null, tpl, done: true };
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  say('\n[a] 끝 →', OUT);
}

// ── b 부하 ───────────────────────────────────────────────────────────────────
async function phaseB() {
  const OUT = process.env.T368_LOAD_OUT || `${TMP}/farm-load.json`;
  const TPL = process.env.T368_TPL || `${TMP}/tpl-t100.db`;
  if (!fs.existsSync(TPL)) { say('틀이 없다 —', TPL, '(a 를 먼저)'); process.exit(3); }
  let res = { at: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version }, REAL_DAY_MS, SLICE_S, TPL, arms: {} };
  try { const o = JSON.parse(fs.readFileSync(OUT, 'utf8')); if (o && o.arms) res.arms = o.arms; } catch (e) {}
  for (const arm of LOAD_ARMS) {
    const env = ENV[arm]; if (!env) { say('모르는 팔', arm); continue; }
    if (process.env.T368_REUSE === '1' && res.arms[arm] && res.arms[arm].done) { say(`팔 ${arm} — 이미 있다(재사용)`); continue; }
    const zdb = `${TMP}/load-${arm}.db`; cpdb(TPL, zdb);
    say(`\n[b] 팔 ${arm} — ${JSON.stringify(env)} · 실제 날 ${REAL_DAY_MS}ms · 틀 ${path.basename(TPL)}`);
    const b = boot('load-' + arm, env, REAL_DAY_MS, zdb, parseInt(process.env.T368_PORT || '3950', 10));
    const tb = Date.now();
    for (let i = 0; i < 900 && !(await b.health()); i++) await sleep(1000);
    //   ★관측자 없는 팔(`onidle`)은 존이 통째로 잔다 — 몸 0 · 하루 경계에서 일괄(그 팔이 곧 "몸 ↔ 일괄" 등가의 짝이다 · T297 문법)
    say(`  부팅 ${((Date.now() - tb) / 1000).toFixed(0)}초 · 관측자 → ${OBS[arm] ? await b.observe() : '없음(존 잠)'}`);
    await sleep(30000);
    //   ★새 하루를 기다린다 — 부팅이 한낮이면 농부가 출근 창(`SCH_FARMW_R`)을 놓쳐 **그날 쉰다**(`_fOutD` 는 영속 안 됨).
    //     `T368_NOWAIT=1` = 낮이면 바로 잰다(몸이 안 걷는 대조 팔의 부하 창 — 출근 창과 무관하다).
    let L = lifeSum(await b.getj('/lifedbg')), ph0 = L ? L.phase : null;
    const _nowait = process.env.T368_NOWAIT === '1' && L && L.phase >= 0.02 && L.phase <= 0.45;
    say(`  지금 phase ${ph0} — ${_nowait ? '낮이다 · 바로 잰다(T368_NOWAIT)' : '새 하루를 기다린다'}`);
    const tw = Date.now();
    for (; !_nowait;) {
      await sleep(5000);
      L = lifeSum(await b.getj('/lifedbg'));
      if (L && ph0 != null && L.phase + 0.5 < ph0) break;   // 되감겼다 = 자정을 넘었다(phase 0 = 새벽)
      if (L) ph0 = Math.max(ph0 == null ? 0 : ph0, L.phase);
      if (Date.now() - tw > REAL_DAY_MS + 120000) { say('  ⚠하루를 기다려도 안 넘어간다 — 중단'); break; }
    }
    say(`  새 하루 — 기다림 ${((Date.now() - tw) / 1000).toFixed(0)}초 · phase ${L && L.phase}`);
    const p0 = await b.getj('/perf'); const d0 = dayOf(p0), f0 = p0 && p0.farm;
    const slices = [];
    let prevPh = L ? L.phase : 0, wrapped = false, k = 0, dTkDay = null;
    const NSL = parseInt(process.env.T368_SLICES || '0', 10) || (Math.ceil(REAL_DAY_MS / 1000 / SLICE_S) + 3);   // 기본 = 하루 끝까지 · 주면 그만큼(아침부터 낮 조각)
    while (!wrapped && k < NSL) {
      await b.getj('/perf?reset=1');
      await sleep(SLICE_S * 1000);
      const p = await b.getj('/perf'), Ls = lifeSum(await b.getj('/lifedbg'));
      const t = p && p.tick && p.tick.ms, f = p && p.farm;
      if (Ls && Ls.phase + 0.5 < prevPh) { wrapped = true; dTkDay = Ls.dTk; }
      if (Ls) prevPh = Ls.phase;
      if (!t || !Ls) { k++; continue; }
      const night = Ls.phase > (Ls.dayR != null ? Ls.dayR : 0.7);
      slices.push({ k, phase: Ls.phase, night, wrapped, p50: t.p50, p95: t.p95, max: t.max, ticks: p.tick.n, bodies: Ls.bodies, pop: f ? f.pop : null,
        nonSleep: Ls.nonSleep, farmAct: Ls.farmAct, farmers: Ls.farmers, mTk: Ls.mTk, dTk: Ls.dTk,
        working: f ? f.working : null, hands: f ? f.hands : null, handU: f ? f.handU : null, trips: f ? f.trips : null, delivered: f ? f.delivered : null,
        harvestN: f ? f.harvestN : null, credUnits: f ? f.credUnits : null, credFoodEq: f ? f.credFoodEq : null, t100Eq: f ? f.t100Eq : null, hlBody: f ? f.hlBody : null, hlBatch: f ? f.hlBatch : null,
        drop: p.tick.dropN, lag: p.tick.lagPct, steps: p.walk && p.walk.steps, usPer: Ls.bodies > 0 ? +(t.p50 * 1000 / Ls.bodies).toFixed(4) : null });
      const s = slices[slices.length - 1];
      say(`    조각 ${k} phase ${s.phase.toFixed(3)}${s.night ? '(밤)' : '(낮)'} · p50 ${s.p50}ms · p95 ${s.p95} · 몸 ${s.bodies} · 사람당 ${s.usPer}µs · 밭에 ${s.farmAct}/${s.farmers} · 손 ${s.hands} · 왕복 ${s.trips} · 오늘 일 ${s.mTk} · drop ${s.drop} · lag ${s.lag}`);
      k++;
    }
    const p1 = await b.getj('/perf'); const f1 = p1 && p1.farm;
    b.closeWs(); await b.kill(); rmdb(zdb);
    const day = slices.filter((s) => !s.night && !s.wrapped), all = slices.filter((s) => !s.wrapped);
    const mean = (a, k2) => a.length ? +(a.reduce((x, s) => x + (s[k2] || 0), 0) / a.length).toFixed(4) : null;
    res.arms[arm] = { env, bootS: +((Date.now() - tb) / 1000).toFixed(0), d0, d1: dayOf(p1), dTkDay, tkPday: L && L.tkPday,
      farm0: f0, farm1: f1, slices,
      sum: { dayN: day.length, allN: all.length, dayP50: mean(day, 'p50'), dayUs: mean(day, 'usPer'), allP50: mean(all, 'p50'), allUs: mean(all, 'usPer'),
             dayP95: mean(day, 'p95'), dropMax: Math.max(0, ...all.map((s) => s.drop || 0)), lagMax: Math.max(0, ...all.map((s) => s.lag || 0)) },
      done: true };
    say(`  ${arm}: 낮 p50 ${res.arms[arm].sum.dayP50}ms · 사람당 ${res.arms[arm].sum.dayUs}µs(낮) / ${res.arms[arm].sum.allUs}µs(하루) · 그 하루 작물 일 ${dTkDay}`);
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  }
  say('\n[b] 끝 →', OUT);
}

(async () => {
  const mode = process.argv[2] || 'ab';
  if (mode.includes('a')) await phaseA();
  if (mode.includes('b')) await phaseB();
  process.exit(0);
})();
