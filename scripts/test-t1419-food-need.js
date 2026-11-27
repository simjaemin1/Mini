#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1419-food-need.js — 식량 "30날치"를 걷는다(`T1419_FOOD_NEED` 끔 기본 · `'harv'` = (가) 버틸 날 · `'flow'` = (나) 문 걷기) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · 작은 세계(8마을 · 40날 · 정본 `tickWorldV2`)를 그대로 돌린다 · 날짜 · 벽시계 0 — 판 날만 센다):
//   ① 손잡이 — `'harv'` · `'flow'` 만 켬(없음 · `'1'` · `'true'` · `'HARV'` = 끔)
//   ② 끔 = 종전 — `t1419Days` 가 종전 수를 그대로 돌려준다 · 작은 세계 40날에 필요 날 함수(`foodNeedDays`) 부름 0 · 자리 셈 0 · (나) 먹은 흐름 칸 0
//   ③ 전수 lint — 식량 판정 자리(세 파일 · 아래 `SITES`)가 다 한 함수를 읽는다(글자 · 자리마다 수) ·
//      세 파일 코드(주석 뺌)에 맨 식량 30(식량 낱말과 한 줄에 선 30)이 표(`ALLOW` — 종전 수의 이름 · 식량 밖 30 · 끔 손잡이 · 물리)밖에 0
//   ④ 일곱 자리가 같은 함수 — (가) 작은 세계 40날에 값의 기준 · 기근 문 · 전환 빠르기 · 출발 문 · 갈무리 자리가 선다 ·
//      꾸민 밭 마을(가을) 하나에서 일곱 자리 값(`t1419Days` 자리 일곱) = 날 수 함수 셋(`t1297NeedDays` · `t1319MigNeedDays` · `t1374NeedDays`) = v2 생존 목표 날(`t1419Subs` 식량) = `foodNeedDays` 하나 ·
//      출생 문 정본(`t1306GradeDP`)의 몫 = 곳간 ÷ ((사람 + 1) × 버틸 날) · 갈무리 정본(`_preserveSurplus`)은 버틸 날 위에서만 말린다 · 식량 밖(나무) 생존 목표 = 30 그대로
//   ⑤ 어촌 ↔ 밭 마을 — 꾸민 마을(같은 사람 30 · 오늘 흐름 = 먹을 것): 가을 · 봄 모두 밭 > 어촌 · 밭 세계(밭만 · 다음 거둠 120날 뒤) = 120 · 날마다 넉넉한 마을(흐름 = 먹을 것 × 2) = 1
//   ⑥ (나) — 문 자리 0 · 값의 기준 = 30 × 먹은 흐름 ÷ 하루 먹을 것 · 작은 세계 40날에 먹은 흐름 칸이 산 마을마다 선다 · 필요 날 함수 부름 0
//   ⑦ 미끼 셋(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 아이에 싣는다):
//      old30(기근 문 한 자리만 옛 30 → ③ 맨 30 · ④ 기근 문 자리 0 빨강) · const(버틸 날을 상수로 → ⑤ 밭 = 어촌 빨강) · offcall(끔인데 필요 날 함수를 부름 → ② 빨강)
//
// 실행: node scripts/test-t1419-food-need.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1419_HARNESS_ARM || '', MUT = process.env.T1419_MUTANT || '';
const V1F = 'sim/economy-sim.js', V2F = 'sim/economy-sim-v2.js', VSF = 'server/villages.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔]
const BAITS = {
  old30: [V1F, "  if (foodEquiv < N * t1419Days(v, null, 30, 'famine')) {", '  if (foodEquiv < N * 30) {', 'harv'],
  const: [V1F, '  const d = Math.max(1, best / C) + _b;', '  const d = 30;', 'harv'],   // ★[T1437] 핀 — (가) 몸통 줄이 'seen' 여유분을 더한다(판정 무변 · 같은 자리)
  offcall: [V1F, '  if (!T1419_FOOD_NEED) return legacy;', '  if (!T1419_FOOD_NEED) { foodNeedDays(v, day == null ? 0 : day); return legacy; }', 'off'],
};
const KNOBS = ['T1419_FOOD_NEED', 'T1297_BIRTH_FOOD', 'T1306_BIRTH_GRADE', 'T1306_MIGRATE_FOOD', 'T1319_AUTUMN_LOOK', 'T1346_BIRTH_FLOW', 'T1243_FARM_ON', 'T1374_BIRTH_HARV', 'T1374_FAMINE_HARV', 'T1373_NO_SEASON_YIELD', 'T570_CALENDAR', 'T726_ONE_TARGET', 'T1152_MARKET', 'T1156_SPECIALTY_JOB', 'T1384_MINE_FOOD', 'T1384_FOOD_KEEP'];
const DA = 200, DS = 10;   // 판 날 — 가을(9월 17일 · 게임일 0 = 1년 3월 1일) · 봄(3월 11일)

