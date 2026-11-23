// === server/decay.js — 구조물은 낡는다 [T1438 · ★재민 11-22 판정 38 · 39 · 판정 26] =========================
//
// ★왜 [재민 글자 그대로]
//   판정 38: "연속값으로서 일정 시간마다 내구도가 떨어지고, 내구도가 떨어질수록 제 기능을 못 하게 … 내구도가, 영토 관리 점수를 위한 값이 아니라,
//            애초에 당연히 관리해야 할 값인데 영토 관리 점수는 덤 같은 거야.. 농사처럼 말야.."
//   판정 39: **한 값** — 내구도가 곧 구조물의 체력이다. 시간이 깎고 · 공격이 깎고 · 수리가 올린다(낡은 것은 남은 값이 적어 저절로 부수기 쉽다).
//   판정 26: "모든 구조물은 부패하기 때문에, 수리하면 근소하게 오를 거야.."
//
// ★이 파일 — 순수 모듈(Node 전용 API 0 · 상태 0). 수 · 표 · 셈만 갖는다. 존(`zone.js` — 플레이어 구조물) · 마을(`villages.js` — NPC 집 · 곳간)이
//   **같은 함수**를 부른다(재민 11-08 "플레이어와 NPC 는 같은 활동을 같은 규칙으로").
//
// ★손잡이 `T1438_DECAY`('1' 만 켬 · ★끔 기본) — 끄면 아무도 이 파일의 셈을 안 부른다(존 · 마을 · 몸 줄이 다 이 상수 뒤 · 종전 바이트).
//   빠르기 묶음 `T1438_DECAY_SET` = `lo`(고증 범위의 짧은 해 — 빨리 낡음) · `mid`(가운데 · 기본) · `hi`(긴 해 — 늦게 낡음) — 판 끝 값 둘.
//
// ★수(새 수 0 — 고증 셋째 `설계/고증_2026-11_구조물_운반_청동.md` T1430 · 표 §1 · §4-ㄱ):
//   해 수를 "손질 없이 다 차 있던 것이 0 이 되는 해"로 읽고 곧게 깎는다(하루 몫 = 1 ÷ (해 × 한 해 날 수) — 고증 §4-ㄱ 의 셈 그대로).
//   한 해 날 수 = 달력 정본(`events.yearDaysOf` — 그레고리력 365 · 이 파일은 그 함수를 부르고 못 부르면 365).
//   · 풀(이엉 — 풀 4 를 엮은 것): 짚 이엉 **1 ~ 2해**마다 다시 이음(박언곤 「이엉」 · 한국민족문화대백과 — 고증 §1-ㄱ) → 가운데 1.5해.
//       억새 지붕 ~10해(같은 §)는 게임 이엉(풀 엮음)이 아니라 범위에 안 넣었다 — 회부.
//   · 나무(기둥 · 서까래 · 판자 · 통나무): 움집 한 채 손질 없이 **10 ~ 20해**(조몬 · 북미 바스켓메이커 · 알프스 — 고증 §1-ㄷ) → 가운데 15해.
//       땅에 박은 참나무 심재 5 ~ 25해(§1-ㄴ)의 가운데도 15 · 다른 나무(자작 · 오리 · 가문비 · 변재)는 5해 밑(같은 §) — 회부.
//   · 흙과 돌(돌 · 자갈): 벽(욋가지 + 흙) **14 ~ 20해**(Butser M74 · Peat Moors — 고증 §1-ㄴ) → 가운데 17해.
//       화덕 · 우물 · 돌 기초의 해 수는 **미확인**(고증 §1-ㅂ — 확인 7 / 미확인 4) — 같은 흙돌 빠르기를 쓴다(회부).
//   ⚠가죽(노의 풀무) · 씨앗(밭) · 광석은 세 재료 밖 — 그 몫은 빠르기 셈에 안 든다(표에 적는다).
'use strict';

const ON = (typeof process !== 'undefined' && process.env && process.env.T1438_DECAY === '1');
const SETS = ['lo', 'mid', 'hi'];
const SET = (typeof process !== 'undefined' && process.env && SETS.indexOf(process.env.T1438_DECAY_SET) >= 0) ? process.env.T1438_DECAY_SET : 'mid';

