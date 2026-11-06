// === server/stone-rule.js — ★★[T1146 2026-11-04 · ★재민 11-04 "돌 규칙은 네 말 따를게" · 족보 744] 돌 규칙 하나 ==========
//
// ★왜: 같은 돌을 두 규칙이 말했다 — 바위(T1126)는 한 타 = 돌 4 kg(hp 한 점 = 돌 하나 · 도구 배수만큼 점),
//   땅 · 광맥 칸(`mineOreCell`)은 한 타 ≈ 58 g(곡괭이 60타 = 원석 덩이 3.5 kg) — 약 70배 차.
//   그리고 선광(`trySortOre`)이 맥석을 폐석으로 버렸다 — 일반 땅을 파면 돌덩이를 지고 와 버리는 꼴.
// ⇒ 규칙 하나:
//   ① 한 타에 깎이는 kg = 도구 배수(`zone.js TOOL_EFFECTS.gatherStoneMult` 그대로) × 돌 종류의 한 타 kg(배수 1)
//      · 암반(땅 · 광맥 칸 — 금 없는 돌): 채굴 정본 셋에서 — 곡괭이 배수로 덩이당 타수(`MINE_SWINGS_PER`)를 쳐 덩이 kg(`CHUNK_KG`)
//        ⇒ 배수 1 한 타 = 덩이 kg ÷ 타수 ÷ 곡괭이 배수(★재민 "채굴 속도는 고정" — 땅 채굴 글자는 이 식 그 자체라 한 줄도 안 바뀐다)
//      · 바위(금 간 굴러다니는 덩이): 암반 한 타 × 금 간 돌 배수(`CRACK_X` — 아래 출처 · 같은 사람 · 같은 연장의 실험에서 한 타에 떨어진 kg 의 비)
//   ② 떨어진 돌 무게 = 돌(석괴) · 자갈 · 나머지 — 큰 것부터 내림으로 담고 자갈 한 알에 못 미치는 몫은 그 자리 부스러기(무게 보존 · `split`).
// ★순수 모듈(require 0) — 수는 출처의 수만 적는다 · 정본(덩이 kg · 타수 · 배수 · 돌 · 자갈 kg)은 부르는 쪽이 넘긴다(사본 0).
'use strict';

// ── 출처 — 금 없는 돌과 불로 금 간 돌을 같은 사람이 같은 연장으로 친 실험 ─────────────────────────────────────
//   Maqueda, Florsch & Téreygeol 2024, 「Archaeologia historica」 49 — 멜(Melle) 은광 실험 채굴(디지털 서고 digilib.phil.muni.cz AH2024-1-07):
//     연장 채굴(망치 + 정 · 한 판 약 10분): 규암 468타 → 10 kg · 셰일 521타 → 12 kg
//     불 지피기(장작 46 · 60 · 60 kg · 불 한 번 뒤 망치질): 1439 · 788 · 859타 → 62 · 69 · 68 kg
//   (쐐기는 정량 실험이 없다 — 보고/T1146 §출처 · 이 식에 안 넣었다)
const STRIKE_SRC = {
  tool: { strikes: [468, 521], kg: [10, 12] },
  fire: { strikes: [1439, 788, 859], kg: [62, 69, 68] },
};
const _sum = (a) => a.reduce((s, x) => s + x, 0);
// 한 타에 떨어진 kg — 판을 합쳐(타 수 가중)
const perStrikeKg = (s) => _sum(s.kg) / _sum(s.strikes);
// 금 간 돌 배수 — 불로 금 간 돌 한 타 kg ÷ 금 없는 돌 한 타 kg(같은 손 · 같은 연장 · 같은 빠르기로 친다고 본다)
const CRACK_X = perStrikeKg(STRIKE_SRC.fire) / perStrikeKg(STRIKE_SRC.tool);   // = (199/3086) ÷ (22/989) ≈ 2.899
// 돌 종류 → 암반 한 타 kg 에 곱하는 배수
const KINDS = { bedrock: 1, cracked: CRACK_X };

