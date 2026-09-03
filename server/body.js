// === server/body.js — 플레이어 신체 상태 (§7) ===================================
//
// ★[재민 확정 2026-08-26] 헌법 두 줄:
//   ① **상태는 생존 압박이 아니라 경제·리듬의 접속면**이다.
//      채택 기준 = "오늘 내 판단을 바꾸는가 vs 주기적으로 채우는 유지비인가"(§7).
//      결핍은 **기울기**로 말한다. 벽이 아니라 저녁의 효율 저하다.
//      ★★[캐논 변경 2026-09-01 재민 확정 · T44] 종전 이 줄은 *"그래서 여기엔 아사가 없다"* 였다.
//        **그 캐논은 폐기됐다**(§12): 극단에 닿기 **전**은 종전대로 디버프뿐이고, 극단에 닿으면
//        HP 가 아주 천천히 깎인다. 기울기라는 헌법은 그대로다 — 벽이 생긴 게 아니라
//        기울기가 **끝까지** 이어질 뿐이다(`extremeHpRate` 합산기 하나).
//   ② **속은 연속, 겉은 계단**(§8.3). 역학은 piecewise linear 연속함수,
//      표시는 3~4단계 양자화 + **전환에만** 히스테리시스.
//
// ★★이 모듈이 만든 게 아닌 것 — 배치 전 실측(이 배치의 §0 규약):
//   `hunger`·`thirst` 는 **이미 있었다**(연속값 · 접속 중에만 감쇠 · 스프린트 게이트 ·
//   HP 회복 게이트 · 밤 추위 허기 가속). 장비 슬롯도 있었고 `clothes.attrs.warmth` 가
//   이미 밤 추위를 막고 옷이 닳았다. 식사(`doEat`/`doCook`/`doEatDish`)도 있었다.
//   ⇒ 이 모듈은 **새로 짓는 게 아니라 흩어진 것을 한 정본으로 모으고**,
//     없던 축(추위·피로·부상·사기)과 **연속 효과 곡선**을 얹는다.
//
// ★오프라인 감쇠 절대 금지(§7 재민 확정 · §6 숙제 금지):
//   `tick()` 은 **호출될 때 흐른 실시간만** 적분한다. 접속하지 않은 동안은 아무도 이걸 안 부른다.
//   `lastSeen` 같은 걸로 따라잡기(catch-up)를 **넣지 마라** — `test-body ①` 이 그걸 막는다.
'use strict';

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };

