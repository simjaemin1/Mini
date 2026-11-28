# T1489 표 (손 셈 0 · `scripts/t1489-table.js` 가 `packed.jsonl.gz` 에서 낸다)

## 0. 보고 첫 줄 값(이 절만 쓴다)

| 값 | 숫자 | 어디서 |
| --- | --- | --- |
| 마감 가운데(꼬리 · 손님 하나 판 · 끔 → 켬) | 83 → 87 ms | cb-base 꼬리 마감 벽시계 전부 |
| 갓 뜬 첫 마감(1날 꼬리 · 끔 → 켬) | 4266 → 11121 ms | cb-base + rl3(마을 3) 1날 꼬리 |
| 줄 지연 가운데(손님 하나 · 끔 → 켬) | 64(7건) → 1041(7건) ms · 켬 최대 5665 | cb-base 서버 귀 줄 |
| 늘린 줄(갓 뜬 세계 · 켬 마감 몫) | _t598EdgeOk · villages.js:4172 3436 ms · 74.6% (켬 4609 ↔ 끔 1926) | rl3 프로파일 갓 뜬 세계 포함 시간 · 끔 0 · 켬 몫 50%↑ 가운데 가장 안쪽 |
| 늘린 조각 | (anon) · villages.js:13234 · dist 켬 3558 ↔ 끔 0 ms | rl3 갓 뜬 세계 마감 일 줄 |
| 51마을 실시계(켬) 첫 마감 · 6날~ 가운데 · 최대 | 38857 · 3186 · 4246 ms (마을 51) | rl51 켬 |
| 51마을 실시계(끔) 첫 마감 · 6날~ 가운데 · 최대 | 10525 · 3765 · 9899 ms | rl51 끔 |
| 닛폰(가상 시계 20날) 꼬리 CPU 가운데 · 최대(켬) | 905 · 1526 ms (마을 36) | hvnip 켬 |
| 한반도(가상 시계 20날) 꼬리 CPU 가운데 · 최대(켬) | 1341 · 2829 ms (마을 51) | hv51 켬 |
| 줄 서는 메시지 종류(제품 목록) | 22종 (zone.js:9171) · 판에서 실제로 선 것 village_board · village_brief · village_view | `VILLAGE_BOOK_MSG` 글자 |
| 요청 늦음(봇 8 · 켬) 가운데 · 최대 | rr51 3 · 1025 ms(31269건) / rl51 2955 · 5613 ms(400건) / rl3 36 · 4061 ms(4377건) | load.jsonl 요청 → 답 |
| 실제 하루(24분) 한 시간에 막히는 초(켬 · 끔) | 켬 3.4초(꼬리 2 · 막힌 1.7초 / 판 1845초) · 끔 3.7초(꼬리 2 · 막힌 1.9초 / 판 1829초) | rr51 꼬리 벽시계 합 ÷ 판 길이 |
| 어림(한 시간 = 하루 24분 × 2.5 · 하루 꼬리 1번 × 51마을 꼬리 가운데) | 켬 실시계 6날~ 8.0초 · 가상 시계 lr730 CPU 5.0초 · 끔 실시계 6날~ 9.4초 · 가상 시계 lr730 CPU 5.3초 | rl51 6날~ 꼬리 벽시계 가운데 · lr730 꼬리 CPU 가운데(하루 꼬리 = 표 7) |
| 못 돌린 셋 거절(켬 · 빨강 + 옛 마을) 존 넘어옴 · 맞닿은 곳간 · 사유지 | 10/20 · 16/20 · 0/20 | cb-* 켬 |
| 못 돌린 셋 거절(끔) | 11/20 · 13/20 · 0/20 | cb-* 끔 |
| 못 돌린 셋 갈래별(켬) | newday 0/10 · sameday 10/10 / adj-direct 8/10 · adj-viaB 8/10 / denied-fallback-door 0/20 | cb-* 켬 · 갈래(tag)별 |
| 못 돌린 셋 갈래별(끔) | newday 1/10 · sameday 10/10 / adj-direct 8/10 · adj-viaB 5/10 / denied-fallback-door 0/20 | cb-* 끔 · 갈래(tag)별 |
| 실제 하루(24분 · 51마을) 손님 거절 — 맞닿은 곳간 켬 · 끔 / 존 넘어옴 켬 / 기본 켬 | 0/20 · 0/20 / newday 0/10 · sameday 10/10 / 0/20 | cbr-* |
| 맞닿은 곳간 세계별(켬 · 끔) — 23마을(VILLAGE_MAX=51 env) / 51마을(전수) | 7/20 · 4/20 / 16/20 · 13/20 | cb-adj · cb-adj50(하루 0.6초) |
| 관찰기 무변(기본 판 켬 빨강) 귀 있음 ↔ 귀 없음 | 2/40 ↔ 2/40 | cb-base 켬(판 둘) ↔ cbn-base 켬(판 둘 · 귀 0) |

## 1. 실시계 판(봇 8 · 중앙 + 존 · 하루 0.6초) — 마감(꼬리 한 번)과 줄 선 요청

꼬리 = 요청이 줄을 서는 마감(`mini=0` · 마을 장부 마감). 벽시계 ms(진짜 시계). "6날~" = 첫 5날(길 · 거리 처음 계산)을 뺀 값.

| 판 | 길 고침 | 판수 | 꼬리 수 | 꼬리 가운데 | 꼬리 p95 | 꼬리 최대 | 6날~ 가운데 | 6날~ 최대 | 줄 선 요청 | 줄 지연 가운데 | p95 | 최대 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rl20 | 켬 | 1 | 62 | 1497 | 2744 | 20111 | 1462 | 5041 | 499 | 1228 | 2732 | 13283 |
| rl20 | 끔 | 1 | 59 | 1531 | 6452 | 8665 | 1494 | 4053 | 480 | 1230 | 3627 | 8370 |
| rl3 | 켬 | 3 | 522 | 254 | 1302 | 11351 | 253 | 2775 | 2012 | 235 | 1287 | 4049 |
| rl3 | 끔 | 3 | 564 | 233 | 1163 | 4365 | 235 | 3966 | 2023 | 212 | 1094 | 3904 |
| rl51 | 켬 | 2 | 50 | 3270 | 5763 | 39748 | 3186 | 4246 | 464 | 3012 | 24657 | 31323 |
| rl51 | 끔 | 2 | 53 | 3844 | 9950 | 11185 | 3765 | 9899 | 470 | 3399 | 9417 | 9719 |

### 1b. 봇 여덟이 마을 요청을 번갈아 보낼 때 — 요청마다 답이 온 때까지(ms)

| 판 | 길 고침 | 요청 | 가운데 | p90 | p99 | 최대 | 0.5초↑ | 1초↑ | 줄 선 몫 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rl20 | 켬 | 499 | 1227 | 1977 | 4633 | 4854 | 97.9% | 65.6% | 100.0% |
| rl20 | 끔 | 480 | 1234 | 2162 | 3782 | 3890 | 98.9% | 75.2% | 100.0% |
| rl3 | 켬 | 4377 | 36 | 546 | 2002 | 4061 | 11.1% | 4.4% | 46.0% |
| rl3 | 끔 | 4633 | 27 | 502 | 1435 | 3912 | 10.0% | 3.1% | 43.7% |
| rl51 | 켬 | 480 | 2955 | 4132 | 5510 | 5613 | 100.0% | 100.0% | 96.7% |
| rl51 | 끔 | 470 | 3346 | 5194 | 5768 | 5866 | 100.0% | 96.9% | 100.0% |

### 1c. 마감 중 실제로 줄을 선 메시지 종류(실시계 판 전부 · 서버 귀)

| 메시지 | 길 고침 | 줄 선 수 | 가운데 ms | p95 | 최대 |
| --- | --- | --- | --- | --- | --- |
| village_board | 끔 | 723 | 391 | 4319 | 9705 |
| village_board | 끔+이웃잇기 | 208 | 470 | 1467 | 2418 |
| village_board | 켬 | 749 | 435 | 3988 | 31322 |
| village_brief | 끔 | 743 | 409 | 4191 | 9719 |
| village_brief | 끔+이웃잇기 | 213 | 443 | 1593 | 2549 |
| village_brief | 켬 | 748 | 404 | 3942 | 31323 |
| village_view | 끔 | 1507 | 421 | 4184 | 9713 |
| village_view | 끔+이웃잇기 | 418 | 436 | 1680 | 2490 |
| village_view | 켬 | 1478 | 448 | 3957 | 31323 |

### 1d. 줄을 안 서는 `ping`(마감 한 프레임이 이벤트 루프를 막는 몫) — RTT ms

| 판 | 길 고침 | 표본 | 가운데 | p99 | 최대 |
| --- | --- | --- | --- | --- | --- |
| rl20 | 켬 | 3334 | 12 | 231 | 577 |
| rl20 | 끔 | 3279 | 12 | 308 | 914 |
| rl3 | 켬 | 10253 | 10 | 191 | 565 |
| rl3 | 끔 | 10274 | 11 | 175 | 388 |
| rl51 | 켬 | 6621 | 11 | 414 | 1241 |
| rl51 | 끔 | 6546 | 11 | 443 | 969 |

