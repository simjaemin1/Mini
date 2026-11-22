#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4   ← [T1426] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1426-eq-bind.js — 평형 판의 기본(1,900날 출발 · 판정 33 문턱) · 관측 열 · 긴 판 힙 · 땅값 손잡이(T1426) ==========
//
// ★무엇을 보나(파일 · 함수만 + 작은 v2 세계 8마을 300날 두 판 — 지도 시딩 0 · 서버 0)
//   ① `eq-run --print-defaults` = 출발 `make:1900` · 문턱 C1 0.05 · C3 0.1 · C2 0(판정 33) — 기본 날이나 문턱이 바뀌면 빨강
//   ② `lib-eq-crit.reached` — 멎는 줄(인구 · 식량 날치가 해마다 같음)은 들고 · 식량 날치가 해마다 15 % 움직이는 줄은 안 든다 · 끝 한 점이면 표시
//   ③ 관측 열 — `obsDay` 한 줄의 길이 = `OBS_COLS` · 이름 차례가 `lib-eq-crit.COL` 과 같다(열 하나를 빼면 진단 자 셋이 옆 열을 읽는다)
//   ④ 긴 판 힙 — `lib-heap.withHeap`: 없으면 6,144 MB 를 얹고 · 준 값은 그대로 · `LONG_RUN_HEAP_MB=0` 이면 안 얹는다 ·
//      `t1308-long-run` · `server-baseline-check` 가 그 문을 부른다(글자)
//   ⑤ 손잡이 `T1426_EXPAND_PRICE` — 그림자 값 환산 셈(나무 ÷ 식량 · 돌 ÷ 식량 · 값 없으면 null) · 끔 = 정적 표 · 켬 판이 끔 판과 땅을 다르게 산다(아이 둘)
//   미끼 넷(이 파일 안 — 정본 파일을 고친 사본을 임시 폴더에 쓰고 그 사본에 같은 물음을 한다):
//     `day` 기본 날 800 사본 → ① 빨강 · `crit` 문턱 C1 0.02 사본 → ① 빨강 · `col` 관측 열 하나(cpuMs) 뺀 사본 → ③ 빨강 · `heap` 기본 힙을 안 얹는 사본 → ④ 빨강
// 실행: node scripts/test-t1426-eq-bind.js   (아이 프로세스 여섯 · 약 30초)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SC = __dirname;

