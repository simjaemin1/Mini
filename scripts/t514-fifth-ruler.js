#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T514 자)
// =============================================================================
// T514 — 다섯째 판의 자: 기준선이 생활층을 못 본다. **계측기다 — 제품 코드는 한 글자도 안 만진다**(사본 0 · 새 수 0).
//
//   doors  <씨> <날> <outdir>                — ① 어느 문: `t176-ab` 를 그대로 돌리며(적재 순간 덧붙임 · 동작 0) villages.js
//                                              안 함수의 **호출 수**를 센다(앞문 `onGameTick → _openDayJobs → ⑩ _lifeDaily` ↔
//                                              옆문 `__labProbe._cropProbe`·`_clearProbe`). 세는 판의 T176 JSON = 안 세는 판(cmp).
//                                              + 시도 판(`T514_TRY=1` · 2일 · 값 버림): 첫 econ 틱 뒤 `_t449Probe.daily(마을)` 을
//                                              불러 **어디서 멈추나**(없는 칸)를 적는다.
//   run    <표지> <씨> <마을하루ms> <날> <outdir> [세계하루ms] [portBase] [팔]
//                                            — ⓑ 실서버 판(central + 한반도 존 · 관측자 0 · 문 열림 · T470 문법):
//                                              `VILLAGE_DAY_MS` = 마을 하루(T368 문법 · V 판) · [세계하루ms] 를 주면
//                                              `WORLD.dayLengthMs` 도 같은 수로(적재 순간 한 칸 · W 판 = 두 시계 한 수).
//                                              시계 원점(T455 `t455-clock.js`)을 **같은 달력 날**(D0 = 365k + 60 · 모든 n 같은 달)
//                                              직전에 둔다. 하루 경계마다 마을 50곳 한 줄(JSONL · 존 안에서 — 폴링 0) +
//                                              나무꾼·채집 몸 1초 표본(`t491-probe` · 끝에 SIGUSR2).
//   table  <outdir> [md]                     — 판들을 한 표로(날당 평균 · 실제 날 A/A 폭 · 같은가).
//   (3시드 800일 시간은 표의 `벽시계 s/일` 에서 — 보고/T514 §2-ⓒ)
//
//   T514 판 다시 서기(씨 1020 · 틀 → 판):
//     T514_LEAD_MS=0 node scripts/t514-fifth-ruler.js run tpl4 1020 4000 200 /tmp/t514/tpl 0 5200 three        (틀 · 15분)
//     T514_TPL=/tmp/t514/tpl/z_tpl4.db T514_LEAD_MS=300000 node scripts/t514-fifth-ruler.js run R1440a 1020 1440000 8 /tmp/t514/b 0 5300 three
//     … W<n>: run W<n> 1020 <n×1000> 8 /tmp/t514/b <n×1000> 5500 three · V<n>: run V<n> 1020 <n×1000> max(8,1440/n) /tmp/t514/b 0 5600 three
//
//   env: T514_ARMS(기본 `three` = 어부·나무꾼·채집 — 밭(T100·T368)은 틀의 작물 날 번호가 시계마다 갈려 뺀다 · T368 ⚠) · T514_TPL(틀 존 DB) · T514_SAMPLE_MS(몸 표본 · 기본 min(1000, 세계하루/8))
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const HOOK = process.env.T514_HOOK || '';
const VJS = path.join('server', 'villages.js');

// ── 적재 순간 덧붙임 — villages.js 원문 **뒤에** 한 줄(동작 0 · 이름을 감싸 호출 수만 센다) ─────────────
const COUNT = ['_openDayJobs', '_lifeDaily', '_lifeHeadlessDay', 'lifeFarmDay', '_lifeClearDay', '_lifeHandsIn', '_t325Scan', '_t347Scan',
  '_t400BuildDay', '_t325Deliver', '_t312Deliver', '_t347Deliver', '_t368Deliver', '_drainTickJobs'];
