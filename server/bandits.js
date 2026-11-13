// =============================================================================
// server/bandits.js — §11 도적 캐논 본체 이식 1파: 경제·수명주기 층
//   "도적은 스폰되지 않는다, 몰락한 사람들이다" (설계_실축화_1셀1m.md §11 인계 명세)
//
// 무엇(랩 전쟁실험실.html 5799~5955 도적 블록의 서버 어댑터 — 계수 verbatim·보정 금지):
//   · 원천① 마을 소멸(해체): 순감≥5일 && 식량<3일치 && 잔존≤min(20,피크×0.55), 정착 보호 365일
//     — 랩과 동일하게 *이 모듈의 일일 스캔이 해체를 판정*한다(villages.js에 별도 '소멸 이벤트'는
//     존재하지 않음 — econ 인구가 미끄러져 내려가는 것이 소멸의 실체. 전쟁 초토화도 같은 검출로 흡수).
//     잔존 40%(3~8명)가 econ 인구에서 이탈(splice — 부활·유령 금지)해 도적단 결성, 은거지=교역 길목.
//   · 원천② 절망 이탈: 행복<0.32 && 식량<인구×10일치 '새는 양동이' ≥15 → 30일마다 1명이 정보범위 내
//     *기존* 단 합류(단이 새로 생기진 않음 — 하한 없음).
//   · 원천③ 상시 소굴: 부팅 스캔(오지 스코어 = 마을 최소거리 + 교역로 거리×0.7 + 숲, 이격 250)으로
//     2~3곳 — 30~60일마다 4~6명 재결성(결정론 RNG: villageSeed 해시 — 시점·규모가 시드만의 함수).
//     토벌 격멸 = 소굴 영구 철거(재결성 없음) / 기근 자연 해산 = 소굴 존속(카운트다운 재개).
//   · 유지비 0.5/명/일·스톡0 10일→1명씩 아사·3명 미만 해산·약탈 장물 환산(식량류 50%/잡화 25%).
//   · econ 계약 훅(sim/economy-sim-v2.js에 이미 도달 — 여기서 배선만): world.banditRouteRisk(길목 쌍
//     raidProb·기대손실 +0.15) + world.onBanditLoot(장물 충전 + 피해 마을 _banditRisk EMA 학습
//     → v2 호위 요청 가중 ×(1+2×risk) → war-core 목책 증축까지 기존 사슬이 이어짐).
//   · 토벌: risk≥0.3 && 전사+사냥꾼≥3(≤6) && 400셀 내 → 원정(쿨 40일), 추상 판정(랩 동형 계수).
//
// 1파 범위 밖(2파 인계 — 실체 층): 소굴 주변 배회 NPC·캐러밴 요격 연출·고립 NPC 습격(랩
//   updateBandits 6674~ — 경제 효과는 econ 주사위가 전부라 연출 생략해도 수치 등가), 토벌 전사 실파견.
//   실체는 최소: 소굴·야영 마커 1종(clientCamps → welcome banditCamps + bandit_camps 방송).
//   wildlife 실체와 도적 조우 규칙은 캐논대로 미정의(무접점 유지).
//
// 가드레일(계약):
//   · ENABLE_BANDITS=0 → init/onGameTick 즉시 return: 완전 no-op(ENABLE_VILLAGES 관례).
//   · ENABLE_VILLAGES=0 이면 banditHost()가 영원히 null → 자동 휴면(도적은 마을 없이 정의 불가).
//   · econ 파일 무수정 — 훅은 world 객체 함수 설치뿐(serializeEcon 비대상 — 재부팅 시 재설치).
//   · 마을별 추적 카운터(_bdt*·_banditized)는 vil.econ(plain number)에 부착 — villages.js
//     serializeEcon이 자동 영속(랩은 랩 래퍼에 두지만 서버 래퍼는 비영속이라 econ이 올바른 자리).
//   · 소굴·단 상태는 zone-local-db bandit_state(존당 1행 JSON — 규모 미니: 소굴≤3·단 소수).
//
// 좌표: 전부 '셀'(1셀=1m 캐논·×32px=월드). 랩 좌표계와 단위 동일 — 계수 그대로 유효.
// 교역로 접근: villages.getRoute(캐러밴 코스그리드 A*·px 정점, 4셀 간격) 재사용 + 유한쌍 판정은
//   econ 주입 거리행렬(world._distMatrix) — 도달불능쌍(강·산 단절)은 경로도 교역도 없으니 스킵(정직).
// 교역로 '거리'는 코스해상도(4셀) L1 거리장(2패스 변환 — 랩 맨해튼 근사 동형)으로 O(1) 조회.
//
// 테스트 훅(운영 기본값 전부 무설정):
//   BANDIT_MINDAY  — 정착 보호기 오버라이드(기본 365). 스모크 전용.
//   BANDIT_FIXTURE=dissolve — 첫 데일리에 최빈곤 마을 해체 조건 강제(곳간 소거 — /tmp DB 전용).
// =============================================================================
'use strict';

const ENABLED = process.env.ENABLE_BANDITS !== '0'; // 기본 켜짐. '0'만 완전 no-op.

const SZ = 32;  // 셀 크기(px) — villages.js와 동일
const FG = 4;   // 교역로 거리장 해상도(셀) — villages DIST_STEP과 동일(경로 정점 간격 정합)

// ── 캐논 §11 계수(전쟁실험실.html 5809~5823 verbatim — 랩 동형, 소굴 위치가 곧 밸런스라 보정 금지) ──
const BDT_CONV = 0.4, BDT_GMIN = 3, BDT_GMAX = 8;              // 소멸 전환: 잔존 40%(3~8명)
const BDT_CRI_HAP = 0.32, BDT_CRI_FOOD = 10;                   // 위기일: 행복<0.32 && 식량<인구×10일치
const BDT_DIS_FALL = 5, BDT_DIS_FOOD = 3;                      // 해체: 순감 5일+ && 식량<3일치 && 잔존≤min(20,피크×0.55)
const BDT_MIN_DAY = parseInt(process.env.BANDIT_MINDAY || '', 10) || 365; // 정착 보호기(BANDIT_MINDAY는 테스트 전용) — ★[T984] 막는 것은 **마을 쪽 두 문**(해체 → 도적화 · 절망 이탈)뿐이다. 소굴 재결성(부팅 뒤 30~60일 · `BDT_DEN_CD0~1`)과 그 단의 길목 습격 · 행상 피살은 안 막는다(첫해에도 난다 — T951 · T984)
const BDT_EXO_D = 15, BDT_EXO_GAP = 30;                        // 절망 이탈: 양동이 15+ → 30일마다 1명
const BDT_UPKEEP = 0.5, BDT_STARVE = 10, BDT_CAP = 60;         // 일 소비 0.5/명·스톡0 10일→아사·비축 상한 60/명
const BDT_RT_R = 30, BDT_RT_X = 0.15, BDT_RAID_R = 450;                          // 교역로 30셀=길목(배치 점수) · ★BDT_RAID_R=450 약탈 사정거리(소굴서 원정 — 위험인지 발주가 흡수). 토벌 BDT_SUP_R=400 초과 → 원거리 소굴은 호위로 관리
const BDT_CAMP_BUF = 40, BDT_FENCE_F = 0.5, BDT_FENCE_G = 0.25;// 은거지 완충(영토반경+40) · 장물 환산(식량류 50%/잡화 25%)
const BDT_RISK_UP = 0.15, BDT_RISK_DK = 0.985;                 // _banditRisk: 피해 +0.15, 일 ×0.985(~46일 기억)
const BDT_SUP_TH = 0.3, BDT_SUP_N = 3, BDT_SUP_CD = 40, BDT_SUP_R = 400; // 토벌: 위험≥0.3·전사+사냥꾼≥3·400셀·쿨 40일
const BDT_DEN_SEP = 250, BDT_DEN_DV = 200;                     // 소굴 이격 250 · 마을 최소거리 하한(오지 전제)
const BDT_DEN_CD0 = 30, BDT_DEN_CD1 = 60, BDT_DEN_SZ0 = 4, BDT_DEN_SZ1 = 6, BDT_DEN_FOOD = 30; // 재결성 30~60일·4~6명·비축 30/명
// (BDT_BR_R 다리 가중·BDT_AMB_* 고립 습격은 1파 비대상 — 본체 다리 없음·실체 층은 2파)

