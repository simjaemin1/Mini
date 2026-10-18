#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-local-clocks.js — 남은 세계 시계 셋을 현지로: 날씨 굴림 · 몹 밤 · 기온 일교차 (T761) ==================
//
// ★캐논: 경도 하루(UTC × 60 · 원통 경도) · 물리 일관성 · 새 수 0 · 결정론. 정본 식은 `server/zone-config.js localPhase` 하나다.
//   손잡이 하나 `T761_LOCAL_CLOCKS`(기본 끔 = main 바이트) · 값 `1`·`all` = 셋 · 쉼표 목록 = 고른 갈래(`wx` · `mob` · `temp`).
//
// ★이 하네스가 지키는 계약:
//   ① **손잡이 읽기** — ★[T792] env 없음 = 셋 다 켬(켬 기본) · `0` = 셋 다 끔 · `1`·`all` = 셋 · 쉼표 목록 = 고른 것만 · 모르는 낱말 = 끔(미끼).
//   ② **한 식** — 몹 밤(존 몹 AI) = `localPhase(x) > 낮 몫` 이 ¾W(경도 0 · 해 몫 기준 자리)에서 `isNight` 와 같다 · 서·동 끝은 다르다(자명 통과 금지).
//      야생 시계(`wildlife` lifeGM)의 해 몫 = 종전 해 몫 + `lonPhaseOff(x)` = `localPhase(x)` (같은 식).
//      기온 일교차 — 같은 분수 일 `t` 에 위상만 현지(`tempAtT(t, 0, localPhase)`) · 현지 정오가 현지 자정보다 따뜻하다 · ¾W 는 종전 값과 같다.
//   ③ **날씨 굴림 = 마을 조각** — 켬(wx)이면 머리에서 안 굴리고 마을 조각에서 굴린다:
//      T731 켬(마을 흐름) 위에서는 마을 조각 차례를 뒤집어도 40일 지문이 같다 · 굴림이 그 마을 흐름에서 나온다.
//      wx 끔은 머리 굴림 그대로(같은 env 두 판 = 같은 지문 · 결정론).
//      ⚠T731 위에서 wx 켬 = 끔 수열은 **가을 첫날 앞까지만**이다 — 그날 머리의 풍흉 굴림(`tickYearShock` · 같은 마을 흐름)이
//        날씨 굴림보다 먼저 돌게 되어(끔 = 날씨 → 풍흉 · 켬 = 풍흉 → 날씨) 그 뒤 수열이 갈린다(결정론 · 서버 3시드 모두 날 184 · 보고 §3).
//   ④ **끔 = 아무도 안 부른다**(소스) — 세 자리(존 몹 AI · 야생 시계 · 몸·화면 기온) · econ 머리/마을 조각이 모두 손잡이 뒤.
//
// 실행: node scripts/test-local-clocks.js   (존 안 띄움 · 약 20초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const codeOnly = require('./code-only.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);

const env0 = Object.assign({}, process.env); delete env0.T761_LOCAL_CLOCKS; delete env0.T731_LOCAL_MIDNIGHT;
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
const W = ZC.WORLD.worldWidth, DL = ZC.WORLD.dayLengthMs, R = ZC.WORLD.dayPhaseRatio;
const T0 = Date.UTC(2026, 9, 15, 3, 7, 0);

say('\n=== 남은 세계 시계 셋을 현지로 (T761) ===');

say('\n① 손잡이 읽기');
{ const probe = (v) => { const e = Object.assign({}, env0); if (v !== undefined) e.T761_LOCAL_CLOCKS = v;
    return JSON.parse(execFileSync(process.execPath, ['-e', `console.log(JSON.stringify(require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config.js'))}).T761_CLOCKS))`], { env: e, encoding: 'utf8' })); };
  const s = (o) => `${+o.on}${+o.wx}${+o.mob}${+o.temp}`;
  ok(s(probe()) === '1111', '★[T792] env 없음 → 셋 다 켬(켬 기본)', s(probe()));
  ok(s(probe('0')) === '0000', '★끔 탐침 — `0` → 셋 다 끔(되돌림)');
  ok(s(probe('1')) === '1111' && s(probe('all')) === '1111', '`1` · `all` → 셋 다');
  ok(s(probe('wx')) === '1100' && s(probe('mob')) === '1010' && s(probe('temp')) === '1001', '갈래 하나씩(wx · mob · temp)');
  ok(s(probe('mob, temp')) === '1011', '쉼표 목록 → 고른 것만(빈칸 무시)');
  ok(s(probe('bogus')) === '0000', '미끼 — 모르는 낱말은 끔'); }