if (HOOK) {
  const Module = require('module');
  const _compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VJS)) {
      let add = '\n;(function(){ const C = globalThis.__t514c = { onGameTick: 0 }; const W = globalThis.__t514w = {};\n';
      for (const f of COUNT) {
        add += `try { if (typeof ${f} === 'function') { const o = ${f}; C['${f}'] = 0; ${f} = function () { C['${f}']++; const h = W['${f}']; const r = o.apply(this, arguments); if (h) { try { h(r, arguments); } catch (e) {} } return r; }; } } catch (e) { C['${f}'] = 'x'; }\n`;
      }
      add += `try { const o = module.exports.onGameTick; module.exports.onGameTick = function () { C.onGameTick++; return o.apply(this, arguments); }; } catch (e) {}\n`;
      add += `globalThis.__t514st = function () { return state; }; globalThis.__t514fn = { gameDayOf }; })();\n`;
      content += add;
    }
    return _compile.call(this, content, filename);
  };
}
function onLoad(rel, fn) {
  const Module = require('module');
  const want = path.join(ROOT, rel);
  const orig = Module._load;
  let done = false;
  Module._load = function (req, parent, isMain) {
    const m = orig.apply(this, arguments);
    if (!done) { let f = null; try { f = Module._resolveFilename(req, parent, isMain); } catch (e) {} if (f === want) { done = true; fn(m); } }
    return m;
  };
}
const r3 = (x) => (typeof x === 'number' && isFinite(x)) ? +x.toFixed(3) : (x == null ? null : x);