const FIXTURE = process.env.BANDIT_FIXTURE || '';
// ★★[T577 2026-10-03] **고칠 자리 후보 둘 — 손잡이(기본 끔 · 끄면 종전 글자 그대로)** — 판정 0 · 재민이 고른다(보고/T577 §3).
//   빈 11곳(서울 사본)은 11/11 이 해체 표를 달았고, 셋 이상 마지막 날이 보호기(365) 끝난 그 달에 몰렸다(T572).
//   ⓐ `T577_CAND_WALK=1` — 해체 때 단이 되지 않은 **남은 사람이 가장 가까운 산 마을로 옮긴다**(지금은 그 자리에 남아 굶어 죽는다).
//      ⚠econ 몫만이다: 사람(npc 항목)을 그 마을 econ 으로 넘긴다 — 몸이 걸어가는 길은 없다(보고 §3-ⓐ 가 그 줄 수를 센다).
//      ★[T1022 정정] 위 괄호(“그 자리에 남아 굶어 죽는다”)와 ⚠ 줄은 그때 글자다. 끔(기본)에서 남은 사람은 그 자리에 남지만 다 굶어 죽지는 않는다 — 800날 판 자 24판(보호막 켬 · 끔 × 띠) 남은 231명 중
//        그 자리 굶음 123 · 판 끝까지 제 마을 77 · 행상 피살 18 · 절망 이탈 13 · 다른 마을 0(마을은 출생으로 다시 찬다 — 보고/T1022). 켬의 몸 걸음은 T765 가 세웠다(아래 T765 줄).
//   ⓓ `T577_RAMP` — 보호기 끝을 **마을마다 다른 날**로 편다: 365 + 시드 해시 × 365(둘째 해 안에 고르게).
//      새 수 0 — 퍼짐 폭은 보호기 그 자체(`BDT_MIN_DAY`)이고 해시는 이 파일의 결정론 RNG(`denRng`)다.
//      ★★[T577 추신 2026-10-03 · ★PM 결정 족보 537 · 재민 거부권] **정식 손잡이 · 기본 켬** — 끄는 것은 명시 `T577_RAMP=0`(= 종전 바이트).
//        이유(보고/T577 §2-3 · §3-ⓓ): econ 기아 보호막(`SHIELD_DAYS` 365)과 도적 보호기가 **같은 날** 걷혀 첫해 겨울 끝 굶는 마을이
//        한 주에 해체됐다(3시드 해체 51 중 39 가 day 375~394). 끔 판 빈 13 → 켬 판 1(시드 1020 · 800일).
const T577_WALK = process.env.T577_CAND_WALK === '1';
const T1075_HAPPY_EQ = process.env.T1075_HAPPY_EQ === '1';
const T1134_HAPPY_TARGET = process.env.T1134_HAPPY_TARGET !== '0';   // ★[T1147] 켬 기본   // ★[T1134] 켬 = 불행 이탈(h < 0.25)은 **더 행복한** 이웃만 받는다(받을 곳이 덜 행복하면 아무도 안 떠난다 · 소멸 0)   // ★[T1075 ④ · T1109] 켬 = 불행 이탈이 몸으로 걷는다(econ `world.t1075Emigrate` 문을 이 층이 단다 · 걷기 문 `walkToVillage` 하나 · 끔 = 문 없음 · 종전 바이트)
// ★★[T1039 2026-11-02 · T1022 회부 1 · 캐논 F7 "같은 몸" · ★재민 11-01 판정 "걸어간 몸이 단"(`walk` 정본 · `spawn` 대조 판)] **도적 전환 — 한 사람 몸 하나**.
//   손잡이 `T1039_BANDIT_BODY` — 값 `walk` | `spawn` · 없음(그 밖) = 종전 글자(아래 갈래 줄이 하나도 안 닿는다).
//   종전: 해체 그날 단이 서고(`GANGS` · 습격 길목 `pairSync`) · 그날 끝 `syncBodies` 가 은거지 곁에 단 몸 min(3, n) 을 **새로** 세운다 · 그 사람들의 마을 몸은
//     까닭 줄(T590 `bandit`)로 하루 2명씩 은거지까지 걸어 닿으면 거둬진다 ⇒ 몸 상한 ∞ 판에선 한 사람이 몸 둘(T1022 28/28 · `villages.js` T1039 머리글).
//   `walk` — 단은 **은거지에 닿아야** 선다. 해체 그 순간 단이 된 사람은 econ 에서 빠지고(종전 그대로) 단은 **길 위 장부**(`S.ROAD` — T765 `S.WALK` 그 꼴)에 든다:
//     몸은 그 자리에서 같이 떠난다(호스트 `t1039Depart`) · 닿는 날 = 장부 길 ÷ 하루 걸음(T681 ③) · 그날 단이 `GANGS` 에 들고(결성 비축 · 습격 길목은 그때부터)
//     걷던 몸이 단의 몸이 된다(호스트 `t1039Join` — 은거지 곁 새 몸 0). 가는 동안 단은 `GANGS` 밖이다 — 습격 0 · 토벌 표적 0 · 절망 이탈 합류 0 · 유지비 0(길 위 장부 · T765 정본 그 꼴 — 회부).
//     부팅 실체화(다시 뜸 · 몸은 비영속)는 종전 그대로 은거지에 세운다.
//   `spawn` — 단 · 단 몸은 종전 그대로 그날 선다 · 단 몸이 서는 그 틱에 단이 된 사람 몫의 마을 몸을 거둔다(호스트 `t1039Leave` — 떠남 표 · 순간이동 0 · 걷는 몸 0).
const T1039_BODY = (() => { const v = typeof process !== 'undefined' && !!process.env ? process.env.T1039_BANDIT_BODY : undefined; return v == null || v === '' ? 'walk' : (v === '0' ? '' : v); })();   // ★[PM land1038 · ★재민 11-01 "걸어간 몸이 단"] 켬 기본 = walk · 종전 = `=0` · 대조 `=spawn`
// ★★[T1078 2026-11-02 · ★재민 11-02 "도적과 은신처가 모두 맵 내에 실제로 보이는 거 맞지..? 추상 아니지?"] **도적 단원 전원이 몸** — 손잡이 `T1078_BANDIT_ALL`(T1184 켬 기본 · 명시적 `=0` 되돌림 · 끔 = 아래 갈래 줄이 하나도 안 닿는다 = 종전 글자).
//   종전: `syncBodies` 는 단마다 min(3, n)(`BDT_BODY_PER_GANG`) 몸만 은거지 곁에 세웠다(“연출 전용 · econ 무접촉”) — 나머지 사람은 숫자였다 · 몸이 맞아 죽으면 존이 30초 뒤 마을 광장에 되살렸다(순간이동).
//   켬: ★T1039 `walk` 갈래를 **함께 켠다**(켬이면 `T1039_BANDIT_BODY` 값과 무관하게 walk — `spawn` 은 은거지 곁 새 몸이라 “새 몸 0” 과 맞지 않는다 · 회부).
//     ① 단원 수 = 몸 수 — 상한 3 을 걷는다(`_t1078Cap` = n). 몸은 **걸어 들어오고**(해체 단 = T1039 walk 걸어온 몸 · 절망 이탈 = 그 마을 몸이 은거지까지 걸어 닿는 날 단의 몸 —
//        `noteBodyExit(…'desert'…, gid)` · 호스트 `t1078Walkers`/`t1039Join`) **걸어 나간다**(해산 = 남은 몸이 가장 가까운 산 마을로 걷는다 — T590 `move` 걸음 · 호스트 `t1078Out`).
//        새 몸은 둘만 선다 — 소굴 재결성(원천③ — 황야에서 사람이 나는 그 줄 · 그 사람 수만큼 소굴에) · 부팅 실체화(몸 비영속 — 종전 그대로 은거지에 n).
//     ② 몸이 죽으면 단 n −1(존 `damagePlayer` NPC 갈래 → `t1078Died` — 사람 · 짐승 · 화살) · 토벌 사살 · 굶어 죽음은 그 수만큼 은거지 몸이 그 자리에서 쓰러진다(`_t1078Trim`).
//        쓰러진 몸 = T590 ⓐ 그 문(`_bxDie` — 짐 절반 낙하 `deathDrop` · 누운 몸 · `corpseMs` 뒤 거둠). 단 기록(`g.n`)과 몸이 한 정본(몸 + 그 단으로 걷는 몸 ≤ n).
//     ③ 은거지 곁 일과 — 밤은 은거지에서 잠(`취침`) · 아침 창(농부 출근 창 `SCH_FARMW_R` 그 수)엔 단 비축이 그날 끼니를 댔으면 은거지에서 `식사` · 낮은 종전 배회(일터 = 은거지 둘레).
//        끼니 양은 종전 유지비 줄(`BDT_UPKEEP` × n) 그대로 — 몸은 그 사실을 보일 뿐이다(econ 사본 0 · 호스트 `t1078Life` · 존 `decideNpcBehavior` 문).
//   새 수 0 · 주사위 새 흐름 0 · econ(sim/) 무접촉.
// [T1184] 켬 기본 · 세 팔 모두 명시적 =0 으로 되돌린다.
const T1078_ALL = !(typeof process !== 'undefined' && process.env && process.env.T1078_BANDIT_ALL === '0');
const T1039_WALK = T1039_BODY === 'walk' || T1078_ALL, T1039_SPAWN = T1039_BODY === 'spawn' && !T1078_ALL;
// ★★[T1079 2026-11-02 · ★재민 11-02 판정대기 문 4 = ⓑ "은거지에 더미로 남는다" · 문 4-b = PM ㄱ "약탈 전투가 무기를 읽는다"] **은거지 = 실제 시설 · 짐 더미** — 손잡이 `T1079_BANDIT_CAMP`(T1184 켬 기본 · 명시적 `=0` 되돌림 · 끔 = 아래 갈래 줄이 하나도 안 닿는다 = 종전 글자).
//   ★T1078 켬 위에서만 선다(`T1078_BANDIT_ALL=1` 이 없으면 이 손잡이는 무동작 — 몸 없는 단에 시설만 서지 않게 · 회부).
//   ① 시설: 단이 은거지에 서는 그 순간(`_t1039Arrive` · 소굴 재결성 · 종전 결성 줄) 야영 터를 세운다 — 모닥불(존 건물 `campfire` · 은거지 칸 가운데 = 몸의 집 · 잠자리)과
//      짐 더미(존 건물 `chest` · 은거지 칸 모서리 — 그릇)다. 존 건물 행 문(`liveBuildRow` — 움집 · 곳간 완공과 같은 문)이라 클라에 보이고 DB 에 남는다(호스트 `t1079Pitch`).
//      그 자리에 옛 더미(흩어진 단이 두고 간 것)가 있으면 새 단이 그 더미를 잇는다(같은 행 · 안의 짐째 — 주워 간다).
//   ② 정본 하나: 단 기록의 숫자 칸 둘(`g.food` 식량 비축 · `g.arms` 무기 짐)을 걷는다 — 두 이름은 더미 칸(`pile.data.food` · `weapon` · `armor` …)을 읽고 쓰는 문이다(사본 0).
//      유지비 · 장물 · 토벌 어댑터(T476) · 로트 장부(T748 갱 줄)는 종전 글자 그대로 그 문을 지난다. 저장 줄(`bandit_state`)엔 그 두 칸을 안 싣는다(더미 행이 정본).
//   ③ 해산: 더미와 불은 그 자리에 남는다(주인 = 누구나 · 로트 장부째) · 싸워서 무너진 단(T476 소굴 전투)은 이긴 쪽이 종전 노획 길(T466 노획 → 운반 → 귀가 저장)로 가져간 뒤의 짐이 남는다.
//      남은 사람 제 무기(한 사람 한 자루 · 몸 있는 사람)는 몸 짐에 싣는다.
//   ④ 사라지던 남은 1 ~ 2명: 정보범위(절망 이탈 그 반경) 안 다른 단에 합류(몸은 그 은거지로 걷는다 — T1078 이탈 몸 문) · 없으면 가장 가까운 산 마을로 걸어가 주민(T765 길 위 장부 ·
//      `t765Join` — 출생 자리를 그 몸이 받는다 · 새 몸 0). 주민 될 사람 기록(econ 항목)은 단이 된 날 econ 에서 빠진 그 항목이다(해체 · 이탈 — `g.npc1079` · 사본 0).
//   ⑤ econ `_raidScrum` 도적 atk: 호스트 `world.banditArmed`(켬만 설치) = 손에 든 무기 수(`armsHeld`) → 든 사람 atk = 토벌 · 호위 식 `_escAtk` 그대로 · 맨손 = 그 식의 무기 0.
//   새 수 0 · 주사위 새 흐름 0.
const T1079_CAMP = T1078_ALL && !(typeof process !== 'undefined' && process.env && process.env.T1079_BANDIT_CAMP === '0');
// ★★[T1104 2026-11-03 · ★재민 11-02 "추상 아니지?"] **약탈 · 토벌을 맵 위 사건으로** — 손잡이 `T1104_BANDIT_WALK`(T1184 켬 기본 · 명시적 `=0` 되돌림 · 끔 = 아래 갈래 줄이 하나도 안 닿는다 = 종전 글자).
//   ★T1078 · T1079 켬 위에서만 선다(`T1078_BANDIT_ALL=1 T1079_BANDIT_CAMP=1` 이 없으면 무동작 — 몸 · 더미가 없는 단에 걸음만 서지 않게).
//   ① 약탈: 단은 은거지에 있다가 길목 표(`S.pairs` — 그 쌍의 첫 단 = econ 이 고르던 그 단)에 든 캐러밴이 길을 떠나면 그 길에서 은거지에 가장 가까운 정점(길목)으로
//      **단 몸이 다 걸어 나간다**(T590 걸음 · T681 ③ 걸음 장부 — 하루 걸음 = 존 걸음 × 하루 길이). 캐러밴 장부(T661 식 — 길이 × 지난 날 ÷ 구간 날)가 길목을 지나는 그날
//      단이 거기 서 있으면 econ 이 **그날 그 자리에서** 종전 식(`_raidScrum` · 손실 몫 · 노획)으로 치른다(econ 문 `world.banditMeet` → `_raidMeet`).
//      못 닿을 캐러밴(닿는 날 > 지나는 날)은 안 쫓는다 · 놓치면(장부가 먼저 지났다) 돌아온다. 사상 = 그 자리에서 쓰러진다(T1078 몸 맞춤 — 몸은 길목에 서 있다).
//      노획 = 싸운 단의 산 몸 짐(장물 환산 그대로 · 무기 짐 실물 그대로)에 → 은거지로 걸어 돌아와 더미에 내린다(종전 상한 `n × BDT_CAP` 그대로 · 넘친 것은 몸 짐에 남는다).
//   ② 토벌: 종전 결단(위험 · 전사+사냥꾼 · 400셀) 그대로 — 그 마을 전사 · 사냥꾼 몸이 은거지까지 **걸어서 간다**(종전 "도보 강행군 ~240셀/일" 날짜 셈을 걷어 냄 · 닿는 날 = 걸음 장부).
//      닿은 날 단이 은거지에 있으면 종전 식(Lanchester)으로 은거지에서 싸운다(단이 길목에 나가 있으면 돌아올 때까지 은거지에서 기다린다) · 원정 전사는 그 자리에 쓰러진다.
//      이겨서 단이 무너지면 산 원정 몸이 짐 더미를 싣는다(T466 노획 문 `_warLootLoad` — 몸마다 `CAP_KG`) · 집으로 걸어 와 곳간에 내린다(T423 내려놓기 문 `lootGive`) · 못 실은 것은 더미에 남는다.
//   새 수 0 · 주사위 새 흐름 0(econ 약탈은 그 판의 `v1.srand` 차례 · 토벌은 종전 `_rb` 그대로).
const T1104_WALK = T1079_CAMP && !(typeof process !== 'undefined' && process.env && process.env.T1104_BANDIT_WALK === '0');
const T577_RAMP = process.env.T577_RAMP !== '0';   // ★[T577 추신] 기본 켬
const T1187_NAME_FREE = process.env.T1187_NAME_FREE === '1';   // ★[T1187] 아래 `_bdtOpenDay` 주석
function _t577Hash(name) { let h = 0; const s = String(name || ''); for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h >>> 0; }
function _bdtOpenDay(vil) {   // 이 마을의 보호기가 끝나는 날(끔이면 모두 BDT_MIN_DAY — 종전) · ★[T984] 이 날부터 그 마을이 해체 · 절망 이탈 문을 탄다(소굴 습격은 이 날과 무관)
  if (!T577_RAMP) return BDT_MIN_DAY;
  const key = T1187_NAME_FREE ? (vil ? ((vil.ccx | 0) + ',' + (vil.ccy | 0)) : '') : (vil && vil.name);   // ★[T1187] 켬 = 마을 자리(가운데 칸)로 흩는다 — 이름 무관
  return BDT_MIN_DAY + Math.floor(denRng(_t577Hash(key) % 100003, 577) * BDT_MIN_DAY);
}
// ★[T1187 2026-11-06 · 손잡이 `T1187_NAME_FREE`(econ 과 같은 손잡이 · 기본 끔)] 보호기 끝 날을 마을마다 흩는 열쇠 — 종전 = 마을 이름 해시(이름을 바꾸면 그 마을의 해체 · 이탈 문 여는 날이 바뀐다).
//   켬 = 마을 가운데 칸(ccx · ccy — 땅의 자리 · 같은 해시 · 같은 흩는 폭). 자리가 바뀌면(T1178 재배치) 그 자리로 다시 흩는다.
// ★★[T765 2026-10-15 · 세션1 · 추상 가2 F8 · 캐논 "몸 XOR 일괄 · 소멸 · 생성 금지"] **후보는 몸으로 걸어가 붙는다** — 손잡이 `T577_CAND_WALK=1` 안에서만.
//   종전 켬(T577 ⓐ + T590): 해체 그 순간 남은 사람의 econ 항목을 받는 마을 econ 에 **한꺼번에** 넣었다(일괄). 몸은 따로 하루 2명씩
//   (`POP_SYNC_PER_DAY`) 그 마을까지 걸었고, 닿으면 **거둬졌다**(소멸) — 받는 마을은 econ 수를 따라 집 앞에 **새 몸**을 세웠다(생성).
//   한 사람이 받는 마을 econ 에도(먹고 · 일하고) 길 위 몸에도 있었다.
//   이제: 남은 사람은 econ 에서 빠져 **길 위 장부**(`S.WALK` — 캐러밴 inbound 그 자리 · 보고/T577 §3-ⓐ 가 그린 그 꼴)에 든다.
//   몸은 그 자리에서 같이 떠난다(호스트 `t765Depart` — 명부 뒤에서 · 줄 선 까닭 몫은 남긴다 · 몸이 모자라면 장부만).
//   닿는 날 = 몸 걸음 장부 그대로(T681 ③: 하루 걸음 = 존 걸음 × 하루 길이 · 길 = 두 마을 교역로) — 그날 받는 econ 에 붙고(종전 두 줄 그대로),
//   걷던 몸은 그 마을 주민이 된다(호스트 `t765Join` — 출생 자리 `spawnOneNpc` 를 그 몸이 받는다 · 새 몸 0 · 거둠 0).
//   새 수 0 · 영속 = 도적 저장 줄(`walk` — 켬에서 장부가 있을 때만 칸이 선다) · 손잡이를 끈 채 다시 뜨면 남은 장부는 다음 하루에 그 마을에 붙는다(종전 켬 꼴).
function _t765Arrive(day) {   // 길 위 장부 — 닿은 사람을 받는 마을 econ 에 붙이고 몸을 주민으로(차례 = 떠난 차례)
  if (!S.WALK.length) return 0;
  let n = 0;
  const _life = _t1080On();   // ★[T1080 · T1108] 켬 — 길 위 하루(제 짐 먹기 · 늙기 · 받는 마을이 걷는 사이 해체 · 빔이면 다시 고르기)가 걷는 사람 모두(해체 남은 사람 · T1079 해산 몸)에 같다
  for (let i = 0; i < S.WALK.length; i++) {
    const w = S.WALK[i];
    if (_life && (T577_WALK || w.t1079 || w.t1075) && w.lastDay != null && w.lastDay < day) {   // 길 위 칸이 선 장부만(떠날 때 켬이었던 줄 — `_walkLife`)
      if (_walkRoadDay(w, day)) { S.WALK.splice(i--, 1); continue; }   // 짐이 떨어져 굶어 죽었다 — 어느 마을에도 안 붙는다(몸은 그 자리에 눕는다)
    }
    if ((T577_WALK || w.t1079 || w.t1075) && !(w.ppd > 0 && (day - w.d0) * w.ppd >= w.len - 0.5)) continue;   // 아직 길 위(걸음 장부 · `_t681Day` 의 그 닿음 식) · ★[T1079] 해산 몸의 주민 걷기도 이 식(끔 = `w.t1079` 없음)
    const to = S.host.villages.find((v) => v.dbId === w.to);
    if (!to || !to.econ) continue;
    if (w.lastDay != null && S.host.t1080Arrive) S.host.t1080Arrive(w, to);   // ★[T1080] 남은 제 짐은 받는 마을 곳간에
    if (w.t1079) { _t1079Arrive(w, to, day); S.WALK.splice(i--, 1); continue; }   // ★[T1079 ④] 해산한 도적이 마을에 닿았다(아래 종전 두 줄 · 붙기 문을 같이 쓴다)
    const npc = w.npc;
    if (w.lastDay == null && npc && Number.isFinite(npc.age) && day > w.d0) npc.age += (day - w.d0) / 365;   // ★[T1080] 길 위 칸이 선 줄은 날마다 늙었다(`_walkRoadDay` — 두 번 늙기 0)   // ★[T1049 ④] 길 위에서도 늙는다 — econ 하루 늙기(`economy-sim.js` `n.age += 1 / 365`)를 걸은 날 수만큼(장부 안은 econ 밖이라 종전엔 그 날들이 빠졌다 · 새 수 0)
    _econJoin(to, npc);
    if (to.econ._banditized) S.stats.t765IntoDis = (S.stats.t765IntoDis || 0) + 1;   // 걷는 사이 받는 마을도 해체됐다(그래도 그 마을에 붙는다 · 표에만)
    const joined = S.host.t765Join ? S.host.t765Join(w.pid, to, w.npc) : false;
    S.stats.t765Arrive = (S.stats.t765Arrive || 0) + 1;
    if (joined) S.stats.t765Joined = (S.stats.t765Joined || 0) + 1;
    const g = S.t765Rows && S.t765Rows.find((r) => r.d0 === (w.dep != null ? w.dep : w.d0) && r.fromId === w.from && r.toId === (w.to0 != null ? w.to0 : w.to));
    if (g) { g.arrived = (g.arrived || 0) + 1; g.joined = (g.joined || 0) + (joined ? 1 : 0); g.day1 = day; if (w.to0 != null && w.to0 !== w.to) g.rerouted = (g.rerouted || 0) + 1; }
    S.WALK.splice(i--, 1); n++;
  }
  if (n) log(day, `후보 ${n}명이 걸어서 닿았다 — 받는 마을 econ 에 붙음(길 위 남은 ${S.WALK.length}명) [T765]`);
  return n;
}
function _infoR(host) { return (host.world.infoRange || 400) / 2.5; }   // 절망 이탈이 단을 아는 반경(셀 · 종전 글자 그대로 한 자리로 — ★[T1079] 해산 남은 사람 합류가 같이 쓴다)
function _econJoin(to, npc) {   // 받는 마을 econ 에 사람 하나가 붙는다(종전 `_t765Arrive` 두 줄 그대로 · ★[T1079] 해산 몸의 주민 되기가 같이 쓴다)
  to.econ.npcs.push(npc);
  if (to.econ.counts && npc && npc.currentJob) to.econ.counts[npc.currentJob] = (to.econ.counts[npc.currentJob] || 0) + 1;
}
function _nearLive(vil, cx, cy) {   // 가장 가까운 산 마을(해체 표 없는 곳) — T577 ⓐ 받는 마을 그 셈 · ★[T1078] 해산 몸이 걸어갈 마을도 이 셈(사본 0)
  let best = null, bd = 1e18;
  for (const v of S.host.villages) {
    if (v === vil || !v.econ || !v.econ.npcs.length || v.econ._banditized) continue;
    const d = Math.hypot(v.ccx - cx, v.ccy - cy);
    if (d < bd) { bd = d; best = v; }
  }
  return { best, bd };
}
// ★★[T1080 · T1108] **걷기 문 하나** — 길 위 장부(`S.WALK`)에 드는 사람은 모두 이 셋을 지난다(사본 0):
//   ⓐ `_walkLife(day, to, pack, why)` — 떠나는 그 순간 길 위 칸(떠난 날 · 처음 받는 곳 · 제 짐 · 허기 · HP · 마지막 하루 · 까닭) · 끔 = {} (종전 줄 그대로)
//   ⓑ `_walkRoadDay(w, day)` — 길 위 하루(`_t765Arrive` 머리): 가던 마을이 해체 · 빔이면 지금 자리에서 다시 고르고(호스트 `t1080Reroute`) ·
//      늙고 제 짐에서 먹고 굶주림 사다리(호스트 `t1080RoadDay`) · 굶어 죽으면 true
//   ⓒ 닿으면 남은 짐 → 받는 곳간(호스트 `t1080Arrive` — `_t765Arrive`)
//   쓰는 자리: 해체 남은 사람(`walkToVillage` ← `_t577Walk`) · T1079 해산 몸(`_t1079Home`) · T1075 불행 이탈(`walkToVillage` ← `_t1075Leave` · 표지 `t1075` · ★[T1109]).
//   켬 = `T1080_ROAD_LIFE`(호스트 · 켬 기본) — 바깥 손잡이(`T577_CAND_WALK` · `T1079_BANDIT_CAMP`)가 꺼져 있으면 장부가 안 차니 한 번도 안 불린다.
function _t1080On() { return !!(S.host && S.host.t1080On && S.host.t1080On() && S.host.t1080Pick && S.host.t1080RoadDay); }
function _walkLife(day, to, pack, why) { return _t1080On() ? { dep: day, to0: to, pack: pack || {}, h: 100, hp: 100, lastDay: day, why } : {}; }
function _walkRoadDay(w, day) {
  w.lastDay = day;
  const to0 = S.host.villages.find((v) => v.dbId === w.to);
  if (!to0 || !to0.econ || !(to0.econ.npcs.length > 0) || to0.econ._banditized) {   // 가던 마을이 해체 · 빔 — 지금 자리에서 길 거리로 다음 마을
    const rr = S.host.t1080Reroute(w, day);
    if (rr) { w.to = rr.to; w.d0 = day; w.len = rr.len; w.rr = (w.rr || 0) + 1; S.stats.t1080Reroute = (S.stats.t1080Reroute || 0) + 1; }
  }
  const ctxV = S.host.villages.find((v) => v.dbId === w.to) || S.host.villages.find((v) => v.dbId === w.from);
  if (S.host.t1080RoadDay(w, day, ctxV)) {
    S.stats.t1080Dead = (S.stats.t1080Dead || 0) + 1;
    if (w.t1079) { const st = _t1079St(); st.roadDead = (st.roadDead || 0) + 1; if (w.pid != null) _t1079Carry().delete(w.pid); }
    const g = !w.t1079 && S.t765Rows && S.t765Rows.find((r) => r.d0 === w.dep && r.fromId === w.from && r.toId === w.to0);
    if (g) { g.dead = (g.dead || 0) + 1; g.deadDay = day; }
    log(day, `길 위 ${w.t1079 ? '해산한 도적' : '후보'} 1명이 굶어 죽었다(떠난 지 ${day - (w.dep != null ? w.dep : w.d0)}날 · ${w.pid != null ? '몸이 그 자리에 누움' : '몸 없음'}) [T1080]`);
    return true;
  }
  S.stats.t1080RoadDays = (S.stats.t1080RoadDays || 0) + 1;
  return false;
}
function _t577Walk(vil, day) {   // ⓐ 남은 사람 → 가장 가까운 산 마을(해체 표 없는 곳 우선) · econ 항목 이동
  const e = vil.econ; if (!e || !e.npcs.length) return 0;
  return walkToVillage(vil, e.npcs.slice(), day, 'dissolve');
}
// ★★[T1075 ④ · ★[T1109] 걷기 문 하나 위로] 불행 이탈 한 사람 — econ 이 고른 사람(가장 젊은 자유민)이 **몸으로** 이웃 마을까지 걷는다.
//   문은 해체 남은 사람과 같은 `walkToVillage`(받는 마을 고르기 · 명부에서 빼기 · 제 짐 · 몸 걷기 · 길 위 하루 · 저장 줄 하나) · 까닭 'unhappy' · 장부 표지 `t1075`.
//   몸 문(`t765Depart`)이 없거나 받을 마을이 없으면 0 — econ 은 그 사람을 그대로 둔다(순간이동 0 · 소멸 0).
function _t1075Leave(econV, npc, day) {   // econ 이 그날(`day`)을 준다
  if (!S.host || !S.host.t765Depart) return false;
  const vil = S.host.villages.find((x) => x.econ === econV); if (!vil) return false;
  const _hOf = (x) => (x && x.econ && x.econ.lastStats && typeof x.econ.lastStats.happiness === 'number') ? x.econ.lastStats.happiness : null;
  const accept = T1134_HAPPY_TARGET ? (to) => { const a = _hOf(vil), b = _hOf(to); return a != null && b != null && b > a; } : null;   // ★[T1134] 더 행복한 마을만
  //   ★[T1147] 받는 곳 = 둘레 여럿(교역로 4일 안) 중 더 행복하고 받을 자리가 있는 곳(호스트 `t1147Pick` · 없으면 아무도 안 떠난다)
  const dest = (T1134_HAPPY_TARGET && S.host.t1147Pick) ? S.host.t1147Pick(vil) : undefined;
  if (dest === null) return false;
  return walkToVillage(vil, [npc], day != null ? day | 0 : (S.host.world ? S.host.world.day | 0 : 0), 'unhappy', accept, dest) > 0;
}
//   people = 그 마을 econ 명부에 지금 있는 사람 객체들(받는 마을을 고른 뒤에만 명부에서 뺀다 — 갈 곳이 없으면 아무것도 안 바꾸고 0).
//   켬 = 받는 마을은 길 거리(거리행렬 · 호스트 `t1080Pick`) 최근접 · 제 짐(호스트 `t1080Pack`)을 지고 떠난다 · 끔 = T765 그대로(곧은 거리 `_nearLive`).
function walkToVillage(vil, people, day, why, accept, dest) {   // dest = 호스트가 이미 고른 받는 마을(★[T1147] · 없으면 아래 종전 고르기)   // accept(받는 마을) → bool — 있으면 고른 마을이 그 술어를 지나야 떠난다(★[T1134] · 없으면 종전)
  const e = vil && vil.econ; if (!e || !people || !people.length) return 0;
  const unhappy = why === 'unhappy';   // ★[T1075] 불행 이탈 — 몸 문이 있을 때만(아래 몸 없는 옮김 갈래로 안 간다)
  if (unhappy && !S.host.t765Depart) return 0;
  const life = _t1080On();
  let best = null, bd = 1e18;
  if (dest) { best = dest; bd = Math.hypot(best.ccx - vil.ccx, best.ccy - vil.ccy); }
  else if (life) { const P = S.host.t1080Pick([{ vil, off: 0 }], new Set([vil])); if (P) { best = P.vil; bd = Math.hypot(best.ccx - vil.ccx, best.ccy - vil.ccy); } }
  else ({ best, bd } = _nearLive(vil, vil.ccx, vil.ccy));
  if (!best) return 0;
  if (typeof accept === 'function' && !accept(best)) return 0;   // ★[T1134] 받을 곳이 받지 않으면 아무것도 안 바꾼다
  if (S.host.t1302Prepare) S.host.t1302Prepare(vil);   // newborns may emigrate in their birth tick; establish their own bodies first
  const set = new Set(people), moved = [];
  for (let i = e.npcs.length - 1; i >= 0; i--) if (set.has(e.npcs[i])) moved.unshift(e.npcs.splice(i, 1)[0]);
  if (!moved.length) return 0;
  if (S.host.t765Depart) {   // ★[T765] 길 위 장부 — econ 은 닿는 날 붙는다(`_t765Arrive`) · 몸은 지금 같이 떠난다
    for (const npc of moved) if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1);
    const L = S.host.t765Depart(vil, best, moved.length, moved);
    const PK = life && S.host.t1080Pack ? S.host.t1080Pack(vil, moved.length) : null;   // ★[T1080] 제 짐(그 곳간 먹을 것을 고르게 · 25kg 까지)
    for (let i = 0; i < moved.length; i++) S.WALK.push(Object.assign({ npc: moved[i], from: vil.dbId, to: best.dbId, d0: day, len: L.len, ppd: L.ppd, pid: L.pids[i] != null ? L.pids[i] : null },
      unhappy ? { t1075: 1 } : {}, _walkLife(day, best.dbId, PK ? PK.bags[i] : null, why)));
    if (unhappy) {   // ★[T1075] 해체 셈(`t577Walk` · `t765Rows`)과 따로 센다
      S.stats.t1075Leave = (S.stats.t1075Leave || 0) + moved.length;
      log(day, `${vil.name} 불행 이탈 ${moved.length}명 → ${best.name}(${Math.round(bd)}셀) [T1075] — 몸 ${L.pids.length} · 길 ${Math.round(L.len / SZ)}셀 · 길 위 장부`);
      return moved.length;
    }
    S.stats.t577Walk = (S.stats.t577Walk || 0) + moved.length;
    (S.t765Rows || (S.t765Rows = [])).push({ d0: day, from: vil.name, fromId: vil.dbId, to: best.name, toId: best.dbId, n: moved.length, bodied: L.pids.length,
      cells: Math.round(bd), routeCells: Math.round(L.len / SZ), eta: L.ppd > 0 ? day + Math.ceil(Math.max(0, L.len - 0.5) / L.ppd) : null,
      ...(life ? { why, packFE: PK ? +PK.fe.toFixed(3) : 0, packKg: PK ? +PK.kg.toFixed(2) : 0 } : {}) });
    log(day, `${vil.name} 해체 뒤 남은 ${moved.length}명 → ${best.name}(${Math.round(bd)}셀) [T577 ⓐ] — 몸 ${L.pids.length} · 길 ${Math.round(L.len / SZ)}셀 · 길 위 장부(닿는 날 econ 에 붙음 · T765)`);
    return moved.length;
  }
  for (const npc of moved) {
    if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1);
    best.econ.npcs.push(npc);
    if (best.econ.counts && npc && npc.currentJob) best.econ.counts[npc.currentJob] = (best.econ.counts[npc.currentJob] || 0) + 1;
  }
  S.stats.t577Walk = (S.stats.t577Walk || 0) + moved.length;
  if (S.host.noteBodyExit) S.host.noteBodyExit(vil, 'move', moved.length, null, best);   // ★[T590] 몸은 그 마을까지 걷는다(도착 몸은 그 마을 출생이 세운다 — 회부)
  log(day, `${vil.name} 해체 뒤 남은 ${moved.length}명 → ${best.name}(${Math.round(bd)}셀) [T577 ⓐ]`);
  return moved.length;
}
// ★★[T766 2026-10-15 · 재민 "도적을 줄여야 하나?"] **해체 문 손잡이 — `T766_DISSOLVE_INCOMING=1`(기본 끔 = 종전 글자 그대로)**.
//   해체 조건 "식량 < 인구 × 3일치"(`BDT_DIS_FOOD`)의 식량은 곳간만 본다 — **그 마을로 오는 식량**은 안 본다(T727 회부 2).
//   켬: 곳간 식량에 오는 식량을 더해 문턱을 다시 본다(문턱 그대로 · 새 수 0). 오는 식량 = T727 관찰기가 이미 센 두 칸, 식량류(곳간 잣대 넷)만:
//     ⓐ 귀환 중 화물 — `state==='inbound'` · 집(`from`)이 이 마을 · `_returningRes` 가 식량류 → `_returningAmt`
//     ⓑ 장마당 대기 짐 — `_t707` 이 찍힌(정산 전) 캐러밴 · 도착(`to`)이 이 마을 · `giveRes` 가 식량류 → `_t707.give`(정산 때 이 마을 곳간에 든다)
//   끔이면 `_t766Held` 는 한 번도 안 불린다(조건 맨 끝 단락 평가) · 셈(`stats.t766Held`)도 안 선다 = main 바이트.
const T766_INCOMING = typeof process !== 'undefined' && !!process.env && process.env.T766_DISSOLVE_INCOMING === '1';
// ★★[T1143 2026-11-04 · ★재민 11-04 "해체 없도록 하자" · 족보 740] **NPC 마을은 해체 없음** — 손잡이 `T1143_NO_DISSOLVE`(켬 기본 · `=0` 만 끔 = 종전 바이트).
//   켬: 해체 문(아래 `daily` ① — 순감 5 · 곳간 3일치 미만 · 잔존 ≤ 13)을 **NPC 마을(`econ.founder` 없음 — 정본 `village-kin.js` `_isPlayer` 의 거울)** 은 안 탄다.
//     사람 마을(길드 · 창설자)은 종전 그대로 탄다(이 카드 밖). 근거: T1141 반사실 판 — 해체 문을 닫으면 해체된 9마을이 다 800날까지 산다(1 ~ 24명 골짜기 뒤).
//   절망 이탈 문(② · 같은 `daily`)은 손대지 않는다 — 그 문은 `n > BDT_GMIN`(3) 일 때만 1명씩 떠나 마을을 0 으로 못 만든다(문턱 글자가 이미 "마지막 사람들은 안 떠난다").
const T1143_NO_DISSOLVE = !(typeof process !== 'undefined' && !!process.env && process.env.T1143_NO_DISSOLVE === '0');
const T766_FOOD = { food: 1, fish: 1, meat: 1, cooked_food: 1 };   // 곳간 잣대(`daily` 의 fe)와 같은 넷
function incomingFood(world, e) {   // 이 econ 마을로 오는 식량(위 두 칸 · 읽기만)
  let a = 0;
  for (const c of (world && world.caravans) || []) {
    if (c._t707 && c.to === e && T766_FOOD[c.giveRes]) a += c._t707.give || 0;
    if (c.state === 'inbound' && c.from === e && c._returningRes && T766_FOOD[c._returningRes]) a += c._returningAmt || 0;
  }
  return a;
}
function _t766Held(world, vil, fe, n, day) {   // 켬 전용 — 오는 식량을 더하면 문턱을 넘나(넘으면 오늘 해체 안 함)
  const inc = incomingFood(world, vil.econ);
  if (!(fe + inc >= n * BDT_DIS_FOOD)) return false;
  S.stats.t766Held = (S.stats.t766Held || 0) + 1;
  log(day, `${vil.name} 해체 보류 — 곳간 ${fe.toFixed(1)} + 오는 식량 ${inc.toFixed(1)} ≥ ${n}명×${BDT_DIS_FOOD}일 [T766]`);
  return true;
}
// ★[T521] 단이 실물로 드는 품목 — econ 재화 이름 그대로(무기·갑옷·도구 셋 · 새 이름 0)
const ARMS_RES = new Set(['weapon', 'armor', 'tool', 'iron_tool', 'bronze_tool']);
function _t521On() { return typeof process !== 'undefined' && !!process.env && process.env.T521_GANG_ARMS === '1'; }
function armsHeld(g) { const w = (g && g.arms && g.arms.weapon) || 0; return Math.min(Math.max(0, g ? g.n | 0 : 0), w); }   // 손 = 한 사람 한 무기 // 테스트 전용(헤더 주석) — 운영 무설정
// ★★[T748 2026-10-14 · 손잡이 `T732_MOMENT_LOT` · ★[T778] 켬 기본(`=0` 끔) 안 — 끄면 이 파일은 곳간 장부를 싣지도 않는다(바이트 같음)] **갱 비축에도 로트가 있다.**
//   장물아비 환산 몫은 그 순간 얻은 것(장물아비가 내준 식량) · 결성 비축은 그 순간(씨앗) · 유지비는 오래된 것부터 — 줄은 `granary-lots` 의 갱 줄(몸 밖 · 갱 객체 칸 0).
//   토벌(T476)의 소굴 어댑터가 이 줄을 곳간처럼 뗀다(노획 레코드째 · 소굴 토벌 노획이 레코드 없는 줌이던 길 · T732 §2 끝 표).
const _T748_ON = (typeof process !== 'undefined' && !!process.env && process.env.T732_MOMENT_LOT !== '0');   // ★[T778] 켬 기본 · 되돌림 `=0`
let _glM = null;
function _gl() { if (!_T748_ON) return null; if (_glM === null) { try { _glM = { G: require('./granary-lots'), L: require('./lots') }; } catch (e) { _glM = false; } } return (_glM && _glM.L.momentOn()) ? _glM.G : null; }
// 부팅 — 복원한 갱의 줄을 꽂는다(저장 칸을 떼어 갱 줄로) · 줄이 없는 갱은 지금 비축을 씨앗 하나로(나이 모름 — 끔에서 켬으로)
function lotsBoot(G) { if (!G) return 0; let n = 0; for (const g of S.GANGS) { if (g._t748Lots) { G.gangLoad(g, g._t748Lots); delete g._t748Lots; n++; } else if (!G.gangOf(g) && (g.food || 0) > 0) G.gangIn(g, g.food, true); } return n; }