const CFG = {
  // ── 감쇠(초당) — ★★[3층 재배선 2026-08-30 재민 확정] 고증치로 재산정 ────────
  //   재민 확정: **허기 = 게임 2일 · 갈증 = 게임 1일**(하루 24분 기준).
  //     허기 2일 = 실시간 48분 = 2,880초 · 갈증 1일 = 24분 = 1,440초.
  //   ⇒ "1시간 세션에 식사 1~2회". 종전(허기 2700s)보다 **느리다** — 종전은 게임일과
  //     무관한 값이라 "며칠째 겨울"이라는 감각과 어긋났다. 이제 하루가 단위다.
  HUNGER_SEC: _num('BODY_HUNGER_SEC', 2880),   // 100 → 0 까지 초 (= 게임 2일)
  THIRST_SEC: _num('BODY_THIRST_SEC', 1440),   // 100 → 0 까지 초 (= 게임 1일)
  // ★★상태 의존 감쇠 — **배부름은 금방 꺼지고 진짜 배고픔은 천천히 깊어진다.**
  //   대사 고증(간 글리코겐이 먼저 빠지고 그 뒤가 느리다) + 게임적으로는 **유예**다:
  //   경고가 뜬 뒤에도 손쓸 시간이 길다. 위(100→50)가 전체의 1/3, 아래(50→0)가 2/3.
  //   ⇒ 위쪽 감쇠율이 아래쪽의 **정확히 2배**(기본값 기준). 총 소요는 위 `*_SEC` 그대로다.
  DECAY_SPLIT: _num('BODY_DECAY_SPLIT', 0.5),      // 게이지 분기점(0.5 = 절반)
  DECAY_TOP_FRAC: _num('BODY_DECAY_TOP_FRAC', 1 / 3), // 위 절반이 쓰는 시간 비중
  COLD_HUNGER_EXTRA: _num('BODY_COLD_HUNGER_EXTRA', 0.6),   // 추울수록 에너지를 더 쓴다

  // ── 스태미나(신설 · 단기 자원) ──────────────────────────────────────────────
  //   ★★재민 확정: **달릴 수 있는지는 스태미나가 정한다 — 허기가 아니라.**
  //   "배고파도 뛸 수는 있는데 숨 고르기가 안 된다." 허기·갈증은 **회복 배율**로만 관여한다.
  //   `b.stam` 은 자원이라 **1 = 가득**(다른 축은 1 = 최악 — 방향이 반대다. severity 로 뒤집어 쓴다).
  STAM_SPRINT_SEC: _num('BODY_STAM_SPRINT_SEC', 22),   // 빈손 전력질주 가득→바닥
  STAM_REST_SEC: _num('BODY_STAM_REST_SEC', 30),       // 서서 쉬면 바닥→가득
  STAM_MOVE_MULT: _num('BODY_STAM_MOVE_MULT', 0.35),   // 걸으면서는 덜 찬다
  STAM_LOAD_W: _num('BODY_STAM_LOAD_W', 1.2),          // 짐 적재율 1 이면 소모 ×(1+이 값)
  STAM_MIN: _num('BODY_STAM_MIN', 0.02),               // 이 아래면 달리기 끊긴다
  STAM_RESUME: _num('BODY_STAM_RESUME', 0.25),         // 끊긴 뒤 이만큼 차야 다시 달린다(깜빡임 방지)

  // ── 추위 — ★★평형 수렴 모델(재민 확정) ─────────────────────────────────────
  //   종전은 **누적식**이었다: 노출이 0보다 크기만 하면 `cold` 가 1 까지 **끝없이 올랐다**.
  //   그래서 얇은 옷을 입어도 밤이 길면 결국 최악에 닿았고, 낮이 와도 "해소 행동"(불·실내)
  //   없이는 안 내려갔다. 몸이 아니라 **적립금**이었다.
  //   ⇒ 이제 주변이 **목표점**을 만들고 몸이 거기로 **지수 수렴**한다.
  //     밤에 오르고 낮에 저절로 내려간다. 겨울엔 평형점 자체가 높아 옷·불 없이는 안 내려간다.
  //   ★★[온도 곡선 2026-08-31] 시정수 240 → 130. **겨울 난이도는 여기서 조정한다** —
  //     재민 확정: *"시간은 절대 바꾸면 안 돼. 차라리 겨울 버티는 난이도를 수정."*
  //     하루 24분·1년 365일은 캐논이라 손대지 않고, "야생 한겨울 밤 맨몸 = 5~8분에 3단계"를
  //     **수렴 속도**로 맞춘다. 240 이면 14분이라 하룻밤(12분)에 3단계가 아예 안 왔다 —
  //     겨울이 이름만 겨울이었던 진짜 이유가 이 상수였다.
  //     120 = 실측 7.0분(목표 5~8분의 한가운데 · `scripts/cold-matrix.js` 12년 표본).
  COLD_TAU_SEC: _num('BODY_COLD_TAU_SEC', 120),     // 수렴 시정수(63% 도달까지)
  //   ★아래 셋은 이제 **폴백(4단 계단) 전용**이다 — `ctx.day` 가 오면 `server/weather.js` 가
  //     econ 기온 정본에서 유도한 연속 곡선을 쓴다. 값은 튜닝1 앵커 그대로 남겨 둔다:
  //     하네스 ⑭이 "폴백 계단의 네 점 = 곡선의 네 앵커"를 매번 못 박는다(사본 표류 방지).
  COLD_NIGHT_W: _num('BODY_COLD_NIGHT_W', 0.45),    // (폴백) 여름밤 앵커
  COLD_DAY_W: _num('BODY_COLD_DAY_W', 0.0),         // (폴백) 여름낮 앵커
  COLD_SEASON_W: _num('BODY_COLD_SEASON_W', 0.7),   // (폴백) 겨울낮 앵커
  COLD_INDOOR_MULT: _num('BODY_COLD_INDOOR_MULT', 0.30),  // 실내는 목표점을 이만큼으로
  COLD_FIRE_TARGET: _num('BODY_COLD_FIRE_TARGET', 0.05),  // 불 옆 목표점 상한
  // ── ★★[옷 티어 2026-08-31 재민 확정] 옷은 **체감 기온을 올린다**(곱셈 노출 폐기) ──────
  //   재민 확정: *"조잡한 베옷은 한겨울 야생 밤을 못 막는다 — 겨울 = 가죽·모피 수요."*
  //
  //   ★왜 곱셈을 버렸나 — **실측이 곱셈 모델을 기각했다.** 종전 `노출 = 1 − warmth/50` 로
  //     한겨울 자정 야생 24년 도달률을 재면:
  //       warmth 0 → 13/24 · warmth 2 → 9/24 · **warmth 4 → 0/24**
  //     방한 4점짜리 넝마 한 장이 겨울을 통째로 지운다. 티어가 설 자리가 아예 없다
  //     (곱셈은 추위 전체를 깎으니 평형이 3단계 문턱 아래로 한 번에 내려간다).
  //   ⇒ 옷을 **℃ 로** 말하게 한다. 그러면 옷·고도 감률(−6.5℃/km)·날씨 편차(±5℃)가
  //     **같은 단위**가 되어 서로 상쇄·가산된다. 물리적으로도 이게 단열(insulation)의 정의다.
  //     같은 실측을 단열 모델로 다시 재면 사다리가 선다:
  //       +0.5℃ → 12/24 · +1℃ → 10/24 · +1.5℃ → 7/24 · +2℃ → 4/24 · +3℃ → 0/24
  //
  //   ★`WARMTH_MIN` — 헐거운 옷은 **바람이 지나간다.** 방한 값이 이 아래면 단열이 0 이다.
  //     고증: 조잡한 마직 홑옷은 여미지 못해 체열이 그냥 빠진다. 겹쳐 입거나 가죽이라야 막힌다.
  //     ⇒ 이 한 줄이 "첫 한 벌이 겨울을 지우는" 문제를 없앤다(재민 회부 B-2 그 자체).
  WARMTH_C_PER: _num('BODY_WARMTH_C_PER', 0.09),   // 방한 1점 → 체감 기온 +℃
  WARMTH_MIN: _num('BODY_WARMTH_MIN', 10),         // 이 아래는 단열 0(바람이 지나간다)
  //   ★★[겨울 난이도 2026-08-31 재민 확정] **마을 = 안전망 · 야생 = 위험.**
  //     마을 안은 바람이 죽고(집·담·나무), 어딘가 늘 불기운이 있고, 사람이 있다 —
  //     디에게틱 근거가 있는 **미기후**다. 목표점을 이 비율만큼 깎는다.
  //     0.65 ⇒ 한겨울 밤 야생 1.00 이 마을에선 0.35(=1단계 아래). 그래서 **마을 안에선 안 죽는다.**
  //     ⚠이건 "마을 안이 안전하다"는 **설계 약속**이지 미세 튜닝 손잡이가 아니다. 낮추려면 회부.
  COLD_VILLAGE_SHELTER: _num('BODY_COLD_VILLAGE_SHELTER', 0.65),
  WARMTH_FULL: _num('BODY_WARMTH_FULL', 50),        // 옷 방한 이 값이면 노출 0(기존 상수와 같은 뜻)
  //   ★★[바람 노출 2026-09-01 재민 확정 ④] **"같은 고도라도 능선은 골짜기보다 춥다."**
  //     노출도 X(0..1 · `server/wind.js`)에 이 계수를 곱해 목표점에 **항 하나**로 얹는다.
  //     고도 감률과는 **독립**이다(둘 다 걸리면 높고 노출된 자리가 가장 춥다).
  //     ★평지의 X 는 0 이다 ⇒ 추위 2차가 재 둔 평지 기준선이 **한 자리도 안 움직인다.**
  COLD_WIND_K: _num('BODY_COLD_WIND_K', 0.6),
  // ── ★★[바닷물 2026-09-01 · T3 동봉] 짠물은 갈증을 **가속**한다 ───────────────
  //   재민 확정: 확률 굴리기(식중독) 금지 — **확정적**이다. 마시면 회복 0 이고,
  //   BRINE_SEC 동안 갈증 감소가 BRINE_MULT 배가 된다(보존식 `thirst` 음수와 같은 뜻의 다른 축).
  BRINE_SEC: _num('BODY_BRINE_SEC', 300),
  BRINE_MULT: _num('BODY_BRINE_MULT', 2.5),

  // ── ★★★[캐논 변경 2026-09-01 재민 확정 · T44] **"아사 폐지" 폐기** ─────────────
  //   §12 원문: *"허기·갈증·극한 추위·더위는 **극단에 닿기 전엔 디버프만**,
  //   **극단에 닿으면 HP 가 아주 천천히 깎인다.** 고증 최우선 — 물 안 마셔도 사는 세계는 없다.
  //   여러 축이 동시에 극단이면 감소율은 **기여의 합**(연속·가산)."*
  //
  //   ★단위는 **HP / 게임분**이다. 시간 구조 불변 캐논이 이 환산을 고정해 준다:
  //     `zone-config.js:437` *"하루=현실 24분(**현실 1초=게임 1분**)"* ⇒ 1 게임분 = 1 실초.
  //     그래서 아래 값은 HP/실초 이기도 하다(`test-body ⑰㉠` 이 하루 길이에서 이 환산을 확인한다).
  //     ⚠`VILLAGE_DAY_MS` 로 하루를 줄이는 하네스가 있어도 **몸의 시계는 안 바뀐다** —
  //       허기·갈증 감쇠(`HUNGER_SEC`)가 이미 실초를 쓰는 것과 같은 규약이다.
  //
  //   ★★역산 표 — "극단 최심에서 이만큼이면 HP 100 이 빈다"(지시서 시작점 그대로)
  //   ┌────────┬──────────────┬──────────┬──────────────┬───────────────────────────────┐
  //   │ 축     │ 게임 시간     │ 게임분   │ HP/게임분    │ 실시간(하루 24분 기준)         │
  //   ├────────┼──────────────┼──────────┼──────────────┼───────────────────────────────┤
  //   │ 허기   │ 3 게임일      │ 4,320    │ 0.023148     │ 72분                          │
  //   │ 갈증   │ 1.5 게임일    │ 2,160    │ 0.046296     │ 36분                          │
  //   │ 추위   │ 6 게임시간    │   360    │ 0.277778     │ 6분                           │
  //   │ 더위   │ (8 게임시간)  │  (480)   │ (0.208333)   │ ★이 세계엔 **더위 축이 없다** │
  //   └────────┴──────────────┴──────────┴──────────────┴───────────────────────────────┘
  //   ★고증 근거와 **게임적 압축**을 정직하게 갈라 적는다:
  //     · 현실 "3-3-3": 물 없이 ~3일 · 음식 없이 ~3주 ⇒ 갈증:허기 = **1 : 7**.
  //       게임은 1 : 2 다(1.5일 : 3일). 1:7 을 그대로 쓰면 허기가 10.5 게임일 = 실시간 4.2시간이라
  //       **한 세션에서 한 번도 안 보인다.** ⇒ "둘 다 한 세션 안에서 보이되 **갈증이 먼저**"로 압축했다.
  //     · 추위만은 압축이 없다 — 저체온증 사망은 극한 노출에서 3~6시간이고, 여기서도 **게임 6시간**이다.
  //       (실시간으로는 6분이라 짧아 보이지만 그건 하루가 24분이기 때문이지 값이 사나운 게 아니다.)
  //   ★값은 실기 후 조정한다(전부 env). 되돌리기: 셋 다 0 이면 캐논 변경 전과 **비트 동일**.
  EXTREME_HP_HUNGER: _num('BODY_EXTREME_HP_HUNGER', 100 / (3 * 1440)),
  EXTREME_HP_THIRST: _num('BODY_EXTREME_HP_THIRST', 100 / (1.5 * 1440)),
  EXTREME_HP_COLD: _num('BODY_EXTREME_HP_COLD', 100 / (6 * 60)),

  // ── ★★[여름 2026-09-03 재민 확정 · T64] **더위는 온도가 아니라 갈증이다** ──────
  //   T56 §4 가 24년 17,520 표본으로 증명한 것: 이 세계의 기온은 `coldOfC` 가 끝나는 29℃ 위로
  //   **4.7℃ 밖에 더 안 올라간다**(최고 33.69℃ · 35℃ 초과 0회). 그 폭에 0→1 을 욱여넣으면
  //   여름 낮이 매년 극단이 되고, 넓게 잡으면 24년에 한 번도 안 닿는다. ⇒ **온도 축은 안 만든다.**
  //   PM 판정(2026-09-03): *"여름철 갈증 배율 하나. 새 축 0 · 디버프 표 무변 ·
  //   답은 이미 있는 동사(물 · 그늘)."*
  //
  //   ★★값의 유도 — **고르지 않고 유도했다**(보고 T64 §ⓓ):
  //     이 세계는 이미 고증 위에 서 있다. 게이지 100 = 물 3.33 되 = **3.33 L**(되 1kg · +30/되)이고,
  //     그게 게임 하루치다. 넉넉히 마시며 사는 사람은 하루 **5.00 되**를 쓴다 — 사람의 하루 물
  //     2.5~3.5 L(활동 시 더)와 같은 자리다. 여기에 붙일 것은 **여름의 배수**뿐이다:
  //       더위만(노동 항은 이 세계에 **없다** — `onLabor` 는 피로만 올린다 · 회부) 있는 여름의
  //       하루 물은 온대 기준의 **1.4~1.6배**다.  W=1 ⇒ 낮 ×2 · **하루 총량 ×1.50** ← 그 밴드의 바닥.
  //       바닥을 고른 이유: 우리 여름은 "같은 활동, 더 더움"이지 "더위 속 중노동"이 아니다.
  //     ⇒ 배율 = 1 + W · 여름가중 · 낮 · (1 − 그늘).  **W=0 이면 곱이 정확히 1**(되돌림 스위치).
  HEAT_THIRST_W: _num('BODY_HEAT_THIRST_W', 1.0),

  // ── ★★[쓰러짐·죽음 2026-09-02 재민 확정 · T43] **후유증** — 죽고 나면 며칠 몸이 성치 않다 ──
  //   §12: *"후유증(며칠 게임일 동안 스태미나 상한 감소, 시간이 지나면 회복)."*
  //   ★새 축을 만들지 않았다 — 있는 스태미나의 **상한**을 한동안 눌러 둘 뿐이다.
  //     그래서 달리기·과적·피로의 모든 수가 한 자도 안 움직인다(T12 가 상한만 옮긴 것과 같은 규약).
  //   ★★회복은 **연속**이다(계단 금지 — §8.3). 죽은 날 상한이 가장 낮고, 게임 며칠에 걸쳐
  //     선형으로 1 로 돌아온다. "며칠째냐"를 화면이 세지 않아도 몸이 알아서 나아진다.
  //   ⚠단위는 **게임일**이다(벽시계가 아니라) — 접속을 안 하면 안 낫는 게 아니라,
  //     세계의 날이 흐르면 낫는다. 그게 "며칠 지나면"의 뜻이다.
  AFTERMATH_DAYS: _num('BODY_AFTERMATH_DAYS', 3),
  AFTERMATH_STAM_CAP: _num('BODY_AFTERMATH_STAM_CAP', 0.55),

  // ── 피로 ───────────────────────────────────────────────────────────────────
  //   ★"24분 하루의 자연 마디"(§7). 하루 종일 일하면 저녁에 효율이 떨어지는 **정도**다.
  //   채광 1타/초로 24분 = 1,440타 ⇒ 타당 0.0008 이면 하루 끝에 대략 1.0 에 닿는다.
  FATIGUE_PER_LABOR: _num('BODY_FATIGUE_PER_LABOR', 0.0008),
  FATIGUE_REST_SEC: _num('BODY_FATIGUE_REST_SEC', 900),   // 가만히 있으면 1→0 까지
  FATIGUE_INDOOR_MULT: _num('BODY_FATIGUE_INDOOR_MULT', 2.0),
  FATIGUE_MOVE_MULT: _num('BODY_FATIGUE_MOVE_MULT', 0.25),  // 걷는 중엔 덜 쉰다

  // ── 부상 ───────────────────────────────────────────────────────────────────
  //   ★**주사위 금지**(일관성 원칙) — 확률이 아니라 **피해량 문턱**으로 생긴다.
  //   한 방에 이만큼 맞으면 다친다. 늑대 한 대(≈15)면 다치고 잔타는 안 다친다.
  INJURY_DMG: _num('BODY_INJURY_DMG', 12),
  INJURY_PER_DMG: _num('BODY_INJURY_PER_DMG', 0.02),   // 문턱 초과분 1당 이만큼
  INJURY_HEAL_SEC: _num('BODY_INJURY_HEAL_SEC', 3600), // 그냥 두면 1→0 까지(게임 2.5일)
  INJURY_HERB_MULT: _num('BODY_INJURY_HERB_MULT', 6),  // 약초 쓰면 회복 ×이 값
  INJURY_HERB_MS: _num('BODY_INJURY_HERB_MS', 120000), // 약초 한 번의 효력 시간

  // ── 사기(당근) ─────────────────────────────────────────────────────────────
  //   ★§7: 심심함·스트레스는 **기각**됐다. 대신 좋은 음식이 **버프**를 준다.
  MORALE_COOKED: _num('BODY_MORALE_COOKED', 0.55),
  MORALE_RAW: _num('BODY_MORALE_RAW', 0.10),
  MORALE_SEC: _num('BODY_MORALE_SEC', 600),            // 1→0 까지
  MORALE_WORK: _num('BODY_MORALE_WORK', 0.12),         // 사기 1 일 때 작업속도 +12%

  // ── 죽음의 나선 방지(§7 재민 확정) ─────────────────────────────────────────
  MOVE_FLOOR: _num('BODY_MOVE_FLOOR', 0.6),
  WORK_FLOOR: _num('BODY_WORK_FLOOR', 0.6),
  SHOW_MAX: _num('BODY_SHOW_MAX', 3),                  // 동시에 보여 주는 심각 상태 개수 상한

  // ── 표시(겉은 계단) ────────────────────────────────────────────────────────
  //   단계 경계와 **히스테리시스 폭**. 경계에서 값이 떨릴 때 아이콘이 깜빡이지 않게 한다.
  STAGE_HYST: _num('BODY_STAGE_HYST', 0.04),
  DIRTY_EPS: _num('BODY_DIRTY_EPS', 0.01),             // §8.3: Δ>0.01 이면 dirty
};

