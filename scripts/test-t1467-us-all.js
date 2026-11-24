#!/usr/bin/env node
'use strict';
// @regress
// @bait 5
// @old-red-also scripts/us-line.js server/zone.js
// === scripts/test-t1467-us-all.js — µs 열두째: 자의 첫 줄 = 틱 µs/사람 · 덩이 만짐 표 · 시범 `T1467_STILL`(끔 = 종전 · 켬 = 같은 답) ===
//   판을 띄우지 않는다 — 지난 자 판 둘(표본기 끈 `계측/T1425_2026-11-22/nl/mainNL1.json` · 표본기 켠 `계측/T1415_2026-11-21/ruler/main1.json`)을 틀로 삼아
//   지금 `scripts/t646-anatomy.js table` · `scripts/us-line.js line` 사본을 임시 폴더에서 돈다(레포 무접촉).
//   ① 첫 줄 = 틱 µs/사람 — 하네스가 판 파일에서 바로 센 값(구간 합 ÷ 틱 ÷ 사람 · 사람 = 틱마다 npcs 수의 평균)과 같은가 · 덩이 µs/사람 합 = 첫 줄 ·
//      첫 줄에 몸 수 · 표본기 끔/켬이 찍히는가 · 최악 = 조각 p99 틱 ÷ 사람
//   ② 표본기 — 표본기 켠 판(`--lines`)은 첫 줄이 "표본기 켬 ⚠" 을 단다(T1425 ㉢: 표본기가 틈을 만든다 — 켠 채 잰 수를 끈 수로 읽지 않게)
//   ③ 덩이 만짐 표(`us-line touch`) — 몸 하나 ns = 덩이 µs/사람 × 사람 ÷ 만진 몸/틱 × 1000 · 달라진 것 없이 만진 몫 = 1 − 달라진 ÷ 표본 (셈 판 파일 꼴 그대로의 작은 판)
//   ④ 시범 `T1467_STILL` 모형(존을 띄우지 않는다 — `server/zone.js` 글자에서 `_wwPreOne` · 이동 문 건넘 줄 · 계단·HP 바퀴 건넘 줄을 그대로 떠서 싣는다):
//      몸 40 · 틱 400 대본(섬 · 걸음 · 밀림 · 지형 세대 · 길 준비 · 판 시계 밭 몸 · 위층 · 넘김 · 허기 · 계단 생김)을 세 판으로 —
//      종전 판(origin 글자 — 이 파일에 박은 `_wwPreOne` · 바퀴 몸통) ↔ 끈 판(지금 글자 · 손잡이 끔) ↔ 켠 판(손잡이 켬).
//      끈 판 = 종전 판(몸 칸 전부 · 칸 이름까지 · 커널 줄 차례 · 도장 셈) · 켠 판 = 종전 판(몸 칸 전부 — 켬도 몸에 칸을 안 붙인다) · 켠 판이 실제로 건넜다(> 0).
//   ★미끼 다섯 [T1356 규약]: ⓐ 첫 줄이 덩이 합과 다른 us-line 사본(첫 줄 = 몸 µs) → ① 빨강 · ⓑ 건너뛴 몸을 분모에서 뺀 t646 사본(사람 × 0.6 — 조각 속임) → ① 빨강 ·
//     ⓒ 표본기를 켠 채 "끔" 으로 찍는 us-line 사본 → ② 빨강 · ⓓ 몸 수를 안 적는 us-line 사본 → ① 빨강 · ⓔ 손잡이 문을 뗀 zone 사본(끔에서도 건넌다 — 한 칸이라도 다르다) → ④ 빨강
//   날짜 · 벽시계를 안 쓴다(판 파일의 수 · 틱 번호 대본만).
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib'), vm = require('vm'), { spawnSync } = require('child_process');
if (require.main === module) require('./lib-port').noCentral();   // [T1288 ⑯d] 존을 띄우지 않는다(zone.js 글자만 읽는다) — 자식(us-line 사본)이 혹시 존을 띄워도 남의 central 에 붙지 않게
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const T646 = fs.readFileSync(path.join(ROOT, 'scripts', 't646-anatomy.js'), 'utf8'), USL = fs.readFileSync(path.join(ROOT, 'scripts', 'us-line.js'), 'utf8'), RULE = fs.readFileSync(path.join(ROOT, 'scripts', 'lib-tick-rule.js'), 'utf8');
const ZONE = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1467-us-'));
const FX_OFF = path.join(ROOT, '계측', 'T1425_2026-11-22', 'nl', 'mainNL1.json'), FX_ON = path.join(ROOT, '계측', 'T1415_2026-11-21', 'ruler');
const bait = (src, a, b) => { const n = src.split(a).length - 1; return { src: n === 1 ? src.replace(a, () => b) : null, n }; };

