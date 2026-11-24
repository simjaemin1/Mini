// (@regress 없음 — 러너 밖 · T1420 랩 평형 저장본 몸통 · 제품 무변 · `t17-metrics.js` 가 `T1420_EQ=1` 일 때만 부른다)
// === scripts/lib-eq-lab.js — 랩 econ 세계를 통째로 저장하고 되살린다 · 날마다 세계 지문 · 평형 관측 줄 ==========
//
// ★왜(T1420 · 재민 11-21 "평형상태에서 시작하는 게 맞을까..?"): 마을은 6 ~ 10명으로 서서 600날 넘게 큰다. 판마다 그 성장을 다시 돌면
//   켜고 끈 차이가 "평형이 바뀐 것"인지 "크는 빠르기가 바뀐 것"인지 못 가른다. ⇒ 한 번 길게 돈 세계를 **통째로** 저장하고 거기서 잇는다.
//   곳간을 손으로 채우지 않는다(평형은 곳간 · 직업 몫 · 집 · 값 · 교역 기록이 맞물린 상태 — PM).
//
// 저장본 = gzip(v8.serialize({ meta, world, rng, mods })) —
//   world = econ 세계 객체 그대로(마을 · 사람 · 곳간 · 값 캐시 · 교역 기록 · 캐러밴 · 거리행렬 · 집 칸 …) — v8 은 Map · Set · 순환 참조 · 칸 차례를 그대로 싣는다.
//   rng   = econ 모듈 전역 셋(`econ.rngState()` — 난수 씨 · 다음 사람 번호 · 다음 마을 번호 · 세계 씨) — 세계 객체 밖에 사는 차례.
//   mods  = 세계 밖 모듈 메모리 가운데 되살림에 드는 것(아래 `MODS` 표 — 칸마다 주인 · 왜).
//   함수 칸(세계 안 콜백 — 예: 나무 층 `world.forageTakeFn`)은 저장 못 한다(v8) → 저장할 때 자리를 적고 빼고, 되살릴 때 **그 칸을 다는 정본 문**을 다시 부른다.
//     모르는 함수 칸이 있으면 저장을 멈춘다(조용히 버리지 않는다).
// 코드 지문 = sim/ · server/ · data/ 파일 바이트 + 거리행렬 몸(`lib-lab-dist`)의 sha1(저장 꼴은 `FORMAT` 이 따로 지킨다) — 다르면 "낡음"이라 말하고 안 쓴다(`--allow-stale` 없이는).
//   손잡이 기본값은 코드 안의 글자라 코드 지문에 든다. 저장할 때의 손잡이 env(`T\d+_…`)는 meta 에 적는다(끔 세계에서 만든다 — 켬 팔은 되살린 뒤 env 로 켠다).
'use strict';
const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const zlib = require('zlib');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

// ── 코드 지문 ─────────────────────────────────────────────────────────────────────────────
const SIG_DIRS = ['sim', 'server', 'data'];
const SIG_FILES = ['scripts/lib-lab-dist.js'];   // 세계를 세우는 정본 몸(거리행렬) · 이 파일 · 자 파일은 안 넣는다 — 저장 꼴은 `meta.v`(FORMAT)가 지킨다
let _sig = null;
function codeSig() {
  if (_sig) return _sig;
  if (process.env.T1420_SIG_FAKE) return (_sig = String(process.env.T1420_SIG_FAKE));   // 하네스 — 짧은 판에서 "낡음" 문을 문다
  const h = crypto.createHash('sha1');
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    let st; try { st = fs.statSync(abs); } catch (e) { return; }
    if (st.isDirectory()) { for (const n of fs.readdirSync(abs).sort()) if (!n.startsWith('.')) walk(path.join(rel, n)); return; }
    if (!/\.(js|json|csv|txt|tsv)$/.test(rel)) return;
    h.update(rel); h.update('\0'); h.update(fs.readFileSync(abs)); h.update('\0');
  };
  for (const d of SIG_DIRS) walk(d);
  for (const f of SIG_FILES) walk(f);
  return (_sig = h.digest('hex').slice(0, 16));
}
const FORMAT = 1;   // 저장 꼴 판 — 꼴을 바꾸면 올린다(옛 꼴 저장본은 낡음)
const KNOB_RE = /^(T\d+_[A-Z0-9_]+|VILLAGE_[A-Z_]+|ENABLE_[A-Z_]+|LAB_[A-Z_]+|EV_[A-Z_]+|L_[A-Z_]+)$/;
function knobEnv() { const o = {}; for (const k of Object.keys(process.env).sort()) if (KNOB_RE.test(k) && !/^T1420_/.test(k) && k !== 'LAB_SEEDCACHE' && !/_(JSON|OUT|FILE|DIR|PATH|LOG)$/.test(k)) o[k] = process.env[k]; return o; }   // 출력 길(_JSON · _OUT …)은 손잡이가 아니다
function cacheDir() { return path.join(process.env.TMPDIR || '/tmp', 'durango-eq-cache', codeSig()); }