// ── 연속 효과 곡선 (piecewise linear · 제어점 4~6) ────────────────────────────
// ★문턱 절벽 없음(§8.3). x = 그 축의 **심각도**(0 좋음 … 1 최악), y = 배율.
//   ★1단계(=아이콘이 처음 뜨는 자리)는 **효과 체감점(이속 −5%)** 에 맞춘다 —
//     아래 `STAGE_AT` 이 각 곡선에서 y=0.95 가 되는 x 를 그대로 쓴다(상수로 박지 않는다).
//   ★★[3층 재배선 2026-08-30 재민 확정] **허기·갈증은 여기서 빠진다.**
//   재민 확정: *"허기·갈증은 이속·달리기에 직접 페널티 금지 — 스태미나·HP 의 회복 속도 배율로만."*
//   왜: 배고프다고 걸음이 느려지는 건 몸의 진실이 아니고, 게임에선 **이중 벌**이었다
//   (느려지고 + 못 뛰고 + 회복도 안 되고). 이제 결핍은 **숨 고르기와 아묾**에만 걸린다.
//   ⇒ 두 축은 `move`/`work` 를 안 갖는다. 대신 아래 `RECOVER` 곡선을 갖는다.
const CURVES = {
  cold:   { move: [[0, 1], [0.35, 1], [0.65, 0.95], [0.85, 0.90], [1, 0.85]],
            work: [[0, 1], [0.3, 1], [0.6, 0.93], [1, 0.80]] },
  fatigue:{ move: [[0, 1], [0.4, 1], [0.7, 0.95], [1, 0.88]],
            work: [[0, 1], [0.3, 1], [0.62, 0.92], [0.85, 0.82], [1, 0.72]] },
  injury: { move: [[0, 1], [0.15, 0.97], [0.5, 0.88], [1, 0.72]],
            work: [[0, 1], [0.2, 0.96], [0.6, 0.86], [1, 0.75]] },
};
// ★★회복 배율 곡선 — x = 심각도(0 배부름 … 1 공복), y = **스태미나·HP 회복 속도 배율**.
//   ★극단(x=1)에서 **0** 이다: 회복이 **멈춘다**.
//   ⚠★★[캐논 변경 2026-09-01 · T44] 종전 이 자리엔 *"그래도 HP 가 깎이지는 않는다 — 아사 폐지 캐논"*
//     이 적혀 있었다. **그 캐논은 폐기됐다.** 이제 극단에서는 `extremeHpRate` 가 HP 를 천천히 깎는다.
//     회복 정지(여기)와 HP 감소(아래 합산기)는 **다른 두 가지**이고, 둘 다 극단에서 동시에 일어난다.
const RECOVER = {
  hunger: [[0, 1], [0.40, 1], [0.65, 0.75], [0.90, 0.25], [1, 0]],
  thirst: [[0, 1], [0.35, 1], [0.60, 0.70], [0.90, 0.20], [1, 0]],
};
const AXES = ['hunger', 'thirst', 'cold', 'fatigue', 'injury'];
// 이속·작업 곡선을 갖는 축(허기·갈증은 빠졌다)
const EFFECT_AXES = ['cold', 'fatigue', 'injury'];
// 회복 배율로만 작용하는 축
const RECOVER_AXES = ['hunger', 'thirst'];
const KO = { hunger: '배고픔', thirst: '목마름', cold: '추위', fatigue: '피로', injury: '부상', morale: '사기' };
const EMO = { hunger: '🍖', thirst: '💧', cold: '🥶', fatigue: '😮‍💨', injury: '🩹', morale: '✨' };