## 2. 마감 안 CPU 시간을 함수별로 — cb-base · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 2판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 4682 ms ↔ 끔 2070 ms (늘어난 2612 ms) · 마감 밖: 켬 22210 ↔ 끔 8711. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _terrBlocked0 · zone.js:2563 | 1545 | 72 | 1473 | 56.4% | 33.0% |
| _t598EdgeOk · villages.js:4172 | 1055 | 0 | 1055 | 40.4% | 22.5% |
| isTerrainBlockedLocal · zone.js:2570 | 910 | 32 | 878 | 33.6% | 19.4% |
| _distMatrixGen · villages.js:4396 | 280 | 0 | 280 | 10.7% | 6.0% |
| isBlocked · villages.js:888 | 47 | 0 | 47 | 1.8% | 1.0% |
| _t598Anchor · villages.js:4164 | 41 | 0 | 41 | 1.6% | 0.9% |
| isDitchTileLocal · zone.js:2344 | 27 | 0 | 27 | 1.0% | 0.6% |
| _t957DistStage · villages.js:13552 | 22 | 0 | 22 | 0.8% | 0.5% |
| (anon) · villages.js:4680 | 16 | 0 | 16 | 0.6% | 0.3% |
| npcReachStep · zone.js:4907 | 11 | 0 | 11 | 0.4% | 0.2% |
| _huntBandBuild · villages.js:20281 | 14 | 7 | 7 | 0.3% | 0.3% |
| collGenAround · zone.js:4872 | 12 | 5 | 7 | 0.3% | 0.3% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _t598EdgeOk · villages.js:4172 | 3531 | 0 | 3531 | 135.1% | 75.4% |
| (anon) · villages.js:13234 | 3502 | 0 | 3502 | 134.1% | 74.8% |
| _t957DistStage · villages.js:13552 | 3498 | 0 | 3498 | 133.9% | 74.7% |
| _distMatrixGen · villages.js:4396 | 3468 | 0 | 3468 | 132.7% | 74.1% |
| isBlocked · villages.js:888 | 2697 | 1456 | 1241 | 47.5% | 57.6% |
| isTerrainBlockedLocal · zone.js:2570 | 2669 | 1485 | 1184 | 45.3% | 57.0% |
| _t598Anchor · villages.js:4164 | 420 | 0 | 420 | 16.1% | 9.0% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 388 | 0 | 388 | 14.8% | 8.3% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13234 · dist | 3502 | 0 | 3502 |
| villages.js:13193 · econ | 33 | 25 | 8 |
| villages.js:13199 · ore | 35 | 27 | 8 |
| g · villages.js:13153 | 4 | 1 | 3 |
| _t731Mark · villages.js:13141 | 1 | 0 | 1 |
| villages.js:13185 · pop | 2 | 1 | 1 |

## 2. 마감 안 CPU 시간을 함수별로 — cb-base · 그 뒤(날 11~ 에 비운 표본) (켬 2판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 18168 ms ↔ 끔 18584 ms (늘어난 -416 ms) · 마감 밖: 켬 13030 ↔ 끔 15755. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| chooseSpecies · region-profiles.js:338 | 107 | 0 | 107 | — | 0.6% |
| grownDays · crops.js:343 | 64 | 0 | 64 | — | 0.3% |
| _huntHuntersSteps · villages.js:20409 | 442 | 393 | 49 | — | 2.4% |
| _lifeGameDaySteps · villages.js:20519 | 80 | 34 | 46 | — | 0.4% |
| _isPointInLake · terrain.js:275 | 99 | 61 | 38 | — | 0.5% |
| _terrAdd · villages.js:9368 | 115 | 80 | 35 | — | 0.6% |
| mixAt · region-profiles.js:266 | 298 | 268 | 30 | — | 1.6% |
| _targetV2 · economy-sim-v2.js:879 | 581 | 554 | 27 | — | 3.2% |
| _searchStep · path-core.js:351 | 22 | 0 | 22 | — | 0.1% |
| pop · path-core.js:72 | 20 | 0 | 20 | — | 0.1% |
| _t1063Bnd · villages.js:3630 | 130 | 113 | 17 | — | 0.7% |
| _edgeScan · zone.js:19283 | 382 | 369 | 13 | — | 2.1% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| regrowStageOf · chunk.js:278 | 345 | 0 | 345 | — | 1.9% |
| (anon) · villages.js:13231 | 343 | 171 | 172 | — | 1.9% |
| _scanEventsDaily · villages.js:22802 | 343 | 171 | 172 | — | 1.9% |
| _lifeFrontier · villages.js:17585 | 132 | 0 | 132 | — | 0.7% |
| _caravanSyncOne · villages.js:6659 | 125 | 0 | 125 | — | 0.7% |
| (anon) · villages.js:13225 | 113 | 0 | 113 | — | 0.6% |
| _t851Sync · villages.js:6743 | 113 | 0 | 113 | — | 0.6% |
| _t661ReturnPts · villages.js:6080 | 73 | 0 | 73 | — | 0.4% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13225 · caravan | 167 | 42 | 125 |
| villages.js:13185 · pop | 95 | 63 | 32 |
| villages.js:13203 · wx | 678 | 647 | 31 |
| villages.js:13231 · events | 506 | 486 | 20 |
| villages.js:13174 · econ | 1329 | 1310 | 19 |
| villages.js:819 | 76 | 57 | 19 |

## 2. 마감 안 CPU 시간을 함수별로 — hv10 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 1016 ms ↔ 끔 1085 ms (늘어난 -70 ms) · 마감 밖: 켬 36608 ↔ 끔 25196. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| warTreeCellBlocked · zone.js:6567 | 36 | 18 | 18 | — | 3.5% |
| _bandFloorFill · villages.js:20332 | 10 | 0 | 10 | — | 1.0% |
| _t146Band · villages.js:20239 | 28 | 19 | 9 | — | 2.8% |
| isOre · villages.js:961 | 16 | 7 | 9 | — | 1.6% |
| storageFoodPer · economy-sim.js:939 | 9 | 0 | 9 | — | 0.9% |
| _t620WfBox · villages.js:17690 | 8 | 0 | 8 | — | 0.8% |
| findStairBuildingForCell · zone.js:19433 | 8 | 0 | 8 | — | 0.8% |
| isTerrainBlockedLocal · zone.js:2570 | 32 | 25 | 7 | — | 3.1% |
| oreStockAt · zone.js:7110 | 7 | 0 | 7 | — | 0.7% |
| getForestMultiplier · terrain.js:433 | 58 | 52 | 6 | — | 5.7% |
| _huntBandBuild · villages.js:20281 | 25 | 20 | 5 | — | 2.5% |
| _walkCellBlocked · villages.js:5425 | 17 | 12 | 5 | — | 1.7% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _villageBody · economy-sim-v2.js:3214 | 42 | 0 | 42 | — | 4.1% |
| village · economy-sim-v2.js:3207 | 42 | 0 | 42 | — | 4.1% |
| storageFoodPer · economy-sim.js:939 | 41 | 0 | 41 | — | 4.0% |
| _huntBandBuild · villages.js:20281 | 120 | 91 | 29 | — | 11.8% |
| storageFoodEquivalent · economy-sim.js:951 | 59 | 46 | 13 | — | 5.8% |
| totalFoodEquivalent · economy-sim.js:920 | 60 | 51 | 9 | — | 5.9% |
| getForestMultiplier · terrain.js:433 | 59 | 53 | 6 | — | 5.8% |
| (anon) · villages.js:13174 | 45 | 42 | 3 | — | 4.4% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13174 · econ | 45 | 42 | 3 |
| villages.js:13231 · events | 35 | 32 | 3 |
| villages.js:13193 · econ | 57 | 55 | 2 |
| set · t1489-probe.js:113 | 15 | 13 | 2 |
| villages.js:13226 · caravan | 1 | 0 | 1 |
| villages.js:13234 · dist | 1 | 0 | 1 |

## 2. 마감 안 CPU 시간을 함수별로 — hv10 · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 4503 ms ↔ 끔 5123 ms (늘어난 -621 ms) · 마감 밖: 켬 2739 ↔ 끔 2416. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _preservedKcal · kcal.js:156 | 765 | 699 | 66 | — | 17.0% |
| storageFoodEquivalent · economy-sim.js:951 | 420 | 386 | 34 | — | 9.3% |
| _huntScan · villages.js:20439 | 26 | 0 | 26 | — | 0.6% |
| _worldStockOf · economy-sim-v2.js:590 | 25 | 0 | 25 | — | 0.6% |
| kgOf · weights.js:164 | 25 | 0 | 25 | — | 0.6% |
| npcReachStep · zone.js:4907 | 25 | 0 | 25 | — | 0.6% |
| totalFoodEquivalent · economy-sim.js:920 | 25 | 0 | 25 | — | 0.6% |
| _villageBody · economy-sim-v2.js:3214 | 24 | 0 | 24 | — | 0.5% |
| kcalOf · kcal.js:168 | 24 | 0 | 24 | — | 0.5% |
| _rgNum · chunk.js:186 | 23 | 0 | 23 | — | 0.5% |
| currentEra · era.js:106 | 23 | 0 | 23 | — | 0.5% |
| _flushStepLazy · roads.js:506 | 21 | 0 | 21 | — | 0.5% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| (anon) · villages.js:13160 | 258 | 0 | 258 | — | 5.7% |
| head · economy-sim-v2.js:3189 | 258 | 0 | 258 | — | 5.7% |
| _t859Stock · economy-sim-v2.js:79 | 249 | 0 | 249 | — | 5.5% |
| mute · villages.js:13155 | 2035 | 1889 | 146 | — | 45.2% |
| totalFoodEquivalent · economy-sim.js:920 | 1397 | 1256 | 141 | — | 31.0% |
| storageFoodEquivalent · economy-sim.js:951 | 1387 | 1256 | 131 | — | 30.8% |
| econUnitsOf · kcal.js:198 | 915 | 812 | 103 | — | 20.3% |
| storageFoodPer · economy-sim.js:939 | 959 | 862 | 97 | — | 21.3% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13174 · econ | 1166 | 1113 | 53 |
| villages.js:13193 · econ | 381 | 344 | 37 |
| villages.js:13160 · econ | 258 | 222 | 36 |
| villages.js:13198 · terr | 184 | 156 | 28 |
| villages.js:13203 · wx | 52 | 35 | 17 |
| villages.js:13194 · econ | 245 | 234 | 11 |

