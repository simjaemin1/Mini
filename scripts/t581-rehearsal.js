#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T581 자)
// =============================================================================
// T581 — 초기화 리허설: 두 존(한반도 + 닛폰)을 **새 세계**로 실서버 그대로 400일 같이 돌려 한 장부에 적는다.
//   **계측기다 — 제품 코드는 한 글자도 안 만진다.** T533 자(`t533-xzone-server.js`) 위에 얹는다:
//     · 존 프로세스에 `-r t533-xzone-server.js`(여덟 수 · 경계 수 · 씨 = 두 존 `villageSeed`) 와 `-r t581-rehearsal.js`(아래 칸들)를
//       **둘 다** 물린다(T514 적재 순간 한 줄 문법 — villages.js 뒤에 `state`·`_probe`·`_tickPerf` 를 읽는 창 한 줄 · 동작 0).
//     · 판 = central + hanbando + nippon(zone-config 포트 그대로) · 빈 DB · 손님 0 · 손잡이는 **제품 기본 그대로**
//       (달력 `T570_CALENDAR` 켬 · 겹침 거르기 `T569_OVERLAP` 켬 · 도적 켬 · 보호기 365 · 조각 예산 16ms — 아무것도 안 세운다).
//       경계 교역 팔 `T525_CROSS_ZONE` 은 제품 기본이 끔이다 — `--xzone on` 일 때만 켠다(표에 팔을 적는다).
//
//   run   <씨> <마을하루ms> <날> <outdir> [--xzone on|off] [--snap 30,100,200,400] [--port-off N] [--resume]
//         하루 경계마다 존마다 한 줄씩 두 파일: `rows_<표지>_<존>.jsonl`(T533 칸) · `t581_<표지>_<존>.jsonl`(이 자의 칸)
//         `--port-off` = 판 여럿을 나란히 돌릴 때 이 판의 포트를 민다(central·존 모두 같은 표 — 위 `portOffset` · 0 = zone-config 그대로)
//         `--snap` 날에 존 DB 를 백업(`snap/<표지>_<존>_d<날>.db` · better-sqlite3 backup — 도는 존을 안 멈춘다)
//   maps  <outdir> [표지…]       — 백업 DB 마다 `scripts/t568-live-map.py`(T568_DIR) → 두 존을 한 장으로 `산그림/T581_리허설_<씨>_<날>.png`
//   table <outdir> [md]          — 씨 × 존 × (100·200·365·400일) 한 장 표 + 문턱 ✗(`table.json` · md)
//
//   이 자의 칸(존마다 · 하루마다): 날짜 글자(`calendar.dateOf(world.day)` — 새 세계 econ 날 0 = 1년 3월 1일) · 빈 마을 · 해체(`_banditized` 선 마을 — 연표 `DISSOLVED` 의 그 에지)
//     · 빔(연표 `EMPTIED` 그 에지 — 사람이 있다가 0) · 마을당 인구 최저/중앙 · 영토 셀 · **겹친 셀(남의 `_terrSet` 과 같은 키)**
//     · 집터 탐색/성공/사유별 거부(누계 `_probe.siteReason` — 셀 단위) · 집(`_houseCells`) · 길 셀(밟힘·등급·다져짐)
//     · 성능: 마을 하루 ms(`_tickPerf` 그날 work) · 틱 ms(`/perf?reset=1` 의 `tick.ms` — 그날 창) · 루프 지연 · 힙(그날 최고) · DB 크기
//   문턱(새 수 0 · 판정 0 — 이미 있는 수): 빈 마을 > 0 · 겹침 > 0 · 그날 집터 거부 > 그날 지은 집 · 틱 p95 > 조각 예산(`/perf sliceMs`)
//     · 힙 최고 > 기본 힙 한도(`NODE_OPTIONS` 없는 `v8 heap_size_limit` — 존 프로세스가 적는다)
//   ⚠실서버라 판마다 벽시계에 흔들린다(T533 §0 그 문법). 마을 하루가 마감을 못 끝내면 econ 날이 건너뛴다(T533 `skip`).
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const HOOK = process.env.T581_HOOK || '';
const VJS = path.join('server', 'villages.js');
const EJS = path.join('sim', 'economy-sim.js');   // ★[T644] econ v1(소비 기록 `_cons` 가 사는 곳)
const WOOD = process.env.T581_WOOD === '1';