const S = {
  ready: false,
  zoneId: null,
  host: null,        // villages.banditHost(): { zoneId, villages, world, ta, getRoute, broadcast, seed, cellsW, cellsH }
  db: null,          // zone-local-db (require 캐시 = zone.js와 동일 인스턴스)
  denSeed: 1,
  seq: 1, denSeq: 1,
  DENS: [],          // {id,cx,cy,sc,dv,dr,gen,next,cleared}
  GANGS: [],         // {id,camp:{cx,cy},n,food,zero,born,home,why,lootN,lastLoot,den(소굴id|null),_sup:{vilDbId,eta,force,wep}|null,_supKill}
  ROAD: [],          // ★[T1039 walk] 은거지로 가는 단(켬만 찬다) — {g(단 — 아직 `GANGS` 밖), vid(떠난 마을 dbId), d0(떠난 날), len(장부 길 px), ppd(하루 걸음 px), pids(같이 걷는 몸)}
  WALK: [],          // ★[T765] 길 위 장부(켬만 찬다) — {npc(econ 항목 그대로), from·to(마을 dbId), d0(떠난 날), len(길 px), ppd(하루 걸음 px), pid(같이 걷는 몸|null)}
  pairs: new Map(),  // 'A|B'(econ name 정렬) → [gang,...] — econ 훅 O(1) 조회 테이블
  pairSig: '',
  _routes: null,     // { sig, pts:[{x,y}셀] } — 유한쌍 교역로 표본(마을 구성 변경 시만 재수집) · ★T453: 거리장을 만든 뒤 pts 는 null(서명만)
  routeField: null, routeFieldSig: '', // 코스해상도 L1 거리장
  lastDay: -1,
  campSig: '',
  _fixtured: false,
  stats: { gangs: 0, members: 0, peak: 0, conv: 0, exo: 0, loot: 0, lootAmt: 0, sup: 0, supDead: 0, starve: 0, disband: 0, dens: 0, denOcc: 0, denForm: 0, denClear: 0, log: [] },
};

function log(day, m) {
  if (S.stats.log.length < 500) S.stats.log.push('D' + day + ' ' + m);
  console.log(`[${S.zoneId}] 🏴 [도적] D${day} ${m}`);
}
// onBanditLoot은 villages econ 틱의 console 침묵 창(tickWorldV2 중 console.log 스왑) 안에서 불린다 —
// 링 버퍼엔 남지만 콘솔이 삼킴. 대기열에 쌓아 daily(침묵 창 밖) 진입 시 방출.
function queueLog(day, m) {
  if (S.stats.log.length < 500) S.stats.log.push('D' + day + ' ' + m);
  (S._pendingLogs || (S._pendingLogs = [])).push(`[${S.zoneId}] 🏴 [도적] D${day} ${m}`);
}

// ── 원천③ 결정론 RNG(랩 bdtDenRng 동형 — villageSeed+소굴id+세대 해시, Math.random 불사용) ──
function denRng(a, b) {
  let h = (S.denSeed ^ Math.imul(a + 1, 2654435761) ^ Math.imul(b + 101, 40503)) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// ★★[T350 2026-09-22 · 주사위 0] 이 파일은 **이미** 결정론 rng(`denRng`) 를 쥐고 있었다(원천③).
//   그런데 여덟 자리가 그걸 안 쓰고 `Math.random` 을 굴리고 있었다 — 누가 도적이 되나(주민 뽑기) ·
//   교전 피해 배분 · 실체 도적의 배회 자리. 전부 **세계를 움직인다**. 같은 흐름으로 모은다.
//   흐름은 모듈에 하나(할당 0) · 씨는 `S.denSeed`(이 파일의 그 씨)와 날·시도에서 난다 — 새 수 0.
const _SEED = require('./seed-rand');
const TB = require('./tick-budget');   // ★[T687] 한 틱 공용 예산(끔 = 제 예산 그대로)
const _diceB = _SEED.makeStream();
const _rb = _diceB.next;
let _bTick = 0;
// ★★[T742] 주사위 흐름의 차례 `_bTick` 은 메모리 전용이었다 — 다시 뜨면 0 부터 다시 세어 같은 날 · 같은 자리의 씨가 달라진다(누가 도적이 되나 · 피해 배분 · 실체 자리).
//   손잡이 `T742_ZONE_KEEP` 켬이면 마을 모듈의 T728 메타 행 이름표 칸으로 싣고 되돌린다(`villages.t742Bind` · 끔 = 무동작).
//   되돌린 값은 부팅이 몸을 다시 세운 **뒤**에 한 번 더 넣는다(`_bindRest`) — 몸 다시 세우기(`syncBodies` · 몸 층)가 차례를 먹어도 그 뒤 흐름은 멈추기 전과 같다.
let _bTickKeep = null;
try { const _V = require('./villages'); if (_V.t742Bind) _V.t742Bind('bandits.bTick', () => (_bTickKeep != null ? _bTickKeep : _bTick), (v) => { _bTick = (+v) >>> 0; _bTickKeep = _bTick; }); } catch (e) {}
function _bSeed(a, b) { _bTick = (_bTick + 1) >>> 0; _diceB.seed(_SEED.seedOf((S.denSeed >>> 0) || 1, a | 0, b | 0, _bTick, 0)); }

// =============================================================================
// 교역로 표본·거리장 — 랩 bdtRoutePts(getTradePath 캐시 재사용) 서버판.
//   유한쌍(거리행렬 finite)만 getRoute — 도달불능쌍은 A* 낭비·의미 둘 다 없음(교역 자체가 없음).
//   거리 조회는 4셀 그리드 2패스 L1 변환(맨해튼 — 랩의 맨해튼 근사와 동형) → O(1).
// =============================================================================
function _routeSig(host) { return host.villages.map(v => v.name).join(','); }
function routePts() {
  const host = S.host;
  const sig = _routeSig(host);
  if (S._routes && S._routes.sig === sig) return S._routes;
  const mat = host.world._distMatrix;
  const pts = [];
  for (let i = 0; i < host.villages.length; i++) {
    for (let j = i + 1; j < host.villages.length; j++) {
      if (mat && mat[i] && !isFinite(mat[i][j])) continue; // 도달불능쌍(강·산 단절) — 교역로 없음
      const p = host.getRoute(host.villages[i], host.villages[j]);
      if (!p) continue;
      for (let k = 0; k < p.length; k++) pts.push({ x: p[k].x / SZ, y: p[k].y / SZ }); // px→셀(정점 간격 4셀)
    }
  }
  S._routes = { sig, pts };
  S.routeField = null; // 거리장 재계산 트리거
  return S._routes;
}
function ensureRouteField() {
  let rp = routePts();
  if (S.routeField && S.routeFieldSig === rp.sig) return S.routeField;
  if (!rp.pts) { S._routes = null; rp = routePts(); }   // ★[T453 ③] 놓은 표본은 다시 모은다(아래 — 지금 길로는 안 닿는다 · 안전판)
  const F = _fieldBegin(rp);
  _fieldStep(F, Infinity);   // 한 번에 끝까지(종전과 같은 계산 · 같은 순서)
  return _fieldEnd(F);
}
// ★★[T655 2026-10-05] 거리장을 **재개형**으로 — 세 마디(표본 칸 찍기 · 전방 패스 · 후방 패스)를 줄 단위로 놓았다 이어 간다.
//   `deadline` 까지 하고 나온다(`Infinity` = 한 번에 · 종전 `ensureRouteField` 가 이 꼴). 같은 순서 · 같은 식 ⇒ 같은 배열(사본 0).
//   새 세계 첫 부팅 조각(T640 · 켬 기본)이 표본 뒤에 이걸 틱마다 민다 — "하루(한 번)에 몰아서 하는 일이 있으면 안 된다"(재민 10-05).
function _fieldBegin(rp) {
  const gw = Math.max(1, Math.ceil(S.host.cellsW / FG)), gh = Math.max(1, Math.ceil(S.host.cellsH / FG));
  return { rp, gw, gh, f: new Uint16Array(gw * gh).fill(0x7fff), ph: 0, k: 0 };
}
function _fieldStep(F, deadline) {
  const f = F.f, gw = F.gw, gh = F.gh, pts = F.rp.pts;
  if (F.ph === 0) {   // 표본 칸 = 0
    while (F.k < pts.length) {
      const p = pts[F.k++];
      const gx = Math.min(gw - 1, Math.max(0, Math.round(p.x / FG)));
      const gy = Math.min(gh - 1, Math.max(0, Math.round(p.y / FG)));
      f[gy * gw + gx] = 0;
      if ((F.k & 4095) === 0 && Date.now() >= deadline) return false;
    }
    F.ph = 1; F.k = 0;
  }
  if (F.ph === 1) {   // 전방 패스 — 줄 하나씩
    while (F.k < gh) {
      const y = F.k++;
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x; let v = f[i];
        if (x > 0 && f[i - 1] + 1 < v) v = f[i - 1] + 1;
        if (y > 0 && f[i - gw] + 1 < v) v = f[i - gw] + 1;
        f[i] = v;
      }
      if (Date.now() >= deadline) return false;
    }
    F.ph = 2; F.k = gh - 1;
  }
  if (F.ph === 2) {   // 후방 패스 — 줄 하나씩
    while (F.k >= 0) {
      const y = F.k--;
      for (let x = gw - 1; x >= 0; x--) {
        const i = y * gw + x; let v = f[i];
        if (x < gw - 1 && f[i + 1] + 1 < v) v = f[i + 1] + 1;
        if (y < gh - 1 && f[i + gw] + 1 < v) v = f[i + gw] + 1;
        f[i] = v;
      }
      if (Date.now() >= deadline) return false;
    }
    F.ph = 3;
  }
  return true;
}
function _fieldEnd(F) {
  const rp = F.rp;
  S.routeField = { f: F.f, gw: F.gw, gh: F.gh, empty: rp.pts.length === 0 };
  S.routeFieldSig = rp.sig;
  // ★[T453 ③ 2026-09-27] 표본(`pts` — 교역로 정점마다 {x,y} · 한반도 114만 개 · 힙 41.8MB)은 **이 거리장을 한 번 만들 때만** 읽힌다.
  //   다음 부름은 위 두 줄(서명 같음 → 거리장 그대로)에서 끝나고, 서명이 바뀌면 `routePts` 가 통째로 다시 모은다 ⇒ 붙들 까닭이 없다.
  //   서명만 남기고 놓는다(거리장·소굴 비트 동일 · 새 수 0 · 손잡이 0).
  rp.pts = null;
  return S.routeField;
}
function routeDistCells(cx, cy) { // 최근접 교역로 표본까지 L1 거리(셀) — 표본 없으면 1e9(랩 '경로 없음' 취급)
  const R = ensureRouteField();
  if (R.empty) return 1e9;
  const gx = Math.min(R.gw - 1, Math.max(0, Math.round(cx / FG)));
  const gy = Math.min(R.gh - 1, Math.max(0, Math.round(cy / FG)));
  const d = R.f[gy * R.gw + gx];
  return d >= 0x7000 ? 1e9 : d * FG;
}

// =============================================================================
// 은거지·소굴 배치 — 랩 bdtCampSpot/bdtDenScan 서버판(스코어·스텝 verbatim).
// =============================================================================
function territoryGuards() { // 전 마을 완충: 영토 반경(econ land.size×25 — war-core territoryOf 정합) + 40
  return S.host.villages.map(v => ({
    cx: v.ccx, cy: v.ccy,
    r: Math.sqrt(((v.econ && v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800)) / Math.PI) + BDT_CAMP_BUF,
  }));
}
function campSpot(ocx, ocy) { // 은거지 탐색: 옛 터 기준 나선 — 완충 밖·통행가능, 스코어=길목(30셀 내↑)+숲+고향 근접
  const host = S.host, ta = host.ta;
  const guards = territoryGuards();
  let best = null, bs = -1e9;
  for (let r = 26; r <= 230; r += 10) for (let a = 0; a < 360; a += 15) {
    const x = Math.round(ocx + Math.cos(a * Math.PI / 180) * r);
    const y = Math.round(ocy + Math.sin(a * Math.PI / 180) * r);
    if (x < 6 || y < 6 || x >= host.cellsW - 6 || y >= host.cellsH - 6) continue;
    if (ta.isBlocked(x, y)) continue;
    let ok = true;
    for (const g of guards) if (Math.hypot(x - g.cx, y - g.cy) < g.r) { ok = false; break; }
    if (ok) for (const b of S.GANGS) if (Math.hypot(x - b.camp.cx, y - b.camp.cy) < 30) { ok = false; break; }
    if (ok && S.ROAD.length) for (const q of S.ROAD) if (Math.hypot(x - q.g.camp.cx, y - q.g.camp.cy) < 30) { ok = false; break; }   // ★[T1039 walk] 가는 단의 은거지도 그 단의 자리다(종전 = 장부가 빈 판 · 이 줄 무동작)
    if (!ok) continue;
    const rd = routeDistCells(x, y);
    let sc = (rd <= BDT_RT_R ? (BDT_RT_R - rd) * 1.4 : -Math.min(60, (rd - BDT_RT_R) * 0.15)); // 길목 가점/감점
    if (ta.forestMult(x, y) > 1.2) sc += 14;  // 숲 엄폐(villages extractLandParams와 동일 숲 판정)
    sc -= r * 0.06;                            // 옛 터 언저리 선호
    if (sc > bs) { bs = sc; best = { cx: x, cy: y }; }
  }
  return best;
}
function denScan(day) { // ★원천③ 배치(부팅 1회): 오지 스코어 = min거리(마을, 캡500) + min거리(교역로, 캡400)×0.7 + 숲60
  const D = _denBegin(day);
  if (!D) return;
  _denStep(D, Infinity);   // 한 번에 끝까지(종전과 같은 계산 · 같은 순서)
  _denEnd(D);
}
// ★★[T655 2026-10-05] 소굴 격자 훑기를 **재개형**으로 — 줄(y) 하나씩 놓았다 이어 간다(같은 pass · 같은 y · 같은 x 순서 ⇒ 같은 후보 줄 · 같은 정렬 ⇒ 같은 소굴).
//   `deadline` 까지 하고 나온다(`Infinity` = 한 번에 · 종전 `denScan` 이 이 꼴).
function _denBegin(day) {
  const host = S.host;
  S.DENS = []; S.denSeq = 1;
  if (!host.villages.length) return null;
  const N = Math.max(host.cellsW, host.cellsH);
  return { day, t0: Date.now(), DEN_N: N >= 1200 ? 3 : 2, cand: [], pass: 0, y: 40 };   // 랩 규칙 그대로(N=1600→3) — 한반도 ~4063셀 → 3곳
}
function _denStep(D, deadline) {
  const host = S.host, ta = host.ta;
  while (D.pass < 3) {
    if (D.y === 40 && D.cand.length) break;   // 종전 `for (pass…; pass < 3 && !cand.length; …)` — 판을 열 때만 묻는다
    const DV = [BDT_DEN_DV, 140, 90][D.pass]; // 오지 하한 폴백(소형 맵 대비 — 본체는 pass0에서 끝남)
    if (D.y < host.cellsH - 40) {
      const y = D.y;
      for (let x = 40; x < host.cellsW - 40; x += 16) {
        let dv = 1e9;
        for (const v of host.villages) { const d = Math.hypot(x - v.ccx, y - v.ccy); if (d < dv) dv = d; }
        if (dv < DV) continue;                 // 오지 하한(먼저 — 값싼 필터)
        if (ta.isBlocked(x, y)) continue;
        let dr = routeDistCells(x, y);
        if (dr > 1e8) dr = 600;                // 교역로 자체가 없음 → 상수 취급(랩 동일)
        const sc = Math.min(dv, 500) + Math.min(dr, 400) * 0.7 + (ta.forestMult(x, y) > 1.2 ? 60 : 0);
        D.cand.push({ x, y, sc, dv, dr });
      }
      D.y += 16;
      if (Date.now() >= deadline) return false;
      continue;
    }
    D.pass++; D.y = 40;
  }
  return true;
}
function _denEnd(D) {
  const host = S.host, day = D.day, cand = D.cand;
  cand.sort((a, b) => b.sc - a.sc);
  for (const c of cand) {
    if (S.DENS.length >= D.DEN_N) break;
    let ok = true;
    for (const d of S.DENS) if (Math.hypot(c.x - d.cx, c.y - d.cy) < BDT_DEN_SEP) { ok = false; break; }
    if (ok) S.DENS.push({ id: S.denSeq++, cx: c.x, cy: c.y, sc: Math.round(c.sc), dv: Math.round(c.dv), dr: Math.round(c.dr), gen: 0, next: 0, cleared: 0 });
  }
  S.stats.dens = S.DENS.length;
  for (const d of S.DENS) log(day, `소굴#${d.id} 배치(${d.cx},${d.cy}) 오지점수 ${d.sc} — 마을거리 ${d.dv}·교역로거리 ${d.dr}${S.host.ta.forestMult(d.cx, d.cy) > 1.2 ? '·숲' : ''}`);
  console.log(`[${S.zoneId}] 🏴 [도적] 소굴 ${S.DENS.length}곳 배치 ${Date.now() - D.t0}ms (후보 ${cand.length}·그리드 ${host.cellsW}×${host.cellsH}셀)`);
}

// =============================================================================
// econ 훅 테이블·설치 — 랩 bdtPairSync/bdtInstallHooks 서버판.
//   훅은 world 함수 설치뿐(econ 파일 무수정·serializeEcon 비대상 — 재부팅 시 재설치).
// =============================================================================
function pairSync() { // 은거지↔마을쌍 경로 인접(30셀) 매핑 — 단 결성/해산·마을 구성 변경 때만 재계산
  const host = S.host;
  const sig = S.GANGS.map(b => b.id).join('|') + '#' + host.villages.map(v => v.name).join(',');
  if (sig === S.pairSig) return;
  S.pairSig = sig; S.pairs = new Map();
  if (!S.GANGS.length) return;
  const mat = host.world._distMatrix;
  for (let i = 0; i < host.villages.length; i++) {
    for (let j = i + 1; j < host.villages.length; j++) {
      const A = host.villages[i], B = host.villages[j];
      if (!A.econ || !B.econ) continue;
      if (mat && mat[i] && !isFinite(mat[i][j])) continue;
      const p = host.getRoute(A, B); // 캐시 히트(routePts가 이미 계산) — px 정점
      if (!p) continue;
      const gs = [];
      for (const b of S.GANGS) {
        let hit = false;
        for (let k = 0; k < p.length; k++) {
          const dx = p[k].x / SZ - b.camp.cx, dy = p[k].y / SZ - b.camp.cy;
          if (dx * dx + dy * dy <= BDT_RAID_R * BDT_RAID_R) { hit = true; break; }   // ★약탈 사정거리(소굴서 원정)
        }
        if (hit) gs.push(b);
      }
      if (gs.length) {
        const k = A.econ.name < B.econ.name ? A.econ.name + '|' + B.econ.name : B.econ.name + '|' + A.econ.name;
        S.pairs.set(k, gs);
      }
    }
  }
}
function installHooks() { // econ 계약 훅(★v2 주사위는 이미 서버 도달 — 여기서 배선만. 도적 0이면 risk 0 = 완전 무해)
  const world = S.host.world;
  world.banditRouteRisk = (va, vb) => {
    if (!S.GANGS.length) return 0;
    const k = va.name < vb.name ? va.name + '|' + vb.name : vb.name + '|' + va.name;
    return S.pairs.has(k) ? BDT_RT_X : 0;
  };
  world.banditGang = (va, vb) => {   // ★[de-abstract] 길목 실재 갱 반환 → econ v2가 per-entity 약탈 전투에 사용(주사위 대체·랩 동형)
    if (!S.GANGS.length) return null;
    const k = va.name < vb.name ? va.name + '|' + vb.name : vb.name + '|' + va.name;
    const gs = S.pairs.get(k);
    return gs && gs.length ? gs[0] : null;
  };
  if (T1079_CAMP) world.banditArmed = (g) => armsHeld(g);   // ★[T1079 ⑤] econ `_raidScrum` 이 단의 무기 짐을 읽는 문(손에 든 수 · 끔 = 설치 0 → econ 종전 atk 19)
  if (T1104_WALK) world.banditMeet = (c, day) => _t1104Meet(c, day);   // ★[T1104 ①] econ 캐러밴 하루마다 — 오늘 길목에서 그 캐러밴을 만난 단(끔 = 설치 0 → econ 종전 도착 판)
  world.onBanditLoot = (victim, other, res, amt, day, gang) => {   // ★[T1104] 여섯째 = 싸운 단(econ 이 준다 · 켬에서만 읽는다)
    if (!(amt > 0)) return;
    const k = victim.name < other.name ? victim.name + '|' + other.name : other.name + '|' + victim.name;
    const _walk = T1104_WALK && !!gang;   // ★[T1104] 켬 = 노획은 싸운 단의 몸이 나른다(길목 표의 단 몫 나눔 대신 그 단 하나)
    const gs = _walk ? [gang] : S.pairs.get(k);
    if (!gs || !gs.length) return;
    // ★★[T521 2026-09-29 · 캐논 "실물이 정본"] 팔 `T521_GANG_ARMS`(끔) — 턴 무기·갑옷·도구는 **장물아비에게 안 넘긴다**:
    //   실물 그대로 단의 짐(`g.arms` · 소굴 저장)에 든다. 손에 드는 것은 한 사람 한 무기(= min(인원, 무기) — 전쟁 계획·전투가 같은 규칙으로 읽는다).
    //   식량·잡화는 종전 그대로 환산(`BDT_FENCE_*`). 끔이면 이 줄은 한 번도 안 돈다(비트 동일).
    if (_t521On() && ARMS_RES.has(res)) {
      for (const g of gs) { if (_walk) _t1104Carry(g, res, amt / gs.length); else { const a = g.arms || (g.arms = {}); a[res] = +((a[res] || 0) + amt / gs.length).toFixed(6); } g.lootN++; g.lastLoot = day; }   // ★[T1104] 켬 = 몸 짐에(은거지에 닿아 더미로)
      victim._banditRisk = Math.min(0.6, (victim._banditRisk || 0) + BDT_RISK_UP);
      other._banditRisk = Math.min(0.6, (other._banditRisk || 0) + BDT_RISK_UP * 0.5);
      S.stats.loot++; S.stats.lootAmt += amt; S.stats.armsLoot = (S.stats.armsLoot || 0) + amt;
      queueLog(day, `약탈 ${victim.name}→${other.name} ${res} ${amt.toFixed(1)} → 단#${gs.map(g => g.id).join('·')} 실물(무기 짐 — 장물아비 안 거침)`);
      return;
    }
    const foody = res === 'food' || res === 'fish' || res === 'meat' || res === 'cooked_food' || res === 'vegetable';
    const gain = amt * (foody ? BDT_FENCE_F : BDT_FENCE_G); // 장물아비 수수료 환산
    if (_walk) { for (const g of gs) { _t1104Carry(g, 'food', gain / gs.length); g.lootN++; g.lastLoot = day; } }   // ★[T1104] 켬 = 장물 환산 몫을 몸 짐에(은거지 더미에 내릴 때 종전 상한 · 갱 줄)
    else {
    const _G = _gl(), _f0 = _G ? gs.map((g) => g.food) : null;   // ★[T748] 장물아비가 내준 순간 — 늘어난 몫만 갱 줄에(끄면 null)
    for (const g of gs) { g.food = Math.min(g.n * BDT_CAP, g.food + gain / gs.length); g.lootN++; g.lastLoot = day; }
    if (_G) gs.forEach((g, i) => { if (g.food > _f0[i]) _G.gangIn(g, g.food - _f0[i]); });
    }
    victim._banditRisk = Math.min(0.6, (victim._banditRisk || 0) + BDT_RISK_UP);      // 화주 학습 → 호위·전사·무기 수요 연쇄
    other._banditRisk = Math.min(0.6, (other._banditRisk || 0) + BDT_RISK_UP * 0.5);  // 맞은편 절반 학습(소문·목격)
    S.stats.loot++; S.stats.lootAmt += amt;
    queueLog(day, `약탈 ${victim.name}→${other.name} ${res} ${amt.toFixed(1)} → 단#${gs.map(g => g.id).join('·')} 장물 +${gain.toFixed(1)}`);
  };
}