// 판 하나를 임시 폴더에 두고 사본 자로 표 · 줄을 낸다
function world(name, opt) {
  const D = path.join(TMP, name), S = path.join(D, 'scripts'), P = path.join(D, 'pan'); fs.mkdirSync(S, { recursive: true }); fs.mkdirSync(P, { recursive: true });
  fs.writeFileSync(path.join(S, 't646-anatomy.js'), opt.t646 || T646); fs.writeFileSync(path.join(S, 'us-line.js'), opt.usl || USL); fs.writeFileSync(path.join(S, 'lib-tick-rule.js'), RULE);
  let j;
  if (opt.prof) {
    j = JSON.parse(fs.readFileSync(path.join(FX_ON, 'main1.json'), 'utf8')); const L = path.join(P, 'lines-fx1.jsonl');
    fs.writeFileSync(L, zlib.gunzipSync(fs.readFileSync(path.join(FX_ON, 'lines-main1.jsonl.gz'))));
    j.lines.file = L;
  } else j = JSON.parse(fs.readFileSync(FX_OFF, 'utf8'));
  j.tag = 'fx1'; fs.writeFileSync(path.join(P, 'fx1.json'), JSON.stringify(j));
  const r = spawnSync(process.execPath, [path.join(S, 'us-line.js'), 'line', '--dir', P, '--arm', 'fx', '--seg'], { cwd: D, encoding: 'utf8', maxBuffer: 1 << 28 });
  let U = null; try { U = JSON.parse(fs.readFileSync(path.join(P, 'us-line.json'), 'utf8')); } catch (e) {}
  return { j, U, out: r.stdout || '', err: r.stderr || '', P, S, D };
}
// 하네스가 따로 센 값 — 창마다 구간 합 ÷ 틱 ÷ 사람(사람 = 틱마다 npcs 수의 평균) · p99 틱 ÷ 사람
function mine(j, W) {
  const w = j.windows.find((x) => x.W === W), A = { n: 0, popN: 0, seg: {} }, p99 = [];
  for (const sl of w.slices) for (const x of sl.ana) { A.n += x.n; A.popN += x.popN; for (const [k, v] of Object.entries(x.seg)) A.seg[k] = (A.seg[k] || 0) + v; if (x.tq) p99.push(x.tq.p99); }
  const pop = A.popN / A.n, us = (ms) => ms / A.n * 1000 / pop;
  p99.sort((a, b) => a - b); const m = p99.length ? (p99.length % 2 ? p99[(p99.length - 1) / 2] : (p99[p99.length / 2 - 1] + p99[p99.length / 2]) / 2) : null;
  return { pop: Math.round(pop), tick: us(Object.values(A.seg).reduce((s, v) => s + v, 0)), seg: Object.fromEntries(Object.entries(A.seg).map(([k, v]) => [k, us(v)])), worst: m == null ? null : m * 1000 / Math.round(pop) };
}
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) <= (e || 0.0015) * Math.max(1, Math.abs(b));
const firstLine = (out) => (out.split('\n').find((l) => / 틱 µs\/사람 낮 /.test(l)) || '');
function check1(W) {
  const u = W.U && W.U[0], F = u && u.first, D = mine(W.j, 'day'), N = mine(W.j, 'night'), L1 = firstLine(W.out);
  const segSum = F ? Object.values(F.segDayUs).reduce((s, v) => s + v, 0) : null;
  const mPop = /· 몸 (\d+) ·/.exec(L1);
  return { F, D, N, L1, segSum, c: !!F && near(F.day, D.tick, 0.002) && near(F.night, N.tick, 0.002) && near(segSum, F.day, 0.006) && near(F.worst, Math.max(D.worst || 0, N.worst || 0), 0.01) &&
    !!mPop && Math.abs(+mPop[1] - Math.round((D.pop + N.pop) / 2)) <= 1 && new RegExp('낮 ' + F.day.toFixed(3).replace('.', '\\.')).test(L1) };
}