## 2. 마감 안 CPU 시간을 함수별로 — hv20 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 1584 ms ↔ 끔 1858 ms (늘어난 -274 ms) · 마감 밖: 켬 48420 ↔ 끔 36132. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _mkHeap · path-core.js:56 | 74 | 44 | 30 | — | 4.7% |
| _search · path-core.js:406 | 18 | 0 | 18 | — | 1.1% |
| findCellFence · zone.js:19394 | 17 | 0 | 17 | — | 1.1% |
| levelOf · roads.js:111 | 13 | 0 | 13 | — | 0.8% |
| _edgeScan · zone.js:19283 | 26 | 14 | 12 | — | 1.6% |
| _lifeGameDaySteps · villages.js:20519 | 39 | 27 | 12 | — | 2.5% |
| isRockCellLocal · terrain.js:376 | 12 | 0 | 12 | — | 0.8% |
| _t427Reach · villages.js:17486 | 11 | 0 | 11 | — | 0.7% |
| _huntBandBuild · villages.js:20281 | 23 | 15 | 8 | — | 1.5% |
| regionMix · region-profiles.js:235 | 8 | 0 | 8 | — | 0.5% |
| _bandFloorFill · villages.js:20332 | 28 | 22 | 6 | — | 1.8% |
| isOre · villages.js:961 | 22 | 16 | 6 | — | 1.4% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| isBlockedByWall · zone.js:19831 | 88 | 0 | 88 | — | 5.6% |
| _searchBegin · path-core.js:168 | 80 | 0 | 80 | — | 5.1% |
| _mkHeap · path-core.js:56 | 74 | 0 | 74 | — | 4.7% |
| _t146Band · villages.js:20239 | 66 | 0 | 66 | — | 4.2% |
| npcReachHas · zone.js:4928 | 117 | 102 | 15 | — | 7.4% |
| straightPathClear · zone.js:4798 | 114 | 99 | 15 | — | 7.2% |
| _search · path-core.js:406 | 170 | 157 | 13 | — | 10.7% |
| _spAt · chunk.js:693 | 97 | 86 | 11 | — | 6.1% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| set · t1489-probe.js:113 | 15 | 13 | 2 |
| villages.js:13185 · pop | 1 | 0 | 1 |
| villages.js:13203 · wx | 1 | 0 | 1 |
| villages.js:13234 · dist | 1 | 0 | 1 |
| sync · granary-lots.js:330 | 2 | 1 | 1 |
| villages.js:13162 · bandit | 2 | 2 | 0 |

## 2. 마감 안 CPU 시간을 함수별로 — hv20 · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 9417 ms ↔ 끔 10465 ms (늘어난 -1048 ms) · 마감 밖: 켬 3752 ↔ 끔 4046. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| storageFoodPer · economy-sim.js:939 | 77 | 0 | 77 | — | 0.8% |
| _villageBody · economy-sim-v2.js:3214 | 48 | 0 | 48 | — | 0.5% |
| _huntScan · villages.js:20439 | 46 | 0 | 46 | — | 0.5% |
| tickDecay · economy-sim-v2.js:3062 | 43 | 0 | 43 | — | 0.5% |
| _isPointInLake · terrain.js:275 | 41 | 0 | 41 | — | 0.4% |
| _lifeDailySteps · villages.js:21427 | 40 | 0 | 40 | — | 0.4% |
| tickTradeV2Steps · economy-sim-v2.js:1989 | 40 | 0 | 40 | — | 0.4% |
| run · :0 | 830 | 797 | 33 | — | 8.8% |
| exec · :0 | 210 | 180 | 30 | — | 2.2% |
| _preservedKcal · kcal.js:156 | 1329 | 1308 | 21 | — | 14.1% |
| _num · trees.js:20 | 116 | 99 | 17 | — | 1.2% |
| tickVillage · economy-sim.js:5104 | 109 | 101 | 8 | — | 1.2% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _caravanArrive · economy-sim-v2.js:2504 | 555 | 0 | 555 | — | 5.9% |
| upsertRoadCell · zone-local-db.js:596 | 548 | 0 | 548 | — | 5.8% |
| scanDay · events.js:730 | 536 | 0 | 536 | — | 5.7% |
| _flushStepLazy · roads.js:506 | 810 | 745 | 65 | — | 8.6% |
| (anon) · villages.js:13161 | 868 | 820 | 48 | — | 9.2% |
| SimVillages.init.dayRoads · zone.js:7088 | 868 | 820 | 48 | — | 9.2% |
| _dayRoll · roads.js:696 | 868 | 820 | 48 | — | 9.2% |
| dayTick · roads.js:707 | 868 | 820 | 48 | — | 9.2% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13161 · roads | 868 | 820 | 48 |
| villages.js:13198 · terr | 267 | 240 | 27 |
| villages.js:13160 · econ | 434 | 419 | 15 |
| villages.js:13216 · bcast | 12 | 0 | 12 |
| sync · granary-lots.js:330 | 55 | 48 | 7 |
| villages.js:13193 · econ | 663 | 658 | 5 |

## 2. 마감 안 CPU 시간을 함수별로 — hv3 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 280 ms ↔ 끔 302 ms (늘어난 -22 ms) · 마감 밖: 켬 26153 ↔ 끔 14520. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _t368FoodPer · economy-sim.js:2545 | 10 | 0 | 10 | — | 3.6% |
| (anon) · village-layout.js:127 | 7 | 0 | 7 | — | 2.5% |
| _oreCellsOfInner · villages.js:7322 | 7 | 0 | 7 | — | 2.5% |
| _huntHuntersSteps · villages.js:20409 | 13 | 7 | 6 | — | 4.6% |
| findCellFence · zone.js:19394 | 6 | 0 | 6 | — | 2.1% |
| _huntScan · villages.js:20439 | 14 | 9 | 5 | — | 5.0% |
| _terrBlocked0 · zone.js:2563 | 12 | 7 | 5 | — | 4.3% |
| edgeBlockedStep · zone.js:19819 | 4 | 0 | 4 | — | 1.4% |
| flushProf · t1489-probe.js:39 | 3 | 0 | 3 | — | 1.1% |
| maskEDT · village-layout.js:119 | 3 | 0 | 3 | — | 1.1% |
| M.bind · villages.js:17779 | 2 | 0 | 2 | — | 0.7% |
| _lifeSiteFilters · villages.js:17708 | 2 | 0 | 2 | — | 0.7% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _huntScan · villages.js:20439 | 14 | 0 | 14 | — | 5.0% |
| _t859Stock · economy-sim-v2.js:79 | 13 | 0 | 13 | — | 4.6% |
| _terrBlocked0 · zone.js:2563 | 12 | 0 | 12 | — | 4.3% |
| note · t1489-probe.js:91 | 11 | 0 | 11 | — | 3.9% |
| npcReachHas · zone.js:4928 | 40 | 31 | 9 | — | 14.3% |
| _huntHuntersSteps · villages.js:20409 | 91 | 83 | 8 | — | 32.5% |
| isBlockedByWall · zone.js:19831 | 19 | 11 | 8 | — | 6.8% |
| straightPathClear · zone.js:4798 | 38 | 30 | 8 | — | 13.6% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13199 · ore | 27 | 23 | 4 |
| villages.js:13195 · econ | 2 | 1 | 1 |
| villages.js:13223 · caravan | 1 | 0 | 1 |
| villages.js:13234 · dist | 1 | 0 | 1 |
| set · t1489-probe.js:113 | 11 | 11 | 0 |
| sync · granary-lots.js:330 | 1 | 1 | 0 |

## 2. 마감 안 CPU 시간을 함수별로 — hv3 · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 1064 ms ↔ 끔 1204 ms (늘어난 -140 ms) · 마감 밖: 켬 795 ↔ 끔 815. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _targetV2 · economy-sim-v2.js:879 | 89 | 75 | 14 | — | 8.4% |
| _t1206Key · economy-sim.js:1882 | 10 | 0 | 10 | — | 0.9% |
| kgOf · weights.js:164 | 10 | 0 | 10 | — | 0.9% |
| _huntScan · villages.js:20439 | 7 | 0 | 7 | — | 0.7% |
| findCellFence · zone.js:19394 | 7 | 0 | 7 | — | 0.7% |
| sync · granary-lots.js:330 | 7 | 0 | 7 | — | 0.7% |
| _computeVillageStats · economy-sim.js:68 | 6 | 0 | 6 | — | 0.6% |
| _lifeHunterEconLink · villages.js:20208 | 6 | 0 | 6 | — | 0.6% |
| _t1196Back · economy-sim.js:3488 | 6 | 0 | 6 | — | 0.6% |
| _villageBody · economy-sim-v2.js:3214 | 6 | 0 | 6 | — | 0.6% |
| addProduce · economy-sim.js:5327 | 6 | 0 | 6 | — | 0.6% |
| allocRealCandidates · economy-sim.js:7238 | 6 | 0 | 6 | — | 0.6% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _dayRoll · roads.js:696 | 46 | 0 | 46 | — | 4.3% |
| dayTick · roads.js:707 | 46 | 0 | 46 | — | 4.3% |
| flushDaily · roads.js:451 | 45 | 0 | 45 | — | 4.2% |
| (anon) · villages.js:13161 | 46 | 46 | 0 | — | 4.3% |
| SimVillages.init.dayRoads · zone.js:7088 | 46 | 46 | 0 | — | 4.3% |
| pickDeficitJob_rational · economy-sim.js:7407 | 74 | 75 | -1 | — | 7.0% |
| _t427Reach · villages.js:17486 | 48 | 50 | -2 | — | 4.5% |
| priceView · events.js:486 | 82 | 85 | -3 | — | 7.7% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| sync · granary-lots.js:330 | 11 | 4 | 7 |
| villages.js:13185 · pop | 10 | 9 | 1 |
| villages.js:13216 · bcast | 6 | 5 | 1 |
| villages.js:13225 · caravan | 6 | 5 | 1 |
| villages.js:13226 · caravan | 1 | 0 | 1 |
| villages.js:13232 · events | 1 | 0 | 1 |

