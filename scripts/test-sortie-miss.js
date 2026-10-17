#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-sortie-miss.js — 접촉 없이 끝난 출격은 이튿날 결단을 공격 쪽에 돌려준다(T771 · 손잡이 `T771_SORTIE_MISS`) ==========
//
// ★왜 [지시 T771 · T764 회부 4 — 전쟁 자 시드 1020 W6 41일 교착]
//   방어 출격(`_warEngage` 'sortie')은 방어 쪽이 나서고 공격은 holder(쫓지 않음)다. 몸 상한 1 에서 방어 몸은 궁수 하나였다(징발 차례 원거리 먼저).
//   화살 20 을 다 쓴 궁수는 탄이 없으면 집으로 물러난다(battle-core `flee`) — 접촉 0 · 7초 뒤 대치(`_warToStandoff`) · 이튿날 war-core 가 **또 출격**을 정했다.
//   war-core 날 틱은 출격이 나면 공격 쪽 결단(`_opNpcDecide` — 군량 소진 철수 · 돌격)을 건너뛴다(`continue`) ⇒ 공격은 41일 동안 결단을 한 번도 못 했다.
//   고침(손잡이 켬에서만 · 끔 = 종전 글자): 몸 층이 "출격이 접촉 없이 끝났다"를 전쟁에 남기고(`w._sortieMiss`), war-core 가 이튿날 그 칸을 보고
//   버티기로 돌린다(태세 히스테리시스 `WAR_DEF_HYST` 그대로) — 그날부터 공격 쪽 결단이 돈다.
//   지키는 것: ⓐ 정적(손잡이 문 · 칸 둘 · 새 수 0) · ⓑ 몸 층 — 접촉 수가 그대로면 칸이 선다 · 늘었으면 안 선다 · 돌격(공격이 나선) 대치는 안 본다 · ★끔이면 칸 0 ·
//             ⓒ war-core — 칸이 있으면 출격 대신 버티기 · 공격 결단이 돈다 · 칸은 한 번 쓰고 지운다 · ★대조(칸 없음) = 출격이 결단을 막는다(종전).
// ⚠존을 부팅하지 않는다 — war-core 정본(`daily`)과 존 정본(`_warToStandoff` — `__p3Bind`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-sortie-miss.js
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