const MAT = {
  grass: { ko: '풀', years: { lo: 1, mid: 1.5, hi: 2 },
    src: '짚 이엉 1~2해마다 다시 이음 — 박언곤 「이엉」 한국민족문화대백과(고증 셋째 §1-ㄱ · 확인)' },
  wood:  { ko: '나무', years: { lo: 10, mid: 15, hi: 20 },
    src: '움집 한 채 손질 없이 10~20해 — 조몬(小林 KAKEN 22520774) · 바스켓메이커 Ⅲ(Crow Canyon) · 알프스(Hurcombe & Cunningham 2016 p.41)(고증 §1-ㄷ · 확인) · 땅에 박은 참나무 심재 5~25해(§1-ㄴ)' },
  earth: { ko: '흙과 돌', years: { lo: 14, mid: 17, hi: 20 },
    src: '벽(욋가지 + 흙) 14~20해 — Butser M74 2022 · Hurcombe & Cunningham 2016 p.44(고증 §1-ㄴ · 확인) · 화덕 · 우물 · 돌 기초 미확인(같은 빠르기)' },
};
// 원자재 → 재료(새 재료 0 — 이 게임 품목 이름 그대로). 표에 없는 품목(가죽 · 씨앗 · 광석 …)은 낡음 셈 밖.
const ITEM_MAT = { wood: 'wood', twig: 'wood', fiber: 'grass', stone: 'earth', pebble: 'earth' };

let _yd = 0;
function yearDays() {
  if (_yd) return _yd;
  try { const E = require('./events'); const n = E.yearDaysOf ? E.yearDaysOf() : 0; if (n > 0) return (_yd = n); } catch (e) {}
  return (_yd = 365);
}
// 하루에 깎이는 몫(다 찬 것 = 1) — 재료 하나.
function perDay(mat, set) {
  const M = MAT[mat]; if (!M) return 0;
  const y = M.years[set || SET];
  return y > 0 ? 1 / (y * yearDays()) : 0;
}

// ── 중간재 → 원자재(레시피 정본에서 유도 · 사본 0) ─────────────────────────────────────────────
let _rc = null;
function recipes() {
  if (_rc) return _rc;
  const o = {};
  const add = (R) => { for (const [k, r] of Object.entries(R || {})) { const per = (r.to && r.to[k]) || 1; const raw = {}; for (const [m, q] of Object.entries(r.from || {})) raw[m] = q / per; o[k] = raw; } };
  try { add(require('./hut-stages').HUT_RECIPES); } catch (e) {}
  try { add(require('./granary-stages').GRANARY_RECIPES); } catch (e) {}
  return (_rc = o);
}
// 지을 때 든 품목(중간재 그대로) → 원자재 낱개 수(소수 그대로 — 판자 1 = 통나무 0.5)
function rawOf(items) {
  const R = recipes(), o = {};
  for (const [k, n] of Object.entries(items || {})) {
    if (!(n > 0)) continue;
    const r = R[k];
    if (!r) { o[k] = (o[k] || 0) + n; continue; }
    for (const [m, q] of Object.entries(r)) o[m] = (o[m] || 0) + q * n;
  }
  return o;
}
// 원자재 → 재료별 낱개(세 재료 밖은 `other`)
function matsOf(raw) {
  const o = { grass: 0, wood: 0, earth: 0, other: 0 };
  for (const [k, n] of Object.entries(raw || {})) o[ITEM_MAT[k] || 'other'] += n;
  return o;
}
// 부위 하나 — { k, ko, items(지을 때 든 품목), raw, mats, total(세 재료 낱개 합), mat(빠르기를 정하는 재료 · 없으면 섞음) }
function part(k, ko, items, mat) {
  const raw = rawOf(items), mats = matsOf(raw);
  const total = mats.grass + mats.wood + mats.earth;
  return { k, ko, items, raw, mats, total, mat: mat || null };
}
// 부위의 하루 몫 — 재료를 정한 부위(움집 지붕 = 풀 · 뼈대 = 나무)는 그 재료 · 아니면 든 원자재 낱개로 섞는다(지을 때 든 재료로 — 카드 정해진 것 2)
function partRate(p, set) {
  if (p.mat) return perDay(p.mat, set);
  if (!(p.total > 0)) return 0;
  return (p.mats.grass * perDay('grass', set) + p.mats.wood * perDay('wood', set) + p.mats.earth * perDay('earth', set)) / p.total;
}