if (HOOK === 't176') {
  // ── doors: t176 안에서 센다 · 끝에 적는다 ──
  let vil0 = null, tried = null, days = 0;
  onLoad('server/villages.js', (V) => {
    const CP = V.__labProbe && V.__labProbe._cropProbe;
    if (CP) { const a = CP.attach; CP.attach = function () { const v = a.apply(this, arguments); if (!vil0) vil0 = v; return v; }; }
  });
  onLoad('sim/economy-sim-v2.js', (v2) => {
    const orig = v2.tickWorldV2;
    v2.tickWorldV2 = function (world) {
      const r = orig.apply(this, arguments); days++;
      if (process.env.T514_TRY === '1' && days === 1 && vil0 && !tried) {
        const st = globalThis.__t514st ? globalThis.__t514st() : null;
        const V = require(path.join(ROOT, 'server/villages.js'));
        tried = { before: { ready: st && st.ready, deps: st ? (st.deps == null ? null : Object.keys(st.deps)) : '?', dayMs: st && st.dayMs, villages: st && st.villages ? st.villages.length : null,
          vilKeys: Object.keys(vil0).filter((k) => /npcPids|_granList|_terrSet|econ/.test(k)) } };
        try { V.__labProbe._t449Probe.daily(vil0); tried.ok = true; } catch (e) {
          const at = String(e && e.stack || '').split('\n').find((l) => l.includes('villages.js')) || '';
          tried.err = String(e && e.message || e); tried.at = at.trim().replace(ROOT + '/', '');
        }
      }
      return r;
    };
  });
  process.on('exit', () => {
    try {
      const st = globalThis.__t514st ? globalThis.__t514st() : null;
      fs.writeFileSync(process.env.T514_OUT, JSON.stringify({ days, counts: globalThis.__t514c || null, tried,
        state: st ? { ready: st.ready, deps: st.deps == null ? null : Object.keys(st.deps).length, dayMs: st.dayMs || 0, villages: st.villages ? st.villages.length : null, lastGameDay: st.lastGameDay } : null }, null, 1));
    } catch (e) {}
  });
} else if (HOOK === 'zone') {
  // ── run: 존 안에서 — 씨 · (W 판) 세계 하루 · 하루 경계마다 한 줄 ──
  const SEED = parseInt(process.env.T514_SEED || '', 10);
  const WMS = parseInt(process.env.T514_WORLD_MS || '', 10);
  onLoad('server/zone-config.js', (zc) => {
    if (SEED > 0 && zc.ZONES && zc.ZONES.hanbando) zc.ZONES.hanbando.villageSeed = SEED;
    if (WMS > 0 && zc.WORLD) zc.WORLD.dayLengthMs = WMS;   // ★W 판 — 두 시계 한 수(같은 n · 새 수 0)
    process.stderr.write(`[T514] seed ${SEED} · WORLD.dayLengthMs ${zc.WORLD && zc.WORLD.dayLengthMs}\n`);
  });
  const OUTF = process.env.T514_ROWS;
  const hr = () => Number(process.hrtime.bigint() / 1000000n);
  let prev = {}, lastT = null, lastDay = null;
  const body = { wood: {}, fish: {}, forage: {}, farm: {} };   // 마을 dbId → 그날 몸 입고(감싼 deliver 의 돌려준 값)
  const add = (k) => (r, a) => { const v = a && a[0]; if (v && r > 0) body[k][v.dbId] = (body[k][v.dbId] || 0) + r; };
  function flush(now) {
    const st = globalThis.__t514st && globalThis.__t514st(); if (!st || !st.villages || !st.world) return;
    const t = hr();
    const vs = [];
    for (const v of st.villages) {
      const e = v.econ || {}, S = e.storage || {}, P = prev[v.dbId] || {};
      const cur = { wd: +v._t325Deliv || 0, fd: +v._t312Deliv || 0, gd: +v._t347Deliv || 0, md: +v._t368Deliv || 0, hb: v._t368HlBody | 0, hx: v._t368HlBatch | 0 };
      const d = (k) => r3(cur[k] - (P[k] || 0));
      const W = v._t325Dbg || {}, G = v._t347Dbg || {};
      vs.push([v.name, (e.npcs || []).length, (v.npcPids || []).length,
        r3(body.wood[v.dbId] || 0), d('wd'), W.cut | 0, W.walked | 0, W.cap | 0,
        r3(body.fish[v.dbId] || 0), d('fd'),
        r3(body.forage[v.dbId] || 0), d('gd'), G.pick | 0,
        r3(body.farm[v.dbId] || 0), d('md'), d('hb'), d('hx'), v._dTk | 0,
        r3(+e._fishOutLast || 0), r3(+e._woodOutLast || 0), r3(+e._forageOutLast || 0), r3(+S.wood || 0), r3(+S.food || 0), r3(+S.fish || 0)]);
      prev[v.dbId] = cur;
    }
    body.wood = {}; body.fish = {}; body.forage = {}; body.farm = {};
    const row = { day: st.world.day, gday: st.dayMs ? Math.floor(now / st.dayMs) : null, wallMs: lastT == null ? null : t - lastT, vs };
    lastT = t;
    if (OUTF) fs.appendFileSync(OUTF, JSON.stringify(row) + '\n');
  }
  //   하루 경계 — `_openDayJobs` 는 그날 조각 목록을 **세우기만** 한다(실행 0). 그 직후(감싼 뒤 고리)가 곧 어제 하루(`_lifeDaily` 전부)가
  //     끝난 자리다 ⇒ 어제 줄을 여기서 닫는다(폴링 0 · 벽시계 = 경계 사이 실시간). 몸 입고는 다음 econ 조각의 `_lifeHandsIn` 에서 오므로
  //     그날 해 질 녘 손은 **다음 줄**에 선다(모든 판 같은 꼴).
  const arm = () => {
    const W = globalThis.__t514w; if (!W) return setTimeout(arm, 50);
    W._t325Deliver = add('wood'); W._t312Deliver = add('fish'); W._t347Deliver = add('forage'); W._t368Deliver = add('farm');
    W._openDayJobs = (r, a) => flush(a && a[0]);
  };
  setTimeout(arm, 0);
} else {
  main();
}