function lerpCurve(pts, x) {
  x = x < 0 ? 0 : (x > 1 ? 1 : x);
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      const t = (x1 - x0) < 1e-9 ? 0 : (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return pts[pts.length - 1][1];
}
// 이 곡선에서 배율이 처음 `y` 아래로 내려가는 x — **1단계 경계의 정본**.
function xWhereBelow(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (y0 >= y && y1 < y) {
      const t = (y0 - y1) < 1e-9 ? 0 : (y0 - y) / (y0 - y1);
      return x0 + (x1 - x0) * t;
    }
  }
  return 1;
}
// 단계 경계 — 1단계는 **이속 −5% 지점**(체감점), 2·3단계는 그 사이를 고르게.
//   ★[3층 재배선] 허기·갈증은 이속 곡선이 없어졌다 ⇒ **회복 곡선**에서 같은 방식으로 유도한다.
//     "1단계 = 처음 체감되는 자리"라는 뜻은 그대로고, 무엇이 체감되는지가 바뀐 것이다.
//     (상수로 박지 않는다 — 곡선을 고치면 단계가 따라온다. 종전 규약 그대로.)
const STAGE_AT = {};
for (const a of AXES) {
  const src = CURVES[a] ? CURVES[a].move : RECOVER[a];
  const s1 = xWhereBelow(src, 0.95);
  STAGE_AT[a] = [s1, s1 + (1 - s1) * 0.45, s1 + (1 - s1) * 0.8];
}

// ── 상태 그릇 ────────────────────────────────────────────────────────────────
//   ★기존 `hunger`/`thirst`(0..100)는 **그 자리에 그대로 둔다** — 저장·전송·스프린트 게이트가
//     이미 그 필드를 본다. 여기서 새 이름으로 옮기면 그 전부를 갈아야 하고 얻는 게 없다.
//   새 축만 `p.body` 에 0..1 로 담는다(0 좋음 … 1 최악, 사기만 0 없음 … 1 최고).
function ensure(p) {
  if (!p.body || typeof p.body !== 'object') {
    p.body = { cold: 0, fatigue: 0, injury: 0, morale: 0, herbUntil: 0, stages: {}, stam: 1, stamLock: false, brineUntil: 0, hpDebt: 0, deadDay: null };
  }
  if (!p.body.stages) p.body.stages = {};
  // ★[3층 재배선] 옛 저장본엔 스태미나가 없다 — 가득으로 시작한다(불이익 없이 승격).
  if (!Number.isFinite(p.body.stam)) p.body.stam = 1;
  if (typeof p.body.stamLock !== 'boolean') p.body.stamLock = false;
  // ★[바닷물] 옛 저장본엔 없다 — 0(=효과 없음)으로 시작한다.
  if (!Number.isFinite(p.body.brineUntil)) p.body.brineUntil = 0;
  // ★[T44 극단 HP] 미적용 감소분(HP 단위 · 1 이 쌓이면 정본 피해 경로로 나간다).
  if (!Number.isFinite(p.body.hpDebt)) p.body.hpDebt = 0;
  // ★[T43 후유증] 마지막으로 죽은 **게임일**. null 이면 후유증 없음(옛 저장본 포함).
  if (!Number.isFinite(p.body.deadDay)) p.body.deadDay = null;
  return p.body;
}

// ── ★★[쓰러짐 2026-09-02 · T43] 후유증 — 스태미나 **상한**만 누른다 ──────────
//   `startAftermath(p, day)` 죽은 그 게임일을 적는다 · `staminaCap(p, day)` 지금의 상한(0..1).
//   ★상한은 **연속**으로 1 로 돌아온다: 죽은 날 AFTERMATH_STAM_CAP → AFTERMATH_DAYS 뒤 1.
//     (계단이면 "3일째 아침에 갑자기 멀쩡"이 된다 — §8.3 "속은 연속"의 자리다.)
function startAftermath(p, day) {
  const b = ensure(p);
  b.deadDay = Number.isFinite(day) ? day : null;
  return b.deadDay;
}
function aftermathLeft(p, day) {
  const b = ensure(p);
  if (!Number.isFinite(b.deadDay) || !Number.isFinite(day)) return 0;
  const left = CFG.AFTERMATH_DAYS - (day - b.deadDay);
  return Math.max(0, Math.min(CFG.AFTERMATH_DAYS, left));
}
function staminaCap(p, day) {
  const D = Math.max(1e-9, CFG.AFTERMATH_DAYS);
  const left = aftermathLeft(p, day);
  if (left <= 0) return 1;
  const c0 = Math.max(0, Math.min(1, CFG.AFTERMATH_STAM_CAP));
  return +(1 - (1 - c0) * (left / D)).toFixed(4);       // 남은 날이 많을수록 낮다 · 연속
}

// ── ★★[바닷물 2026-09-01 · T3 동봉] 짠물을 마셨다 ────────────────────────────
//   재민 확정: **회복 0 + 갈증 가속**, 그리고 **확정적**이다(식중독 확률 굴리기 금지).
//   고증·의학 둘 다 같은 말을 한다: 해수의 염분(≈3.5%)은 사람 신장이 배출할 수 있는 농도보다
//   짙어서, 마신 물보다 **더 많은 물을 오줌으로 내보내야** 한다. 그래서 마실수록 목이 마르다.
//   ⇒ 새 축을 만들지 않았다. 있는 갈증 축의 **감쇠 배율**을 한동안 올릴 뿐이다.
//     (보존식이 `thirst` 음수로 같은 말을 하는 것과 같은 자리다 — 축을 늘리지 않는다.)
//   ★짠물 자체는 HP 를 깎지 않는다 — **갈증을 극단으로 몰아** 간접적으로 깎는다(T44 캐논).
//     시련의 축은 그대로 갈증이고, 피는 그 갈증이 끝까지 갔을 때의 결과다.
function drinkBrine(p, now) {
  const b = ensure(p);
  const t = Number.isFinite(now) ? now : Date.now();
  b.brineUntil = Math.max(b.brineUntil || 0, t) + CFG.BRINE_SEC * 1000;
  return b.brineUntil;
}
/** 지금 짠물 기운이 남아 있는가(갈증 감쇠 배율에 쓰인다). */
function brineActive(p, now) {
  const b = ensure(p);
  return (b.brineUntil || 0) > (Number.isFinite(now) ? now : Date.now());
}
// 각 축의 **심각도** 0..1 — 곡선의 입력. 여기가 단위 환산의 유일한 자리다.
function severity(p) {
  const b = ensure(p);
  return {
    hunger: 1 - Math.max(0, Math.min(100, p.hunger == null ? 100 : p.hunger)) / 100,
    thirst: 1 - Math.max(0, Math.min(100, p.thirst == null ? 100 : p.thirst)) / 100,
    cold: b.cold, fatigue: b.fatigue, injury: b.injury,
  };
}

