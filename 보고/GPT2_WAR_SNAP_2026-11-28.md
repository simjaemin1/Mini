새 저장 전쟁 snapshot 구현(기본 OFF) · native 24/24 즉시·10일 동등 · 실서버 재부팅 직후 동등 · 실제 화살2/사상1/포로1 · 전투규칙 변경0 · 성숙870 재구성·지역/CI 검증 진행 중.
사용자 GPT2 작업표 기준 · 정본 번호 확인 중. S16 `지시_T1497.md`·지도 작업과 별개이며 그 파일은 수행/수정하지 않았다.
제품 기준 `2502f282`(최신 main `c976f40e`까지 server/sim 변경0) · 고정 실행 `703ad08a` · 가지 `batch/war-snap-1128` · 손잡이 `T1497_WAR_SNAP=1`만 켬(없음/0/true = 끔).

| §0 항목 | 결과 |
|---|---|
| 새 저장/복원 | 몸·명부·대형·통제·사기·전쟁단계·ctx·탄·투사체·cd·RNG현재값·탐색heap/공유세대/alias/순환·콜백 재결합 |
| 저장 경계 | 완료된 JS 호스트/전투 step 경계 · 전쟁 rows+meta 원자저장 · 무전쟁은 종전 저장 경로(묵은 snapshot 제거 1회만 원자저장) |
| 무결성/옛 저장 | version1/complete/SHA256/참조·필수칸 검증 실패는 명시 실패 · snapshot 없는 옛 저장은 legacy 그대로(정확동등 주장0) |
| native 6단계×2seed×T1445 두 팔 | 24/24 즉시·10일 일별 지문 같음 · 조건마다 host tick 9,000회 + 정본 daily/몫 flush |
| 탐색/코너 | Map·typed pending 2/2(초기16,385pops·이어민1,012호출) · ghost 세대 재결합 · 상처/죽은지휘관/한마을두전쟁/분리시체 4/4 |
| 실서버 | 51마을·초기1,224몸·seed42·2일 저장→새 process 직후 snapshot 동일 · 4일 연속/재개 결과 동일(수비승·사상1·포로1·화살2) |
| OFF·미끼·기존검증 | OFF native 저장 main과 바이트동일 · 핵심미끼6 assert-red/비assert크래시0 · 번들16/16·배선 실패0 · 지역/CI 마감 중 |
| 회부/범위 | 인간 비마을 전투원·소굴·존경계 전쟁은 명시 미지원(새 저장 거부) · 현재 fixture 교전은 종결, 옛 W44의 누락 ctx는 만들지 않음 |

## 상태와 재결합 계약

`server/war-snapshot.js`는 함수 코드를 저장하거나 실행하지 않는 데이터 그래프 codec이다. Map/Set 순서, 희소 배열, undefined/NaN/Infinity/-0/BigInt, null prototype, typed view의 원래 buffer/offset/길이, 공유 참조와 순환을 보존한다. 외부 마을·econ·주민·몸은 명시적 열쇠로 연결한다. 임의 함수/알 수 없는 prototype은 조용히 버리지 않고 저장을 거절한다.

`war-snapshot-host.js`는 전쟁 장부와 실몸/대형/fight를 한 그래프로 묶는다. 병사 pid는 마을 dbId+몸 자리로 매핑하며 `_armsPack`/`_starve`/`_debt`/byPid/병사 배열/주민 `_warPid`까지 같은 대응을 적용한다. 루트 저장의 몸 기록과 pid/순서 명부가 빠지면 복원을 거절한다. 실제 몸 좌표에 대형·battle unit 접근자를 다시 붙이고, ctx.world/onArrow/handle과 detour 함수는 정본 함수로 재결합한다. 저장된 단위를 `spawn`/`enlist`/회관 재소집/슬롯 재배치로 대신하지 않는다. 복원 RNG draw는 0이다.

추가로 몸 밖의 전쟁 짐 BAG, 손 로트, 집인구의 몸→주민 WeakMap, 포로 이송, 죽어 누운 몸/나가는 몸, Map 삽입 순서, 전쟁 폴리라인 번호와 화살 식별자 계수를 보존한다. 분리 시체는 정확한 저장 몸을 재구성하며 새 주민을 만드는 것이 아니다. 재구성 때 `spawnNpc`의 자리 흔들기/주사위를 소비하지 않는다. 이미 T747이 예약한 중복 로트 적재는 해당 몸에 한해 제거하고 원래 raw 장부를 재결합한다.

걸음은 `path-core.snapshotState/resumeState`로 실제 frontier를 저장한다. Map backend의 closure 안 g/came/heap 배열과 typed backend의 타일, `F/G/X/Y/n/TG/tx/ty`, pops/it, 동률 heap 순서를 유지한다. `_t1349.live → J → mem → J`, `_t1338WalkLive`, `_t1381G`의 세대와 유령의 묵은 술어 메모도 같은 그래프다. 함수는 canonical local-path 술어/heap 메서드로 다시 붙인다. cost/prefer처럼 등록하지 않은 탐색 콜백은 명시 실패다. 근접점 재계산처럼 원문에 '값 무관'이라고 선언된 WeakMap 조회 캐시는 다시 계산하며, 탐색 진행/공유세대와 혼동하지 않는다.

