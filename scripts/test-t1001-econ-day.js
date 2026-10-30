#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1001-econ-day.js — 길의 날 · NPC 광맥 시각 = econ 날(`T990_ECON_DAY`) 켬 기본 · 부팅 맞춤 몫(T1001 · 2026-10-30) =====================
//
// 판정 사본 0: 진짜 `server/roads.js` 를 판마다 새로 싣고(제 DB 하나 · `test-road-day` 의 그 꼴) 같은 연산 줄(스탬프 · 조회)을 econ 날마다 먹인다.
//   벽시계는 판마다 다르게 흐른다(한 판은 econ 하루 = 벽 하루 · 다른 판은 econ 하루 = 벽 7일 + 부스러기 — 빠른 판 자에서 econ 이 밀린 꼴).
//   지키는 것:
//     ⓪ 정적 — zone 손잡이 글자 `const T990_ECON_DAY = process.env.T990_ECON_DAY !== '0';` 하나(env 를 읽는 자리 하나) · 쓰는 자리 넷(길 넘김 · `dayRoads` ·
//        광맥 시각 · 15분 정리)이 그 상수를 읽는다 · 길 · 광맥 둘 다 부팅 맞춤 몫(`_t1001RoadOff` · `_t1001OreOff`)
//     ① 켬(econ 날 함수를 넘긴 판) — 두 벽시계 판의 길 셀 값(v) · 벤 날의 차(d − 맞춤 몫) · 코스 등급 · 다져진 길이 날마다 같다
//        (맞춤 몫을 판마다 다르게 줘도 — 감쇠는 날의 차만 읽는다 = 라이브 길 줄 `d` 에 이어 붙여도 판 값 무변)
//     ② 그리고 켬 판의 길의 날은 econ 날을 따른다(마지막 econ 날 + 맞춤 몫 = 길 하루 날)
//     ③ ★자명 통과 금지 — 끔(함수 안 넘김 · 종전 벽시계 날)이면 같은 두 벽시계 판이 갈린다
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// ── ⓪ 정적 ──
{
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const reads = (Z.match(/process\.env\.T990_ECON_DAY/g) || []).length;
  const uses = [/if \(T990_ECON_DAY && Roads\.setEconDay\) Roads\.setEconDay\(/, /dayRoads: T990_ECON_DAY \? \(\) => Roads\.dayTick\(\) : null,/,
    /const _npcOreNow = \(\) => \{ if \(T990_ECON_DAY\)/, /\n  if \(T990_ECON_DAY\) \{\n    const now = _npcOreNow\(\);/].map((r) => r.test(Z));
  ok(/const T990_ECON_DAY = process\.env\.T990_ECON_DAY !== '0';/.test(Z) && reads === 1 && uses.every(Boolean)
    && /_t1001RoadOff = Math\.floor\(\(Date\.now\(\) - \(WORLD\.worldEpoch \|\| 0\)\) \/ _t1001RoadDayMs\) - d; return d \+ _t1001RoadOff;/.test(Z)
    && /_t1001OreOff = Date\.now\(\) - d \* _t990OreDayMs; return d \* _t990OreDayMs \+ _t1001OreOff;/.test(Z),
    "⓪ 손잡이 — `!== '0'` 하나(★[T1001] 켬 기본 · 되돌림 `=0`) · 쓰는 자리 넷이 그 상수 · 길 · 광맥 부팅 맞춤 몫", `env 읽기 ${reads} · 자리 ${uses.map(Number).join('')}`);
}

// ── 판 싣기(가짜 벽시계 · 제 DB) — `test-road-day` 그 꼴 ──
let NOW = 0; Date.now = () => NOW;
const _log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && (a[0].startsWith('[thr') || a[0].startsWith('[hanbando'))) return; _log(...a); };
const VP = require.resolve(path.join(ROOT, 'server', 'villages.js'));
require.cache[VP] = { id: VP, filename: VP, loaded: true, exports: { tickSliceMs: () => 16 } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't1001-'));
const RP = path.join(ROOT, 'server', 'roads.js'), DP = path.join(ROOT, 'server', 'zone-local-db.js');
const SRC = fs.readFileSync(RP, 'utf8');
const W = 120, H = 96, DAY = 1000;
function mk(tag) {
  process.env.DB_PATH = path.join(TMP, tag + '.db'); process.env.ZONE_ID = 'thr';
  delete require.cache[DP];
  const db = require(DP);
  const m = new Module(RP, module); m.filename = RP; m.paths = Module._nodeModulePaths(path.dirname(RP));
  const orig = Module.prototype.require;
  m.require = function (id) { return id === './zone-local-db' ? db : orig.call(this, id); };
  m._compile(SRC, RP);
  const R = m.exports;
  NOW = 0;
  R.init({ zoneId: 'thr', cellsW: W, cellsH: H, epoch: 0, dayMs: DAY, broadcast: () => {} });
  return R;
}
// 연산 줄 — 씨앗 LCG(판마다 같은 줄 · econ 날마다)
function script(seed, days) {
  let rs = seed; const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; };
  const trails = []; for (let i = 0; i < 10; i++) trails.push({ x: (rnd() * W) | 0, y: (rnd() * H) | 0, dx: rnd() < 0.5 ? 1 : 0, len: 8 + ((rnd() * 30) | 0), busy: rnd() });
  const out = [];
  for (let d = 1; d <= days; d++) {
    const ops = []; const n = 200 + ((rnd() * 400) | 0);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.75) { const T = trails[(rnd() * trails.length) | 0]; if (rnd() > T.busy + 0.25) continue; const j = (rnd() * T.len) | 0;
        ops.push(['s', Math.min(W - 1, T.x + (T.dx ? j : 0)), Math.min(H - 1, T.y + (T.dx ? 0 : j))]); }
      else ops.push(['g', (rnd() * W) | 0, (rnd() * H) | 0]);
    }
    if (rnd() < 0.2) for (const T of trails) T.busy = rnd();   // 길이 식는다(감쇠가 실제로 문다)
    out.push(ops);
  }
  return out;
}
//   한 판 돌리기 — econ 날 d 마다: 벽시계를 `wallPerDay` 날만큼(+부스러기) 민다 · 켬이면 하루 마감 자리(`dayTick`) · 틱 · 그날 연산
//   날마다 [v 들 · d − 맞춤 몫 들 · 코스 · 다져진 길] 지문
function run(R, ops, econOn, off, wallPerDay) {
  let econ = 0;
  if (econOn) R.setEconDay(() => econ + off);
  const days = [];
  for (let d = 1; d <= ops.length; d++) {
    econ = d;
    NOW = Math.round(d * wallPerDay * DAY + (wallPerDay > 1 ? (d * 137) % DAY : 0));
    if (econOn) R.dayTick();
    R.onGameTick(NOW);
    for (const [k, a, b] of ops[d - 1]) { if (k === 's') R.stampCell(a, b); else R.levelOf(a, b); }
    const S = R._S;
    days.push([[...S.cells].map(([kk, r]) => kk + ':' + r.v + ':' + (r.d - (econOn ? off : 0))).join(','),
      [...S.coarse].sort((a, b) => a[0] - b[0]).map((x) => x.join(':')).join(','), [...S.paved].join(','), S.stats.graded]);
  }
  return { days, lastDay: R._S.lastDay, econ };
}
function firstDiff(a, b) { for (let i = 0; i < Math.min(a.days.length, b.days.length); i++) if (JSON.stringify(a.days[i]) !== JSON.stringify(b.days[i])) return i + 1; return null; }