## 2. 마감 안 CPU 시간을 함수별로 — hv51 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 2970 ms ↔ 끔 2784 ms (늘어난 186 ms) · 마감 밖: 켬 115160 ↔ 끔 83563. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _t146Band · villages.js:20239 | 194 | 114 | 80 | 43.0% | 6.5% |
| _terrBlocked0 · zone.js:2563 | 80 | 0 | 80 | 43.0% | 2.7% |
| _mkHeap · path-core.js:56 | 191 | 142 | 49 | 26.3% | 6.4% |
| _huntScan · villages.js:20439 | 46 | 22 | 24 | 12.9% | 1.5% |
| _getZoneTerrain · terrain.js:172 | 21 | 0 | 21 | 11.3% | 0.7% |
| _oreIndex · terrain.js:465 | 19 | 0 | 19 | 10.2% | 0.6% |
| levelOf · roads.js:111 | 19 | 0 | 19 | 10.2% | 0.6% |
| L · region-profiles.js:149 | 45 | 27 | 18 | 9.7% | 1.5% |
| _lifeAddHouseSiteInner · villages.js:18507 | 36 | 19 | 17 | 9.1% | 1.2% |
| computeShadowPrices · economy-sim-v2.js:995 | 42 | 25 | 17 | 9.1% | 1.4% |
| tickVillage · economy-sim.js:5104 | 17 | 0 | 17 | 9.1% | 0.6% |
| maskEDT · village-layout.js:119 | 48 | 33 | 15 | 8.1% | 1.6% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _t731Tick · villages.js:13122 | 2970 | 2784 | 186 | 99.9% | 100.0% |
| onGameTick · villages.js:12944 | 2970 | 2784 | 186 | 99.9% | 100.0% |
| processImmediate · timers:436 | 2970 | 2784 | 186 | 99.9% | 100.0% |
| pump · t745-vclock.js:100 | 2970 | 2784 | 186 | 99.9% | 100.0% |
| isTerrainBlockedLocal · zone.js:2570 | 134 | 0 | 134 | 72.0% | 4.5% |
| _oreNear · terrain.js:483 | 117 | 0 | 117 | 62.9% | 3.9% |
| _walkResume · villages.js:5455 | 861 | 776 | 85 | 45.7% | 29.0% |
| (anon) · villages.js:819 | 891 | 808 | 83 | 44.6% | 30.0% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:819 | 891 | 808 | 83 |
| villages.js:13199 · ore | 436 | 375 | 61 |
| villages.js:13381 · life | 1139 | 1119 | 20 |
| villages.js:13193 · econ | 178 | 159 | 19 |
| set · t1489-probe.js:113 | 25 | 19 | 6 |
| villages.js:13174 · econ | 116 | 114 | 2 |

## 2. 마감 안 CPU 시간을 함수별로 — hv51 · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 27983 ms ↔ 끔 28059 ms (늘어난 -77 ms) · 마감 밖: 켬 8912 ↔ 끔 8794. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _terrBlocked0 · zone.js:2563 | 601 | 0 | 601 | — | 2.1% |
| _preservedKcal · kcal.js:156 | 3705 | 3376 | 329 | — | 13.2% |
| _searchStep · path-core.js:351 | 487 | 300 | 187 | — | 1.7% |
| storageFoodEquivalent · economy-sim.js:951 | 2343 | 2192 | 151 | — | 8.4% |
| _terrPick · villages.js:9323 | 124 | 0 | 124 | — | 0.4% |
| _flushStepLazy · roads.js:506 | 120 | 0 | 120 | — | 0.4% |
| upsertRoadCell · zone-local-db.js:596 | 120 | 0 | 120 | — | 0.4% |
| _villageBody · economy-sim-v2.js:3214 | 115 | 0 | 115 | — | 0.4% |
| _worldStockOf · economy-sim-v2.js:590 | 111 | 0 | 111 | — | 0.4% |
| run · :0 | 2194 | 2086 | 108 | — | 7.8% |
| villageOfCell · villages.js:18312 | 197 | 146 | 51 | — | 0.7% |
| exec · :0 | 495 | 454 | 41 | — | 1.8% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _t851Sync · villages.js:6743 | 2530 | 0 | 2530 | — | 9.0% |
| _t929RetWait · villages.js:5806 | 2346 | 0 | 2346 | — | 8.4% |
| (anon) · villages.js:13225 | 2530 | 1649 | 881 | — | 9.0% |
| storageFoodEquivalent · economy-sim.js:951 | 6745 | 6267 | 478 | — | 24.1% |
| totalFoodEquivalent · economy-sim.js:920 | 6761 | 6288 | 473 | — | 24.2% |
| kcalOf · kcal.js:168 | 3907 | 3535 | 372 | — | 14.0% |
| econUnitsOf · kcal.js:198 | 4178 | 3839 | 339 | — | 14.9% |
| storageFoodPer · economy-sim.js:939 | 4362 | 4030 | 332 | — | 15.6% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13225 · caravan | 2530 | 1649 | 881 |
| villages.js:13194 · econ | 2915 | 2655 | 260 |
| villages.js:13381 · life | 2341 | 2157 | 184 |
| villages.js:13161 · roads | 2165 | 2073 | 92 |
| villages.js:13160 · econ | 997 | 950 | 47 |
| villages.js:13199 · ore | 66 | 34 | 32 |

## 2. 마감 안 CPU 시간을 함수별로 — hvnip · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 2322 ms ↔ 끔 2497 ms (늘어난 -175 ms) · 마감 밖: 켬 104819 ↔ 끔 82215. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| gSet · path-core.js:197 | 27 | 0 | 27 | — | 1.2% |
| _terrBlocked0 · zone.js:2563 | 84 | 58 | 26 | — | 3.6% |
| _isPointInRiver · terrain.js:305 | 88 | 66 | 22 | — | 3.8% |
| _lifeAddHouseSiteInner · villages.js:18507 | 33 | 16 | 17 | — | 1.4% |
| generateChunkResources · chunk.js:659 | 16 | 0 | 16 | — | 0.7% |
| _huntScan · villages.js:20439 | 15 | 0 | 15 | — | 0.6% |
| cameSet · path-core.js:199 | 15 | 0 | 15 | — | 0.6% |
| tickTradeV2Steps · economy-sim-v2.js:1989 | 15 | 0 | 15 | — | 0.6% |
| gameDayNow · zone.js:11330 | 14 | 0 | 14 | — | 0.6% |
| (anon) · villages.js:18538 | 13 | 0 | 13 | — | 0.6% |
| _t146Band · villages.js:20239 | 110 | 97 | 13 | — | 4.7% |
| get · terrain.js:219 | 13 | 0 | 13 | — | 0.6% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _isPointInRiver · terrain.js:305 | 90 | 0 | 90 | — | 3.9% |
| _terrBlocked0 · zone.js:2563 | 89 | 0 | 89 | — | 3.8% |
| isWaterCellLocal · terrain.js:353 | 130 | 102 | 28 | — | 5.6% |
| totalFoodEquivalent · economy-sim.js:920 | 173 | 148 | 25 | — | 7.5% |
| _walkNodeCell · villages.js:5433 | 191 | 167 | 24 | — | 8.2% |
| storageFoodEquivalent · economy-sim.js:951 | 170 | 150 | 20 | — | 7.3% |
| warTreeCellBlocked · zone.js:6567 | 281 | 263 | 18 | — | 12.1% |
| _t146Band · villages.js:20239 | 115 | 98 | 17 | — | 5.0% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| set · t1489-probe.js:113 | 24 | 17 | 7 |
| villages.js:13231 · events | 84 | 78 | 6 |
| villages.js:13160 · econ | 46 | 43 | 3 |
| sync · granary-lots.js:330 | 6 | 3 | 3 |
| villages.js:13185 · pop | 3 | 1 | 2 |
| villages.js:13223 · caravan | 2 | 0 | 2 |

## 2. 마감 안 CPU 시간을 함수별로 — hvnip · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 15376 ms ↔ 끔 15466 ms (늘어난 -90 ms) · 마감 밖: 켬 6199 ↔ 끔 6304. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _num · trees.js:20 | 75 | 0 | 75 | — | 0.5% |
| cameSet · path-core.js:199 | 75 | 0 | 75 | — | 0.5% |
| _terrBlocked0 · zone.js:2563 | 398 | 331 | 67 | — | 2.6% |
| key · path-core.js:195 | 66 | 0 | 66 | — | 0.4% |
| _get · roads.js:100 | 65 | 0 | 65 | — | 0.4% |
| _mkHeap · path-core.js:56 | 966 | 903 | 63 | — | 6.3% |
| isBlockedByWall · zone.js:19831 | 63 | 0 | 63 | — | 0.4% |
| storageFoodEquivalent · economy-sim.js:951 | 1389 | 1350 | 39 | — | 9.0% |
| _isPointInRiver · terrain.js:305 | 214 | 180 | 34 | — | 1.4% |
| gSet · path-core.js:197 | 79 | 53 | 26 | — | 0.5% |
| writeUtf8String · :0 | 73 | 53 | 20 | — | 0.5% |
| gGet · path-core.js:196 | 83 | 67 | 16 | — | 0.5% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _searchStep · path-core.js:351 | 1075 | 0 | 1075 | — | 7.0% |
| _search · path-core.js:406 | 2142 | 1986 | 156 | — | 13.9% |
| localPath · path-core.js:425 | 2143 | 1993 | 150 | — | 13.9% |
| (anon) · villages.js:13225 | 1185 | 1067 | 118 | — | 7.7% |
| _t851Sync · villages.js:6743 | 1185 | 1067 | 118 | — | 7.7% |
| _walkFor · villages.js:5537 | 4592 | 4498 | 94 | — | 29.9% |
| _walkResume · villages.js:5455 | 4558 | 4471 | 87 | — | 29.6% |
| tickTradeV2Steps · economy-sim-v2.js:1989 | 1102 | 1032 | 70 | — | 7.2% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13225 · caravan | 1185 | 1067 | 118 |
| villages.js:13193 · econ | 1147 | 1091 | 56 |
| villages.js:13203 · wx | 76 | 62 | 14 |
| villages.js:13199 · ore | 29 | 17 | 12 |
| g · villages.js:13153 | 9 | 0 | 9 |
| villages.js:13185 · pop | 108 | 102 | 6 |