// ── 함수 칸(세계 안 콜백) — 다는 정본 문 표 ────────────────────────────────────────────────
//   열쇠 = 세계에서의 자리(점 경로). 값 = 되살릴 때 그 칸을 다시 다는 함수(정본 문을 부른다 — 사본 0).
const FN_SLOTS = {
  'forageTakeFn': (world) => require(path.join(ROOT, 'server', 'trees')).attachToWorld(world),   // 나무 층(T135) — `attachToWorld` 가 `forageRealItems` · `forageTakeFn` 을 단다
  'priceFn': (world) => require(path.join(ROOT, 'sim', 'economy-sim-v2')).attachWorldFnsV2(world, 'price'),          // v2 값표(`createWorldV2` 그 줄)
  'netExportFn': (world) => require(path.join(ROOT, 'sim', 'economy-sim-v2')).attachWorldFnsV2(world, 'netExport'), // v2 순수출가(같은 문 · 되살린 세계를 닫는다)
};
function stripFns(root) {   // 세계 그래프의 함수 칸을 떼어 낸다 → [[객체, 열쇠, 함수, 경로]] (되돌리기용)
  const out = [], seen = new Set(), stk = [[root, '']];
  while (stk.length) {
    const [o, p] = stk.pop();
    if (!o || typeof o !== 'object' || seen.has(o)) continue;
    seen.add(o);
    if (ArrayBuffer.isView(o)) continue;
    if (o instanceof Map) { for (const [k, x] of o) { if (typeof x === 'function') throw new Error(`[T1420] Map 안 함수 칸 ${p}<${String(k)}> — 저장 못 한다`); stk.push([x, p + '<' + String(k).slice(0, 20) + '>']); } continue; }
    if (o instanceof Set) { for (const x of o) stk.push([x, p + '{}']); continue; }
    for (const k of Object.keys(o)) {
      const x = o[k];
      if (typeof x === 'function') { out.push([o, k, x, p ? p + '.' + k : k]); continue; }
      if (x && typeof x === 'object') stk.push([x, p ? p + '.' + k : k]);
    }
  }
  for (const [o, k] of out) o[k] = undefined;   // 칸은 남긴다(지우면 칸 차례가 바뀐다 — 지문 · 순회 차례)
  return out;
}
function putBack(list) { for (const [o, k, f] of list) o[k] = f; }

// ── 세계 밖 모듈 메모리 — 되살림에 드는 칸 ──────────────────────────────────────────────────
//   econ 모듈 전역 셋은 `rngState` 문(T728 — 서버 재기동이 쓰는 그 문)으로 싣는다. 그 밖의 모듈 칸은 판을 돌려 보고(날 지문) 갈리는 것만 여기 더한다.
const MODS = [];

