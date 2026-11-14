#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1292 자 · 판 하나 = central + 존 둘 · 벽시계 · 마을 하루를 줄인 판)
// =============================================================================
// T1292 — 한반도 ↔ 닛폰 두 존 판: 넘은 캐러밴 · 교역 도착 · 머문 NPC · **몸 보존**(두 존 동시 · 어디에도 없음) · 하루 늦음 · 인구 · 굶음 · CPU
//   **계측기다 — 제품 코드는 한 글자도 안 만진다**(T533 자 문법: 적재 순간 villages.js 뒤에 한 줄 — `state` 를 읽는 창 · 동작 0).
//
//   run     <표지> <씨> <마을하루ms> <날> <outdir> <on|off>  — central + hanbando + nippon(zone-config 포트 그대로 · 한 판씩 · 동시 0)
//             on = 세 손잡이 켬: `T525_CROSS_ZONE`(교역 · 캐러밴 몸) · `T952_XZ_STAY`(받는 존 머묾) · `T622_ZONE_FAUNA`(짐승 존 칸)
//                  + `T1139_XZ_LAZY=1`(걸음표는 물은 쌍만 — 답은 전 쌍 한 벌과 글자 같다 · T1139 증명 · 판 앞머리만 줄인다)
//             off = 세 손잡이 끔(서버 기본) · on-t952off = 가름 판(T525 · T622 켬 · `T952_XZ_STAY` 만 끔 — 인구가 옮겨 가는 쪽을 가른다)
//   analyze <outdir> <표지>                                   — 두 존 사건 줄을 한 시계로 맞대 몸 보존 표(아래) + 하루 줄 표
//
//   존 안(`T1292_HOOK=zone`) — 폴링 0 · 사건이 나는 그 자리에서 줄 하나(벽시계 µs — `performance.timeOrigin + now()` · 두 존이 한 기계라 같은 시계):
//     ⓐ 몸 표(`state.caravanBodies`)의 넣기 · 빼기 — 경계를 아는 몸(`_xz`)만 · 열쇠 · 구간
//     ⓑ 경계 표(`state.xzone.trace`)에 서는 줄 전부(out · in · back · home · gone · bounce · hide · unhide …) — 고리(400) 밖으로 밀리기 전에 받아 적는다
//     ⓒ 받은 기록(`core.onRecord`)의 보낸 경계 · 받은 때의 이 존 날 · 기록이 econ 에 드는 경계(`core.dayIn` — 하루 늦음)
//     ⓓ 하루 경계마다 한 줄 — 인구 · 죽음 · 빚 죽음(굶음) · 마을 수 · 교역 장부 · 경계 수 · T952 머묾 · CPU(이 존 프로세스 · 그날 몫)
//   몸 보존(analyze): 논리 몸 = (집 존, 캐러밴 id) — 집 존 열쇠 `id` · 이웃 존 열쇠 `xz:<집>:<id>`.
//     존마다 있는 구간 = 넣기 ~ 빼기(숨김 `hide` ~ `unhide` 는 빠진다 — 숨긴 몸은 그 존에 없다 · 사람 넘기 껍데기와 같은 뜻).
//     넘김마다 앞 존 끝 → 뒷 존 시작의 틈(+ = 어디에도 없음 · − = 두 존 동시) · 사라짐 = 끝났는데 다른 존에서 안 서고 집에 닿지도(home) 죽지도 않은 몸.
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const HOOK = process.env.T1292_HOOK || '';
const VJS = path.join('server', 'villages.js');

