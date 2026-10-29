#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-assault-miss.js — 접촉 없이 끝난 돌격은 이튿날 결단에서 돌격 줄을 뺀다(T956 · 손잡이 `T956_ASSAULT_MISS` · ★[T974] 켬 기본 · 되돌림 `=0`) ==========
//   ★[T974 2026-10-28] T956 끔 발급 → 켬 기본(PM · 열일곱째 판). 하네스는 끔/켬 짝 그대로다 — 켬 = 미설정(기본) · 그 밖 값, 끔 = `=0` 하나.
//
// ★왜 [지시 T956 · T941 회부 2 — 교전 몫을 라이브와 같게 한 판(`T941_BATTLE_DAY=1`)에서도 몇 달 가는 전쟁]
//   공격 돌격(`_warEngage` 'assault')은 공격 쪽이 나서고 방어는 holder(쫓지 않음 · 대형이 쥔다)다. 몸 층에서 공격이 방어 대형에 못 닿으면
//   (풀림 술어 — 두 대형 원점 사이 곧은 줄 · 시야) 접촉 0 인 채 진척이 멎어 대치(`_warToStandoff`)로 진에 돌아온다.
//   war-core 결단(`_opNpcDecide`)은 그 돌격을 모른다(옛 headless — 돌격 = 결판) ⇒ 이튿날 같은 승산으로 또 돌격 · 짐이 바닥나도 도박 돌격 줄이 또 돌격 ⇒ 끝이 없다
//   (서버 판 자 시드 1020 · 400날 · 열다섯째 판 전쟁 22 중 일곱이 69 ~ 181날 — 보고 T956 §2). T771 은 방어 출격만 봤다(출격 헛걸음 → 버티기).
//   고침(손잡이 켬에서만 · ★[T974] 켬 기본 · 끔(`=0`) = 종전 글자): 몸 층이 "돌격이 접촉 없이 끝났다"를 전쟁에 남기고(`w._assaultMiss`), war-core 가 이튿날 결단에서 돌격 줄을 뺀 같은 표로 고른다
//   (군량 임계 → 철수 · 소모전 우위 → 포위 · 그 밖 → 철수 · 새 수 0).
//   지키는 것: ⓐ 정적(손잡이 문 — ★[T974] 켬 기본 `!== '0'` · env 읽는 자리 하나 · 칸 둘 · 새 수 0 · T771 글자 그대로) · ⓑ 몸 층 — 켬(미설정 — 기본)에서 접촉 수가 그대로면 칸이 선다 · 늘었으면 안 선다 · 출격(방어가 나선) 대치는 안 본다 ·
//             ★끔(`=0` — 되돌림)이면 칸 0 · 몸 칸도 안 건드린다 · 그 밖 값(`=1`)은 켬 · ⓒ war-core — 칸이 있으면 돌격 대신 포위 · 철수 · 칸은 한 번 쓰고 지운다 · ★대조(칸 없음) = 같은 진에서 돌격(종전).
// ⚠존을 부팅하지 않는다 — war-core 정본(`daily`)과 존 정본(`_warToStandoff` — `__p3Bind`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-assault-miss.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const SRC_V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), CV = codeOf(SRC_V);
const SRC_W = fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'), CW = codeOf(SRC_W);
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };

