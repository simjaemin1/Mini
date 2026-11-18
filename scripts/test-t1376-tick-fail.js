#!/usr/bin/env node
// @regress
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1376-tick-fail.js — 현지 자정 창 꼬리가 던져도 그 존 econ 이 멎지 않는다(T1376 · T1352 회부 6) ==========
//
// ★왜: `_drainTickJobs` 의 catch 는 "다음 경계에 재시도"라 적고 남은 조각을 통째로 버린다. 꼬리 조각 판(창 마을을 다 낸 판)이면 그 안의 창 닫음 조각('t731')도
//   같이 버려져 창(`state._t731`)이 열린 채 남았다 ⇒ `_t731Due` 는 영영 거짓(창에 낼 마을 0) · econ 날 시계(`_t1253Now`)는 닫는 날의 끝 한 순간에 선다
//   (T1182 몸 걸음 0) — 그 존이 멎었다(e2e-xzone-caravan 끔 열 다시 뜬 닛폰 · 그 존 `마을 econ day` 줄 0 — T1352 §6 · 회부 6).
//   고침(`_t1376FailClose`): 꼬리 조각 판이 던지면 창만 닫는다(그날 남은 꼬리 일은 종전대로 버린다) · 창 머리 · 마을 조각 판이 던지면 창은 그대로.
// 판(운영 함수 그대로 — `_drainTickJobs` · `_t731Due` · `_t1253Now` · `_t731Stat`): 아이가 villages.js 를 싣고(적재 때 내보내기 한 줄만 덧댄다 — 사본 0)
//   창 하나(D = 8 · 마을 0 · 꼬리 조각 판)와 조각 셋(던지는 econ 캐러밴 조각 · 저장 · 창 닫음)을 세워 `_drainTickJobs` 를 한 번 부른다.
//   시계는 판 시계(고정 원점 E0 + 하루 × 날 · 날 경계에 안 선다) — 벽시계 0.
//   ① [전제] 꼬리 조각이 던졌고 catch 가 남은 조각을 버렸다(저장 · 창 닫음 조각이 안 돌았다 · 마감 줄 비움)
//   ② ★창이 닫혔다(`state._t731` 없음 · `t731Day` = 그 창 날 · 셈 `failClose` 1)
//   ③ ★econ 날 시계가 다시 흐른다(같은 날 안 두 순간의 차 = 흐른 판 시각)
//   ④ ★다음 경계가 온다(`_t731Due` — 다음 날 머리 뒤 참 · 앞 거짓)
//   ⑤ 창 머리 · 마을 조각 판이 던지면 창은 그대로(남은 마을 · 꼬리가 다음 판에 온다 — 일찍 닫지 않는다)
//   ⑥ 창 밖 마감(종전 하루 마감 — `t731D` 없음)이 던지면 무동작(셈 0)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ catch 의 창 닫음 부름을 뺀 사본(T1376 앞 글자) → {②, ③, ④} · ㉡ 마을 조각 판도 닫는 사본 → {⑤}
// 실행: node scripts/test-t1376-tick-fail.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  noClose: { red: ['②', '③', '④'], at: ['    _t1376FailClose(C);\n', '    ;   // 미끼 ㉠\n'] },
  closeMini: { red: ['⑤'], at: ['  if (!W || !C || C.t731D !== W.D || C.t731mini || W.list.length) return false;', '  if (!W || !C || C.t731D !== W.D) return false;   // 미끼 ㉡'] },
};