// ── 효과 — 곱 합산 + **바닥**(죽음의 나선 방지) ───────────────────────────────
//   반환의 `parts` 가 상태 패널의 "이속 −8% (피로 0.62)" 문장을 만드는 원자료다.
//   ★하네스가 이 문장을 다시 계산하지 않게 **여기서 다 내준다**(사본 계측기 금지).
function effects(p) {
  const sev = severity(p), b = ensure(p);
  let move = 1, work = 1;
  const parts = [];
  for (const a of EFFECT_AXES) {   // ★[3층 재배선] 허기·갈증은 여기 없다(회복 배율로만 작용)
    const s = sev[a];
    const m = lerpCurve(CURVES[a].move, s), w = lerpCurve(CURVES[a].work, s);
    move *= m; work *= w;
    if (m < 0.999 || w < 0.999) parts.push({ axis: a, ko: KO[a], emo: EMO[a], sev: +s.toFixed(3), move: m, work: w });
  }
  const moraleBonus = 1 + CFG.MORALE_WORK * (b.morale || 0);
  work *= moraleBonus;
  if ((b.morale || 0) > 0.01) parts.push({ axis: 'morale', ko: KO.morale, emo: EMO.morale, sev: +(b.morale).toFixed(3), move: 1, work: moraleBonus });
  const moveF = Math.max(CFG.MOVE_FLOOR, move);
  const workF = Math.max(CFG.WORK_FLOOR, work);
  // 심한 것부터 — 패널·무들이 상위 몇 개만 보여 준다(§7 동시 표시 제한)
  parts.sort((x, y) => (x.move * x.work) - (y.move * y.work));
  return {
    moveMult: +moveF.toFixed(4), workMult: +workF.toFixed(4),
    rawMove: +move.toFixed(4), rawWork: +work.toFixed(4),
    floored: move < CFG.MOVE_FLOOR || work < CFG.WORK_FLOOR,
    parts,
  };
}

// ── ★★회복 배율 — 허기·갈증이 하는 **유일한** 일 ────────────────────────────
//   스태미나 회복과 HP 자연 회복이 이 값을 곱한다. 둘 다 여기 하나를 본다(사본 금지).
//   반환 0..1. 0 = 회복 정지. ★HP **감소**는 이 함수가 아니라 `extremeHpRate` 가 낸다(T44 캐논 변경).
function recoverMult(p) {
  const sev = severity(p);
  let m = 1;
  for (const a of RECOVER_AXES) m *= lerpCurve(RECOVER[a], sev[a]);
  return +Math.max(0, Math.min(1, m)).toFixed(4);
}
// 각 축이 회복에 얼마를 곱하는지 — 상태 패널이 "왜 안 낫는가"를 말할 재료.
function recoverParts(p) {
  const sev = severity(p);
  return RECOVER_AXES.map((a) => ({ axis: a, ko: KO[a], emo: EMO[a], sev: +sev[a].toFixed(3),
    recover: +lerpCurve(RECOVER[a], sev[a]).toFixed(4) })).filter((x) => x.recover < 0.999);
}

// ── ★★★[캐논 변경 2026-09-01 · T44] 극단 HP 감소 — **합산기 하나** ──────────────
//   재민 §12: *"극단에 닿기 전엔 디버프만, 극단에 닿으면 HP 가 아주 천천히 깎인다.
//   여러 축이 동시에 극단이면 감소율은 **기여의 합**(연속·가산)."*
//
// ★★"극단"을 어디로 잡을 것인가 — 지시서가 물은 것(§0-ⓐ)이고, 실측이 답을 정했다.
//   ⓐ **상태 1.0** 으로 잡으면 추위 축이 사실상 발동하지 않는다:
//      추위는 **평형 수렴**이라 상태가 목표점 위로 못 간다. 한겨울 야생 밤 맨몸의 목표점이
//      실측 **0.9278** 이라(`wind-matrix`) 1.0 에 닿는 밤이 드물다 ⇒ 캐논이 죽은 채로 실린다.
//   ⓑ **3단계 문턱**(`STAGE_AT[축][2]`)으로 잡으면 —
//      · 문턱에서 초과 정도 e=0 이므로 감소율이 **0 에서 연속으로** 시작한다(계단 금지 요구 충족).
//      · 축마다 상수를 새로 안 적는다. 3단계는 이미 "심각하다"고 화면이 말하는 자리다.
//      · 허기·갈증은 게이지가 0 까지 가므로 e=1(최심)에 실제로 닿는다.
//   ⇒ **ⓑ 채택.** `EXTREME_AT` 은 새 상수가 아니라 **단계 표에서 유도**한다(사본 금지).
//     `test-body ⑰㉠` 이 "코드에 극단 문턱 리터럴이 없다"를 소스로 못 박는다.
//
//   초과 정도 e(축) = clamp01( (심각도 − 3단계 문턱) / (1 − 3단계 문턱) )   ∈ [0, 1] · 연속
//   총 감소율      = Σ  r(축) · e(축)                                      HP/게임분 · 가산
//   ⇒ 극단에서 벗어나면 e=0 이므로 **즉시 0**(잔여 누적은 아래 `takeHpDamage` 가 정리한다).
//
// ★어느 축이 깎나 — §12 가 이름을 댄 것만: **허기·갈증·극한 추위**.
//   · **더위 축은 이 세계에 없다**(`weather.js`: *"더위 축은 이 세계에 없다 — 있으면 그건 다른 배치다"*).
//     표에는 남겨 두되 배선하지 않았다. 없는 축을 만드는 건 이 카드가 아니다 ⇒ 회부.
//   · **피로·부상은 안 깎는다** — §12 목록에 없다. 부상은 전투 소관(T43·후유증)이다.
const DRAIN_AXES = ['hunger', 'thirst', 'cold'];
const DRAIN_R = { hunger: 'EXTREME_HP_HUNGER', thirst: 'EXTREME_HP_THIRST', cold: 'EXTREME_HP_COLD' };
/** 그 축의 **극단 문턱** — 3단계 경계. 표에서 유도한다(리터럴 금지). */
function extremeAt(axis) { const a = STAGE_AT[axis]; return a ? a[2] : 1; }
/** 극단 **초과 정도** 0..1 — 문턱에서 0, 최심(심각도 1)에서 1. 연속. */
function extremeness(axis, sev) {
  const at = extremeAt(axis);
  if (!(sev > at)) return 0;
  return Math.max(0, Math.min(1, (sev - at) / Math.max(1e-9, 1 - at)));
}
/**
 * ★★합산기 하나 — 지금 이 몸이 초당 몇 HP 씩 무너지는가.
 *   반환 { rate(HP/게임분 = HP/실초), parts:[{axis, sev, e, r, rate}] }.
 *   ★추위 축도 **여기서** 계산한다. `weather.js` 는 목표점(℃→0..1)만 만들고 HP 는 모른다 —
 *     추위발 감소를 저쪽에 따로 두면 그게 곧 두 번째 합산기다(사본 금지).
 */
function extremeHpRate(p) {
  const sev = severity(p);
  let rate = 0; const parts = [];
  for (const a of DRAIN_AXES) {
    const e = extremeness(a, sev[a]);
    if (e <= 0) continue;
    const r = CFG[DRAIN_R[a]] || 0;
    if (!(r > 0)) continue;
    const v = r * e;
    rate += v;
    parts.push({ axis: a, ko: KO[a], emo: EMO[a], sev: +sev[a].toFixed(4), e: +e.toFixed(4), r, rate: +v.toFixed(6) });
  }
  parts.sort((x, y) => y.rate - x.rate);
  // ★합계는 **반올림하지 않는다** — 이 값이 적분기의 입력이라, 여기서 6자리로 자르면
  //   긴 구간에서 총량이 조금씩 어긋난다(하네스 ⑰㉥ 이 그 차이를 실제로 잡아냈다).
  //   보여 주기용 반올림은 `parts[].rate` 에만 있다.
  return { rate, parts };
}
/**
 * 쌓인 감소분에서 **정수 HP** 를 꺼낸다(남은 소수는 다음으로 이월 — 총량 보존).
 * ★왜 정수로 모아 내보내나: 실제 피해는 `zone.js damagePlayer` 라는 **정본 경로**로 나가야
 *   HP 0 → 쓰러짐(downed) 사슬이 공짜로 따라온다. 그 경로를 매 틱 0.02HP 로 두드리면
 *   브로드캐스트만 늘고 얻는 게 없다. **비율은 연속, 적용만 양자화**이고 총량은 정확하다.
 * ★극단에서 벗어나면 이월분도 **버린다** — "벗어나면 즉시 0"(지시서)이 그 뜻이다.
 */
function takeHpDamage(p, stillExtreme) {
  const b = ensure(p);
  if (stillExtreme === false) { b.hpDebt = 0; return 0; }
  const n = Math.floor(b.hpDebt);
  if (n > 0) b.hpDebt -= n;
  return n;
}

// ── ★★스태미나 — 달리기의 유일한 관문 ───────────────────────────────────────
//   ★히스테리시스: 바닥나면 `stamLock` 이 서고, `STAM_RESUME` 까지 차야 풀린다.
//     안 그러면 0 근처에서 **달렸다 걸었다**가 초당 여러 번 깜빡인다(겉은 계단 규약과 같은 뜻).
function canSprint(p) {
  const b = ensure(p);
  if (b.stamLock) return b.stam >= CFG.STAM_RESUME;
  return b.stam > CFG.STAM_MIN;
}
function stamina(p) { return ensure(p).stam; }

