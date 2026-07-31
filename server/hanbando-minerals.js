'use strict';
// === server/hanbando-minerals.js — 한반도 광종의 **실제 산지**를 좌표에 입힌다 ===
//
// ★[재민 지시] "한반도 내의 실제 광물 분포도를 조사해서, 그거에 맞게 조절해줘"
//
// 그전까지는 ORE_POOLS.forest(철·철·금·텅스텐·대리석·옥·석탄·구리)에서 **좌표 해시로 균등** 뽑았다.
// 그래서 금광이 전국에 고르게 346개, 옥이 329개 흩어져 있었다 — 실제와 전혀 다르다.
// 실제 한반도는 광종이 **지역마다 확연히 갈린다**. 그걸 그대로 옮긴다.
//
// ── 지도 좌표계 (server/hanbando-terrain.json 의 산맥 위치로 확인) ───────────
//   존 2188 × 4063 셀 · x 클수록 동쪽 · y 클수록 남쪽
//     함경산맥 y 131~249 · 묘향산맥 y 624~849 · 멸악산맥 y 1250~1385
//     차령산맥 y 2219~2407 · 노령산맥 y 2869~2995 · 백두대간 y 47~3578(척추)
//   ⇒ 산맥 이름이 실제 것이라 남북 위치가 그대로 잡힌다. 이 띠를 도(道) 경계로 쓴다.
//
// ── 근거 (국토지리정보원 국가지도집 「광물자원」 외) ────────────────────────
//   철      북: 함북 무산(시생대 호상철광, 최대) · 회령 오룡      남: 충주-중원 · 경상분지
//   금·은   북: 평북 운산·대유동·선천 · 황북 홀동·수안·락연       남: 무극·부평·임천·통영·거창
//   동·연아연 북: 함남 단천 검덕(아연) · 갑산(동)                 남: 경상분지 백악기 열수
//   텅스텐  남: **봉화-울진-상동** 중석-주석-금 벨트(상동은 세계 최대급)
//           북: 황북 만년 · 평남 대흥 · 함남 장진
//   주석    남: 경북 울진(왕피리·유창·동석) · 강원 영월(순경석·성덕·각희) — 페그마타이트, **극소량·전량 폐광**
//   무연탄  남: 삼척·강릉·정선·평창·영월·단양·문경·보은·보성 · 보령·부여
//           북: 평남탄전(최대) · 함북 아오지
//   석회석  남: 강원 삼척·정선·영월 · 충북 단양                   북: 황해·평남
//   옥(연옥) 남: **춘천이 한국 유일 산지**
//
// ── 옮길 때의 원칙 ──────────────────────────────────────────────────────
//   · 광종의 **상대적 흔함**만 지역별로 준다. 개별 광산을 점으로 박지 않는다
//     (그러면 광맥 2671개의 위치를 다시 잡아야 하고, 분포 균등도가 깨진다).
//   · p_peak(품위)은 안 건드린다 — 그건 로그정규 뽑기와 가치배율이 정한다.
//   · 결정론: 좌표만 있으면 같은 광물이 나온다(저장 없이 재현 가능).

const REGIONS = [
  // name          test(cx, cy)                                        pool(가중치)
  { name: '함경북도', ko: '함북 — 무산 철광·아오지 탄전',
    test: (x, y) => y < 350,
    pool: { iron: 55, coal: 25, copper: 5, marble: 5, tungsten: 5, gold: 5 } },

  { name: '함경남도', ko: '함남 — 검덕 아연·갑산 동·장진 중석',
    test: (x, y) => y < 850 && x >= 1400,
    pool: { copper: 30, tungsten: 20, iron: 20, marble: 15, gold: 10, coal: 5 } },

  { name: '평안북도', ko: '평북 — 운산·대유동·선천 금광(동양 최대)',
    test: (x, y) => y < 950 && x < 1400,
    pool: { gold: 40, iron: 20, coal: 15, copper: 10, marble: 10, tungsten: 5 } },

  { name: '평안남도', ko: '평남 — 평남탄전(최대 무연탄)·대흥 중석',
    test: (x, y) => y < 1300 && x < 1550,
    pool: { coal: 50, iron: 15, marble: 15, tungsten: 10, gold: 5, copper: 5 } },

  { name: '황해도', ko: '황해 — 재령·은율 철광 · 홀동·수안 금 · 만년 중석',
    test: (x, y) => y < 1650 && x < 1450,
    pool: { iron: 35, gold: 20, marble: 20, tungsten: 10, coal: 10, copper: 5 } },

  // ★춘천 연옥 — 한국 **유일**의 옥 산지. 좁게 박는다(다른 데선 옥이 거의 안 난다).
  { name: '춘천', ko: '춘천 — 한국 유일의 연옥 산지',
    test: (x, y) => y >= 1600 && y < 1980 && x >= 1450 && x < 1950,
    pool: { jade_raw: 45, marble: 20, iron: 15, tungsten: 10, gold: 5, coal: 5 } },

  { name: '강원도', ko: '강원 — 상동 텅스텐(세계 최대급)·삼척/정선/영월 탄전+석회석',
    test: (x, y) => y < 2500 && x >= 1400,
    pool: { tungsten: 25, coal: 25, marble: 25, iron: 10, jade_raw: 5, gold: 5, tin: 5 } },

  { name: '경기충청', ko: '경기·충청 — 충주 철광 · 무극 금광 · 단양 석회석 · 보령 탄전',
    test: (x, y) => y < 2700 && x < 1400,
    pool: { iron: 25, gold: 20, marble: 20, coal: 20, copper: 10, tungsten: 5 } },

  { name: '경상북도', ko: '경북 — 봉화·울진 중석-주석 벨트 · 경상분지 철·동',
    test: (x, y) => y < 3300 && x >= 1150,
    pool: { tungsten: 25, iron: 20, copper: 20, coal: 10, gold: 10, tin: 8, marble: 7 } },

  { name: '전라도', ko: '전라 — 보성 탄전 · 소규모 금 · 고령토대',
    test: (x, y) => y < 3500 && x < 1150,
    pool: { coal: 25, iron: 20, gold: 20, marble: 20, copper: 15 } },

  { name: '남해', ko: '경남·남해 — 경상분지 동·연아연 · 통영·거창 금',
    test: () => true,
    pool: { copper: 30, iron: 25, gold: 20, marble: 15, coal: 10 } },
];

function regionAt(cx, cy) {
  for (const r of REGIONS) if (r.test(cx, cy)) return r;
  return REGIONS[REGIONS.length - 1];
}

// 가중 추첨 — u ∈ [0,1) 하나로 결정된다(좌표 해시를 그대로 넣는다)
function _pick(pool, u) {
  let s = 0; for (const k in pool) s += pool[k];
  let r = Math.max(0, Math.min(1 - 1e-12, u)) * s;
  for (const k in pool) { r -= pool[k]; if (r < 0) return k; }
  return Object.keys(pool)[0];
}

// 좌표(셀) → 광종. u 는 광물 전용 해시(품위 지터와 **다른 씨앗**을 써야 둘이 상관되지 않는다).
function mineralAt(cx, cy, u) {
  return _pick(regionAt(cx, cy).pool, u);
}

module.exports = { REGIONS, regionAt, mineralAt };