console.log('== ① 첫 줄 = 틱 µs/사람(구간 합 ÷ 틱 ÷ 사람 전부) · 덩이 합 · 몸 수');
const W0 = world('base', {}), C0 = check1(W0);
ok(!!C0.F && C0.D.pop > 0 && Object.keys(C0.D.seg).length >= 10, '[전제] 틀 판에 낮 · 밤 창 · 덩이 열둘 · 사람 수가 있다(0 이면 아래가 공짜)', `사람 ${C0.D.pop} · 덩이 ${Object.keys(C0.D.seg).length}`);
ok(C0.c, '첫 줄 = 하네스 셈 — 낮 · 밤 틱 µs/사람 · 덩이 µs/사람 합 = 첫 줄 · 최악 = p99 틱 ÷ 사람 · 첫 줄에 "몸 N"', `낮 ${C0.F && C0.F.day} ↔ ${C0.D.tick.toFixed(3)} · 밤 ${C0.F && C0.F.night} ↔ ${C0.N.tick.toFixed(3)} · 덩이 합 ${C0.segSum && C0.segSum.toFixed(3)} · 최악 ${C0.F && C0.F.worst && C0.F.worst.toFixed(3)}`);
ok(/표본기 끔/.test(C0.L1) && C0.F && C0.F.prof === false, '표본기 끈 판 — 첫 줄 "표본기 끔"', C0.L1.slice(0, 160));
ok(W0.out.split('\n').findIndex((l) => / 틱 µs\/사람 낮 /.test(l)) < W0.out.split('\n').findIndex((l) => /둘째 줄\(옛 걸음 µs/.test(l)), '옛 걸음 µs 는 둘째 줄(첫 줄 = 틱 µs/사람)');
ok(/\| 덩이\(낮 · µs\/사람\) \|/.test(W0.out) && /첫 줄\(판마다 덩이 합/.test(W0.out), '`--seg` 덩이 표가 µs/사람(합 줄 = 첫 줄)');

console.log('== ② 표본기 켠 판 — 첫 줄이 표시한다');
const W1 = world('prof', { prof: true }), C1 = check1(W1);
ok(C1.F && C1.F.prof === true && /표본기 켬 ⚠/.test(C1.L1), '표본기 켠 판(--lines) — 첫 줄 "표본기 켬 ⚠" · first.prof', C1.L1.slice(0, 160));

console.log('== ③ 덩이 만짐 표(us-line touch)');
{
  const P = path.join(TMP, 'touch'); fs.mkdirSync(P, { recursive: true });
  const seg = { '결정 문(순회)': { n: 1600, ms: 0, sn: 200, chg: 50, by: { '걷는': { n: 600, sn: 100, chg: 48 }, '서 있는': { n: 1000, sn: 100, chg: 2 } } },
    '계단·낙하·게이지·HP': { n: 1700, ms: 0, sn: 170, chg: 0, by: {} }, '공간 색인·입력 시한': { n: 1700, ms: 0, sn: 0, chg: 0, by: {} } };
  fs.writeFileSync(path.join(P, 't.json'), JSON.stringify({ every: 10, win: { day: { ticks: 1, sTicks: 1, popN: 1600, cls: {}, beh: {}, seg, tick: { n: 100, same: 40, sameXY: 2, keys: { x: 55, y: 54 }, keysXY: {} } } } }));
  fs.writeFileSync(path.join(P, 'us-line.json'), JSON.stringify([{ arm: 'fx', first: { pop: 1600, segDayUs: { '결정 문(순회)': 0.8, '계단·낙하·게이지·HP': 0.1, '공간 색인·입력 시한': 0.1 }, segNightUs: {} } }]));
  spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'us-line.js'), 'touch', '--dir', P, '--file', path.join(P, 't.json'), '--arm', 'fx'], { encoding: 'utf8' });
  let R = null; try { R = JSON.parse(fs.readFileSync(path.join(P, 'us-touch.json'), 'utf8')).day; } catch (e) {}
  const g = (k) => R && R.rows.find((x) => x.seg === k);
  ok(!!R && near(g('결정 문(순회)').nsBody, 0.8 * 1600 / 1600 * 1000) && near(g('계단·낙하·게이지·HP').nsBody, 0.1 * 1600 / 1700 * 1000) &&
     near(g('결정 문(순회)').unchanged, 0.75) && near(g('계단·낙하·게이지·HP').unchanged, 1) && near(g('공간 색인·입력 시한').unchanged, 1 - 55 / 100) &&
     near(R.unchangedTouch, (1600 * 0.75 + 1700 * 1 + 1700 * 0.45) / 5000), '몸 하나 ns = µs/사람 × 사람 ÷ 만진 수 × 1000 · 안 바뀐 몫 = 1 − 달라진 ÷ 표본 · 색인 = 자리 그대로 몫 · 합 = 만진 수 가중',
     R ? `ns ${g('결정 문(순회)').nsBody.toFixed(0)} · ${g('계단·낙하·게이지·HP').nsBody.toFixed(1)} · 몫 ${(R.unchangedTouch * 100).toFixed(1)} %` : '표 없음');
}

