#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1320 자 · 제품 무변)
// === scripts/t1320-xz-vclock.js — **가상 시계 두 존 판**: central + 존 둘(또는 하나)을 T745 가상 시계 + 발맞춤(`t1320-lockstep.js`)으로 돌린다 ===
//
// ★왜 [T1320 · T1311 회부 3] 두 존 실서버 판(`t533-xzone-server.js run`)은 벽시계 판이라 같은 씨에서 경계 넘김이 몇 배 흔들렸다(상자 붐빔이면 걸음표가 30날 안에 안 서기도).
//   이 러너는 존마다 T745 가상 시계를 걸고, 모든 존이 가로대 H 에 서고 존 사이 HTTP 가 다 건너왔을 때만 H += Q 로 민다(아래 `go`) ⇒ 같은 씨 = 같은 판.
//   존 줄(`rows_<표지>_<존>.jsonl`)은 T533 훅 그대로(`T533_HOOK=zone` — 여덟 수 + 경계 셈 `xz.st`) · 골짜기 걸음은 T1311 훅(`pass_<표지>_<존>.steps.json` · 바위 위 걸음 `rockAt`).
//
//   run <outdir> <표지> <씨> [날=30] [하루ms=3000] [--zones hanbando,nippon] [--q 500] [--env K=V,…]
//       → 두 존이 모두 <날> 에 닿으면 끝 · meta_<표지>.json(가로대 수 · 벽시계 초 · 날) · 줄마다 날 지문은 `same` 이 잰다
//   same <outdir> <표지1> <표지2> — 두 판의 존 줄(날마다 여덟 수 + 경계 셈)과 걸음 누계(두 판이 다 가진 마지막 날 낱장)가 같은가(결정성)
//   routes <교역로 캐시 json> [존] — 정적: 캐시 교역로를 손잡이 끔 ↔ 켬(`_t1320Chain`)으로 짚어 막힌 칸 걸음 · 길이 비 · 잇기 실패
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020, 3021);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const [MODE, ...A] = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const pos = A.filter((x, i) => !x.startsWith('--') && !(i > 0 && A[i - 1].startsWith('--')));
const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