// ── 아이 판 ────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of KNOBS) delete process.env[k];
  if (ARM === 'harv' || ARM === 'flow') process.env.T1419_FOOD_NEED = ARM;
  else if (ARM.startsWith('k:')) process.env.T1419_FOOD_NEED = ARM.slice(2);
  process.env.ENABLE_VILLAGES = '0';
  const out = { arm: ARM, mut: MUT || null, loadErr: null, knob: null, world: null, syn: null };
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
    const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT];
    if (!B) out.loadErr = 'bait unknown ' + MUT;
    else M._extensions['.js'] = function (m, f) {
      if (f !== path.join(ROOT, B[0])) return old(m, f);
      const x = fs.readFileSync(f, 'utf8');
      if (x.split(B[1]).length !== 2) throw new Error('bait site count ' + MUT);
      m._compile(x.replace(B[1], B[2]), f);
    };
  }
  let E = null, V2 = null;
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  try { quiet(() => { E = require(path.join(ROOT, V1F)); V2 = require(path.join(ROOT, V2F)); }); }
  catch (e) { out.loadErr = String((e && e.message) || e).slice(0, 300); }
  if (E) out.knob = E.T1419_FOOD_NEED;
  const r6 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1e6) / 1e6;
  if (E && V2 && !ARM.startsWith('k:')) {
    // 작은 세계 — 8 마을 · 40날(정본 틱 그대로)
    try {
      quiet(() => {
        if (E.setSeed) E.setSeed(1);
        const w = V2.createWorldV2({ seed: 1020, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
        for (let d = 0; d < 40; d++) V2.tickWorldV2(w);
        const live = w.villages.filter((v) => (v.npcs || []).length > 0);
        out.world = { stat: E.t1419Stat(), live: live.length, pop: live.reduce((a, v) => a + v.npcs.length, 0), eat: live.filter((v) => typeof v._t1419Eat === 'number').length };
      });
    } catch (e) { out.world = { err: String((e && e.stack) || e).slice(0, 300) }; }
    // 꾸민 마을 — 사람 30 · 오늘 흐름 = 먹을 것(식량 흐름 EMA 0) · 들여온 것 0
    if (ARM !== 'off') {
      const S = out.syn = {};
      try {
        quiet(() => {
          const N = 30;
          const mk = (name, land, counts, ema, day) => {
            if (E.setSeed) E.setSeed(1);
            const v = E.createVillage(Object.assign({ fertility: 0.5, water: 0.5, stone: 0.5, ore: 0, wood: 0.5, game: 0.5, arable: 1, size: 70, initialPop: N, name }, land));
            v.counts = counts; v.surplusEMA = { food: ema }; v._importEMA = 0; v._world = { day };
            for (const k of Object.keys(v.storage)) if (typeof v.storage[k] === 'number') v.storage[k] = 0;
            return v;
          };
          const fish = (d) => mk('T1419F', { water: 1.0 }, { fisher: 10 }, 0, d), farm = (d) => mk('T1419P', { fertility: 1.0 }, { farmer: 10 }, 0, d);
          S.fishA = r6(E.foodNeedDays(fish(DA), DA)); S.farmA = r6(E.foodNeedDays(farm(DA), DA));
          S.fishS = r6(E.foodNeedDays(fish(DS), DS)); S.farmS = r6(E.foodNeedDays(farm(DS), DS));
          const fw = farm(DA); fw._t1374Next = DA + 120; S.farmWorld = r6(E.foodNeedDays(fw, DA));
          S.rich = r6(E.foodNeedDays(mk('T1419R', { fertility: 1.0 }, { farmer: 10 }, N, DA), DA));
          // 일곱 자리 — 같은 마을 · 같은 날
          const v = farm(DA), f0 = E.foodNeedDays(v, DA);
          S.f0 = r6(f0);
          S.sites = {};
          for (const t of ['ref', 'famine', 'birth', 'mig', 'keep', 'switch', 'depart']) S.sites[t] = r6(E.t1419Days(v, DA, 30, t));
          S.fn = { t1297: r6(E.t1297NeedDays(DA, v)), t1319: r6(E.t1319MigNeedDays(DA, v)), t1374: r6(E.t1374NeedDays(v, DA)), subsFood: r6(E.t1419Subs(v, 'food', 'ref')), subsWood: r6(E.t1419Subs(v, 'wood', 'ref')), noV: r6(E.t1297NeedDays(DA)) };
          // 출생 문 정본 — 곳간 3 · 사람 30
          const b = farm(DA); b.storage.food = 3; E.t1306GradeDP(b, 1, N, DA); S.birthR = r6(b._t1306R); S.birthWant = r6(3 / ((N + 1) * E.DAILY_FOOD_CONSUMPTION * E.foodNeedDays(b, DA)));
          // 갈무리 정본 — 버틸 날 위 · 밑
          const keep = (k) => { const g = farm(DA); const need = E.foodNeedDays(g, DA); g.storage.fish = N * E.DAILY_FOOD_CONSUMPTION * need * k; let n = 0; E._preserveSurplus(g, { fish: 'dried_fish' }, 5, () => { n++; }); return n; };
          S.keepHi = keep(1.05); S.keepLo = keep(0.95);
          // (나) — 먹은 흐름 15 / 하루 먹을 것 30
          const fl = farm(DA); fl._t1419Eat = 15; S.flowRef = r6(E.t1419Days(fl, DA, 30, 'ref')); S.flowGate = ['famine', 'birth', 'mig', 'keep', 'switch', 'depart'].map((t) => E.t1419Days(fl, DA, 30, t));
          S.stat = E.t1419Stat();
        });
      } catch (e) { S.err = String((e && e.stack) || e).slice(0, 300); }
    }
  }
  console.log('@@T1419 ' + JSON.stringify(out));
  process.exit(0);
}

// ── 어미 ────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ← ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const J = (x) => JSON.stringify(x);
const child = (arm, mut) => {
  const env = Object.assign({}, process.env, { T1419_HARNESS_ARM: arm }); if (mut) env.T1419_MUTANT = mut; else delete env.T1419_MUTANT;
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@T1419 '));
  if (!line) return { loadErr: 'no output rc=' + r.status + ' ' + String(r.stderr || '').slice(-300) };
  return JSON.parse(line.slice(8));
};
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) <= (e || 1e-6);
const CO = require('./code-only.js');
const SRC = { [V1F]: fs.readFileSync(path.join(ROOT, V1F), 'utf8'), [V2F]: fs.readFileSync(path.join(ROOT, V2F), 'utf8'), [VSF]: fs.readFileSync(path.join(ROOT, VSF), 'utf8') };