// ── ④ 시범 모형 ─────────────────────────────────────────────────────────────────
//   종전 글자(origin `server/zone.js` — 손잡이 앞) — `_wwPreOne` · 계단·HP 바퀴 몸통 · 서 있는 몸 뒷일
const OLD_PRE = `function _wwPreOne(p) {
  const _si = T774_ACTIVE_COL ? _t774I++ : 0;
  if (p.handingOff || !p.isNpc || p.simCaravan || p.simWar) return;
  if (T1241_DES && p._des) return;
  const cut = _wwCut;
  let c = 1;
  if (!p.canadiaVillage && !_t316WalkAlways(p) && !(T774_ACTIVE_COL ? _t774Act(p, _si) : isPositionActive(p.x, p.y))) c = 0;
  else if (p.floor || p.onStairId) c = 2;
  else if (cut && p.vx === 0 && p.vy === 0 && _wwIsStill(p, T774_ACTIVE_COL ? _si : undefined)) { c = 3; _streamWalkMul(p); }
  _wwSeq.push(p); _wwCode.push(c);
  if (c === 1) _wwList.push(p);
  else if (c === 3) { _wwStill.push(p); if (!_wwOn) _wwStill0.push(p.x, p.y, p.vx, p.vy); }
}`;
const cutFn = (src, head) => { const i = src.indexOf(head); if (i < 0) return null; let d = 0; for (let k = src.indexOf('{', i); k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && --d === 0) return src.slice(i, k + 1); } return null; };
const stripC = (s) => s.split('\n').map((l) => l.replace(/\s+\/\/.*$/, '')).join('\n');   // 줄 끝 주석만 뗀다(글자 안 `//` 없음 — 몸통 확인)
function lift(src) {
  const pre = cutFn(src, 'function _wwPreOne(p) {'), put = cutFn(src, 'function _t67Put(i, p) {');
  const mv = (/^ *if \((?:T1467_STILL && )?p === _t67Q\[_t67Qi\]\) \{ _t67Qi\+\+; continue; \}.*$/m.exec(src) || [''])[0].replace(/\s+\/\/.*$/, '');
  const sw = (/^ *if \(T1467_STILL && _stairNone[\s\S]*?\{ _t67st\.sweep\+\+; return; \}/m.exec(src) || [''])[0];
  return { pre: pre && stripC(pre), put: put && stripC(put), mv, sw };
}
//   모형 세계 — 존 함수 이름 그대로의 받침(`_wwIsStill` · `_streamWalkMul` · `Roads` · `SimVillages` · 다섯 걸음)
function sim(code, STILL) {
  const B = [], N = 40, TICKS = 400;
  const cx = (v) => Math.floor(v / 32);
  for (let i = 0; i < N; i++) B.push({ pid: 'p' + i, isNpc: true, simVillageId: i % 9 === 8 ? null : 'v' + (i % 4), simJob: i % 5 === 0 ? 'farmer' : 'miner', canadiaVillage: false,
    x: 100 + i * 40, y: 300 + (i % 7) * 33, vx: 0, vy: 0, floor: 0, onStairId: null, z: 0, falling: false, hp: 100, hunger: 100, thirst: 100, handingOff: false, simCaravan: false, simWar: false });
  const T = { stamp: 0, stampW: 0, stream: 0, kern: [], fall: 0, gauge: 0, stair: 0 };
  const ctx = { T774_ACTIVE_COL: true, _t774I: 0, T1241_DES: false, _wwCut: true, _wwOn: true, _wwTbGen: 0, T1467_STILL: STILL, _t67Q: [], _t67R: [], _t67Qi: 0, _t67X: new Float64Array(4), _t67Y: new Float64Array(4), _t67G: new Float64Array(4), _t67st: { sweep: 0 },
    _wwSeq: [], _wwCode: [], _wwList: [], _wwStill: [], _wwStill0: [], HUNGER_MAX: 100, THIRST_MAX: 100, T1197_BODY: false, _stairNone: true, ready: false, blocked: new Set(), s95: new Set(),
    _t316WalkAlways: (p) => !!p.simVillageId, actEdge: 1500, isPositionActive: (x, y) => x < ctx.actEdge,
    _t774Act: (p, i) => ctx.isPositionActive(p.x, p.y),
    _wwIsStill: (p, i) => !ctx.blocked.has(cx(p.x) + ',' + cx(p.y) + ',' + ctx._wwTbGen % 2),
    _streamWalkMul: (p) => { const a = cx(p.x), b = cx(p.y); if (p._stCx === a && p._stCy === b) return p._stMul; p._stCx = a; p._stCy = b; p._stMul = (a + b) % 3 ? 1 : 0.5; T.stream++; return p._stMul; },
    SimVillages: { t1295S: (p) => (ctx.s95.has(p.pid) ? 2 : 1) }, Roads: { isReady: () => ctx.ready } };
  const stamp = (p) => { if (!ctx.ready) return; const k = cx(p.y) * 1000 + cx(p.x); T.stamp++; if (p._rdK === k) return; p._rdK = k; p._rdMul = 1 + (k % 4) / 8; T.stampW++; };
  vm.createContext(ctx);
  vm.runInContext(code.pre + '\nthis._wwPreOne = _wwPreOne;' + (code.put ? '\n' + code.put + '\nthis._t67Put = _t67Put;' : ''), ctx);
  const mvSkip = code.mv ? vm.runInContext(`(function (p) { ${code.mv.replace('continue;', 'return true;')} return false; })`, ctx) : () => false;
  const swSkip = code.sw ? vm.runInContext(`(function (p) { ${code.sw.replace('return; }', 'return true; }')} return false; })`, ctx) : () => false;
  for (let t = 0; t < TICKS; t++) {
    // 대본(틱 번호 · 몸 번호로만)
    if (t === 3) ctx.ready = true;
    if (t === 120) { ctx._wwTbGen++; ctx.blocked.add(cx(B[6].x) + ',' + cx(B[6].y) + ',1'); }
    if (t === 260) ctx._wwTbGen++;
    for (let i = 0; i < N; i++) { const p = B[i], ph = (t + i * 13) % 97;
      if (ph === 10) { p.vx = 64 * ((i % 3) - 1 || 1); p.vy = 0; } else if (ph === 40) { p.vx = 0; p.vy = 0; }
      if ((t + i) % 53 === 0 && p.vx === 0) p.x += 3;   // 밀림(이동 문 뒤 · 서 있는 몸)
      if (i === 11 && t === 150) p.floor = 1; if (i === 11 && t === 170) p.floor = 0;
      if (i === 12 && t >= 200 && t < 210) p.handingOff = true; else if (i === 12) p.handingOff = false;
      if (i === 13 && t === 90) p.hunger = 40;
      if (i === 15 && t === 220) p.falling = true; if (i === 15 && t === 222) p.falling = false;
      if (i % 5 === 0 && t === 140) ctx.s95.add(p.pid); if (i % 5 === 0 && t === 300) ctx.s95.delete(p.pid);
      if (i === 20 && t >= 330 && t < 345) { p.x = 900; p.y = 400; }   // 걷다 같은 자리로 되돌아옴
    }
    if (t === 240) ctx._stairNone = false; if (t === 250) ctx._stairNone = true;
    if (t === 180) ctx.actEdge = 0; if (t === 230) ctx.actEdge = 1500;   // 칸이 잠들었다 깸(관측자 이동 흉내 — 서 있는 몸 자리 그대로)
    // 커널 준비
    ctx._wwSeq.length = 0; ctx._wwCode.length = 0; ctx._wwList.length = 0; ctx._wwStill.length = 0; ctx._t774I = 0;
    ctx._t67Q.length = 0; ctx._t67Qi = 0;   // 존: 켬이면 틱 머리에 비운다(끔이면 줄이 늘 비어 있다)
    for (const p of B) ctx._wwPreOne(p);
    for (const p of ctx._wwList) ctx._streamWalkMul(p);   // 커널 몸 — 배율 열(`RD[i]`)을 채울 때 개울 칸 기억(종전 `_wwPre` 고리 뒤)
    T.kern.push(ctx._wwList.map((p) => p.pid).join(','), ctx._wwStill.length + (STILL ? ctx._t67Q.length : 0));
    // 이동 문(모형 — 종전 `_moveOne` 의 마을 몸 갈래 차례)
    let cur = 0;
    for (const p of B) {
      if (p.handingOff || !p.isNpc || p.simCaravan || p.simWar) continue;
      if (mvSkip(p)) continue;
      if (p.simVillageId && ctx.s95.has(p.pid)) { p.vx = 0; p.vy = 0; if (p === ctx._wwSeq[cur]) cur++; p.x += 1; continue; }   // 판 시계 밭 몸 — 이동 문이 걷는다
      if (p === ctx._wwSeq[cur]) { const c = ctx._wwCode[cur++]; if (c === 1) { p.x += p.vx / 20; p.y += p.vy / 20; stamp(p); continue; } if (c === 3) { stamp(p); continue; } if (c === 0) continue; }
      if (!p.canadiaVillage && !ctx._t316WalkAlways(p) && !ctx.isPositionActive(p.x, p.y)) continue;
      p.x += p.vx / 20; p.y += p.vy / 20;   // 위층 · 계단 = JS 정본 걸음
    }
    // 계단·낙하·게이지·HP 바퀴(모형 — 다섯 걸음은 종전 문 그대로의 무동작 조건 · 무동작이 아니면 칸을 쓴다)
    ctx._t774I = 0;
    for (const p of B) {
      ctx._t774I++;
      if (swSkip(p)) continue;
      if (!p.handingOff) { if (!(ctx._stairNone && !p.onStairId && !(p.z > 0))) { T.stair++; p._stairSeen = (p._stairSeen || 0) + 1; } }
      if (!p.handingOff && p.floor) { T.fall++; } else if (p.falling) { p.falling = false; T.fall++; }
      if (p.isNpc && p.hp > 0) { if (p.hunger !== 100 || p.thirst !== 100) T.gauge++; p.hunger = 100; p.thirst = 100; }
    }
  }
  return { B, T, st: { skip: 0 }, K: ctx._t67st };
}
const worldOf = (B) => JSON.stringify(B.map((p) => { const o = {}; for (const k of Object.keys(p)) o[k] = p[k]; return o; }));   // 몸 칸 전부(칸 이름 · 차례까지 — 켬도 몸에 칸을 안 붙인다)
console.log('== ④ 시범 `T1467_STILL` 모형 — 끔 = 종전 · 켬 = 같은 답');
const L0 = lift(ZONE), OLD = { pre: OLD_PRE, mv: '', sw: '' };
ok(!!L0.pre && !!L0.mv && !!L0.sw, '[전제] zone.js 글자에서 `_wwPreOne` · 이동 문 건넘 줄 · 계단·HP 건넘 줄을 떴다', `${!!L0.pre} · ${!!L0.mv} · ${!!L0.sw}`);
const R0 = sim(OLD, false), Roff = sim(L0, false), Ron = sim(L0, true);
const kernSame = (a, b) => a.T.kern.join('|') === b.T.kern.join('|');
const walkSame = (a, b) => a.T.kern.filter((x, i) => i % 2 === 0).join('|') === b.T.kern.filter((x, i) => i % 2 === 0).join('|');   // 커널 줄(걷는 몸 차례)만 — 서 있는 몸 셈 뺌
ok(worldOf(Roff.B) === worldOf(R0.B) && kernSame(Roff, R0) && Roff.T.stampW === R0.T.stampW && Roff.T.stream === R0.T.stream,
  '끈 판 = 종전 판 — 몸 칸 전부(칸 이름까지) · 틱마다 커널 줄 차례 · 서 있는 몸 셈 · 길 도장 쓴 수 · 개울 칸 쓴 수', `도장 ${Roff.T.stampW}/${R0.T.stampW} · 개울 ${Roff.T.stream}/${R0.T.stream}`);
ok(worldOf(Ron.B) === worldOf(R0.B) && walkSame(Ron, R0) && Ron.T.stampW === R0.T.stampW && Ron.T.stream === R0.T.stream && Ron.T.gauge === R0.T.gauge && Ron.T.fall === R0.T.fall && Ron.T.stair === R0.T.stair,
  '켠 판 = 종전 판 — 몸 칸 전부(칸 이름 · 차례까지 — 기억은 슬롯 열에만) · 커널 줄(걷는 몸 차례) · 도장 · 개울 · 게이지 · 낙하 · 계단 걸음(서 있는 몸 셈은 칸이 잠든 틱만 다르다 — 아래)', `도장 쓴 수 ${Ron.T.stampW} · 계단 ${Ron.T.stair}/${R0.T.stair}`);
{ const d = []; for (let i = 1; i < R0.T.kern.length; i += 2) if (R0.T.kern[i] !== Ron.T.kern[i]) d.push((i - 1) / 2);
  ok(d.length > 0 && d.every((t) => t >= 180 && t < 230), '켠 판 서 있는 몸 셈(관측) — 다른 틱은 칸이 잠든 동안뿐(그 틱 종전은 그 몸을 갈래 0 으로 셈에서 뺀다 · 세계는 위처럼 같다)', `다른 틱 ${d.length} · ${d.length ? d[0] + ' ~ ' + d[d.length - 1] : '-'}`); }
ok(Ron.T.stamp < R0.T.stamp && Ron.K.sweep > 0, '[자명 통과 금지] 켠 판이 실제로 건넜다 — 서 있는 몸 뒷일(도장 부름) 줄어듦 · 계단·HP 바퀴 건넌 몸 > 0', `도장 부름 ${R0.T.stamp} → ${Ron.T.stamp} · 바퀴 건넘 ${Ron.K.sweep}`);

console.log('== 미끼 다섯');
{ const b = bait(USL, 'first = { day: TD.us, night: TN.us,', 'first = { day: TD.body, night: TN.body,'), W = b.src && world('ba', { usl: b.src }), C = W && check1(W);
  ok(b.n === 1 && C && !C.c, '미끼 ⓐ 첫 줄 = 몸 µs(덩이 합과 다른) us-line 사본 → ① 빨강', `바꾼 자리 ${b.n} · 첫 줄 ${C && C.F && C.F.day} ↔ ${C && C.D.tick.toFixed(3)}`); }
{ const b = bait(T646, 'const pop = A.popN / A.n, us = (ms) =>', 'const pop = A.popN / A.n * 0.6, us = (ms) =>'), W = b.src && world('bb', { t646: b.src }), C = W && check1(W);
  ok(b.n === 1 && C && !C.c, '미끼 ⓑ 건너뛴 몸을 분모에서 뺀 t646 사본(사람 × 0.6 — 연 몸만) → ① 빨강', `바꾼 자리 ${b.n} · 첫 줄 ${C && C.F && C.F.day} ↔ ${C && C.D.tick.toFixed(3)}`); }
{ const b = bait(USL, 'prof = R.some((x) => x.prof),', 'prof = false,'), W = b.src && world('bc', { usl: b.src, prof: true }), C = W && check1(W);
  ok(b.n === 1 && C && !(C.F && C.F.prof === true && /표본기 켬 ⚠/.test(C.L1)), '미끼 ⓒ 표본기를 켠 판을 "끔" 으로 찍는 us-line 사본 → ② 빨강', `바꾼 자리 ${b.n} · ${C && C.L1.slice(0, 90)}`); }
{ const b = bait(USL, ' · 몸 ${popM} · 표본기', ' · 표본기'), W = b.src && world('bd', { usl: b.src }), C = W && check1(W);
  ok(b.n === 1 && C && !C.c, '미끼 ⓓ 몸 수를 안 적는 us-line 사본 → ① 빨강', `바꾼 자리 ${b.n} · ${C && C.L1.slice(0, 90)}`); }
{ let z = ZONE, n = 0; for (const [a, c] of [['if (T1467_STILL && cut && _t67R[_si] === p', 'if (cut && _t67R[_si] === p'], ['if (T1467_STILL && Roads.isReady()) _t67Put(_si, p);', 'if (Roads.isReady()) _t67Put(_si, p);'], ['if (T1467_STILL && p === _t67Q[_t67Qi])', 'if (p === _t67Q[_t67Qi])']]) { const b = bait(z, a, c); if (b.src) { z = b.src; n++; } }
  const Lb = lift(z), Rb = sim(Lb, false);
  ok(n === 3 && !(kernSame(Rb, R0) && Rb.T.stamp === R0.T.stamp), '미끼 ⓔ 손잡이 문을 뗀 zone 사본(끔에서도 건넌다 — 커널 줄 · 서 있는 몸 셈 · 도장 부름이 한 칸이라도 다르다) → ④ 끈 판 ≠ 종전 판 빨강', `바꾼 자리 ${n} · 도장 부름 ${Rb.T.stamp}/${R0.T.stamp}`); }

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== T1467 자 · 시범 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