// ── ★★추위 목표점 — 주변이 만드는 **평형점**(몸은 여기로 수렴할 뿐이다) ──────
//   입력: 날(연중 곡선) · 밤 · 마을 · 옷 · 실내 · 불. 종전에 `tick` 안에 흩어져 있던 것을 여기로 모았고,
//   이번엔 **계절 계단을 연중 연속 곡선으로 갈아끼운다**(`server/weather.js`).
//   ⇒ 하네스가 "한겨울이 초겨울보다 추운가"를 **곡선을 다시 짜지 않고** 물어볼 수 있다.
//
// ★★[온도 곡선 2026-08-31 재민 확정] 계단 폐지:
//   *"12월과 1월과 2월이 같은 강도는 아니지."* 종전 `seasonCold` 는 4단 계단(겨울 1·봄가을 0.35·여름 0)
//   이라 겨울 내내 **완전히 같은 추위**였고 계절이 바뀌는 날 밤에 몸이 한 칸 뚝 떨어졌다.
//   이제 `ctx.day`(게임일)가 있으면 연중 곡선을 쓴다.
//
//   **앵커 보존** — 튜닝1(2026-08-30) 채택 4점을 곡선 위에 그대로 얹는다:
//     여름 중앙 낮 0.00 · 여름 중앙 밤 0.45 · 겨울 중앙 낮 0.70 · 겨울 중앙 밤 **1.00(클램프 없이)**.
//     밤 몫을 계절로 보간(0.45→0.30)하는 이유가 이것이다 — 종전엔 겨울밤이 0.7+0.45=1.15 라
//     **잘려서** 초겨울 밤도 한겨울 밤도 똑같이 1.0 이었다(계단이 클램프에서 부활했다).
//
//   ⚠`ctx.day` 가 없으면(옛 호출부·일부 하네스) 종전 `ctx.seasonCold` 계단으로 **그대로** 떨어진다.
//     econ `seasonOf`·계절 배율은 **정본 그대로**다 — 여기서 바뀌는 건 몸이 느끼는 온도뿐이다.
/**
 * 옷의 **단열**(체감 기온을 몇 ℃ 올리는가). `warmth` 는 아이템 속성(0~62 급).
 * ★`WARMTH_MIN` 아래는 0 — 헐거운 옷은 바람이 지나간다(그래서 첫 한 벌이 겨울을 못 지운다).
 * ★고도 감률·날씨 편차와 **같은 단위**라 서로 상쇄된다: 갖옷 +4.7℃ vs 1km 고도 −6.5℃.
 */
function warmthInsC(warmth) {
  const w = Math.max(0, Number(warmth) || 0);
  return Math.max(0, w - CFG.WARMTH_MIN) * CFG.WARMTH_C_PER;
}
let _Weather = null;
function _weather() {
  if (_Weather === null) { try { _Weather = require('./weather'); } catch (e) { _Weather = false; } }
  return _Weather || null;
}
function coldTarget(ctx) {
  const c = ctx || {};
  //   ★[옷 티어] 곡선 경로에선 옷이 **℃** 로 작용한다(아래 폴백만 종전 곱셈 노출을 쓴다).
  const exposure = Math.max(0, 1 - (c.warmth || 0) / CFG.WARMTH_FULL);   // (폴백 전용) 옷이 막는 몫
  let t;
  const W = Number.isFinite(c.day) ? _weather() : null;
  //   ★[천장 해제] `elevKm` 을 넘긴다 — econ 감률(−6.5℃/km)이 그대로 걸린다.
  //     ⚠이 세계의 산은 35m 라 실제 기여는 0.23℃(추위 0.007)뿐이고, 게다가 바위 셀이 통행 불가라
  //       플레이어가 설 수 있는 고도가 지금은 0 뿐이다. **배선은 살렸고 세계가 아직 낮다**(회부).
  const outdoor = (W && W.available())
    ? W.outdoorCold(c.day, !!c.night, +c.elevKm || 0, warmthInsC(c.warmth)) : null;
  if (outdoor !== null) {
    // ★연중 연속 — 계절 이름이 아니라 **그날의 기온(℃)** 이 추위를 정한다(econ `temperatureAt` 정본).
    //   옷은 이미 ℃ 로 더해져 들어왔다 ⇒ 여기서 `exposure` 를 곱하지 않는다(이중 계산 금지).
    t = outdoor;
  } else {
    // 폴백 — 종전 4단 계단(`ctx.day` 를 못 받는 호출부·구 하네스 호환)
    //   ★[천장 해제] 천장은 **곡선 경로만** 열었다. 이 계단은 종전 계약 그대로 1 에서 자른다
    //     (겨울밤 0.7+0.45=1.15 → 1.00 이 이 경로의 채택값이다 — `test-body ⑭㉡` 이 못 박는다).
    t = Math.min(1, (c.night ? CFG.COLD_NIGHT_W : CFG.COLD_DAY_W) + (c.seasonCold || 0) * CFG.COLD_SEASON_W);
  }
  // ★★[천장 해제 2026-08-31] **여기서 1 로 자르지 않는다.** 자르면 −5℃ 도 −15℃ 도 같은 밤이 된다.
  //   상태값(`b.cold`)은 여전히 0~1 이고 `tick` 이 거기서 자른다 — 넘친 몫은 **속도**로만 나타난다.
  t = Math.max(0, t);
  // ★★[바람 노출 2026-09-01 재민 확정 ④] **항 하나** — 같은 고도라도 능선은 골짜기보다 춥다.
  //   `windExposure` 는 그 자리의 노출도 0..1(지형·계절의 결정론 함수 · `server/wind.js`).
  //   ⚠새 식을 만들지 않았다: 곱 하나다. 그리고 **고도 감률과 독립**이다 —
  //     감률은 위 `outdoor` 안에서 ℃ 로 이미 걸렸고, 여기서는 그 결과를 배율로 키운다.
  //   ★평지는 X=0 이라 이 줄이 정확히 ×1 이다(기존 기준선 보존 — `test-body ⑯㉢`).
  //   ⚠폴백(4단 계단) 경로엔 걸지 않는다: 노출은 `day`(계절 탁월풍)를 요구하는데
  //     폴백은 `day` 가 없는 호출부를 위한 것이라 바람의 방향을 물을 수 없다.
  if (outdoor !== null) {
    const wx = Math.max(0, Math.min(1, Number(c.windExposure) || 0));
    if (wx > 0) t *= (1 + CFG.COLD_WIND_K * wx);
  }
  // ★★마을 안전망 — 바깥 환경을 깎는다(옷보다 **먼저**: 미기후는 몸이 아니라 장소의 성질이다).
  //   `villageShelter` 는 0(야생) … 1(마을 한복판). 야생은 **완충이 없다** — 그게 위험의 정의다.
  const sh = Math.max(0, Math.min(1, Number(c.villageShelter) || 0));
  if (sh > 0) t *= (1 - CFG.COLD_VILLAGE_SHELTER * sh);
  if (outdoor === null) t *= exposure;   // ★폴백 경로에서만 — 곡선 경로는 ℃ 로 이미 반영됐다
  if (c.indoor) t *= CFG.COLD_INDOOR_MULT;
  if (c.nearFire) t = Math.min(t, CFG.COLD_FIRE_TARGET);
  // ★[천장 해제] 상한 없음. 하한만 0. (상태값의 0~1 은 `tick` 이 지킨다 — `test-body ⑮` 가 못 박는다.)
  return +Math.max(0, t).toFixed(4);
}