let _isMain = true; try { _isMain = require('worker_threads').isMainThread; } catch (e) {}
if (HOOK === 'zone' && !_isMain) {
  // 걸음표 워커는 아무것도 안 한다
} else if (HOOK === 'zone') {
  portOffset();
  zoneHook();
} else if (HOOK === 'central') {
  portOffset();
}   // 바깥 판(main)은 파일 끝에서 — 아래 상수가 선 뒤

// ── 표지 칸 — 판 여럿을 한 컨테이너에서 나란히 돌릴 때만(`T581_PORT_OFF` > 0): 이 판의 프로세스가 모두 zone-config 포트를
//   같은 수만큼 민 표를 본다(central 의 /health · 존 사이 문이 남의 판으로 새지 않게). 0 이면 zone-config 그대로(T533 판과 같다).
function portOffset() {
  const OFF = parseInt(process.env.T581_PORT_OFF || '0', 10);
  if (!(OFF > 0)) return;
  const Module = require('module');
  const want = path.join(ROOT, 'server/zone-config.js');
  const _load = Module._load;
  let done = false;
  Module._load = function (req, parent, isMain) {
    const m = _load.apply(this, arguments);
    if (!done) { let f = null; try { f = Module._resolveFilename(req, parent, isMain); } catch (e) {} if (f === want) { done = true; if (m.ZONES) for (const z of Object.values(m.ZONES)) if (z && z.port) z.port += OFF; } }
    return m;
  };
}