// ③ 전수 lint — 자리 표(글자 · 수)와 맨 식량 30
//   자리: [파일 · 한 함수를 읽는 글자 · 수 · 갈래]
const SITES = [
  [V1F, "_N * DAILY_FOOD_CONSUMPTION * t1419Days(v, null, RESERVE_PC.food || 30, 'keep')", 1, '갈무리'],
  [V1F, "(v.npcs.length || 1) * t1419Days(v, null, 30, 'switch')", 1, '전환 빠르기(T1085 배고픔)'],
  [V1F, "foodEquiv_for_switch < N_pop * t1419Days(v, day, 30, 'switch')", 1, '전환 빠르기(전환 간격)'],
  [V1F, "=== '10' ? 10 : t1419Days(v, day, 30, 'pace')", 1, '전환 빠르기(T1228)'],
  [V1F, "if (foodEquiv < N * t1419Days(v, null, 30, 'famine')) {", 1, '기근 문'],
  [V1F, "totalFoodEquivalent(v) < N * t1419Days(v, null, 30, 'famine') && t1363ToolCrit(v)", 1, '기근 문(T1363)'],
  [V1F, "totalFoodEquivalent(v) > N * t1419Days(v, null, 30, 'mason')", 1, '기근 문(옛 피커 석공)'],
  [V1F, "v.npcs.length * t1419Days(v, day, 30, 'rescue')", 1, '기근 문(작은 마을 구조)'],
  [V1F, "(v.npcs.length || 1) * t1419Days(v, null, 30, 'foodsec')", 1, '기근 문(식량 안정)'],
  [V1F, "T1374_FAMINE_HARV && !T1419_FOOD_NEED ?", 1, '기근 문(T1374 자 — 켬이면 한 함수가 바로)'],
  [V1F, "function t1297NeedDays(day, v, tag) { if (T1419_FOOD_NEED && v) return t1419Days(v, day, null, tag || 'birth');", 1, '출생 문(T1297 · T1319 · T1346)'],
  [V1F, 'DAILY_FOOD_CONSUMPTION * t1297NeedDays(day, v)', 2, '출생 문(T1297 줄 · T1306 단계)'],
  [V1F, "function t1374NeedDays(v, day) { if (T1419_FOOD_NEED) return t1419Days(v, day, null, 'birth');", 1, '출생 문(T1374)'],
  [V1F, "function t1319MigNeedDays(day, v) { if (T1419_FOOD_NEED && v) return t1419Days(v, day, null, 'mig');", 1, '이주 문'],
  [VSF, "E1.t1297NeedDays(day, vil.econ, 'mig')", 1, '이주 문(T1324 들은 줄)'],
  [VSF, '(E1.t1319MigNeedDays || E1.t1297NeedDays)(day, toVil.econ)', 2, '이주 문(T1306 · T1312)'],
  [V1F, "(r === 'food' && T1419_FOOD_NEED ? t1419Days(v, null, 0, 'ref') * DAILY_FOOD_CONSUMPTION : (RESERVE_PC[r] || 0)) * N", 1, '값의 기준(금고 유보)'],
  [V1F, "dailyCons * (T1419_FOOD4[resourceKey] ? t1419Days(v, null, 30, 'ref') : 30)", 1, '값의 기준(v1 유보)'],
  [V1F, "r === 'food' && T1419_FOOD_NEED ? t1419Days(v, null, 0, 'ref') * DAILY_FOOD_CONSUMPTION : RESERVE", 2, '값의 기준(v1 거래소 · 시세)'],
  [V2F, "function _t1419Sub(v, r, tag) { return v1.T1419_FOOD_NEED ? v1.t1419Subs(v, r, tag) : 30; }", 1, '값의 기준 · 출발 문(v2 한 함수)'],
  [V2F, "Math.max(subs * _t1419Sub(v, r, 'ref'), buffer, flowT, derivT)", 3, '값의 기준(결정층 · 정산 · 부패 — ★T1493 족보 935 맞춤)'],
  [V2F, "v.surplusEMA.food * _t1419Sub(v, 'food', 'ref')", 2, '값의 기준(적자 선반영)'],
  [V2F, "Math.max(subs * _t1419Sub(a.v, r, 'ref'), buffer)", 1, '값의 기준(수출 보유)'],
  [V2F, "N * _t1419Sub(a.v, 'food', 'ref') * 1.2", 1, '값의 기준(T1384 사본)'],
  [V2F, "tg = Math.max(subs * _t1419Sub(a.v, r, 'ref'), buf)", 2, '값의 기준(출발 직후 값)'],
  [V2F, "aSubs * _t1419Sub(a.v, r, 'ref')", 1, '값의 기준(귀로 사는 쪽)'],
  [V2F, "subs * _t1419Sub(from, r, 'ref')", 1, '값의 기준(귀환 글럿)'],
  [V2F, "bn * _t1419Sub(bd.v, fr, 'depart')", 1, '출발 문(그곳 식량)'],
  [V2F, "bSubs * _t1419Sub(b.v, r, 'depart')", 1, '출발 문(귀로 파는 쪽)'],
  [V2F, "v1.T1419_FOOD_NEED ? v1.t1419Days(v, null, 30, 'famine') : 30; // the famine block", 1, '기근 문(T1156 사본)'],
];
//   맨 식량 30 표 — [파일 · 글자(주석 뺀 줄 · 한 함수 부름을 D 로 접은 뒤) · 수 · 까닭]
const ALLOW = [
  [V1F, 'food: 30, fish: 10, meat: 8, cooked_food: 5,', 1, '`RESERVE_PC` 표 — 종전 수(읽는 자리는 한 함수)'],
  [V1F, '_food / Math.max(1, _pop * 30)', 1, '몸 낫기(`npcRegenMul`) — 판정 아님(물리 · 다음 거리)'],
  [V1F, 'const T1297_FAMINE_DAYS = 30;', 1, '종전 수의 이름(끔 값)'],
  [V1F, 'T1419_FOOD4[r] ? D : 30;', 1, '식량 밖 생존 목표 30(다음 거리)'],
  [V1F, 'T1419_FOOD4[resourceKey] ? D : 30', 1, '식량 밖 30일치(다음 거리)'],
  [V2F, '(SUBSISTENCE_PER_NPC.dried_fish||0)*30', 1, 'T1192 끔 — 건어물 생존량 0 × 30'],
  [V2F, "H: 30, e: ELASTICITY.food", 1, 'T1152 끔 — 열량 하나의 시장(제 곡선)'],
  [V2F, 'T1152_DEF30 ? 30 : C.H', 2, 'T1152 끔 — 열량 하나의 시장(제 곡선)'],
  [V2F, 'v1.t1419Subs(v, r, tag) : 30;', 1, '끔 = 30(종전 글자)'],
  [V2F, 'v1.T1419_FOOD_NEED ? v1.D : 30', 1, 'T1156 끔 = 30(종전 글자)'],
  [VSF, 'if (day % 30 === 0) { s.snaps.push(', 1, '한 해 창 표본 간격(T1276) — 판정 아님'],
];
const FOODW = /food|Food|FOOD|식량|[sS]ubs\b|RESERVE_PC|FAMINE|famine|foodEquiv|_fe\b|\bfe\b/;
const fold = (x) => x.replace(/t1419Days\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'D').replace(/_t1419Sub\([^()]*(?:\([^()]*\)[^()]*)*\)/g, 'D');
const lint = (src) => {   // src = { 파일: 글자 } → { miss: 자리 수 어긋남, bare: 표 밖 맨 30 }
  const miss = SITES.filter(([f, s, n]) => src[f].split(s).length - 1 !== n).map(([f, s, n, t]) => `${t}(${src[f].split(s).length - 1}/${n})`);
  const bare = [], used = new Map();
  for (const f of [V1F, V2F, VSF]) {
    CO(src[f]).split('\n').forEach((ln, i) => {
      const x = fold(ln);
      if (!/\b30\b/.test(x) || !FOODW.test(x)) return;
      const a = ALLOW.find(([af, s]) => af === f && x.includes(s));
      if (!a) { bare.push(`${f}:${i + 1} ${x.trim().slice(0, 90)}`); return; }
      used.set(a, (used.get(a) || 0) + 1);
    });
  }
  for (const a of ALLOW) if ((used.get(a) || 0) > a[2]) bare.push(`${a[0]} 표 줄 넘침 ${a[3]} ${used.get(a)}/${a[2]}`);
  return { miss, bare };
};

