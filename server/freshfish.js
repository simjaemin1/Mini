// === server/freshfish.js — 민물고기 10종 정본 (T312 · 설계_민물고기.md §1 을 코드로) ==========
//
// ★왜 한 파일인가 — 종 이름·무게·물·계절을 **여러 자리에 적으면 사본**이다. 무게 표(`weights.js`)에
//   물고기 **종별**이 없어서(코어 `fish` 0.90kg 한 줄뿐), 그 앵커를 여기 한 번만 적고
//   `weights.js`·`kcal.js` 정본을 **부르는 쪽**이 이 표를 읽는다.
//
// ★★새 수 0 규약 — 이 파일의 수는 **전부 `설계/설계_민물고기.md` §1 표에서 온다**(재민 09-18 · PM 초안):
//   · `kg`     그 표의 "몸 크기(무게 앵커 · 성체 대표)" **구간의 중앙**이다(2~3kg → 2.5). 지어낸 수 0.
//   · `water`  그 표의 "물" 열을 다섯 갈래로 정규화한 것(상류여울 · 중류자갈 · 하류진흙 · 호소늪 · 논).
//   · `season` 그 표의 "계절" 열 — 0/1 이다(은어 여름만 · 뱀장어 가을만 · 메기 여름 · 나머지 사철).
//   ⚠**가중은 없다.** 그 물에 사는 종이 여럿이면 **고르게** 나눈다 — 고르게는 값이 아니라 값의 부재다.
//     종별 흔함(잉어가 쏘가리보다 흔하다)은 표에 수가 없으므로 **안 짓는다**(회부 — 재민 한 글자).
//   ⚠열량은 `kcal.js` 의 `fish` 495 kcal/kg 을 **그대로 쓴다**(종별 열량 표가 없다 · 사본 0).
'use strict';

// 물 다섯 갈래 — 지형 정본에서 읽은 마을의 물 종류가 이 중 하나로 온다(`설계_민물고기.md` §1 각주).
const WATERS = ['upper', 'mid', 'lower', 'lake', 'paddy'];

// 계절 — econ 정본과 같은 경계(d<90 봄 · <180 여름 · <270 가을 · 그 밖 겨울). 새 수 0.
function seasonOf(day) { const d = ((day | 0) % 360 + 360) % 360; return d < 90 ? 'spring' : d < 180 ? 'summer' : d < 270 ? 'autumn' : 'winter'; }

// 종 표 — 설계_민물고기.md §1 그대로(이름·kg·사는 물·나는 계절).
const SPECIES = [
  { id: 'carp',      ko: '잉어',     kg: 2.5,   waters: ['mid', 'lower', 'lake'],  seasons: ['spring', 'summer', 'autumn'] },
  { id: 'crucian',   ko: '붕어',     kg: 0.3,   waters: ['mid', 'lower', 'lake', 'paddy'], seasons: ['spring', 'summer', 'autumn', 'winter'] },
  { id: 'catfish',   ko: '메기',     kg: 1.5,   waters: ['mid', 'lower'],          seasons: ['summer'] },
  { id: 'snakehead', ko: '가물치',   kg: 1.5,   waters: ['lake'],                  seasons: ['summer'] },
  { id: 'mandarin',  ko: '쏘가리',   kg: 0.75,  waters: ['upper', 'mid'],          seasons: ['spring', 'summer', 'autumn'] },
  { id: 'barbel',    ko: '누치',     kg: 0.75,  waters: ['mid'],                   seasons: ['spring', 'summer', 'autumn'] },
  { id: 'minnow',    ko: '피라미',   kg: 0.035, waters: ['upper', 'mid'],          seasons: ['spring', 'summer', 'autumn'] },
  { id: 'sweetfish', ko: '은어',     kg: 0.15,  waters: ['upper', 'mid'],          seasons: ['summer'] },
  { id: 'eel',       ko: '뱀장어',   kg: 0.75,  waters: ['lower'],                 seasons: ['autumn'] },
  { id: 'loach',     ko: '미꾸라지', kg: 0.015, waters: ['paddy'],                 seasons: ['spring', 'summer', 'autumn'] },
];
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// 그 물·그 계절에 나는 종 — **고르게** 나눈다(가중 0 · 위 규약).
function poolOf(water, day) {
  const se = seasonOf(day);
  const w = WATERS.indexOf(water) >= 0 ? water : 'mid';   // 모르는 물은 중류(가장 넓은 갈래)로 — 폴백 하나
  return SPECIES.filter((s) => s.waters.indexOf(w) >= 0 && s.seasons.indexOf(se) >= 0);
}
// 결정론 추첨 — **주사위 금지**(공통 §1). 셀·날·순번 해시로 고른다(같은 입력 = 같은 종).
function pick(water, day, h) {
  const pool = poolOf(water, day);
  if (!pool.length) return null;
  const x = ((h | 0) ^ Math.imul(day | 0, 0x9e3779b1)) >>> 0;
  return pool[x % pool.length];
}
function kgOf(id) { const s = BY_ID.get(id); return s ? s.kg : 0; }
function koOf(id) { const s = BY_ID.get(id); return s ? s.ko : id; }
function isFish(id) { return BY_ID.has(id); }
module.exports = { WATERS, SPECIES, seasonOf, poolOf, pick, kgOf, koOf, isFish, ids: () => SPECIES.map((s) => s.id) };