## 2. 마감 안 CPU 시간을 함수별로 — lr730 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 1168700 ms ↔ 끔 1159779 ms (늘어난 8921 ms) · 마감 밖: 켬 692550 ↔ 끔 696025. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _terrBlocked0 · zone.js:2563 | 4368 | 0 | 4368 | 49.0% | 0.4% |
| updateMorale · battle-core.js:426 | 3485 | 0 | 3485 | 39.1% | 0.3% |
| _muSeparate · war-live.js:217 | 3308 | 0 | 3308 | 37.1% | 0.3% |
| _warSyncMeta · villages.js:11139 | 3098 | 0 | 3098 | 34.7% | 0.3% |
| _muStepFollow · war-live.js:252 | 2753 | 0 | 2753 | 30.9% | 0.2% |
| getForestMultiplier · terrain.js:433 | 2580 | 0 | 2580 | 28.9% | 0.2% |
| exec · :0 | 31160 | 28655 | 2505 | 28.1% | 2.7% |
| pop · path-core.js:72 | 2415 | 0 | 2415 | 27.1% | 0.2% |
| mixAt · region-profiles.js:266 | 2011 | 0 | 2011 | 22.5% | 0.2% |
| territoryBoundary · villages.js:3610 | 5480 | 3952 | 1528 | 17.1% | 0.5% |
| _num · trees.js:20 | 4298 | 3203 | 1095 | 12.3% | 0.4% |
| _mkHeap · path-core.js:56 | 6596 | 5715 | 881 | 9.9% | 0.6% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _caravanStepV2 · economy-sim-v2.js:2844 | 41470 | 0 | 41470 | 464.9% | 3.5% |
| onGameTick · villages.js:12944 | 1168700 | 1159779 | 8921 | 100.0% | 100.0% |
| processImmediate · timers:436 | 1168700 | 1159779 | 8921 | 100.0% | 100.0% |
| pump · t745-vclock.js:100 | 1168700 | 1159779 | 8921 | 100.0% | 100.0% |
| _t731Tick · villages.js:13122 | 1168699 | 1159779 | 8920 | 100.0% | 100.0% |
| upsertRoadCell · zone-local-db.js:596 | 66363 | 57461 | 8902 | 99.8% | 5.7% |
| flushDaily · roads.js:451 | 105771 | 102770 | 3001 | 33.6% | 9.1% |
| _flushStep · roads.js:468 | 105758 | 102758 | 3000 | 33.6% | 9.0% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13158 · econ | 32569 | 1186 | 31383 |
| villages.js:13198 · terr | 43362 | 34344 | 9018 |
| villages.js:13194 · econ | 61311 | 55712 | 5599 |
| villages.js:13225 · caravan | 20787 | 17732 | 3055 |
| villages.js:13161 · roads | 113154 | 110420 | 2734 |
| villages.js:13203 · wx | 7330 | 6219 | 1111 |

## 2. 마감 안 CPU 시간을 함수별로 — lr730 · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 274798 ms ↔ 끔 371458 ms (늘어난 -96659 ms) · 마감 밖: 켬 378034 ↔ 끔 321254. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| storageFoodPer · economy-sim.js:939 | 1027 | 34 | 993 | — | 0.4% |
| _terrBlocked0 · zone.js:2563 | 743 | 0 | 743 | — | 0.3% |
| _worldStockOf · economy-sim-v2.js:590 | 789 | 50 | 739 | — | 0.3% |
| (anon) · t740-side-hook.js:110 | 671 | 22 | 649 | — | 0.2% |
| _lifeDailySteps · villages.js:21427 | 654 | 33 | 621 | — | 0.2% |
| currentEra · era.js:106 | 591 | 14 | 577 | — | 0.2% |
| kcalPerKg · kcal.js:134 | 580 | 17 | 563 | — | 0.2% |
| sync · granary-lots.js:330 | 562 | 0 | 562 | — | 0.2% |
| tickDecay · economy-sim-v2.js:3062 | 563 | 12 | 551 | — | 0.2% |
| _t1196End · economy-sim.js:3489 | 447 | 0 | 447 | — | 0.2% |
| econUnitsOf · kcal.js:198 | 188 | 21 | 167 | — | 0.1% |
| anyViewerNear · zone.js:2781 | 177 | 11 | 166 | — | 0.1% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| priceView · events.js:486 | 11552 | 467 | 11085 | — | 4.2% |
| _t859Stock · economy-sim-v2.js:79 | 8671 | 180 | 8491 | — | 3.2% |
| pricesFresh · events.js:382 | 18635 | 15236 | 3399 | — | 6.8% |
| exec · :0 | 3344 | 0 | 3344 | — | 1.2% |
| scanDay · events.js:730 | 12780 | 10482 | 2298 | — | 4.7% |
| _scanSteps · events.js:736 | 12681 | 10401 | 2280 | — | 4.6% |
| (anon) · villages.js:13193 | 2288 | 410 | 1878 | — | 0.8% |
| trade · economy-sim-v2.js:3233 | 2286 | 409 | 1877 | — | 0.8% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| set · t1489-probe.js:113 | 1728 | 1391 | 337 |
| villages.js:13232 · events | 148 | 27 | 121 |
| g · villages.js:13153 | 27 | 8 | 19 |
| sync · granary-lots.js:330 | 757 | 748 | 9 |
| Date.now · t740-side-hook.js:58 | 6 | 0 | 6 |
| villages.js:13223 · caravan | 4 | 2 | 2 |

## 2. 마감 안 CPU 시간을 함수별로 — rl20 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 7843 ms ↔ 끔 16751 ms (늘어난 -8908 ms) · 마감 밖: 켬 31619 ↔ 끔 23057. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _distMatrixGen · villages.js:4396 | 2088 | 0 | 2088 | — | 26.6% |
| _t598EdgeOk · villages.js:4172 | 1394 | 0 | 1394 | — | 17.8% |
| _terrBlocked0 · zone.js:2563 | 1740 | 438 | 1302 | — | 22.2% |
| isTerrainBlockedLocal · zone.js:2570 | 1106 | 311 | 795 | — | 14.1% |
| _t957DistStage · villages.js:13552 | 115 | 0 | 115 | — | 1.5% |
| _t598Anchor · villages.js:4164 | 78 | 0 | 78 | — | 1.0% |
| _oreNear · terrain.js:483 | 33 | 0 | 33 | — | 0.4% |
| _oreScanRow · villages.js:7327 | 29 | 0 | 29 | — | 0.4% |
| isOre · villages.js:961 | 29 | 0 | 29 | — | 0.4% |
| isBlockedByWall · zone.js:19831 | 27 | 0 | 27 | — | 0.3% |
| maskEDT · village-layout.js:119 | 25 | 0 | 25 | — | 0.3% |
| isDitchTileLocal · zone.js:2344 | 24 | 0 | 24 | — | 0.3% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| (anon) · villages.js:13234 | 6139 | 0 | 6139 | — | 78.3% |
| _t957DistStage · villages.js:13552 | 6133 | 0 | 6133 | — | 78.2% |
| _distMatrixGen · villages.js:4396 | 5972 | 0 | 5972 | — | 76.1% |
| _t598EdgeOk · villages.js:4172 | 4191 | 0 | 4191 | — | 53.4% |
| _t598Anchor · villages.js:4164 | 456 | 0 | 456 | — | 5.8% |
| onGameTick · villages.js:12944 | 389 | 0 | 389 | — | 5.0% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 309 | 0 | 309 | — | 3.9% |
| _huntBandBuild · villages.js:20281 | 224 | 0 | 224 | — | 2.9% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13234 · dist | 6139 | 0 | 6139 |
| villages.js:13216 · bcast | 1 | 0 | 1 |
| villages.js:13223 · caravan | 1 | 0 | 1 |
| villages.js:13163 · life | 0 | 1 | -1 |
| _closeDay · villages.js:13615 | 0 | 2 | -2 |
| _t731Mark · villages.js:13141 | 0 | 2 | -2 |

## 2. 마감 안 CPU 시간을 함수별로 — rl20 · 그 뒤(날 11~ 에 비운 표본) (켬 1판 ↔ 끔 1판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 33756 ms ↔ 끔 22624 ms (늘어난 11132 ms) · 마감 밖: 켬 30466 ↔ 끔 20308. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| pop · path-core.js:72 | 1403 | 0 | 1403 | 12.6% | 4.2% |
| _searchStep · path-core.js:351 | 2119 | 1272 | 847 | 7.6% | 6.3% |
| _targetV2 · economy-sim-v2.js:879 | 1517 | 1086 | 431 | 3.9% | 4.5% |
| _huntHuntersSteps · villages.js:20409 | 2201 | 1778 | 423 | 3.8% | 6.5% |
| _mkHeap · path-core.js:56 | 486 | 143 | 343 | 3.1% | 1.4% |
| (anon) · villages.js:4680 | 682 | 351 | 331 | 3.0% | 2.0% |
| isWaterCellLocal · terrain.js:353 | 819 | 491 | 328 | 2.9% | 2.4% |
| _isPointInRiver · terrain.js:305 | 903 | 579 | 324 | 2.9% | 2.7% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 314 | 0 | 314 | 2.8% | 0.9% |
| _t598EdgeOk · villages.js:4172 | 298 | 0 | 298 | 2.7% | 0.9% |
| _huntScan · villages.js:20439 | 800 | 506 | 294 | 2.6% | 2.4% |
| run · :0 | 580 | 326 | 254 | 2.3% | 1.7% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _caravanSyncOne · villages.js:6659 | 10882 | 5002 | 5880 | 52.8% | 32.2% |
| (anon) · villages.js:13225 | 7074 | 3507 | 3567 | 32.0% | 21.0% |
| _t851Sync · villages.js:6743 | 7074 | 3507 | 3567 | 32.0% | 21.0% |
| _searchStep · path-core.js:351 | 6639 | 3092 | 3547 | 31.9% | 19.7% |
| pathStep · path-core.js:474 | 6546 | 3128 | 3418 | 30.7% | 19.4% |
| getRouteResumable · villages.js:5345 | 5224 | 2085 | 3139 | 28.2% | 15.5% |
| _routeResume · villages.js:4865 | 5211 | 2083 | 3128 | 28.1% | 15.4% |
| _t661ReturnPts · villages.js:6080 | 5065 | 2671 | 2394 | 21.5% | 15.0% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13225 · caravan | 7074 | 3507 | 3567 |
| villages.js:819 | 3813 | 1502 | 2311 |
| villages.js:13381 · life | 10216 | 8055 | 2161 |
| villages.js:13174 · econ | 2704 | 1942 | 762 |
| villages.js:13198 · terr | 3920 | 3247 | 673 |
| _drainVillageWaitQ · villages.js:13698 | 1927 | 1338 | 589 |

