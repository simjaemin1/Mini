'use strict';
// === scripts/t1494-site.js — T1494 하네스 전용 선행 적재: "본 만큼 사 둔다" 자리(갈래)를 하나씩만 켜는 스위치 (제품 코드 손 0 · @regress 없음) ===
//   쓰는 법: T1419_FOOD_NEED=seen T1494_ON=<갈래 쉼표 목록> NODE_OPTIONS="--require <이 파일>" node …   (자식 프로세스가 물려받는다 · T1488 관찰기와 같은 길)
//   T1494_ON 값: `all` · `none` · `ref` `famine` `birth` `mig` `keep` `switch` `depart` 쉼표 목록 · `all-but:birth` (하나만 끈 판) · 이름은 아래 GROUPS.
//   T1494_ON 이 없으면 이 파일은 아무것도 안 한다(소스 바이트 무변 — Module 후킹도 안 건다).
//   하는 일: `Module.prototype._compile` 을 감싸, sim/economy-sim.js 한 파일만 메모리에서 일곱 군데 고쳐 적재한다(디스크 무변 · v2 는 v1 의 `t1419Days`/`t1419Subs` 만 불러 고칠 곳 0 — 아래 확인만 한다).
//   고친 뒤 "꺼진 갈래의 자리"는 **그 자리 제 끔 식**을 그대로 탄다(= `T1419_FOOD_NEED` 가 꺼진 판과 그 자리가 계산하는 값이 같다):
//     ① `t1419Days` 첫 줄 `if (!T1419_FOOD_NEED) return legacy;` → `|| !__t1494On(tag)` : 종전 수(legacy)를 받는 열두 자리(갈무리 · 기근 문 넷 · 전환 · 페이스 · 값의 기준(8481) · v2 생존 목표 · 출발 문)는
//        끔 판에서도 정확히 `t1419Days` 가 legacy 를 돌려주는 길이라 이 한 줄로 끔 식과 같다(legacy 가 끔 값: 30 · `RESERVE_PC.food || 30`).
//     ② legacy 가 끔 값이 아닌 자리 — 그 자리 끔 식이 따로 있다:
//        · 값의 기준 유보 `T1419_FOOD_NEED ? t1419Days(v, null, 0, 'ref') * DAILY_FOOD_CONSUMPTION : RESERVE_PC[r]`(세 곳: 4237 · 7877 · 8506 — legacy 0) → 조건에 `&& __t1494On('ref')` 를 더해 `RESERVE_PC[r]` 로 간다.
//        · `t1297NeedDays`(태그 `tag||'birth'` — 서버 이주 호출은 'mig' 를 건넨다) · `t1319MigNeedDays`('mig') · `t1374NeedDays`('birth') — legacy null · 끔 식은 겨울 남은 날 · 다음 거둠 식 → 각 `if (T1419_FOOD_NEED …` 조건에 `&& __t1494On(태그)`.
//   갈래 → 태그(코드 `T1419_SITE` 가 정본 — 모듈 안에서 키 집합이 아래와 다르면 던진다):
//     ref=ref · famine=famine,mason,rescue,foodsec · birth=birth · mig=mig · keep=keep · switch=switch,pace · depart=depart
//   갈래와 무관한 `T1419_FOOD_NEED` 줄(둘 다 `seen` 만 켜 두면 그대로 둔다 — 갈래 하나 켠 판에도 같이 선다):
//     · econ 5929 `=== 'flow'`(flow 전용 · seen 에서 무동작) · econ 7411 `T1374_FAMINE_HARV && !T1419_FOOD_NEED`(T1374_FAMINE_HARV 는 env 안 켬 → 무동작)
//     · econ 5106 `T1437_SEEN → t1437Day`(겪은 낙폭 고리 · 읽는 자리가 켜져 있을 때만 값에 닿는다 — 상태만 쌓는다) · econ `foodNeedDays` 안 `t1437Buf` · v2 286(철 배수 표 건넴) · v2 3124(새 마을 여유분 가뭄 날 수)
//     · 서버 코드는 `T1419_FOOD_NEED`/`T1437_SEEN` 을 읽지 않는다(주석뿐 — grep 확인).
//   읽은 자리 셈: `globalThis.__t1494Q[태그] = [켠 쪽 물음 수, 끈 쪽 물음 수]` (관찰기가 10날마다 싣는다 · 세계 무변 · 계산 없는 덧셈).
//   고칠 곳을 못 찾거나 수가 다르면 **던진다**(나중에 코드가 바뀌어 조용히 무동작이 되는 것을 막는다).
const ON = process.env.T1494_ON;
if (ON === undefined || ON === '') return;
const path = require('path'), Module = require('module');
const GROUPS = { ref: ['ref'], famine: ['famine', 'mason', 'rescue', 'foodsec'], birth: ['birth'], mig: ['mig'], keep: ['keep'], switch: ['switch', 'pace'], depart: ['depart'] };
const GN = Object.keys(GROUPS);
function parse(s) {
  s = String(s).trim(); let en;
  if (s === 'all') en = GN.slice();
  else if (s === 'none') en = [];
  else if (s.indexOf('all-but:') === 0) { const x = s.slice(8).split(',').map((t) => t.trim()).filter(Boolean); for (const g of x) if (!GROUPS[g]) throw new Error('T1494_ON 모르는 갈래: ' + g); en = GN.filter((g) => x.indexOf(g) < 0); }
  else { en = s.split(',').map((t) => t.trim()).filter(Boolean); for (const g of en) if (!GROUPS[g]) throw new Error('T1494_ON 모르는 갈래: ' + g); }
  const tags = []; for (const g of en) for (const t of GROUPS[g]) tags.push(t);
  return { groups: en, tags };
}
const P = parse(ON);
const ROOT = path.resolve(__dirname, '..');
const F1 = path.join(ROOT, 'sim', 'economy-sim.js'), F2 = path.join(ROOT, 'sim', 'economy-sim-v2.js');
function count(src, s) { let n = 0, i = 0; while ((i = src.indexOf(s, i)) >= 0) { n++; i += s.length; } return n; }
function rep(src, from, to, want, what) {
  const n = count(src, from);
  if (n !== want) throw new Error(`T1494 스위치: ${what} — 찾은 수 ${n} ≠ 기대 ${want} (제품 코드가 바뀌었나? 스위치를 다시 맞춰야 한다)`);
  return src.split(from).join(to);
}
function patchV1(src) {
  const head = `const T1419_SITE = { ref: '값의 기준', famine: '기근 문', mason: '기근 문', rescue: '기근 문', foodsec: '기근 문', birth: '출생 문', mig: '이주 문', keep: '갈무리', switch: '전환 빠르기', pace: '전환 빠르기', depart: '출발 문' };`;
  const def = head + `
const __T1494 = new Set(${JSON.stringify(P.tags)}); const __t1494Q = (globalThis.__t1494Q = globalThis.__t1494Q || {});   // ★[T1494 하네스 스위치 — 메모리 재작성]
if (Object.keys(T1419_SITE).sort().join() !== ${JSON.stringify(Object.values(GROUPS).flat().sort().join())}) throw new Error('T1494 스위치: T1419_SITE 열쇠가 스위치 표와 다르다');
function __t1494On(tag) { const on = __T1494.has(tag); const q = __t1494Q[tag] || (__t1494Q[tag] = [0, 0]); q[on ? 0 : 1]++; return on; }`;
  src = rep(src, head, def, 1, 'T1419_SITE 줄');
  src = rep(src, "function t1297NeedDays(day, v, tag) { if (T1419_FOOD_NEED && v) return", "function t1297NeedDays(day, v, tag) { if (T1419_FOOD_NEED && v && __t1494On(tag || 'birth')) return", 1, 't1297NeedDays');
  src = rep(src, "function t1319MigNeedDays(day, v) { if (T1419_FOOD_NEED && v) return", "function t1319MigNeedDays(day, v) { if (T1419_FOOD_NEED && v && __t1494On('mig')) return", 1, 't1319MigNeedDays');
  src = rep(src, "function t1374NeedDays(v, day) { if (T1419_FOOD_NEED) return", "function t1374NeedDays(v, day) { if (T1419_FOOD_NEED && __t1494On('birth')) return", 1, 't1374NeedDays');
  src = rep(src, "T1419_FOOD_NEED ? t1419Days(v, null, 0, 'ref')", "T1419_FOOD_NEED && __t1494On('ref') ? t1419Days(v, null, 0, 'ref')", 3, "값의 기준 유보(legacy 0) 세 곳");
  src = rep(src, "  if (!T1419_FOOD_NEED) return legacy;\n", "  if (!T1419_FOOD_NEED || !__t1494On(tag)) return legacy;\n", 1, 't1419Days 첫 줄');
  return src;
}
function checkV2(src) {   // v2 는 v1 함수만 부른다 — 불러 쓰는 모양이 그대로인지만 확인(바뀌었으면 던진다)
  if (count(src, 'v1.T1419_FOOD_NEED ? v1.t1419Subs(v, r, tag) : 30') !== 1) throw new Error('T1494 스위치: v2 _t1419Sub 모양이 바뀜');
  if (count(src, "v1.T1419_FOOD_NEED ? v1.t1419Days(v, null, 30, 'famine') : 30") !== 1) throw new Error('T1494 스위치: v2 1702 모양이 바뀜');
  if (count(src, 'v1.t1419Days(') !== 1 || count(src, 'v1.t1419Subs(') !== 1) throw new Error('T1494 스위치: v2 의 t1419 호출 수가 바뀜');
  return src;
}
const _c = Module.prototype._compile; let done = { v1: 0, v2: 0 };
Module.prototype._compile = function (content, filename) {
  if (filename === F1) { content = patchV1(content); done.v1++; }
  else if (filename === F2) { content = checkV2(content); done.v2++; }
  return _c.call(this, content, filename);
};
globalThis.__t1494Info = { on: P.groups, tags: P.tags, done };
