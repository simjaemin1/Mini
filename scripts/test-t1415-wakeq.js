#!/usr/bin/env node
'use strict';
// @regress
// @bait 4
// === scripts/test-t1415-wakeq.js — 깨움 시각 줄(T1415 ② `T1415_WAKEQ`) = 틱마다 첫 거름 · 마을 바뀜 도장 고정물(T1415 ⓓ) ===
//   ① 줄 모형(존을 띄우지 않는다 — `server/stand-skip.js` 의 줄 몸통 · PMap · OrdSet 을 그대로 싣는다):
//      몸 160 · 틱 2,400 을 두 판으로 돈다 — 기준 판(줄 끔 · 틱마다 모든 몸 첫 거름)과 줄 판(주차 · 꺼냄 · `qMat`).
//      두 판의 일은 틱 번호 · 몸 번호로만 정한 같은 대본이다(밀기 = `_t1322Wake` · players 지움/다시 넣음 · 거울 지움/다시 넣음 ·
//      같은 pid 다시 받기 · 예산 끊김 · 고리가 안 돈 틱 · 거울 메우기 · 표 행 뜨기). 깨운 몸 · 까닭 · 깨울 때 쓴 도장(`SK`) · 틱 끝 열이 같은가.
//   ② 서버 판(`scripts/t1294/run.cjs` · 가상 시계 · 시드 1020 · 2날 · 켬 셋): verify 줄 — 주차 몸을 열어 본 수 > 0 · 어긋남 0 ·
//      켬 줄 ↔ 끈 줄 — 날 지문(pos · world · body) 같음 · 첫 거름 셈(`T1322_STAT` 거름 · 깨움 · 까닭 …) 전부 같음 · 줄이 건넌 몸 > 0
//   ③ 깨움 자리 셈표(글자) — 표를 내리는 길이 줄을 먼저 비우는가: `_t1322Wake` 머리 `qWake` · 부르는 함수 모음 · `_t1322Touch` 자리 수 ·
//      표 종류 0 쓰기 자리 · PMap(set · delete · clear) · OrdSet(delete · clear) · install(옛 칸) · 표 행 뜨기(`qAll('snap')`) — 새 자리가 나면 빨강(셈표를 고친다)
//   ④ 마을 바뀜 도장 고정물(존 없이 생활층 정본 문을 낮 가운데 부른다 — 날 번호 그대로): 장 서기(`_t707Open`) · 의뢰 집터(`lifeRequestPlayerSite`) ·
//      개간 일감 줄(`_t1207Queue`) · 개간 끝(`_t1207BodyDone`) — 판정이 읽는 마을 문 칸이 바뀌면 도장(`t1399Gen`)이 올랐나
//   ⑤ 손잡이 — `T1415_WAKEQ` 끔 기본 · `1` · `verify` · 거울 고리 · 사건 갈래 끔일 때만
//   ★미끼 넷 [T1356 규약]: ⓐ 깨움 사건 하나를 뺀 사본(players 지움이 줄을 안 비운다 — 몸이 안 깨어난다) → ① 어긋남
//                         ⓑ 묵은 시각으로 꺼내는 사본(꺼냄이 120ms 늦다) → ① 어긋남 ⓒ 칸을 안 쓰는 사본(`qMat` 이 거른 틱 · 시각을 안 쓴다) → ① 어긋남
//                         ⓓ 도장 안 찍는 사본(장 서기 줄의 `t1399Bump` 를 뺀 생활층) → ④ 빨강
//   날짜 · 벽시계를 안 쓴다(모형 = 틱 번호 · 서버 판 = 가상 시계 · 날 번호만).
const path = require('path'), fs = require('fs'), os = require('os'), Module = require('module'), { spawn, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
if (process.argv[2] === '--fixture') { fixtureChild(); return; }
require('./lib-port').noCentral();
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const SS_SRC = fs.readFileSync(path.join(ROOT, 'server', 'stand-skip.js'), 'utf8');

// ── ① 줄 모형 ──────────────────────────────────────────────────────────────────────────────────────────────
function loadSS(src, mode) {
  const keep = process.env.T1415_WAKEQ; process.env.T1415_WAKEQ = mode;
  const m = new Module(path.join(ROOT, 'server', 'stand-skip.js'), null); m.paths = Module._nodeModulePaths(path.join(ROOT, 'server'));
  m._compile(src, path.join(ROOT, 'server', 'stand-skip.js'));
  if (keep === undefined) delete process.env.T1415_WAKEQ; else process.env.T1415_WAKEQ = keep;
  return m.exports;
}
const H = (a, b) => { let h = (a * 2654435761 + b * 40503 + 12345) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13; return h >>> 0; };
function model(src, q) {
  const SS = loadSS(src, q ? '1' : '0'), A = SS.A, Q = SS.Q, players = SS.newPlayers(), npcs = SS.newNpcs(), N = 160, TICKS = 2400, DT = 50, log = [];
  const bodies = []; for (let i = 0; i < N; i++) { const p = { pid: 'n' + i }; bodies.push(p); SS.install(p); players.set(p.pid, p); npcs.add(p.pid); }
  let tickN = 0, cursor = null;
  const wake = (s, why, n) => { if (q) SS.qWake(s); log.push(`${n} ${SS.own[s] ? SS.own[s].pid : '?'} ${why} ${A.SK[s]}`); A.TK[s] = 0; A.SK[s] = NaN; };
  const touch = (pid, n) => { const s = SS.slot(pid); if (s >= 0 && SS.own[s] && A.TK[s]) wake(s, 'touch', n); };
  const skip = (s, now, n) => { const k = A.TK[s]; if (!k) return false;
    const why = A.GN[s] ? 'gone' : A.VT[s] !== n - 1 ? 'gap' : !(now < A.NDA[s]) ? 'due' : null;
    if (why) { wake(s, why, n); return false; } A.SK[s] = now; A.VT[s] = n; return true; };
  const grant = (s, now, n) => { A.VT[s] = n; A.TK[s] = 0; const p = SS.own[s]; if (!p || A.GN[s]) return; const h = H(+p.pid.slice(1), n);
    if (h % 5 === 0) return; A.TK[s] = 1 + (h % 2); A.NDA[s] = now + 120 + (h >>> 3) % 2600; A.SK[s] = NaN; log.push(`${n} ${p.pid} grant ${A.NDA[s]}`); };
  for (let t = 1; t <= TICKS; t++) {
    tickN++; const n = tickN, now = n * DT;
    const ev = (k) => H(t, k);
    // 고리 밖 일(고리 앞): 밀기 · 지움 · 다시 넣음 · 다시 받기
    if (ev(1) % 7 === 0) touch('n' + (ev(2) % N), n);
    if (ev(3) % 23 === 0) { const p = bodies[ev(4) % N]; if (players.get(p.pid) === p) players.delete(p.pid); else players.set(p.pid, p); }
    if (ev(5) % 31 === 0) { const p = bodies[ev(6) % N]; if (npcs.has(p.pid)) npcs.delete(p.pid); else npcs.add(p.pid); }
    if (ev(7) % 97 === 0) { const p = bodies[ev(8) % N]; SS.install(p); players.set(p.pid, p); }
    if (t === 900) for (let i = 0; i < 90; i++) npcs.delete('n' + i);   // 거울 메우기(구멍 ≥ 64 · ≥ ¼)
    if (t === 960) for (let i = 0; i < 90; i++) npcs.add('n' + i);
    if (q && ev(9) % 211 === 0) SS.qAll('snap');
    if (ev(10) % 41 === 0) continue;   // 고리가 안 돈 틱(빠짐)
    // 고리(존 결정 순회 그 꼴)
    const cpt = npcs.compact(), P = npcs.P, S = npcs.S; let curHit = cursor === null, stopAt = null, cut = -1;
    const budget = ev(11) % 13 === 0 ? ev(12) % P.length : -1;
    if (q) SS.qBegin(n, now, cpt, P, S);
    for (let i = 0; i < P.length; i++) { const pid = P[i]; if (pid === undefined) continue;
      if (q) Q.at = i;   // 존은 주차 몸을 지나칠 때 자리를 안 적는다 — 밖 깨움은 연 몸(자리 = 그 몸)의 결정 안에서만 난다. 모형은 그 자리에서 민다
      if (ev(100 + i) % 211 === 0) touch('n' + (ev(200 + i) % N), n);   // 고리 안 밀기(앞 몸의 결정이 뒤 · 앞 몸을 민다)
      if (q && curHit && Q.K[i]) continue;
      let s = S[i]; if (s < 0 || SS.own[s] === null) { s = SS.slot(pid); S[i] = s; }
      if (!curHit) { if (pid !== cursor) continue; curHit = true; }
      if (s >= 0 && skip(s, now, n)) { if (q && Q.P[s] !== 1 && A.VT[s] === n && !A.GN[s] && now < A.NDA[s]) SS.qPark(s, i, A.NDA[s], n); continue; }
      if (i === budget) { stopAt = pid; cut = i; break; }
      if (s >= 0 && SS.own[s] && !A.GN[s]) { log.push(`${n} ${pid} dec`); grant(s, now, n); if (q && A.TK[s] && now < A.NDA[s]) SS.qPark(s, i, A.NDA[s], n); }
    }
    cursor = curHit ? stopAt : null;
    if (q) SS.qEnd(n, now, curHit ? cut : 0);
  }
  if (q) SS.qAll('snap');
  const end = []; for (let s = 0; s < SS.count(); s++) end.push(`${s}:${A.TK[s]}:${A.VT[s]}:${A.SK[s]}`);
  return { log, end, st: q ? Q.st : null };
}
function cmpModel(src) {
  const R = model(SS_SRC, false), M = model(src, true);
  let i = 0; while (i < R.log.length && R.log[i] === M.log[i]) i++;
  const endBad = R.end.filter((x, j) => x !== M.end[j]).length;
  return { R, M, same: i === R.log.length && R.log.length === M.log.length, at: i, a: R.log[i], b: M.log[i], endBad };
}

// ── ④ 마을 바뀜 도장 고정물(자식 프로세스 — 미끼면 생활층 글자를 읽을 때 바꾼다) ─────────────────────────────
function fixtureChild() {
  process.env.ENABLE_VILLAGES = '0'; process.env.DB_PATH = path.join(os.tmpdir(), `t1415fx-${process.pid}.db`);
  if (process.env.__T1415_BAIT === 'stamp') {
    const _c = Module.prototype._compile, VP = path.join('server', 'villages.js');
    Module.prototype._compile = function (content, filename) {
      if (filename.endsWith(VP)) { const L = content.split('\n'), hit = L.map((l, i) => (l.startsWith('  if (!rec || rec.d !== D) { rec = vil._mkt = {') && l.includes('t1399Bump(vil);') ? i : -1)).filter((i) => i >= 0);
        if (hit.length === 1) L[hit[0]] = L[hit[0]].replace('t1399Bump(vil);', ''); content = L.join('\n'); console.log(`BAIT ${hit.length}`); }
      return _c.call(this, content, filename);
    };
  }
  const V = require(path.join(ROOT, 'server', 'villages.js')), E = require(path.join(ROOT, 'sim', 'economy-sim.js')), P = V.__labProbe;
  const players = new Map(), body = (pid) => { const p = { pid, isNpc: true, hp: 100, maxHp: 100, inventory: {} }; players.set(pid, p); return p; };
  const ta = { isBlocked: () => false, isRock: () => false, isWater: () => false, fert: () => 0.5, forestMult: () => 1 };
  const square = (cx, cy, h) => { const s = new Set(); for (let dx = -h; dx <= h; dx++) for (let dy = -h; dy <= h; dy++) s.add((cx + dx) + ',' + (cy + dy)); return s; };
  const mk = (id, name, cx, cy) => Object.assign({ dbId: id, name, ccx: cx, ccy: cy, _terrSet: square(cx, cy, 27), _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
    _houseCells: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: [],
    econ: E.createVillage({ name: 'T', initialPop: 40, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 }) });
  const deps = { players, dayPhaseRatio: 0.7, moveSpeed: 64, anyViewerNear: () => false, broadcast: () => {}, t325TreesAtCell: () => [], t325CutTreeAt: () => null, t325LootOf: () => ({ wood: 5, twig: 1 }), clearTreesInCells: () => 0 };
  const db = { insertVillageBuilding: () => {}, deleteVillageBuilding: () => {}, run: () => {} };
  const A = mk(1, 'A', 1000, 1000); body(101); A.npcPids = [101];
  P._t569Probe.setup({ ta, villages: [A], db }); P._t400Probe.setup({ deps, dayMs: 250, db });
  P._t707Probe.setup({ world: { day: 5 }, byEcon: new Map([[A.econ, A]]), byDbId: new Map([[1, A]]), villages: [A], dayMs: 250, epoch: 0, deps });
  //   판정이 읽는 마을 문 칸(도장 셈 훅 `t1415-stamp-hook.cjs` 의 그 칸 — 장 · 집터 · 의뢰 집터 · 크루 · 영토 일감 줄 · 영토 있음)
  const sig = (v) => JSON.stringify([v._mkt ? v._mkt.d + ':' + v._mkt.cars.size : 0, v._site && v._site.cx, v._psite && v._psite.cx, v._clearCrew, v._buildCrew, v._psiteCrew, (v._t1207Pend || []).length, v._terrSet.size ? 1 : 0, v._terrSet.size]);
  const out = [], step = (name, fn) => { const s0 = sig(A), g0 = V.t1399Gen(A); let r; try { r = fn(); } catch (e) { r = 'ERR ' + e.message; } out.push({ name, ch: sig(A) !== s0, up: V.t1399Gen(A) > g0, r: JSON.stringify(r === undefined ? null : r).slice(0, 80) }); };
  step('장', () => !!P._t707Probe.open({ to: A.econ, id: 'c1' }));
  step('의뢰 집터', () => V.lifeRequestPlayerSite(A, 1020, 1000, 'p1', '고정물').ok === true);
  step('개간 일감 줄', () => { A._t1207Pend = undefined; return !!V._t1207Queue(A, ['1028,1000', '1029,1000']); });
  step('개간 끝', () => { const j = A._t1207Pend && A._t1207Pend[0]; return j ? V._t1207BodyDone(A, j) : 'no job'; });
  console.log('FIX ' + JSON.stringify({ day: 5, out }));
}
function fixture(bait) {
  const r = spawnSync(process.execPath, [__filename, '--fixture'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, __T1415_BAIT: bait || '' } });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('FIX ')), b = (r.stdout || '').split('\n').find((l) => l.startsWith('BAIT '));
  return { j: line ? JSON.parse(line.slice(4)) : null, bait: b ? +b.slice(5) : null, err: line ? '' : (r.stderr || '').slice(-400) };
}