// ── 존 안 — 창 한 줄 + 하루 경계마다 한 줄 ─────────────────────────────────────────────
function zoneHook() {
  const Module = require('module');
  const _compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(VJS)) content += '\n;globalThis.__t581w = function () { return { state, probe: _probe, tp: _tickPerf }; };\n';
    //   ★[T644] 통나무 장부(`T581_WOOD=1` 일 때만) — econ 소비 기록 함수 `_cons` 를 같은 자리에서 감싼다(값은 그대로 넘긴다 · 동작 0).
    //     통나무를 쓴 자리 = 부른 함수:줄(econ 안이면 그 줄 · `actFromGranary` 면 그것을 부른 생활층 함수까지) — 마을 `_t644Day` 에 그날 합.
    if (WOOD && filename.endsWith(EJS)) content += '\n;(function () { const _o = _cons; _cons = function (v, r, amt) { if (r === \'wood\' && amt > 0 && v) { try { const L = String(new Error().stack || \'\').split(\'\\n\'); const fr = (i) => { const m = /at (?:Object\\.)?([^ ]+) \\(.*[\\\\/]([^\\\\/]+):(\\d+):\\d+\\)/.exec(L[i] || \'\'); return m ? m[1] + \':\' + m[2].replace(/\\.js$/, \'\') + \':\' + m[3] : \'?\'; }; let k = fr(2); if (/^actFromGranary:/.test(k)) k = \'actFromGranary<\' + fr(3).split(\':\')[0]; const d = v._t644Day || (v._t644Day = {}); d[k] = (d[k] || 0) + amt; } catch (e) {} } return _o(v, r, amt); }; })();\n';
    return _compile.call(this, content, filename);
  };
  const OUTF = process.env.T581_ROWS;
  const WOODF = process.env.T581_WOOD_ROWS;   // ★[T644] 마을마다 하루 한 줄(통나무 장부)
  const PORT = process.env.PORT;
  const DBP = process.env.DB_PATH;
  const v8 = require('v8');
  const HEAP_LIMIT = v8.getHeapStatistics().heap_size_limit;
  let Cal = null, Roads = null, Door = null;
  let lastDay = null, heapMax = 0, rssMax = 0, prevSite = null, prevHouses = null;
  const sizeOf = (f) => { let s = 0; for (const x of ['', '-wal']) { try { s += fs.statSync(f + x).size; } catch (e) {} } return s; };
  const perf = () => new Promise((res) => {
    try {
      const h = {}; if (Door && Door.SECRET_SET) h[Door.HEADER] = String(process.env.CENTRAL_SECRET || '').trim();
      const rq = require('http').get({ host: '127.0.0.1', port: PORT, path: '/perf?reset=1', headers: h, timeout: 5000 }, (r) => {
        let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } });
      });
      rq.on('error', () => res(null)); rq.on('timeout', () => { try { rq.destroy(); } catch (e) {} res(null); });
    } catch (e) { res(null); }
  });
  const _iv = setInterval(() => {
    const m = process.memoryUsage(); if (m.heapUsed > heapMax) heapMax = m.heapUsed; if (m.rss > rssMax) rssMax = m.rss;
    const W = globalThis.__t581w && globalThis.__t581w();
    const st = W && W.state;
    if (!st || !st.ready || !st.world || st.tickJobs) return;   // 마감 중엔 안 센다(T533 과 같은 문)
    const w = st.world;
    if (w.day === lastDay) return;
    lastDay = w.day;
    if (!Cal) { try { Cal = require(path.join(ROOT, 'server/calendar.js')); } catch (e) {} }
    if (!Roads) { try { Roads = require(path.join(ROOT, 'server/roads.js')); } catch (e) {} }
    if (!Door) { try { Door = require(path.join(ROOT, 'server/internal-door.js')); } catch (e) {} }
    // 마을 — 서버 마을(영토·집) + econ 인구
    const vs = st.villages || [];
    const pops = [], own = new Map();
    let empty = 0, banditized = 0, emptied = 0, terr = 0, houses = 0, bSites = 0, bAdv = 0, bStall = 0, bNoTrip = 0, wood0 = 0, woodSum = 0;
    for (const v of vs) {
      const e = v.econ; const n = e && e.npcs ? e.npcs.length : 0;
      pops.push(n);
      if (n <= 0) empty++;
      if (e && e._banditized) banditized++;
      if (e && e.storage) { const wd = e.storage.wood || 0; woodSum += wd; if (wd < 1) wood0++; }   // 곳간 통나무(T581 §3-2 · T627 ② 맞춤 칸)
      if (e && e._everPop && n <= 0) emptied++;
      if (v._terrSet) { terr += v._terrSet.size; for (const k of v._terrSet) own.set(k, (own.get(k) || 0) + 1); }
      houses += (v._houseCells || []).length;
      if (v._site) bSites++;
      const bd = v._t400Dbg; if (bd && bd.crew) { bAdv += bd.adv || 0; if (bd.stall) bStall++; if (!(bd.perTrip > 0)) bNoTrip++; }
    }
    if (WOOD && WOODF) {   // ★[T644] 통나무 장부 — 곳간 · 직업 생산(총 · 세 전) · 생활층 나무꾼 입고 · 쓴 자리별 · 나무꾼 수 · 인구 · 집 · 집터
      const out = [];
      for (const v of vs) { const e = v.econ; if (!e || !e.storage) continue;
        const pb = e.dailyProductionBuf || {};
        out.push({ v: v.name, n: e.npcs ? e.npcs.length : 0, wood: +(e.storage.wood || 0).toFixed(2), prod: +(pb.wood || 0).toFixed(3), act: +(e._t325InflowToday || 0).toFixed(3),
          cons: e._t644Day || {}, lj: (e.counts && e.counts.lumberjack) || 0, land: e.land ? +(e.land.wood || 0).toFixed(3) : null, housing: e.housing != null ? +(+e.housing).toFixed(2) : null,
          houses: (v._houseCells || []).length, site: v._site ? (v._t400Dbg && v._t400Dbg.stall ? 'stall' : 'build') : null, food: +((e.storage.food || 0)).toFixed(1),
          bdt: e._banditized ? 1 : 0, born: e._bornDay != null ? e._bornDay : null });
        e._t644Day = {}; }
      try { fs.appendFileSync(WOODF, JSON.stringify({ zone: st.zoneId, day: w.day, vils: out }) + '\n'); } catch (e) {}
    }
    let over = 0; for (const c of own.values()) if (c >= 2) over++;
    pops.sort((a, b) => a - b);
    const P = W.probe || {};
    const site = { call: P.siteCall || 0, hit: P.siteHit || 0, reason: Object.assign({}, P.siteReason || {}) };
    const dSite = prevSite ? { call: site.call - prevSite.call, hit: site.hit - prevSite.hit } : null;
    const dHouses = prevHouses != null ? houses - prevHouses : null;
    prevSite = site; prevHouses = houses;
    const tpl = W.tp && W.tp.last && W.tp.last.day === w.day ? W.tp.last : (W.tp && W.tp.last) || null;
    let roads = null; try { const S = Roads && Roads._S; if (S && S.ready) roads = { cells: S.cells.size, graded: (Roads.clientRoads() || []).length / 3, paved: S.paved ? S.paved.size : 0 }; } catch (e) {}
    const g = st.lastGameDay;
    //   날짜 = econ 날(`world.day` — 새 세계는 0 = 1년 3월 1일). `lastGameDay` 는 존 시계의 절대 게임일(epoch 기점)이라 새 세계의 날이 아니다.
    let date = null; try { const t = Cal.dateOf(w.day); date = `${t.year}년 ${t.month}월 ${t.dom}일`; } catch (e) {}
    const X = st.xzone;
    const row = { zone: st.zoneId, day: w.day, g, date, t: Date.now(),
      vils: vs.length, empty, banditized, emptied, popMin: pops.length ? pops[0] : 0, popMed: pops.length ? pops[pops.length >> 1] : 0, popMax: pops.length ? pops[pops.length - 1] : 0,
      terr, over, houses, dHouses, site, dSite, roads,
      build: { sites: bSites, adv: bAdv, stall: bStall, noTrip: bNoTrip }, wood0, wood: +woodSum.toFixed(1),
      trip: P.tripCalls != null ? { calls: P.tripCalls, fill: P.tripFill } : null,   // ★[T627] 운영 하루로 센 몫 — 판 시계보다 더 준 왕복(채운 왕복 · 켬 판에만 오른다)   // 집 행위(T400 `_t400Dbg`) — 집터 · 오늘 오른 단계 · 곳간 빔 · 걸음 0(하루 낮에 왕복 하나도 못 함)
      xz: X ? { sold: X.st.soldOk, crossArrive: X.st.crossArrive, bodyOut: X.st.bodyOut, bodyIn: X.st.bodyIn } : null,
      dayMs: tpl ? { work: +(+tpl.total || 0).toFixed(1), wall: tpl.wall, frames: tpl.frames, frameMax: tpl.frameMax } : null,
      heapMax, rssMax, heapLimit: HEAP_LIMIT, db: DBP ? sizeOf(DBP) : null };
    heapMax = 0; rssMax = 0;
    perf().then((p) => {
      if (p) { row.tickMs = p.tick && p.tick.ms ? p.tick.ms : null; row.lagPct = p.tick ? p.tick.lagPct : null; row.loop = p.loop ? { p95: p.loop.p95, max: p.loop.max } : null; row.sliceMs = p.sliceMs; }
      if (OUTF) try { fs.appendFileSync(OUTF, JSON.stringify(row) + '\n'); } catch (e) {}
    });
  }, 200);
  if (_iv.unref) _iv.unref();
}