say('\n② 한 식 — 몹 밤 · 야생 시계 · 기온 일교차');
{ const x0 = 0.75 * W; let same = true, maxd = 0;
  for (let i = 0; i < 2000; i++) { const t = T0 + i * 7919 * 37; const n1 = ZC.localPhase(x0, t) > R; if (n1 !== ZC.isNight(t)) same = false;
    let d = Math.abs(ZC.localPhase(x0, t) - ZC.worldPhase(t)); d = Math.min(d, 1 - d); if (d > maxd) maxd = d; }
  ok(same && maxd < 1e-9, '★¾W(경도 몫 0)의 현지 밤 = `isNight`(2000 시각)', `해 몫 차 최대 ${maxd.toExponential(1)}`);
  let diffW = 0, diffE = 0; for (let i = 0; i < 2000; i++) { const t = T0 + i * 7919 * 37;
    if ((ZC.localPhase(0, t) > R) !== ZC.isNight(t)) diffW++; if ((ZC.localPhase(W - 1, t) > R) !== ZC.isNight(t)) diffE++; }
  ok(diffW > 100 && diffE > 100, '미끼 — 서쪽 끝 · 동쪽 끝은 세계 밤과 다른 시각이 있다(자명 통과 아님)', `${diffW} · ${diffE}/2000`);
  //   야생 시계 — wildlife.tick 의 식(el + lonPhaseOff(x)·DL)을 그대로 · 해 몫이 localPhase 와 같다
  let wl = 0; for (let i = 0; i < 2000; i++) { const t = T0 + i * 104729, x = (i * 2654435761 % 1000) / 1000 * W;
    const el = t - (ZC.WORLD.worldEpoch || 0) + ZC.lonPhaseOff(x) * DL; const p = (((el % DL) + DL) % DL) / DL;
    let d = Math.abs(p - ZC.localPhase(x, t)); d = Math.min(d, 1 - d); if (d > wl) wl = d; }
  ok(wl < 1e-9, '★야생 시계 해 몫(종전 몫 + 경도 몫) = `localPhase`(2000 자리·시각)', wl.toExponential(1));
  const Wx = require(path.join(ROOT, 'server', 'weather.js'));
  const tDay = 200.4;
  const noonL = Wx.tempAtT(tDay, 0, Wx.PH.noon), midL = Wx.tempAtT(tDay, 0, Wx.PH.midnight);
  ok(Number.isFinite(noonL) && noonL > midL, '같은 분수 일에 현지 정오 > 현지 자정(일교차가 현지 위상을 따른다)', `${noonL.toFixed(2)} > ${midL.toFixed(2)}℃`);
  let tsame = true; for (let i = 0; i < 50; i++) { const t = T0 + i * 3600 * 1000 * 7; if (Wx.tempAtT(tDay, 0, ZC.localPhase(x0, t)) !== Wx.tempAtT(tDay, 0, ZC.worldPhase(t))) { const a = Wx.tempAtT(tDay, 0, ZC.localPhase(x0, t)), b = Wx.tempAtT(tDay, 0, ZC.worldPhase(t)); if (Math.abs(a - b) > 1e-6) tsame = false; } }
  ok(tsame, '¾W 의 현지 기온 = 종전 세계 위상 기온(같은 곡선)'); }