// =============================================================================
// 결성·일일 순환 — 랩 bdtFormGang/banditDaily 서버판(로직 verbatim).
// =============================================================================
function _t1039Arrive(day) {   // ★[T1039 walk] 길 위 단 — 닿은 단을 세우고 걷던 몸을 단의 몸으로(차례 = 떠난 차례)
  let n = 0;
  for (let i = 0; i < S.ROAD.length; i++) {
    const r = S.ROAD[i];
    if (!(r.ppd > 0 && (day - r.d0) * r.ppd >= r.len - 0.5)) continue;   // 아직 길 위(T765 `_t765Arrive` 의 그 닿음 식)
    const g = r.g;
    S.GANGS.push(g);
    _gangSeedLot(g);   // ★[T748] 결성 비축 — 단이 선 그 순간(끄면 null) · ★[T1078] `formGang` 과 한 줄(사본 0 — test-moment-lot ⑨⑥ 의 “결성 · 재결성 두 자리”)
    if (T1079_CAMP) _t1079Pitch(g, day);   // ★[T1079] 은거지에 닿아 선 그 순간 — 야영 터(불 · 짐 더미)
    if (S.GANGS.length > S.stats.peak) S.stats.peak = S.GANGS.length;
    const want = _t1078Cap(g), got = [];   // ★[T1078] 켬 = n(상한 걷기) · 끔 = min(3, n) 그대로
    for (const pid of r.pids || []) {
      const p = S.host.t1039Join ? S.host.t1039Join(pid, got.length < want) : null;
      if (p) got.push(p);
    }
    if (got.length) _t1039Adopt(g, got);
    S.stats.t1039Arrive = (S.stats.t1039Arrive || 0) + 1;
    log(day, `도적단#${g.id} ${g.n}명 은거지(${g.camp.cx},${g.camp.cy})에 닿아 결성 — ${g.home}에서 ${day - r.d0}날 · 걸어온 몸 ${got.length}(단 몸 상한 ${want}) [T1039 walk]`);
    S.ROAD.splice(i--, 1); n++;
  }
  return n;
}
function _t1039Adopt(g, bodies) {   // 걸어온 몸이 단의 몸 — `syncBodies` 새 몸 줄(자리 씨 · 홈 · 일터 · 직업 표 · 몸 주사위 신원)을 **그 몸이 받는다**(T765 `_t765Join` 의 그 꼴 · 사본 0)
  const sp = S.host.spawnNpc, q = bodies.slice();
  S.host.spawnNpc = (o) => { const p = q.shift(); if (!p) return null; p.tribeId = o.villageId || null; p.tribeName = o.villageName || null; if (T1078_ALL) p.npcJob = o.npcJob || null;   // ★[T1078] 존 `spawnNpc` 의 직업 칸도(마을 농부 몸이 은거지에서 밭을 갈지 않게 — 끔 = 종전 글자)
    p.npcHomeX = o.npcHomeX != null ? o.npcHomeX : null; p.npcHomeY = o.npcHomeY != null ? o.npcHomeY : null; p.npcWorkX = o.npcWorkX != null ? o.npcWorkX : null; p.npcWorkY = o.npcWorkY != null ? o.npcWorkY : null; return p; };   // 존 `spawnNpc` 가 opts 로 세우는 칸만(그 몸은 선 자리 그대로)
  try { syncBodies(false, { gid: g.id, n: bodies.length }); } finally { S.host.spawnNpc = sp; }
}
function _gangSeedLot(g) { const _G = _gl(); if (_G) _G.gangIn(g, g.food, true); }   // 결성 비축 씨앗 — 해체 단이 서는 두 자리(종전 · T1039 walk 닿음)가 같이 쓴다
function formGang(vil, size, day, why) { // econ 인구에서 *살아있는* size명 이탈(사망 아님 — 부활·유령 금지)
  const e = vil.econ;
  if (!e || e.npcs.length < size || size < BDT_GMIN) return null;
  const camp = campSpot(vil.ccx, vil.ccy);
  if (!camp) { log(day, `${vil.name} 잔존자 이탈 — 은거지 후보 없음(그냥 흩어짐)`); return null; }
  _bSeed(vil.ccx, vil.ccy);   // ★[T350] 누가 도적이 되나 — 은거지 셀이 씨의 앞자리
  const _took = T1079_CAMP ? [] : null;   // ★[T1079] 단이 된 사람의 econ 항목(버리지 않고 단이 쥔다 — 주민 되기 · 끔 = null)
  for (let i = 0; i < size; i++) { // counts 증분 캐시 동기(killTrader 패턴)
    const k = (_rb() * e.npcs.length) | 0;
    const npc = e.npcs.splice(k, 1)[0];
    if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1);
    if (_took && npc) _took.push(npc);
  }
  const g = { id: S.seq++, camp, n: size, food: size * 6, zero: 0, born: day, home: vil.name, why, lootN: 0, lastLoot: day, den: null, _sup: null, _supKill: 0 };
  if (_took) g.npc1079 = _took;
  if (T1039_WALK && S.host.t1039Depart) {   // ★[T1039 walk] 단은 은거지에 닿아야 선다 — 길 위 장부 · 몸은 지금 같이 떠난다(종전 까닭 줄 `bandit` 대신)
    g.walk = 1;
    const L = S.host.t1039Depart(vil, camp, size);
    if (T1078_ALL) for (const pid of L.pids) { const p = S.host.players.get(pid); if (p) p._bdtGid = g.id; }   // ★[T1078] 걷는 몸도 그 단 사람이다(길에서 죽으면 단 n −1 · `t1078Died`)
    S.ROAD.push({ g, vid: vil.dbId, d0: day, len: L.len, ppd: L.ppd, pids: L.pids });
    S.stats.conv += size;
    S.stats.t1039Depart = (S.stats.t1039Depart || 0) + 1;
    const eta = L.ppd > 0 ? day + Math.ceil(Math.max(0, L.len - 0.5) / L.ppd) : null;
    log(day, `${vil.name} ${why} → 도적단#${g.id} ${size}명 은거지(${camp.cx},${camp.cy})로 떠남 — 몸 ${L.pids.length} · 길 ${Math.round(L.len / SZ)}셀 · 닿는 날 ${eta != null ? 'D' + eta : '없음'} [T1039 walk]`);
    return g;
  }
  S.GANGS.push(g);
  _gangSeedLot(g);   // ★[T748] 결성 비축 — 그 순간(씨앗 · 끄면 null)
  if (T1079_CAMP) _t1079Pitch(g, day);   // ★[T1079] 단이 선 그 순간 — 야영 터(불 · 짐 더미)
  if (T1039_SPAWN && BODIES_ON && S.host.t1039Leave) g._t1039Leave = { vil, n: size };   // ★[T1039 spawn] 마을 몸은 단 몸이 서는 그 틱에 거둔다(`syncBodies` · 비영속)
  else if (S.host.noteBodyExit) S.host.noteBodyExit(vil, 'bandit', size, camp);   // ★[T590] 몸은 은거지까지 걷는다(몸 층 · econ 무접촉)
  S.stats.conv += size;
  if (S.GANGS.length > S.stats.peak) S.stats.peak = S.GANGS.length;
  log(day, `${vil.name} ${why} → 도적단#${g.id} ${size}명 결성(은거지 ${camp.cx},${camp.cy})`);
  return g;
}
function applyFixture(day) { // BANDIT_FIXTURE=dissolve — 최빈곤(소형) 마을 해체 조건 강제(테스트 전용·/tmp DB)
  if (S._fixtured) return;
  S._fixtured = true;
  const foodOf = (e) => { const St = e.storage || {}; return (St.food || 0) + (St.fish || 0) + (St.meat || 0) + (St.cooked_food || 0); };
  let t = null;
  for (const vil of S.host.villages) {
    const e = vil.econ;
    if (!e || e.npcs.length < BDT_GMIN || e.npcs.length > 20) continue;
    if (!t || foodOf(e) < foodOf(t.econ)) t = vil;
  }
  if (!t) { log(day, '[FIXTURE] 대상 마을 없음(3~20명 마을 없음)'); return; }
  const e = t.econ;
  e._bdtPeak = Math.max(e._bdtPeak || 0, e.npcs.length * 3); // 피크 부풀림(잔존≤피크×0.55 통과)
  e._bdtFall = BDT_DIS_FALL;
  for (const r of ['food', 'fish', 'meat', 'cooked_food']) if (e.storage && e.storage[r]) e.storage[r] = 0;
  log(day, `[FIXTURE] ${t.name} 해체 조건 강제(곳간 소거·순감 ${BDT_DIS_FALL}일·피크 ${e._bdtPeak}) — BANDIT_MINDAY=${BDT_MIN_DAY}`);
}
function daily(day) { // 하루 1회(villages econ 틱 직후): 위기 추적→전환/이탈, 소굴 재결성, 유지비, 토벌, 훅 테이블 동기
  const host = S.host;
  if (S._pendingLogs && S._pendingLogs.length) { for (const m of S._pendingLogs) console.log(m); S._pendingLogs.length = 0; } // 침묵 창에서 쌓인 약탈 로그 방출
  if (FIXTURE === 'dissolve') applyFixture(day);
  if (S.WALK.length) _t765Arrive(day);   // ★[T765] 길 위 후보 — 닿은 사람부터 붙는다(장부가 빈 판 = 끔은 이 줄이 아무것도 안 한다)
  if (S.ROAD.length) _t1039Arrive(day);   // ★[T1039 walk] 은거지에 닿은 단부터 선다(장부가 빈 판 = 종전은 이 줄이 아무것도 안 한다)
  if (T1078_ALL) { for (const g of S.GANGS) _t1078Trim(g, 'other'); _t1078Gather(day); }   // ★[T1078] 도적 하루 밖에서 준 사람(econ 약탈 실전투 `_raidScrum` 의 도적 사상 — `gangO.n −= banditsKilled`)만큼 은거지 몸이 쓰러지고(해산 판정 앞 — 죽은 사람 몸이 걸어 나가지 않게) · 그 단으로 걷던 몸(절망 이탈)이 닿았으면 단의 몸(끔 = 이 줄 무동작)
  if (T1079_CAMP) for (const g of S.GANGS) _t1079Recs(g);   // ★[T1079] 준 사람만큼 사람 기록도(맨 뒤부터)
  for (const vil of host.villages) { // ── 위기 추적 + ①소멸 전환 + ②절망 이탈 (추적 카운터는 econ에 — serializeEcon 자동 영속) ──
    const e = vil.econ;
    if (!e) continue;
    const n = e.npcs.length;
    if (!n) continue;
    e._bdtPeak = Math.max(e._bdtPeak || 0, n);
    const St = e.storage || {}, fe = (St.food || 0) + (St.fish || 0) + (St.meat || 0) + (St.cooked_food || 0);
    const hap = e.lastStats ? e.lastStats.happiness : 0.5;
    const _open = _bdtOpenDay(vil);   // ★[T577 ⓓ] 끔이면 BDT_MIN_DAY 그대로
    e._bdtCri = (day >= _open && hap < BDT_CRI_HAP && fe < n * BDT_CRI_FOOD) ? (e._bdtCri || 0) + 1 : (e._bdtCri || 0) * 0.95; // 새는 양동이
    if (e._bdtLastN != null) {
      if (n < e._bdtLastN) e._bdtFall = (e._bdtFall || 0) + 1;
      else if (n > e._bdtLastN) e._bdtFall = Math.max(0, (e._bdtFall || 0) - 2); // 회복 시 두 배 차감
    }
    e._bdtLastN = n;
    if (day >= _open && !e._banditized && !(T1143_NO_DISSOLVE && !e.founder) && (e._bdtFall || 0) >= BDT_DIS_FALL && fe < n * BDT_DIS_FOOD
        && n >= BDT_GMIN && n <= Math.max(4, Math.min(20, (e._bdtPeak || n) * 0.55)) // 죽어가는 미끄럼+곳간 바닥+잔존 소수 = 해체
        && !(T766_INCOMING && _t766Held(host.world, vil, fe, n, day))) {   // ★[T766] 켬만 — 오는 식량이 문턱을 채우면 보류(끔 = 이 칸 무평가)
      const size = Math.min(n, Math.max(BDT_GMIN, Math.min(BDT_GMAX, Math.round(n * BDT_CONV))));
      if (formGang(vil, size, day, `해체(순감 ${e._bdtFall || 0}일·잔존 ${n}명·피크 ${e._bdtPeak || n})`)) {
        e._banditized = 1;
        if (T577_WALK) _t577Walk(vil, day);   // ★[T577 ⓐ] 끔이면 종전 그대로(남은 사람은 그 자리에)
      }
    } else if (S.GANGS.length && e._bdtCri >= BDT_EXO_D && day - (e._bdtExoAt || -999) >= BDT_EXO_GAP && n > BDT_GMIN) {
      const infoR = _infoR(host); // 이탈은 *기존 단 합류*만 — 정보범위 밖이면 안 떠남 · ★[T1079] 식은 `_infoR` 한 자리(해산 남은 사람 합류가 같이 쓴다)
      let bg = null, bd = 1e18;
      for (const g of S.GANGS) { const d = Math.hypot(g.camp.cx - vil.ccx, g.camp.cy - vil.ccy); if (d < bd) { bd = d; bg = g; } }
      if (bg && bd <= infoR) {
        const k = (_rb() * e.npcs.length) | 0;
        const npc = e.npcs.splice(k, 1)[0];
        if (e.counts && npc && npc.currentJob) e.counts[npc.currentJob] = Math.max(0, (e.counts[npc.currentJob] || 0) - 1);
        bg.n++; e._bdtExoAt = day; S.stats.exo++;
        if (T1079_CAMP && npc) (bg.npc1079 || (bg.npc1079 = [])).push(npc);   // ★[T1079] 이탈한 사람의 econ 항목도 단이 쥔다(주민 되기)
        if (host.noteBodyExit) { if (T1078_ALL) host.noteBodyExit(vil, 'desert', 1, bg.camp, null, bg.id); else host.noteBodyExit(vil, 'desert', 1, bg.camp); }   // ★[T590] 떠나는 몸은 그 단의 은거지까지 걷는다 · ★[T1078] 켬 = 단 번호를 달아 닿는 날 그 단의 몸(`_t1078Gather`)
        log(day, `${vil.name} 절망 이탈 1명 → 도적단#${bg.id}(${bg.n}명)`);
      }
    }
    if (e._banditRisk) e._banditRisk = e._banditRisk < 0.005 ? 0 : e._banditRisk * BDT_RISK_DK; // 위험 기억 감쇠
  }
  for (const dn of S.DENS) { // ── ③원천 소굴 재결성: 비면 카운트다운(30~60일·시드 해시) → 4~6명 ──
    if (dn.cleared) continue;
    if (S.GANGS.some(g => g.den === dn.id)) { dn.next = 0; continue; }
    if (!dn.next) { dn.next = day + BDT_DEN_CD0 + Math.floor(denRng(dn.id, dn.gen) * (BDT_DEN_CD1 - BDT_DEN_CD0 + 1)); log(day, `소굴#${dn.id} 재결성 카운트다운 — D${dn.next} 예정(${dn.gen + 1}대)`); continue; }
    if (day < dn.next) continue;
    const sz = BDT_DEN_SZ0 + Math.floor(denRng(dn.id, dn.gen * 7 + 3) * (BDT_DEN_SZ1 - BDT_DEN_SZ0 + 1));
    const g = { id: S.seq++, camp: { cx: dn.cx, cy: dn.cy }, n: sz, food: sz * BDT_DEN_FOOD, zero: 0, born: day, home: '황야', why: `주둔지 ${dn.gen + 1}대`, lootN: 0, lastLoot: day, den: dn.id, _sup: null, _supKill: 0 };
    S.GANGS.push(g); dn.gen++; dn.next = 0;
    if (T1078_ALL) g._t1078Born = sz;   // ★[T1078] 황야에서 난 사람 — 그 수만큼 그날 끝 `syncBodies` 가 소굴에 몸을 세운다(비영속 · 원천③ 그 줄)
    { const _G = _gl(); if (_G) _G.gangIn(g, g.food, true); }   // ★[T748] 재결성 비축 — 그 순간(씨앗 · 끄면 null)
    if (T1079_CAMP) _t1079Pitch(g, day);   // ★[T1079] 소굴 야영 터 — 그 자리에 흩어진 단의 옛 더미가 있으면 잇는다(안의 짐째)
    S.stats.denForm++;
    if (S.GANGS.length > S.stats.peak) S.stats.peak = S.GANGS.length;
    log(day, `소굴#${dn.id} 도적단#${g.id} ${sz}명 재결성(${dn.gen}대 — 비축 ${sz * BDT_DEN_FOOD})`);
  }
  for (let i = S.GANGS.length - 1; i >= 0; i--) { // ── 유지비·자기조절 + 토벌 교전 판정 ──
    const g = S.GANGS[i];
    const _f0 = g.food;
    g.food = Math.max(0, g.food - g.n * BDT_UPKEEP);
    { const _G = _gl(); if (_G && _f0 > g.food) _G.gangOut(g, _f0 - g.food); }   // ★[T748] 유지비 — 오래된 것부터(끄면 null)
    if (g.food <= 0) g.zero++; else g.zero = 0;
    if (T1078_ALL) _t1078Fed(g, _f0 > 0);   // ★[T1078] 오늘 끼니를 단 비축이 댔나 — 몸의 아침 `식사`(일과 · 보이는 것만)
    if (g.zero >= BDT_STARVE) { g.n--; g.zero = Math.max(0, g.zero - 5); S.stats.starve++; log(day, `도적단#${g.id} 굶주림 이탈 1명(${g.n}명 잔류)`); if (T1078_ALL) _t1078Trim(g, 'starve'); }   // ★[T1078] 머리글 “스톡0 10일→1명씩 아사” — 은거지 몸 하나가 그 자리에서 쓰러진다
    const _F = T1104_WALK ? _t1104SupAt(g, day) : ((g._sup && day >= g._sup.eta) ? g._sup : null);   // ★[T1104 ②] 켬 = 원정 몸이 은거지에 걸어 닿았고 단이 은거지에 있다(끔 = 종전 날짜 셈 그대로)
    if (_F) { // 토벌 교전(추상 판정 — 랩 동형 계수): 무장 원정대 우세, 도적 드물게 반격 전사
      const F = _F;
      const fvil = host.villages.find(v => v.dbId === F.vilDbId) || null;
      // ★[de-abstract] 토벌 = per-entity 실전투(추상 주사위 제거): 원정대 vs 갱 — hp100·atk=10+무기×0.2·Lanchester (랩 banditDaily 동형)
      const _eA = 10 + Math.round((((fvil && fvil.econ && fvil.econ._weapQ) || 0.42)) * 20), _bA = 19; // 원정 무장 atk / 도적 스킬3 atk≈19
      const _A = [], _B = [];
      for (let z = 0; z < Math.max(1, F.force); z++) _A.push(100);
      for (let z = 0; z < Math.max(1, g.n | 0); z++) _B.push(100);
      for (let rr = 0; rr < 400; rr++) {
        const _aL = [], _bL = [];
        for (let z = 0; z < _A.length; z++) if (_A[z] > 0) _aL.push(z);
        for (let z = 0; z < _B.length; z++) if (_B[z] > 0) _bL.push(z);
        if (!_aL.length || !_bL.length) break;
        const _dA = _A.map(() => 0), _dB = _B.map(() => 0);
        for (const z of _aL) _dB[_bL[(_rb() * _bL.length) | 0]] += _eA;
        for (const z of _bL) _dA[_aL[(_rb() * _aL.length) | 0]] += _bA;
        for (let z = 0; z < _A.length; z++) if (_A[z] > 0) _A[z] -= _dA[z];
        for (let z = 0; z < _B.length; z++) if (_B[z] > 0) _B[z] -= _dB[z];
      }
      const kills = (g.n | 0) - _B.filter(h => h > 0).length, _ed = Math.max(1, F.force) - _A.filter(h => h > 0).length; // 도적 사살·원정 전사(실전투 결과)
      g.n = Math.max(0, g.n - kills);
      if (T1078_ALL && kills > 0) _t1078Trim(g, 'sup');   // ★[T1078] 사살 = 은거지 몸이 그 자리에서 쓰러진다(짐 낙하 · 누운 몸)
      g._supKill = g.n < BDT_GMIN ? 1 : 0; // 이 교전이 3명 미만으로 깎았는가(소굴 철거 인과)
      S.stats.sup++;
      let vd = '';
      if (fvil) {
        const ev = fvil.econ;
        let _gone = 0;   // ★[T590] 실제로 빠진 수(마을 3명 하한에 걸리면 _ed 보다 적다)
        for (let z = 0; z < _ed && ev && ev.npcs.length > 3; z++) { // 원정 전사 = 실제 사상만큼 마을 NPC 사망
          const k = (_rb() * ev.npcs.length) | 0;
          const npc = ev.npcs.splice(k, 1)[0];
          if (ev.counts && npc && npc.currentJob) ev.counts[npc.currentJob] = Math.max(0, (ev.counts[npc.currentJob] || 0) - 1);
          S.stats.supDead++; _gone++;
          if (process.env.T1206_NAT_DEATH !== '0') ev._t1206Due = (ev._t1206Due || 0) + 1;   // ★[T1206 ③] 원정 전사도 부장(econ 같은 문 · 다음 날 경계)
        }
        if (T1104_WALK) _t1104SupDead(F, fvil, _gone, g, _A);   // ★[T1104 ②] 원정 몸이 은거지에서 쓰러진다(실전투에서 죽은 그 차례 · 몸이 모자란 몫만 종전 까닭 줄)
        else if (_gone && host.noteBodyExit) host.noteBodyExit(fvil, 'expedition', _gone, g.camp);   // ★[T590] 원정은 추상(몸이 안 나갔다) — 집에 선 몸이 그 소굴 쪽으로 걸어 나간다(그 밖 · 회부)
        if (_ed > 0) vd = ` · 원정 ${_ed}명 전사`;
      }
      if (fvil && fvil.econ) fvil.econ._banditRisk = Math.max(0, (fvil.econ._banditRisk || 0) * 0.4); // 토벌 후 안도
      log(day, `토벌⚔: ${fvil ? fvil.name : '(소멸 마을)'} 원정대(${F.force}명) vs 도적단#${g.id} → ${kills}명 사살${vd}(${Math.max(0, g.n)}명 잔존)`);
      if (T1104_WALK) _t1104SupWon(F, fvil, g, _A, day);   // ★[T1104 ②] 단이 무너졌으면(아래 해산 줄 앞 — 더미가 아직 이 단의 것) 산 원정 몸이 더미를 싣고 · 집으로 걷는다
      g._sup = null;
    }
    if (g.n < BDT_GMIN) { // 3명 미만 해산 + ★원천③ 해산 원인 분기: 토벌 격멸=영구 철거 / 자연 해산=존속
      S.GANGS.splice(i, 1);
      S.stats.disband++;
      log(day, `도적단#${g.id} 해산(${Math.max(0, g.n)}명 잔존 — 흩어짐)`);
      if (T1079_CAMP) _t1079Break(g, day);   // ★[T1079] 더미 · 불은 그 자리에 · 남은 사람은 다른 단으로 · 없으면 마을로 걸어가 주민
      if (g.den != null) {
        const dn = S.DENS.find(d => d.id === g.den);
        if (dn && !dn.cleared) {
          if (g._supKill) { dn.cleared = day || 1; S.stats.denClear++; log(day, `소굴#${dn.id} 철거 — 토벌대 격멸(영구 정리·재결성 없음)`); }
          else { dn.next = 0; log(day, `소굴#${dn.id} 존속 — 주둔 단 자연 해산(재결성 카운트다운 재개)`); }
        }
      }
    }
  }
  for (const vil of host.villages) { // ── 토벌 파견 결정(피해 학습 임계 — 전사·사냥꾼 수 기반 추상, 실파견은 2파) ──
    const e = vil.econ;
    if (!e || !S.GANGS.length) continue;
    if ((e._banditRisk || 0) < BDT_SUP_TH || day < (e._bdtSupCd || 0)) continue;
    const c = e.counts || {}, force = Math.round((c.warrior || 0) + (c.hunter || 0));
    if (force < BDT_SUP_N) continue;
    let bg = null, bd = 1e18;
    for (const g of S.GANGS) { if (g._sup) continue; const d = Math.hypot(g.camp.cx - vil.ccx, g.camp.cy - vil.ccy); if (d < bd) { bd = d; bg = g; } }
    if (!bg || bd > BDT_SUP_R) continue;
    if (force < bg.n) { e._bdtSupCd = day + 10; continue; }   // ★[튜닝] per-entity 실전투: 열세면 자살행군 회피 — 전력 보강 대기(10일 후 재검)
    const fN = Math.min(force, Math.max(BDT_SUP_N, Math.ceil(bg.n * 1.5))), wep = Math.min(1, ((e.storage && e.storage.weapon) || 0) / Math.max(1, fN));   // ★[튜닝] 갱 1.5배 파견(per-entity 격퇴 확보)
    if (T1104_WALK) bg._sup = _t1104SupGo(vil, bg, fN, wep, day);   // ★[T1104 ②] 켬 = 원정 몸이 은거지까지 걷는다(닿는 날 = 걸음 장부 · 아래 날짜 셈 대신)
    else bg._sup = { vilDbId: vil.dbId, eta: day + Math.max(1, Math.ceil(bd / 240)), force: fN, wep }; // 도보 강행군 ~240셀/일
    if (T1104_WALK && !bg._sup) continue; // [T1184] 몸을 파견하지 못했으면 장부 원정도 없다.
    e._bdtSupCd = day + BDT_SUP_CD;
    const sent = T1104_WALK ? _t1104SupOf(bg).force : fN;
    log(day, `${vil.name} 토벌대 ${sent}명 파견 → 도적단#${bg.id}(거리 ${bd | 0}셀)${T1104_WALK ? _t1104SupTxt(bg) : ''}`);
  }
  pairSync();
  if (T1104_WALK) { _t1104SupDay(day); _t1104Day(day); }   // ★[T1104] 원정 몸(돌아옴 · 단이 사라진 원정) · 단의 걸음(길목으로 나감 · 돌아옴 · 더미에 내림) — 길목 표가 오늘 것이 된 뒤
  S.stats.gangs = S.GANGS.length;
  S.stats.members = S.GANGS.reduce((a, g) => a + g.n, 0);
  S.stats.dens = S.DENS.filter(d => !d.cleared).length;
  S.stats.denOcc = S.DENS.filter(d => !d.cleared && S.GANGS.some(g => g.den === d.id)).length;
}

