#!/usr/bin/env node
// === scripts/t670-witness.js — T670 ① ② 바이트 같음 증인 (러너 밖 · 서버 0) ===============================================
// 종전 글자(`git show <ref>:server/zone.js`)와 지금 글자에서 **같은 함수·같은 토막**을 떠서 같은 입력열을 먹이고, 사람의 모든 필드를
// `Object.is` 로 견준다(−0 · NaN 까지). 지어낸 꼴이 아니라 제품 글자를 그대로 `new Function` 으로 세운다(T350 ⑥ · T356 ⑦ 문법).
//   ⓐ `detectStuck` — 서 있음·걸음·막힘(1.5초)·처음 셋이 섞인 4만 걸음 × 64명
//   ⓑ 목표 키 — 같은 목표 되풀이·바뀜·NaN·음수·−0·소수 → 키 글자
//   ⓒ `computeNpcPath` 의 `d<48` 갈래 — 돌려준 길의 내용(배열 재사용이 내용·좌표 비트를 안 바꾼다)
//   ⓓ 밤 귀가 토막(국면 메모 + 같은 값 안 쓰기) — `worldPhase` 를 틱의 now 로 · 같은 틱 여러 사람
//   ⓔ ② 타이머 문 앞 — `decideNpcBehavior` 머리에서 타이머 문까지 **부수효과 0**(글자 표 — 대입·부름 0)
// 실행: node scripts/t670-witness.js [ref=origin/main]
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const REF = process.argv[2] || 'origin/main';
const OLD = execFileSync('git', ['show', `${REF}:server/zone.js`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
const NEW = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? '  ' + x : '')); };
const fnSrc = (S, name) => { const i = S.indexOf(`function ${name}(`); if (i < 0) return null; const j = S.indexOf('\n}\n', i); return S.slice(i, j + 2); };
let x = 0x9e3779b9; const rnd = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
const same = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); if (ka.join() !== kb.join()) return 'keys ' + ka + ' / ' + kb;
  for (const k of ka) { const va = a[k], vb = b[k]; if (va && typeof va === 'object') { const r = same(va, vb); if (r !== true) return k + '.' + r; } else if (!Object.is(va, vb)) return k + ' ' + va + ' ≠ ' + vb; } return true; };