시각은 기존 T1340의 시간 분류와 같은 범위(저장 시각에 가까운 epoch ms)를 저장 시각 기준 차로 재결합한다. econ 날·전투 초·걸음 몫은 원래 축 그대로다. 같은 코드/시계/feature flags의 재개가 검증 범위이며 핵심 물리/heap/공유/예산/Hz/day 프로필이 다르면 거절한다.

## 실제 저장과 부팅 순서

`_t728Meta`의 `t1497WarSnap`은 checksum을 가진 versioned complete graph다. 활성 전쟁/귀환 몸이 있으면 그 순간의 모든 마을 행과 함께 기존 `saveVillagesAndMeta` 한 트랜잭션으로 쓴다. 무전쟁 새 세계는 payload도 저장 큐도 원래 경로다. 전쟁이 끝나 이전 snapshot을 제거할 때만 마지막으로 원자저장한다.

JS 실행 도중 임시 ctl을 푼 상태나 아직 끝나지 않은 호스트/경제 step의 정상 저장 요청은 module-global pending으로 모아 완료 경계로 미룬다. 낮은 직접 원자저장 API의 위험한 재진입은 SQL 전에 명시 거절한다. 정상 일일/종료 저장은 그 호출 스택 밖에서 이루어진다. `saveVillagesAndMeta`의 SQL 원자성과 런타임 안전 경계를 별도로 검사한다.

새 snapshot을 읽을 때는 legacy 재징발/재개전과 무기 거울 환급을 실행하지 않는다. 기존 부팅이 마을·몸·로트·시계 기반을 세운 뒤 전체 그래프를 검증하고 직접 붙인다. 따라서 저장 위치를 집 앞으로 바꾸거나 `_muster`만 지워 수비를 다시 뽑지 않는다. 잘못된 새 snapshot은 `WAR_SNAP_INVALID`로 부팅을 실패시킨다. snapshot 없는 유효 옛 저장과 옛 메타 오류는 원래 legacy 처리이며, 옛 저장이 새 exact snapshot으로 승격됐다고 쓰지 않는다.

## 검증의 자와 관측 범위

native matrix는 seed 7/42와 T1445 ON/OFF 각각에서 소집·행군·포위·교전·귀환·함락 직후(정본 항복)를 실제 `warMobilize`/daily/몸 틱으로 만든다. 소집은 아직 body가 서기 전, 행군은 공격 그룹만 선 상태, 포위는 정본 op=siege·form ctx가 있는 상태(이 fixture 후속 BC step은 0), 교전은 실제 비행탄이 있는 상태, 귀환과 함락 직후는 정본 정책 전이 뒤 상태다. phase 문자열만 바꾼 fixture가 아니다. 포위/항복 fixture의 식량·직업·무장 입력은 하네스에서 명시적으로 준비한다.

checkpoint 뒤 각 조건에서 30Hz host tick 900회/일 × 10일 = 9,000회를 호출한다. 하루 길이 30,000ms이며 `_t681Flush → world.day++ → war.daily → _warAfterDaily → _t681Day` 순서다. 실제 battle step 수·dt 합·발사·문 분포는 조건별 protocol에 별도로 남는다. 전투가 끝나면 이후 날에 억지로 전투 step을 만들지 않는다. 이 판은 전쟁 호스트 fixture이며 경제 전체를 10일 똑같이 실행한 판이라고 확대하지 않는다.

pid를 p1…에서 p300…으로 다르게 부팅한 native 판은 동일 몸 슬롯의 전단사 매핑으로 모든 역참조를 비교한다. process allocator `nextPid`, 순수 성능 누계 `_stepMs`, 저장 경계 `at`, 원래 process PID namespace를 담은 `bodyIds`는 의미 지문에서 제외한다. `bodyIds` 원본값은 별도 cold boot/실서버 직후 검사에서 원래 PID까지 대조했다. Map/Set 순서·typed buffer alias·실제 좌표·HP·cd·RNG·명부·통제·탄·전쟁 결과는 제외하지 않는다.

실서버는 실제 zone/new DB/실지도/생활층/집 켬으로 만든 별도 새 세계다. 운영 하루를 30초로 가속한 시험이며 `T941_BATTLE_DAY=0`, `T627_TRIP_DAY=0`, seed42, 초기24명×51마을, `VILLAGE_CARAVAN_MAX=0`, 도적 끔이다. 현재 T1182에서는 이 cap 값만으로 캐러밴 실몸이 없어지지 않으므로 실제 몸 수와 별도로 기록했다. 가장 가까운 실제 마을 두 곳의 직업/무장/정책 입력을 준비하고 정본 mobilize로 선포했다. 원본870/W44 복구라고 부르지 않는다.