console.log('\n① 손잡이 — `\'harv\'` · `\'flow\'` 만 켬');
const K = ['k:1', 'k:true', 'k:HARV'].map((a) => child(a));
const A = { off: child('off'), harv: child('harv'), flow: child('flow') };
ok(A.off.knob === '' && A.harv.knob === 'harv' && A.flow.knob === 'flow' && K.every((x) => x.knob === ''), '① 없음 · `1` · `true` · `HARV` = 끔 · `harv` · `flow` 만 켬', J([A.off.knob, A.harv.knob, A.flow.knob, ...K.map((x) => x.knob)]));

console.log('\n② 끔 = 종전');
{
  const W = A.off.world || {};
  ok(!A.off.loadErr && W.stat && W.live >= 6 && W.pop > 100, '② [전제] 끔 작은 세계 40날이 돌았다(산 마을 ≥ 6 — 0 이면 아래가 자명 통과다)', J({ err: A.off.loadErr || W.err, live: W.live, pop: W.pop }));
  ok(W.stat && W.stat.calls === 0 && Object.keys(W.stat.tags).length === 0 && W.eat === 0, '★② 끔 — 필요 날 함수 부름 0 · 자리 셈 0 · 먹은 흐름 칸 0(종전 수를 그 자리에서 돌려준다)', J(W.stat));
}