// ── ★상태 의존 감쇠율 — 게이지 위치에 따라 빠르기가 다르다 ───────────────────
//   g: 0..100 현재 게이지 · totalSec: 100→0 총 소요. 반환 = 지금의 초당 감소량.
//   위 절반(g > SPLIT)이 전체 시간의 TOP_FRAC 을 쓰고, 아래가 나머지를 쓴다.
//   ⇒ 총합은 정확히 `totalSec` 로 보존된다(하네스 ③이 실측으로 확인한다).
// ── ★★[여름 2026-09-03 · T64] 여름 가중 — **추위 가중의 거울** ────────────────
//   `zone.seasonColdNow()` 는 겨울 1 · 봄가을 0.35 · 여름 0 을 답한다(ctx.seasonCold).
//   더위는 그 반대인데, **계절 표를 두 벌 두지 않는다** — 어깨 계절(봄·가을)은 추위와
//   **같은 무게**이고 양 끝만 뒤집으면 그게 곧 거울이다:
//       겨울 1 → 0   ·   봄가을 0.35 → 0.35   ·   여름 0 → 1
//   ⇒ 새 계절 표도, 새 상수도 없다. 계절의 정본은 여전히 `events.seasonOf` 하나다.
//   ⚠거울이 성립하려면 추위 표의 양 끝이 1/0 이어야 한다 — `test-body` 가 네 계절 전수로
//     그 정합을 못 박는다(추위 쪽 수를 누가 바꾸면 거기서 빨개진다).
function seasonHeatOf(seasonCold) {
  const sc = Math.max(0, Math.min(1, Number(seasonCold) || 0));
  return sc <= 0.01 ? 1 : (sc >= 0.99 ? 0 : sc);
}
// ── ★★[T64] 더위 갈증 배율 — 갈증 감쇠에 **곱 하나**로 걸린다 ────────────────
//   · 낮에만. 밤은 정확히 1 이다(한반도 여름밤도 덥지만, 그건 온도 축의 이야기고
//     이 카드는 "해 아래 있는가"만 본다 — 새 입력을 안 만든다).
//   · **그늘이면 없다.** 그늘 술어는 `ctx.indoor` 하나다(이미 넘어온다 · 새 술어 0).
//     ⚠숲 그늘은 **안 넣었다** — `wind.js` 의 `fsh`(숲 차폐 0..1)가 정본인데 그걸 꺼내려면
//       그 파일을 여는 접근자 한 줄이 필요하고, 그건 이 카드의 접촉 밖이다(회부).
//   · **W=0 이면 정확히 1** 을 돌려준다 — 되돌림 스위치이자 T56 비트 동일의 근거다.
function heatThirstMult(ctx) {
  const W = CFG.HEAT_THIRST_W;
  if (!(W > 0)) return 1;
  const c = ctx || {};
  // ★★**계절을 안 준 곳엔 여름이 없다.** `seasonCold` 는 안 주면 `undefined` 이고 그걸 0 으로
  //   읽으면 곧 "여름"이 된다 — 그 둘을 안 가르면 **계절을 안 넘기는 모든 호출이 조용히 한여름**이
  //   된다. 이건 상상이 아니다: 이 한 줄이 없을 때 `test-body ⑪`(갈증 만복→공복 24분)이 12분으로,
  //   `⑯㉧`(짠물 가속 = BRINE_MULT 정확히)가 ×2.458 로 뒤집혔다. 0(여름)과 무(無)는 다른 값이다.
  if (!Number.isFinite(c.seasonCold)) return 1;
  if (c.night) return 1;
  const shade = c.indoor ? 1 : 0;
  return 1 + W * seasonHeatOf(c.seasonCold) * (1 - shade);
}

function decayRate(g, totalSec) {
  const sp = Math.max(0.05, Math.min(0.95, CFG.DECAY_SPLIT));
  const tf = Math.max(0.05, Math.min(0.95, CFG.DECAY_TOP_FRAC));
  const gate = sp * 100;
  return (g > gate)
    ? (100 * sp) / (totalSec * tf)              // 위 절반
    : (100 * (1 - sp)) / (totalSec * (1 - tf)); // 아래 절반
}

// ── 단계(겉은 계단) — 전환에만 히스테리시스 ──────────────────────────────────
//   ★올라갈 땐 경계+H, 내려갈 땐 경계−H 를 넘어야 바뀐다. 그래서 경계에서 값이 떨려도
//     아이콘이 깜빡이지 않는다(`e2e-ui` 가 경계 진동을 실제로 넣어 확인한다).
function stageOf(p, axis, sev) {
  const b = ensure(p);
  const prev = b.stages[axis] || 0;
  const at = STAGE_AT[axis], H = CFG.STAGE_HYST;
  let s = prev;
  while (s < 3 && sev >= at[s] + H) s++;
  while (s > 0 && sev < at[s - 1] - H) s--;
  b.stages[axis] = s;
  return s;
}
// 지금 보여 줄 무들 — 심한 순, 최대 SHOW_MAX 개.
function moodles(p) {
  const sev = severity(p), out = [];
  for (const a of AXES) {
    const s = stageOf(p, a, sev[a]);
    if (s > 0) out.push({ axis: a, ko: KO[a], emo: EMO[a], stage: s, sev: +sev[a].toFixed(3) });
  }
  out.sort((x, y) => y.stage - x.stage || y.sev - x.sev);
  return out.slice(0, CFG.SHOW_MAX);
}

// ── 시간 진행 ────────────────────────────────────────────────────────────────
//   ctx: { day(게임일 — 연중 온도 곡선), elevKm(고도 — econ 감률), night, nearFire, indoor, warmth, villageShelter(0..1),
//         seasonCold(0..1 · day 없을 때의 폴백), moving, sprint, carryRatio, now }
//   ★**호출된 만큼만** 흐른다. 오프라인 따라잡기 없음.
function tick(p, dtSec, ctx) {
  if (!(dtSec > 0)) return;
  const b = ensure(p);
  const c = ctx || {};
  // ★★추위 — **평형 수렴**(재민 확정 2026-08-30). 주변이 목표점을 만들고 몸이 거기로 간다.
  //   종전은 누적식이라 노출이 조금만 있어도 결국 1 에 닿았다(적립금). 이제는 밤에 올랐다가
  //   **낮이 오면 해소 행동 없이도 내려간다** — 겨울엔 평형점 자체가 높아 옷·불이 필요하다.
  //   ★★[천장 해제 2026-08-31] **규약 한 줄: 상태는 0~1, 목표점은 무제한.**
  //     목표점이 1.2 면 몸은 1 에서 멈추되 (tgt − cold) 가 커서 **더 빨리** 거기 닿는다.
  //     새 속도 식을 짜지 않았다 — 아래 지수 수렴은 종전 그대로고, 위 `coldTarget` 의 클램프만 뺐다.
  const tgt = coldTarget(c);
  const k = 1 - Math.exp(-dtSec / Math.max(1, CFG.COLD_TAU_SEC));
  b.cold = Math.max(0, Math.min(1, b.cold + (tgt - b.cold) * k));   // ★상태는 여기서만 잘린다

  // ★★허기·갈증 — **상태 의존 감쇠**. 배부름은 금방 꺼지고 진짜 배고픔은 천천히 깊어진다.
  //   ★달리기 가속은 **없앴다**: 달리기의 대가는 이제 **스태미나**다(3층 재배선).
  //     종전엔 달리면 허기가 1.5배로 줄었는데, 그건 "달리기 = 식량 소모"라는 두 번째 벌이었다.
  const cm = 1 + CFG.COLD_HUNGER_EXTRA * b.cold;   // 추우면 에너지를 더 쓴다(허기만)
  const h0 = (p.hunger == null ? 100 : p.hunger);
  const t0 = (p.thirst == null ? 100 : p.thirst);
  p.hunger = Math.max(0, h0 - decayRate(h0, CFG.HUNGER_SEC) * dtSec * cm);
  //   ★[바닷물] 짠물 기운이 남아 있으면 갈증이 **더 빨리** 준다(확정적 · 새 축 없음).
  //   ★★[여름 2026-09-03 · T64] 그리고 **여름 낮에도 더 빨리 준다** — 곱 하나가 더 붙는다.
  //     두 배율은 곱해진다: 여름 낮에 짠물을 마시면 둘 다 걸린다(각각이 독립된 사실이다).
  const bm = (brineActive(p, c.now) ? CFG.BRINE_MULT : 1) * heatThirstMult(c);
  p.thirst = Math.max(0, t0 - decayRate(t0, CFG.THIRST_SEC) * dtSec * bm);

  // ★★★[캐논 변경 2026-09-01 · T44] 극단이면 **HP 가 아주 천천히 깎인다.**
  //   여기서는 **쌓기만** 한다 — 실제 피해는 `zone.js` 가 정본 경로(`damagePlayer`)로 낸다.
  //   그래야 HP 0 → 쓰러짐 사슬이 공짜로 따라오고, `body.js` 는 `p.hp` 를 직접 안 만진다.
  //   ★벗어나면 즉시 0: 아래 `rate === 0` 이면 이월분까지 버린다(빚이 따라다니지 않는다).
  {
    const er = extremeHpRate(p);
    if (er.rate > 0) b.hpDebt += er.rate * dtSec;
    else b.hpDebt = 0;
  }

  // ★★스태미나 — 달리면 줄고(짐이 무거우면 더), 서면 찬다(허기·갈증이 그 속도를 정한다).
  const load = Math.max(0, Number(c.carryRatio) || 0);
  if (c.sprint && c.moving) {
    const drain = (1 / CFG.STAM_SPRINT_SEC) * (1 + CFG.STAM_LOAD_W * load);
    b.stam = Math.max(0, b.stam - drain * dtSec);
    if (b.stam <= CFG.STAM_MIN) b.stamLock = true;      // 바닥 — 다시 차야 달린다
  } else {
    const rec = (1 / CFG.STAM_REST_SEC) * (c.moving ? CFG.STAM_MOVE_MULT : 1) * recoverMult(p);
    b.stam = Math.min(1, b.stam + rec * dtSec);
    if (b.stamLock && b.stam >= CFG.STAM_RESUME) b.stamLock = false;
  }
  // ★[T43 후유증] 상한을 넘겨 차지 않는다 — 죽고 며칠은 숨이 덜 붙는다(연속으로 풀린다).
  {
    const cap = staminaCap(p, c.day);
    if (b.stam > cap) b.stam = +cap.toFixed(4);
    // ★★[T56 2026-09-02] **화면이 후유증을 모른다** — T43 은 스태미나가 덜 차는 것만 보이게 두고
    //   "왜 숨이 덜 붙는지"는 아무 데도 안 실었다. 여기서 이미 구한 값을 **메모로** 남겨
    //   `selfPayload` 가 실어 보낸다(새 축·새 계산 0 — 이 두 수는 방금 이 자리에서 나왔다).
    //   ⚠**정본이 아니라 메모다.** 후유증의 정본은 `deadDay` 하나이고 `toSave` 는 그것만 쓴다.
    b._amCap = cap; b._amLeft = aftermathLeft(p, c.day);
  }
  // 피로 — 일하면 오르고(그건 onLabor 가 한다) 쉬면 내린다.
  let restMult = c.indoor ? CFG.FATIGUE_INDOOR_MULT : 1;
  if (c.moving) restMult *= CFG.FATIGUE_MOVE_MULT;
  b.fatigue = Math.max(0, b.fatigue - (dtSec / CFG.FATIGUE_REST_SEC) * restMult);
  // 부상 — 시간이 낫게 하고 약초가 재촉한다.
  const now = c.now || Date.now();
  const herb = (b.herbUntil || 0) > now ? CFG.INJURY_HERB_MULT : 1;
  b.injury = Math.max(0, b.injury - (dtSec / CFG.INJURY_HEAL_SEC) * herb);
  // 사기 — 좋은 걸 먹은 기억은 식는다.
  b.morale = Math.max(0, b.morale - dtSec / CFG.MORALE_SEC);
}