2일 checkpoint→새 process 직후 비교는 원래 playerId까지 보존됐다. 독립 새 세계 연속판 및 이후 새로 태어난 몸의 비교에서만 무작위 `records[*][1].playerId` 꼬리를 제외한다. 레코드 열쇠 집합·pid의 슬롯 대응·`_econId`는 유지하며 서로 다른 몸을 합치지 않는다. 전쟁 snapshot 그래프와 4일 전쟁 통계/사상/병력 결과를 비교한 것이며 51마을의 모든 비전쟁 상태가 byte 동일하다는 주장이 아니다.

## 안 끝나는 교전의 문

기존 `physical` 사수는 ctl 상태라도 실제 사거리/탄 조건이 맞으면 그 step만 ctl을 풀어 정본 BC를 부른다. 따라서 'ctl=true인 궁수 37명'만으로 무발사를 판정하지 않았다. form 준비, 거리/clear, `_t790Walk`, walk-out, 전진 풀기, 진척/탐색, 실제 BC 진입과 탄 감소를 따로 관측한다.

실제 zone 판은 총 BC 1,248step·41.6전투초, 화살 2발이었다. form-wait 1,069회를 거쳐 종결했다. 재개 구간은 348step·11.6초·화살2발, 저장 앞 구간은 900step·30초·화살0이다. 이 판에서 비종결은 관측되지 않았으며 form-wait 횟수를 비종결 원인으로 단정하지 않는다. 옛 W44는 당시 ctx탄/세부 해제문이 저장되지 않아 그 문을 이번에 지어내지 않는다. 전투 해제 조건·사거리·속도·탐색 예산·피해/사기 규칙 변경은 0이다.

## 범위와 보존

NPC 마을 전쟁의 위 계약이 대상이다. 비마을 인간 전투원, 소굴 어댑터, 존경계 전쟁/미등록 콜백은 현 버전에서 명시 미지원이며 incomplete exact 저장으로 꾸미지 않는다. 기본은 OFF다. 기능을 OFF로 바꾸거나 코드/물리 flags를 바꾼 재시작은 같은 코드/flags exact 계약 밖이다.

기존 T1481/T1482 원본 DB/WAL/SHM은 열지 않았다. 실제 새 checkpoint도 DB 세 파일을 scratch에 복사한 뒤에만 재부팅에 사용했고 원본 hash를 보존했다. T1482의 과거 SHM 변경 메모를 덮거나 원복했다고 하지 않는다. 배포·SSH·force push·main push는 0이다.

성숙870 재구성 및 지역/CI 검증 중 — 완료 전입니다.

쓰기문 추가 감사: `updateVillageState`는 초기 빈 행, 일일 큐, `_vilRowSave` 세 경로다. 거래·기부·집터 자재·제작/납품·구제·낚시/사냥은 `_vilRowSave`로 모인다. 새 snapshot이 활성일 때 이 경로도 현재 몸/전쟁과 전체 마을 행을 함께 원자저장한다. 진행 중인 경제/전투 호출은 완료 경계로 미루며 옛 snapshot+새 단일 econ 행을 쓰지 않는다. zone의 낡음/길 메모 등 독립 world_meta 키 셋은 전쟁 zone meta 키와 별개다. CAP=1 cold boot는 저장된 village몸99/전체actors130을 그대로 복원했다. village/전쟁몸 spawn 0, T1372 기존 캐러밴/호위 재구성31, 추가 배우0이며 원래pid·좌표·HP·ctx·RNG까지 즉시 동일했다.

검증 마감 중간 근거: 데이터 계약14/14, 기본OFF를 켬으로 바꾼 단일원인 미끼는 `unset must preserve explicit OFF canonical bytes` 단언 빨강(크래시0), 기존 6상태 미끼까지 합7개다. 공식 old-code-red 3/3 단언 빨강·크래시0, 하네스 규약102/102. 800일 경제3seed(1020/7/42)는 기준2502 대비 JSON 전체 바이트가 같다. 관련회귀 route-persist 첫판은55통과/4실패이며 당시 경제장판 CPU경합이 있었으므로 단독 재검증 대상으로 남겼다.

최종 무결성 보완: 개발초기 v1 명부 fallback은 제거했다. bodyIds 누락·중복·records와 대응하지 않는 manifest 및 필수 host memory 누락은 재계산 checksum이 있어도 prepareBodies/restore 모두 `WAR_SNAP_INVALID`다. 최종 제품의 추가 차이는 이 거부 검증이며, 성숙870 판은 불변703 소스로 계속 측정한다. 유효703 snapshot에는 manifest가 있어 그 분기는 사용되지 않는다. 보완 후14/14와24/24를 다시 통과했다. `native-protocols-final.json`은24조건 모두9000 host tick과 실제 단계/body/group/ctx·후속BC step/dt 합을 공개한다.

공식 old-code-red의 3종 빨강은 모두 `complete snapshot product API absent` 전제 단언이다. 이것을 3종 각각의 행동 차이 증명으로 확대하지 않는다. 실제 상태 보존/누락 감지는 native 연속-재개 비교와 별도 단일원인 미끼7개가 담당한다.