let _isMain = true; try { _isMain = require('worker_threads').isMainThread; } catch (e) {}
if (HOOK === 'zone' && !_isMain) {
  // 걸음표 워커(존이 띄운 스레드)도 `-r` 을 물려받는다 — 거기선 아무것도 안 한다
} else if (HOOK === 'zone') {
  const Module = require('module');
  const _compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VJS)) content += '\n;globalThis.__t1292 = { st: function () { return state; }, t952: function () { return (typeof _t952Stat !== "undefined") ? _t952Stat : null; } };\n';
    return _compile.call(this, content, filename);
  };
  const SEED = parseInt(process.env.T1292_SEED || '', 10);
  const want = path.join(ROOT, 'server/zone-config.js');
  const _load = Module._load;
  let seeded = false;
  Module._load = function (req, parent, isMain) {
    const m = _load.apply(this, arguments);
    if (!seeded) { let f = null; try { f = Module._resolveFilename(req, parent, isMain); } catch (e) {} if (f === want) { seeded = true; if (SEED > 0 && m.ZONES) for (const z of Object.values(m.ZONES)) if (z) z.villageSeed = SEED; } }
    return m;
  };
  const { performance } = require('perf_hooks');
  const NOW = () => performance.timeOrigin + performance.now();
  const FX = require('./fixture-xz-bodylog');   // 호위 몸 수 셈(`escOf`) — 정본 한 벌(적기 `install` 은 env `XZ_BODYLOG` 가 없어 안 깬다)
  const ROWS = process.env.T1292_ROWS, EVF = process.env.T1292_EV;
  let buf = [];
  const ev = (o) => { o.t = +NOW().toFixed(3); buf.push(JSON.stringify(o)); };
  const flush = () => { if (!buf.length || !EVF) return; try { fs.appendFileSync(EVF, buf.join('\n') + '\n'); } catch (e) {} buf = []; };
  let wrappedMap = null, wrappedTrace = null, wrappedCore = null;
  let lastDay = null, lastG = null, lastT = null, cpu0 = process.cpuUsage();
  const _iv = setInterval(() => {
    const H = globalThis.__t1292; const st = H && H.st();
    if (!st) return;
    // ⓐ 몸 표 — 넣기 · 빼기(경계 몸만). 표가 갈리면(새 Map) 다시 감싼다.
    const M = st.caravanBodies;
    if (M && M !== wrappedMap) {
      wrappedMap = M;
      const _set = M.set.bind(M), _del = M.delete.bind(M);
      M.set = function (k, b) { const had = M.has(k); const r = _set(k, b); if (!had && b && b._xz) ev(Object.assign({ z: st.zoneId, op: 'set', key: String(k), ph: b.phase || null, g: st.lastGameDay }, FX.escOf(st, b))); return r; };
      M.delete = function (k) { const b = M.get(k); const r = _del(k); if (r && b && b._xz) ev({ z: st.zoneId, op: 'del', key: String(k), ph: b.phase || null, g: st.lastGameDay }); return r; };
    }
    const X = st.xzone;
    // ⓑ 경계 표 — 줄이 서는 그 자리에서
    if (X && X.trace && X.trace !== wrappedTrace) {
      wrappedTrace = X.trace;
      const T = X.trace;
      T.push = function (...a) { for (const e of a) { const o = Object.assign({ z: st.zoneId, op: 'tr' }, e); if (e.k === 'hide' && e.key != null) Object.assign(o, FX.escOf(st, st.caravanBodies.get(e.key))); ev(o); } return Array.prototype.push.apply(T, a); };   // 숨는 순간 산 호위(정본 `escOf`)
    }
    // ⓒ 받은 기록 · econ 에 드는 경계(하루 늦음)
    if (X && X.core && X.core !== wrappedCore) {
      wrappedCore = X.core;
      const C = X.core, _on = C.onRecord, _in = C.dayIn;
      C.onRecord = function (m) { const r = _on.call(C, m); if (r && m && m.rec) ev({ z: st.zoneId, op: 'rec', kind: m.rec.kind, id: m.rec.id, from: m.zone || m.rec.fromZone || null, gSend: Math.floor(+m.gday || 0), gNow: st.lastGameDay }); return r; };
      C.dayIn = function (g, adjust) {
        const due = C.pend.filter((p) => p.gday < g).map((p) => ({ kind: p.rec.kind, id: p.rec.id, gSend: p.gday }));
        const r = _in.call(C, g, adjust);
        for (const d of due) ev(Object.assign({ z: st.zoneId, op: 'due', gIn: g }, d));
        return r;
      };
    }
    // ⓓ 하루 줄
    if (!st.ready || !st.world || st.tickJobs) return;
    const w = st.world;
    if (w.day === lastDay) return;
    const t = Date.now(), c1 = process.cpuUsage(cpu0); cpu0 = process.cpuUsage();
    let pop = 0, dead = 0, ever = 0, deaths = 0, fdDeaths = 0;
    for (const v of w.villages) { const n = (v.npcs || []).length; pop += n; if (v._everPop) ever++; if (v._everPop && n <= 0) dead++; deaths += v._deadTot || 0; fdDeaths += v._fdDeadTot || 0; }
    let xzBodies = 0, xzLinger = 0, xzHidden = 0;
    for (const [, b] of (st.caravanBodies || [])) if (b && b._xz) { xzBodies++; if (b.phase === 'linger') xzLinger++; if (b._xzHidden) xzHidden++; }
    const t952 = H.t952 ? H.t952() : null;
    const row = { zone: st.zoneId, day: w.day, g: st.lastGameDay, skip: lastG != null ? Math.max(0, st.lastGameDay - lastG - (w.day - lastDay)) : 0, wallMs: lastT != null ? t - lastT : null,
      pop, dead, ever, deaths, fdDeaths, trades: (w.tradeLog || []).length, caravans: (w.caravans || []).length, bodies: st.caravanBodies ? st.caravanBodies.size : 0,
      xzBodies, xzLinger, xzHidden, cpuMs: +((c1.user + c1.system) / 1000).toFixed(1), t952: t952 ? { stays: t952.stays, joined: t952.joined } : null,
      xz: X ? { st: X.st, core: X.core.st, ready: X.core.peersReady().length, stubs: (X.core.X.stubs || []).length, retry: X.retry.length, geo: X.host.hs.geo } : null };
    lastDay = w.day; lastG = st.lastGameDay; lastT = t;
    if (ROWS) try { fs.appendFileSync(ROWS, JSON.stringify(row) + '\n'); } catch (e) {}
  }, 20);
  const _fv = setInterval(flush, 200);
  if (_iv.unref) _iv.unref(); if (_fv.unref) _fv.unref();
  process.on('exit', flush);
  for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { flush(); process.exit(0); });
} else {
  main();
}