## 2. 마감 안 CPU 시간을 함수별로 — rl3 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 3판 ↔ 끔 3판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 4609 ms ↔ 끔 1926 ms (늘어난 2683 ms) · 마감 밖: 켬 23612 ↔ 끔 8841. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _terrBlocked0 · zone.js:2563 | 1423 | 74 | 1349 | 50.3% | 30.9% |
| _t598EdgeOk · villages.js:4172 | 1147 | 0 | 1147 | 42.8% | 24.9% |
| isTerrainBlockedLocal · zone.js:2570 | 745 | 32 | 714 | 26.6% | 16.2% |
| _distMatrixGen · villages.js:4396 | 428 | 0 | 428 | 16.0% | 9.3% |
| isWaterTileLocal · zone.js:2134 | 88 | 0 | 88 | 3.3% | 1.9% |
| isBlocked · villages.js:888 | 56 | 0 | 56 | 2.1% | 1.2% |
| _t598Anchor · villages.js:4164 | 36 | 0 | 36 | 1.3% | 0.8% |
| isDitchTileLocal · zone.js:2344 | 24 | 0 | 24 | 0.9% | 0.5% |
| _t957DistStage · villages.js:13552 | 22 | 0 | 22 | 0.8% | 0.5% |
| _t427Set · villages.js:17469 | 9 | 3 | 6 | 0.2% | 0.2% |
| isMajorOreAt · terrain.js:659 | 10 | 5 | 5 | 0.2% | 0.2% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 4 | 0 | 4 | 0.1% | 0.1% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| (anon) · villages.js:13234 | 3558 | 0 | 3558 | 132.6% | 77.2% |
| _t957DistStage · villages.js:13552 | 3555 | 0 | 3555 | 132.5% | 77.1% |
| _distMatrixGen · villages.js:4396 | 3523 | 0 | 3523 | 131.3% | 76.4% |
| _t598EdgeOk · villages.js:4172 | 3436 | 0 | 3436 | 128.1% | 74.6% |
| isBlocked · villages.js:888 | 2519 | 1448 | 1071 | 39.9% | 54.7% |
| isTerrainBlockedLocal · zone.js:2570 | 2477 | 1465 | 1012 | 37.7% | 53.8% |
| _t598Anchor · villages.js:4164 | 429 | 0 | 429 | 16.0% | 9.3% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 387 | 0 | 387 | 14.4% | 8.4% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13234 · dist | 3558 | 0 | 3558 |
| villages.js:13193 · econ | 32 | 29 | 3 |
| villages.js:13199 · ore | 36 | 34 | 2 |
| set · t1489-probe.js:113 | 11 | 10 | 1 |
| villages.js:13195 · econ | 3 | 2 | 1 |
| g · villages.js:13153 | 1 | 1 | 1 |

## 2. 마감 안 CPU 시간을 함수별로 — rl3 · 그 뒤(날 11~ 에 비운 표본) (켬 3판 ↔ 끔 3판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 26112 ms ↔ 끔 29624 ms (늘어난 -3512 ms) · 마감 밖: 켬 27964 ↔ 끔 43151. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| queryRect · quadtree.js:67 | 5468 | 5156 | 312 | — | 20.9% |
| _huntHuntersSteps · villages.js:20409 | 3166 | 2862 | 305 | — | 12.1% |
| collGenAround · zone.js:4872 | 1915 | 1657 | 258 | — | 7.3% |
| _t427Reach · villages.js:17486 | 787 | 696 | 91 | — | 3.0% |
| _t427Set · villages.js:17469 | 430 | 344 | 87 | — | 1.6% |
| _huntScan · villages.js:20439 | 877 | 813 | 64 | — | 3.4% |
| _searchStep · path-core.js:351 | 87 | 31 | 56 | — | 0.3% |
| _villageBody · economy-sim-v2.js:3214 | 65 | 12 | 53 | — | 0.2% |
| _xy · villages.js:20485 | 180 | 131 | 49 | — | 0.7% |
| left · tick-budget.js:30 | 97 | 52 | 45 | — | 0.4% |
| _t562SliceStop · villages.js:17370 | 139 | 99 | 40 | — | 0.5% |
| _edgeScan · zone.js:19283 | 311 | 275 | 36 | — | 1.2% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _huntHuntersSteps · villages.js:20409 | 14323 | 13058 | 1265 | — | 54.9% |
| _lifeGameDaySteps · villages.js:20519 | 14781 | 13524 | 1256 | — | 56.6% |
| _t427Reach · villages.js:17486 | 9617 | 8787 | 830 | — | 36.8% |
| _lifeDailySteps · villages.js:21427 | 16081 | 15364 | 717 | — | 61.6% |
| (anon) · villages.js:13381 | 16106 | 15403 | 703 | — | 61.7% |
| straightPathClear · zone.js:4798 | 5054 | 4566 | 488 | — | 19.4% |
| npcReachHas · zone.js:4928 | 5080 | 4597 | 484 | — | 19.5% |
| findCellFence · zone.js:19394 | 1747 | 1334 | 413 | — | 6.7% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13381 · life | 16106 | 15403 | 703 |
| villages.js:819 | 156 | 82 | 74 |
| villages.js:13225 · caravan | 253 | 200 | 53 |
| villages.js:13232 · events | 18 | 13 | 5 |
| _closeDay · villages.js:13615 | 16 | 12 | 4 |
| villages.js:13242 · t731 | 11 | 10 | 1 |

## 2. 마감 안 CPU 시간을 함수별로 — rl51 · 갓 뜬 세계(부팅 ~ 날 10 안에 비운 표본 · 귀는 처음 두 마감 + 30초마다 비운다) (켬 2판 ↔ 끔 2판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 15392 ms ↔ 끔 18586 ms (늘어난 -3194 ms) · 마감 밖: 켬 44222 ↔ 끔 33195. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _distMatrixGen · villages.js:4396 | 5989 | 0 | 5989 | — | 38.9% |
| _t598EdgeOk · villages.js:4172 | 2373 | 0 | 2373 | — | 15.4% |
| isTerrainBlockedLocal · zone.js:2570 | 1819 | 578 | 1241 | — | 11.8% |
| isBlocked · villages.js:888 | 1018 | 308 | 710 | — | 6.6% |
| _t957DistStage · villages.js:13552 | 355 | 0 | 355 | — | 2.3% |
| isOre · villages.js:961 | 65 | 0 | 65 | — | 0.4% |
| _oreScanRow · villages.js:7327 | 53 | 0 | 53 | — | 0.3% |
| _t598Anchor · villages.js:4164 | 52 | 0 | 52 | — | 0.3% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 51 | 0 | 51 | — | 0.3% |
| maskEDT · village-layout.js:119 | 49 | 0 | 49 | — | 0.3% |
| _huntScan · villages.js:20439 | 37 | 0 | 37 | — | 0.2% |
| _lifeGameDaySteps · villages.js:20519 | 34 | 0 | 34 | — | 0.2% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| (anon) · villages.js:13234 | 11020 | 0 | 11020 | — | 71.6% |
| _t957DistStage · villages.js:13552 | 11010 | 0 | 11010 | — | 71.5% |
| _distMatrixGen · villages.js:4396 | 10489 | 0 | 10489 | — | 68.1% |
| _t598EdgeOk · villages.js:4172 | 5085 | 0 | 5085 | — | 33.0% |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 500 | 0 | 500 | — | 3.2% |
| (anon) · villages.js:13199 | 492 | 0 | 492 | — | 3.2% |
| _oreMineDaily · villages.js:7406 | 491 | 0 | 491 | — | 3.2% |
| _oreCellsOf · villages.js:7317 | 486 | 0 | 486 | — | 3.2% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13234 · dist | 11020 | 1 | 11020 |
| villages.js:13223 · caravan | 4 | 2 | 3 |
| _t731Mark · villages.js:13141 | 3 | 0 | 3 |
| villages.js:13242 · t731 | 2 | 1 | 2 |
| villages.js:13158 · econ | 1 | 0 | 1 |
| villages.js:13199 · ore | 492 | 492 | 1 |

## 2. 마감 안 CPU 시간을 함수별로 — rl51 · 그 뒤(날 11~ 에 비운 표본) (켬 2판 ↔ 끔 2판 · 판 하나 평균 ms · 1ms 표본)

마감 안 표본 합: 켬 28442 ms ↔ 끔 29040 ms (늘어난 -598 ms) · 마감 밖: 켬 15846 ↔ 끔 16944. "늘어난 몫" = 늘어남 ÷ 늘어난 합(합이 0 이하면 —) · "켬 몫" = 켬 ms ÷ 켬 마감 합.

### 자기 시간(self)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| PathCore.routePathBegin.plain.stepBlocked · villages.js:4714 | 486 | 0 | 486 | — | 1.7% |
| _t598EdgeOk · villages.js:4172 | 436 | 0 | 436 | — | 1.5% |
| _searchStep · path-core.js:351 | 4492 | 4190 | 302 | — | 15.8% |
| pop · path-core.js:72 | 307 | 76 | 231 | — | 1.1% |
| queryRect · quadtree.js:67 | 612 | 455 | 158 | — | 2.2% |
| isTerrainBlockedLocal · zone.js:2570 | 833 | 688 | 146 | — | 2.9% |
| _preservedKcal · kcal.js:156 | 130 | 0 | 130 | — | 0.5% |
| isBlocked · villages.js:888 | 389 | 278 | 111 | — | 1.4% |
| warTreeCellBlocked · zone.js:6567 | 785 | 700 | 85 | — | 2.8% |
| (anon) · path-core.js:183 | 79 | 0 | 79 | — | 0.3% |
| gGet · path-core.js:196 | 446 | 373 | 74 | — | 1.6% |
| _walkCellBlocked · villages.js:5425 | 798 | 736 | 63 | — | 2.8% |

### 포함 시간(incl · 부른 함수 몫까지 · 공용 바깥 틀 뺌)

