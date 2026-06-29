# 마을실험실 ↔ economy-sim 통합 설계 (정밀검사 기록)

> 결론: 직업 선택(수요·공급·비교우위)·인구 동역학·교역·가격은 **이미 `sim/economy-sim.js`(+v2)에 완성**돼 있다.
> 마을실험실에서 내가 다시 만든 인구·food 경제는 중복이므로 걷어내고, **economy-sim을 경제 두뇌, 마을실험실을 공간·시각+상세농사 몸**으로 통합한다.

---

## 1. economy-sim 정밀 스펙 (코드 정독 + 실행 검증 완료)

### village 모델 (`createVillage(opts)`, L463)
```
village = {
  land: { fertility, wood, stone, ore, water, game, size, baseSize },  // 자원강세(0.3~2.0 배율)
  npcs: [ {currentJob, skills{field:lvl}, age, ...} ],
  storage: { food, fish, meat, wood, stone, ore, tool, weapon, ... },  // 자원 비축
  counts: { farmer:n, fisher:n, miner:n, ... },                        // 직업 분포(O(1) 캐시)
  treasury, guild{taxRate}, surplusEMA{}, coord{x,y}, tradeStats{...}
}
정착: initialPop(기본8), storage.food=initN×300(300일치), 첫 NPC=merchant
```

### JOBS (L100~176) — 13직업, 각각:
- `field·output·base·landBoost(v)·toolDependent·inputs`
- **농부**: food = 1.5×`land.fertility`×skill×tool · **어부**: fish=1.2×`land.water` · **사냥**: meat=0.7×`land.game`
- **광부**: stone=0.7×`land.stone` · **탐사**: ore=0.5×`land.ore` · **벌목**: wood=0.9×`land.wood`
- **대장/무공/갑공**: tool/weapon/armor (inputs 필요: wood·stone·ore·hide) · **요리**: cooked_food(food+부재료) · **채집**: 과일·채소·버섯 · **상인**: 교역 · **전사**: 방어

### `tickVillage(v, day)` 일일 순서 (L595~793)
1. **생산** — 각 NPC가 job별로 `base×landBoost×(1+skill×0.05)×tool×inputMult` 산출 → storage. 3% 세금→treasury.
2. **영토 확장** (7일마다, food·wood·stone 비용 (size/base)^1.3).
3. **소비** — food = N×1.0/일. 도구 마모.
4. **Surplus EMA** — 식량 흐름 평활(0.95/0.05).
5. **K(수용한계) = min(slotK, prodK)** — `slotK`=직업 식량자리 합(`totalFoodSlots`=농부+어부+사냥+채집×0.5), `prodK`=(자체생산+**수입 EMA**)/소비. **★수입이 K에 들어가 교역이 척박마을 부양.**
6. **인구 로지스틱**: dP = r(0.012/일)×N×(1−N/K) + 기근(−)·행복·건강 보정(5 stat). 일일 변화 ±2% 상한. POP_MAX=1000.
7. **출생→부족직군 충원**(`pickDeficitJob`), **사망→최고령부터**(기근 시). 365일은 사망 보호.
8. **직업 자동전환**(`autoSwitchJob`, 평소 21일 1명, 식량위기 시 매일 2명 → 농부로).
9. age++.

### 직업 자리 (`jobCapacity`, L338)
```
farmer = size × fertility × 0.4   fisher = size × water × 0.25
hunter = size × game × 0.30       miner  = size × stone × 0.30
lumberjack = size × wood × 0.30   prospector = size × ore × 0.20
forager = size × 0.30             smith/cook/warrior/merchant = pop × 6~10%
```
→ **비옥지=농부자리↑·잉여노동은 다른 직업으로** (내가 만들려던 노동배분이 이미 이것).

### 교역 (`tickTrade`, v2)
- 행상 = **LOP 차익거래**: 이익 = N×(p_to(1−τ)−p_from(1+τ)−운반비/N−위험), max 쌍 선택, 이동 3~7일.
- **shadow price** = BASE×(target/stock)^elasticity (식량 탄력↑, 사치 완만). 거래소 수수료 τ→treasury.

### 실행 검증 (`node economy-sim-v2.js 600 5 42`)
- 600일: 인구 53→448, 거래 1499. 마을이 자원별로 특화·인구 차등(비옥 산악 195 vs 척박 평원 28), 교역 창발. ✅ 정상 동작.

### Node 의존성 (이식성)
- 코어(createWorld/tickWorld/tickVillage)는 **순수 JS**.
- 의존: `require('../server/specialty')`(stat 계산, lazy) + CLI 러너(process.argv/fs, L1398+, 코어 무관).
- → **브라우저 이식: specialty.js 번들 + CLI 러너 제외**면 됨.

---

## 2. 매핑 (마을실험실 ↔ economy-sim)