function main() {
  const { spawn } = require('child_process');
  const [MODE, ...A] = process.argv.slice(2);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
  const { ZONES } = require(path.join(ROOT, 'server/zone-config'));
  const ZS = ['hanbando', 'nippon'];

  if (MODE === 'run') {
    const [LABEL, SEEDS, DMS, DAYSS, OUTD, ARM] = A;
    const SEED = parseInt(SEEDS, 10), DAY_MS = parseInt(DMS, 10), DAYS = parseInt(DAYSS, 10);
    if (!(SEED > 0) || !(DAY_MS > 0) || !(DAYS > 0) || !OUTD || !/^(on|off|on-t952off)$/.test(ARM || '')) { console.error('쓰는 법: run <표지> <씨> <마을하루ms> <날> <outdir> <on|off|on-t952off>'); process.exit(2); }
    fs.mkdirSync(OUTD, { recursive: true });
    const tag = LABEL, CP = 3010;
    const cdb = path.join(OUTD, `c_${tag}.db`); rmdb(cdb);
    const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(',') }) });
    const Z = {};
    for (const z of ZS) {
      const zdb = path.join(OUTD, `z_${tag}_${z}.db`); rmdb(zdb);
      const rows = path.join(OUTD, `rows_${tag}_${z}.jsonl`), evf = path.join(OUTD, `ev_${tag}_${z}.jsonl`);
      for (const f of [rows, evf]) { try { fs.unlinkSync(f); } catch (e) {} }
      const env = Object.assign({}, process.env, { PORT: String(ZONES[z].port), ZONE_ID: z, CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','),
        DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), T1292_HOOK: 'zone', T1292_SEED: String(SEED), T1292_ROWS: rows, T1292_EV: evf,
        T662_GEO_CACHE_DIR: path.join(OUTD, `geo_${tag}`) });
      for (const k of ['T525_CROSS_ZONE', 'T952_XZ_STAY', 'T622_ZONE_FAUNA', 'T1139_XZ_LAZY']) delete env[k];
      if (ARM === 'on') Object.assign(env, { T525_CROSS_ZONE: '1', T952_XZ_STAY: '1', T622_ZONE_FAUNA: '1', T1139_XZ_LAZY: '1' });
      if (ARM === 'on-t952off') Object.assign(env, { T525_CROSS_ZONE: '1', T622_ZONE_FAUNA: '1', T1139_XZ_LAZY: '1' });   // 가름 판 — 이웃 존 머묾만 끔(종전 1게임시간)
      const logf = fs.openSync(path.join(OUTD, `z_${tag}_${z}.log`), 'w');
      Z[z] = { rows, p: spawn(process.execPath, ['-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env }) };
    }
    const meta = { tag, seed: SEED, arm: ARM, DAY_MS, DAYS, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version } };
    fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
    const kill = async () => { for (const z of ZS) { try { Z[z].p.kill('SIGINT'); } catch (e) {} } await sleep(4000); for (const z of ZS) { try { Z[z].p.kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
    process.on('SIGTERM', async () => { await kill(); process.exit(3); });
    (async () => {
      const t0 = Date.now();
      const LIM = t0 + (DAYS + 10) * DAY_MS * 4 + 30 * 60000;
      const lastDay = (f) => { try { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); return L.length && L[0] ? JSON.parse(L[L.length - 1]).day : -1; } catch (e) { return -1; } };
      let dd = {};
      while (Date.now() < LIM) {
        await sleep(Math.max(2000, Math.min(30000, DAY_MS * 2)));
        if (ZS.some((z) => Z[z].p.exitCode != null)) { say(`[${tag}] ⚠존이 죽었다`); break; }
        dd = Object.fromEntries(ZS.map((z) => [z, lastDay(Z[z].rows)]));
        if (ZS.every((z) => dd[z] >= DAYS)) break;
      }
      meta.end = new Date().toISOString(); meta.wallS = +((Date.now() - t0) / 1000).toFixed(0); meta.days = dd; meta.done = ZS.every((z) => dd[z] >= DAYS);
      fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
      say(`[${tag}] 끝 · 날 ${JSON.stringify(dd)} · 벽시계 ${meta.wallS}초`);
      await kill();
      process.exit(0);
    })();
    return;
  }
  if (MODE === 'analyze') { const r = analyze(A[0], A[1]); console.log(JSON.stringify(r, null, 1)); return; }
  console.error('쓰는 법: run <표지> <씨> <마을하루ms> <날> <outdir> <on|off> · analyze <outdir> <표지>');
  process.exit(2);
}

// ── 몸 보존 — 두 존 사건 줄을 한 시계로 ─────────────────────────────────────────────
function analyze(dir, tag) {
  const ZS = ['hanbando', 'nippon'];
  const read = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } };
  const EV = [], ROWS = {};
  for (const z of ZS) { for (const e of read(path.join(dir, `ev_${tag}_${z}.jsonl`))) EV.push(e); ROWS[z] = read(path.join(dir, `rows_${tag}_${z}.jsonl`)); }
  EV.sort((a, b) => a.t - b.t);
  // 몸 보존 — 정본(`scripts/fixture-xz-bodylog.js` · e2e ⓚ 와 같은 셈)
  const BOD = require('./fixture-xz-bodylog').analyze(EV, { tailMs: 10000 });
  // 하루 늦음 — 기록이 econ 에 든 경계 − 보낸 경계
  const lag = {}; for (const e of EV) if (e.op === 'due') { const k = e.gIn - e.gSend; lag[k] = (lag[k] || 0) + 1; }
  const recv = {}; for (const e of EV) if (e.op === 'rec') { const k = e.gNow - e.gSend; recv[k] = (recv[k] || 0) + 1; }
  //   하루를 넘긴 기록(econ 에 든 경계 − 보낸 경계 ≥ 2)의 까닭 — 받은 때가 받는 존의 '다음 경계' 마감(dayIn) 뒤였나(보낸 존 마감이 늦었다) ·
  //   받는 존이 그 경계에 마감을 안 돌렸나(밀려 건너뛴 경계) · 둘 다 아니면 설명 안 됨(줄에 있었는데 안 읽었다 = 결함)
  const recT = new Map(), dueFirst = new Map();
  for (const e of EV) { if (e.op === 'rec') recT.set(`${e.z}:${e.kind}:${e.id}`, e.t); if (e.op === 'due' && !dueFirst.has(`${e.z}:${e.gIn}`)) dueFirst.set(`${e.z}:${e.gIn}`, e.t); }
  const late = { lateArrival: 0, noDayInAtNext: 0, unexplained: 0 };
  for (const e of EV) if (e.op === 'due' && e.gIn - e.gSend >= 2) {
    const tr = recT.get(`${e.z}:${e.kind}:${e.id}`), td = dueFirst.get(`${e.z}:${e.gSend + 1}`);
    if (td == null) late.noDayInAtNext++; else if (tr != null && tr > td) late.lateArrival++; else late.unexplained++;
  }
  // 넘어가 안 돌아온 캐러밴 — 판 끝 각 존 DB 메타 행(econ 이 저장한 그대로): 받는 존 이웃 캐러밴의 귀환 날(`_xzBack.day`)이 지났는데 아직 이 존 · 집 존의 'xzone'(넘어가 있음)
  const stuck = {};
  for (const z of ZS) {
    let M = null; try { const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(path.join(dir, `z_${tag}_${z}.db`), { readOnly: true }); const r = db.prepare('SELECT data FROM world_meta WHERE zone = ?').get(z); M = r ? JSON.parse(r.data) : null; db.close(); } catch (e) {}
    if (!M) { stuck[z] = null; continue; }
    const D = M.anchor ? M.anchor.day : null, cars = M.caravans || [];
    const fx = cars.filter((c) => c._xzHome), over = fx.filter((c) => c.state === 'inbound' && c._xzBack && D - c._xzBack.day >= 2);
    const age = {}; for (const c of over) { const b = D - c._xzBack.day; const k = b < 10 ? '2-9' : b < 30 ? '10-29' : b < 60 ? '30-59' : '60+'; age[k] = (age[k] || 0) + 1; }
    stuck[z] = { day: D, foreign: fx.length, foreignInbound: fx.filter((c) => c.state === 'inbound').length, overdue: over.length, overdueAge: age, homeOut: cars.filter((c) => c.state === 'xzone').length };
  }
  // 하루 줄 끝 · 합
  const last = {}, cpu = {};
  for (const z of ZS) { const R = ROWS[z]; last[z] = R.length ? R[R.length - 1] : null; const c = R.map((r) => r.cpuMs).filter((x) => x != null); cpu[z] = c.length ? { meanMsPerDay: +(c.reduce((a, b) => a + b, 0) / c.length).toFixed(1), days: c.length } : null; }
  const X = (z) => last[z] && last[z].xz ? last[z].xz : null;
  const sum = (f) => ZS.reduce((a, z) => a + (X(z) ? f(X(z)) || 0 : 0), 0);
  return {
    tag, days: Object.fromEntries(ZS.map((z) => [z, last[z] ? last[z].day : null])),
    crossed: { arriveOut: sum((x) => x.st.crossArrive), returnOut: sum((x) => x.st.crossReturn), soldOk: sum((x) => x.st.soldOk), deposited: sum((x) => x.st.deposited), lost: sum((x) => x.st.lost),
      bodyOut: sum((x) => x.st.bodyOut), bodyIn: sum((x) => x.st.bodyIn), bodyInSkip: sum((x) => x.st.bodyInSkip), sentFail: sum((x) => x.st.sentFail), bounced: sum((x) => x.st.bounced), retried: sum((x) => x.st.retried), dup: sum((x) => x.st.dup) },
    t952: Object.fromEntries(ZS.map((z) => [z, last[z] ? last[z].t952 : null])),
    bodies: BOD,
    lag: { dueMinusSend: lag, recvNowMinusSend: recv, late },
    stuck,
    final: Object.fromEntries(ZS.map((z) => [z, last[z] ? { pop: last[z].pop, dead: last[z].dead, ever: last[z].ever, deaths: last[z].deaths, fdDeaths: last[z].fdDeaths, trades: last[z].trades, skip: ROWS[z].reduce((a, r) => a + (r.skip || 0), 0) } : null])),
    cpu,
  };
}