// 암반 한 타 kg(배수 1) — 채굴 정본 셋: 덩이 kg ÷ 덩이당 타수 ÷ 곡괭이 배수
function kIntact(chunkKg, swingsPer, pickMult) {
  return (chunkKg > 0 && swingsPer > 0 && pickMult > 0) ? chunkKg / swingsPer / pickMult : 0;
}
// 한 타에 깎이는 kg — 도구 배수 × 돌 종류 배수 × 암반 한 타 kg
function kgPerSwing(mult, kind, kBed) {
  return (mult > 0 ? mult : 0) * (KINDS[kind] || 0) * (kBed > 0 ? kBed : 0);
}
// 떨어진 kg → 돌 · 자갈 · 부스러기 kg(무게 보존 — 돌 kg × 돌 + 자갈 kg × 자갈 + 부스러기 = kg)
//   ⚠소수 끝 자리 — 4.000000001 이 돌 하나를 잃지 않게 백만분의 일 kg 에서 끊는다(나눗셈 앞 반올림).
function split(kg, stoneKg, pebbleKg) {
  const q = (x) => Math.round(x * 1e6) / 1e6;
  let r = q(kg > 0 ? kg : 0);
  const stone = stoneKg > 0 ? Math.floor(q(r / stoneKg)) : 0;
  r = q(r - stone * stoneKg);
  const pebble = pebbleKg > 0 ? Math.floor(q(r / pebbleKg)) : 0;
  r = q(r - pebble * pebbleKg);
  return { stone, pebble, crumbKg: r };
}

