# 회부 — 랩 MSY 상한 4종이 **econ 에 닿지 않고 버려지고 있다** (2026-08-26 발견)

> 낚시 v2 배치에서 `land.fishSustain` 을 쓰려다 발견. **이번 배치에서 고치지 않았다** —
> 고치면 NPC 산출이 바뀌는 경제 결정이고, 그 배치의 규약은 "라이브 기본 동작 불변"이었다.

## 무엇이 일어나고 있나

`server/sustain.js`(11차 "한 번에 다 해" 배치)가 랩 수식 그대로 네 값을 잰다:

| 키 | 뜻 | 재는 곳 |
|---|---|---|
| `woodSustain` | 숲 로지스틱 MSY — 민둥산의 리비히 신호 | `sustainOf()` |
| `fishSustain` | 어장 MSY = 물셀수 × (L_FISHR/4) × FISH_ECON_PER_STOCK | `sustainOf()` |
| `forageSustain` | 임연부 MSY | `sustainOf()` |
| `marginalQ` | 리카도 한계지 품질 실측 | `marginalQOf()` |

`server/villages.js extractSustain()` 이 이 값들을 `landParams` 에 넣고,
`econ.createVillage({ ...lp, ... })` 로 넘긴다. **그런데 `createVillage` 의 `land` 는 화이트리스트다**
(`sim/economy-sim.js:1476`): fertility·arable·wood·stone·ore·water·game·obsidian·jade·oreMix·oreP·oreDist·tin·size·baseSize.
**네 키는 그 목록에 없다 → 조용히 버려진다.**

실측(라이브 경로, 마을 2곳 시딩 직후):

```
마을 농촌1 land keys: fertility,arable,wood,stone,ore,water,game,obsidian,jade,oreMix,oreP,oreDist,tin,size,baseSize
  water= 0.69  fishSustain= undefined  woodSustain= undefined  forageSustain= undefined
마을 어촌2  water= 1.58  fishSustain= undefined  woodSustain= undefined  forageSustain= undefined
```

엔진 쪽은 멀쩡히 기다리고 있다 — `sim/economy-sim.js:1784`:
```js
const _fishScale = (v.land.fishSustain != null && _fishRaw > 0) ? Math.min(1, v.land.fishSustain / _fishRaw) : 1;
```
`null`(=없음) 규약이 "상한 미적용 = 현행 보존"이라 **아무도 실패를 못 봤다.**
같은 함정을 `_forageScale`(1786) · `_fishCap`(2343) · `_forCap`(2350) · `marginalLandQ`(913) 가 공유한다.
`sim/economy-engine.browser.js`(2944·3503)도 같은 코드라 **랩도 마찬가지**다.

## 왜 지금 고치지 않았나

상한을 켜면 **그 상한이 물리는 마을의 NPC 산출이 실제로 줄어든다.** 그건 경제 결정이다:
- 3시드 800일 기준선(인구 6,280/5,993/6,072 · 소멸 0/51)이 움직일 수 있다.
- 특히 `woodSustain` 은 벌목·연료(fuelK)로 이어져 야금 사슬까지 물린다.
- 넷을 **한꺼번에** 켤지, 하나씩 켤지도 판단이다.

낚시 v2 는 그래서 **키를 채우지 않고 값만 들고 있는** 길을 골랐다(`villages.js` 의 `ev.land._fishBase`).
플레이어가 실제로 그 물을 긁기 전까지 `land.fishSustain` 은 여전히 `undefined` 라
**NPC 산출은 오늘과 비트 동일**하다.

## 켤 때 무엇을 확인해야 하나 (실측 절차)

1. **얼마나 물리나** — 마을마다 `raw` vs `sustain` 을 찍어 본다.
   낚시 배치가 잰 한 예: 농촌1 `fishSustain 19.99/일` vs 어부 0명(raw 0) → 여유 무한대.
   어부 3명·water 0.69 면 raw ≈ 2.5/일 이라 **여유 8배**. 어장은 대체로 안 물릴 것으로 보인다.
   **숲·임연부는 다를 수 있다** — 벌채가 진행된 마을일수록 `woodSustain` 이 줄기 때문이다(그게 설계 의도다).
2. **3시드 800일 A/B** — 켜기 전/후로 인구·소멸·무기Q·거래수. 하나라도 ±5% 밖이면 원인을 특정하고 보고.
3. **랩 3사본 재인라인** — `createVillage` 를 고치면 `sim/build-econ-bundle.js` → 랩 2종 재인라인이 필수다
   (안 하면 랩이 구 econ 으로 돈다 · `durango-econ-inline-deploy` 규약).
4. **`marginalQ` 는 성격이 다르다** — 상한이 아니라 **합성 감쇠식의 대체값**이다(913행).
   켜면 리카도 한계지가 실측으로 바뀌므로 확장 비용·정원이 함께 움직인다. **따로 판단하라.**

## 추천

- **어장만 먼저** 켜는 안이 위험이 가장 낮다(여유 8배 · 낚시 v2 가 이미 그 키를 쓰고 있다).
- 숲·임연부는 벌채 진행도에 따라 실제로 물릴 수 있으니 **3시드 A/B 를 먼저**.
- `marginalQ` 는 별건으로 미뤄라.

★이 문서는 **발견 보고**다. 구현하지 마라 — 재민의 결정이 먼저다.