say('\n③ 날씨 굴림 = 마을 조각 (econ)');
{ const kid = `const path=require('path'),crypto=require('crypto');const _l=console.log;console.log=()=>{};
const v2=require(path.join(${JSON.stringify(ROOT)},'sim','economy-sim-v2.js'));const REV=process.argv[1]==='1';
const w=v2.createWorldV2({seed:7,villageCount:8});let rolls=0;
for(let d=0;d<40;d++){const P=v2.tickWorldV2Parts(w);P.head();const pre=w.villages.map(v=>v._weather?v._weather.untilDay:-1).join();const L=w.villages.slice();if(REV)L.reverse();for(const v of L)P.village(v);P.trade();P.caravans();P.tail();if(w.villages.map(v=>v._weather?v._weather.untilDay:-1).join()!==pre)rolls++;}
const s=w.villages.map(v=>JSON.stringify([v.name,v._weather||null,Object.keys(v.storage).sort().map(k=>[k,+(+v.storage[k]).toFixed(6)]),v.npcs.map(n=>[n.id,+(+n.age).toFixed(4),n.currentJob])])).join('\\n');
console.log=_l;console.log(crypto.createHash('sha1').update(s).digest('hex').slice(0,12)+' '+rolls);`;
  const run = (wx, t731, rev) => { const e = Object.assign({}, env0); e.T761_LOCAL_CLOCKS = wx ? 'wx' : '0'; e.T731_LOCAL_MIDNIGHT = t731 ? '1' : '0';   // ★[T792] 켬 기본 — 끔 팔은 `=0` 을 적는다
    return execFileSync(process.execPath, ['-e', kid, rev ? '1' : '0'], { env: e, encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').pop().split(' '); };
  const offA = run(0, 0, 0), offB = run(0, 0, 0), wxA = run(1, 0, 0), wxB = run(1, 0, 0), on = run(1, 1, 0), onR = run(1, 1, 1), off731R = run(0, 1, 1);
  ok(offA[0] === offB[0], '끔 — 같은 env 두 판 = 같은 40일 지문(결정론)', offA[0]);
  ok(offA[1] === '0', '끔 — 날씨가 바뀐 날은 머리에서만(마을 조각 동안 굴림 0)', `마을 조각 굴림 날 ${offA[1]}`);
  ok(wxA[0] === wxB[0] && +wxA[1] > 0, '★켬(wx) — 굴림이 마을 조각에서 난다 · 두 판 같은 지문', `${wxA[0]} · 마을 조각 굴림 날 ${wxA[1]}/40`);
  ok(on[0] === onR[0], '★켬(wx) + T731 마을 흐름 — 마을 조각 차례를 뒤집어도 40일 지문이 같다', `${on[0]} = ${onR[0]}`);
  ok(on[0] === off731R[0], '★T731 위에서 wx 켬 = 끔과 같은 40일 수열(같은 마을 흐름 · 그 흐름 안 같은 차례 — 때만 마을 조각으로 옮는다 · 가을 첫날 풍흉 굴림부터는 차례가 바뀐다 — 보고 §3)', `${on[0]} = ${off731R[0]}`); }

say('\n④ 끔 = 아무도 안 부른다(소스)');
{ const Z = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')).split('\n');
  const hits = []; Z.forEach((l, i) => { if (/localPhase\(/.test(l)) hits.push([l, Z[i - 1] || '', Z[i - 2] || '']); });
  ok(hits.length === 3 && hits.every(([l, p1, p2]) => /T761_CLOCKS\.(mob|temp)/.test(l + p1 + p2)), '존 — `localPhase` 를 부르는 줄 셋(몹 AI · 몸 기온 · 화면 기온) 모두 손잡이 뒤', `${hits.length}`);
  ok(Z.some((l) => /_mN \? 1\.5 : 1\.0\) : sightMult/.test(l)) && Z.some((l) => /def\.sightRange \* _sM/.test(l)) && Z.some((l) => /def\.damage \* _dM/.test(l)), '존 몹 AI — 끔 = 종전 배율(`sightMult` · `dmgMult`) 그대로');
  const L = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'wildlife.js'), 'utf8'));
  ok(/if \(_T761_MOB\) el \+= lonPhaseOff\(/.test(L) && /if \(!_T761_MOB \|\| g >= lifeGM\) \{ _dayI = dI; lifeGM = g; \}/.test(L), '야생 시계 — 경도 몫 · 단조 붙듦 둘 다 손잡이 뒤(끔 = 종전 식)');
  const E = codeOnly(fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8'));
  ok(/tickWeather\(world, world\.day\);/.test(E) && /!T761_WX\) tickWeather\(world, world\.day\)/.test(E) && /if \(T761_WX && world\._dbg\?\.weather !== false\) _weatherRollOne\(v, world\.day\)/.test(E),
    'econ — 머리 굴림은 끔에서만 · 마을 조각 굴림은 켬에서만');
  const LAB = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  ok(LAB.includes('function _weatherRollOne(v, day)') && LAB.includes('T761_LOCAL_CLOCKS'), '랩 엔진 묶음 = 지금 소스(브라우저엔 `process` 가 없어 끔)'); }

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