// ═══ ★★[T1186 2026-11-06 · ★재민 11-05 "조사하는 건 좋은 거 같아. 그리고 내구도도 좀 천천히 닳게 하면 되지 않을까"] 날 무게 · 닳기 ═══
//   돌 규칙(T1146) 켬이 첫 움집을 막은 두 정본: ㉡ 레시피 돌이 4 kg 덩이 수였다(곡괭이 20 kg · 도끼 8 kg — 날 실제 무게 아님)
//   ㉠ 내구가 친 횟수였다(조잡한 돌괭이 25타 · 곡괭이 100타 — 한 타에 깎이는 kg 이 작아지자 돌 한 덩이도 못 떼고 깨졌다).
//   ⇒ ㉡ 레시피 돌 = 날의 출토 실측 무게(아래 표) · ㉠ 내구는 깎은 · 벤 kg 으로 닳는다(아래 수명 × 게임 허용 배수).
//
// ── 날 무게 — 출토 실물(자루 · 묶음은 따로 · 레시피 통나무 칸 그대로) ────────────────────────────────────────
//   도끼 = 太型蛤刃石斧(야요이 벌목 도끼 · 한반도 합인석부와 같은 계열):
//     吉朝則富 2022 「飛驒の太型蛤刃石斧」『光ミュージアム研究紀要 人文科学』9 · 第1表(飛驒 79점 집성) — 무게가 적힌 완형(完形) 11점(g):
//     9 ウバヶ平 386 · 12 松本町 1100 · 27 沢 730 · 29 上町 867 · 35 岩平 412 · 39 千蔵寺 800 · 52 上町上 1110 · 58 三川原 698 · 59 三川原 1040 · 67 岡前 425 · 72 赤保木 719
//     (거의 완형 1500 · 262 · 650 과 깨진 것 괄호 값은 넣지 않았다)
//   곡괭이 = 돌괭이(打製石斧 · 흙 파는 괭이 날):
//     『立野遺跡』(和歌山県文化財センター 2013) 야요이 전기 대형 3점 — 1004.6 · 438.1 · 571.5 g
//     (肥後弘幸 2021 「舞鶴市志高遺跡の石鍬」『京都府埋蔵文化財論集』8 주10 재인용 — 보고자가 "본래 土掘具(鍬)" 로 본 것)
//   ⚠한반도 출토품 무게는 못 찾았다(미확인 — 박물관 소장품 쪽은 크기만 · 보고서 원문 검색 실패) · 검(석검) · 톱 · 망치 날 무게도 미확인 → 그 레시피는 종전.
const BLADE_SRC = {
  axe:     { kg: [0.386, 1.1, 0.73, 0.867, 0.412, 0.8, 1.11, 0.698, 1.04, 0.425, 0.719] },
  pickaxe: { kg: [1.0046, 0.4381, 0.5715] },
};
// 날 한 자루 kg = 그 표의 평균(도끼 0.753 · 곡괭이 0.671)
const bladeKg = (t) => { const s = BLADE_SRC[t]; return s && s.kg.length ? _sum(s.kg) / s.kg.length : 0; };
//
// ── 수명 — 실험고고학(재연마 · 파손 전까지 쓴 양 · 둘 다 "아직 멀쩡했다"는 하한) ─────────────────────────────
//   바위: Timberlake & Craddock 2013, 「Chungara」 45(1) 33–59 · 50쪽 — 자루 단 냇돌 채광 망치 하나가
//         "removed 1.5 tons of rock without any serious breakage of the cobble"(웨일스 1990년대 초 실험 · 불 지핀 광맥)
//         ⚠51쪽 — 자루 · 묶음은 "every half hour or so" 고쳐야 했다(자루 수명은 kg 으로 못 바꾼다 · 미확인)
//   나무: 덴마크 드라베드 숲 실험(1952–54 · 신석기 원래 부싯돌 도끼) — "One axhead cut down more than 100 trees on its original
//         (old) sharpening"(Encyclopaedia Britannica 「Hand tool — Neolithic tools」 · 원보고 Iversen 1956 · Jørgensen 1985 — 원문 유료 미열람)
//         그루 → kg 은 게임 나무 한 그루 무게(전리품 정본 · 부르는 쪽이 넘긴다)
//   (참고 — 뗀 처트 도끼 0.4 · 0.6 kg 은 지름 3.5–5.6 cm 참나무 3–4그루마다 날을 다시 세웠다 · 깨짐 0: Putz, Fletcher & Magee 2023 「Forests」 14(2) 202)
const LIFE_SRC = {
  rock: { kg: 1500 },
  wood: { trees: 100 },
};
// 그 일의 수명 kg — 바위 = 출처 kg · 나무 = 출처 그루 × 한 그루 kg
const lifeKg = (kind, treeKg) => kind === 'rock' ? LIFE_SRC.rock.kg : kind === 'wood' ? LIFE_SRC.wood.trees * (treeKg > 0 ? treeKg : 0) : 0;
// ── 게임 허용 배수 — 출처 수명에 곱하는 수 하나(★재민 09-23 "배수는 물리 파라미터로 써도 된다") ───────────────────
//   첫 움집 30분 목표에서 유도: 첫 움집 길에서 도구마다 실제로 깎은 · 벤 kg ÷ 그 도구 수명 kg 의 최댓값 = 목표가 요구하는 하한.
//   실기 두 판(보고/T1186 §4 — 첫 움집 19.7 · 24.0분)에서 그 하한이 0.31 · 0.29 — 가장 많이 쓴 조잡한 돌도끼가 수명의 3분의 1(조잡한 돌괭이 1 %) · 출처 수명 그대로 이미 안 깨진다.
//   ⇒ 1(늦출 까닭 없음 · 더 키우면 출처 밖 수가 된다). 목표가 바뀌어 하한이 1 을 넘으면 이 한 자리만 고친다.
const WEAR_ALLOW = 1;

module.exports = { STRIKE_SRC, perStrikeKg, CRACK_X, KINDS, kIntact, kgPerSwing, split, BLADE_SRC, bladeKg, LIFE_SRC, lifeKg, WEAR_ALLOW };
