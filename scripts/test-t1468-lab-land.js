#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1468] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1468-lab-land.js — 랩 땅이 지도에 묶인다(`T1468_LAB_LAND` · ★재민 11-23 판정 81 "그래 나") ==========
//
// ★구운 표(`sim/lab-land-hanbando.json` — `scripts/t1468-land-bake.js` 가 서버 정본 고르기로 굽는다)를 랩이 읽는가 · 그 표가 지금 지도의 것인가.
//   ① 표 = 지금 지도 — 표의 `sig` = `t1468-land-bake.js --sig`(지도 원천 파일 · 개울 래스터 · 서버 고르기 규칙 글자의 지문)
//   ② 끝을 못 넘는다 — 작은 v2 세계(마을 8 · 시드 1020 · 습격 0)의 마을 이름을 표 앞 여덟 마을로 · 100날 뒤 표의 끝을 "지금 + 0.2(5칸)"로 좁혀(아이 안에서만 —
//      표를 다시 굽지 않는다) 200날 더 · 켬: 모든 마을 `land.size ≤ 끝` · 끝에 닿은 마을 ≥ 1(`_t1468Full`) — 끔(전제): 끝을 넘긴 마을 ≥ 1
//   ③ 두 마을이 한 칸을 세지 않는다 — 작은 손 지도(48 × 24 · 가운데 벽 하나에 문 둘)에 두 마을을 붙여 굽기의 넓히기 고리(`growAll` — 서버 `_terrPick` 그대로)를
//      끝까지 → 두 영토 겹침 0 · 합 = 갈 수 있는 칸 전부(막힌 칸 0)
//   ④ 사본 0 — 굽기가 고르는 함수 = 서버 `_terrGrowCore` 가 부르는 바로 그 `_terrPick`(굽기에 제 점수식이 없고 · 서버 넓히기가 그 함수 하나를 부른다) ·
//      손 지도 위 `_t1468Probe.pick` 한 번 = 같은 자리 `_terrGrowCore` 하루(마을 C — 후보가 하루 몫보다 많아 점수가 고른다 · 목표 끝없음)
//   ⑤ 끔 = 종전 바이트 — 손잡이 끔 판 = 손잡이 줄을 지운 사본 판(②의 세계 · 300날 · 날마다 마을 땅 · 인구)
//   미끼 다섯(이 파일 안 — 아이가 글자를 싣는 순간 한 자리를 바꾼다 · 미끼 아이가 끝까지 돌아 값을 낸 때만 빨강으로 센다 — 죽은 아이는 통과 아님):
//     `over` 끝 검사를 지운 econ → ② 빨강 · `share` 남의 영토 칸 거르기를 지운 서버 고르기 → ③ 빨강 · `stale` 지도 원천 한 글자 바꾼 지문 → ① 빨강 ·
//     `copy` 굽기가 제 점수식(비옥도 가중 다른 수)으로 고름 → ④ 빨강 · `offdiff` 끔에서도 끝을 보는 econ → ⑤ 빨강
// 실행: node scripts/test-t1468-lab-land.js   (아이 아홉 · 약 60초)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const TAB = path.join(ROOT, 'sim', 'lab-land-hanbando.json');
const CAP = '    if (_t1468 && v.land.size + 1 / EXPAND_CELLS_PER_SLOT > _t1468.max + 1e-9) {';
const ROW = "  const _t1468 = T1468_ON ? t1468Row(v) : null;";
const OWN = '      if (near && near.length && _t569OwnedBy(near, nk)) continue;';
const BAITS = {
  over: ['sim/economy-sim.js', CAP, '    if (false) {'],
  offdiff: ['sim/economy-sim.js', ROW, "  const _t1468 = (() => { const T = t1468Table(); return T && T._byName[v.name] || null; })();"],
  share: ['server/villages.js', OWN, '      // (지운 줄)'],
  copy: ['server/villages.js', '  const fertW = 3.5, compactW = 0, distW = 0.1;\n  const K = (x, y) => x + \',\' + y;\n  const N4', '  const fertW = 0.35, compactW = 0, distW = 0.1;\n  const K = (x, y) => x + \',\' + y;\n  const N4'],
  noline: ['sim/economy-sim.js', ROW, '  const _t1468 = null;'],
};
// `copy` 는 "굽기가 서버와 다른 고르기 함수를 쓰는 사본" — 굽기 쪽 고르기만 바꾸는 꼴로 서버 사본(굽기 아이가 싣는 villages.js)을 바꾸고,
//   ④ 는 그 아이의 `pick` 을 **미끼 없는 서버**(다른 아이)의 `_terrGrowCore` 하루와 맞댄다 → 다르면 빨강.