if (process.argv[2] === '--child') {
  const Module = require('module');
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === VFILE) {
      if (bait) { const n = content.split(bait.at[0]).length - 1; if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리가 한 번이 아니다(${n}번)` }) + '\n'); process.exit(3); } content = content.replace(bait.at[0], bait.at[1]); }
      content += '\n;module.exports.__t1376t = { drain: _drainTickJobs, due: _t731Due, now: _t1253Now, stat: _t731Stat };\n';
    }
    return _c.call(this, content, filename);
  };
  const mute = (fn) => { const l = console.log, e = console.error, w = console.warn; console.log = () => {}; console.error = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.error = e; console.warn = w; } };
  const V = mute(() => require(VFILE));
  const P = V.__t1376t, S = V.__t740();
  let CLK = 0; Date.now = () => CLK;   // 판 시계(벽시계 0)
  const E0 = 1.6e12, M = 3000, D = 8;
  const at = (day, frac) => E0 + (day + frac) * M;   // 날 경계에 안 선다(frac 은 0 · 1 이 아니다)
  const base = () => {
    S.epoch = E0; S.dayMs = M; S.villages = []; S.world = { day: D, villages: [], caravans: [], tradeLog: [] };
    S.lastGameDay = D; S._t731Anchor = D; S._t1282D = D - 1; S.t731Day = D - 1; S._t1253Edge = false; S.waitQ = [];
  };
  const run = (kind) => {
    base();
    const did = { save: 0, close: 0 };
    const W = { D, list: kind === 'mini' ? [{ name: '서쪽마을', _lonMid: 0 }] : [], all: [], extra: [], P: null, C: null, wit: [], open: at(D, 0.01) };
    S._t731 = kind === 'old' ? null : W;
    const C = { now: at(D, 0.1), t0: at(D, 0.1), stg: {}, order: [], chunks: 0, maxChunk: 0, maxChunkAt: '', car: { seen: new Set(), spawned: 0, arrived: 0, removed: 0 } };
    if (kind !== 'old') { C.t731D = D; C.t731mini = kind === 'mini'; }
    S.tickCtx = C;
    S.tickJobs = [
      { n: 'econ', s: 'econ:caravan', f: () => { throw new TypeError("Cannot read properties of undefined (reading 'zone')"); } },
      { n: 'save', f: () => { did.save++; } },
      { n: 't731', f: () => { did.close++; S.t731Day = W.D; S._t731 = null; } },
    ];
    const f0 = P.stat.failClose | 0;
    CLK = at(D, 0.12);
    const frozen = P.now();
    mute(() => P.drain(CLK));
    const o = { did, jobs: S.tickJobs === null && S.tickCtx === null, open: S._t731 === W, closed: S._t731 == null, t731Day: S.t731Day, failClose: (P.stat.failClose | 0) - f0, frozen };
    CLK = at(D, 0.2); o.e1 = P.now(); o.dueSame = P.due(CLK);
    CLK = at(D, 0.35); o.e2 = P.now();
    CLK = at(D + 1, 0.05); o.dueNext = P.due(CLK);
    return o;
  };
  const out = {};
  for (const k of ['tail', 'mini', 'old']) { try { out[k] = run(k); } catch (e) { out[k] = { err: String(e && e.stack || e).slice(0, 400) }; } }
  out.M = M; out.D = D;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const child = (bait) => {
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env: process.env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` }; }
};
//   줄마다 [이름, 참, 글, 값] — 미끼 판이 같은 줄을 다시 셈해 빨강 줄을 단언한다
function rows(bait) {
  const R = child(bait), T = R.tail || {}, Mi = R.mini || {}, O = R.old || {}, M = R.M || 0, D = R.D || 0, L = [];
  const dt = (T.e2 != null && T.e1 != null) ? +(T.e2 - T.e1).toFixed(6) : null;
  L.push(['①', !T.err && T.did && T.did.save === 0 && T.did.close === 0 && T.jobs === true, '① [전제] 꼬리 조각(econ 캐러밴)이 던졌고 catch 가 남은 조각(저장 · 창 닫음)을 버렸다 · 마감 줄 비움', JSON.stringify(T.did || T.err)]);
  L.push(['②', !T.err && T.closed === true && T.t731Day === D && T.failClose === 1, '② ★창이 닫혔다 — `state._t731` 없음 · `t731Day` = 그 창 날 · 셈 `failClose` 1', `닫힘 ${T.closed} · t731Day ${T.t731Day} · 셈 ${T.failClose}`]);
  L.push(['③', !T.err && T.frozen === D * M && dt != null && Math.abs(dt - 0.15 * M) < 1e-6, '③ ★econ 날 시계가 다시 흐른다 — 마감 중엔 닫는 날의 끝 한 순간(D × 하루) · 닫힌 뒤 같은 날 두 순간의 차 = 흐른 판 시각(하루 × 0.15)', `마감 중 ${T.frozen} · 뒤 ${T.e1} → ${T.e2}(차 ${dt} · 바람 ${0.15 * M})`]);
  L.push(['④', !T.err && T.dueSame === false && T.dueNext === true, '④ ★다음 경계가 온다 — `_t731Due` 다음 날 머리 앞 거짓 · 뒤 참(창이 열린 채면 영영 거짓)', `앞 ${T.dueSame} · 뒤 ${T.dueNext}`]);
  L.push(['⑤', !Mi.err && Mi.open === true && Mi.failClose === 0 && Mi.t731Day === D - 1, '⑤ 창 머리 · 마을 조각 판이 던지면 창은 그대로(남은 마을 · 꼬리가 다음 판에 와 꼬리가 닫는다 — 일찍 닫지 않는다)', `열림 ${Mi.open} · 셈 ${Mi.failClose} · t731Day ${Mi.t731Day}`]);
  L.push(['⑥', !O.err && O.failClose === 0 && O.t731Day === D - 1 && O.jobs === true, '⑥ 창 밖 마감(종전 하루 마감 — 창 날 칸 없음)이 던지면 무동작(셈 0 · 창 날 그대로)', `셈 ${O.failClose} · t731Day ${O.t731Day}`]);
  return { L, R };
}
console.log('\n=== 현지 자정 창 꼬리가 던져도 econ 이 멎지 않는다 — `_t1376FailClose`(T1376 · T1352 회부 6) ===');
const base = rows();
if (base.R.err || base.R.baitErr) console.log('  · 아이 오류', base.R.err || base.R.baitErr);
for (const [, c, m, d] of base.L) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(VFILE, 'utf8');
const BR = {};
for (const [name, B] of Object.entries(BAITS)) {
  const n = SRC.split(B.at[0]).length - 1;
  const red = n === 1 ? rows(name).L.filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(B.red.slice().sort()) };
}
ok(BR.noClose.n === 1 && BR.noClose.same, '미끼 ㉠ — catch 의 창 닫음 부름을 뺀 villages 사본(T1376 앞 글자) → 빨강 줄이 꼭 {②, ③, ④}', `바꾼 자리 ${BR.noClose.n} · 빨강 {${(BR.noClose.red || []).join(', ')}}`);
ok(BR.closeMini.n === 1 && BR.closeMini.same, '미끼 ㉡ — 창 머리 · 마을 조각 판도 닫는 villages 사본 → 빨강 줄이 꼭 {⑤}', `바꾼 자리 ${BR.closeMini.n} · 빨강 {${(BR.closeMini.red || []).join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