// ── 사건 훅 ──────────────────────────────────────────────────────────────────
function onLabor(p, weight) { const b = ensure(p); b.fatigue = Math.min(1, b.fatigue + CFG.FATIGUE_PER_LABOR * (weight || 1)); }
// ★확률이 아니라 **문턱**이다. 같은 상황이면 같은 결과 — 주사위 금지 원칙 정합.
function onDamage(p, dmg) {
  const b = ensure(p);
  const over = (dmg || 0) - CFG.INJURY_DMG;
  if (over <= 0) return 0;
  const add = Math.min(1, over * CFG.INJURY_PER_DMG);
  b.injury = Math.min(1, b.injury + add);
  return +add.toFixed(4);
}
function onEat(p, opts) {
  const b = ensure(p);
  const gain = (opts && opts.cooked) ? CFG.MORALE_COOKED : CFG.MORALE_RAW;
  b.morale = Math.min(1, b.morale + gain);
  return b.morale;
}
function onHerb(p, now) { const b = ensure(p); b.herbUntil = (now || Date.now()) + CFG.INJURY_HERB_MS; return b.herbUntil; }

// ── 전송 — 본인에겐 연속, 남에겐 단계만(§8.3) ────────────────────────────────
function selfPayload(p) {
  const b = ensure(p), e = effects(p);
  return {
    hunger: +(p.hunger == null ? 100 : p.hunger).toFixed(2),
    thirst: +(p.thirst == null ? 100 : p.thirst).toFixed(2),
    cold: +b.cold.toFixed(4), fatigue: +b.fatigue.toFixed(4),
    injury: +b.injury.toFixed(4), morale: +b.morale.toFixed(4),
    // ★[3층 재배선] 스태미나·회복 배율 — 화면이 "왜 못 뛰나 / 왜 안 낫나"를 말할 재료.
    stam: +b.stam.toFixed(4), stamLock: !!b.stamLock, canSprint: canSprint(p),
    recover: recoverMult(p), recoverParts: recoverParts(p),
    herb: (b.herbUntil || 0) > Date.now(),
    moveMult: e.moveMult, workMult: e.workMult, floored: e.floored,
    parts: e.parts.map((x) => ({ axis: x.axis, ko: x.ko, emo: x.emo, sev: x.sev,
      move: +x.move.toFixed(4), work: +x.work.toFixed(4) })),
    moodles: moodles(p),
    // ★[T56] 후유증 — 화면이 "며칠 더 숨이 덜 붙는다"를 말할 재료(무들 한 칸은 T55 뒤 · 회부).
    //   ★깨어 있는 몸의 마지막 틱이 남긴 값이다(위 `tick` 의 메모). 후유증이 없으면 `null` —
    //     0 을 보내면 화면이 "0일 남았다"는 없는 말을 하게 된다.
    aftermath: ((b._amLeft || 0) > 0) ? { days: +(b._amLeft).toFixed(2), cap: +(b._amCap).toFixed(4) } : null,
  };
}
// 남에게 보낼 것 — **단계뿐**. 외형 반영은 이번 범위 밖이라 소비자가 없지만,
// 전송 설계를 지금 정해 두지 않으면 나중에 연속값이 새어 나간다(§8.3 공학 확정).
function peerPayload(p) { return { moodles: moodles(p).map((m) => ({ axis: m.axis, stage: m.stage })) }; }

// 저장/복원 — 주기 저장(`SAVE_INTERVAL_MS`) 경로에 실린다.
function toSave(p) { const b = ensure(p); return { cold: +b.cold.toFixed(4), fatigue: +b.fatigue.toFixed(4), injury: +b.injury.toFixed(4), morale: +b.morale.toFixed(4), stam: +b.stam.toFixed(4), deadDay: Number.isFinite(b.deadDay) ? b.deadDay : null }; }
function fromSave(p, saved) {
  const b = ensure(p);
  if (!saved || typeof saved !== 'object') return b;
  for (const k of ['cold', 'fatigue', 'injury', 'morale', 'stam']) {   // ★[3층 재배선] 스태미나도 산다
    if (typeof saved[k] === 'number' && Number.isFinite(saved[k])) b[k] = Math.max(0, Math.min(1, saved[k]));
  }
  // ★[T43 후유증] 죽은 날은 **게임일**이라 0~1 클램프 대상이 아니다(위 루프에 넣으면 1 로 뭉개진다).
  if (Number.isFinite(saved.deadDay)) b.deadDay = saved.deadDay;
  return b;
}
// dirty — §8.3 "Δ>0.01 이면 갱신". 주기 저장의 판정에도 쓴다.
function dirtySince(p, snap) {
  const b = ensure(p), s = snap || {};
  if (Math.abs((p.hunger == null ? 100 : p.hunger) - (s.hunger == null ? 100 : s.hunger)) > CFG.DIRTY_EPS * 100) return true;
  if (Math.abs((p.thirst == null ? 100 : p.thirst) - (s.thirst == null ? 100 : s.thirst)) > CFG.DIRTY_EPS * 100) return true;
  for (const k of ['cold', 'fatigue', 'injury', 'morale']) {
    if (Math.abs((b[k] || 0) - (s[k] || 0)) > CFG.DIRTY_EPS) return true;
  }
  return false;
}
function snapshot(p) { const b = ensure(p); return { hunger: p.hunger, thirst: p.thirst, cold: b.cold, fatigue: b.fatigue, injury: b.injury, morale: b.morale }; }

module.exports = {
  CFG, CURVES, AXES, KO, EMO, STAGE_AT,
  lerpCurve, xWhereBelow, ensure, severity, effects, stageOf, moodles,
  RECOVER, EFFECT_AXES, RECOVER_AXES, recoverMult, recoverParts, canSprint, stamina, coldTarget, warmthInsC, decayRate,
  drinkBrine, brineActive,
  seasonHeatOf, heatThirstMult,   // ★[T64] 여름 갈증 배율 — 하네스·계측기가 **정본을 그대로** 부른다
  extremeHpRate, extremeAt, extremeness, takeHpDamage, DRAIN_AXES,
  startAftermath, aftermathLeft, staminaCap,
  tick, onLabor, onDamage, onEat, onHerb,
  selfPayload, peerPayload, toSave, fromSave, dirtySince, snapshot,
};