function hook(bait) {
  if (!bait) return;
  const R = BAITS[bait]; const tgt = path.join(ROOT, R[0]);
  const M = require('module'), old = M._extensions['.js'];
  M._extensions['.js'] = function (m, f) {
    if (f !== tgt) return old(m, f);
    const x = fs.readFileSync(f, 'utf8');
    if (!x.includes(R[1])) { process.stdout.write('\n' + JSON.stringify({ err: '미끼 자리 없음 ' + bait })); process.exit(0); }
    m._compile(x.replace(R[1], R[2]), f);
  };
}

// ── 아이: 세계(②⑤) ───────────────────────────────────────────────────────────────────
if (process.argv[2] === '--world') {
  hook(process.env.T1468_BAIT);
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const w = econV2.createWorldV2({ seed: 1020, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  require(path.join(ROOT, 'server', 'trees')).attachToWorld(w);
  const T = E.t1468Table();
  if (!T) { process.stdout.write('\n' + JSON.stringify({ err: '표 없음' })); process.exit(0); }
  const V = w.villages;
  V.forEach((v, i) => { v.name = T.villages[i].name; });
  const out = { days: [], over: 0, full: 0, grew: 0, n: 0 };
  for (let d = 0; d < 300; d++) {
    if (d === 100) for (const v of V) { const R = T._byName[v.name]; R.max = v.land.size + 0.2; v._t1468S0 = v.land.size; }   // 아이 안에서만 끝을 좁힌다(지금 + 5칸)
    econV2.tickWorldV2(w);
    out.days.push(V.map((v) => [+v.land.size.toFixed(4), v.npcs.length]));
  }
  for (const v of V) { const R = T._byName[v.name]; out.n++; if (v.land.size > R.max + 1e-9) out.over++; if (v._t1468Full != null) out.full++; if (v.land.size > v._t1468S0 + 1e-9) out.grew++; }
  process.stdout.write('\n' + JSON.stringify(out));
  process.exit(0);
}

// ── 아이: 손 지도(③④) ────────────────────────────────────────────────────────────────
//   48 × 24 칸 · x = 24 에 세로 벽(y = 6 · 17 두 칸만 문) · 바깥 둘레는 막힘 · 비옥도 = 왼쪽 위가 높은 기울기. 마을 A(10, 12) · B(14, 12) — 붙어 있다(이웃).
function handMap() {
  const W = 48, H = 24;
  const blocked = (x, y) => x < 0 || y < 0 || x >= W || y >= H || (x === 24 && y !== 6 && y !== 17);
  const ta = { isBlocked: blocked, isWater: () => false, fert: (x, y) => Math.max(0, Math.min(1, 1 - (x + y) / (W + H))) };
  const start = (cx, cy) => { const s = []; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) s.push((cx + dx) + ',' + (cy + dy)); return s; };
  let free = 0; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (!blocked(x, y)) free++;
  const sq = (cx, cy, r) => { const s = []; for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) s.push((cx + dx) + ',' + (cy + dy)); return s; };
  //   마을 C(④ 전용 · 벽 오른쪽 36, 12 · 19 × 19 시작) — 둘레 후보 76 > 하루 몫 60 이라 점수가 무엇을 고를지 가른다(작은 마을은 후보를 다 가져 점수가 안 보인다)
  return { ta, free, vils: [{ name: 'A', ccx: 10, ccy: 12, cells: start(10, 12) }, { name: 'B', ccx: 14, ccy: 12, cells: start(14, 12) }], c: { name: 'C', ccx: 36, ccy: 12, cells: sq(36, 12, 9) } };
}
if (process.argv[2] === '--hand') {
  process.env.ENABLE_VILLAGES = '0';
  process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `t1468-h-${process.pid}.db`);
  hook(process.env.T1468_BAIT);
  const P = require(path.join(ROOT, 'server', 'villages.js')).__labProbe;
  const B = require(path.join(ROOT, 'scripts', 't1468-land-bake.js'));
  const H = handMap();
  const mk = () => H.vils.map((h) => ({ name: h.name, ccx: h.ccx, ccy: h.ccy, _terrSet: new B.FrontierSet(h.cells), econ: { land: { size: 1e9 }, npcs: [], founder: null } }));
  const out = {};
  // ③ 끝까지 함께 넓히기
  const V = mk(); const keep = P._t1468Probe.setup({ ta: H.ta, villages: V });
  const g = B.growAll(P, V);
  const a = V[0]._terrSet.all, b = V[1]._terrSet.all; let both = 0, blk = 0;
  for (const k of a) { if (b.has(k)) both++; }
  for (const S of [a, b]) for (const k of S) { const ci = k.indexOf(','); if (H.ta.isBlocked(+k.slice(0, ci), +k.slice(ci + 1))) blk++; }
  out.three = { both, blk, sum: a.size + b.size, free: H.free, rounds: g.round };
  // ④ 한 번 고르기 — `pick`(굽기가 부르는 그것)의 결과(마을 C · 첫 바퀴)
  const C = { name: H.c.name, ccx: H.c.ccx, ccy: H.c.ccy, _terrSet: new B.FrontierSet(H.c.cells), econ: { land: { size: 1e9 }, npcs: [], founder: null } };
  P._t1468Probe.setup({ ta: H.ta, villages: [C] });
  out.pick = P._t1468Probe.pick(C, Infinity);
  P._t1468Probe.setup(keep);
  // ④ 글자: 굽기에 제 점수식이 없다 · 서버 넓히기가 `_terrPick` 하나를 부른다
  const BS = fs.readFileSync(path.join(ROOT, 'scripts', 't1468-land-bake.js'), 'utf8'), VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  out.text = { bakeNoScore: !/fertW|distW|Math\.hypot\([^)]*\)\s*\*\s*0\.1|3\.5\s*\*/.test(BS), bakeCallsProbe: /_t1468Probe\.pick\(/.test(BS), coreCallsPick: /function _terrGrowCore[\s\S]{0,4000}?_terrPick\(vil, target\)/.test(VS) };
  process.stdout.write('\n' + JSON.stringify(out));
  process.exit(0);
}
//   ④ 맞대는 쪽 — 미끼 없는 서버의 `_terrGrowCore` 하루(같은 손 지도 · 목표 끝없음)가 마을 C 에 더한 칸
if (process.argv[2] === '--core') {
  process.env.ENABLE_VILLAGES = '0';
  process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `t1468-c-${process.pid}.db`);
  const Vm = require(path.join(ROOT, 'server', 'villages.js')), P = Vm.__labProbe;
  const H = handMap();
  const V = [H.c].map((h) => ({ name: h.name, ccx: h.ccx, ccy: h.ccy, _terrSet: new Set(h.cells), econ: { land: { size: 1e9 }, npcs: new Array(1e5), founder: null } }));   // 목표 · 상한이 하루 몫을 안 막게(땅 · 사람 끝없음)
  const keep = P._t1468Probe.setup({ ta: H.ta, villages: V });
  const before = new Set(V[0]._terrSet);
  let added = null;
  if (P._t1468Probe.growCore) { P._t1468Probe.growCore(V[0], Infinity); added = [...V[0]._terrSet].filter((k) => !before.has(k)); }
  P._t1468Probe.setup(keep);
  process.stdout.write('\n' + JSON.stringify({ added }));
  process.exit(0);
}