// ── 바깥 — 판 · 그림 · 표 ─────────────────────────────────────────────────────────────
const ZS = ['hanbando', 'nippon'];
const CHECK_DAYS = [100, 200, 365, 400];
function readRows(f) { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } }
function opt(A, k, d) { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; }

function main() {
  const [MODE, ...A] = process.argv.slice(2);
  if (MODE === 'run') return run(A);
  if (MODE === 'maps') return maps(A[0], A.slice(1));
  if (MODE === 'table') return table(A[0], A[1] === 'md');
  console.error('쓰는 법: run <씨> <마을하루ms> <날> <outdir> [--xzone on|off] [--snap 30,100,200,400] · maps <outdir> [표지…] · table <outdir> [md]');
  process.exit(2);
}

function run(A) {
  const { spawn } = require('child_process');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const say = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
  const rmf = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
  const { ZONES } = require(path.join(ROOT, 'server/zone-config'));
  const [SEEDS, DMS, DAYSS, OUTD] = A;
  const SEED = parseInt(SEEDS, 10), DAY_MS = parseInt(DMS, 10), DAYS = parseInt(DAYSS, 10);
  const XZ = opt(A, '--xzone', 'off');
  const SNAP = String(opt(A, '--snap', '30,100,200,400')).split(',').map(Number).filter((x) => x > 0);
  if (!(SEED > 0) || !(DAY_MS > 0) || !(DAYS > 0) || !OUTD || !/^(on|off)$/.test(XZ)) { console.error('쓰는 법: run <씨> <마을하루ms> <날> <outdir> [--xzone on|off] [--snap …]'); process.exit(2); }
  fs.mkdirSync(path.join(OUTD, 'snap'), { recursive: true });
  const OFF = parseInt(opt(A, '--port-off', '0'), 10) || 0;
  const tag = `s${SEED}_${XZ}`, CP = 3010 + OFF;
  const RESUME = A.includes('--resume');   // 컨테이너가 판 도중 죽었을 때 — 같은 DB·같은 줄 파일에 이어 돈다(존 부팅 복원 = 운영 재시작과 같은 길 · meta 에 적는다)
  const cdb = path.join(OUTD, `c_${tag}.db`); if (!RESUME) rmf(cdb);
  const c = spawn(process.execPath, ['-r', __filename, path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: ZS.join(','), T581_HOOK: 'central', T581_PORT_OFF: String(OFF) }) });
  const Z = {};
  for (const z of ZS) {
    const zdb = path.join(OUTD, `z_${tag}_${z}.db`); if (!RESUME) rmf(zdb);
    const rows = path.join(OUTD, `rows_${tag}_${z}.jsonl`), mine = path.join(OUTD, `t581_${tag}_${z}.jsonl`);
    if (!RESUME) for (const f of [rows, mine]) { try { fs.unlinkSync(f); } catch (e) {} }
    const env = Object.assign({}, process.env, { PORT: String(ZONES[z].port + OFF), ZONE_ID: z, T581_PORT_OFF: String(OFF), CENTRAL_URL: `http://localhost:${CP}`, ENABLED_ZONES: ZS.join(','),
      DB_PATH: zdb, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS),
      T533_HOOK: 'zone', T533_SEED: String(SEED), T533_ROWS: rows, T581_HOOK: 'zone', T581_ROWS: mine, T581_WOOD_ROWS: path.join(OUTD, `wood_${tag}_${z}.jsonl`) });
    if (XZ === 'on') env.T525_CROSS_ZONE = '1'; else delete env.T525_CROSS_ZONE;
    delete env.NODE_OPTIONS;   // 힙 문턱 = 기본 한도 — 판도 기본으로 돈다
    const logf = fs.openSync(path.join(OUTD, `z_${tag}_${z}.log`), RESUME ? 'a' : 'w');
    Z[z] = { zdb, rows, mine, snapped: new Set(SNAP.filter((d) => fs.existsSync(path.join(OUTD, 'snap', `${tag}_${z}_d${d}.db`)))), p: spawn(process.execPath, ['-r', path.join(__dirname, 't533-xzone-server.js'), '-r', __filename, path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf], env }) };
  }
  let prevMeta = null; if (RESUME) { try { prevMeta = JSON.parse(fs.readFileSync(path.join(OUTD, `meta_${tag}.json`), 'utf8')); } catch (e) {} }
  const meta = { tag, seed: SEED, xzone: XZ, DAY_MS, DAYS, snap: SNAP, portOff: OFF, knobs: Object.fromEntries(Object.entries(process.env).filter(([k]) => /^T\d{3}_/.test(k))), resumes: prevMeta ? [...(prevMeta.resumes || []), { at: new Date().toISOString(), from: prevMeta.days || null }] : [], start0: prevMeta ? (prevMeta.start0 || prevMeta.start) : undefined, start: new Date().toISOString(), host: { cpus: require('os').cpus().length, node: process.version, mem: require('os').totalmem() } };
  try { meta.head = require('child_process').execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch (e) {}
  fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
  const kill = async () => { for (const z of ZS) { try { Z[z].p.kill('SIGINT'); } catch (e) {} } await sleep(4000); for (const z of ZS) { try { Z[z].p.kill('SIGKILL'); } catch (e) {} } try { c.kill('SIGKILL'); } catch (e) {} await sleep(500); };
  process.on('SIGTERM', async () => { await kill(); process.exit(3); });
  const Database = require('better-sqlite3');
  const snapshot = async (z, d) => {
    const dst = path.join(OUTD, 'snap', `${tag}_${z}_d${d}.db`); rmf(dst);
    try { const db = new Database(Z[z].zdb, { readonly: true, fileMustExist: true }); await db.backup(dst); db.close(); say(`[${tag}] ${z} d${d} 백업`); } catch (e) { say(`[${tag}] ${z} d${d} 백업 실패 ${e.message}`); }
  };
  (async () => {
    const t0 = Date.now();
    const LIM = t0 + (DAYS + 10) * DAY_MS * 4 + 30 * 60000;
    const lastDay = (f) => { const R = readRows(f); return R.length ? R[R.length - 1].day : -1; };
    let dd = {};
    while (Date.now() < LIM) {
      await sleep(Math.max(1000, Math.min(10000, DAY_MS / 2)));
      if (ZS.some((z) => Z[z].p.exitCode != null)) { say(`[${tag}] ⚠존이 죽었다`); break; }
      dd = Object.fromEntries(ZS.map((z) => [z, lastDay(Z[z].mine)]));
      for (const z of ZS) for (const d of SNAP) if (dd[z] >= d && !Z[z].snapped.has(d)) { Z[z].snapped.add(d); await snapshot(z, d); }
      if (ZS.every((z) => dd[z] >= DAYS)) break;
    }
    meta.end = new Date().toISOString(); meta.wallS = +((Date.now() - t0) / 1000).toFixed(0); meta.days = dd; meta.done = ZS.every((z) => dd[z] >= DAYS);
    fs.writeFileSync(path.join(OUTD, `meta_${tag}.json`), JSON.stringify(meta, null, 1));
    say(`[${tag}] 끝 · 날 ${JSON.stringify(dd)} · 벽시계 ${meta.wallS}초`);
    await kill();
    process.exit(0);
  })();
}