// ── ② 서버 판 ─────────────────────────────────────────────────────────────────────────────────────────────
const DAYS = +(process.env.T1415_DAYS || 2), SEED = String(process.env.T1415_SEED || 1020), PB = +(process.env.T577_PORT_BASE || 49400);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 't1415-wakeq-'));
const BASE = { T1399_TOK: '1', T1365_WORK: '1', T1399_FISH: '1' };
function lane(name, port, extra) {
  const dir = path.join(out, name); fs.mkdirSync(dir, { recursive: true });
  return new Promise((res) => {
    const c = spawn(process.execPath, [path.join(ROOT, 'scripts', 't1294', 'run.cjs'), path.join(dir, 'run'), String(DAYS)], {
      cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'],
      env: { ...process.env, T1278_ROOT: ROOT, T1294_SEED: SEED, T577_PORT_BASE: String(port), ...BASE, T1322_STAT: path.join(dir, 'st-%p.json'), ...extra } });
    c.on('exit', (code) => {
      const sf = path.join(dir, 'run', 'status.json'), st = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : null;
      const f = fs.readdirSync(dir).find((x) => /^st-\d+\.json$/.test(x)), S = f ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : null;
      const rd = (fn) => { const p = path.join(dir, 'run', fn); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null; };
      const body = (rd(`body.${SEED}.jsonl`) || '').split('\n').filter(Boolean).map((l) => { const d = JSON.parse(l); delete d.cpu; delete d.clk; const s = d.st || {}; for (const k of Object.keys(s)) if (k.startsWith('ns')) delete s[k]; return JSON.stringify(d); }).join('\n');
      try { fs.rmSync(path.join(dir, 'run', 'server'), { recursive: true, force: true }); } catch (e) {}
      res({ code, ok: !!(st && st.valid && st.days >= DAYS), S, pos: rd('pos-days.jsonl'), world: rd('world-days.jsonl'), body });
    });
  });
}