// ── 아이: 지도 지문(①) — 굽기의 `mapSig` 그대로 · `stale` = 지도 원천(존 지형 표)에 한 글자를 더한 사본 나무 위에서 잰다(표는 옛 지도의 것이 된다) ──
if (process.argv[2] === '--sig') {
  process.env.ENABLE_VILLAGES = '0';
  process.env.DB_PATH = process.env.DB_PATH || path.join(require('os').tmpdir(), `t1468-s-${process.pid}.db`);
  const B = require(path.join(ROOT, 'scripts', 't1468-land-bake.js'));
  const { streamSig } = B.terrain();
  let root = ROOT, tmp = null;
  if (process.env.T1468_BAIT === 'stale') {
    tmp = require('./lib-tmp').dir('t1468_stale');   // 판 끝에 지운다(lint ㉑)
    for (const f of B.MAP_FILES.concat(['server/villages.js'])) { const src = path.join(ROOT, f), dst = path.join(tmp, f); if (!fs.existsSync(src)) continue; fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); }
    fs.appendFileSync(path.join(tmp, 'server/hanbando-terrain.json'), '\n');
    root = tmp;
  }
  const sig = B.mapSig(streamSig, root);
  process.stdout.write('\n' + JSON.stringify({ sig }));
  process.exit(0);
}

// ── 부모 ─────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null ? '  ' + info : ''}`); };
const kid = (mode, env) => {
  const r = spawnSync(process.execPath, [__filename, mode], { cwd: ROOT, env: Object.assign({}, process.env, { T1468_LAB_LAND: '', T1468_BAIT: '' }, env), encoding: 'utf8', maxBuffer: 64 << 20 });
  const lines = String(r.stdout || '').trim().split('\n');
  try { return JSON.parse(lines[lines.length - 1]); } catch (e) { return { err: 'json — ' + String(r.stderr || '').slice(-300) }; }
};
const sigNow = (bait) => { const o = kid('--sig', bait ? { T1468_BAIT: bait } : {}); return o && (o.sig || o.err); };
const tab = fs.existsSync(TAB) ? JSON.parse(fs.readFileSync(TAB, 'utf8')) : null;
const q1 = (s) => !!(tab && s && tab.sig === s);
const q2 = (on) => !!(on && !on.err && on.over === 0 && on.full >= 1);
const q3 = (h) => !!(h && h.three && h.three.both === 0 && h.three.blk === 0 && h.three.sum === h.three.free);
const q4 = (h, c) => !!(h && h.text && h.text.bakeNoScore && h.text.bakeCallsProbe && h.text.coreCallsPick && c && Array.isArray(c.added) && JSON.stringify([...h.pick].sort()) === JSON.stringify([...c.added].sort()));
const q5 = (off, cp) => !!(off && cp && !off.err && !cp.err && JSON.stringify(off.days) === JSON.stringify(cp.days));