console.log('\n=== 접촉 없이 끝난 돌격은 이튿날 결단에서 돌격 줄을 뺀다(T956) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 문 · 칸 둘 · 새 수 0');
{
  ok(/const T956_ASSAULT_MISS = process\.env\.T956_ASSAULT_MISS !== '0';/.test(CV), "ⓐ 손잡이 하나 — `T956_ASSAULT_MISS !== '0'`(★[T974] 켬 기본 · 되돌림 `=0` 하나)");
  ok((CV.match(/process\.env\.T956_ASSAULT_MISS/g) || []).length === 1, 'ⓐ env 를 읽는 자리 하나(모듈 머리 — 몸 칸 둘은 그 상수만 본다)', (CV.match(/process\.env\.T956_ASSAULT_MISS/g) || []).length);
  const eng = fnBody(CV, '_warEngage'), so = fnBody(CV, '_warToStandoff');
  ok(/if \(T956_ASSAULT_MISS\) body\._t956C0 = side === 'A' \? \(f\.contacts \| 0\) : null;/.test(eng), 'ⓐ 돌격 시작 — 공격이 나설 때(쪽 A)만 그때의 접촉 수를 몸에 적는다(손잡이 문 안)');
  ok(/if \(T956_ASSAULT_MISS && body\._t956C0 != null\) \{ if \(!f \|\| \(f\.contacts \| 0\) === body\._t956C0\) w\._assaultMiss = state\.world\.day; body\._t956C0 = null; \}/.test(so), 'ⓐ 대치 — 접촉 수가 그대로면 그날을 전쟁에 남긴다(`w._assaultMiss`) · 몸 칸은 지운다(손잡이 문 안)');
  ok(/if \(T771_SORTIE_MISS\) body\._t771C0 = side === 'B' \? \(f\.contacts \| 0\) : null;/.test(eng) && /if \(T771_SORTIE_MISS && body\._t771C0 != null\) \{ if \(!f \|\| \(f\.contacts \| 0\) === body\._t771C0\) w\._sortieMiss = state\.world\.day; body\._t771C0 = null; \}/.test(so),
    'ⓐ T771 두 줄(출격 쪽)은 글자 그대로');
  const nd = fnBody(CW, '_opNpcDecide');
  const iMiss = nd.indexOf('if (w._assaultMiss != null)'), iCrit = nd.indexOf('if (pack < WAR_PACK_CRIT) { if (pWin >= WAR_GAMBLE_ODDS)'), iAs = nd.indexOf('if (pWin >= WAR_ASSAULT_ODDS - _capB)');
  ok(iMiss > 0 && iMiss < iCrit && iMiss < iAs && nd.indexOf('const defFoodEst') < iMiss && nd.indexOf("if (w._opPolicy === 'siege')") < iMiss,
    'ⓐ war-core — 그 줄은 승산 · 군량 · 정찰 추정을 다 센 뒤 · 돌격 줄(도박 · 승산)보다 앞이다', `${iMiss} < ${iCrit} · ${iAs}`);
  const blk = nd.slice(iMiss, nd.indexOf('return; }', iMiss) + 9);
  ok(/delete w\._assaultMiss;/.test(blk) && !/'assault'/.test(blk) && /'withdraw'/.test(blk) && /'siege'/.test(blk),
    'ⓐ war-core — 칸은 한 번 쓰고 지운다 · 그 갈래엔 돌격이 없다(철수 · 포위만)', blk.length + '자');
  ok(/pack < WAR_PACK_CRIT/.test(blk) && /pack > defFoodEst \+ 1/.test(blk), 'ⓐ war-core — 문턱은 종전 표의 그 둘(`WAR_PACK_CRIT` · 정찰 곳간 + 1)');
  //   글 꼴(종전 `_opNpcDecide` 글과 같은 백분율 `(pWin * 100 | 0)` · 자릿수 `toFixed(n)`)은 세계 수가 아니다 — 빼고 센다
  const added = ((eng.match(/_t956C0[^;]*;/g) || []).join(' ') + ' ' + (so.match(/T956_ASSAULT_MISS[^}]*\}/g) || []).join(' ') + ' ' + blk.replace(/'[^']*'/g, "''"))
    .replace(/\(pWin \* 100 \| 0\)/g, '').replace(/toFixed\(\d\)/g, '');
  ok(!/[^\w.'D](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(added), 'ⓐ 새 수 0 — 접촉 수 · 날 · 0 · 1(종전 표의 정찰 곳간 + 1) 만', added.length + '자');
}

// ── ⓑ 몸 층(존 정본 `_warToStandoff` — `__p3Bind`) ────────────────────────────────
console.log('\n[ⓑ] 몸 층 — 돌격 대치에서 접촉 수를 본다');
const probeStandoff = (knob, c0, cNow, s771) => {
  //   손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스(같은 정본 · 다른 env) · knob = null(미설정 — ★[T974] 기본 켬) · '0'(끔 — 되돌림) · '1'(그 밖 값 — 켬)
  const env = Object.assign({}, process.env); delete env.T771_SORTIE_MISS; if (knob == null) delete env.T956_ASSAULT_MISS; else env.T956_ASSAULT_MISS = knob;
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});const H=V.__p3Bind({world:{day:12},_warStat:{standoff:0}});`
    + `const w={phase:'battle',op:'assault',_sortie:false};const b={w,fight:{contacts:${cNow}},_t956C0:${c0 === null ? 'null' : c0},_t771C0:${s771 == null ? 'null' : s771}};H._warToStandoff(b);`
    + `process.stdout.write(JSON.stringify({miss:w._assaultMiss===undefined?null:w._assaultMiss,smiss:w._sortieMiss===undefined?null:w._sortieMiss,c0:b._t956C0===undefined?'undef':b._t956C0,phase:w.phase,op:w.op,mode:b.mode,st:H.state._warStat.standoff}));`;
  const out = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(out.slice(out.lastIndexOf('{')));
};
{
  const a = probeStandoff(null, 3, 3);
  ok(a.miss === 12 && a.c0 === null && a.phase === 'march' && a.op === 'camp' && a.mode === 'camp' && a.st === 1,
    'ⓑ ★켬(미설정 — 기본) — 돌격 뒤 접촉 0(3 → 3) 대치 → 그날(12)이 전쟁에 선다 · 몸 칸 지움 · 대치 전이는 종전 그대로', JSON.stringify(a));
  const b = probeStandoff(null, 3, 4);
  ok(b.miss === null && b.c0 === null && b.phase === 'march', 'ⓑ 켬 — 돌격 뒤 한 번이라도 붙었으면(3 → 4) 칸이 안 선다', JSON.stringify(b));
  const c = probeStandoff(null, null, 3, 3);
  ok(c.miss === null && c.smiss === 12, 'ⓑ 켬 — 방어가 나선 판(몸 칸 없음 — 출격)의 대치는 안 본다 · 그 판은 T771 칸이 선다(두 칸이 안 겹친다)', JSON.stringify(c));
  const d = probeStandoff('0', 3, 3);
  ok(d.miss === null && d.c0 === 3 && d.phase === 'march' && d.op === 'camp' && d.st === 1, 'ⓑ ★끔(`=0` — 되돌림) — 같은 몸이어도 칸이 안 선다 · 몸 칸도 안 건드린다(종전 글자)', JSON.stringify(d));
  const e = probeStandoff('1', 3, 3);
  ok(e.miss === 12 && e.c0 === null, "ⓑ 켬(`=1` · 그 밖 값) — 칸이 선다(끄는 값은 `'0'` 하나)", JSON.stringify(e));
}

// ── ⓒ war-core 날 틱(정본 `daily`) ──────────────────────────────────────────────
console.log('\n[ⓒ] war-core — 칸이 있으면 돌격 대신 포위 · 철수 · 칸은 한 번 쓰고 지운다');
const econ = R('sim/economy-sim.js');
const WarCore = R('sim/war-core.js');
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const _origRandom = Math.random;
//   세계 — 두 마을(공격 · 방어) · 진에 선 전쟁 하나(test-sortie-miss `mkCamp` 와 같은 꼴) · 방어는 버티기 정책(출격이 안 나는 마을 — 그날 결단은 공격 쪽만)
//   공격 전력은 돌격 승산(`WAR_ASSAULT_ODDS`)을 넘게 — 칸이 없으면 그날 돌격이 나는 진(대조)
function mkCamp(opts) {
  Math.random = seeded(11);
  const mk = (name, pop) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = 40; e.storage.stone = 400; return e; };
  const atk = { name: '공격A', econ: mk('공격A', 60) }, def = { name: '방어B', econ: mk('방어B', 12) };
  Math.random = _origRandom;
  def._defPolicy = 'hold';
  const villages = [atk, def], logs = [], engages = [];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 2 };
  const war = WarCore.createWar({ villages, world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800,
    log: (day, m) => logs.push('D' + day + ' ' + m), onEngage: (w, day, why) => { engages.push([day, why]); w.phase = 'battle'; return true; } });
  const w = { id: 1, atk, def, casus: 'feud', force: 40, warriors: 20, wep: 1, arm: 1, composition: { dagger: 40 }, weapQ: 0.5, phase: 'march', op: 'camp', eta: 399, marchDays: 1, born: 398, _arriveDay: 399, _packDays: 12, _packRem: (opts && opts.pack != null) ? opts.pack : 12 };
  war.WARS.push(w);
  return { atk, def, world, war, w, logs, engages };
}
{
  const pWin = WarCore._opAtkOdds(mkCamp().w);
  ok(pWin >= WarCore.WAR_ASSAULT_ODDS, '전제 — 이 진의 공격 승산이 돌격 문턱을 넘는다(칸이 없으면 돌격이 나는 진)', `${(pWin * 100).toFixed(1)}% ≥ ${WarCore.WAR_ASSAULT_ODDS * 100}%`);

  // ★대조 — 칸 없음: 그날 돌격 결단 · 훅 'assault'(종전)
  const K = mkCamp(); K.war.daily(400);
  ok(K.logs.some((x) => /돌격 결단\(승산/.test(x)) && K.engages.length === 1 && K.engages[0][1] === 'assault' && K.w.phase === 'battle',
    'ⓒ ★대조 — 칸 없음: 돌격 결단 · 훅 assault(종전 — 어제 돌격이 닿았든 못 닿았든 같은 승산이면 같은 돌격)', JSON.stringify({ logs: K.logs, engages: K.engages }));

  // 칸 있음 · 짐 넉넉 · 방어 곳간 넉넉(짐 ≤ 정찰 곳간 + 1) — 철수(소모전 열세)
  const T = mkCamp(); T.w._assaultMiss = 399; T.war.daily(400);
  ok(!T.engages.length && T.w.phase === 'return' && T.w.op === 'withdraw' && !('_assaultMiss' in T.w) && T.logs.some((x) => /철수\(승산 \d+%·소모전 열세·D399 돌격이 닿지 못했다\)/.test(x)),
    'ⓒ 칸 있음(방어 곳간 넉넉) — 돌격 0 · 철수(소모전 열세 · 로그에 그날) · 칸은 지웠다', JSON.stringify({ logs: T.logs, op: T.w.op, engages: T.engages }));
  // 칸 있음 · 방어 곳간 바닥(짐 11일 > 정찰 곳간 + 1) — 포위(소모전 우위)
  const G = mkCamp(); G.def.econ.storage.food = 0; G.w._assaultMiss = 399; G.war.daily(400);
  ok(!G.engages.length && G.w.op === 'siege' && G.w.phase === 'march' && !('_assaultMiss' in G.w) && G.logs.some((x) => /포위 유지 결단\(소모전 우위.*D399 돌격이 닿지 못했다\)/.test(x)),
    'ⓒ 칸 있음(방어 곳간 바닥) — 돌격 0 · 포위 결단(소모전 우위 · 로그에 그날) · 칸은 지웠다', JSON.stringify({ logs: G.logs, op: G.w.op, engages: G.engages }));

  // 칸 있음 · 짐 바닥(0) — 철수(도박 돌격 줄 없음)
  const P = mkCamp({ pack: 0 }); P.w._assaultMiss = 399; P.war.daily(400);
  ok(!P.engages.length && P.w.phase === 'return' && P.w.op === 'withdraw' && P.logs.some((x) => /철수\(군량 0\.0일·D399 돌격이 닿지 못했다\)/.test(x)),
    'ⓒ 칸 있음(짐 0) — 철수(귀환) · 도박 돌격 0', JSON.stringify({ logs: P.logs, phase: P.w.phase }));
  const P0 = mkCamp({ pack: 0 }); P0.war.daily(400);
  ok(P0.engages.length === 1 && P0.engages[0][1] === 'assault' && P0.logs.some((x) => /돌격 결단\(군량 0\.0일 — 도박 승산/.test(x)),
    'ⓒ ★대조 — 짐 0 · 칸 없음: 도박 돌격(종전 — 짐이 바닥나도 끝나지 않던 줄)', JSON.stringify({ logs: P0.logs, engages: P0.engages }));

  // 칸은 하루치 — 포위한 이튿날(칸 없음)은 종전 표 그대로(돌격 승산이면 돌격)
  //   (D400 은 방어 곳간을 비워 포위로 — 그날 곳간을 되돌려 D401 항복 검사는 안 서게 · D401 결단은 칸 없는 종전 표)
  const N = mkCamp(); const f0 = N.def.econ.storage.food; N.def.econ.storage.food = 0; N.w._assaultMiss = 399; N.war.daily(400); N.def.econ.storage.food = f0; N.war.daily(401);
  const n401 = N.logs.filter((x) => /^D401 /.test(x));
  ok(n401.some((x) => /돌격 결단/.test(x)) && N.engages.length === 1 && N.engages[0][0] === 401, 'ⓒ 칸은 하루치 — 이튿날은 종전 표(돌격)', JSON.stringify(n401));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