// =============================================================================
// 영속(zone-local-db bandit_state 1행 JSON) + 클라 마커(1종).
// =============================================================================
function _gSave(g) { const o = _gSave0(g); if (T1104_WALK && g.t1104) o.t1104 = g.t1104; return T1079_CAMP ? _t1079Save(g, o) : o; }   // ★[T1104] 단의 걸음 장부(켬만 칸이 선다)   // ★[T1079] 켬 = 더미가 정본(두 칸을 안 싣는다) · 사람 기록 · 끔 = 종전 글자
function _gSave0(g) { return { id: g.id, camp: g.camp, n: g.n, food: g.food, zero: g.zero, born: g.born, home: g.home, why: g.why, lootN: g.lootN, lastLoot: g.lastLoot, den: g.den != null ? g.den : null, _sup: g._sup || null, _supKill: g._supKill || 0 , arms: g.arms || undefined, walk: g.walk || undefined }; }   // ★[T1039] `walk` 칸은 켬에서 걸어 선 단만(종전 = undefined · JSON 에 안 선다)
function _walkRow(w) {   // 길 위 장부 한 줄의 영속 칸 — 저장 · 복원이 같은 꼴(★[T1079] 표지 · ★[T1080] 길 위 칸 — 둘 다 없으면 종전 줄 그대로)
  const o = { npc: w.npc, from: w.from, to: w.to, d0: w.d0, len: w.len, ppd: w.ppd };
  if (w.t1079) o.t1079 = 1;
  if (w.t1075) o.t1075 = 1;   // ★[T1075 · T1109] 불행 이탈 표지(끔 = 칸 없음)
  if (w.lastDay != null) Object.assign(o, { dep: w.dep, to0: w.to0, pack: w.pack || {}, h: w.h, hp: w.roadHp != null ? w.roadHp : w.hp, lastDay: w.lastDay, why: w.why, rr: w.rr || 0 });   // ★[T1203] 영속 칸 이름은 `hp` 그대로 — 장부 칸은 `roadHp`(저장 = 장부 줄 · 복원 = 저장 줄이 들어온다)
  return o;
}
function save(day) {
  try {
    const gangs = S.GANGS.map(_gSave);
    { const _G = _gl(); if (_G) for (let i = 0; i < gangs.length; i++) { const L = _G.gangDump(S.GANGS[i]); if (L) gangs[i]._t748Lots = L; } }   // ★[T748] 갱 비축 줄(켬만 칸이 선다)
    const _road = S.ROAD.length ? { road: S.ROAD.map((r) => ({ g: _gSave(r.g), vid: r.vid, d0: r.d0, len: r.len, ppd: r.ppd })) } : {};   // ★[T1039 walk] 길 위 단(켬에서 찰 때만 칸이 선다 · 몸 pid 는 비영속)
    const _walk = S.WALK.length ? { walk: S.WALK.map(_walkRow) } : {};   // ★[T1108] 저장 줄 하나(해체 · T1079 해산 같은 꼴 · 길 위 칸은 켬 줄에만)   // ★[T1079] 해산 몸의 주민 걷기 표식(켬만 · 끔 = undefined = JSON 에 안 선다)   // ★[T765] 길 위 장부(켬에서 찰 때만 칸이 선다 · 몸 pid 는 비영속)
    const _sups = (T1104_WALK && S.SUPS && S.SUPS.length) ? { sups: S.SUPS.map(_t1104SupSave) } : {};   // ★[T1104] 걷는 원정(켬에서 찰 때만 칸이 선다 · 몸 pid 는 비영속)
    S.db.upsertBanditState(S.zoneId, JSON.stringify({ seq: S.seq, denSeq: S.denSeq, dens: S.DENS, gangs, stats: { ...S.stats, log: undefined }, ..._walk, ..._road, ..._sups }), day);
    if (T1079_CAMP) _t1079Flush();   // ★[T1079] 더미 행(존 건물 data) — 바뀐 것만 DB · 클라에
  } catch (e) {
    console.error(`[${S.zoneId}] 🏴 [도적] 저장 실패(다음 날 재시도):`, e.message);
  }
}
function restore(row) {
  const d = JSON.parse(row.data);
  S.seq = d.seq || 1; S.denSeq = d.denSeq || 1;
  S.DENS = Array.isArray(d.dens) ? d.dens : [];
  S.GANGS = (Array.isArray(d.gangs) ? d.gangs : []).map(g => ({ ...g, _sup: g._sup || null, _supKill: g._supKill || 0 }));
  if (d.stats) Object.assign(S.stats, d.stats, { log: S.stats.log });
  if (T1079_CAMP) for (const g of S.GANGS) if (g.t1079) _t1079Relink(g);   // ★[T1079] 더미 행을 다시 잇는다(그 자리 · 그 단 표식 — 존 건물 행 문)
  if (Array.isArray(d.road)) S.ROAD = d.road.map((r) => ({ g: { ...r.g, _sup: r.g._sup || null, _supKill: r.g._supKill || 0 }, vid: r.vid, d0: r.d0, len: r.len, ppd: r.ppd, pids: [] }));   // ★[T1039 walk] 다시 뜨면 몸 없이 장부만(닿는 날 단이 선다 · 걸어온 몸 0)
  if (T1104_WALK) S.SUPS = Array.isArray(d.sups) ? d.sups.map((F) => Object.assign({}, F, { pids: [], bag: {} })) : [];   // ★[T1104] 다시 뜨면 몸은 마을에 다시 선다. 몸 결속 없는 원정은 T1184 하루 절에서 취소한다
  if (Array.isArray(d.walk)) S.WALK = d.walk.map((w) => { const r = Object.assign(_walkRow(w), { pid: null }); if (r.hp !== undefined) { r.roadHp = r.hp; delete r.hp; } return r; });   // ★[T1203] 저장 칸 `hp` → 장부 칸 `roadHp`   // ★[T1108] 복원 줄 하나 — 다시 뜨면 몸 없이 장부만(몸은 비영속) · `t1079` 표지 · 길 위 칸 그대로
  console.log(`[${S.zoneId}] 🏴 [도적] 복원: 소굴 ${S.DENS.length}곳(생존 ${S.DENS.filter(x => !x.cleared).length}) · 도적단 ${S.GANGS.length}(총원 ${S.GANGS.reduce((a, g) => a + g.n, 0)}) · 저장 day ${row.day}`);
}
function clientCamps() { // 마커 1종: 활동 단(n>0) + 빈 소굴(n=0, 재결성 대기 — 클라가 흐리게). 철거 소굴 제외.
  if (!S.ready) return null;
  const out = [];
  for (const g of S.GANGS) out.push({ x: Math.round(g.camp.cx * SZ + SZ / 2), y: Math.round(g.camp.cy * SZ + SZ / 2), n: g.n });
  for (const dn of S.DENS) {
    if (dn.cleared) continue;
    if (S.GANGS.some(g => g.den === dn.id)) continue;
    out.push({ x: dn.cx * SZ + SZ / 2, y: dn.cy * SZ + SZ / 2, n: 0 });
  }
  return out;
}
function broadcastCampsIfChanged() {
  const camps = clientCamps() || [];
  const sig = camps.map(c => c.x + ',' + c.y + ',' + c.n).join(';');
  if (sig === S.campSig) return;
  S.campSig = sig;
  try { S.host.broadcast({ type: 'bandit_camps', camps }); } catch (_) { }
}

// =============================================================================
// ★[2파 도적 실체 최소] 소굴·은거지 배회 NPC — 단(gang)당 min(3, n)명을 은거지 주변에 실체화.
//   경제 효과 0(연출 전용 — 약탈·위험은 econ 주사위가 전부, 이중계상 금지 계약). 이동은 기존 npcStep
//   배회 AI(홈=은거지·워크=은거지 둘레)에 위임 — dormant 패턴(캐러밴·마을 NPC와 동일 수명주기).
//   비영속: pid는 저장 안 함(부팅 시 단 상태에서 재실체화). BANDIT_BODIES=0 → 완전 생략(무해).
//   보류(계획서 판단): 캐러밴 요격 연출·고립 NPC 습격·토벌 실파견 — 수치 등가(econ 소유)라 후속 웨이브.
// =============================================================================
const BODIES_ON = process.env.BANDIT_BODIES !== '0';
const BDT_BODY_PER_GANG = 3;   // 단당 실체 상한(랩 '소굴 마커 주변 2~3명' — 규모 미니 유지)
function despawnBody(pid) {
  const { players, npcs, broadcast } = S.host;
  if (players && players.has(pid)) { players.delete(pid); npcs.delete(pid); try { broadcast({ type: 'player_left', pid }); } catch (_) { } }
}
// ★[T1039] `boot` = 부팅 실체화(걸어 선 단도 종전처럼 세운다) · `adopt` = { gid, n } — 그 단 하나만 · 새 몸 줄을 걸어온 몸 n 이 받는다(`_t1039Adopt` 가 존 문을 잠깐 바꿔 끼운다)
function syncBodies(boot, adopt) {
  if (!BODIES_ON || !S.host || !S.host.spawnNpc || !S.host.players) return;
  const players = S.host.players;
  if (!S.bodies) S.bodies = new Map(); // gangId → [pid,...]
  const liveG = new Map(S.GANGS.map(g => [g.id, g]));
  if (!adopt) for (const [gid, pids] of [...S.bodies]) { // 단 소멸·축소 회수 + stale 청소
    const g = liveG.get(gid);
    for (let i = pids.length - 1; i >= 0; i--) { if (!players.has(pids[i])) pids.splice(i, 1); }
    if (T1078_ALL) { _t1078Settle(g, gid, pids); continue; }   // ★[T1078] 단이 흩어졌으면 몸이 걸어 나가고 · 몸이 사람보다 많으면 그 수만큼 쓰러진다(지움 0)
    const want = g ? Math.min(BDT_BODY_PER_GANG, g.n) : 0;
    while (pids.length > want) despawnBody(pids.pop());
    if (!g && !pids.length) S.bodies.delete(gid);
  }
  for (const g of S.GANGS) { // 신규·증원
    if (adopt && g.id !== adopt.gid) continue;   // ★[T1039 walk] 걸어온 몸 받기 — 그 단 하나만
    const pids = S.bodies.get(g.id) || [];
    const want = adopt ? Math.min(_t1078Cap(g), pids.length + adopt.n) : T1078_ALL ? _t1078Want(g, pids, boot) : (T1039_WALK && g.walk && !boot) ? pids.length : Math.min(BDT_BODY_PER_GANG, g.n);   // ★[T1039 walk] 걸어 선 단은 새 몸 0(걸어온 몸이 단의 몸 · 부팅 실체화만 종전) · ★[T1078] 켬 = 새 몸은 부팅 · 소굴 재결성만(`_t1078Want`)
    const cx = g.camp.cx * SZ + SZ / 2, cy = g.camp.cy * SZ + SZ / 2;
    while (pids.length < want) {
      _bSeed(g.camp.cx, g.camp.cy);   // ★[T350] 실체 도적이 서는 자리 — 은거지 셀이 씨
      const a = _rb() * Math.PI * 2, r = 40 + _rb() * 80; // 홈=은거지 곁(±셀 몇), 워크=둘레 도넛(~2~15셀) — 배회 반경
      const wa = _rb() * Math.PI * 2, wr = 80 + _rb() * 400;
      let p = null;
      try {
        p = S.host.spawnNpc({
          x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r,
          name: '도적', villageId: 'bandit_den', villageName: '도적 은거지',
          npcHomeX: cx, npcHomeY: cy, npcWorkX: cx + Math.cos(wa) * wr, npcWorkY: cy + Math.sin(wa) * wr,
          skipHouse: true,
        });
      } catch (_) { break; }
      if (!p) break;
      p.simJob = 'bandit';   // 클라 이모지·구분(마을 simJob 경로 재사용 — npcPids 밖이라 마을 로직 무접촉)
      if (S.host.bodySh) p._sh = S.host.bodySh(`bandit_${g.id}_${p.pid}`);   // ★[T841] 몸 주사위 신원 = 판 씨 + (단 · 몸 번호) — T822 켬에서만(끔 = 호스트가 null · 이 줄 0)
      pids.push(p.pid);
      if (T1078_ALL) { p._bdtGid = g.id; p._t1078Fed = g.food > 0 ? 1 : 0; }   // ★[T1078] 이 몸은 이 단 사람(죽으면 n −1 · 일과 문)
    }
    if (pids.length) S.bodies.set(g.id, pids);
    if (g._t1039Leave) {   // ★[T1039 spawn] 단 몸이 선 그 틱 — 단이 된 사람 몫의 마을 몸을 거둔다(떠남 표 · 순간이동 0) · 몸을 못 세웠으면 종전 까닭 줄(걸어 나감)
      const L = g._t1039Leave; g._t1039Leave = null;
      if (pids.length) S.host.t1039Leave(L.vil, L.n, g.camp);
      else if (S.host.noteBodyExit) S.host.noteBodyExit(L.vil, 'bandit', L.n, g.camp);
    }
  }
  let tot = 0; for (const pids of S.bodies.values()) tot += pids.length;
  if (tot !== S._bodyN) { S._bodyN = tot; console.log(`[${S.zoneId}] 🏴 [도적] 배회 실체 ${tot}명(단 ${S.GANGS.length}곳 — 연출 전용·econ 무접촉)`); }
}

// ═══ ★★[T1078] 단원 = 몸 — 몸 쪽 문(손잡이 `T1078_BANDIT_ALL` 켬에서만 불린다 · 머리글 T1078 줄) ═══
//   한 정본: 단 기록 `g.n` 이 사람 수다. 몸은 그 사람의 몸이고 · 몸 + 그 단으로 걷는 몸 ≤ n 을 지킨다(몸 없는 사람 = 마을 가시 몸 상한 밖에서 온 사람 — 회부).
function _t1078Cap(g) { return T1078_ALL ? g.n : Math.min(BDT_BODY_PER_GANG, g.n); }   // 단 몸 상한 — 켬 = n(3 걷기) · 끔 = 종전 min(3, n)
function _t1078Want(g, pids, boot) {   // 이 단에 오늘 설 몸 — 부팅 실체화 = n(몸 비영속 · 종전 그대로 은거지에) · 그 밖 = 지금 몸 + 황야에서 난 사람(소굴 재결성)
  if (boot) return g.n;
  const b = g._t1078Born || 0; g._t1078Born = 0;
  return Math.min(g.n, pids.length + b);
}
function _t1078St() { return S.stats.t1078 || (S.stats.t1078 = { dead: {}, out: 0, join: 0 }); }   // 켬에서만 칸이 선다(끔 = 저장 줄 바이트 같음)
function _t1078Walkers(gid) { return S.host.t1078Walkers ? S.host.t1078Walkers().filter((w) => w.gid === gid) : []; }
function _t1078Die(g, pid, why) {   // 몸이 그 자리에서 쓰러진다 — T590 ⓐ 문(짐 절반 낙하 · 누운 몸 · `corpseMs` 뒤 거둠)
  const p = S.host.players.get(pid); if (!p) return false;
  p._bdtGid = undefined;
  if (S.host.t1078Die) S.host.t1078Die(p, why); else despawnBody(pid);
  const st = _t1078St(); st.dead[why] = (st.dead[why] || 0) + 1;
  return true;
}
function _t1078Trim(g, why) {   // 사람이 줄었다(토벌 사살 · 굶어 죽음 · 그 밖) — 몸 + 걷는 몸 > n 이면 그 수만큼 쓰러진다(은거지 몸부터 · 맨 뒤 = 가장 늦게 든 몸)
  const pids = (S.bodies && S.bodies.get(g.id)) || [];
  for (let i = pids.length - 1; i >= 0; i--) if (!S.host.players.has(pids[i])) pids.splice(i, 1);
  const walk = _t1078Walkers(g.id);
  let over = pids.length + walk.length - Math.max(0, g.n), k = 0;
  while (over > 0 && pids.length) { if (_t1078Die(g, pids.pop(), why)) k++; over--; }
  while (over > 0 && walk.length) { if (_t1078Die(g, walk.pop().pid, why)) k++; over--; }
  return k;
}
function _t1078Out(pid) {   // 흩어진 단의 몸 — 가장 가까운 산 마을로 걸어 나간다(T577 ⓐ 받는 마을 그 셈 · T590 `move` 걸음 — 닿으면 거둠 · 주민 되기는 T1079 ④ · T1080)
  if (T1079_CAMP) return _t1079Home(pid, null, null);   // ★[T1079 ④] 켬 = 그 마을까지 길 위 장부로 걸어 닿는 날 내린다(몸 짐 무기 → 그 마을 곳간 · 사람 기록이 있으면 주민)
  const p = S.host.players.get(pid); if (!p) return false;
  p._bdtGid = undefined;
  let to = _nearLive(null, p.x / SZ, p.y / SZ).best;
  if (!to) { let bd = 1e18; for (const v of S.host.villages) { const d = Math.hypot(v.ccx - p.x / SZ, v.ccy - p.y / SZ); if (d < bd) { bd = d; to = v; } } }   // 산 마을이 없다 — 아무 마을이나 가장 가까운 곳
  if (!to || !S.host.t1078Out) { despawnBody(pid); return false; }
  S.host.t1078Out(p, to);
  _t1078St().out++;
  return true;
}
function _t1078Settle(g, gid, pids) {   // `syncBodies` 회수 줄의 켬 갈래 — 단이 없으면 몸이 걸어 나가고 · 있으면 넘친 몸이 쓰러진다
  if (!g) { while (pids.length) _t1078Out(pids.pop()); S.bodies.delete(gid); return; }
  if (pids.length + _t1078Walkers(gid).length > g.n) _t1078Trim(g, 'other');
}
function _t1078Gather(day) {   // 도적 하루 — 그 단으로 걷던 몸(절망 이탈)이 닿았으면 단의 몸(T1039 받기 문 그대로) · 단이 흩어졌으면 그 몸도 마을로
  if (!S.host.t1078Walkers) return 0;
  let n = 0;
  for (const w of S.host.t1078Walkers()) {
    const g = S.GANGS.find((x) => x.id === w.gid);
    if (!g) { if (!S.ROAD.some((r) => r.g.id === w.gid)) _t1078Out(w.pid); continue; }
    if (!w.arrived) continue;
    const pids = (S.bodies && S.bodies.get(g.id)) || [];
    if (pids.length >= g.n) { _t1078Out(w.pid); continue; }   // 자리가 없다(지킴 — `_t1078Trim` 이 걷는 몸을 세므로 서지 않는 줄)
    const p = S.host.t1039Join(w.pid, true); if (!p) continue;
    _t1039Adopt(g, [p]); n++;
    if (T1079_CAMP) _t1079Unload(p, g);   // ★[T1079] 합류한 몸 짐의 무기 → 이 단 더미
  }
  if (n) { _t1078St().join += n; log(day, `걸어온 몸 ${n}이 단에 들었다(절망 이탈 — 은거지에 닿음) [T1078]`); }
  return n;
}
function _t1078Fed(g, fed) { const pids = S.bodies && S.bodies.get(g.id); if (pids) for (const pid of pids) { const p = S.host.players.get(pid); if (p) p._t1078Fed = fed ? 1 : 0; } }
// 존 `damagePlayer` NPC 갈래가 부른다(사람 · 짐승 · 화살 — 출처 앞 낱말) — 켬 · 이 단 몸이면 단 n −1 · 그 자리에 쓰러진다(되살림 0 · 순간이동 0)
function t1078Died(p, source) {
  if (!T1078_ALL || !S.host || !p || p._bdtGid == null) return false;
  const gid = p._bdtGid, rd = S.ROAD.find((r) => r.g.id === gid) || null;
  const g = S.GANGS.find((x) => x.id === gid) || (rd ? rd.g : null);
  const pids = S.bodies && S.bodies.get(gid); if (pids) { const i = pids.indexOf(p.pid); if (i >= 0) pids.splice(i, 1); }
  if (rd && rd.pids) { const i = rd.pids.indexOf(p.pid); if (i >= 0) rd.pids.splice(i, 1); }
  const why = String(source || 'unknown').split(':')[0] || 'unknown';
  if (g) g.n = Math.max(0, g.n - 1);
  _t1078Die(g, p.pid, why);
  log(S.host.world ? S.host.world.day : 0, `도적단#${gid} 1명 쓰러짐(${why}) — ${g ? g.n : 0}명 남음 [T1078]`);
  return true;
}

