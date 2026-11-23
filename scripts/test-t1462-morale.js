#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1462-morale.js — 싸움의 사기 팔(T1462 · 손잡이 `T1462_MORALE` 끔 기본 · battle-core 한 곳) =============================
//
// ★왜 [지시 T1462 · ★재민 11-23 "아니 도적이라고 다르면 안 돼.. 혹시 전투실험실도 문제가 있는 건 아니지..?"]
//   battle-core 를 머리 없이 돌리면 진 편이 93 ~ 99 % 죽는다(T1462 보고 §1 — 붙은 뒤 1초 안에 죽는데 사기는 1초 넘게 늦게 따라오고 꺾일 몫도 느리다 ·
//   붙으면 사기가 오르는 항 둘). 팔은 있는 항을 걷거나 세는 법을 고치는 것뿐(새 수 0) · 규칙은 battle-core 한 곳 — 전쟁 · 도적 · 캐러밴이 같은 식.
// 판(운영 함수 그대로 · 사본 0): `sim/battle-core.js`(createBattle · preMorale) · `sim/caravan-battle.js`(decide · raidBattle).
//   ① 끔 = 바이트 같음 — 싸움 꼴 여섯 × 씨 넷의 판 지문(끝 · 시각 · 몸마다 hp · 자리 · 사기 · 궤주)이 T1462 전(main `01df9e8f9` 코어)과 같다
//   ② 팔 하나씩 — ㉮ self: 1 대 1 의 붙기 전 수 우열 = 0(`preMorale` = 병종 기본 × 행복) · 끔은 −0.225 ·
//      ㉯ nodesp · ㉰ wound · nocommit · instant · breaknow · norally · nochase 가 각자 판을 바꾼다(지문이 끔과 다르다 — 자명 통과 금지)
//   ③ 한 곳 — 만나는 순간 판단(`caravan-battle decide`)의 사기 = battle-core `preMorale` 의 몸 평균(팔 켬에서도 같은 값 · 식을 따로 안 갖는다)
//   ④ 과녁 — 후보 가(nocommit,instant,breaknow): ⓐ 행복 0.3 인 우세 편은 붙기 전에 달아난다(창 30 ↔ 20 · 죽음 0) · ⓑ 행복 1 인 약간 열세 편은 싸운다
//      (창 18 ↔ 22 · 진 편 죽음 20 ~ 70 %) · ⓒ 진 편이 꺾여 달아나 산다(민병 20 ↔ 석검 20 · 창 40 ↔ 20 — 진 편 살아 달아남 ≥ 30 %) · 끔은 ⓒ 가 안 선다
//   ⑤ 사기는 늘 0 ~ 1(팔 전부 켬 · 걸음마다) · ⑥ 달아나는 몸은 벽을 지나지 않는다(어댑터 벽 · 궤주 걸음 클램프 · 팔 전부 켬)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): 끔에서 한 칸 다른 사본 · 1 대 1 이 열세인 사본(㉮ 켬에서) · 캐러밴만 다른 식 사본 · 달아난 몸이 벽을 지나는 사본 · 사기가 0 ~ 1 밖 사본
// 실행: node scripts/test-t1462-morale.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BCF = path.join(ROOT, 'sim', 'battle-core.js'), CBF = path.join(ROOT, 'sim', 'caravan-battle.js');
const BAITS = {
  offDiff: { f: BCF, at: ['    let tgt=(MRL0[u.type]||0.8)+_t1462Odds(_A,fN,eN)-M_KCONTAG*rN+M_KCHAMP*champ', '    let tgt=(MRL0[u.type]||0.8)+_t1462Odds(_A,fN,eN)-M_KCONTAG*rN*1.0001+M_KCHAMP*champ   // 미끼 — 끔에서도 한 칸 다르다\n     '] },
  oneVsOne: { f: BCF, at: ['function _t1462Odds(A,fN,eN){ return M_KODDS*((A.self?fN+1:fN)-eN)/(fN+eN+1); }', 'function _t1462Odds(A,fN,eN){ return M_KODDS*((fN)-eN)/(fN+eN+1); }   // 미끼 — 1 대 1 이 열세(자기를 안 센다)'] },
  caravanOwn: { f: CBF, at: ['    const tg = BC.preMorale(t, fN, eN, h);', '    let tg = ((BC.MRL0[t] || 0.8) + BC.M_KODDS * (fN - eN) / (fN + eN + 1)) * h; tg = tg < 0 ? 0 : tg > 1 ? 1 : tg;   // 미끼 — 캐러밴만 제 식\n'] },
  fleeWall: { f: BCF, at: ['      u.x+=dx/dd*D.spd*1.25*dt; sep(ctx,u,dt); continue;}', '      u.x+=dx/dd*D.spd*1.25*dt; continue;}   // 미끼 — 달아나는 걸음이 벽 클램프를 안 탄다\n'] },
  mrlOut: { f: BCF, at: ['    if(tgt<0)tgt=0;else if(tgt>1)tgt=1;\n    if(_A.instant)u.mrl=tgt; else u.mrl+=(tgt-u.mrl)*Math.min(1,M_RATE*dt);   // ★[T1462 ㉲ instant]\n    if(u.mrl<0)u.mrl=0;else if(u.mrl>1)u.mrl=1;', '    // 미끼 — 사기를 0 ~ 1 로 안 자른다\n    if(_A.instant)u.mrl=tgt; else u.mrl+=(tgt-u.mrl)*Math.min(1,M_RATE*dt);'] },
};
const ALL = 'self,nodesp,wound,nocommit,instant,breaknow,nochase,norally', GA = 'nocommit,instant,breaknow';
const FP_OFF = '9c44cd2ec5c5027e';   // T1462 전 코어(main `01df9e8f9` · `origin/batch/raid-battle-1122` 같은 글자)의 판 지문 — 이 파일 ① 의 셈 그대로
const short = (x) => JSON.stringify(x).slice(0, 380);