// ── 그림 — T568 자를 백업 DB 에(T568_DIR) · 두 존 한 장 ──────────────────────────────────
function maps(OUTD, tags) {
  const { execFileSync } = require('child_process');
  const T524 = process.env.T581_T524 || path.join(OUTD, 't524');
  const FIG = path.join(ROOT, '산그림');
  const snaps = fs.readdirSync(path.join(OUTD, 'snap')).filter((f) => /\.db$/.test(f)).map((f) => { const m = /^(.+)_(hanbando|nippon)_d(\d+)\.db$/.exec(f); return m ? { f, tag: m[1], zone: m[2], day: +m[3] } : null; }).filter(Boolean)
    .filter((s) => !tags.length || tags.includes(s.tag));
  const groups = {};
  for (const s of snaps) { const k = `${s.tag}|${s.day}`; (groups[k] = groups[k] || []).push(s); }
  for (const k of Object.keys(groups).sort()) {
    const outs = [];
    for (const s of groups[k].sort((a, b) => a.zone.localeCompare(b.zone))) {
      const D = path.join(OUTD, 'map', `${s.tag}_${s.zone}_d${s.day}`);
      fs.mkdirSync(path.join(D, 't524'), { recursive: true });
      // T568 자는 `t524/hanbando.json` · `live.db` 를 읽는다 — 존의 표를 그 이름으로 둔다(자 무변)
      fs.copyFileSync(path.join(T524, `${s.zone}.json`), path.join(D, 't524', 'hanbando.json'));
      fs.copyFileSync(path.join(OUTD, 'snap', s.f), path.join(D, 'live.db'));
      try { execFileSync('python3', [path.join(__dirname, 't568-live-map.py')], { env: Object.assign({}, process.env, { T568_DIR: D }), stdio: 'pipe' }); outs.push({ zone: s.zone, png: path.join(D, 'overview.png'), stats: path.join(D, 'stats.json') }); }
      catch (e) { console.error(`그림 실패 ${s.f}: ${String(e.stderr || e.message).slice(-300)}`); }
    }
    if (!outs.length) continue;
    const [tag, day] = k.split('|'); const seed = (/^s(\d+)/.exec(tag) || [])[1];
    const dst = path.join(FIG, `T581_리허설_${seed}_${day}${/_on$/.test(tag) ? '_xzone' : ''}${process.env.T581_FIG_SUFFIX || ''}.png`);   // 덧이름 = 같은 씨의 다른 시계 판(예: `_4초`)
    const py = `
import sys,json
from PIL import Image, ImageDraw, ImageFont
outs=json.loads(sys.argv[1]); dst=sys.argv[2]; title=sys.argv[3]
ims=[Image.open(o['png']).convert('RGB') for o in outs]
H=max(i.height for i in ims); sc=[min(1.0, 1400/H)]*len(ims)
ims=[i.resize((int(i.width*s), int(i.height*s)), Image.BOX) for i,s in zip(ims,sc)]
H=max(i.height for i in ims); W=sum(i.width for i in ims)+20*(len(ims)-1)
c=Image.new('RGB',(W,H+40),(255,255,255)); x=0
try: f=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',22,index=1)
except Exception: f=ImageFont.load_default()
d=ImageDraw.Draw(c); d.text((8,6),title,fill=(0,0,0),font=f)
for o,i in zip(outs,ims):
  c.paste(i,(x,40)); st=json.load(open(o['stats'])); d.text((x+8,46),o['zone']+' · 겹친 셀 '+str(st.get('over2',0)),fill=(0,0,0),font=f,stroke_width=2,stroke_fill=(255,255,255)); x+=i.width+20
c.save(dst)
`;
    execFileSync('python3', ['-c', py, JSON.stringify(outs), dst, `T581 리허설 · 씨 ${seed} · ${day}일 · 한반도 | 닛폰`], { stdio: 'inherit' });
    console.log('그림', path.relative(ROOT, dst));
  }
}