// ═══ ★★[T1079] 은거지 = 시설 · 짐 더미 — 도적 쪽 문(손잡이 `T1079_BANDIT_CAMP` 켬에서만 불린다 · 머리글 T1079 줄) ═══
//   더미 P = { fire, pile(존 건물 — chest), gid } · 더미 칸 = `pile.data` 의 `food` · 무기 짐 이름(`ARMS_RES`) · `_bandit`(쥔 단) · `_left`(흩어진 날) · `_t748Lots`(흩어진 뒤의 로트 줄).
function _t1079St() { return S.stats.t1079 || (S.stats.t1079 = { pitch: 0, adopt: 0, left: 0, join: 0, joinN: 0, out: 0, home: 0, homeBody: 0, noRec: 0, hand: 0, vilArms: 0, unload: 0, relink: 0, lost: 0 }); }   // 켬에서만 칸이 선다
function _t1079Map() { return S.t1079P || (S.t1079P = new Map()); }
function _t1079Carry() { return S.t1079C || (S.t1079C = new Set()); }
function _t1079Recs(g) { const a = g.npc1079, n = Math.max(0, g.n | 0); if (a && a.length > n) a.length = n; return a || []; }   // 준 사람만큼 기록도(맨 뒤부터 — 누가 줄었나는 몸과 같이 모른다)
function _armsView(P) {   // 단 기록 `g.arms` 자리 — 더미 칸의 무기 짐 이름만 비추는 문(값은 더미에만 있다)
  const D = () => P.pile.data, is = (k) => typeof k === 'string' && ARMS_RES.has(k);
  return new Proxy({}, {
    get: (t, k) => (is(k) ? D()[k] : undefined),
    set: (t, k, v) => { if (is(k)) D()[k] = v; return true; },
    has: (t, k) => is(k) && D()[k] != null,
    ownKeys: () => Object.keys(D()).filter(is),
    getOwnPropertyDescriptor: (t, k) => (is(k) && D()[k] != null ? { value: D()[k], enumerable: true, configurable: true, writable: true } : undefined),
  });
}
function _t1079Bind(g, P) {   // 단 기록의 숫자 칸 둘을 걷고 더미 칸을 읽고 쓰는 문으로(사본 0)
  P.gid = g.id;
  const view = _armsView(P);
  Object.defineProperty(g, '_t1079', { value: P, writable: true, configurable: true, enumerable: false });
  Object.defineProperty(g, 'food', { get: () => +P.pile.data.food || 0, set: (v) => { P.pile.data.food = v; }, enumerable: true, configurable: true });
  Object.defineProperty(g, 'arms', { get: () => view, set: (v) => { for (const k of Object.keys(v || {})) if (ARMS_RES.has(k)) P.pile.data[k] = v[k]; }, enumerable: true, configurable: true });
}
function _t1079Unbind(g) {   // 흩어진 단 — 더미는 그 자리에 남고 단 기록엔 아무것도 없다
  Object.defineProperty(g, 'food', { value: 0, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(g, 'arms', { value: undefined, writable: true, enumerable: true, configurable: true });
  g._t1079 = null;
}
function _t1079Pitch(g, day) {   // 단이 선 그 순간 — 야영 터(불 · 짐 더미) · 그 자리 옛 더미는 잇는다 · 단의 비축 · 무기 짐을 더미로 옮긴다
  if (g._t1079 || !S.host || !S.host.t1079Pitch) return false;
  const P = S.host.t1079Pitch(g.camp); if (!P || !P.pile) return false;
  const d = P.pile.data, st = _t1079St(), food = +g.food || 0, arms = g.arms || null;
  const old = Array.isArray(d._t748Lots) ? d._t748Lots : null; delete d._t748Lots;
  const had = { food: +d.food || 0, arms: Object.keys(d).filter((k) => ARMS_RES.has(k)).reduce((a, k) => a + (+d[k] || 0), 0) };
  d.food = had.food + food;
  if (arms) for (const k of Object.keys(arms)) if (ARMS_RES.has(k)) d[k] = (+d[k] || 0) + (+arms[k] || 0);
  d._bandit = g.id; delete d._left;
  P.pile.ownerId = 'bandit_den';
  delete g.food; delete g.arms;
  _t1079Bind(g, P);
  { const _G = _gl(); if (_G && old && old.length) _G.gangLoad(g, old.concat(_G.gangDump(g) || [])); }   // ★[T748] 옛 더미의 로트 줄이 앞(오래된 것)
  _t1079Map().set(P.pile.id, P);
  st.pitch++;
  if (P.adopted) { st.adopt++; log(day, `도적단#${g.id} 은거지(${g.camp.cx},${g.camp.cy})의 옛 짐 더미를 잇는다 — 식량 ${had.food.toFixed(1)} · 무기 짐 ${had.arms.toFixed(2)} [T1079]`); }
  return true;
}
function _t1079Relink(g) {   // 다시 뜸 — 그 자리 그 단의 더미 행을 잇는다(없으면 비축 0)
  delete g.t1079;
  const P = S.host && S.host.t1079Find ? S.host.t1079Find(g.camp, g.id) : null;
  if (!P || !P.pile) { g.food = 0; return false; }
  _t1079Bind(g, P); _t1079Map().set(P.pile.id, P); _t1079St().relink++;
  return true;
}
function _t1079Save(g, o) {   // 저장 줄 — 더미가 정본이면 두 칸을 안 싣는다 · 사람 기록(econ 항목 그대로 — 옮김)은 싣는다
  if (g._t1079) { delete o.food; delete o.arms; o.t1079 = 1; }
  if (g.npc1079 && g.npc1079.length) o.npc1079 = g.npc1079;
  return o;
}
function _t1079Flush() { if (!S.t1079P || !S.host || !S.host.t1079Flush) return; for (const P of S.t1079P.values()) S.host.t1079Flush(P); }
function _t1079Hand(g, p) {   // 남은 사람 제 무기 — 한 사람 한 자루(더미 → 몸 짐)
  const a = g.arms; if (!p || !a || !((+a.weapon || 0) >= 1)) return 0;
  a.weapon = +a.weapon - 1;
  p.inventory = p.inventory || {}; p.inventory.weapon = (+p.inventory.weapon || 0) + 1;
  _t1079Carry().add(p.pid); _t1079St().hand++;
  return 1;
}
function _t1079Unload(p, g) {   // 합류한 몸 짐의 무기 → 그 단 더미
  if (!p || !p.inventory) return 0;
  let k = 0; const a = g.arms || (g.arms = {});
  for (const r of Object.keys(p.inventory)) if (ARMS_RES.has(r) && (+p.inventory[r] || 0) > 0) { a[r] = (+a[r] || 0) + +p.inventory[r]; k += +p.inventory[r]; p.inventory[r] = 0; }
  _t1079Carry().delete(p.pid); if (k) _t1079St().unload += k;
  return k;
}
function _t1079Break(g, day) {   // 해산 — 더미 · 불은 그 자리에 · 남은 사람은 가까운 다른 단으로(정보범위) · 없으면 가장 가까운 산 마을로 걸어가 주민
  const H = S.host, st = _t1079St();
  _t1078Trim(g, 'other');
  const s = Math.max(0, g.n | 0), recs = _t1079Recs(g).slice();
  const pids = ((S.bodies && S.bodies.get(g.id)) || []).filter((pid) => H.players.has(pid));
  if (S.bodies) S.bodies.delete(g.id);
  const infoR = _infoR(H);   // 절망 이탈 합류 그 반경(한 자리)
  let bg = null, bd = 1e18;
  if (s > 0) for (const o of S.GANGS) { const d = Math.hypot(o.camp.cx - g.camp.cx, o.camp.cy - g.camp.cy); if (d < bd) { bd = d; bg = o; } }
  if (bg && bd > infoR) bg = null;
  if (bg) {
    bg.n += s;
    if (recs.length) (bg.npc1079 || (bg.npc1079 = [])).push(...recs);
    for (const pid of pids) { const p = H.players.get(pid); if (!_t1104Away(p)) _t1079Hand(g, p); if (!(H.t1079Walk && H.t1079Walk(p, bg.camp, bg.id))) despawnBody(pid); }   // ★[T1104] 길목에 나간 몸은 은거지 더미에서 제 무기를 못 집는다(끔 = 늘 은거지)
    st.join++; st.joinN += s;
    log(day, `도적단#${g.id} 남은 ${s}명 → 도적단#${bg.id}(${Math.round(bd)}셀)에 합류 — 몸 ${pids.length}이 그 은거지로 걷는다 [T1079]`);
  } else if (s > 0) {
    let r = 0;
    for (const pid of pids) { const p = H.players.get(pid); if (!_t1104Away(p)) _t1079Hand(g, p); _t1079Home(pid, r < recs.length ? recs[r++] : null, g.camp); }   // ★[T1104] 같은 줄
    for (; r < recs.length; r++) _t1079Home(null, recs[r], g.camp);   // 몸 없는 사람(기록만 — 마을 가시 몸 상한 밖에서 온 사람)
    log(day, `도적단#${g.id} 남은 ${s}명 → 가장 가까운 산 마을로 걸어간다(몸 ${pids.length} · 사람 기록 ${recs.length}) [T1079]`);
  }
  const P = g._t1079;
  if (P && T1104_WALK) _t1104Drop(g, P, day);   // ★[T1104] 몸 없는 사람이 쥐던 노획(장부)은 더미에(몸 짐은 그 몸과 같이 간다)
  if (P) {
    const d = P.pile.data;
    { const _G = _gl(); if (_G) { const L = _G.gangDump(g); if (L) d._t748Lots = L; } }   // 로트 줄이 더미에 남는다(그 자리를 잇는 단이 다시 싣는다)
    delete d._bandit; d._left = day; P.pile.ownerId = 'public'; P.gid = null;
    st.left++;
    _t1079Unbind(g);
    log(day, `도적단#${g.id} 짐 더미가 은거지(${g.camp.cx},${g.camp.cy})에 남았다 — 식량 ${(+d.food || 0).toFixed(1)} · 무기 짐 ${Object.keys(d).filter((k) => ARMS_RES.has(k)).map((k) => k + ' ' + (+d[k]).toFixed(2)).join(' · ') || '없음'} [T1079]`);
  }
}
function _t1079Home(pid, npc, cell) {   // 가장 가까운 산 마을로 — 몸은 걷고(T590 `move` · 닿아도 안 거둔다) 길 위 장부(T765 `S.WALK` · 닿는 날 = 걸음 장부)가 닿는 날 내린다
  const H = S.host, p = pid != null ? H.players.get(pid) : null;
  const cx = p ? p.x / SZ : cell ? cell.cx : null, cy = p ? p.y / SZ : cell ? cell.cy : null;
  if (cx == null || (!p && !npc)) return false;
  let to = _nearLive(null, cx, cy).best;
  if (!to) { let bd = 1e18; for (const v of H.villages) { if (!v.econ) continue; const d = Math.hypot(v.ccx - cx, v.ccy - cy); if (d < bd) { bd = d; to = v; } } }
  if (!to) { if (p) { despawnBody(pid); _t1079St().lost++; } return false; }
  let L = null;
  if (p) { p._bdtGid = undefined; L = H.t1079Home ? H.t1079Home(p, to) : null; if (!L) { despawnBody(pid); _t1079St().lost++; return false; } }
  else L = H.t1079Len ? H.t1079Len({ cx, cy }, to) : { len: 0, ppd: 0 };
  S.WALK.push(Object.assign({ npc: npc || null, from: null, to: to.dbId, d0: H.world.day, len: L.len, ppd: L.ppd, pid: p ? pid : null, t1079: 1 },
    _walkLife(H.world.day, to.dbId, null, 't1079')));   // ★[T1108] 걷기 문 하나 — 길 위 하루가 해체 남은 사람과 같다(제 짐 = 빈 짐 · 더미는 그 자리에 남는다 — T1079 문 4 ⓑ)
  _t1079St().out++;
  return true;
}
function _t1079Arrive(w, to, day) {   // 닿았다 — 몸 짐 무기는 그 마을 곳간 · 사람 기록이 있으면 주민(종전 두 줄 + 붙기 문 `t765Join`) · 없으면 몸은 거둔다(회부)
  const H = S.host, st = _t1079St(), p = w.pid != null ? H.players.get(w.pid) : null;
  let k = 0;
  if (p && p.inventory) for (const r of Object.keys(p.inventory)) if (ARMS_RES.has(r) && (+p.inventory[r] || 0) > 0) { const St = to.econ.storage || (to.econ.storage = {}); St[r] = (St[r] || 0) + +p.inventory[r]; k += +p.inventory[r]; p.inventory[r] = 0; }
  if (w.pid != null) _t1079Carry().delete(w.pid);
  st.vilArms += k;
  if (w.npc) { _econJoin(to, w.npc); st.home++; if (H.t765Join && H.t765Join(w.pid, to, w.npc)) st.homeBody++; }
  else { st.noRec++; if (p && H.t1079Gone) H.t1079Gone(w.pid); }
  log(day, `해산한 도적 1명이 ${to.name}에 닿았다 — ${w.npc ? '주민' : '사람 기록 없음(몸 거둠)'}${k ? ` · 무기 짐 ${k} → 곳간` : ''} [T1079]`);
}
// 증인(관찰기 `t1079-observe` · 하네스 `test-bandit-camp`) — 읽기만
function t1079() {
  let W = null; try { W = require('./weights'); } catch (e) { W = null; }
  const kg = (d) => Object.keys(d).filter((k) => k === 'food' || ARMS_RES.has(k)).reduce((a, k) => a + (+d[k] || 0) * (W ? W.kgOfOrDefault(k) : 0), 0);
  const piles = S.t1079P ? [...S.t1079P.values()].map((P) => { const d = P.pile.data || {}; const arms = {}; for (const k of Object.keys(d)) if (ARMS_RES.has(k)) arms[k] = +d[k] || 0;
    return { id: P.pile.id, fire: P.fire ? P.fire.id : null, x: P.pile.x, y: P.pile.y, owner: P.pile.ownerId, gid: d._bandit != null ? d._bandit : null, left: d._left != null ? d._left : null, food: +d.food || 0, arms, kg: +kg(d).toFixed(3), lots: Array.isArray(d._t748Lots) ? d._t748Lots.length : 0 }; }) : [];
  const carry = S.t1079C && S.host ? [...S.t1079C].map((pid) => { const p = S.host.players.get(pid); return { pid, alive: !!p, weapon: p && p.inventory ? +p.inventory.weapon || 0 : 0 }; }) : [];
  return { on: T1079_CAMP, stat: S.stats.t1079 ? JSON.parse(JSON.stringify(S.stats.t1079)) : null, piles, carry, walk: S.WALK.filter((w) => w.t1079).map((w) => ({ pid: w.pid, rec: !!w.npc, to: w.to, d0: w.d0, len: w.len, ppd: w.ppd })) };
}
// ═══ ★★[T1104] 약탈 · 토벌 = 맵 위 사건 — 도적 쪽 문(손잡이 `T1104_BANDIT_WALK` 켬에서만 불린다 · 머리글 T1104 줄) ═══
//   단의 걸음 장부 `g.t1104` = { st: 'camp' | 'out'(길목으로 · 길목에 섬) | 'back'(은거지로), d0 · len · ppd(걸음 장부 — T765 · T1039 의 그 닿음 식),
//     tc(노리는 캐러밴) · leg(그 구간) · x · y(길목 px) · s(그 길에서 길목까지 px) · clen(그 길 px) · ds(캐러밴 장부가 길목을 지나는 날) · met(만난 날) · carry(몸 없는 사람이 쥔 노획) }.
//   걷는 원정 `S.SUPS[]` = { id, gid, vilDbId, force, wep, st: 'go' | 'home', d0 · len · ppd, pids(원정 몸) · bag(몸마다 실은 것) · camp }.
function _t1104St() { return S.stats.t1104 || (S.stats.t1104 = { out: 0, met: 0, miss: 0, back: 0, home: 0, food: 0, arms: 0, keep: 0, ledger: 0, drop: 0, boot: 0, far: 0,
  supGo: 0, supBodies: 0, supWait: 0, supFight: 0, supFell: 0, supWon: 0, supLoad: 0, supHome: 0, supStore: 0, supEmpty: 0 }); }   // 켬에서만 칸이 선다
function _t1184Here(p, cx, cy) { return !!p && Math.floor(p.x / SZ) === cx && Math.floor(p.y / SZ) === cy; }
function _t1104At(L, day) { return !!L && L.ppd > 0 && (day - L.d0) * L.ppd >= L.len - 0.5; }   // 걸음 장부 닿음(T765 `_t765Arrive` · T1039 `_t1039Arrive` 그 식)
function _t1104Eta(L) { return L && L.ppd > 0 ? L.d0 + Math.ceil(Math.max(0, L.len - 0.5) / L.ppd) : null; }
function _t1104Away(p) { return T1104_WALK && !!p && p._t1104W != null; }   // 이 몸은 지금 은거지 밖을 걷는다(길목 · 돌아옴)
function _t1104Bodies(g) { const pids = (S.bodies && S.bodies.get(g.id)) || []; const out = []; for (const pid of pids) { const p = S.host.players.get(pid); if (p && !p.isDown && p.hp > 0) out.push(p); } return out; }
function _t1104Key(a, b) { return a.name < b.name ? a.name + '|' + b.name : b.name + '|' + a.name; }   // 길목 표 열쇠(종전 `banditGang` 의 그 열쇠)
function _t1104Leg(c, byE) {   // 캐러밴의 지금 구간 — 마을 둘(그 방향) · 장부 날(T661 `_t661Anchor` 의 D0 · D1 — 가는 길 출발일 → 도착일 · 귀로 도착일 → 집 도착일)
  if (!c || (c.state !== 'outbound' && c.state !== 'inbound')) return null;
  const A = byE.get(c.from), B = byE.get(c.to); if (!A || !B) return null;
  const out = c.state === 'outbound';
  return { from: out ? A : B, to: out ? B : A, D0: out ? c.departDay : c.arriveDay, D1: out ? c.arriveDay : c.returnArriveDay, leg: c.state };
}
function _t1104Lc(clen, D0, D1, d) { return clen * Math.min(1, Math.max(0, (d - D0) / Math.max(1, D1 - D0))); }   // 캐러밴 장부 진척(T661 `_t661Target` 식)
function _t1104Pass(C, lg) { for (let d = lg.D0 + 1; d <= Math.max(lg.D0 + 1, lg.D1); d++) if (_t1104Lc(C.clen, lg.D0, lg.D1, d) >= C.s) return d; return null; }   // 장부가 길목을 지나는 날
function _t1104Choke(g, from, to) {   // 그 길(from → to · 교역로 정점 px)에서 은거지에 가장 가까운 정점 = 길목(단마다 · 방향마다 한 번)
  const M = g._t1104C || (Object.defineProperty(g, '_t1104C', { value: new Map(), writable: true, configurable: true, enumerable: false }), g._t1104C);
  const key = from.dbId + '>' + to.dbId;
  if (M.has(key)) return M.get(key);
  let pts = null; try { pts = S.host.getRoute(from, to); } catch (e) { pts = null; }
  let C = null;
  if (pts && pts.length > 1) {
    const cx = g.camp.cx * SZ + SZ / 2, cy = g.camp.cy * SZ + SZ / 2;
    let cum = 0, bi = 0, bd = Infinity, bs = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i) cum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const dd = Math.hypot(pts[i].x - cx, pts[i].y - cy);
      if (dd < bd) { bd = dd; bi = i; bs = cum; }
    }
    C = { x: pts[bi].x, y: pts[bi].y, s: bs, clen: cum, lb: bd, walk: null };
  }
  M.set(key, C);
  return C;
}
function _t1104Walk(g, C) {   // 은거지 → 길목 장부 길(코스 A* · 못 찾으면 직선 — `_t1079Len` 그 셈) · 길목마다 한 번
  if (C.walk == null) { const L = S.host.t1079Len ? S.host.t1079Len({ cx: g.camp.cx, cy: g.camp.cy }, { ccx: Math.floor(C.x / SZ), ccy: Math.floor(C.y / SZ) }) : null; C.walk = L ? L.len : C.lb; }
  return C.walk;
}
function _t1104Pick(g, day, byE, taken) {   // 은거지의 단 — 길목 표에서 이 단이 첫 단인 쌍의 캐러밴 중 길목에 먼저 닿을 수 있는 첫 캐러밴(`world.caravans` 차례)
  const H = S.host, ppd = H.t1104Ppd ? H.t1104Ppd() : 0;
  if (!(ppd > 0) || !(g.n > 0)) return null;
  for (const c of (H.world.caravans || [])) {
    if (c._done || taken.has(c.id)) continue;
    const gs = c.from && c.to ? S.pairs.get(_t1104Key(c.from, c.to)) : null;
    if (!gs || gs[0] !== g) continue;
    const lg = _t1104Leg(c, byE); if (!lg) continue;
    const C = _t1104Choke(g, lg.from, lg.to); if (!C) continue;
    if (_t1104Lc(C.clen, lg.D0, lg.D1, day) >= C.s) continue;   // 벌써 지났다
    const ds = _t1104Pass(C, lg); if (ds == null || ds <= day) continue;
    if (day + Math.ceil(Math.max(0, C.lb - 0.5) / ppd) > ds) { _t1104St().far++; continue; }   // 곧은 거리로도 못 닿는다(A* 를 안 판다)
    const W = _t1104Walk(g, C);
    if (day + Math.ceil(Math.max(0, W - 0.5) / ppd) > ds) { _t1104St().far++; continue; }
    return { c, lg, C, ds, W, ppd };
  }
  return null;
}
function _t1104Day(day) {   // 도적 하루(길목 표가 오늘 것이 된 뒤) — 나간 단: 만났거나 놓쳤으면 돌아온다 · 돌아오는 단: 닿으면 더미에 내린다 · 은거지의 단: 노릴 캐러밴이 있으면 나간다
  const H = S.host, W = H.world;
  const byE = new Map(); for (const v of H.villages) if (v.econ) byE.set(v.econ, v);
  const cars = new Map(); for (const c of (W.caravans || [])) cars.set(c.id, c);
  S.t1104T = new Map();
  for (const g of S.GANGS) { const T = g.t1104; if (T && T.st === 'out') S.t1104T.set(T.tc, g); }
  for (const g of S.GANGS) {
    let T = g.t1104 || (g.t1104 = { st: 'camp', carry: null });
    if (T.st === 'out') {
      const c = cars.get(T.tc), lg = c && !c._done ? _t1104Leg(c, byE) : null;
      const gone = !lg || lg.leg !== T.leg || _t1104Lc(T.clen, lg.D0, lg.D1, day) >= T.s;   // 캐러밴이 끝났다 · 구간이 바뀌었다 · 장부가 길목을 지났다
      if (T.met != null || gone) { S.t1104T.delete(T.tc); _t1104Back(g, day, T.met != null ? 'met' : 'miss'); }
      continue;
    }
    if (T.st === 'back') { if (!_t1104At(T, day) || !_t1104Bodies(g).every(p => _t1184Here(p, g.camp.cx, g.camp.cy))) continue; _t1104Home(g, day); T = g.t1104; }
    if (T.st === 'camp') { const pk = _t1104Pick(g, day, byE, S.t1104T); if (pk) _t1104Out(g, pk, day); }
  }
}
function _t1104Out(g, pk, day) {   // 단 몸이 다 길목으로 걷는다 — 장부 길 = 은거지 → 길목 길과 몸마다 걸음 길 중 긴 것(T1039 `_t1039Depart` 그 셈)
  const H = S.host, T0 = g.t1104 || {};
  let len = pk.W, nb = 0;
  for (const p of _t1104Bodies(g)) { const r = H.t1104Walk ? H.t1104Walk(p, pk.C.x, pk.C.y, 't1104', g.id, null) : null; if (r) { nb++; if (r.len > len) len = r.len; } }
  g.t1104 = { st: 'out', tc: pk.c.id, leg: pk.lg.leg, x: pk.C.x, y: pk.C.y, s: pk.C.s, clen: pk.C.clen, ds: pk.ds, d0: day, len, ppd: pk.ppd, met: null, carry: T0.carry || null };
  S.t1104T.set(pk.c.id, g);
  _t1104St().out++;
  log(day, `도적단#${g.id} ${g.n}명(몸 ${nb})이 길목(${Math.floor(pk.C.x / SZ)},${Math.floor(pk.C.y / SZ)})으로 — 캐러밴#${pk.c.id} ${pk.lg.from.name}→${pk.lg.to.name} 지나는 날 D${pk.ds} · 닿는 날 D${_t1104Eta(g.t1104)} [T1104]`);
}
function _t1104Back(g, day, why) {   // 길목 → 은거지(몸은 지금 자리에서 · 장부 길 = 길목 → 은거지 길과 몸마다 걸음 길 중 긴 것)
  const H = S.host, T = g.t1104, cx = g.camp.cx * SZ + SZ / 2, cy = g.camp.cy * SZ + SZ / 2;
  const L0 = H.t1079Len ? H.t1079Len({ cx: Math.floor(T.x / SZ), cy: Math.floor(T.y / SZ) }, { ccx: g.camp.cx, ccy: g.camp.cy }) : null;
  let len = L0 ? L0.len : Math.hypot(T.x - cx, T.y - cy);
  for (const p of _t1104Bodies(g)) { const r = H.t1104Walk ? H.t1104Walk(p, cx, cy, 't1104', g.id, null) : null; if (r && r.len > len) len = r.len; }
  g.t1104 = { st: 'back', d0: day, len, ppd: T.ppd, why, x: T.x, y: T.y, carry: T.carry || null };
  const st = _t1104St(); st.back++; if (why === 'miss') st.miss++;
  log(day, `도적단#${g.id} 길목에서 은거지로 돌아간다(${why === 'met' ? '싸운 뒤' : '놓쳤다'} · 닿는 날 D${_t1104Eta(g.t1104)}) [T1104]`);
}
function _t1104Put(g, res, q) {   // 은거지 더미에 내린다 — 식량은 종전 상한(`n × BDT_CAP` — 장물 줄의 그 식) · 무기 짐은 실물 그대로 · 반환 = 내린 양
  if (!(q > 0)) return 0;
  if (res === 'food') { const room = Math.max(0, g.n * BDT_CAP - g.food), k = Math.min(q, room); if (k > 0) { g.food = g.food + k; const _G = _gl(); if (_G) _G.gangIn(g, k); } return k; }
  if (ARMS_RES.has(res)) { const a = g.arms || (g.arms = {}); a[res] = (+a[res] || 0) + q; return q; }
  return 0;
}
function _t1104Home(g, day) {   // 은거지에 닿았다 — 몸은 은거지 일과로(T1039 받기 문) · 몸 짐 노획 · 몸 없는 사람 노획을 더미에
  const H = S.host, T = g.t1104, st = _t1104St(), _G = _gl();
  let food = 0, arms = 0;
  for (const p of _t1104Bodies(g)) {
    if (p._t1104W != null && H.t1104Join) H.t1104Join(p);
    const inv = p.inventory; if (!inv) continue;
    if ((+inv.food || 0) > 0) { const k = _t1104Put(g, 'food', +inv.food); if (k > 0) { inv.food = +inv.food - k; food += k; if (_G) _G.bagOut(p, 'food', k); } }
    arms += _t1079Unload(p, g);   // T1079 몸 짐 무기 → 더미(그 문)
  }
  if (T.carry) for (const r of Object.keys(T.carry)) { const k = _t1104Put(g, r, T.carry[r]); T.carry[r] -= k; if (r === 'food') food += k; else arms += k; if (!(T.carry[r] > 0)) delete T.carry[r]; }
  let keep = 0; for (const p of _t1104Bodies(g)) keep += (p.inventory && +p.inventory.food) || 0;
  g.t1104 = { st: 'camp', carry: T.carry && Object.keys(T.carry).length ? T.carry : null };
  st.home++; st.food += food; st.arms += arms; if (keep > 0) st.keep++;
  if (food > 0 || arms > 0) log(day, `도적단#${g.id} 은거지에 닿아 노획을 더미에 — 식량 ${food.toFixed(1)} · 무기 짐 ${arms.toFixed(2)}${keep > 0 ? ` · 더미가 차 몸 짐에 남은 식량 ${keep.toFixed(1)}` : ''} [T1104]`);
}
function _t1104Party(g) {   // 길목에 나간 몸(만남 때 몸 명부 뒤로 모았다 — T1078 맞춤이 뒤에서부터 쓰러뜨리니 사상은 길목의 몸) · 그중 산 몸 = 앞에서 (명부 − 사상)
  const all = _t1104Bodies(g), party = all.filter((p) => p._t1104W === g.id);
  const dead = Math.max(0, all.length - Math.max(0, g.n | 0));
  return party.slice(0, Math.max(0, party.length - dead));
}
function _t1104Carry(g, res, q) {   // 노획 — 싸운 단의 길목 산 몸 짐에 똑같이 나눠 싣는다 · 길목에 몸이 없으면(몸 없는 사람만) 장부
  if (!(q > 0)) return;
  const bodies = _t1104Party(g);
  if (!bodies.length) { const T = g.t1104 || (g.t1104 = { st: 'camp', carry: null }); const C = T.carry || (T.carry = {}); C[res] = (C[res] || 0) + q; _t1104St().ledger++; return; }
  const each = q / bodies.length, _G = res === 'food' ? _gl() : null;
  for (const p of bodies) { const inv = p.inventory || (p.inventory = {}); inv[res] = (+inv[res] || 0) + each; if (_G) _G.bagNote(p, 'food', each); }
}
function _t1104Drop(g, P, day) {   // 해산 — 몸 없는 사람이 쥐던 노획(장부)은 더미에(그 사람들은 장부로 흩어진다 · 몸 짐은 그 몸과 같이)
  const T = g.t1104; if (!T || !T.carry) return;
  let n = 0;
  for (const r of Object.keys(T.carry)) { const q = +T.carry[r] || 0; if (!(q > 0)) continue; if (r === 'food') { g.food = g.food + q; const _G = _gl(); if (_G) _G.gangIn(g, q); } else if (ARMS_RES.has(r)) { const a = g.arms || (g.arms = {}); a[r] = (+a[r] || 0) + q; } n += q; }
  T.carry = null; _t1104St().drop++;
  if (n > 0) log(day, `도적단#${g.id} 해산 — 몸 없는 사람이 쥐던 노획 ${n.toFixed(2)} 은 더미에 [T1104]`);
}
function _t1104Boot(day) {   // 다시 뜸 — 몸은 은거지에 다시 섰다(비영속 · T1078 부팅 실체화) ⇒ 길에 있던 장부는 은거지로 접는다 · 몸 없는 노획 장부는 더미에(종전 상한)
  for (const g of S.GANGS) {
    const T = g.t1104; if (!T) continue;
    if (T.carry) for (const r of Object.keys(T.carry)) { const k = _t1104Put(g, r, T.carry[r]); T.carry[r] -= k; if (!(T.carry[r] > 0)) delete T.carry[r]; }
    if (T.st !== 'camp') { _t1104St().boot++; }
    g.t1104 = { st: 'camp', carry: T.carry && Object.keys(T.carry).length ? T.carry : null };
  }
  S.t1104T = new Map();
}
// econ 캐러밴 하루마다(econ 문 `world.banditMeet` → `_raidMeet`) — 이 캐러밴이 오늘 길목을 지나고 노리던 단이 그 길목에 서 있으면 그 단(그날 그 자리에서 종전 식으로 치른다)
function _t1104Meet(c, day) {
  const g = S.t1104T ? S.t1104T.get(c.id) : null; if (!g) return null;
  const T = g.t1104;
  if (!T || T.st !== 'out' || T.met != null || T.tc !== c.id || T.leg !== c.state || !(g.n > 0) || S.GANGS.indexOf(g) < 0) return null;
  if (!_t1104At(T, day)) return null;   // 아직 길목에 못 닿았다
  // [T1184] 길날만 지난 단과 몸이 없는 단은 싸우지 않는다.
  const party = _t1104Bodies(g).filter(p => p._t1104W === g.id);
  if (party.length !== g.n || !party.every(p => _t1184Here(p, Math.floor(T.x / SZ), Math.floor(T.y / SZ)))) return null;
  const out = c.state === 'outbound', D0 = out ? c.departDay : c.arriveDay, D1 = out ? c.arriveDay : c.returnArriveDay;
  const L1 = _t1104Lc(T.clen, D0, D1, day), L0 = _t1104Lc(T.clen, D0, D1, day - 1);
  if (!(day > D0 && L1 >= T.s && (day - 1 <= D0 || L0 < T.s))) return null;   // 오늘 길목을 지나지 않는다
  T.met = day; _t1104St().met++;
  { const pids = S.bodies && S.bodies.get(g.id); if (pids) { const away = pids.filter((pid) => { const p = S.host.players.get(pid); return p && p._t1104W === g.id; }); const home = pids.filter((pid) => away.indexOf(pid) < 0); pids.length = 0; pids.push(...home, ...away); } }   // 길목의 몸을 명부 뒤로(사상 = 그 자리의 몸 · 은거지에 새로 든 몸이 대신 쓰러지지 않게)
  queueLog(day, `도적단#${g.id} ${g.n}명이 길목(${Math.floor(T.x / SZ)},${Math.floor(T.y / SZ)})에서 캐러밴#${c.id}(${c.from.name}→${c.to.name} ${c.state === 'outbound' ? '가는 길' : '귀로'})을 만났다 [T1104]`);
  return g;
}
// ── ② 걷는 원정 ──
function _t1104SupOf(g) { return g && g._sup && g._sup.t1104 != null ? (S.SUPS || []).find((F) => F.id === g._sup.t1104) || null : null; }
function _t1104SupTxt(g) { const F = _t1104SupOf(g); return F ? ` — 걸어서(몸 ${F.pids.length} · 길 ${Math.round(F.len / SZ)}셀 · 닿는 날 D${_t1104Eta(F)}) [T1104]` : ''; }
function _t1104SupGo(vil, bg, fN, wep, day) {   // 결단이 요청한 병력 중 실제 뽑혀 걸어 나간 전사·사냥꾼 몸만 전투 병력이다
  const H = S.host, st = _t1104St(), id = bg.id + ':' + day + ':' + vil.dbId;
  const cx = bg.camp.cx * SZ + SZ / 2, cy = bg.camp.cy * SZ + SZ / 2;
  const L0 = H.t1079Len ? H.t1079Len({ cx: vil.ccx, cy: vil.ccy }, { ccx: bg.camp.cx, ccy: bg.camp.cy }) : null;
  let len = L0 ? L0.len : Math.hypot(cx - (vil.ccx * SZ + SZ / 2), cy - (vil.ccy * SZ + SZ / 2));
  const candidates = H.t1104Draft ? H.t1104Draft(vil, fN) : [];
  if (candidates.length < BDT_SUP_N || candidates.length < bg.n) return null;
  const pids = [];
  for (const p of candidates) { if (pids.includes(p.pid)) continue; const r = H.t1104Walk(p, cx, cy, 't1104s', id, vil); if (r) { pids.push(p.pid); if (r.len > len) len = r.len; } }
  if (pids.length < BDT_SUP_N || pids.length < bg.n) { for (const pid of pids) if (H.t1104Release) H.t1104Release(H.players.get(pid)); return null; }
  const F = { id, gid: bg.id, vilDbId: vil.dbId, force: pids.length, wep, st: 'go', d0: day, len, ppd: H.t1104Ppd ? H.t1104Ppd() : 0, pids, bag: {}, camp: { cx: bg.camp.cx, cy: bg.camp.cy } };
  (S.SUPS || (S.SUPS = [])).push(F);
  st.supGo++; st.supBodies += pids.length;
  return { t1104: id };
}
function _t1104SupAt(g, day) {   // 원정이 은거지에 닿았고 단이 은거지에 있으면 그 원정(단이 길목에 나가 있으면 돌아올 때까지 은거지에서 기다린다)
  const F = _t1104SupOf(g);
  if (!F) { if (g._sup && g._sup.t1104 != null) g._sup = null; return null; }
  F.pids = F.pids.filter(pid => { const p = S.host.players.get(pid); return p && p.hp > 0; });
  F.force = F.pids.length;
  if (!F.force) { g._sup = null; return null; }
  if (F.st !== 'go' || !_t1104At(F, day)) return null;
  if (!F.pids.every(pid => { const p = S.host.players.get(pid); return !p.isDown && _t1184Here(p, g.camp.cx, g.camp.cy); })) return null;
  if (g.t1104 && g.t1104.st !== 'camp') { if (F.wait == null) { F.wait = day; _t1104St().supWait++; log(day, `토벌대가 도적단#${g.id} 은거지에 닿았다 — 단이 길목에 나가 있어 기다린다 [T1104]`); } return null; }
  _t1104St().supFight++;
  return F;
}
function _t1104SupDead(F, fvil, gone, g, A) {   // 원정 전사 — 실전투에서 쓰러진 차례(앞 = 몸)대로 몸이 은거지에서 쓰러진다 · 마을 명부에서 빠진다 · 몸 없는 몫만 종전 까닭 줄
  const H = S.host; let k = 0;
  const alive = F.pids.filter((pid) => H.players.has(pid));
  for (let z = 0; z < alive.length && k < gone; z++) {
    if (!(A[z] <= 0)) continue;
    const p = H.players.get(alive[z]); if (!p) continue;
    if (H.t1104Fall && H.t1104Fall(fvil, p)) { k++; F.pids.splice(F.pids.indexOf(p.pid), 1); }
  }
  _t1104St().supFell += k;
  if (gone - k > 0 && H.noteBodyExit) H.noteBodyExit(fvil, 'expedition', gone - k, g.camp);   // 몸 없는 사람(마을 가시 몸 상한 밖) 몫 — 종전 그대로(집에 선 몸이 그 소굴 쪽으로)
}
function _t1104SupWon(F, fvil, g, A, day) {   // 싸운 뒤 — 단이 무너졌으면(3명 미만 = 아래 해산 줄) 산 원정 몸이 더미를 싣는다(T466 `_warLootLoad` · 몸마다 `CAP_KG`) · 집으로 걷는다
  const H = S.host, st = _t1104St();
  const bodies = F.pids.map((pid) => H.players.get(pid)).filter((p) => p && p.hp > 0 && !p.isDown);
  if (g.n < BDT_GMIN && fvil && bodies.length && H.t1104Load && g._t1079) {
    const src = { food: Math.max(0, +g.food || 0) };
    const a = g.arms; if (a) for (const k of Object.keys(a)) if ((+a[k] || 0) > 0) src[k] = +a[k];
    const before = bodies.map((p) => Object.assign({}, p.inventory || {}));
    H.t1104Load(bodies, src);
    let food = 0;
    bodies.forEach((p, i) => { const got = {}; for (const k of Object.keys(p.inventory || {})) { const dq = (+p.inventory[k] || 0) - (+before[i][k] || 0); if (dq > 0) got[k] = dq; } if (Object.keys(got).length) F.bag[p.pid] = got; });
    for (const k of Object.keys(src)) {
      if (k === 'food') { const took = Math.max(0, (+g.food || 0) - src.food); food = took; g.food = src.food; const _G = _gl(); if (_G && took > 0) _G.gangOut(g, took); }
      else if (a) a[k] = src[k];
    }
    st.supWon++; if (Object.keys(F.bag).length) st.supLoad++;
    log(day, `${fvil.name} 토벌대가 도적단#${g.id} 은거지 짐 더미를 싣는다 — 몸 ${bodies.length} · 식량 ${food.toFixed(1)}${Object.keys(F.bag).length ? '' : '(못 실음)'} · 더미에 남은 식량 ${(+g.food || 0).toFixed(1)} [T1104]`);
  }
  _t1104SupHome(F, fvil, day);
}
function _t1104SupHome(F, fvil, day) {   // 원정 몸이 집(회관)으로 걷는다 — 장부 길 = 은거지 → 회관 길과 몸마다 걸음 길 중 긴 것
  const H = S.host;
  F.st = 'home'; F.d0 = day; F.wait = null;
  if (!fvil) { F.pids = []; return; }
  const L0 = H.t1079Len ? H.t1079Len({ cx: F.camp.cx, cy: F.camp.cy }, fvil) : null;
  let len = L0 ? L0.len : 0;
  const hx = fvil.ccx * SZ + SZ / 2, hy = fvil.ccy * SZ + SZ / 2;
  F.pids = F.pids.filter((pid) => { const p = H.players.get(pid); if (!p || !(p.hp > 0) || p.isDown) return false; const r = H.t1104Walk(p, hx, hy, 't1104s', F.id, fvil); if (r && r.len > len) len = r.len; return !!r; });
  F.len = len;
}
function _t1104SupDay(day) {   // 원정 하루 — 단이 사라진 은거지에 닿은 원정은 빈손으로 돌아온다 · 집에 닿은 원정은 실은 것을 곳간에 내리고 마을 일과로
  if (!S.SUPS || !S.SUPS.length) return;
  const H = S.host, st = _t1104St();
  for (let i = 0; i < S.SUPS.length; i++) {
    const F = S.SUPS[i];
    const fvil = H.villages.find((v) => v.dbId === F.vilDbId) || null;
    F.pids = F.pids.filter(pid => { const p = H.players.get(pid); return p && p.hp > 0; });
    if (!F.pids.length) { const g = S.GANGS.find(g => g.id === F.gid); if (g && g._sup && g._sup.t1104 === F.id) g._sup = null; S.SUPS.splice(i--, 1); continue; } // [T1184] 재부팅 등으로 몸 없는 원정은 취소한다.
    if (F.st === 'go') {
      if (!_t1104At(F, day)) continue;
      if (S.GANGS.some((g) => g.id === F.gid)) continue;   // 단이 있다 — 교전은 유지비 줄(`_t1104SupAt`)
      st.supEmpty++; log(day, `${fvil ? fvil.name : '(소멸 마을)'} 토벌대가 도적단#${F.gid} 은거지에 닿았다 — 단이 없다 · 빈손으로 돌아간다 [T1104]`);
      _t1104SupHome(F, fvil, day);
      continue;
    }
    if (F.st === 'home' && _t1104At(F, day) && (!fvil || F.pids.every(pid => _t1184Here(H.players.get(pid), fvil.ccx, fvil.ccy)))) {
      let n = 0;
      for (const pid of F.pids) { const p = H.players.get(pid); if (!p) continue; if (fvil && H.t1104Store) n += H.t1104Store(fvil, p, F.bag[pid] || null); if (H.t1104Release) H.t1104Release(p); }
      st.supHome++; if (n > 0) st.supStore++;
      if (n > 0) log(day, `${fvil ? fvil.name : '(소멸 마을)'} 토벌대가 집에 닿아 노획을 곳간에 — ${n.toFixed(1)} [T1104]`);
      S.SUPS.splice(i--, 1);
    }
  }
}
function _t1104SupSave(F) { return { id: F.id, gid: F.gid, vilDbId: F.vilDbId, force: F.force, wep: F.wep, st: F.st, d0: F.d0, len: F.len, ppd: F.ppd, camp: F.camp, wait: F.wait != null ? F.wait : undefined }; }
// 증인(관찰기 `t1104-observe` · 하네스 `test-bandit-walk`) — 읽기만
function t1104() {
  return { on: T1104_WALK, stat: S.stats.t1104 ? JSON.parse(JSON.stringify(S.stats.t1104)) : null,
    gangs: S.GANGS.map((g) => ({ id: g.id, n: g.n, t: g.t1104 ? JSON.parse(JSON.stringify(g.t1104)) : null })),
    sups: (S.SUPS || []).map((F) => ({ id: F.id, gid: F.gid, st: F.st, force: F.force, d0: F.d0, len: F.len, ppd: F.ppd, eta: _t1104Eta(F), pids: F.pids.slice(), bag: JSON.parse(JSON.stringify(F.bag)), wait: F.wait != null ? F.wait : null })) };
}