// ── 종류 표 — 건물 종류 → 부위 ─────────────────────────────────────────────────────────────────
//   움집 · 쉼터 · NPC 집 = 지붕(이엉 — 풀) + 뼈대(기둥 · 서까래 · 결속 풀 — 나무) · 공정 표(`hut-stages.js`)의 단계 그대로(①터파기는 재료 0 — 부위 아님).
//   그 밖(한 값) = 지을 때 든 재료 하나의 부위 · 체력 = `BUILDING_MAX_HP`(존이 `init` 으로 준다 · 없으면 존과 같은 50).
let _Z = { cost: {}, maxHp: {}, extra: {} };
function init(z) { _Z = Object.assign({ cost: {}, maxHp: {}, extra: {} }, z || {}); _kind.clear(); return api; }
const HUT_TYPES = new Set(['hut', 'shelter', 'house', 'phouse']);
function hutParts(small) {
  let H = null; try { H = require('./hut-stages'); } catch (e) {}
  const ST = H ? (small ? H.SMALL_STAGES : H.HUT_STAGES) : [];
  const frame = {}, roof = {};
  for (let i = 1; i < ST.length; i++) {
    const need = ST[i].need || {};
    const into = (i === ST.length - 1) ? roof : frame;   // 마지막 단계(④ 이엉) = 지붕 · ② ③ = 뼈대
    for (const [k, n] of Object.entries(need)) into[k] = (into[k] || 0) + n;
  }
  return [part('roof', '지붕(이엉)', roof, 'grass'), part('frame', '뼈대(기둥 · 서까래)', frame, 'wood')];
}
const _stageSum = (stages) => { const o = {}; for (const st of stages || []) for (const [k, n] of Object.entries(st.need || {})) o[k] = (o[k] || 0) + n; return o; };
function costOf(type) {
  if (_Z.extra && _Z.extra[type]) return _Z.extra[type];
  if (type === 'granary' || type === 'guild_granary') { try { return require('./granary-stages').GRANARY_COST; } catch (e) { return null; } }
  if (type === 'well') { try { return require('./well-stages').WELL_COST; } catch (e) { return null; } }
  if (type === 'charcoal_kiln') { try { return _stageSum(require('./smelt-uses').CHARCOAL_KILN_STAGES); } catch (e) { return null; } }
  const c = _Z.cost && _Z.cost[type];
  if (!c) return null;
  const o = {}; for (const [k, n] of Object.entries(c)) if (k[0] !== '_' && typeof n === 'number') o[k] = n;
  return o;
}
// 낡지 않는 것(표에 까닭을 적는다) — 불 자리(땔감 정본) · 밭(작물 정본) · 마을 마당 칸 · 짓는 중인 터(단계 칸 — 회부)
const EXCLUDE = { campfire: '불 자리 — 땔감 · 불씨 정본 밖', farmland: '밭 — 작물 정본(`crops.js`) 밖', vtile: '마을 마당 · 텃밭 칸 — 땅',
  hut_site: '짓는 중(단계 칸) — 회부', furnace_site: '짓는 중 — 회부', kiln_site: '짓는 중 — 회부', well_site: '짓는 중 — 회부', village_site: '짓는 중 — 회부', shelter_site: '짓는 중 — 회부',
  ruin: '무너진 자리 — 낡음의 끝(치우는 것)' };
const _kind = new Map();
function kindOf(type, data) {
  if (!type || EXCLUDE[type]) return null;
  if (HUT_TYPES.has(type)) {
    const small = !!(data && data.small), key = type + (small ? ':s' : '');
    if (_kind.has(key)) return _kind.get(key);
    const k = { type, multi: true, parts: hutParts(small), hpScale: (_Z.maxHp && _Z.maxHp.wall) || 80 };
    _kind.set(key, k); return k;
  }
  // 움집에 붙은 벽 · 바닥(태그 `hut`) = 그 움집의 몸 — 따로 안 낡는다(앵커 · 마을 집 줄이 낡는다)
  if ((type === 'wall' || type === 'floor' || type === 'door') && data && Array.isArray(data.hut)) return null;
  if (_kind.has(type)) return _kind.get(type);
  const items = costOf(type);
  let k = null;
  if (items && Object.keys(items).length) {
    const p = part('body', '몸', items, null);
    if (p.total > 0) k = { type, multi: false, parts: [p], maxHp: (_Z.maxHp && _Z.maxHp[type]) || 50 };   // 존 공격 · 수리와 같은 최대(`BUILDING_MAX_HP[type] || 50`)
  }
  _kind.set(type, k);
  return k;
}