console.log('\n=== 길의 날 · NPC 광맥 시각 = econ 날 — 켬 기본 · 부팅 맞춤 몫(T1001) ===');
const OPS = script(1001, 160);
const on1 = run(mk('on1'), OPS, true, 0, 1);
const on7 = run(mk('on7'), OPS, true, 7173017989, 7.3);
const fd = firstDiff(on1, on7);
const gr = Math.max(...on1.days.map((x) => x[3]));
ok(fd === null && gr > 0, '★① 켬 — 벽시계가 econ 하루에 1일 · 7.3일 가는 두 판(맞춤 몫 0 · 7,173,017,989)의 길 셀 값 · 날의 차 · 코스 · 다져진 길이 160날 같다',
  `첫 다름 ${fd == null ? '없음' : '날 ' + fd} · 등급 셀 최대 ${gr}`);
ok(on7.lastDay === on7.econ + 7173017989 && on1.lastDay === on1.econ, '★② 켬 — 길 하루 날 = 마지막 econ 날 + 맞춤 몫(벽시계 날이 아니다)', `길 날 ${on7.lastDay} · econ ${on7.econ}`);
const off1 = run(mk('off1'), OPS, false, 0, 1);
const off7 = run(mk('off7'), OPS, false, 0, 7.3);
const fd0 = firstDiff(off1, off7);
ok(fd0 !== null && firstDiff(on1, off1) === null, '[미끼 · ③] 끔(종전 벽시계 날) — 같은 두 벽시계 판이 갈린다(econ 하루 = 벽 1일 판은 켬과 같다 · 7.3일 판만 감쇠가 빨라진다)', `끔 첫 다름 날 ${fd0}`);
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