// ⓐ detectStuck
{
  const so = fnSrc(OLD, 'detectStuck'), sn = (fnSrc(NEW, '_t670Stuck') || '') + '\n' + fnSrc(NEW, 'detectStuck');
  const Fo = new Function(so + '\nreturn detectStuck;')(), Fn = new Function(sn + '\nreturn detectStuck;')();
  ok(/_t670Stuck/.test(sn) && !/_t670Stuck/.test(so), 'ⓐ [전제] 두 글자가 실제로 다르다(종전 새 객체 ↔ 지금 제자리 덮어쓰기)');
  let n = 0, d = -1, kinds = { stand: 0, move: 0, stuck: 0 };
  for (let p = 0; p < 64 && d < 0; p++) {
    const A = { x: 1000 + p * 50, y: 2000, targetX: 1200 + p * 50, targetY: 2100 }, B = { ...A };
    let now = 1e6;
    for (let t = 0; t < 40000 / 64 * 64 / 64 && d < 0; t++) {
      for (let k = 0; k < 64; k++) {
        now += 33 + (rnd() < 0.01 ? 2000 : 0);
        const r = rnd();
        if (r < 0.3) { const dx = (rnd() - 0.5) * 20, dy = (rnd() - 0.5) * 20; A.x += dx; A.y += dy; B.x += dx; B.y += dy; kinds.move++; }   // 걸음
        else if (r < 0.4) { A.x = A.targetX + (rnd() - 0.5) * 8; A.y = A.targetY; B.x = A.x; B.y = A.y; kinds.stand++; }                    // 목표 곁에 섬
        else if (r < 0.42) { const v = rnd() < 0.5 ? -0 : NaN; A.x = v; B.x = v; }
        else kinds.stuck++;                                                                                                              // 제자리(막힘 후보)
        if (rnd() < 0.05) { const P = rnd() < 0.5 ? null : [{ x: 0, y: 0 }]; A.path = P; B.path = P; A.pathIndex = B.pathIndex = rnd() < 0.5 ? 0 : 1; }
        const ra = Fo(A, now), rb = Fn(B, now); n++;
        const sres = same(A, B);
        if (ra !== rb || sres !== true) { d = n; console.log('    갈림:', ra, rb, sres); break; }
      }
    }
  }
  ok(n > 30000, 'ⓐ [상황] 걸음 수', n);
  ok(kinds.stand > 1000 && kinds.move > 1000 && kinds.stuck > 1000, 'ⓐ [상황] 서 있음·걸음·제자리가 다 섞였다', JSON.stringify(kinds));
  ok(d < 0, 'ⓐ ★★`detectStuck` 종전 ↔ 지금 — 돌려준 값 · 사람 필드(`_stuckPos` 안까지 · Object.is) **한 번도 안 다르다**');
}
// ⓑ 목표 키
{
  const ko = (n) => `${n.targetX|0}_${n.targetY|0}`;
  const m = NEW.match(/\n  if \(npc\.targetX !== npc\._t670TkX[^\n]*\n  const targetKey = npc\._t670Tk;/);
  ok(!!m, 'ⓑ [전제] 지금 글자에서 키 토막을 떴다');
  const kn = new Function('npc', m[0] + '\nreturn targetKey;');
  ok(/const targetKey = `\$\{npc\.targetX\|0\}_\$\{npc\.targetY\|0\}`;/.test(OLD), 'ⓑ [전제] 종전 글자는 매 틱 짓는 템플릿이다');
  const vals = [0, -0, 1.5, -1.5, 123456.789, NaN, undefined, null, 2 ** 31 + 5, -(2 ** 31) - 7, 1e20, Infinity];
  const npc = {}; let n = 0, d = 0, reuse = 0;
  for (let i = 0; i < 200000; i++) {
    if (rnd() < 0.2) { npc.targetX = rnd() < 0.3 ? vals[(rnd() * vals.length) | 0] : rnd() * 70000; npc.targetY = rnd() < 0.3 ? vals[(rnd() * vals.length) | 0] : rnd() * 130000; }
    const before = npc._t670Tk;
    const a = ko(npc), b = kn(npc); n++; if (a !== b) d++; if (before === b && i) reuse++;
  }
  ok(reuse > 100000, 'ⓑ [상황] 같은 목표 되풀이(재사용 갈래)를 실제로 밟았다', reuse);
  ok(d === 0, 'ⓑ ★★키 글자 종전 ↔ 지금 **한 번도 안 다르다**(−0 · NaN · 큰 수 · 소수 포함)', `${d}/${n}`);
}
// ⓒ d<48 갈래 — 내용
{
  const cut = (S) => { const i = S.indexOf('  const d = Math.hypot(npc.targetX - npc.x, npc.targetY - npc.y);', S.indexOf('function computeNpcPath(')); const j = S.indexOf('\n  const isVil', i); return S.slice(i, j); };
  const Fo = new Function('npc', cut(OLD) + '\nreturn undefined;'), Fn = new Function('npc', cut(NEW) + '\nreturn undefined;');
  let n = 0, d = 0, reused = 0;
  const A = { x: 0, y: 0 }, B = { x: 0, y: 0 };
  for (let i = 0; i < 100000; i++) {
    if (rnd() < 0.1) { const tx = rnd() * 1000, ty = rnd() < 0.05 ? -0 : rnd() * 1000; A.targetX = B.targetX = tx; A.targetY = B.targetY = ty; }
    const ox = A.targetX + (rnd() - 0.5) * 120, oy = A.targetY + (rnd() - 0.5) * 120; A.x = B.x = ox; A.y = B.y = oy;
    const ra = Fo(A), rb = Fn(B);
    if (ra === undefined && rb === undefined) continue;
    n++;
    if (rb && rb === B.path) reused++;
    const sa = JSON.stringify(ra && ra.map((p) => [Object.is(p.x, -0) ? '-0' : p.x, Object.is(p.y, -0) ? '-0' : p.y])), sb = JSON.stringify(rb && rb.map((p) => [Object.is(p.x, -0) ? '-0' : p.x, Object.is(p.y, -0) ? '-0' : p.y]));
    if (sa !== sb) d++;
    A.path = ra; B.path = rb; A.pathIndex = B.pathIndex = 0;
  }
  ok(n > 30000 && reused > 10000, 'ⓒ [상황] 가까움 갈래 · 재사용을 실제로 밟았다', `${n}번 · 재사용 ${reused}`);
  ok(d === 0, 'ⓒ ★★돌려준 길 내용(좌표 비트 · −0 까지) 종전 ↔ 지금 **같다**', `${d}/${n}`);
}
// ⓓ 밤 귀가 토막
{
  const cutH = (S) => { const i = S.indexOf('  else if (SIM_LON_ON && npc.simLonOff != null'); const j = S.indexOf('\n  }\n', i) + 4; return S.slice(i + '  else '.length, j); };
  const WORLD = { dayPhaseRatio: 0.7, worldEpoch: 0, dayLengthMs: 1440000 };
  const worldPhase = (ms) => ((ms - WORLD.worldEpoch) % WORLD.dayLengthMs) / WORLD.dayLengthMs;
  const Fo = new Function('npc', 'now', 'SIM_LON_ON', 'WORLD', 'worldPhase', cutH(OLD));
  const env = { _t670PhNow: NaN, _t670Ph: 0 };
  const bodyN = cutH(NEW).replace(/_t670PhNow/g, 'E._t670PhNow').replace(/_t670Ph\b/g, 'E._t670Ph');
  const Fn = new Function('npc', 'now', 'SIM_LON_ON', 'WORLD', 'worldPhase', 'E', bodyN);
  let n = 0, d = 0, night = 0;
  const P = [];
  for (let i = 0; i < 200; i++) { const base = { simLonOff: rnd() * 0.06, npcHomeX: 100 + i, npcHomeY: 200, npcBedX: rnd() < 0.5 ? 300 + i : undefined, npcBedY: rnd() < 0.5 ? 400 : undefined, behavior: rnd() < 0.5 ? 'wander' : 'gather', targetX: 5, targetY: rnd() < 0.1 ? -0 : 6, gatherTarget: rnd() < 0.5 ? 'g' : (rnd() < 0.5 ? null : undefined), path: [] }; P.push([{ ...base }, { ...base }]); }
  for (let t = 0; t < 3000; t++) {
    const now = 1e9 + t * 997;
    for (const [A, B] of P) { Fo(A, now, true, WORLD, worldPhase); Fn(B, now, true, WORLD, worldPhase, env); n++; const r = same(A, B); if (r !== true) { d++; if (d < 3) console.log('    갈림', r); } if ((worldPhase(now) + A.simLonOff) % 1 > 0.7) night++; }
  }
  ok(night > 50000 && night < n - 50000, 'ⓓ [상황] 밤·낮이 둘 다 넉넉하다', `${night}/${n}`);
  ok(d === 0, 'ⓓ ★★밤 귀가 토막 종전 ↔ 지금 — 사람 필드 **한 번도 안 다르다**(Object.is · −0 · undefined 침대)', `${d}/${n}`);
}
// ⓔ ② 타이머 문 앞
{
  const b = fnSrc(NEW, 'decideNpcBehavior');
  const head = b.slice(b.indexOf('{') + 1, b.indexOf('if (now < npc.nextDecisionAt) return;'));
  const code = head.split('\n').map((l) => l.replace(/\/\/.*$/, '').trim()).filter(Boolean);
  console.log('    타이머 문 앞 줄(주석 뺀):', JSON.stringify(code));
  const assigns = code.filter((l) => /(^|[^=!<>])=[^=]/.test(l) && !/^if \(npc\.canadiaVillage\) \{$/.test(l));
  ok(code.join(' ') === 'if (npc.canadiaVillage) { decideCanadiaBehavior(npc, now); return; }', 'ⓔ ★타이머 문 앞은 캐나디아 갈래 **하나뿐**이다(대입·난수·장부 0) — 건너뛰기 조건이 그 갈래를 빼고 같은 문을 쓴다', `대입 ${assigns.length}`);
  ok(/if \(!\(T670_SKIP_IDLE && !npc\.canadiaVillage && now < npc\.nextDecisionAt\)\) decideNpcBehavior\(npc, now\);/.test(NEW), 'ⓔ 부르는 자리 — 손잡이 끔이면 단락되어 종전 그대로 부른다');
  ok(/const T670_SKIP_IDLE = process\.env\.T670_SKIP_IDLE === '1';/.test(NEW), 'ⓔ 손잡이 `T670_SKIP_IDLE` 기본 끔');
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
