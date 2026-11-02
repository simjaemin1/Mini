// === server/hut-hearth.js — 움집 화덕 자리 (T1066 · ★재민 11-01 "마을 집마다 모닥불처럼 생긴 것도 모닥불") ===
//
// ★왜: 움집(마을 NPC 집 · 플레이어 의뢰 집 · 공용 쉼터 — 바닥 행 `data.hut = [x0, y0, x1, y1]` 태그)마다 클라가 화덕을 **둘** 그린다.
//   ⓐ 마당 화덕(`yard_hearth` 스프라이트 — 문 밖 · `public/client/34-m-renderloop.js` "마당 소품" — 캐리어 = 발자국 남동단 바닥 한 칸 (x1, y1))
//   ⓑ 실내 화덕(잉걸빛 + `hearth` 몸 — `public/client/36-r2-building.js` 움집 실내 · 수혈주거 중앙 노지)
//   둘 다 서버 건물 행이 아니다(클라가 움집 태그에서 유도). 서버의 불 술어(요리 시설 `facility.js` · 몸 데우기 `isNearCampfire`)는
//   `campfire` 건물만 봤다 — 그려진 불이 불이 아니었다(캐논 "보이는 것 = 일어난 것" 위반 · PM 판정: 결함).
//
// ★수는 클라 그림 자리 **그대로**다(새 수 0). 앵커 = 움집 태그의 (x1, y1) 칸:
//   마당 화덕 = 앵커 + (−2, +2)   ← 34-m-renderloop `['yard_hearth', -2, 2]`(캐리어 칸 (hut[2], hut[3]) 에서 더한다)
//   실내 화덕 = 앵커 + (−2, −1)   ← 36-r2-building 실내 앵커 (x1, y1 + 2) 상대 `_dx === -2 && _dy === -3`
//   하네스(`scripts/test-t1066-village-fire.js`)가 두 클라 글자를 이 표와 대조한다(클라가 옮기면 하네스가 문다).
'use strict';

const HEARTHS = [
  { key: 'yard', dx: -2, dy: 2 },     // 마당 화덕(문 밖)
  { key: 'in', dx: -2, dy: -1 },      // 실내 화덕(노지)
];

// 이 바닥 행이 그 움집의 캐리어(발자국 남동단 한 칸 — 움집당 정확히 하나)인가 — 클라 마당 소품 캐리어와 같은 규칙
function isCarrier(b, cellSize) {
  const h = b && b.type === 'floor' && b.data && b.data.hut;
  if (!Array.isArray(h) || h.length < 4) return false;
  return Math.floor(b.x / cellSize) === h[2] && Math.floor(b.y / cellSize) === h[3];
}
// 움집 태그 → 화덕 칸 둘(셀 · 픽셀 중심)
function hearthsOf(hut, cellSize) {
  return HEARTHS.map((e) => {
    const cx = hut[2] + e.dx, cy = hut[3] + e.dy;
    return { key: e.key, cx, cy, x: cx * cellSize + cellSize / 2, y: cy * cellSize + cellSize / 2 };
  });
}

module.exports = { HEARTHS, isCarrier, hearthsOf };