| 함수 · 파일:줄 | 켬 ms | 끔 ms | 늘어남 ms | 늘어난 몫 | 켬 몫 |
| --- | --- | --- | --- | --- | --- |
| _t851Sync · villages.js:6743 | 14082 | 12463 | 1619 | — | 49.5% |
| (anon) · villages.js:13225 | 14081 | 12463 | 1618 | — | 49.5% |
| _t427Reach · villages.js:17486 | 1419 | 0 | 1419 | — | 5.0% |
| _t661ReturnPts · villages.js:6080 | 11006 | 9863 | 1143 | — | 38.7% |
| chooseSpecies · region-profiles.js:338 | 1078 | 0 | 1078 | — | 3.8% |
| _caravanSyncOne · villages.js:6659 | 18281 | 17280 | 1001 | — | 64.3% |
| _walkFor · villages.js:5537 | 8609 | 7672 | 938 | — | 30.3% |
| _lifeClearDay · villages.js:15508 | 919 | 0 | 919 | — | 3.2% |

### 마감 일 줄(조각)별

| 조각(줄 · 이름) | 켬 ms | 끔 ms | 늘어남 ms |
| --- | --- | --- | --- |
| villages.js:13225 · caravan | 14081 | 12463 | 1618 |
| villages.js:13381 · life | 3464 | 3402 | 62 |
| villages.js:13193 · econ | 675 | 632 | 43 |
| _drainVillageWaitQ · villages.js:13698 | 742 | 710 | 32 |
| villages.js:13194 · econ | 435 | 409 | 27 |
| villages.js:13160 · econ | 334 | 317 | 17 |

## 3. 마을 수 · 길 수에 따른 마감(가상 시계 · 20날 · 3날~ · 마감 CPU ms)

| 판 | 길 고침 | 마을 | 교역로 쌍 | 꼬리 수 | 꼬리 CPU 가운데 | 꼬리 CPU 최대 | 하루 합 가운데 | 하루 합 최대 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hv3 | 켬 | 3 | 3 | 17 | 66 | 331 | 85 | 365 |
| hv3 | 끔 | 3 | 3 | 17 | 75 | 359 | 88 | 413 |
| hv10 | 켬 | 10 | 45 | 17 | 235 | 401 | 294 | 497 |
| hv10 | 끔 | 10 | 45 | 17 | 243 | 765 | 295 | 992 |
| hv20 | 켬 | 20 | 190 | 17 | 418 | 1177 | 614 | 1301 |
| hv20 | 끔 | 20 | 190 | 17 | 480 | 1794 | 577 | 1931 |
| hv51 | 켬 | 51 | 1275 | 17 | 1341 | 2829 | 1507 | 3177 |
| hv51 | 끔 | 51 | 1275 | 17 | 1219 | 3364 | 1343 | 3783 |
| hvnip | 켬 | 36 | 630 | 17 | 905 | 1526 | 1200 | 1877 |
| hvnip | 끔 | 36 | 630 | 17 | 848 | 1497 | 1052 | 1851 |

## 4. 세계 나이 · 크기별 마감(가상 시계 긴 판 · 마감 CPU ms · 꼬리 = 줄 서는 마감)

| 판 | 길 고침 | 구간 | 꼬리 수 | 마을 | 교역로 쌍(표본) | 꼬리 가운데 | 꼬리 p95 | 꼬리 최대 | 하루 합 가운데 | 하루 합 최대 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hcar | 켬 | 1~10날 | 10 | 51 | 1275 | 1424 | 3722 | 3722 | 1548 | 5215 |
| hcar | 켬 | 11~100날 | 89 | 51 | 1275 | 2039 | 3052 | 3813 | 2404 | 4413 |
| hcar | 켬 | 전체(1~100날) | 99 | 51 | 1275 | 2039 | 3505 | 3813 | 2404 | 5215 |
| hcar | 끔 | 1~10날 | 10 | 51 | 1275 | 1318 | 3967 | 3967 | 1479 | 5416 |
| hcar | 끔 | 11~100날 | 89 | 51 | 1275 | 1900 | 2900 | 3566 | 2296 | 4104 |
| hcar | 끔 | 전체(1~100날) | 99 | 51 | 1275 | 1900 | 3283 | 3967 | 2296 | 5416 |
| hnip | 켬 | 1~10날 | 10 | 36 | 630 | 1062 | 3317 | 3317 | 1062 | 4239 |
| hnip | 켬 | 11~100날 | 90 | 36 | 630 | 1336 | 2046 | 2209 | 1572 | 2215 |
| hnip | 켬 | 101~199날 | 99 | 36 | 630 | 1421 | 2936 | 8778 | 1512 | 8778 |
| hnip | 켬 | 전체(1~199날) | 199 | 36 | 630 | 1395 | 2064 | 8778 | 1524 | 8778 |
| hnip | 끔 | 1~10날 | 10 | 36 | 630 | 1204 | 3191 | 3191 | 1204 | 4324 |
| hnip | 끔 | 11~100날 | 90 | 36 | 630 | 1389 | 1957 | 2246 | 1548 | 2246 |
| hnip | 끔 | 101~199날 | 99 | 36 | 630 | 1406 | 2247 | 14182 | 1504 | 14182 |
| hnip | 끔 | 전체(1~199날) | 199 | 36 | 630 | 1389 | 2092 | 14182 | 1527 | 14182 |
| hwar | 켬 | 1~10날 | 10 | 51 | 1275 | 1664 | 4515 | 4515 | 2379 | 5303 |
| hwar | 켬 | 11~100날 | 89 | 51 | 1275 | 2216 | 3281 | 3593 | 5490 | 25520 |
| hwar | 켬 | 전체(1~100날) | 99 | 51 | 1275 | 2216 | 3565 | 4515 | 5269 | 25520 |
| hwar | 끔 | 1~10날 | 10 | 51 | 1275 | 1374 | 4349 | 4349 | 2161 | 5347 |
| hwar | 끔 | 11~100날 | 89 | 51 | 1275 | 2158 | 3134 | 4518 | 12656 | 23483 |
| hwar | 끔 | 전체(1~100날) | 99 | 51 | 1275 | 2158 | 3425 | 4518 | 12388 | 23483 |
| lr730 | 켬 | 1~10날 | 10 | 51 | 1275 | 1547 | 4150 | 4150 | 1680 | 5782 |
| lr730 | 켬 | 11~100날 | 90 | 51 | 1275 | 2056 | 3280 | 4106 | 2369 | 4601 |
| lr730 | 켬 | 101~400날 | 300 | 51 | 1275 | 2003 | 3108 | 11935 | 2398 | 12277 |
| lr730 | 켬 | 401~730날 | 329 | 51 | 1275 | 1960 | 2934 | 6919 | 2351 | 8482 |
| lr730 | 켬 | ≤400날 전체 | 400 | 51 | 1275 | 2020 | 3260 | 11935 | 2389 | 12277 |
| lr730 | 켬 | 전체(1~730날) | 729 | 51 | 1275 | 1998 | 3090 | 11935 | 2373 | 12277 |
| lr730 | 끔 | 1~10날 | 10 | 51 | 1275 | 1594 | 3948 | 3948 | 1692 | 5694 |
| lr730 | 끔 | 11~100날 | 90 | 51 | 1275 | 1970 | 2998 | 4219 | 2289 | 5104 |
| lr730 | 끔 | 101~400날 | 300 | 51 | 1275 | 2113 | 3075 | 3912 | 2519 | 14210 |
| lr730 | 끔 | 401~730날 | 329 | 51 | 1275 | 2257 | 3582 | 17819 | 2721 | 43363 |
| lr730 | 끔 | ≤400날 전체 | 400 | 51 | 1275 | 2079 | 3095 | 4219 | 2468 | 14210 |
| lr730 | 끔 | 전체(1~730날) | 729 | 51 | 1275 | 2129 | 3294 | 17819 | 2520 | 43363 |

## 5. 손님 `/인출` — 거절 "마을에서 너무 멉니다"(빨강) 몫

"옛 마을" = `/인출` 이 "마을 한가운데에서 너무 멉니다"(`villages.js` `_villageNear`) — 곁 마을 표시가 비지 않고 **앞 마을(B)** 을 가리킨 채 남은 판(A 의 brief 가 줄에 선 사이). 빨강과 같은 차례 결함의 다른 얼굴.

| 판 | 길 고침 | 갈래 | 판수 | 빨강(너무 멉니다) | 옛 마을(한가운데 멉니다) | 촌장 문 말(초록) | 그 밖 | brief 보낸 때 가운데 ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cb-adj | 켬 | adj-direct | 10 | 3 | 0 | 7 | 0 | 463 |
| cb-adj | 켬 | adj-viaB | 10 | 1 | 3 | 6 | 0 | 746 |
| cb-adj | 끔 | adj-direct | 10 | 1 | 0 | 9 | 0 | 654 |
| cb-adj | 끔 | adj-viaB | 10 | 1 | 2 | 7 | 0 | 495 |
| cb-adj50 | 켬 | adj-direct | 10 | 8 | 0 | 2 | 0 | 646 |
| cb-adj50 | 켬 | adj-viaB | 10 | 7 | 1 | 2 | 0 | 642 |
| cb-adj50 | 끔 | adj-direct | 10 | 8 | 0 | 2 | 0 | 675 |
| cb-adj50 | 끔 | adj-viaB | 10 | 1 | 4 | 5 | 0 | 495 |
| cb-base | 켬 | base | 40 | 2 | 0 | 38 | 0 | 602 |
| cb-base | 끔 | base | 20 | 0 | 0 | 20 | 0 | 491 |
| cb-cross | 켬 | newday | 10 | 0 | 0 | 10 | 0 | 559 |
| cb-cross | 켬 | sameday | 10 | 10 | 0 | 0 | 0 | — |
| cb-cross | 끔 | newday | 10 | 1 | 0 | 9 | 0 | 281 |
| cb-cross | 끔 | sameday | 10 | 10 | 0 | 0 | 0 | — |
| cb-private | 켬 | denied-fallback-door | 20 | 0 | 0 | 20 | 0 | 732 |
| cb-private | 끔 | denied-fallback-door | 20 | 0 | 0 | 20 | 0 | 603 |
| cbn-base | 켬 | base | 40 | 2 | 0 | 38 | 0 | 442 |
| cbr-adj | 켬 | adj-direct | 10 | 0 | 0 | 10 | 0 | 499 |
| cbr-adj | 켬 | adj-viaB | 10 | 0 | 0 | 10 | 0 | 317 |
| cbr-adj | 끔 | adj-direct | 10 | 0 | 0 | 10 | 0 | 457 |
| cbr-adj | 끔 | adj-viaB | 10 | 0 | 0 | 10 | 0 | 671 |
| cbr-base | 켬 | base | 20 | 0 | 0 | 20 | 0 | 616 |
| cbr-cross | 켬 | newday | 10 | 0 | 0 | 10 | 0 | 626 |
| cbr-cross | 켬 | sameday | 10 | 10 | 0 | 0 | 0 | — |