// ── 저장 · 되살림 ─────────────────────────────────────────────────────────────────────────
function save(file, world, econ, extraMeta) {
  const fns = stripFns(world);
  const unknown = fns.filter((f) => !FN_SLOTS[f[3]]).map((f) => f[3]);
  try {
    if (unknown.length) throw new Error(`[T1420] 다는 문을 모르는 함수 칸 ${unknown.join(' · ')} — FN_SLOTS 에 정본 문을 적어라(조용히 버리지 않는다)`);
    const meta = Object.assign({ v: FORMAT, card: 'T1420', sig: codeSig(), day: world.day, knobs: knobEnv(), fns: fns.map((f) => f[3]),
      node: process.version }, extraMeta || {});
    const body = { meta, world, rng: econ.rngState ? econ.rngState() : null, mods: MODS.map((m) => [m.name, m.get()]) };
    //   난수 상태 = 모듈 전역(`rngState` — 세계 흐름 · 번호 계수기) + 마을마다 세계 안 칸(`v._rs` 마을 흐름 · `v._nid` — T731). 뒤엣것은 세계 객체에 들어 있어 따로 안 싣는다.
    let _rsKeep = null;
    if (process.env.T1420_BAIT === 'norng') { body.rng = null; _rsKeep = world.villages.map((v) => v._rs); for (const v of world.villages) v._rs = undefined; }   // @bait 미끼 — 난수 상태를 안 싣는 사본(전역 · 마을 흐름)
    let buf;
    try { buf = v8.serialize(body); } finally { if (_rsKeep) world.villages.forEach((v, i) => { v._rs = _rsKeep[i]; }); }
    if (process.env.T1420_BAIT === 'granary') {                                    // @bait 미끼 — 곳간만 싣는 사본(사람 · 값 · 교역 기록 없이 = "곳간 채우기")
      const g = world.villages.map((v) => v.storage);
      buf = v8.serialize({ meta, world: null, granary: g, rng: body.rng, mods: [] });
    }
    const gz = zlib.gzipSync(buf, { level: 6 });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp' + process.pid;
    fs.writeFileSync(tmp, gz); fs.renameSync(tmp, file);
    const sha = crypto.createHash('sha1').update(gz).digest('hex').slice(0, 16);
    fs.writeFileSync(file + '.meta.json', JSON.stringify(Object.assign({}, meta, { bytes: gz.length, raw: buf.length, sha }), null, 1));
    return { bytes: gz.length, raw: buf.length, sha, sig: meta.sig };
  } finally { putBack(fns); }
}
function load(file, econ, opts) {
  const o = opts || {};
  const body = v8.deserialize(zlib.gunzipSync(fs.readFileSync(file)));
  const meta = body.meta || {};
  const now = codeSig();
  if ((meta.sig !== now || meta.v !== FORMAT) && process.env.T1420_BAIT !== 'nosig' && !o.allowStale) {   // @bait 미끼 — 코드 지문을 안 보는 사본
    const e = new Error(`[T1420] 낡은 저장본 — 저장본 코드 지문 ${meta.sig} · 지금 ${now} (${file}). 다시 만든다(옛 것을 조용히 쓰지 않는다)`);
    e.code = 'EQ_STALE'; throw e;
  }
  let world = body.world;
  if (!world && body.granary) {   // 곳간만 싣는 사본(미끼) — 새 세계에 곳간만 붓는다
    world = o.fresh; world.villages.forEach((v, i) => Object.assign(v.storage, body.granary[i] || {}));
    world.day = meta.day;
  }
  if (body.rng && econ.setRngState) econ.setRngState(body.rng);
  for (const [name, val] of body.mods || []) { const m = MODS.find((x) => x.name === name); if (m) m.set(val); }
  for (const p of meta.fns || []) FN_SLOTS[p](world);
  return { world, meta };
}