const t0 = Date.now();
console.log('[T1468] 랩 땅이 지도에 묶인다');
console.log(`  표 ${tab ? `${tab.villages.length}마을 · 지문 ${tab.sig} · 끝 합 ${tab.villages.reduce((a, v) => a + v.end, 0).toLocaleString()}칸` : '없음'}`);
const S = sigNow();
ok(q1(S), '① 구운 표 = 지금 지도(표 지문 = 굽기 `mapSig` — 지도 원천 · 개울 래스터 · 고르기 글자)', `${tab && tab.sig} · ${S}`);
const OFF = kid('--world', {}), ON = kid('--world', { T1468_LAB_LAND: '1' });
ok(!!(OFF && !OFF.err && OFF.over >= 1), '② 전제 — 끔: 좁힌 끝을 넘겨 산 마을 ≥ 1', OFF && (OFF.err || `넘김 ${OFF.over}/${OFF.n} · 넓힘 ${OFF.grew}`));
ok(q2(ON), '② 켬: 모든 마을 땅 ≤ 지도 끝 · 끝에 닿은 마을 ≥ 1', ON && (ON.err || `넘김 ${ON.over}/${ON.n} · 끝에 닿음 ${ON.full} · 넓힘 ${ON.grew}`));
const HAND = kid('--hand', {}), CORE = kid('--core', {});
ok(q3(HAND), '③ 두 마을이 한 칸을 세지 않는다 · 막힌 칸 0 · 합 = 갈 수 있는 칸 전부', HAND && (HAND.err || JSON.stringify(HAND.three)));
ok(q4(HAND, CORE), '④ 사본 0 — 굽기 고르기 = 서버 `_terrGrowCore` 하루(손 지도 · 마을 C · 후보 76 중 60)', HAND && CORE && (HAND.err || CORE.err || `pick ${HAND.pick && HAND.pick.length} · core ${CORE.added && CORE.added.length} · 글자 ${JSON.stringify(HAND.text)}`));
const CP = kid('--world', { T1468_BAIT: 'noline' });
ok(q5(OFF, CP), '⑤ 끔 = 손잡이 줄을 지운 사본(마을 8 · 300날 · 날마다 땅 · 인구)', CP && (CP.err || `${OFF.days.length}날`));

console.log('  — 미끼(이 파일 안)');
// @bait over
const bOver = kid('--world', { T1468_LAB_LAND: '1', T1468_BAIT: 'over' });
ok(!!(bOver && !bOver.err) && !q2(bOver), '[미끼 over] 바꾼 자리 1곳(끝 검사를 지운 econ) → ② 빨강', bOver && (bOver.err || `넘김 ${bOver.over}`));
// @bait share
const bShare = kid('--hand', { T1468_BAIT: 'share' });
ok(!!(bShare && bShare.three) && !q3(bShare), '[미끼 share] 바꾼 자리 1곳(남의 영토 칸 거르기를 지운 고르기) → ③ 빨강', bShare && (bShare.err || JSON.stringify(bShare.three)));
// @bait stale
const bStale = sigNow('stale');
ok(/^[0-9a-f]{16}$/.test(String(bStale)) && !q1(bStale), '[미끼 stale] 바꾼 자리 1곳(지도 원천에 한 글자 — 옛 표) → ① 빨강', bStale);
// @bait copy
const bCopy = kid('--hand', { T1468_BAIT: 'copy' });
ok(!!(bCopy && Array.isArray(bCopy.pick)) && !q4(bCopy, CORE), '[미끼 copy] 바꾼 자리 1곳(굽기가 다른 고르기 — 비옥도 가중 3.5 → 0.35) → ④ 빨강', bCopy && (bCopy.err || `pick ${bCopy.pick && bCopy.pick.length}`));
// @bait offdiff
const bOff = kid('--world', { T1468_BAIT: 'offdiff' });
ok(!!(bOff && !bOff.err && bOff.days) && !q5(bOff, CP), '[미끼 offdiff] 바꾼 자리 1곳(끔에서도 끝을 보는 econ) → ⑤ 빨강', bOff && (bOff.err || ''));

console.log(`\n[T1468] ${pass}/${fail} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
process.exit(fail ? 1 : 0);