| 마을실험실 (공간) | economy-sim (경제) | 방향 |
|---|---|---|
| 지형 TR.fert(마을영역 평균) | `land.fertility` | 공간→경제 |
| 강·물 접근 | `land.water` | 공간→경제 |
| 지형 돌·광맥 | `land.stone`, `land.ore` | 공간→경제 |
| 숲 | `land.wood`, `land.game` | 공간→경제 |
| 영토/농지 칸수 | `land.size` | 공간→경제 |
| (없음) | `npcs.length` = 인구 | 경제→공간(렌더) |
| 농부 NPC 수·위치 | `counts.farmer` | 경제→공간(렌더·애니) |
| 곳간 | `storage.food` | 경제→공간(표시) |
| 상세 농사(작물·논밭·계절) | 농부 `output=food`의 **시각/메커니즘 표현** | 양방향 |

**중복(걷어낼 것) — 마을실험실의:** 인구 로지스틱·L_POPMAX·foodAvg EMA·fertility→yield 캡·needLand·경작제한·곳간캡 = 전부 economy-sim에 더 정교하게 있음.

---

## 3. 통합 아키텍처

```
[지형/VillageLayout] --land params(fert,water,stone,ore,size)--> [economy-sim 두뇌]
                                                                    | tickVillage/tickTrade
                                                                    v
[공간 렌더·NPC 이동·상세농사] <--pop, job counts, storage-- [village 상태]
```
- **economy-sim = 진실의 원천**(인구·직업·food·교역·가격).
- **마을실험실 = 그것의 공간/시각 구현** + 농부 food 생산의 상세 메커니즘(작물·논밭은 농부 output의 표현).
- 시간: economy-sim은 day 단위 tick. 마을실험실의 게임시계(720게임분/일)와 동기 → 하루 경계마다 tickVillage 호출.

---

## 4. 단계 계획 (점진·검증)

- [x] **S1. economy-sim 브라우저 이식** — `sim/economy-engine.browser.js`(빌더 `build-econ-bundle.js`). 회귀검증 8/8 정확 일치(시드4×기간2). 전역 `EconEngine`.
- [x] **S2. 지형→land params 추출** — `extractLandParams(V,TR)`: 마을 반경 평균 비옥/물/바위 → `land.{fertility,water,stone,ore,wood,game,size}`. ★economy-sim 스케일(정상≈1.0)에 맞춰 리스케일(fert×2.0, water×1.6 등).
- [x] **S3. 마을실험실 중복 경제 제거 + 엔진 구동** — 내 Malthus/Liebig 블록 삭제. economy-sim이 인구·직업·food 구동. `life.pop=econ.npcs.length`, `life.food=econ.storage.food`.
  - **★핵심 수정(정밀검사로 발견)**: 단일 `tickVillage`만 돌리면 붕괴(농부 7→1). 원인 = `v._world`(가격·교역 컨텍스트)가 없어 `autoSwitchJob`이 농부를 빼버림. → **5마을 world(`createWorldV2`)에 내 공간마을을 villages[0]로 넣고 `tickWorldV2`로 구동**. 교역 파트너 4 + 내 마을.
  - 검증(시드7, ~15게임년): 척박 fert0.6→22명(교역의존,곳간106) / 중간 1.1→51명(자급,목표부합) / 비옥 1.6→57명(농부↑·광부분화). 붕괴 0. 결정론적.
- [x] **S4. 경제→공간 렌더** — `lifeSync`가 매일 `life.agents` 수를 econ.counts에 동기: 농부=`counts.farmer`(논밭), 어부=`counts.fisher`(물가), 그 외 전 직업=`villager` 에이전트(회관 주변, `otRole`로 광부·사냥·채집·대장·상인 등 라벨). 폴백(econ 없을 때 옛 비율) 유지.
  - 검증(시드7·42 × 비옥0.3/0.55/0.8 = 6런, 정착~12년 35회): `agents.length===npcs.length` & 농부·어부 정확 일치, **불일치 0**. 정착 순간도 일치(lifeInit서 econ 생성 직후 lifeSync).
- [ ] **S5. 상세 농사 = 농부 output의 시각화** — (대체로 충족) economy-sim이 food 권위(`s.food=econ.storage.food`가 매일 덮어씀 → 공간 수확 `s.food+=`는 장식). 농부 NPC 작물 애니(논밭·계절·카탈로그)는 그대로 시각 표현. 잔여: 죽은 `s.food+=` 정리, 작물 선택을 econ 농부수와 더 묶기(선택).
- [ ] **S6. 다(多)마을 + 교역 렌더** — world 5마을 이미 경제상 교역 중. 공간에 이웃 마을·행상 이동 렌더(현재는 내 마을만 공간 표현).
- [ ] **S7. 엄밀 회귀검증** — 통합 후 결정론·생존·비옥도 스프레드·교역 부양 확인(완료). 추가: 공간 NPC 수가 econ pop과 항상 동기.

---

## 5. 핵심 결정 로그
- 경제는 **재발명 금지** — economy-sim이 권위. 마을실험실은 공간/시각/상세농사만.
- 비옥도→인구는 economy-sim의 K=min(직업자리, 생산+수입)에 이미 있음(수입 포함 = 교역 부양).
- "남는 농부"는 economy-sim에서 자동으로 다른 직업이 됨(jobCapacity+자동전환). 마을실험실 단독에선 놀았던 것.