// ── 셈 ─────────────────────────────────────────────────────────────────────────────────────────
//   읽을 때 셈(쓰기 0): 값 = 마지막으로 적은 값 − 하루 몫 × (지금 날 − 적은 날) · 바닥 0.
//   ⚠문턱 0 — "몇 % 밑이면 수리 필요" 같은 갈래를 두지 않는다(카드 정해진 것 3). 0 은 바닥이지 문턱이 아니다(뼈대 · 다리는 0 에서 무너진다).
function readFrac(v0, rate, t0, now) {
  const v = (Number.isFinite(v0) ? v0 : 1) - rate * Math.max(0, (now || 0) - (t0 || 0));
  return v > 0 ? (v < 1 ? v : 1) : 0;
}
// 부위마다 지금 값(0..1) — st = { t, v: { roof, frame, … } } · 칸이 없으면 다 찬 것(1) · t0 를 부르는 쪽이 준다(태어난 날 · 켠 날)
function readParts(kind, st, now, t0, set) {
  const out = {};
  for (const p of kind.parts) {
    const v0 = st && st.v && Number.isFinite(st.v[p.k]) ? st.v[p.k] : 1;
    const ts = st && Number.isFinite(st.t) ? st.t : t0;
    out[p.k] = readFrac(v0, partRate(p, set), ts, now);
  }
  return out;
}
// 한 값(체력) — hp0(적은 체력) · t0(적은 날) → 지금 체력
function readHp(kind, hp0, t0, now, set) {
  const max = kind.maxHp || 50, p = kind.parts[0];
  const f = readFrac((Number.isFinite(hp0) ? hp0 : max) / max, partRate(p, set), t0, now);
  return f * max;
}
// ── 수리 = 넣은 재료만큼(카드 정해진 것 4) ──────────────────────────────────────────────────────────
//   그 부위를 지을 때 든 원자재(세 재료) 낱개 합 가운데 넣은 품목의 원자재 낱개 몫만큼 오른다(지붕 이엉 8 = 풀 32 가운데 이엉 2 = 풀 8 → ¼).
//   "한 번에 몇 %"라는 새 수 0 · 그 부위에 안 든 재료(지붕에 통나무 · 판자 울에 돌)는 안 받는다(재료 없이 오르지 않는다).
function acceptsItem(p, item) {
  const raw = rawOf({ [item]: 1 });
  for (const [m, q] of Object.entries(raw)) { const c = ITEM_MAT[m]; if (q > 0 && c && p.mats[c] > 0) return true; }
  return false;
}
function shareOf(p, item, qty) {
  if (!(qty > 0) || !(p.total > 0) || !acceptsItem(p, item)) return 0;
  const mats = matsOf(rawOf({ [item]: qty }));
  let s = 0; for (const c of ['grass', 'wood', 'earth']) if (p.mats[c] > 0) s += Math.min(mats[c], p.mats[c]);
  return s / p.total;
}
// 모자란 몫(deficit 0..1)을 채우는 데 드는 품목 수(올림 · 손에 든 것까지) — 그만큼만 쓴다
function qtyFor(p, item, deficit, have) {
  const one = shareOf(p, item, 1);
  if (!(one > 0) || !(deficit > 0)) return 0;
  const n = Math.ceil(deficit / one - 1e-9);
  return Math.max(0, Math.min(n, Number.isFinite(have) ? Math.floor(have) : n));
}
// ── 기능(카드 정해진 것 3 — 문턱 없이 비례) ──────────────────────────────────────────────────────────
//   곳간 · 상자의 부패 자리 칸: 밀폐(m) · 완충(w)이 남은 값만큼 — m' = 1 − f·(1 − m) · w' = f·w (f = 1 이면 종전 그 수 · 0 이면 바닥)
function scalePlace(pf, f) {
  if (!pf || !(f < 1)) return pf;
  const g = f > 0 ? f : 0;
  return { m: 1 - g * (1 - pf.m), w: g * pf.w };
}
// 지붕 몫 → 몸의 실내 배율: f = 1 이면 실내 배율 그대로 · 0 이면 바깥(1) · 그 사이 곧게(몸 `body.js` 가 부른다)
function indoorMult(mult, f) { return f >= 1 ? mult : (f > 0 ? 1 + (mult - 1) * f : 1); }

// 낡는 종류 이름(진단 표 · 클라 우클릭 "손질…" 한 줄이 뜨는 종류 — 서버 표에서 뽑는다 · 클라 사본 0)
function typesList() {
  const names = new Set([...HUT_TYPES, 'granary', 'guild_granary', 'well', 'charcoal_kiln', ...Object.keys(_Z.cost || {}), ...Object.keys(_Z.extra || {})]);
  return [...names].filter((t) => !!kindOf(t, null)).sort();
}
const api = { ON, SET, SETS, MAT, ITEM_MAT, EXCLUDE, yearDays, perDay, recipes, rawOf, matsOf, part, partRate, init, kindOf, hutParts, costOf, typesList,
  readFrac, readParts, readHp, acceptsItem, shareOf, qtyFor, scalePlace, indoorMult, HUT_TYPES };
module.exports = api;