if (process.argv[2] === '--child') {
  const Module = require('module');
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (bait && filename === bait.f) {
      const n = content.split(bait.at[0]).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
  const BC = require(BCF), CB = require(CBF);
  const arm = (a) => { if (a) process.env.T1462_MORALE = a; else delete process.env.T1462_MORALE; };
  const mk = (s) => { s = (s >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  const SC = [[{ militia: 20 }, { dagger: 20 }], [{ spear: 20 }, { spear: 20 }], [{ spear: 30, archer: 10, champion: 3 }, { spear: 20, dagger: 15, archer: 10 }], [{ spear: 2, form: 'circle' }, { dagger: 3 }], [{ greataxe: 8 }, { spear: 6, archer: 4, form: 'wall' }], [{ militia: 1 }, { dagger: 1 }]];
  function fp() {
    const h = crypto.createHash('sha1');
    for (const [a, b] of SC) for (let s = 1; s <= 4; s++) {
      const H = BC.createBattle({ A: Object.assign({ form: 'line' }, a), B: Object.assign({ form: 'line' }, b), terrain: 'plain' }, { rng: mk(s * 97 + 1) }); if (s === 2) H.ctx.sides.A.armyMrl = 0.6;
      for (let t = 0; t < 3000 && !H.result; t++) H.step(0.1);
      h.update(JSON.stringify([H.result, H.ctx.tick.toFixed(3), H.units.map((u) => [u.hp.toFixed(4), +u.x.toFixed(4), +u.y.toFixed(4), u.mrl.toFixed(5), !!u.routing])]));
    }
    return h.digest('hex').slice(0, 16);
  }
  function many(A, B, N, happy) {   // 진 편 죽음 · 살아 달아남 · A 죽음 몫
    let lD = 0, lN = 0, lA = 0, aD = 0, aN = 0;
    for (let s = 1; s <= N; s++) {
      const H = BC.createBattle({ A: Object.assign({ form: 'line' }, A), B: Object.assign({ form: 'line' }, B), terrain: 'plain' }, { rng: mk(s * 7919 + 13) }); if (happy != null) H.ctx.sides.A.armyMrl = happy;
      for (let t = 0; t < 6000 && !H.result; t++) H.step(0.1);
      const w = H.result && H.result.win, L = H.units.filter((u) => u.side === (w === 'A' ? 'B' : 'A')), Au = H.units.filter((u) => u.side === 'A');
      if (w === 'A' || w === 'B') { lN += L.length; lD += L.filter((u) => u.hp <= 0).length; lA += L.filter((u) => u.hp > 0).length; }
      aN += Au.length; aD += Au.filter((u) => u.hp <= 0).length;
    }
    return { lossDead: lN ? lD / lN : 0, lossAlive: lN ? lA / lN : 0, aDead: aN ? aD / aN : 0 };
  }
  const L = [];
  // ① 끔
  arm(null); const f0 = fp();
  L.push(['①', f0 === FP_OFF, '① 끔 = 바이트 같음 — 싸움 꼴 여섯 × 씨 넷의 판 지문(끝 · 시각 · 몸마다 hp · 자리 · 사기 · 궤주)이 T1462 전 코어와 같다', `${f0} ↔ ${FP_OFF}`]);
  // ② 팔 하나씩
  { arm('self'); const s1 = BC.preMorale('militia', 0, 1, 1); arm(null); const s0 = BC.preMorale('militia', 0, 1, 1);
    L.push(['②a', Math.abs(s1 - BC.MRL0.militia) < 1e-12 && Math.abs(s0 - (BC.MRL0.militia - BC.M_KODDS / 2)) < 1e-12,
      '②a ㉮ self — 1 대 1(곁 아군 0 · 적 1)의 붙기 전 사기 = 병종 기본(수 우열 0) · 끔 = 기본 − M_KODDS ÷ 2(−0.225)', short({ self: s1, off: s0, base: BC.MRL0.militia })]); }
  { const fs1 = {}; for (const a of ['self', 'nodesp', 'wound', 'nocommit', 'instant', 'breaknow', 'nochase', 'norally']) { arm(a); fs1[a] = fp(); } arm(null);
    const same = Object.entries(fs1).filter(([, v]) => v === FP_OFF).map(([k]) => k);
    L.push(['②b', same.length === 0, '②b 팔마다 판이 바뀐다(지문이 끔과 다르다 — 손잡이가 실제로 문다 · 자명 통과 금지)', same.length ? '끔과 같은 팔: ' + same.join(' ') : '여덟 팔 다 다름']); }
  // ③ 한 곳
  { const out = []; let ok = true;
    for (const a of [null, 'self', ALL]) { arm(a); for (const [E, G, h] of [[0, 1, 1], [2, 3, 0.8], [5, 2, 0.5]]) {
      const d = CB.decide({ A: E > 0 ? [['spear', E]] : [['militia', 1]], B: [['dagger', G]], qA: 0.42, qB: 0.42, happy: h });
      const n = E > 0 ? E : 1, t = E > 0 ? 'spear' : 'militia', want = BC.preMorale(t, n - 1, G, h);
      if (Math.abs(d.mrl - want) > 1e-12) ok = false; out.push([a || '끔', E, G, h, +d.mrl.toFixed(4), +want.toFixed(4)]); } }
    arm(null);
    L.push(['③', ok, '③ 한 곳 — 만나는 순간 판단(`decide`)의 사기 = battle-core `preMorale` 의 몸 평균(끔 · self · 팔 전부 켬 — 식을 따로 안 갖는다)', short(out)]); }
  // ④ 과녁 — 후보 가
  { arm(GA); const a = many({ spear: 30 }, { spear: 20 }, 20, 0.3), b = many({ spear: 18 }, { spear: 22 }, 20, 1), c1 = many({ militia: 20 }, { dagger: 20 }, 20, null), c2 = many({ spear: 40 }, { spear: 20 }, 20, null);
    arm(null); const o1 = many({ militia: 20 }, { dagger: 20 }, 20, null), o2 = many({ spear: 40 }, { spear: 20 }, 20, null);
    L.push(['④', a.aDead <= 0.05 && b.aDead >= 0.2 && b.aDead <= 0.7 && c1.lossAlive >= 0.3 && c2.lossAlive >= 0.3 && o1.lossAlive < 0.3 && o2.lossAlive < 0.3,
      '④ 과녁(후보 가 nocommit,instant,breaknow) — ⓐ 행복 0.3 우세 편 죽음 ≤ 5 % · ⓑ 행복 1 약간 열세 편 죽음 20 ~ 70 % · ⓒ 진 편 살아 달아남 ≥ 30 %(민병 20 ↔ 석검 20 · 창 40 ↔ 20) · 끔은 ⓒ 가 안 선다',
      short({ a: +a.aDead.toFixed(2), b: +b.aDead.toFixed(2), c: [+c1.lossAlive.toFixed(2), +c2.lossAlive.toFixed(2)], off: [+o1.lossAlive.toFixed(2), +o2.lossAlive.toFixed(2)] })]); }
  // ⑤ 사기 0 ~ 1
  { arm(ALL); let bad = 0, n = 0;
    for (const [A, B] of SC) for (let s = 1; s <= 3; s++) { const H = BC.createBattle({ A: Object.assign({ form: 'line' }, A), B: Object.assign({ form: 'line' }, B), terrain: 'plain' }, { rng: mk(s * 13 + 3) }); H.ctx.sides.A.armyMrl = s === 1 ? 0.3 : 1;
      for (let t = 0; t < 3000 && !H.result; t++) { H.step(0.1); for (const u of H.units) { if (u.hp <= 0) continue; n++; if (!(u.mrl >= 0 && u.mrl <= 1)) bad++; } } }
    arm(null);
    L.push(['⑤', bad === 0 && n > 0, '⑤ 사기는 늘 0 ~ 1(팔 전부 켬 · 걸음마다 산 몸마다)', `벗어남 ${bad} / ${n}`]); }
  // ⑥ 달아나는 몸은 벽을 지나지 않는다
  { arm(ALL); const wallX0 = 20, wallX1 = 23;
    const world = { blocked: (x) => x >= wallX0 && x < wallX1, losBlocked: () => false, coverAt: () => 0 };
    let inside = 0, routSteps = 0, crossed = 0;
    const H = BC.createBattle({ A: { militia: 10, form: 'line' }, B: { dagger: 10, form: 'line' }, terrain: 'plain' }, { rng: mk(77) });
    H.ctx.world = world; H.ctx.sides.A.armyMrl = 0.3;
    for (let t = 0; t < 600; t++) { H.step(0.1); for (const u of H.units) { if (u.hp <= 0 || u.side !== 'A' || !u.routing) continue; routSteps++; if (world.blocked(u.x, u.y)) inside++; if (u.x < wallX0) crossed++; } }
    arm(null);
    L.push(['⑥', inside === 0 && crossed === 0 && routSteps > 0, '⑥ 달아나는 몸은 벽을 지나지 않는다(어댑터 벽 x 20 ~ 23 · 행복 0.3 민병 10 이 서쪽으로 달아남 · 팔 전부 켬)', `궤주 걸음 ${routSteps} · 벽 안 ${inside} · 벽 너머 ${crossed}`]); }
  process.stdout.write('@@' + JSON.stringify(L) + '\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const child = (bait) => {
  const env = Object.assign({}, process.env); delete env.T1462_MORALE;
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 600000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { const o = JSON.parse(line.slice(2)); return Array.isArray(o) ? o : [['0', false, '[전제] ' + JSON.stringify(o), '']]; } catch (e) { return [['0', false, '[전제] 아이 판이 돌았다', `rc ${r.status} · ${(r.stderr || '').slice(-400)}`]]; }
};
console.log('\n=== T1462 — 싸움의 사기 팔(`T1462_MORALE` 끔 기본 · battle-core 한 곳) ===');
for (const [, c, m, d] of child()) ok(c, m, d);
{
  const src = fs.readFileSync(BCF, 'utf8');
  ok(/function _t1462Arms\(ctx\)\{ if\(ctx\._t1462\)return ctx\._t1462; const x=_bcKnob\('T1462_MORALE'\);/.test(src) && /ctx\._t1462=null;/.test(src) && /M_KABS, preMorale,/.test(src) && (src.match(/_t1462Odds\(/g) || []).length === 3,
    '⑦ 정적 · 손잡이는 battle-core 한 곳(`_bcKnob` — env · 브라우저 window) · 판마다 다시 읽음 · `preMorale` 내보냄 · 수 우열 항은 한 줄(`_t1462Odds` — 싸움 안 · 붙기 전이 같이 부른다)');
}
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const RED = { offDiff: ['①'], oneVsOne: ['②a', '②b'], caravanOwn: ['③'], fleeWall: ['①', '⑥'], mrlOut: ['①', '⑤'] };
const BR = {};
for (const [name, Bt] of Object.entries(BAITS)) {
  const n = fs.readFileSync(Bt.f, 'utf8').split(Bt.at[0]).length - 1;
  const red = n === 1 ? child(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(RED[name].slice().sort()) };
}
ok(BR.offDiff.n === 1 && BR.offDiff.same, `미끼 — 끔에서 한 칸 다른 사본 → 빨강 줄이 꼭 {${RED.offDiff.join(', ')}}`, `바꾼 자리 ${BR.offDiff.n} · 빨강 {${(BR.offDiff.red || []).join(', ')}}`);
ok(BR.oneVsOne.n === 1 && BR.oneVsOne.same, `미끼 — 1 대 1 이 열세인 사본(㉮ 켬에서) → 빨강 줄이 꼭 {${RED.oneVsOne.join(', ')}}`, `바꾼 자리 ${BR.oneVsOne.n} · 빨강 {${(BR.oneVsOne.red || []).join(', ')}}`);
ok(BR.caravanOwn.n === 1 && BR.caravanOwn.same, `미끼 — 캐러밴만 다른 식 사본 → 빨강 줄이 꼭 {${RED.caravanOwn.join(', ')}}`, `바꾼 자리 ${BR.caravanOwn.n} · 빨강 {${(BR.caravanOwn.red || []).join(', ')}}`);
ok(BR.fleeWall.n === 1 && BR.fleeWall.same, `미끼 — 달아난 몸이 벽을 지나는 사본 → 빨강 줄이 꼭 {${RED.fleeWall.join(', ')}}`, `바꾼 자리 ${BR.fleeWall.n} · 빨강 {${(BR.fleeWall.red || []).join(', ')}}`);
ok(BR.mrlOut.n === 1 && BR.mrlOut.same, `미끼 — 사기가 0 ~ 1 밖 사본 → 빨강 줄이 꼭 {${RED.mrlOut.join(', ')}}`, `바꾼 자리 ${BR.mrlOut.n} · 빨강 {${(BR.mrlOut.red || []).join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