console.log('\n=== 접촉 없이 끝난 출격은 이튿날 결단을 공격 쪽에 돌려준다(T771) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 문 · 칸 둘 · 새 수 0');
{
  ok(/const T771_SORTIE_MISS = process\.env\.T771_SORTIE_MISS === '1';/.test(CV), "ⓐ 손잡이 하나 — `T771_SORTIE_MISS === '1'`(기본 끔)");
  const eng = fnBody(CV, '_warEngage'), so = fnBody(CV, '_warToStandoff');
  ok(/if \(T771_SORTIE_MISS\) body\._t771C0 = side === 'B' \? \(f\.contacts \| 0\) : null;/.test(eng), 'ⓐ 출격 시작 — 방어가 나설 때(쪽 B)만 그때의 접촉 수를 몸에 적는다(손잡이 문 안)');
  ok(/if \(T771_SORTIE_MISS && body\._t771C0 != null\) \{ if \(!f \|\| \(f\.contacts \| 0\) === body\._t771C0\) w\._sortieMiss = state\.world\.day; body\._t771C0 = null; \}/.test(so), 'ⓐ 대치 — 접촉 수가 그대로면 그날을 전쟁에 남긴다(`w._sortieMiss`) · 몸 칸은 지운다(손잡이 문 안)');
  const dd = fnBody(CW, '_opDefenseDaily');
  ok(/if \(w\._sortieMiss != null\) \{ const md = w\._sortieMiss; delete w\._sortieMiss; w\._defMode = 'hold'; w\._defModeDay = day; log\(/.test(dd), "ⓐ war-core — 칸이 있으면 버티기(태세 · 태세 날) · 칸은 한 번 쓰고 지운다 · 로그");
  ok(dd.indexOf('_sortieMiss') < dd.indexOf("w._defMode === 'respond' && !w._sortie"), 'ⓐ war-core — 그 줄은 출격 결단보다 앞이다(그날 출격이 안 난다 → 날 틱이 공격 결단으로 간다)');
  const added = (eng.match(/_t771C0[^;]*;/g) || []).join(' ') + ' ' + (so.match(/T771_SORTIE_MISS[^}]*\}/g) || []).join(' ') + ' ' + (dd.match(/_sortieMiss[^}]*\}/g) || []).join(' ');
  ok(!/[^\w.'D](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(added), 'ⓐ 새 수 0 — 접촉 수 · 날 · 0 만', added.length + '자');
}

// ── ⓑ 몸 층(존 정본 `_warToStandoff` — `__p3Bind`) ────────────────────────────────
console.log('\n[ⓑ] 몸 층 — 출격 대치에서 접촉 수를 본다');
const probeStandoff = (knob, c0, cNow) => {
  //   손잡이는 모듈을 싣는 순간 읽는다 ⇒ 판마다 아이 프로세스(같은 정본 · 다른 env)
  const env = Object.assign({}, process.env); if (knob) env.T771_SORTIE_MISS = '1'; else delete env.T771_SORTIE_MISS;
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))});const H=V.__p3Bind({world:{day:12},_warStat:{standoff:0}});`
    + `const w={phase:'battle',op:'camp',_sortie:true};const b={w,fight:{contacts:${cNow}},_t771C0:${c0 === null ? 'null' : c0}};H._warToStandoff(b);`
    + `process.stdout.write(JSON.stringify({miss:w._sortieMiss===undefined?null:w._sortieMiss,c0:b._t771C0===undefined?'undef':b._t771C0,phase:w.phase,op:w.op,sortie:w._sortie,mode:b.mode,st:H.state._warStat.standoff}));`;
  const out = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(out.slice(out.lastIndexOf('{')));
};
{
  const a = probeStandoff(true, 3, 3);
  ok(a.miss === 12 && a.c0 === null && a.phase === 'march' && a.op === 'camp' && a.sortie === false && a.mode === 'camp' && a.st === 1,
    'ⓑ 켬 — 출격 뒤 접촉 0(3 → 3) 대치 → 그날(12)이 전쟁에 선다 · 몸 칸 지움 · 대치 전이는 종전 그대로', JSON.stringify(a));
  const b = probeStandoff(true, 3, 4);
  ok(b.miss === null && b.c0 === null && b.phase === 'march', 'ⓑ 켬 — 출격 뒤 한 번이라도 붙었으면(3 → 4) 칸이 안 선다', JSON.stringify(b));
  const c = probeStandoff(true, null, 3);
  ok(c.miss === null && c.c0 === null && c.phase === 'march', 'ⓑ 켬 — 공격이 나선 판(몸 칸 없음 — 돌격)의 대치는 안 본다', JSON.stringify(c));
  const d = probeStandoff(false, 3, 3);
  ok(d.miss === null && d.c0 === 3 && d.phase === 'march' && d.op === 'camp' && d.sortie === false && d.st === 1, 'ⓑ ★끔 — 같은 몸이어도 칸이 안 선다 · 몸 칸도 안 건드린다(종전 글자)', JSON.stringify(d));
}

// ── ⓒ war-core 날 틱(정본 `daily`) ──────────────────────────────────────────────
console.log('\n[ⓒ] war-core — 칸이 있으면 출격 대신 버티기 · 공격 결단이 돈다');
const econ = R('sim/economy-sim.js');
const WarCore = R('sim/war-core.js');
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const _origRandom = Math.random;
//   세계 — 두 마을(공격 · 방어) · 진에 선 전쟁 하나(test-war-world `_run` 의 손 전쟁과 같은 꼴) · 방어는 응전 정책(출격이 나는 마을)
function mkCamp(opts) {
  Math.random = seeded(11);
  const mk = (name, pop) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = 40; e.storage.stone = 400; return e; };
  const atk = { name: '공격A', econ: mk('공격A', 30) }, def = { name: '방어B', econ: mk('방어B', 40) };
  Math.random = _origRandom;
  def._defPolicy = 'respond';
  const villages = [atk, def], logs = [], engages = [];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 2 };
  const war = WarCore.createWar({ villages, world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800,
    log: (day, m) => logs.push('D' + day + ' ' + m), onEngage: (w, day, why) => { engages.push([day, why]); w.phase = 'battle'; return true; } });
  const w = { id: 1, atk, def, casus: 'feud', force: 2, warriors: 1, composition: { dagger: 2 }, weapQ: 0.5, phase: 'march', op: 'camp', eta: 399, marchDays: 1, born: 398, _arriveDay: 399, _packDays: 12, _packRem: 12 };
  if (opts && opts.policy) w._opPolicy = opts.policy;
  war.WARS.push(w);
  return { atk, def, world, war, w, logs, engages };
}
{
  // ★대조 — 칸 없음: 응전 마을은 출격을 정하고(출격 결단 로그 · 훅 'sortie'), 그날 공격 결단은 없다(종전)
  const K = mkCamp(); K.war.daily(400);
  const kSortie = K.logs.some((x) => /출격\(sortie\) 결단/.test(x)), kAtk = K.logs.some((x) => /돌격 결단|포위 유지 결단|철수\(/.test(x));
  ok(kSortie && K.engages.length === 1 && K.engages[0][1] === 'sortie' && !kAtk && K.w.phase === 'battle',
    'ⓒ ★대조 — 칸 없음: 출격 결단 · 훅 sortie · 그날 공격 결단 0(출격이 날 틱을 끊는다 — 종전)', JSON.stringify({ logs: K.logs, engages: K.engages, op: K.w.op }));

  // 칸 있음(어제 출격이 접촉 없이 끝났다): 출격 대신 버티기 · 공격 결단이 돈다
  const T = mkCamp(); T.w._sortieMiss = 399; T.war.daily(400);
  const tHold = T.logs.some((x) => /방어 태세: 버티기\(D399 출격이 닿지 못했다\)/.test(x)), tSortie = T.logs.some((x) => /출격\(sortie\) 결단/.test(x));
  const tAtk = T.logs.some((x) => /돌격 결단|포위 유지 결단|철수\(/.test(x));
  ok(tHold && !tSortie && T.w._defMode === 'hold' && T.w._defModeDay === 400 && !('_sortieMiss' in T.w),
    'ⓒ 칸 있음 — 버티기 로그 · 태세 hold(오늘) · 출격 0 · 칸은 지웠다', JSON.stringify({ logs: T.logs, mode: T.w._defMode, day: T.w._defModeDay }));
  ok(tAtk && !T.engages.some((e) => e[1] === 'sortie'), 'ⓒ 칸 있음 — 그날 공격 쪽 결단이 돈다(돌격 · 포위 · 철수 중 하나) · 훅에 sortie 0',
    JSON.stringify({ op: T.w.op, engages: T.engages }));

  // 군량 바닥(팩 0) — 결단이 돌면 철수 또는 도박 돌격으로 전쟁이 끝난다(41일 교착의 꼴)
  const P = mkCamp(); P.w._packRem = 0; P.w._sortieMiss = 399; P.war.daily(400);
  const pEnd = P.logs.some((x) => /철수\(군량|돌격 결단\(군량/.test(x));
  ok(pEnd && (P.w.phase === 'return' || P.w.phase === 'battle'), 'ⓒ 군량 바닥 — 칸이 있으면 그날 군량 결단(철수 · 도박 돌격)으로 간다', JSON.stringify({ logs: P.logs.filter((x) => !/버티기/.test(x)), phase: P.w.phase, op: P.w.op }));
  const P0 = mkCamp(); P0.w._packRem = 0; P0.war.daily(400);
  ok(!P0.logs.some((x) => /철수\(|돌격 결단/.test(x)) && P0.engages.length === 1 && P0.engages[0][1] === 'sortie', 'ⓒ ★대조 — 군량 바닥이어도 칸이 없으면 출격이 먼저다(공격은 결단 못 함 — 교착의 꼴)', JSON.stringify({ logs: P0.logs, engages: P0.engages }));

  // 이튿날(히스테리시스 안) — 출격 없이 공격 결단이 또 돈다 · 그다음 날 태세를 다시 본다(응전 정책 → 응전)
  const N = mkCamp({ policy: 'siege' }); N.w._sortieMiss = 399; N.war.daily(400);
  if (N.w.phase === 'march') { N.w._sortie = false; N.war.daily(401); }
  const n401 = N.logs.filter((x) => /^D401 /.test(x));
  ok(N.w._defMode === 'hold' && !n401.some((x) => /출격\(sortie\)/.test(x)), 'ⓒ 이튿날(히스테리시스 안) — 버티기 그대로 · 출격 0', JSON.stringify(n401));
  if (N.w.phase === 'march') N.war.daily(402);
  const n402 = N.logs.filter((x) => /^D402 /.test(x));
  ok(n402.some((x) => /방어 태세: 응전 소집/.test(x)) || N.w.phase !== 'march', 'ⓒ 히스테리시스 뒤 — 태세를 다시 본다(응전 정책 마을은 응전으로 돌아온다)', JSON.stringify(n402));
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