console.log('\n③ 전수 lint — 식량 판정 자리가 한 함수를 읽고 맨 식량 30 이 표 밖에 0');
{
  const L = lint(SRC);
  ok(L.miss.length === 0, `★③ 자리 ${SITES.length} 줄(세 파일)이 다 한 함수를 읽는다(글자 · 자리마다 수)`, L.miss.join(' · '));
  ok(L.bare.length === 0, '★③ 코드(주석 뺌)의 맨 식량 30 — 표(종전 수 이름 · 식량 밖 · 끔 손잡이 · 물리) 밖 0', L.bare.join(' | '));
  const grp = new Set(SITES.map((s) => s[3].replace(/\(.*$/, '')));
  ok(['값의 기준', '기근 문', '출생 문', '이주 문', '갈무리', '전환 빠르기', '출발 문'].every((g) => grp.has(g)), '③ 자리 표가 일곱 갈래를 다 든다', [...grp].join(' · '));
}

console.log('\n④ 일곱 자리가 같은 함수');
{
  const W = A.harv.world || {}, S = A.harv.syn || {};
  ok(!A.harv.loadErr && W.stat && W.live >= 6 && !S.err, '④ [전제] (가) 작은 세계 · 꾸민 마을이 돌았다', J({ err: A.harv.loadErr || W.err || S.err, live: W.live }));
  const tg = (W.stat && W.stat.tags) || {};
  ok(['ref', 'famine', 'switch', 'depart', 'keep'].every((t) => tg[t] > 0) && W.stat.calls > 0, '★④ (가) 작은 세계 40날 — 값의 기준 · 기근 문 · 전환 빠르기 · 출발 문 · 갈무리 자리가 다 한 함수를 읽었다', J(W.stat));
  const vals = Object.values(S.sites || {});
  ok(S.f0 > 1 && vals.length === 7 && vals.every((x) => x === S.f0), '★④ 같은 마을 · 같은 날 — 일곱 자리 값이 다 `foodNeedDays` 하나', J({ f0: S.f0, sites: S.sites }));
  const fn = S.fn || {};
  ok(fn.t1297 === S.f0 && fn.t1319 === S.f0 && fn.t1374 === S.f0 && fn.subsFood === S.f0 && fn.subsWood === 30, '★④ 날 수 함수 셋(T1297 · T1319 · T1374) · v2 식량 생존 목표 날 = 같은 값 · 식량 밖(나무) = 30 그대로', J(fn));
  ok(fn.noV === 30, '④ 마을을 안 넘긴 옛 부름(`t1297NeedDays(day)`)은 종전 수 — 제품 자리는 다 마을을 넘긴다(③ 글자)', J(fn.noV));
  ok(S.birthR > 0 && near(S.birthR, S.birthWant, 1e-9), '★④ 출생 문 정본(`t1306GradeDP`) — 몫 = 곳간 ÷ ((사람 + 1) × 버틸 날)', J({ got: S.birthR, want: S.birthWant }));
  ok(S.keepHi > 0 && S.keepLo === 0, '★④ 갈무리 정본(`_preserveSurplus`) — 버틸 날 × 1.05 면 말리고 × 0.95 면 안 말린다', J({ hi: S.keepHi, lo: S.keepLo }));
}

console.log('\n⑤ 어촌 ↔ 밭 마을 — 버틸 날');
{
  const S = A.harv.syn || {};
  ok(S.farmA > S.fishA && S.farmS > S.fishS && S.fishA > 1, '★⑤ 가을 · 봄 모두 밭 마을 > 어촌(겨울 비옥 배수가 물 배수보다 깊다) · 어촌도 겨울 몫만큼은 1 위', J({ 가을: [S.farmA, S.fishA], 봄: [S.farmS, S.fishS] }));
  ok(S.farmWorld === 120 && S.rich === 1, '★⑤ 밭 세계(밭만 · 다음 거둠 120날 뒤) = 120 · 날마다 넉넉한 마을 = 1(내일 또 든다)', J({ farmWorld: S.farmWorld, rich: S.rich }));
}

console.log('\n⑥ (나) — 문 걷기 · 값의 기준 = 지난 30날 먹은 흐름');
{
  const W = A.flow.world || {}, S = A.flow.syn || {};
  ok(!A.flow.loadErr && W.live >= 6 && W.eat === W.live && W.stat && W.stat.calls === 0 && W.stat.tags.famine > 0, '★⑥ 작은 세계 40날 — 산 마을마다 먹은 흐름 칸 · 기근 문 자리는 읽되 필요 날 함수 부름 0', J({ live: W.live, eat: W.eat, stat: W.stat }));
  ok(near(S.flowRef, 15) && (S.flowGate || []).length === 6 && S.flowGate.every((x) => x === 0), '★⑥ 값의 기준 = 30 × 먹은 흐름(15) ÷ 하루 먹을 것(30) = 15 · 문 여섯 = 0', J({ ref: S.flowRef, gate: S.flowGate }));
}

console.log('\n⑦ 미끼 — 한 줄만 바꾼 사본');
{
  const cnt = (b) => SRC[BAITS[b][0]].split(BAITS[b][1]).length - 1;
  // old30 — 기근 문 한 자리만 옛 30
  {
    const n = cnt('old30'), M = { ...SRC, [V1F]: SRC[V1F].replace(BAITS.old30[1], BAITS.old30[2]) }, L = lint(M);
    const R = child(BAITS.old30[3], 'old30'), tg = (R.world && R.world.stat && R.world.stat.tags) || {};
    ok(n === 1 && L.miss.length === 1 && L.bare.length === 1 && R.world && R.world.live >= 6 && !(tg.famine > 0) && tg.ref > 0, `★미끼 old30 — 기근 문 한 자리만 옛 30 → ③ 자리 · 맨 30 빨강 · ④ 기근 문 자리 0 빨강(바꾼 자리 ${n})`, J({ miss: L.miss, bare: L.bare, tags: tg }));
  }
  // const — 버틸 날을 상수로
  {
    const n = cnt('const'), R = child(BAITS.const[3], 'const'), S = R.syn || {};
    ok(n === 1 && !S.err && S.farmA === S.fishA && !(S.farmA > S.fishA), `★미끼 const — 버틸 날을 상수로 돌려주는 사본 → ⑤ 밭 = 어촌 빨강(바꾼 자리 ${n})`, J({ farmA: S.farmA, fishA: S.fishA }));
  }
  // offcall — 끔인데 필요 날 함수를 부름
  {
    const n = cnt('offcall'), R = child(BAITS.offcall[3], 'offcall'), W = R.world || {};
    ok(n === 1 && W.live >= 6 && W.stat && W.stat.calls > 0, `★미끼 offcall — 끔인데 새 함수를 부르는 사본 → ② 부름 0 빨강(바꾼 자리 ${n})`, J(W.stat));
  }
}

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