if (MODE === 'run') {
  const { spawn } = require('child_process');
  const [OUTD, TAG, SEEDS, DAYSS = '30', DMS = '3000'] = pos;
  const SEED = parseInt(SEEDS, 10), DAYS = parseInt(DAYSS, 10), DAY_MS = parseInt(DMS, 10);
  const ZS = String(opt('--zones', 'hanbando,nippon')).split(',').filter(Boolean);
  const Q = parseInt(opt('--q', '500'), 10);
  const EXTRA = {}; for (const kv of String(opt('--env', '')).split(',').filter(Boolean)) { const i = kv.indexOf('='); EXTRA[kv.slice(0, i)] = kv.slice(i + 1); }
  fs.mkdirSync(OUTD, { recursive: true });
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const CP = 3010;
  const PORTS = { [CP]: 'central' }; for (const z of Object.keys(ZONES)) if (ZONES[z] && ZONES[z].port) PORTS[ZONES[z].port] = z;
  const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
  const cdb = path.join(OUTD, `c_${TAG}.db`); rmdb(cdb);
  const c = spawn(process.execPath, [path.join(ROOT, 'server', 'central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(',') }) });
  const Z = {};
  const pre = [path.join(__dirname, 't745-vclock.js'), path.join(__dirname, 't1320-lockstep.js'), path.join(__dirname, 't533-xzone-server.js'), path.join(__dirname, 't1311-seam-walk.js')];
  for (const z of ZS) {
    const zdb = path.join(OUTD, `z_${TAG}_${z}.db`); rmdb(zdb);
    const rows = path.join(OUTD, `rows_${TAG}_${z}.jsonl`); try { fs.unlinkSync(rows); } catch (e) {}
    try { fs.unlinkSync(path.join(OUTD, `pass_${TAG}_${z}.jsonl`)); fs.unlinkSync(path.join(OUTD, `pass_${TAG}_${z}.steps.json`)); } catch (e) {}
    const env = Object.assign({}, process.env, { PORT: String(ZONES[z].port), ZONE_ID: z, CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','),
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), T533_HOOK: 'zone', T533_SEED: String(SEED), T533_ROWS: rows,
      T745_VCLOCK: '1', T577_SEED: String(SEED), T745_LOCKSTEP: '1', T1320_PORTS: JSON.stringify(PORTS), T1311_OUT_DIR: OUTD, T1311_TAG: TAG,
      T525_CROSS_ZONE: ZS.length > 1 ? '1' : '' }, EXTRA);
    if (!env.T525_CROSS_ZONE) delete env.T525_CROSS_ZONE;
    const logf = fs.openSync(path.join(OUTD, `z_${TAG}_${z}.log`), 'w');
    const p = spawn(process.execPath, pre.flatMap((f) => ['-r', f]).concat([path.join(ROOT, 'server', 'zone.js')]), { cwd: ROOT, stdio: ['ignore', logf, logf, 'ipc'], env });
    Z[z] = { p, rows, st: null, started: false };
    p.on('message', (m) => { if (!m || !m.zone) return; const o = Z[m.zone]; if (m.t === 'start') o.started = true; o.st = m; o.at = (m.t === 'at' || (m.t === 'upd' && o.at)); tryGo(); });
  }
  let H = null, bars = 0;
  function balanced() {
    for (const a of ZS) { const ca = Z[a].st.cnt;
      if ((ca.reqSent.central || 0) !== (ca.resRecv.central || 0)) return false;
      for (const b of ZS) { if (a === b) continue; const cb = Z[b].st.cnt;
        if ((ca.reqSent[b] || 0) !== (cb.reqRecv[a] || 0)) return false;
        if ((cb.resSent[a] || 0) !== (ca.resRecv[b] || 0)) return false; } }
    return true;
  }
  function tryGo() {
    if (!ZS.every((z) => Z[z].started && Z[z].st && Z[z].at)) return;
    if (!balanced()) return;
    H = (H == null ? Math.max(...ZS.map((z) => Z[z].st.V)) : H) + Q; bars++;
    for (const z of ZS) { Z[z].at = false; try { Z[z].p.send({ t: 'go', H }); } catch (e) {} }
  }
  const meta = { tag: TAG, seed: SEED, DAYS, DAY_MS, Q, zones: ZS, env: EXTRA, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version } };
  const lastDay = (f) => { try { const L = fs.readFileSync(f, 'utf8').trim().split('\n'); return L.length && L[0] ? JSON.parse(L[L.length - 1]).day : -1; } catch (e) { return -1; } };
  const kill = () => { for (const z of ZS) { try { Z[z].p.kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {} };
  process.on('SIGTERM', () => { kill(); process.exit(3); });
  const t0 = Date.now();
  const STF = path.join(OUTD, `status_${TAG}.json`);
  setInterval(() => { try { fs.writeFileSync(STF, JSON.stringify({ wallS: Math.round((Date.now() - t0) / 1000), bars, H, zones: Object.fromEntries(ZS.map((z) => [z, { started: Z[z].started, at: Z[z].at, st: Z[z].st }])) }, null, 1)); } catch (e) {} }, 5000).unref();
  const iv = setInterval(() => {
    const dd = Object.fromEntries(ZS.map((z) => [z, lastDay(Z[z].rows)]));
    const dead = ZS.filter((z) => Z[z].p.exitCode != null);
    if (dead.length || ZS.every((z) => dd[z] >= DAYS) || Date.now() - t0 > (parseInt(opt('--limit', '5400'), 10)) * 1000) {
      clearInterval(iv);
      Object.assign(meta, { end: new Date().toISOString(), wallS: Math.round((Date.now() - t0) / 1000), days: dd, bars, H, done: ZS.every((z) => dd[z] >= DAYS), dead });
      fs.writeFileSync(path.join(OUTD, `meta_${TAG}.json`), JSON.stringify(meta, null, 1));
      say(`[${TAG}] 끝 · 날 ${JSON.stringify(dd)} · 가로대 ${bars} · 벽시계 ${meta.wallS}초${dead.length ? ' · ⚠죽은 존 ' + dead : ''}`);
      kill(); setTimeout(() => process.exit(0), 500);
    }
  }, 2000);
  return;
}

if (MODE === 'same') {
  const [D, T1, T2] = pos;
  const zs = (t) => JSON.parse(fs.readFileSync(path.join(D, `meta_${t}.json`), 'utf8')).zones;
  const rows = (t, z, n) => { try { return fs.readFileSync(path.join(D, `rows_${t}_${z}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.day <= n); } catch (e) { return []; } };
  const n = Math.min(JSON.parse(fs.readFileSync(path.join(D, `meta_${T1}.json`), 'utf8')).DAYS, JSON.parse(fs.readFileSync(path.join(D, `meta_${T2}.json`), 'utf8')).DAYS);
  const key = (r) => JSON.stringify([r.day, r.pop, r.dead, r.weapQ, r.expand, r.reqOpened, r.toolQ, r.preserve, r.grain, r.trades, r.caravans, r.bodies, r.xz && r.xz.st]);
  let same = true;
  for (const z of zs(T1)) {
    const a = rows(T1, z, n), b = rows(T2, z, n);
    let first = null; const m = Math.min(a.length, b.length);
    for (let i = 0; i < m; i++) if (key(a[i]) !== key(b[i])) { first = a[i].day; break; }
    const ha = crypto.createHash('sha1').update(a.map(key).join('\n')).digest('hex').slice(0, 12), hb = crypto.createHash('sha1').update(b.map(key).join('\n')).digest('hex').slice(0, 12);
    const ok = first == null && a.length === b.length && a.length > 0;
    if (!ok) same = false;
    // 걸음 누계는 두 판이 다 가진 마지막 날의 낱장끼리(끝낸 순간은 벽시계라 마지막 낱장 날이 하루 갈릴 수 있다) · 낱장 칸 수가 다르면(훅 판 차) 앞 9칸만
    const dl = (t) => { try { return (JSON.parse(fs.readFileSync(path.join(D, `pass_${t}_${z}.steps.json`), 'utf8')).daily || []).filter((r) => r[0] <= n); } catch (e) { return null; } };
    const da = dl(T1), db = dl(T2);
    let sa = '-', sb = '-';
    if (da && db && da.length && db.length) { const dd = Math.min(da[da.length - 1][0], db[db.length - 1][0]); let ra = da.find((r) => r[0] === dd), rb = db.find((r) => r[0] === dd);
      if (ra && rb && ra.length !== rb.length) { ra = ra.slice(0, 9); rb = rb.slice(0, 9); } sa = JSON.stringify(ra || null); sb = JSON.stringify(rb || null); }
    if (sa !== sb) same = false;
    console.log(`${z}: 날 줄 ${a.length} ↔ ${b.length} · 지문 ${ha} ↔ ${hb} · ${ok ? '같음' : `첫 갈림 날 ${first}`} · 걸음 누계[날 · 골짜기 걸음 · 바위 · 쇠재 · 한재 · 전체 걸음 · 바위 · 세움 · 세움 바위] ${sa} ↔ ${sb}`);
  }
  console.log(same ? '=== 같음 ===' : '=== 다름 ===');
  process.exit(same ? 0 : 1);
}
if (MODE === 'routes') {
  // routes <교역로 캐시 json> [존=hanbando] — 정적: 캐시 교역로(코스 꺾은 줄)를 8px 마다 짚어 막힌 칸(존 걸음 정본 꼴 — 바위 · 물(다리 예외)) 걸음을
  //   손잡이 끔(캐시 줄 그대로) ↔ 켬(`setBodyPts` 문 = `_t1320Chain`)으로 센다 · 길이 비 · 잇기 실패(건널목 · 굴) 수. 환호 도랑(판 중 생김)은 정적 판에 없다.
  process.env.T1320_ROCK_PATH = '1';
  const [CF, Z = 'hanbando'] = pos;
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const TT = require(path.join(ROOT, 'server', 'terrain')); TT.setZonesMeta(ZONES);
  const V = require(path.join(ROOT, 'server', 'villages'));
  const P = V.__labProbe._caravanBodyProbe, S = V.__p3Bind({}).state, CELL = 32, BR = new Set();
  { const bl = ZONES[Z].bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + '_' + bl[i + 1]); }
  const blk = (x, y) => { const tx = Math.floor(x / CELL), ty = Math.floor(y / CELL), cx = tx * CELL + 16, cy = ty * CELL + 16; return TT.isRockCellLocal(Z, cx, cy) || (TT.isWaterCellLocal(Z, cx, cy) && !BR.has(tx + '_' + ty)); };
  Object.assign(S, { deps: { players: new Map(), isBlockedByWall: () => false, isTerrainBlockedLocal: blk } });
  const walk = (pts) => { let n = 0, b = 0, L = 0; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], c = pts[i], d = Math.hypot(c.x - a.x, c.y - a.y); L += d; const k = Math.max(1, Math.ceil(d / 8));
    for (let q = 1; q <= k; q++) { n++; if (blk(a.x + (c.x - a.x) * q / k, a.y + (c.y - a.y) * q / k)) b++; } } return { n, b, L }; };
  const A = { n: 0, b: 0, L: 0, r: 0, rb: 0 }, B = { n: 0, b: 0, L: 0, rb: 0 }, ratios = [], worst = [];
  for (const [k, pts] of JSON.parse(fs.readFileSync(CF, 'utf8'))) {
    if (!pts || pts.length < 2) continue;
    const o = walk(pts), body = { pid: 'm', escorts: [] }; P.pts(body, pts.map((q) => ({ x: q.x, y: q.y }))); const w = walk(body.pts);
    A.n += o.n; A.b += o.b; A.L += o.L; A.r++; if (o.b) A.rb++; B.n += w.n; B.b += w.b; B.L += w.L; if (w.b) { B.rb++; worst.push([k, w.b]); } ratios.push(w.L / o.L);
  }
  ratios.sort((a, b) => a - b); const q = (x) => ratios[Math.floor(x * (ratios.length - 1))].toFixed(4);
  worst.sort((a, b) => b[1] - a[1]);
  console.log(JSON.stringify({ zone: Z, routes: A.r, off: { blockedSteps: A.b, steps: A.n, routesBlocked: A.rb }, on: { blockedSteps: B.b, steps: B.n, routesBlocked: B.rb },
    lenRatio: { p50: q(0.5), p90: q(0.9), max: q(1), total: (B.L / A.L).toFixed(4) }, stat: V.t1320Stat(), worstOn: worst.slice(0, 10) }));
  process.exit(0);
}
console.error('쓰는 법: run <outdir> <표지> <씨> [날] [하루ms] [--zones a,b] [--q ms] [--env K=V,…] · same <outdir> <표지1> <표지2> · routes <교역로 캐시 json> [존]');
process.exit(2);