(async () => {
  console.log('== ① 줄 모형 — 기준 판(틱마다 첫 거름) ↔ 줄 판(주차 · 꺼냄)');
  const C = cmpModel(SS_SRC), st = C.M.st;
  ok(C.same, `깨움 · 까닭 · 깨울 때 도장 · 결정 같음 — 일 ${C.R.log.length}`, C.same ? undefined : `첫 갈림 #${C.at}: ${C.a} ↔ ${C.b}`);
  ok(C.endBad === 0, '끝 열(표 · 거른 틱 · 거른 시각) 같음', `다름 ${C.endBad}`);
  ok(st.park > 0 && st.pop > 0 && st.ext > 0 && st.brk > 0 && st.gap > 0 && st.cpt > 0 && st.snap > 0, '갈래를 다 탔다(주차 · 꺼냄 · 밖 깨움 · 끊김 · 빠짐 · 메우기 · 뜨기)',
    `주차 ${st.park} · 꺼냄 ${st.pop} · 밖 ${st.ext} · 끊김 ${st.brk} · 빠짐 ${st.gap} · 메우기 ${st.cpt} · 뜨기 ${st.snap} · 묵은 칸 ${st.stale}`);

  console.log('== ③ 깨움 자리 셈표(글자)');
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'), V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const encl = (src, idx) => { const m = src.slice(0, idx).match(/\nfunction ([\w$]+)\(/g); return m ? m[m.length - 1].slice(10, -1) : '?'; };
  const calls = (src, re) => { const r = []; let m; const g = new RegExp(re, 'g'); while ((m = g.exec(src))) r.push(encl(src, m.index)); return r; };
  const wk = calls(Z, '(?<!function )_t1322Wake\\(s\\)').filter((f) => f !== '?');
  const wkC = wk.reduce((o, f) => ((o[f] = (o[f] || 0) + 1), o), {});
  ok(Z.includes('function _t1322Wake(s) {\n  if (SS.WQ_ON) SS.qWake(s);'), '`_t1322Wake` 머리 = 주차 몸 꺼냄(밀기 · 체력 문 · 대피 · 종료 저장 · 결정 문 · 첫 거름이 다 이 문)');
  ok(JSON.stringify(Object.keys(wkC).sort().map((k) => k + ':' + wkC[k])) === JSON.stringify(['_t1322FlushAll:1', '_t1322Skip:2', '_t1322Touch:1', '_t1348Dec:1']),
    '`_t1322Wake` 부르는 함수 = 결정 문(일터) · 밀기 문 · 몰아 내림 · 첫 거름', JSON.stringify(wkC));
  const tz = calls(Z, '_t1322Touch\\(p\\)').length, tzv = (V.match(/state\.deps\.t1322Touch|const _t22 = state\.deps\.t1322Touch/g) || []).length;
  ok(tz === 7 && tzv === 4, '`_t1322Touch` 자리 — 존 7(옮김 · 체력 문 둘 · 걸음 뒷일 · 밀기 둘 · 정의 몸통) · 생활층 deps 4(몸 칸 문 · 직업 칸 둘 · 대피)', `존 ${tz} · 생활층 ${tzv}`);
  const tk0 = calls(Z, 'A\\.TK\\[s\\] = 0').reduce((o, f) => ((o[f] = (o[f] || 0) + 1), o), {});
  ok(JSON.stringify(Object.keys(tk0).sort()) === JSON.stringify(['_t1322Grant', '_t1322Wake']), '표 종류 0 쓰기 = 표 주기(그 몸 차례) · 깨움 문뿐', JSON.stringify(tk0));
  const S = SS_SRC;
  ok(/install\(p\) \{\n  const old = slotOf\.get\(p\.pid\); if \(old !== undefined\) \{ if \(WQ_ON\) qWake\(old\);/.test(S) && /  set\(k, v\) \{ const s = slotOf\.get\(k\); if \(WQ_ON && s !== undefined\) qWake\(s\);/.test(S) &&
     /  delete\(k\) \{ const s0 = slotOf\.get\(k\); if \(WQ_ON && s0 !== undefined\) qWake\(s0\);/.test(S) && /  clear\(\) \{ if \(WQ_ON\) qAll\('clr'\); super\.clear\(\); A\.GN\.fill\(1\);/.test(S) &&
     /  delete\(pid\) \{ if \(WQ_ON && super\.has\(pid\)\) \{ const s0 = slotOf\.get\(pid\); if \(s0 !== undefined\) qWake\(s0\); \}/.test(S) && /  clear\(\) \{ if \(WQ_ON\) qAll\('clr'\); super\.clear\(\); this\.P\.length = 0;/.test(S),
     'stand-skip 쓰기 앞 꺼냄 — install(옛 칸) · PMap set · delete · clear · OrdSet delete · clear');
  ok(Z.includes("function _t1372SSTake() {\n  if (SS.WQ_ON) SS.qAll('snap');") && (Z.match(/SS\.qBegin\(/g) || []).length === 1 && (Z.match(/SS\.qEnd\(/g) || []).length === 1 && (Z.match(/SS\.qPark\(/g) || []).length === 1,
    '표 행 뜨기 앞 전부 꺼냄 · 고리 머리 · 끝 · 주차 자리 하나씩');

  console.log('== ⑤ 손잡이');
  ok(/const WQ_ON = LOOP && \(QMODE === '1' \|\| QMODE === 'verify'\), WQ_VERIFY = QMODE === 'verify';/.test(S) && /const T1415Q = T1348_LOOP && SS\.WQ_ON && !T1322_VERIFY && !T1241_DES,/.test(Z),
    '`T1415_WAKEQ` 끔 기본 · 1 · verify · 거울 고리 · verify 거름 끔 · 사건 갈래 끔');
  const off = loadSS(SS_SRC, ''); ok(!off.WQ_ON && !off.WQ_VERIFY, '끔(빈 값) = 줄 없음');

  console.log('== ④ 마을 바뀜 도장 고정물(낮 가운데 · 날 번호 그대로)');
  const FX = fixture('');
  const fo = FX.j ? FX.j.out : [];
  ok(fo.length === 4 && fo.every((x) => x.ch), '정본 문 넷이 마을 문 칸을 바꿨다(장 · 의뢰 집터 · 개간 일감 줄 · 개간 끝)', JSON.stringify(fo.map((x) => [x.name, x.ch, x.r])) + (FX.err ? ' ' + FX.err : ''));
  ok(fo.length === 4 && fo.every((x) => !x.ch || x.up), '바뀐 문마다 도장이 올랐다', JSON.stringify(fo.map((x) => [x.name, x.up])));

  console.log(`== ② 서버 판(시드 ${SEED} · ${DAYS}날 · 켬 셋) — verify 줄 · 켬 줄 ‖ 끈 줄`);
  const [qv, qon] = await Promise.all([lane('qv', PB, { T1415_WAKEQ: 'verify' }), lane('qon', PB + 100, { T1415_WAKEQ: '1' })]);
  const qoff = await lane('off', PB, {});
  ok(qv.ok && qon.ok && qoff.ok, '판 셋이 끝까지 돌았다', `${qv.code} · ${qon.code} · ${qoff.code}`);
  const vq = (qv.S && qv.S.q) || {}, oq = (qon.S && qon.S.q) || {};
  ok(vq.vis > 0 && vq.park > 0 && vq.pop > 0 && vq.vbad === 0, 'verify — 주차 몸을 열어 봤다 · 어긋남 0', `연 수 ${vq.vis} · 주차 ${vq.park} · 꺼냄 ${vq.pop} · 어긋남 ${vq.vbad} ${JSON.stringify(vq.vwhy || {})} ${JSON.stringify(vq.vex || [])}`);
  ok(qon.pos === qoff.pos && qon.world === qoff.world && qon.body === qoff.body && !!qoff.world, '켬 ↔ 끔 날 지문 같음(pos · world · body)');
  const keys = qoff.S ? Object.keys(qoff.S).filter((k) => typeof qoff.S[k] === 'number' && k !== 'slots') : [];
  const dif = keys.filter((k) => qoff.S[k] !== (qon.S || {})[k]);
  ok(keys.length > 20 && dif.length === 0, '켬 ↔ 끔 첫 거름 셈 전부 같음(거름 · 깨움 · 까닭 · 도장 …)', dif.length ? dif.map((k) => `${k} ${qoff.S[k]}→${qon.S[k]}`).join(' · ') : `셈 ${keys.length}칸 · 거름 ${qoff.S && qoff.S.skip}`);
  ok(oq.vskip > 0, '켬 — 줄이 건넌 몸(고리에서 안 연 거름)', `${oq.vskip} / 거름 ${qon.S && qon.S.skip} · 주차 ${oq.park} · 꺼냄 ${oq.pop} · 힙 최대 ${oq.heapMax}`);

  console.log('== 미끼 넷');
  const bait = (name, a, b) => { const n = SS_SRC.split(a).length - 1; if (n !== 1) return { n, r: null }; return { n, r: cmpModel(SS_SRC.replace(a, b)) }; };
  const B1 = bait('wake', '  delete(k) { const s0 = slotOf.get(k); if (WQ_ON && s0 !== undefined) qWake(s0);', '  delete(k) { const s0 = slotOf.get(k);');
  ok(B1.r && !(B1.r.same && B1.r.endBad === 0), 'ⓐ 깨움 사건 하나를 뺀 사본(players 지움) → ① 어긋남', B1.r ? `첫 갈림 #${B1.r.at} · 끝 다름 ${B1.r.endBad}` : `자리 ${B1.n}`);
  const B2 = bait('stale', '  while (T.length && !(now < T[0])) {', '  while (T.length && !(now < T[0] + 120)) {');
  ok(B2.r && !(B2.r.same && B2.r.endBad === 0), 'ⓑ 묵은 시각으로 꺼내는 사본(120ms 늦게) → ① 어긋남', B2.r ? `첫 갈림 #${B2.r.at} · 끝 다름 ${B2.r.endBad}` : `자리 ${B2.n}`);
  const B3 = bait('mat', '  A.VT[s] = n; A.SK[s] = t;   // 거른 셈은', '  // 거른 셈은');
  ok(B3.r && !(B3.r.same && B3.r.endBad === 0), 'ⓒ 칸을 안 쓰는 사본(`qMat` 무동작) → ① 어긋남', B3.r ? `첫 갈림 #${B3.r.at} · 끝 다름 ${B3.r.endBad}` : `자리 ${B3.n}`);
  const B4 = fixture('stamp'), b4 = B4.j ? B4.j.out.find((x) => x.name === '장') : null;
  ok(B4.bait === 1 && b4 && b4.ch && !b4.up, 'ⓓ 도장 안 찍는 사본(장 서기) → ④ 빨강(문은 바뀌었는데 도장 그대로)', `바꾼 자리 ${B4.bait} · ${JSON.stringify(b4)}`);

  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
  console.log(`\n=== ${pass} 통과 · ${fail} 실패 ===`);
  process.exit(fail ? 1 : 0);
})();