// ── 날 지문 ───────────────────────────────────────────────────────────────────────────────
//   마을마다 = 마을 객체 통째(v8 바이트 · `_world` 뒤 칸 빼고 · 함수 칸 빼고) sha1 8자 · 세계 = 마을 밖 세계 칸 sha1 8자 · 전체 = 둘을 이은 sha1 12자.
//   통째라 캐시 칸도 든다 — 같은 세계면 캐시도 같아야 한다(결정론). 갈리면 칸 이름까지 내는 길(`fpKeys`)이 있다.
//   ⚠v8 바이트를 해시하지 않는다 — v8 은 숫자 꼴(Smi · double) · 배열 꼴(빽빽 · 구멍)을 바이트에 싣는다. 되살린 배열은 같은 값이라도 꼴이 달라
//     같은 세계가 다른 지문을 낸다(첫 판 실측: 날 21 마을 51/51 · `_distMatrix` · `land` 까지 "다름"). ⇒ **값만 보는 정규 지문**(`canon`):
//     칸 차례 그대로 · 숫자 = 값 글자 · Map/Set = 넣은 차례 · 같은 객체를 두 번 만나면 처음 번호(공유 · 순환 구조도 지문에 든다).
function canon(x, h, ids, stop) {
  const t = typeof x;
  if (x === null) { h.update('N'); return; }
  if (t === 'undefined') { h.update('U'); return; }
  if (t === 'number') { h.update('n' + (Object.is(x, -0) ? '-0' : String(x)) + ';'); return; }
  if (t === 'string') { h.update('s' + x.length + ':'); h.update(x); return; }
  if (t === 'boolean') { h.update(x ? 'T' : 'F'); return; }
  if (t === 'bigint') { h.update('b' + x + ';'); return; }
  if (t === 'function') { h.update('f'); return; }
  if (t === 'symbol') { h.update('y'); return; }
  if (stop) { const tg = stop.get(x); if (tg != null) { h.update(tg); return; } }   // 남의 마을 · 세계 = 이름표(그 속은 그 마을 지문에)
  const id = ids.get(x); if (id != null) { h.update('@' + id + ';'); return; }
  ids.set(x, ids.size);
  if (ArrayBuffer.isView(x)) { h.update('V' + x.constructor.name + x.length + ':'); h.update(Buffer.from(x.buffer, x.byteOffset, x.byteLength)); return; }
  if (Array.isArray(x)) { h.update('A' + x.length + '['); for (let i = 0; i < x.length; i++) { if (!(i in x)) h.update('h'); else canon(x[i], h, ids, stop); } h.update(']'); return; }
  if (x instanceof Map) { h.update('M' + x.size + '{'); for (const [k, v] of x) { canon(k, h, ids, stop); canon(v, h, ids, stop); } h.update('}'); return; }
  if (x instanceof Set) { h.update('S' + x.size + '{'); for (const v of x) canon(v, h, ids, stop); h.update('}'); return; }
  if (x instanceof Date) { h.update('D' + x.getTime() + ';'); return; }
  const ks = Object.keys(x); h.update('O' + ks.length + '{');
  for (const k of ks) { h.update(k + '='); canon(x[k], h, ids, stop); }
  h.update('}');
}
function _ch(x, n, stop) { const h = crypto.createHash('sha1'); const ids = new Map(); if (stop && stop.has(x)) { const tg = stop.get(x); stop.delete(x); try { canon(x, h, ids, stop); } finally { stop.set(x, tg); } } else canon(x, h, ids, stop); return h.digest('hex').slice(0, n); }
function _stops(world) { const m = new Map([[world, 'W;']]); world.villages.forEach((v, i) => m.set(v, 'V' + i + ';')); return m; }
function fpDay(world) {
  const vs = world.villages, st = _stops(world);
  const vh = vs.map((v) => _ch(v, 8, st));
  const wh = _ch(world, 8, st);
  return { d: world.day, all: crypto.createHash('sha1').update(vh.join('') + wh).digest('hex').slice(0, 12), w: wh, v: vh };
}
function fpKeys(world, vi) {   // 갈린 날 — 그 마을(또는 세계 = -1)의 칸마다 지문 8자
  const out = {};
  const st = _stops(world);
  if (vi < 0) { for (const k of Object.keys(world)) out[k] = _ch(world[k], 8, st); }
  else { const v = world.villages[vi]; for (const k of Object.keys(v)) out[k] = _ch(v[k], 8, st); }
  return out;
}