// ── 자 본체 ─────────────────────────────────────────────────────────────────
function main() {
  const { spawn, execFileSync } = require('child_process');
  const [MODE, ...A] = process.argv.slice(2);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };

  if (MODE === 'doors') {
    const [SEEDS, DAYSS, OUTD] = A; const SEED = parseInt(SEEDS, 10), DAYS = parseInt(DAYSS, 10) || 30;
    fs.mkdirSync(OUTD, { recursive: true });
    const base = Object.assign({}, process.env, { ENABLE_VILLAGES: '1', LAB_SEEDCACHE: process.env.LAB_SEEDCACHE || '' });
    const t176 = path.join(ROOT, 'scripts/t176-ab.js');
    const run = (tag, extra, days, pre) => {
      const env = Object.assign({}, base, { T176_JSON: path.join(OUTD, `x_${tag}.json`), T17_JSON: path.join(OUTD, `j_${tag}.json`) }, extra);
      const t0 = Date.now();
      const o = execFileSync(process.execPath, (pre ? ['-r', __filename] : []).concat([t176, String(days), String(SEED)]), { cwd: ROOT, env, maxBuffer: 256 << 20 }).toString();
      fs.writeFileSync(path.join(OUTD, `o_${tag}.txt`), o);
      say(`[doors] ${tag} ${days}일 · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    };
    run(`plain_${SEED}`, {}, DAYS, false);
    run(`count_${SEED}`, { T514_HOOK: 't176', T514_OUT: path.join(OUTD, `c_${SEED}.json`) }, DAYS, true);
    run(`try_${SEED}`, { T514_HOOK: 't176', T514_TRY: '1', T514_OUT: path.join(OUTD, `t_${SEED}.json`) }, 2, true);
    const same = fs.readFileSync(path.join(OUTD, `x_plain_${SEED}.json`)).equals(fs.readFileSync(path.join(OUTD, `x_count_${SEED}.json`)))
      && fs.readFileSync(path.join(OUTD, `j_plain_${SEED}.json`)).equals(fs.readFileSync(path.join(OUTD, `j_count_${SEED}.json`)));
    const c = JSON.parse(fs.readFileSync(path.join(OUTD, `c_${SEED}.json`), 'utf8'));
    const t = JSON.parse(fs.readFileSync(path.join(OUTD, `t_${SEED}.json`), 'utf8'));
    fs.writeFileSync(path.join(OUTD, `doors_${SEED}.json`), JSON.stringify({ seed: SEED, days: DAYS, sameBytes: same, count: c, tried: t.tried }, null, 1));
    console.log(JSON.stringify({ sameBytes: same, counts: c.counts, state: c.state, tried: t.tried }, null, 1));
    return;
  }

  if (MODE === 'run') {
    const [LABEL, SEEDS, DMS, DAYSS, OUTD, WMS, PB, ARMN] = A;
    const SEED = parseInt(SEEDS, 10), DAY_MS = parseInt(DMS, 10), DAYS = parseInt(DAYSS, 10), WORLD_MS = parseInt(WMS || '0', 10) || 0;
    const FISH = { T312_FISH_ACT: '1' }, WOOD = { T325_WOOD_ACT: '1' }, FOR = { T347_FORAGE_ACT: '1' }, FARM = { T100_FIELD_YIELD: '1', T368_FARM_ACT: '1' };
    const ARMS = { off: {}, three: Object.assign({}, FISH, WOOD, FOR), four: Object.assign({}, FISH, WOOD, FOR, FARM) };
    const ARM = ARMN || process.env.T514_ARMS || 'three';
    if (!(SEED > 0) || !(DAY_MS > 0) || !(DAYS > 0) || !OUTD || !ARMS[ARM]) { console.error('쓰는 법: run <표지> <씨> <마을하루ms> <날> <outdir> [세계하루ms] [portBase] [팔]'); process.exit(2); }
    fs.mkdirSync(OUTD, { recursive: true });
    const tag = LABEL, CP = parseInt(PB || '5100', 10), ZP = CP + 10, SECRET = 't514-' + tag;
    const zdb = path.join(OUTD, `z_${tag}.db`), cdb = path.join(OUTD, `c_${tag}.db`); rmdb(zdb); rmdb(cdb);
    //   ★틀(T368 b 문법) — `T514_TPL` 이면 그 존 DB 를 **복사해서** 띄운다(모든 판이 같은 세계에서 갈라진다 · central 은 새것)
    const TPL = process.env.T514_TPL || '';
    if (TPL) for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, zdb + s); } catch (e) {} }
    const ROWS = path.join(OUTD, `rows_${tag}.jsonl`); try { fs.unlinkSync(ROWS); } catch (e) {}
    const PROBE = path.join(OUTD, `probe_${tag}.json`);
    //   ★시계 원점 — 모든 n 이 **같은 달력 날**(D0 = 365k + 60 · 게임일 0 = 3월 → 60일 = 5월 초)에서 첫 경계를 맞는다.
    //     원점은 경계 LEAD 앞(부팅이 끝날 즈음 첫 경계) · 세계 시계(W 판)도 같은 n 이라 해 뜨는 순간과 경계가 겹친다.
    const LEAD = parseInt(process.env.T514_LEAD_MS || '90000', 10);
    const k = Math.floor(Date.now() / (DAY_MS * 365));
    const D0 = 365 * k + 60, AT = D0 * DAY_MS - Math.min(LEAD, DAY_MS * 20);
    const SAMPLE = parseInt(process.env.T514_SAMPLE_MS || String(Math.max(100, Math.min(1000, Math.floor((WORLD_MS || 1440000) / 8)))), 10);
    const clockEnv = { NODE_OPTIONS: `--require ${path.join(ROOT, 'scripts/t455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(AT) };
    const logf = fs.openSync(path.join(OUTD, `z_${tag}.log`), 'w');
    const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, clockEnv, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
    const zenv = Object.assign({}, process.env, clockEnv, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), VILLAGE_WAR_LOG: '0', ZONE_IDLE_SKIP: '0', T432_BODY_CHUNKS: '0',
      T514_HOOK: 'zone', T514_SEED: String(SEED), T514_ROWS: ROWS, T514_WORLD_MS: WORLD_MS ? String(WORLD_MS) : '',
      T491_PROBE_OUT: PROBE, T491_SAMPLE_MS: String(SAMPLE), T449_PROBE_OUT: '' }, ARMS[ARM]);
    for (const kk of ['T312_FISH_ACT', 'T325_WOOD_ACT', 'T347_FORAGE_ACT', 'T368_FARM_ACT', 'T100_FIELD_YIELD', 'T400_BUILD_ACT', 'T435_GRANARY_ACT', 'T423_RATION_ACT', 'T452_KILN_ACT', 'T491_BATCH_FROM_BODY', 'T449_BODY_DAY']) if (!ARMS[ARM][kk]) delete zenv[kk];
    const t0 = Date.now();   // (이 자 프로세스의 시계는 안 민다 — 벽시계 그대로)
    const z = spawn(process.execPath, ['-r', __filename, '-r', path.join(ROOT, 'scripts/t491-probe.js'), path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env: zenv });
    const meta = { tag, seed: SEED, arm: ARM, env: ARMS[ARM], DAY_MS, WORLD_MS: WORLD_MS || 1440000, mode: WORLD_MS ? 'W' : (DAY_MS === 1440000 ? 'R' : 'V'), DAYS, D0, AT, SAMPLE,
      tpl: TPL || null, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version } };
    fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
    const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
    const kill = async () => { try { z.kill('SIGINT'); } catch (e) {} await sleep(5000); try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
    process.on('SIGTERM', async () => { await kill(); process.exit(3); });
    (async () => {
      for (let i = 0; i < 1800 && !(await health()); i++) await sleep(1000);
      meta.bootS = +((Date.now() - t0) / 1000).toFixed(1);
      say(`[${tag}] 부팅 ${meta.bootS}초 · 마을하루 ${DAY_MS}ms · 세계하루 ${meta.WORLD_MS}ms · ${DAYS}일 · 표본 ${SAMPLE}ms`);
      const need = DAYS + 1;   // 첫 줄(부팅 뒤 첫 경계 — 부팅 전 하루의 끝)은 버린다
      const LIM = t0 + (DAYS + 3) * Math.max(DAY_MS, 30000) * 3 + 20 * 60000;
      let n = 0;
      while (Date.now() < LIM) {
        await sleep(Math.max(1000, Math.min(30000, DAY_MS / 2)));
        if (z.exitCode != null) { say(`[${tag}] ⚠존이 죽었다 rc=${z.exitCode}`); break; }
        try { n = fs.readFileSync(ROWS, 'utf8').split('\n').filter(Boolean).length; } catch (e) { n = 0; }
        if (n >= need) break;
      }
      try { z.kill('SIGUSR2'); } catch (e) {}
      await sleep(3000);
      meta.end = new Date().toISOString(); meta.wallS = +((Date.now() - t0) / 1000).toFixed(0); meta.rows = n; meta.done = n >= need;
      fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
      say(`[${tag}] 끝 · 줄 ${n} · 벽시계 ${meta.wallS}초`);
      await kill();
      process.exit(0);
    })();
    return;
  }

  if (MODE === 'table') return table(A[0], A[1] === 'md');
  console.error('쓰는 법: doors <씨> <날> <outdir> · run <표지> <씨> <마을하루ms> <날> <outdir> [세계하루ms] [portBase] [팔] · table <outdir> [md]');
  process.exit(2);
}

// ── 표 — 날당 평균(첫 줄 버림) · 몸 · 일괄 · 임업1 ───────────────────────────────
//   줄 열: [이름, econ 인구, 몸, 나무몸, 나무합, 일괄그루, 나무walked, 나무한도, 고기몸, 고기합, 채집몸, 채집합, 일괄딴것, 농몸, 농합, hlBody, hlBatch, dTk, fishOut, woodOut, forOut, 곳간목재, 곳간식량, 곳간고기]
function summarize(dir, tag) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, `meta_${tag}.json`), 'utf8'));
  //   ★정상 창 — 첫 줄 셋을 버린다(`T514_SKIP` · 기본 3): ① 부팅 뒤 첫 경계(부팅 전 하루의 끝) ② 틀에서 깬 첫날(몸이 아직 안 나른 날 —
  //     `walked 0` 이라 일괄 갈래가 **마을 하루 길이에 비례한 한도**로 돈다 · 표의 `boot*` 열로 따로 적는다) ③ 그 손이 곳간에 드는 날.
  const all = fs.readFileSync(path.join(dir, `rows_${tag}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const SKIP = parseInt(process.env.T514_SKIP || '3', 10);
  const rows = all.slice(SKIP);
  const b1 = all[1] || null;
  const K = rows.length;
  const S = (i, f) => rows.reduce((a, r) => a + r.vs.filter(f || (() => true)).reduce((b, v) => b + (+v[i] || 0), 0), 0) / Math.max(1, K);
  //   ★자 마을 — T491 은 임업1(그 틀에서 나무꾼 econ 2~3)이었다. 이 틀(tpl4 · 200일)의 임업1 은 나무꾼 0 이라
  //     나무꾼 몸이 가장 많은 임업 마을(`임업6` · 몸 6)을 기본으로 둔다(`T514_VIL` 로 바꾼다). 세계 합(`bodyAll`)도 같이 적는다.
  const VIL = process.env.T514_VIL || '임업6';
  const Y = (v) => v[0] === VIL;
  const o = { tag, mode: meta.mode, n: meta.DAY_MS / 1000, w: meta.WORLD_MS / 1000, K, bootS: meta.bootS,
    wallPerDay: K > 0 ? +(rows.reduce((a, r) => a + (r.wallMs || 0), 0) / K / 1000).toFixed(2) : null,
    woodBody: S(3), woodTot: S(4), woodBatchTrees: S(5), fishBody: S(8), fishTot: S(9), forBody: S(10), forTot: S(11), forBatch: S(12),
    farmBody: S(13), farmTot: S(14), hlBody: S(15), hlBatch: S(16), dTk: S(17), woodOut: S(19), forOut: S(20),
    y: { woodBody: S(3, Y), woodTot: S(4, Y), batchTrees: S(5, Y), hlBody: S(15, Y), hlBatch: S(16, Y) },
    bootBatchTrees: b1 ? b1.vs.reduce((a, v) => a + v[5], 0) : null, bootWood: b1 ? +b1.vs.reduce((a, v) => a + v[4], 0).toFixed(1) : null, bootForBatch: b1 ? b1.vs.reduce((a, v) => a + v[12], 0) : null,
    endPop: rows.length ? rows[rows.length - 1].vs.reduce((a, v) => a + v[1], 0) : null,
    endWood: rows.length ? +rows[rows.length - 1].vs.reduce((a, v) => a + v[21], 0).toFixed(1) : null,
    endFood: rows.length ? +rows[rows.length - 1].vs.reduce((a, v) => a + v[22], 0).toFixed(1) : null };
  //   몸 표본(t491-probe) — 임업1 나무꾼 몸·날: 그루 · 걸음 m · 곳간행
  try {
    const P = JSON.parse(fs.readFileSync(path.join(dir, `probe_${tag}.json`), 'utf8'));
    const d0 = rows.length ? rows[0].day : 0, d1 = rows.length ? rows[rows.length - 1].day : 0;
    const agg = (filt) => { let bd = 0, cut = 0, walk = 0, fbd = 0, pick = 0, fwalk = 0;
      for (const k of Object.keys(P.bodies || {})) { const b = P.bodies[k]; if (filt && !filt(b)) continue;
        for (const dd of Object.keys(b.days)) { const d = +dd; if (d < d0 || d > d1) continue; const a = b.days[dd];
          const lj = (a.jobs.lumberjack || 0) >= (a.jobs.forager || 0);
          if (lj) { bd++; cut += a.cutN; walk += a.walk; } else { fbd++; pick += a.pickN; fwalk += a.walk; } } }
      return { bd, cutPer: bd ? +(cut / bd).toFixed(3) : null, walkM: bd ? +(walk / bd / 32).toFixed(1) : null, fbd, pickPer: fbd ? +(pick / fbd).toFixed(3) : null, fwalkM: fbd ? +(fwalk / fbd / 32).toFixed(1) : null }; };
    o.bodyAll = agg(null); o.bodyY = agg((b) => b.vil === VIL); o.vil = VIL;
  } catch (e) { o.bodyAll = null; o.bodyY = null; }
  for (const k of Object.keys(o)) if (typeof o[k] === 'number') o[k] = +o[k].toFixed(3);
  for (const k of Object.keys(o.y)) o.y[k] = +o.y[k].toFixed(3);
  return o;
}
function table(dir, md) {
  const tags = fs.readdirSync(dir).filter((f) => /^meta_.*\.json$/.test(f)).map((f) => f.slice(5, -5));
  const rs = [];
  for (const t of tags) { try { rs.push(summarize(dir, t)); } catch (e) { console.error(t, e.message); } }
  rs.sort((a, b) => (a.mode + String(a.n).padStart(6, '0')).localeCompare(b.mode + String(b.n).padStart(6, '0')));
  fs.writeFileSync(path.join(dir, 'table.json'), JSON.stringify(rs, null, 1));
  const R = rs.filter((r) => r.mode === 'R');
  const ref = (k, sub) => { const xs = R.map((r) => sub ? (r[sub] && r[sub][k]) : r[k]).filter((x) => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const cols = [['bootBatchTrees', null, '깬 날 일괄 그루'], ['woodBody', null, '나무 몸 단/일'], ['woodBatchTrees', null, '일괄 그루/일'], ['fishBody', null, '고기 몸 단/일'], ['forBody', null, '채집 몸/일'], ['forBatch', null, '일괄 딴 것/일'],
    ['dTk', null, '작물 일/일'], ['cutPer', 'bodyAll', '나무꾼 그루/몸·일'], ['walkM', 'bodyAll', '나무꾼 걸음 m/몸·일'], ['bd', 'bodyAll', '나무꾼 몸·일'], ['cutPer', 'bodyY', '자 마을 그루/몸·일'], ['woodTot', 'y', '자 마을 목재 단/일']];
  const f = (x) => x == null ? '—' : (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : (+x.toFixed(2)).toString());
  const head = ['판', '마을하루 s', '세계하루 s', '날', '벽시계 s/일'].concat(cols.map((c) => c[2]));
  const lines = [];
  const pr = (a) => lines.push(md ? '| ' + a.join(' | ') + ' |' : a.join('\t'));
  pr(head); if (md) pr(head.map(() => '---'));
  for (const r of rs) pr([r.tag, r.n, r.w, r.K, r.wallPerDay].concat(cols.map(([k, sub]) => { const v = sub ? (r[sub] && r[sub][k]) : r[k]; const rf = ref(k, sub); return f(v) + (r.mode !== 'R' && rf ? ` (${rf ? (v == null ? '—' : ((v / rf - 1) * 100).toFixed(0) + '%') : ''})` : ''); })));
  console.log(lines.join('\n'));
}