* cb-adj-off: 가장 가까운 두 마을 임업4(12) ↔ 농촌16(20) 12066px
* cb-adj-on: 가장 가까운 두 마을 임업4(12) ↔ 농촌16(20) 12066px
* cb-adj50-off: 가장 가까운 두 마을 농촌4(21) ↔ 어촌16(35) 5204px
* cb-adj50-on: 가장 가까운 두 마을 농촌4(21) ↔ 어촌16(35) 5204px
* cb-base-off: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cb-base-on: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cb-base-on-b: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cb-cross-off: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cb-cross-on: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cb-private-off: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cb-private-on: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cbn-base-on: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cbn-base-on-b: 가장 가까운 두 마을 농촌1(1) ↔ 임업2(3) 31970px
* cbr-adj-off: 가장 가까운 두 마을 농촌4(21) ↔ 어촌16(35) 5204px
* cbr-adj-on: 가장 가까운 두 마을 농촌4(21) ↔ 어촌16(35) 5204px
* cbr-base-on: 가장 가까운 두 마을 농촌4(21) ↔ 어촌16(35) 5204px
* cbr-cross-on: 가장 가까운 두 마을 농촌4(21) ↔ 어촌16(35) 5204px
* cb-private-off: 첫 판 땅 잡기 시도 29번 — [{"off":0,"sgn":"1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"-1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"0,1","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"0,-1","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":2,"sgn":"1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]}] …
* cb-private-on: 첫 판 땅 잡기 시도 29번 — [{"off":0,"sgn":"1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"-1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"0,1","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":1,"sgn":"0,-1","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]},{"off":2,"sgn":"1,0","added":false,"n":["집터는 선 자리를 가운데로 아홉 칸(3×3)을 한 번에 잡습니다. 북서 · 북 · 북동 ·"]}] …

## 6. 실제 하루 길이(24분 · 봇 8)에서 본 마감

하루 = 1,440,000 ms(24분 · `VILLAGE_DAY_MS`) · 판 초 = 기동 포함. 꼬리 = 줄 서는 마감(날 · 벽시계 ms). 요청 = 봇 여덟의 마을 요청 → 답 ms.

| 판 | 길 고침 | 판 초 | 마지막 날 | 꼬리 수 | 꼬리(날 · ms) | 줄 선 요청 | 줄 가운데 ms | 줄 최대 ms | 요청 | 요청 가운데 | p99 | 최대 | ping p99 | ping 최대 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| rr51-on | 켬 | 1845 | 2 | 2 | 1날 599 · 2날 1130 | 15 | 593 | 1011 | 31269 | 3 | 17 | 1025 | 15 | 486 |
| rr51-off | 끔 | 1829 | 2 | 2 | 1날 618 · 2날 1258 | 15 | 759 | 1138 | 31202 | 3 | 17 | 1246 | 15 | 519 |

## 7. 하루에 마감이 몇 번 도나(가상 시계 판 · 3날~ · 마감 = 장부 줄이 서고 지는 한 바퀴)

| 판 | 날 수 | 미니 마감(줄 안 섬) 가운데/날 | 꼬리 마감(줄 섬) 가운데/날 | 꼬리 최대/날 |
| --- | --- | --- | --- | --- |
| hv10-off | 18 | 1 | 1 | 1 |
| hv10-on | 18 | 1 | 1 | 1 |
| hv20-off | 18 | 1 | 1 | 1 |
| hv20-on | 18 | 1 | 1 | 1 |
| hv3-off | 17 | 1 | 1 | 1 |
| hv3-on | 17 | 1 | 1 | 1 |
| hv51-off | 18 | 1 | 1 | 1 |
| hv51-on | 18 | 1 | 1 | 1 |
| hvnip-off | 17 | 1 | 1 | 1 |
| hvnip-on | 17 | 1 | 1 | 1 |
| lr730-off | 728 | 1 | 1 | 1 |
| lr730-on | 728 | 1 | 1 | 1 |

## 8. 갓 뜬 세계 — 날마다 꼬리 마감 벽시계 ms(실시계 판 · 판들 가운데)

"첫 마감 dist" = 1날 꼬리 마감의 단계 시간 `dist`(제품 `tickCtx.stg` 값) · "프레임" = 그 마감이 걸친 프레임 수. 켬만 `dist` 조각이 선다.

| 판 | 길 고침 | 판수 | 1날 | 2날 | 3날 | 4날 | 5날 | 6날 | 첫 마감 dist ms | 첫 마감 프레임 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cb-base | 켬 | 2 | 10128 | 410 | 106 | 42 | 13 | 13 | 3574 | 292 |
| cb-base | 끔 | 1 | 4341 | 300 | 208 | 96 | 35 | 68 | 0 | 118 |
| cbn-base | 켬 | 2 | — | — | — | — | — | — | — | — |
| rl20 | 켬 | 1 | 20111 | 2622 | 3032 | 2352 | 2744 | 2406 | 6899 | 580 |
| rl20 | 끔 | 1 | 6452 | 3244 | 7951 | 2666 | 8665 | 4036 | 0 | 143 |
| rl3 | 켬 | 3 | 11245 | 1038 | 1068 | 681 | 130 | 76 | 3768 | 321 |
| rl3 | 끔 | 3 | 4266 | 434 | 113 | 111 | 112 | 204 | 0 | 115 |
| rl3 | 끔+이웃잇기 | 1 | 1180 | 319 | 106 | 39 | 46 | 12 | 0 | 37 |
| rl51 | 켬 | 2 | 38857 | 5306 | 3413 | 5745 | 2711 | 3165 | 12604 | 1090 |
| rl51 | 끔 | 2 | 10525 | 5438 | 9670 | 5682 | 7650 | 4717 | 0 | 233 |
| rr51 | 켬 | 1 | 599 | 1130 | — | — | — | — | 0 | 117 |
| rr51 | 끔 | 1 | 618 | 1258 | — | — | — | — | 0 | 114 |

## 9. 판 목록(끝 코드 · 초)

| 판 | 종료 | 초 | 마감 줄 수 | 줄 선 요청 수 | 진행 |
| --- | --- | --- | --- | --- | --- |
| cb-adj-off | 0 | 156 | 108 | 30 | — |
| cb-adj-on | 0 | 171 | 114 | 29 | — |
| cb-adj50-off | 0 | 164 | 39 | 30 | — |
| cb-adj50-on | 0 | 174 | 33 | 30 | — |
| cb-base-off | 0 | 133 | 396 | 7 | — |
| cb-base-on | 0 | 150 | 388 | 3 | — |
| cb-base-on-b | 0 | 142 | 363 | 4 | — |
| cb-cross-off | 0 | 151 | 422 | 10 | — |
| cb-cross-on | 0 | 162 | 399 | 13 | — |
| cb-private-off | 0 | 822 | 2466 | 3 | — |
| cb-private-on | 0 | 834 | 2477 | 4 | — |
| cbn-base-on | 0 | 140 | 0 | 0 | — |
| cbn-base-on-b | 0 | 146 | 0 | 0 | — |
| cbr-adj-off | 0 | 159 | 0 | 0 | — |
| cbr-adj-on | 0 | 177 | 0 | 0 | — |
| cbr-base-on | 0 | 150 | 0 | 0 | — |
| cbr-cross-on | 0 | 175 | 0 | 0 | — |
| hcar-off | 0 | 396 | 199 | 0 | 100날 끝 |
| hcar-on | 0 | 436 | 199 | 0 | 100날 끝 |
| hnip-off | 0 | 597 | 299 | 0 | 200날 끝 |
| hnip-on | 0 | 632 | 299 | 0 | 200날 끝 |
| hv10-off | 0 | 35 | 39 | 0 | — |
| hv10-on | 0 | 46 | 39 | 0 | — |
| hv20-off | 0 | 55 | 39 | 0 | — |
| hv20-on | 0 | 66 | 39 | 0 | — |
| hv3-off | 0 | 18 | 29 | 0 | — |
| hv3-on | 0 | 29 | 29 | 0 | — |
| hv51-off | 0 | 129 | 39 | 0 | — |
| hv51-on | 0 | 162 | 39 | 0 | — |
| hvnip-off | 0 | 111 | 29 | 0 | — |
| hvnip-on | 0 | 133 | 29 | 0 | — |
| hwar-off | 0 | 1131 | 199 | 0 | 100날 끝 |
| hwar-on | 0 | 773 | 199 | 0 | 100날 끝 |
| lr730-off | 0 | 689 | 1459 | 0 | 730날 끝 |
| lr730-on | 0 | 568 | 1459 | 0 | 730날 끝 |
| rigtest | 0 | 61 | 54 | 177 | — |
| rl20-off-1 | 0 | 144 | 59 | 480 | — |
| rl20-on-1 | 0 | 157 | 63 | 499 | — |
| rl3-edge-1 | 0 | 150 | 176 | 839 | — |
| rl3-off-1 | 0 | 138 | 184 | 872 | — |
| rl3-off-2 | 0 | 138 | 382 | 777 | — |
| rl3-off-3 | 0 | 138 | 416 | 374 | — |
| rl3-on-1 | 0 | 151 | 170 | 834 | — |
| rl3-on-2 | 0 | 150 | 343 | 794 | — |
| rl3-on-3 | 0 | 151 | 399 | 384 | — |
| rl51-off-1 | 0 | 154 | 27 | 238 | — |
| rl51-off-2 | 0 | 151 | 26 | 232 | — |
| rl51-on-1 | 0 | 165 | 25 | 232 | — |
| rl51-on-2 | 0 | 170 | 25 | 232 | — |
| rr51-off | 0 | 1829 | 84 | 15 | — |
| rr51-on | 0 | 1845 | 84 | 15 | — |