// ── 아이: 작은 v2 세계 300날 · 땅 산 셀 · 영토 합 ─────────────────────────────────────────────
if (process.argv[2] === '--child') {
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const w = econV2.createWorldV2({ seed: 1020, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  require(path.join(ROOT, 'server', 'trees')).attachToWorld(w);
  for (let d = 0; d < 300; d++) econV2.tickWorldV2(w);
  process.stdout.write('\n' + JSON.stringify({ exp: w.villages.reduce((a, v) => a + (v.expansions || 0), 0), size: +w.villages.reduce((a, v) => a + v.land.size, 0).toFixed(4) }));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null ? '  ' + info : ''}`); };
const T = fs.mkdtempSync(path.join(os.tmpdir(), 't1426-eqb-'));
// 정본 파일을 고친 사본(미끼) — 상대 require 를 정본 폴더로 · 바꾼 자리 수를 센다
const baitCopy = (name, from, to, extra) => {
  let s = fs.readFileSync(path.join(SC, name), 'utf8'); const n = s.split(from).length - 1;
  s = s.split(from).join(to);
  for (const [a, b] of extra || []) s = s.split(a).join(b);
  s = s.replace(/require\('\.\/([^']+)'\)/g, (m, f) => `require(${JSON.stringify(path.join(SC, f))})`);
  const f = path.join(T, name); fs.writeFileSync(f, s); return { f, n };
};
// ① 기본 — eq-run(정본 · 사본)에 같은 물음
const defaults = (file) => { const r = spawnSync(process.execPath, [file, '--print-defaults'], { encoding: 'utf8' }); try { return JSON.parse(r.stdout); } catch (e) { return null; } };
const defOk = (d) => !!(d && d.defDay === 1900 && d.from === 'make:1900' && d.crit && d.crit.c1 === 0.05 && d.crit.c3 === 0.1 && d.crit.c2 === 0);
// ③ 관측 열 — lib-eq-lab(정본 · 사본)의 obsDay 줄 ↔ OBS_COLS ↔ lib-eq-crit.COL
const Cr = require('./lib-eq-crit');
const colsOk = (labFile) => {
  delete require.cache[labFile]; const L = require(labFile);
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const w = econV2.createWorldV2({ seed: 7, villageCount: 4, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  require(path.join(ROOT, 'server', 'trees')).attachToWorld(w);
  econV2.tickWorldV2(w);
  const row = L.obsDay(w), C = L.OBS_COLS || [];
  const byName = { d: 'd', pop: 'pop', alive: 'alive', fd: 'foodDaysMed', jobs: 'jobShare', price: 'priceMed', fdDead: 'fdDeadTot', dead: 'deadTot', emig: 'emigTot', cpu: 'cpuMs' };
  const order = Object.entries(Cr.COL).every(([k, i]) => C[i] === byName[k]);
  return { ok: row.length === C.length && C.length === Object.keys(Cr.COL).length && order && row[1] === w.villages.reduce((a, v) => a + v.npcs.length, 0), len: row.length, cols: C.length };
};
try {
  console.log('[T1426] 평형 판 기본 · 관측 열 · 긴 판 힙 · 땅값 손잡이');
  // ① 기본
  const d0 = defaults(path.join(SC, 'eq-run.js'));
  ok(defOk(d0), '★① eq-run 기본 = 출발 make:1900 · 문턱 C1 0.05 ∧ C3 0.1 ∧ C2 0(판정 33)', JSON.stringify(d0 && { defDay: d0.defDay, crit: d0.crit }));
  // ② reached
  const mk = (n, f) => Array.from({ length: n }, (_, i) => { const d = i + 1; return [d, 1000 * (1 + 0.1 * Math.sin(2 * Math.PI * d / 365)), 8, f(d), {}, {}, 0, 0, 0, 0]; });
  const flat = Cr.reached(mk(4 * 365, () => 50), 365), moving = Cr.reached(mk(4 * 365, (d) => 50 * Math.pow(1.15, Math.floor(d / 365))), 365), edge = Cr.reached(mk(2 * 365, () => 50), 365);
  ok(flat.day === 730 && !flat.onlyLast && moving.day == null && edge.onlyLast === true, '★② 평형 닿음 — 멎은 줄은 730 에 듦 · 식량 날치가 해마다 15 % 움직이면 안 듦 · 잴 점이 끝 하나면 "끝 한 점뿐"', `${flat.day} · ${moving.day} · ${edge.day}(${edge.onlyLast})`);
  // ③ 관측 열
  const c0 = colsOk(path.join(SC, 'lib-eq-lab.js'));
  ok(c0.ok, '★③ 관측 열 — obsDay 한 줄 길이 = OBS_COLS = lib-eq-crit.COL 칸 수 · 이름 차례 같음 · 인구 칸 = 마을 사람 합', `${c0.len}/${c0.cols}`);
  // ④ 힙
  const H = require('./lib-heap');
  const h1 = H.withHeap('--require x', {}), h2 = H.withHeap('--max-old-space-size=100 -r y', {}), h3 = H.withHeap('-r z', { LONG_RUN_HEAP_MB: '0' });
  const callers = ['t1308-long-run.js', 'server-baseline-check.js'].every((f) => /require\('\.\/lib-heap'\)\.withHeap\(/.test(fs.readFileSync(path.join(SC, f), 'utf8')));
  ok(h1 === '--max-old-space-size=6144 --require x' && h2 === '--max-old-space-size=100 -r y' && h3 === '-r z' && callers, '★④ 긴 판 힙 — 없으면 6,144 MB · 준 값 그대로 · 0 이면 안 얹음 · t1308 · sbc 가 그 문을 부른다', `${h1} | ${h3} | 부름 ${callers}`);
  // ⑤ 땅값 손잡이
  const E = require(path.join(ROOT, 'sim', 'economy-sim'));
  const hasPx = typeof E.t1426ExpandPx === 'function';   // 옛 제품엔 없다 — 크래시 대신 ✗
  const px = hasPx ? E.t1426ExpandPx({ _priceCache: { food: 0.3, wood: 1.2, stone: 0.6 } }) : null, none = hasPx ? E.t1426ExpandPx({}) : undefined;
  ok(E.T1426_EXPAND_PRICE === false && E.EXPAND_PRICE_FOODEQ.wood === 1.67 && px && Math.abs(px.wood - 4) < 1e-9 && Math.abs(px.stone - 2) < 1e-9 && none === null, '⑤a 손잡이 끔 기본 · 그림자 값 환산(나무 1.2 ÷ 식량 0.3 = 4 · 돌 2) · 값 없으면 null(정적 표)', JSON.stringify(px));
  const kid = (on) => { const r = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env: Object.assign({}, process.env, { T1426_EXPAND_PRICE: on ? '1' : '' }), encoding: 'utf8' }); try { return JSON.parse(String(r.stdout).trim().split('\n').pop()); } catch (e) { return null; } };   // 엔진이 머리 줄을 stdout 에 찍는다 — 마지막 줄만
  const off = kid(false), on = kid(true);
  ok(off && on && off.exp > 0 && (off.exp !== on.exp || off.size !== on.size), '⑤b 켬 판이 끔 판과 땅을 다르게 산다(작은 세계 300날 — 손잡이가 실제로 땅값 셈에 걸린다)', `끔 ${off && off.exp}셀 · 켬 ${on && on.exp}셀`);

  // ── 미끼 넷 ─────────────────────────────────────────────────────────────────────────────
  // @bait day — 기본 날 800
  const bd = baitCopy('eq-run.js', 'const DEF_DAY = 1900;', 'const DEF_DAY = 800;');
  ok(bd.n === 1 && !defOk(defaults(bd.f)), '[미끼 day] 바꾼 자리 1곳(DEF_DAY 1900 → 800) — 기본 날이 바뀐 사본은 ① 빨강', `자리 ${bd.n}`);
  // @bait crit — 문턱 C1 0.02(lib-eq-crit 사본 + 그 사본을 싣는 eq-run 사본)
  const bc = baitCopy('lib-eq-crit.js', 'const DEF = Object.freeze({ c1: 0.05,', 'const DEF = Object.freeze({ c1: 0.02,');
  const be = baitCopy('eq-run.js', "require('./lib-eq-crit')", `require(${JSON.stringify(bc.f)})`);
  ok(bc.n === 1 && be.n === 1 && !defOk(defaults(be.f)), '[미끼 crit] 바꾼 자리 1곳(DEF c1 0.05 → 0.02) — 문턱이 바뀐 사본은 ① 빨강', `자리 ${bc.n}`);
  // @bait col — 관측 열 하나(cpuMs) 뺀 사본
  const bo = baitCopy('lib-eq-lab.js', "'emigTot', 'cpuMs'];", "'emigTot'];", [['fdDead, dead, emig, Math.round((cu.user + cu.system) / 1000)];', 'fdDead, dead, emig];']]);
  ok(bo.n === 1 && !colsOk(bo.f).ok, '[미끼 col] 바꾼 자리 1곳(OBS_COLS · obsDay 에서 cpuMs 열 뺌) — 열 하나 뺀 사본은 ③ 빨강', `자리 ${bo.n}`);
  // @bait heap — 기본 힙을 안 얹는 사본
  const bh = baitCopy('lib-heap.js', "  if (e.LONG_RUN_HEAP_MB === '0') return o;", "  return o;");
  delete require.cache[bh.f]; const BH = require(bh.f);
  ok(bh.n === 1 && BH.withHeap('--require x', {}) !== '--max-old-space-size=6144 --require x', '[미끼 heap] 바꾼 자리 1곳(늘 그대로 돌려줌) — 힙을 안 얹는 사본은 ④ 빨강', `자리 ${bh.n}`);
} finally { fs.rmSync(T, { recursive: true, force: true }); }
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