// ── 평형 관측 줄(날마다) — 읽기만 ───────────────────────────────────────────────────────────
//   [날 · 세계 인구 · 산 마을 수 · 식량 날치 가운데(마을 곳간 식량 ÷ 인구) · 직업 몫 · 값 가운데(식량 · 나무 · 돌 · 도구) · 굶어 죽음 누계 · 죽음 누계 · 떠난 사람 누계 · CPU ms 누계]
//   값 = 마을이 이미 들고 있는 그날 값 칸만 읽는다(값을 새로 셈하는 함수는 안 부른다 — 캐시를 건드려 세계를 바꿀 수 있다).
function med(a) { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; }
function obsDay(world, econ) {
  let pop = 0, alive = 0, fdDead = 0, dead = 0, emig = 0; const fd = [], jobs = {}, P = { food: [], wood: [], stone: [], tool: [] };
  for (const v of world.villages) {
    const n = (v.npcs || []).length; pop += n; if (n > 0) alive++;
    fdDead += v._fdDeadTot || 0; dead += v._deadTot || 0; emig += v._emigTot || 0;   // 누계 칸(엔진이 이미 세는 것 — 굶어 죽음 · 모든 죽음 · 떠난 사람)
    if (n > 0) fd.push((+(v.storage && v.storage.food) || 0) / n);
    for (const [j, c] of Object.entries(v.counts || {})) jobs[j] = (jobs[j] || 0) + c;
    const pr = v._priceCache || null;   // 그날 교역 값표(v2 `tickTradeV2` 가 마을에 남긴 칸 — 읽기만)
    if (pr) for (const k of Object.keys(P)) if (pr[k] != null) P[k].push(+pr[k]);
  }
  const jt = Object.values(jobs).reduce((a, b) => a + b, 0) || 1, js = {};
  for (const [j, c] of Object.entries(jobs)) if (c > 0) js[j] = +(c / jt).toFixed(4);
  const cu = process.cpuUsage();
  return [world.day, pop, alive, fd.length ? +med(fd).toFixed(2) : null, js, Object.fromEntries(Object.entries(P).map(([k, a]) => [k, a.length ? +med(a).toFixed(3) : null])),
    fdDead, dead, emig, Math.round((cu.user + cu.system) / 1000)];
}

module.exports = { codeSig, cacheDir, knobEnv, save, load, fpDay, fpKeys, canon, obsDay, stripFns, putBack, FN_SLOTS, MODS, _ch, _stops };

