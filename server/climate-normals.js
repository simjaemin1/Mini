// === server/climate-normals.js — ★[T484 ②] 존별 기후 평년값 원자료(존 id 로 찾는다) =====================================
//   ⚠`zone-config.js` 에 두지 않는 까닭: 그 파일은 econ 번들(`sim/economy-engine.browser.js`)에 **통째로** 실린다 —
//     여기 표를 거기 두면 번들이 바뀐다(econ 무수정 규약 · `lab-wiring-check` 번들 대조). 표는 존 id 로 zone-config 존 표와 짝을 짓는다.
'use strict';
// ═══ ★★[T484 2026-09-28] 존별 기후 평년값 — **관측소 30년 평년값**(1991~2020) 원자료 열둘 × 셋 ═══════════════════
//   econ `CLIMATE`(연평균 12 · 연진폭 12 · 일교차 5)는 손으로 고른 수였고 **존마다 같았다**(econ 주석 "존 생성 시 오버라이드" 는
//   어디서도 안 했다). 이 표는 그 오버라이드의 **원자료**다 — 유도(연평균 · 연진폭 · 최한 위상 · 일교차)는 `server/weather.js`
//   `deriveClimate` 한 곳이 한다(수를 여기 옮겨 적지 않는다 · 새 수 0 — 열둘은 관측값이다).
//   `apply: true` 인 존만 존 기동 때 econ `CLIMATE` 에 얹는다(`weather.applyZoneClimate`) · 표에 없는 존 = 오늘 값 그대로(비트 동일).
//   ★한반도는 `apply: false` — **켜기는 재민**(econ 이 이 기온을 읽는다 ⇒ 3시드가 움직인다 · 보고/T484 ②).
//   출처 인용(15자 안): 부여 "Climatological Normals of Korea" · 베이징 "China Meteorological Administration" · 나라 "Japan Meteorological Agency".
const CLIMATE_NORMALS = {
  hanbando: { apply: false, station: '부여(충남 · 송국리 유적 고장 · T98 강수 앵커와 같은 관측소)', period: '1991-2020',
    src: 'KMA Climatological Normals of Korea (1991~2020) · https://en.wikipedia.org/wiki/Buyeo_County',
    max:  [4.4, 7.2, 12.7, 19.3, 24.5, 28.0, 29.8, 30.8, 26.9, 21.4, 13.8, 6.5],
    mean: [-1.5, 0.7, 5.7, 11.8, 17.6, 22.1, 25.3, 25.7, 20.7, 13.8, 6.9, 0.4],
    min:  [-6.6, -4.9, -0.6, 4.9, 11.4, 17.2, 21.8, 21.9, 15.9, 7.7, 1.4, -4.5] },
  jungwon_n: { apply: true, station: '베이징(화북 평원 · 존 광장 "베이장" · 후보 선양 대신)', period: '1991-2020',
    src: 'China Meteorological Administration 1991–2020 normals · https://en.wikipedia.org/wiki/Beijing',
    max:  [2.3, 6.1, 13.2, 21.0, 27.2, 30.8, 31.8, 30.7, 26.5, 19.3, 10.3, 3.7],
    mean: [-2.7, 0.6, 7.5, 15.1, 21.3, 25.3, 27.2, 26.1, 21.2, 13.8, 5.2, -1.0],
    min:  [-6.9, -4.2, 1.9, 9.0, 15.1, 20.0, 23.0, 22.0, 16.3, 8.8, 0.7, -5.0] },
  nippon: { apply: true, station: '나라(나라 분지 · 야요이 유적권 · 후보 오사카 대신 — 도시 열섬이 덜하다)', period: '1991-2020',
    src: 'Japan Meteorological Agency 1991–2020 normals · https://en.wikipedia.org/wiki/Nara,_Nara',
    max:  [9.0, 10.0, 14.0, 20.0, 24.7, 27.4, 31.3, 33.0, 28.5, 22.6, 16.8, 11.4],
    mean: [4.2, 4.7, 8.0, 13.5, 18.5, 22.2, 26.2, 27.3, 23.2, 17.2, 11.4, 6.4],
    min:  [0.1, 0.1, 2.7, 7.7, 13.0, 17.9, 22.2, 23.0, 19.1, 12.8, 6.8, 2.2] },
};

module.exports = { CLIMATE_NORMALS };