// ── 표 — 씨 × 존 × 날 · 문턱 ✗ ───────────────────────────────────────────────────────────
function table(dir, md) {
  const metas = fs.readdirSync(dir).filter((f) => /^meta_.*\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  const q = (a, p) => { if (!a.length) return null; const t = [...a].sort((x, y) => x - y); return t[Math.min(t.length - 1, Math.floor(t.length * p))]; };
  const out = [];
  for (const m of metas.sort((a, b) => (a.seed - b.seed) || a.xzone.localeCompare(b.xzone))) for (const z of ZS) {
    const R = readRows(path.join(dir, `t581_${m.tag}_${z}.jsonl`)), E = readRows(path.join(dir, `rows_${m.tag}_${z}.jsonl`));
    if (!R.length) continue;
    for (const D of CHECK_DAYS) {
      const at = R.find((r) => r.day >= D); if (!at) { out.push({ tag: m.tag, seed: m.seed, xzone: m.xzone, zone: z, D, missing: true, last: R[R.length - 1].day }); continue; }
      const upto = R.filter((r) => r.day <= at.day);
      const e8 = E.find((r) => r.day >= D) || E[E.length - 1] || {};
      const work = upto.map((r) => r.dayMs && r.dayMs.work).filter((x) => x != null);
      const tick95 = upto.map((r) => r.tickMs && r.tickMs.p95).filter((x) => x != null);
      const heap = Math.max(...upto.map((r) => r.heapMax || 0));
      const rej = upto.filter((r) => r.dSite && r.dHouses != null && (r.dSite.call - r.dSite.hit) > r.dHouses);
      //   집터 누계는 존 프로세스 안 계수기(`_probe`)라 재부팅(`--resume`)에 0 부터 다시 센다 — 줄어든 줄에서 앞 누계를 얹는다
      const reason = {}; let offC = 0, offH = 0, pc = null, ph = 0, pr = {}; const offR = {};
      for (const r of upto) { const c = r.site ? r.site.call : 0, h = r.site ? r.site.hit : 0, rs = (r.site && r.site.reason) || {};
        if (pc != null && c < pc) { offC += pc; offH += ph; for (const k in pr) offR[k] = (offR[k] || 0) + pr[k]; }
        pc = c; ph = h; pr = rs; }
      for (const k of new Set([...Object.keys(offR), ...Object.keys(pr)])) reason[k] = (offR[k] || 0) + (pr[k] || 0);
      const siteCum = { call: offC + (pc || 0), hit: offH + ph };
      const firstEmpty = (R.find((r) => r.empty > 0) || {}).day;
      const firstDis = (R.find((r) => r.banditized > 0) || {}).day;
      const row = { tag: m.tag, seed: m.seed, xzone: m.xzone, zone: z, D, day: at.day, g: at.g, date: at.date,
        pop: e8.pop, dead: e8.dead, ever: e8.ever, weapQ: e8.weapQ, expand: e8.expand, reqOpened: e8.reqOpened, toolQ: e8.toolQ, preserve: e8.preserve, grain: e8.grain, skip: E.filter((r) => r.day <= at.day).reduce((a, r) => a + (r.skip || 0), 0),
        vils: at.vils, empty: at.empty, emptied: at.emptied, banditized: at.banditized, firstEmpty, firstDis, popMin: at.popMin, popMed: at.popMed,
        terr: at.terr, over: at.over, overMax: Math.max(...upto.map((r) => r.over || 0)), houses: at.houses,
        siteCall: siteCum.call, siteHit: siteCum.hit, siteMissDay: at.dSite ? at.dSite.call - at.dSite.hit : null, housesDay: at.dHouses, rejDays: rej.length, reason,
        roads: at.roads, xz: at.xz,
        dayP50: q(work, 0.5), dayP95: q(work, 0.95), tickP95: q(tick95, 0.95), tickMax: Math.max(...upto.map((r) => (r.tickMs && r.tickMs.max) || 0)), slice: at.sliceMs,
        heapMB: +(heap / 1048576).toFixed(0), heapLimitMB: +(at.heapLimit / 1048576).toFixed(0), dbMB: at.db != null ? +(at.db / 1048576).toFixed(1) : null };
      row.x = { empty: row.empty > 0, over: row.over > 0, site: row.siteMissDay != null && row.housesDay != null && row.siteMissDay > row.housesDay,
        tick: row.tickP95 != null && row.slice != null && row.tickP95 > row.slice, heap: heap > at.heapLimit };
      row.xN = Object.values(row.x).filter(Boolean).length;
      out.push(row);
    }
  }
  fs.writeFileSync(path.join(dir, 'table.json'), JSON.stringify(out, null, 1));
  const f = (x) => x == null ? '—' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : String(+(+x).toFixed(1)));
  const X = (b, s) => (b ? '✗ ' : '') + s;
  const head = ['씨', '존', '날(날짜)', '인구', '빈 마을', '해체', '인구 최저/중앙', '영토 셀', '겹침', '집', '집터 거부 그날/지은 집', '거부>지음 날수', '길(등급)', '마을하루 ms p50/p95', '틱 p95 ms', '힙 MB', 'DB MB'];
  const L = []; const pr = (a) => L.push(md ? '| ' + a.join(' | ') + ' |' : a.join('\t'));
  pr(head); if (md) pr(head.map(() => '---'));
  for (const r of out) {
    if (r.missing) { pr([r.seed + (r.xzone === 'on' ? '·경계' : ''), r.zone, `${r.D} — 못 닿음(마지막 ${r.last})`, ...head.slice(3).map(() => '—')]); continue; }
    pr([r.seed + (r.xzone === 'on' ? '·경계' : ''), r.zone, `${r.day} (${r.date || '—'})`, f(r.pop), X(r.x.empty, `${r.empty}/${r.vils}`), r.banditized, `${r.popMin}/${r.popMed}`, f(r.terr), X(r.x.over, String(r.over)), f(r.houses),
      X(r.x.site, `${r.siteMissDay}/${r.housesDay}`), r.rejDays, r.roads ? f(r.roads.graded) : '—', `${f(r.dayP50)}/${f(r.dayP95)}`, X(r.x.tick, f(r.tickP95)), X(r.x.heap, `${r.heapMB}/${r.heapLimitMB}`), f(r.dbMB)]);
  }
  console.log(L.join('\n'));
  const xs = out.filter((r) => !r.missing).reduce((a, r) => a + r.xN, 0);
  console.log(`\n✗ ${xs}칸 · 줄 ${out.length}`);
}

if (HOOK !== 'zone' && require.main === module) main();