// =============================================================================
// init / onGameTick — zone.js 배선 2줄(부팅 init + gameLoop 훅, villages 옆).
// =============================================================================
function bindHost() {
  const Villages = require('./villages'); // require 캐시 — 순환 없음(villages는 bandits를 모름)
  const host = Villages.banditHost && Villages.banditHost();
  if (!host || !host.ta) return false;
  S.host = host;
  S.zoneId = host.zoneId;
  S.db = require('./zone-local-db');
  S.denSeed = (host.seed >>> 0) || 1;
  let row = null;
  try { row = S.db.getBanditState(host.zoneId); } catch (_) { }
  if (row && row.data) {
    try { restore(row); } catch (e) { console.error(`[${S.zoneId}] 🏴 [도적] 복원 실패 — 신규 스캔:`, e.message); S.DENS = []; S.GANGS = []; }
  }
  if (!S.DENS.length && !S.GANGS.length) {
    //   ★★[T640] 손잡이 켬 + 표본을 아직 안 모았다 ⇒ 전 쌍 A* 를 부팅에서 하지 않고 **listen 뒤 틱마다 조각으로** 판다(`_bootSliceStep`).
    //     표본이 끝나면 그 자리에서 아래 줄들(소굴 배치 · 훅 · 저장 · 실체)을 부팅 날 그대로 잇는다. 끔이면 종전 그대로(이 갈래 무동작).
    if (T640_BOOT_SLICE && host.routeSampleStep && host.routeBootFreeze && !(S._routes && S._routes.sig === _routeSig(host))) return _bootSliceBegin(host);
    const _t699 = host.routeCacheLoad ? host.routeCacheLoad() : null;   // ★[T699] 손잡이 켬 · 같은 지문 파일이 있으면 교역로를 물려받는다(끔 = null · 무동작)
    denScan(host.world.day); // 신규 존(or 복원 실패) — lifeInit 1회 동형
    if (_t699 === false && host.routeCacheSave) host.routeCacheSave();   // ★[T699] 파일이 없었다 — 방금 판 길을 적는다
  }
  return _bindRest(host, host.world.day);
}
function _bindRest(host, day0) {
  installHooks();
  if ((T1075_HAPPY_EQ || T1134_HAPPY_TARGET) && host.world) host.world.t1075Emigrate = _t1075Leave;   // ★[T1134] 목표 행복 판도 같은 몸 문   // ★[T1075 ④] 불행 이탈 몸 문(끔 = 안 단다 · 걷기 문 `walkToVillage` 하나)
  pairSync();
  S.lastDay = day0; // 다음 econ 경계부터 데일리(재부팅 당일 이중 실행 방지) · ★[T640] 조각 판이면 부팅 날(그 사이 넘긴 경계는 다음 틱이 잇는다)
  S.ready = true;
  lotsBoot(_gl());   // ★[T748] 복원한 갱 줄(켬 · 시계가 꽂힌 뒤 — 아니면 villages 의 장부 붙이기가 다시 부른다 · 끄면 null)
  if (T1079_CAMP) for (const g of S.GANGS) if (!g._t1079) _t1079Pitch(g, day0);   // ★[T1079] 더미 없이 선 단(손잡이를 켠 채 처음 뜸 · 더미 행을 못 찾음) — 그 은거지에 야영 터를 세운다
  save(day0);
  syncBodies(true);   // ★[2파] 부팅 실체화(복원 단 포함 — pid 비영속이라 여기서 재스폰) · ★[T1039] `true` = 부팅(걸어 선 단도 종전처럼 세운다)
  if (T1104_WALK) _t1104Boot(day0);   // ★[T1104] 몸은 은거지에 다시 섰다(비영속) — 길에 나가 있던 장부는 은거지로 접는다(몸 없는 노획 장부는 더미에)
  if (_bTickKeep != null) { _bTick = _bTickKeep; _bTickKeep = null; }   // ★[T742] 몸을 다시 세운 뒤 — 주사위 차례를 멈추기 전 값으로(위 `_bTick` 주석 · 끔이면 늘 null)
  console.log(`[${S.zoneId}] 🏴 도적 시뮬 준비(§11 1파: 경제·수명주기): 소굴 ${S.DENS.filter(d => !d.cleared).length}곳 · 도적단 ${S.GANGS.length} · econ 훅(banditRouteRisk/onBanditLoot) 설치 · day ${day0}${FIXTURE ? ` [FIXTURE=${FIXTURE}]` : ''}${BDT_MIN_DAY !== 365 ? ` [MINDAY=${BDT_MIN_DAY}]` : ''}`);
  return true;
}
// ═══ ★★[T640 2026-10-04 · T605 §4-1] 새 세계 첫 부팅 — 교역로 표본을 **조각으로**(손잡이 `T640_BOOT_SLICE` · ★[T655] 기본 켬 · `=0` = 종전) ═══
//   종전: `bindHost` → `denScan` → `routePts` 가 유한 쌍 전부를 **부팅 안에서** 동기 A*(한반도 1,225쌍 · 72초 · 그동안 listen 못 함).
//   켬: 부팅은 표본 없이 끝난다(소굴 0 · 단 0 · 훅 없음 = 도적 층이 아직 안 선 존). listen 뒤 게임 틱마다 슬라이서 예산(`sliceMs` —
//     마을 하루 조각과 같은 그 예산)만큼 같은 순서(i<j · 유한 쌍)로 판다 — 문은 재개형(`routeSampleStep` → `getRouteResumable` · T85 비트 동일).
//   ★얼린 길: 판이 도는 동안 교역로 A* 는 부팅 순간 코스 지도(`roads.frozenView`)를 본다 — 그 사이 사람이 와서 칸이 등급을 받아도
//     종전(부팅 순간 한 번에 판 길)과 같은 바이트다. 끝나면 얼림을 풀고 `denScan` · 훅 · 저장 · 실체를 **부팅 날 그대로** 잇는다.
//   ⚠그 사이 도적은 없다 — 새 세계는 원래 단 0 · 소굴이 아직 안 섰으니(표본이 끝나야 `denScan`) 재결성도 없고 econ 쪽 위험(`banditRouteRisk`)도 종전과 같이 0 이다.
//     ★[T984 정정] 종전 글자 "결성은 `BDT_MIN_DAY` 뒤(기본 365일)"는 틀렸다 — `BDT_MIN_DAY` 는 마을의 해체 · 절망 이탈 문만 닫는다. 소굴 단은 소굴이 선 뒤
//       `BDT_DEN_CD0~1`(30~60일) 카운트다운으로 서고 첫해부터 길목을 턴다(T951 · T984 실측). 빠른 시계 자는 이 조각을 `=0` 으로 끄므로 소굴은 부팅 날 선다.
//   ★★[T655 2026-10-05 · PM 결정(위임)] **켬이 기본**이다 — 손잡이 없음 = 켬 · `T640_BOOT_SLICE=0` = 종전(부팅 안에서 한 번에).
//     빠른 시계 자(`t577-server-run` · 하루 250ms)는 자 안에서 `=0` 을 박는다(표본이 도는 동안 수백 날이 지나 도적 데일리를 건너뛴다 — T640 회부 ①).
const T986_BANDIT_DAY = typeof process !== 'undefined' && !!process.env && process.env.T986_BANDIT_DAY !== '0';   // ★[T986] `dayTick` 머리 주석 · ★[T990 10-28] 켬 기본(PM — 판 자 벽시계 = 가상 시계 · T969 와 같이) · 되돌림 `=0`
const T640_BOOT_SLICE = typeof process !== 'undefined' && !!process.env && process.env.T640_BOOT_SLICE !== '0';
function _bootSliceBegin(host) {
  host.routeBootFreeze(true);
  S._boot = { day0: host.world.day, sig: _routeSig(host), i: 0, j: 1, pts: [], pairs: 0, slices: 0, busy: 0, workMs: 0, t0: Date.now() };
  console.log(`[${S.zoneId}] 🏴 [도적] 부팅 표본을 조각으로 판다(T640) — 마을 ${host.villages.length}곳 · 얼린 길(부팅 순간 코스 지도) · 조각 예산 ${host.sliceMs}ms`);
  return false;
}
function _bootSliceStep() {
  const B = S._boot, host = S.host, V = host.villages, mat = host.world._distMatrix;
  if (B.sig !== _routeSig(host)) { B.i = 0; B.j = 1; B.pts = []; B.pairs = 0; B.sig = _routeSig(host); }   // 마을 구성이 바뀌면 처음부터(종전 서명과 같은 뜻)
  const t0 = Date.now(), budget = host.sliceMs > 0 ? TB.slice(host.sliceMs) : 0;   // ★[T687] 켬 = 이 틱 남은 몫(≥1 — 0 은 무제한이라)
  B.slices++;
  while (B.i < V.length) {
    if (B.j >= V.length) { B.i++; B.j = B.i + 1; continue; }
    const i = B.i, j = B.j;
    if (!(mat && mat[i] && !isFinite(mat[i][j]))) {   // 도달불능쌍은 종전대로 건너뛴다
      const r = host.routeSampleStep(V[i], V[j], budget > 0 ? Math.max(1, budget - (Date.now() - t0)) : 0);
      if (r.busy) { B.busy++; break; }                 // 캐러밴이 다른 쌍을 파는 중 — 그쪽이 끝나면 이어 간다
      if (!r.done) break;                              // 이 쌍을 파는 중 — 다음 틱에 이어 간다
      if (r.pts) for (let k = 0; k < r.pts.length; k++) B.pts.push({ x: r.pts[k].x / SZ, y: r.pts[k].y / SZ });
      B.pairs++;
    }
    B.j++;
    if (budget > 0 && Date.now() - t0 >= budget) break;
  }
  B.workMs += Date.now() - t0;
  if (B.i < V.length) return;
  // 표본 끝 — 종전 `routePts` 가 만드는 그 꼴로 두고 얼림을 푼다. 거리장 · 소굴 훑기는 ★[T655] 다음 틱부터 같은 예산으로 이어 간다(`_bootTailStep`).
  S._routes = { sig: B.sig, pts: B.pts };
  S.routeField = null;
  host.routeBootFreeze(false);
  B.sampleWall = Date.now() - B.t0;
  B.phase = 'field'; B.F = _fieldBegin(S._routes); B.tailSlices = 0; B.tailMs = 0; B.tailMax = 0;
}
// ★★[T655 2026-10-05 · T640 회부 ②] 표본 뒤의 일 — 거리장 → 소굴 격자 훑기 → 배치 · 훅 · 저장 · 실체를 **틱마다 같은 예산으로** 이어 간다.
//   종전(T640)은 이 셋을 한 틱에 했다(한반도 160~188ms). 같은 함수(`_fieldStep` · `_denStep` — 동기 판도 이것)를 놓았다 이어 가니 같은 바이트.
function _bootTailStep() {
  const B = S._boot, host = S.host;
  const t0 = Date.now(), budget = host.sliceMs > 0 ? TB.slice(host.sliceMs) : 0, deadline = budget > 0 ? t0 + budget : Infinity;
  B.tailSlices++;
  let done = false;
  if (B.phase === 'field' && _fieldStep(B.F, deadline)) { _fieldEnd(B.F); B.F = null; B.phase = 'scan'; B.D = _denBegin(B.day0); }
  if (B.phase === 'scan' && Date.now() < deadline) {
    if (!B.D || _denStep(B.D, deadline)) { if (B.D) _denEnd(B.D); B.D = null; B.phase = 'bind'; }
  }
  if (B.phase === 'bind' && Date.now() < deadline) done = true;
  const d = Date.now() - t0; B.tailMs += d; if (d > B.tailMax) B.tailMax = d;
  if (!done) return;
  S._boot = null;
  const wall = Date.now() - B.t0, dayMs = host.dayMs || 0;
  console.log(`[${S.zoneId}] 🏴 [도적] 부팅 표본 끝(T640) — 쌍 ${B.pairs} · 조각 ${B.slices}(양보 ${B.busy}) · 일 ${B.workMs}ms · 표본 벽시계 ${(B.sampleWall / 1000).toFixed(1)}s`
    + ` · 꼬리(거리장·소굴) 조각 ${B.tailSlices} · 일 ${B.tailMs}ms · 조각 최대 ${B.tailMax}ms · 벽시계 ${(wall / 1000).toFixed(1)}s${dayMs ? ` = 게임 ${(wall / dayMs * 1440).toFixed(0)}분` : ''} · day ${B.day0} → ${host.world.day}`);
  S.bootSlice = { pairs: B.pairs, slices: B.slices, busy: B.busy, workMs: B.workMs, sampleWallMs: B.sampleWall, tailSlices: B.tailSlices, tailMs: B.tailMs, tailMax: B.tailMax,
    wallMs: wall, gameMin: dayMs ? +(wall / dayMs * 1440).toFixed(1) : null, day0: B.day0, day1: host.world.day };
  _bindRest(host, B.day0);
}
function init() {
  if (!ENABLED) { console.log(`[${process.env.ZONE_ID || 'zone'}] 🏴 bandits: ENABLE_BANDITS=0 — 비활성(no-op)`); return; }
  try { bindHost(); } catch (e) { console.error(`[bandits] init 실패 (존 부팅은 계속):`, e.message, e.stack); }
}
function onGameTick() {
  if (!ENABLED) return;
  if (S._boot && TB.out(S.host && S.host.sliceMs, 'bandit')) return;   // ★[T687] 이 틱 몫이 없다 — 다음 틱
  if (S._boot) { try { if (S._boot.phase) _bootTailStep(); else _bootSliceStep(); } catch (e) { console.error(`[${S.zoneId}] 🏴 [도적] 부팅 표본 조각 실패(다음 틱 재시도):`, e.message); } return; }   // ★[T640]
  if (!S.ready) { // villages가 늦게 준비되는 경우 — 가벼운 재시도(10초에 1회 수준, 평시 O(1))
    S._bindTried = (S._bindTried || 0) + 1;
    if (S._bindTried === 1 || S._bindTried % 300 === 0) { try { bindHost(); } catch (_) { } }
    if (!S.ready) return;
  }
  if (T986_BANDIT_DAY) return;   // ★[T986] 켬 — 하루는 하루 마감의 정한 자리(`dayTick` · villages 날을 올린 econ 머리 바로 뒤)에서 돈다(아래)
  _dayRun(S.host.world.day);
}
// ★★[T986 2026-10-28 · T969 회부 2] 손잡이 `T986_BANDIT_DAY`(끔 기본 · `'1'` 켬 · 끔 = 종전 글자 — 위 줄이 안 닿고 하루 몸통은 같은 함수).
//   ★[T990 2026-10-28] 켬 기본으로 뒤집음(PM · T986 회부 1 — T974 의 T969 켬 기본과 같은 판) · 되돌림 `T986_BANDIT_DAY=0`(= 종전 글자 · zone deps `dayBandits` 줄도 같은 글자).
//   벽시계 판자에서 도적 하루는 존 틱(`onGameTick` — `world.day` 가 바뀐 첫 틱)이 불렀다. 그런데 하루 마감은 현지 자정 창(T731)이라
//   머리(날 +1) 뒤 마을마다 제 조각을 돌고, 조각은 틱 몫(`TICK_SLICE_MS` · T687)으로 끊긴다 ⇒ 도적 하루가 **마을 결산 몇 곳 뒤에** 끼어드는지가
//   벽시계(밀림 · 부하)에 달렸다. 가상 시계는 몫이 안 닳아 늘 같은 자리 — 그래서 두 시계 판의 절망 이탈 · 해체 · 약탈이 다른 날에 났다
//   (800날 판 자 · 시드 7 임업6 이탈 벽 D516 ↔ 가 D518 · 시드 1020 어촌9 D527 ↔ D523 · 보고 T986 §2).
//   ⇒ 켜면 같은 몸통(`_dayRun`)을 **econ 날 자리**에서 부른다 — villages 하루 마감의 조각 하나(`deps.dayBandits`):
//     현지 자정 창이면 날을 올린 econ 머리(`econ:head`) **바로 뒤 · 마을 조각 앞** · 종전 마감이면 econ 1일 틱 조각 바로 뒤.
//     이 줄 머리 주석("villages econ 틱이 world.day를 민 직후")의 그 자리를 조각 차례로 박은 것이다(가상 시계 종전 판은 머리 틱에 든 마을 몇 곳 뒤였다).
//     그날(`world.day`)에 한 번 · 새 수 0.
function dayTick() {
  if (!ENABLED || !T986_BANDIT_DAY || S._boot || !S.ready) return;   // 부팅 표본 · 결합 전이면 그날은 건너뛴다(틱 쪽이 결합을 잇는다)
  _dayRun(S.host.world.day);
}
function _dayRun(day) {
  if (day === S.lastDay) return; // 게임일 경계에서만(villages econ 틱이 world.day를 민 직후)
  S.lastDay = day;
  try {
    const t0 = Date.now();
    daily(day);
    save(day);
    broadcastCampsIfChanged();
    syncBodies();   // ★[2파] 소굴 배회 NPC 재동기(단 결성·해산·증감 반영 — 비영속·연출 전용)
    if (S.GANGS.length || S.stats.denClear) {
      const _arm = _t521On() ? ` · 무장 ${S.GANGS.reduce((a, g) => a + armsHeld(g), 0).toFixed(1)}/${S.stats.members}(무기 짐 ${S.GANGS.reduce((a, g) => a + ((g.arms && g.arms.weapon) || 0), 0).toFixed(1)} · 실물 약탈 ${(S.stats.armsLoot || 0).toFixed(1)})` : '';   // ★[T521] 무장률 곡선
      console.log(`[${S.zoneId}] 🏴 도적 day ${day}: 단 ${S.stats.gangs}(총원 ${S.stats.members}) · 소굴 ${S.stats.denOcc}/${S.stats.dens} 점유 · 약탈 누계 ${S.stats.loot} · 길목쌍 ${S.pairs.size}${_arm} · ${Date.now() - t0}ms`);
    }
  } catch (e) {
    console.error(`[${S.zoneId}] 🏴 도적 데일리 실패(다음 경계 재시도):`, e.message);
  }
}