// ── t17 자 문(`scripts/t17-metrics.js` 가 `T1420_EQ=1` 일 때만 부른다 · 안 부르면 그 자는 종전 바이트) ──────────────
//   T1420_LOAD=<저장본>      세계를 저장본으로 갈아 끼운다(그 뒤 루프가 `<일수>` 날 더 돈다)
//   T1420_SAVE_AT=400,800    그 날(econ world.day)이 끝난 뒤 저장 → T1420_SAVE_DIR(기본 캐시 폴더)/lab-<존>-<시드>-d<날>.v8.gz
//   T1420_FP=<파일>          날마다 세계 지문 · T1420_OBS=<파일> 날마다 평형 관측 줄 · T1420_FPKEYS=<날> 그날 칸별 지문
const OBS_COLS = ['d', 'pop', 'alive', 'foodDaysMed', 'jobShare', 'priceMed', 'fdDeadTot', 'deadTot', 'emigTot', 'cpuMs'];   // `obsDay` 열 차례(`lib-eq-crit.COL` 과 짝)
module.exports.OBS_COLS = OBS_COLS;
function bindT17(ctx) {
  const E = process.env, out = (s) => process.stderr.write(s + '\n');
  const zone = ctx.zone || 'hanbando', seed = ctx.seed;
  let world = ctx.world, loaded = null;
  if (E.T1420_LOAD) {
    const r = load(E.T1420_LOAD, ctx.econ, { allowStale: E.T1420_ALLOW_STALE === '1', fresh: world });
    world = r.world; loaded = r.meta;
    out(`[T1420] 저장본 되살림 ${E.T1420_LOAD} — 날 ${loaded.day} · 코드 지문 ${loaded.sig} · 마을 ${world.villages.length}`);
  }
  const saveAt = new Set(String(E.T1420_SAVE_AT || '').split(',').map(Number).filter((x) => x > 0));
  const saveDir = E.T1420_SAVE_DIR || cacheDir();
  const fp = E.T1420_FP ? [] : null, obs = E.T1420_OBS ? [] : null, fk = E.T1420_FPKEYS ? +E.T1420_FPKEYS : null, keys = {};
  const fpFrom = +(E.T1420_FP_FROM || 0), fpTo = E.T1420_FP_TO ? +E.T1420_FP_TO : Infinity;   // ★[T1426] 지문 날 창(긴 판에서 되살림 견줌 날만)
  const GR = (E.T1426_GROW || E.T1426_GROW_VILS) ? require('./lib-eq-grow') : null, grow = E.T1426_GROW ? [] : null, gv = E.T1426_GROW_VILS ? [] : null;   // ★[T1457] 마을마다 줄   // ★[T1426] 성장 길 관측(인구 식 몫 · 땅 · 죽음 갈래)
  const saved = [];
  const flush = () => {
    if (fp) fs.writeFileSync(E.T1420_FP, JSON.stringify({ card: 'T1420', zone, seed, sig: codeSig(), loaded, fp, keys }));
    if (obs) fs.writeFileSync(E.T1420_OBS, JSON.stringify({ card: 'T1420', zone, seed, sig: codeSig(), loaded,
      cols: OBS_COLS, rows: obs }));
    if (gv) fs.writeFileSync(E.T1426_GROW_VILS, JSON.stringify({ card: 'T1457', zone, seed, names: world.villages.map((v) => v.name), cols: GR.VCOLS, days: gv }));
    if (grow) fs.writeFileSync(E.T1426_GROW, JSON.stringify({ card: 'T1426', zone, seed, sig: codeSig(), loaded, cols: GR.COLS, rows: grow }));
  };
  return {
    world,
    day() {
      const w = world;
      if (fp && w.day >= fpFrom && w.day <= fpTo) fp.push(fpDay(w));
      if (grow) grow.push(GR.growDay(w));
      if (gv) gv.push([w.day, GR.vilDay(w)]);
      if (obs) obs.push(obsDay(w, ctx.econ));
      if (fk != null && w.day === fk) { keys.world = fpKeys(w, -1); keys.v = w.villages.map((_, i) => fpKeys(w, i)); }
      if (saveAt.has(w.day)) {
        const f = path.join(saveDir, `lab-${zone}-${seed}-d${w.day}.v8.gz`), t0 = Date.now();
        const r = save(f, w, ctx.econ, { zone, seed, made: 't17-metrics', loadedFrom: loaded ? loaded.day : null });
        saved.push(Object.assign({ file: f, ms: Date.now() - t0 }, r));
        out(`[T1420] 저장 ${f} — 날 ${w.day} · ${r.bytes} B(날것 ${r.raw}) · sha ${r.sha} · ${Date.now() - t0}ms`);
      }
      if ((fp || obs || grow || gv) && w.day % 100 === 0) flush();
    },
    end() { flush(); if (E.T1420_SAVED) fs.writeFileSync(E.T1420_SAVED, JSON.stringify(saved)); },
  };
}
module.exports.bindT17 = bindT17;

// ── 지문 견줌 — 두 판(`T1420_FP` 파일)의 겹치는 날 · 같은 날 · 첫 갈림 · 첫 갈림 날의 세계 칸 · 마을 칸(`T1420_FPKEYS` 가 그날이면) ──
function cmpFp(A, B) {
  const m = new Map(B.fp.map((r) => [r.d, r])); let n = 0, same = 0, first = null, vd = null;
  for (const r of A.fp) { const q = m.get(r.d); if (!q) continue; n++; if (q.all === r.all) same++; else if (first == null) { first = r.d; vd = { world: r.w !== q.w, vils: r.v.map((h, i) => (h !== q.v[i] ? i : -1)).filter((i) => i >= 0) }; } }
  const out = { n, same, first, at: vd };
  if (A.keys && B.keys && A.keys.world && B.keys.world) {
    out.keysWorld = Object.keys(Object.assign({}, A.keys.world, B.keys.world)).filter((k) => A.keys.world[k] !== B.keys.world[k]);
    const vk = {}; (A.keys.v || []).forEach((o, i) => { const q = B.keys.v[i] || {}; for (const k of new Set(Object.keys(o).concat(Object.keys(q)))) if (o[k] !== q[k]) vk[k] = (vk[k] || 0) + 1; });
    out.keysVil = vk;
  }
  return out;
}
module.exports.cmpFp = cmpFp;
if (require.main === module && process.argv[2] === 'cmp') {   // node scripts/lib-eq-lab.js cmp <A.fp.json> <B.fp.json>
  console.log(JSON.stringify(cmpFp(JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), JSON.parse(fs.readFileSync(process.argv[4], 'utf8')))));
}