module.exports = { t1187OpenDay: (vil) => _bdtOpenDay(vil), init, onGameTick, dayTick, t986: () => ({ on: T986_BANDIT_DAY, lastDay: S.lastDay }), clientCamps, stats: () => S.stats, incomingFood, t766On: () => T766_INCOMING, t1143On: () => T1143_NO_DISSOLVE, armsHeld, ARMS_RES, lotsBoot, gangs: () => S.GANGS,
  t765: () => ({ on: T577_WALK, road: S.WALK.length, rows: (S.t765Rows || []).map((r) => Object.assign({}, r)) }),   // ★[T765] 길 위 장부 증인(관측 자 `t765-obs` · 하네스)
  walkToVillage,   // ★[T1080 · T1108] 걷기 문 하나(해체 남은 사람 · T1079 해산 몸 · T1075 불행 이탈)
  t1080: () => ({ on: _t1080On(), road: S.WALK.length, dead: S.stats.t1080Dead || 0, reroute: S.stats.t1080Reroute || 0, roadDays: S.stats.t1080RoadDays || 0,
    host: S.host && S.host.t1080Stat ? S.host.t1080Stat() : null }),   // ★[T1080] 셈(관측 자)
  // ★[T1039] 도적 전환 몸 증인(관찰기 `t1039-observe` · 하네스 `test-bandit-body`) — 갈래 · 길 위 단 · 단마다 몸
  t1039: () => ({ arm: T1039_WALK ? 'walk' : T1039_SPAWN ? 'spawn' : 'old', road: S.ROAD.map((r) => ({ id: r.g.id, n: r.g.n, home: r.g.home, camp: r.g.camp, d0: r.d0, len: r.len, ppd: r.ppd, pids: (r.pids || []).slice(),
    eta: r.ppd > 0 ? r.d0 + Math.ceil(Math.max(0, r.len - 0.5) / r.ppd) : null })), bodies: S.bodies ? [...S.bodies].map(([id, pids]) => [id, pids.slice()]) : [] }),
  // ★[T1078] 단원 = 몸 — 존 죽음 문 · 증인 · 하네스 문(운영 함수 그대로 · 사본 0)
  t1078Died, t1078On: () => T1078_ALL,
  t1079, t1079On: () => T1079_CAMP,   // ★[T1079] 은거지 시설 · 짐 더미 증인(읽기만)
  t1104, t1104On: () => T1104_WALK,   // ★[T1104] 약탈 · 토벌 걸음 증인(읽기만)
  _t1079Probe: { install: () => installHooks() },   // ★[T1079] 하네스 문 — econ 훅 설치(운영 `installHooks` 그대로 · 부팅 없이)
  t1078: () => ({ on: T1078_ALL, stat: S.stats.t1078 ? JSON.parse(JSON.stringify(S.stats.t1078)) : null,
    gangs: S.GANGS.map((g) => ({ id: g.id, n: g.n, food: g.food, bodies: ((S.bodies && S.bodies.get(g.id)) || []).filter((pid) => S.host && S.host.players.has(pid)).length, walkers: S.host && S.host.t1078Walkers ? S.host.t1078Walkers().filter((w) => w.gid === g.id).length : 0 })) }),
  _t1078Probe: { dens: () => S.DENS, gather: (day) => _t1078Gather(day), trim: (g, why) => _t1078Trim(g, why), stats: () => S.stats },   // 하네스 문(운영 함수 그대로)
  _t1039Probe: { daily: (day) => daily(day), syncBodies: (boot) => syncBodies(boot), arrive: (day) => _t1039Arrive(day), road: () => S.ROAD, gangs: () => S.GANGS, pairs: () => S.pairs,
    reset: () => { S.GANGS = []; S.ROAD = []; S.DENS = []; S.bodies = new Map(); S.pairs = new Map(); S.pairSig = ''; S._fixtured = false; S._routes = null; S.routeField = null; S.routeFieldSig = ''; S.seq = 1; } },   // 하네스 문 — 운영 함수 그대로(사본 0)
  // ★[T765] 하네스 문 — 운영 함수 그대로(사본 0): 호스트 · 저장소를 꽂고 해체 걷기 · 닿기 · 저장 · 복원을 부른다
  _t765Probe: { setHost: (h, db) => { const k = { host: S.host, db: S.db }; S.host = h; if (db !== undefined) S.db = db; return k; }, walk: (vil, day) => _t577Walk(vil, day), arrive: (day) => _t765Arrive(day), home: (pid, npc, cell) => _t1079Home(pid, npc, cell), leave: (econV, npc, day) => _t1075Leave(econV, npc, day),   // ★[T1109] 불행 이탈 한 사람 — 걷기 문 그대로(하네스 `test-cand-walk` ⑨)
    t1079St: () => _t1079St(),   // ★[T1108] 해산 몸 걷기 문 그대로(하네스 `test-t1080-road-life` ⑧)
   
    ledger: () => S.WALK, reset: () => { S.WALK = []; S.t765Rows = []; }, save: (day) => save(day), restore: (row) => restore(row), get ON() { return T577_WALK; },
    syncBodies: () => syncBodies(), bodies: () => S.bodies },   // ★[T841] 도적 몸 실체화 문 그대로(하네스 `test-body-seed-other` — 운영 함수 · 사본 0)
  bootSlice: () => (S._boot ? { running: true, pairs: S._boot.pairs, slices: S._boot.slices, i: S._boot.i } : (S.bootSlice || null)) };   // ★[T521] 손 규칙 하나(villages 소굴 어댑터가 같은 함수를 읽는다)
