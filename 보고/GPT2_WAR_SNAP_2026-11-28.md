마을·전쟁 몸2043/ctx120 즉시보존 통과 · 전역세계동등/NPC소멸0 실패(명부밖NPC8·유형미확정) · 기본OFF · 비종결 미재현.
사용자 GPT2 작업표 기준 · 정본 번호 확인 중. S16 `지시_T1497.md`·지도 작업과 별개이며 그 파일은 수행/수정하지 않았다.
제품 기준 `2502f282`(main `c976f40e`까지 server/sim 변경0) · 최종제품 `7ccaa48e` · 성숙저장 `703ad08a` · 가지 `batch/war-snap-1128`.

| §0 항목 | 결과 |
|---|---|
| 손잡이 | `T1497_WAR_SNAP=1`만 켬 · 없음/0/true는 끔 · 배포/전투규칙 변경0 |
| 새 저장 | 몸·명부·대형·통제·사기·ctx·탄·cd·RNG·탐색/alias/콜백 · 안전경계 rows+meta 원자저장 |
| 성숙 실제 경계 | 666일 W25 정상종료 51행·ctx120 → 새 process 2043기록/원래pid·HP·좌표·ctx·RNG 보존 |
| 전역 한계 | 전체 graph 실패 · 명부밖NPC8 누락(2332→2324, 추가0) · 유형미확정 · 다른영역 후속 회부 |
| native 하한 | 6단계×2seed×T1445 양팔 24/24 · 즉시/후속10일(9000host tick) 같음 · pending Map/typed 노출 |
| 실제 해제문 | 재개 BC10908/363.6초 · form5600/clear막힘5070 뒤 정상해제·종결 · 비종결 미재현 |
| OFF/무전쟁 | 기준과 native저장 byte같음 · seed1020 실제10일 OFF/ON meta·51개마을행 byte같음 |
| CI/미끼 | 제품7cc CI13개잡 success · native미끼7 assert-red · old-red3 API전제 단언/크래시0 |
| 지역/기준선 | CI밖7종 RC0 · route 신규55/4·main55/4 동일4항목 재현 · 870완주 주장0(rc3 조기종료) |

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

pid를 p1…에서 p300…으로 다르게 부팅한 native 판은 동일 몸 슬롯의 전단사 매핑으로 모든 역참조를 비교한다. native 지문 함수는 모든 깊이에서 key 이름이 `nextPid`, `_stepMs`, `at`, `bodyIds`인 칸을 제외한다. 원래 process PID namespace를 바꾼 fixture의 비교 규칙이며 의미 있는 시각까지 일반적으로 검증했다는 주장으로 확대하지 않는다. 성숙666의 별도 엄격 비교는 이 네 key도 제외하지 않았다. `bodyIds` 원본값은 별도 cold boot/실서버 직후 검사에서 원래 PID까지 대조했다. Map/Set 순서·typed buffer alias·실제 좌표·HP·cd·RNG·명부·통제·탄·전쟁 결과는 제외하지 않는다.

실서버는 실제 zone/new DB/실지도/생활층/집 켬으로 만든 별도 새 세계다. 운영 하루를 30초로 가속한 시험이며 `T941_BATTLE_DAY=0`, `T627_TRIP_DAY=0`, seed42, 초기24명×51마을, `VILLAGE_CARAVAN_MAX=0`, 도적 끔이다. 현재 T1182에서는 이 cap 값만으로 캐러밴 실몸이 없어지지 않으므로 실제 몸 수와 별도로 기록했다. 가장 가까운 실제 마을 두 곳의 직업/무장/정책 입력을 준비하고 정본 mobilize로 선포했다. 원본870/W44 복구라고 부르지 않는다.

2일 checkpoint→새 process 직후 비교는 원래 playerId까지 보존됐다. 독립 새 세계 연속판 및 이후 새로 태어난 몸의 비교에서만 `records[*][1].playerId` 값을 통째로 제외했다(무작위 꼬리만 문자열 치환한 것이 아니다). 레코드 열쇠 집합·pid의 슬롯 대응·`_econId`는 유지하며 서로 다른 몸을 합치지 않는다. 전쟁 snapshot 그래프와 4일 전쟁 통계/사상/병력 결과를 비교한 것이며 51마을의 모든 비전쟁 상태가 byte 동일하다는 주장이 아니다.

## 안 끝나는 교전의 문

기존 `physical` 사수는 ctl 상태라도 실제 사거리/탄 조건이 맞으면 그 step만 ctl을 풀어 정본 BC를 부른다. 따라서 'ctl=true인 궁수 37명'만으로 무발사를 판정하지 않았다. form 준비, 거리/clear, `_t790Walk`, walk-out, 전진 풀기, 진척/탐색, 실제 BC 진입과 탄 감소를 따로 관측한다.

실제 zone 판은 총 BC 1,248step·41.6전투초, 화살 2발이었다. form-wait 1,069회를 거쳐 종결했다. 재개 구간은 348step·11.6초·화살2발, 저장 앞 구간은 900step·30초·화살0이다. 이 판에서 비종결은 관측되지 않았으며 form-wait 횟수를 비종결 원인으로 단정하지 않는다. 옛 W44는 당시 ctx탄/세부 해제문이 저장되지 않아 그 문을 이번에 지어내지 않는다. 전투 해제 조건·사거리·속도·탐색 예산·피해/사기 규칙 변경은 0이다.

## 범위와 보존

NPC 마을 전쟁의 위 계약이 대상이다. 비마을 인간 전투원, 소굴 어댑터, 존경계 전쟁/미등록 콜백은 현 버전에서 명시 미지원이며 incomplete exact 저장으로 꾸미지 않는다. 기본은 OFF다. 기능을 OFF로 바꾸거나 코드/물리 flags를 바꾼 재시작은 같은 코드/flags exact 계약 밖이다.

기존 T1481/T1482 원본 DB/WAL/SHM은 열지 않았다. 실제 새 checkpoint도 DB 세 파일을 scratch에 복사한 뒤에만 재부팅에 사용했고 원본 hash를 보존했다. T1482의 과거 SHM 변경 메모를 덮거나 원복했다고 하지 않는다. 배포·SSH·force push·main push는 0이다.

성숙세계는 666일 정상 저장 후 새 process로 667일까지 관측했다. 870일은 완주하지 않았다. 로컬 지역7종과 단독 route/동일 main 대조를 마쳤다.

쓰기문 추가 감사: `updateVillageState`는 초기 빈 행, 일일 큐, `_vilRowSave` 세 경로다. 거래·기부·집터 자재·제작/납품·구제·낚시/사냥은 `_vilRowSave`로 모인다. 새 snapshot이 활성일 때 이 경로도 현재 몸/전쟁과 전체 마을 행을 함께 원자저장한다. 진행 중인 경제/전투 호출은 완료 경계로 미루며 옛 snapshot+새 단일 econ 행을 쓰지 않는다. zone의 낡음/길 메모 등 독립 world_meta 키 셋은 전쟁 zone meta 키와 별개다. CAP=1 cold boot는 저장된 village몸99/전체actors130을 그대로 복원했다. village/전쟁몸 spawn 0, T1372 기존 캐러밴/호위 재구성31, 추가 배우0이며 원래pid·좌표·HP·ctx·RNG까지 즉시 동일했다.

검증 마감 중간 근거: 데이터 계약14/14, 기본OFF를 켬으로 바꾼 단일원인 미끼는 `unset must preserve explicit OFF canonical bytes` 단언 빨강(크래시0), 기존 6상태 미끼까지 합7개다. 공식 old-code-red 3/3 단언 빨강·크래시0, 하네스 규약102/102. 800일 경제3seed(1020/7/42)는 기준2502 대비 JSON 전체 바이트가 같다. 관련회귀 route-persist 첫판은55통과/4실패이며 당시 경제장판 CPU경합이 있었으므로 원인 단정 없이 아래 단독/원래main 대조로 분리했다.

최종 무결성 보완: 개발초기 v1 명부 fallback은 제거했다. bodyIds 누락·중복·records와 대응하지 않는 manifest 및 필수 host memory 누락은 재계산 checksum이 있어도 prepareBodies/restore 모두 `WAR_SNAP_INVALID`다. 최종 제품의 추가 차이는 이 거부 검증이며, 성숙 판은 불변703 소스로666일까지 측정하고 정상 저장 뒤 내렸다. 유효703 snapshot에는 manifest가 있어 그 분기는 사용되지 않는다. 보완 후14/14와24/24를 다시 통과했다. `native-protocols-final.json`은24조건 모두9000 host tick과 실제 단계/body/group/ctx·후속BC step/dt 합을 공개한다.

공식 old-code-red의 3종 빨강은 모두 `complete snapshot product API absent` 전제 단언이다. 이것을 3종 각각의 행동 차이 증명으로 확대하지 않는다. 실제 상태 보존/누락 감지는 native 연속-재개 비교와 별도 단일원인 미끼7개가 담당한다.

CI 1bd4 제품 검증 중 기존 정적 하네스의 문자열 연동3개가 실패했다. T1167은 주석까지 포함해 찾던 rebuildFromEcon 위치를 실제 호출 문자열로 찾도록 고쳤고, war-nosnap은 원래 return 조건을 그대로 유지하면서 단일 관측gate 블록 및 tickWarBodies→_tickWarBodies wrapper의 OFF direct call-through/ON finally를 함께 검사한다. 제품 수정0. 이후 war-nosnap62/62·T1167 14/14, 두 하네스 각5회 green이다.

## 성숙666 경계와 정확한 실패 범위

seed42·Node24.22.1·집/캐러밴 raw flags `T400_BUILD_ACT=0`, `VILLAGE_CARAVAN_MAX=0`, `T745_VCLOCK=1`, `T1445_BOOT_BOUND=1`·6GB의 현재 새 세계다. 불변703 작업트리에서 870을 목표로 시작했지만 후반 지연으로 검증 계획을 조정했다. 633일 읽기 inspector 조회는 전쟁0이므로 snapshot 통과로 세지 않았다. 657일 교전은 기존866 관측창 밖이라 기록하지 못했다. 동일 observer 파일을663일 재적재하고 전역 WeakMap 관측기를 attach했다. 원문·SHA256·CDP 설치문·결과를 `계측/.../mature666/`에 보존했다. 물리 flag/원래 ctx/RNG/phase 변경0이며 inspector는 관측 설치에만 썼다.

다음 자연 W25 농촌8→어촌8의666일에 실제 ctx120과 완료된 host/econ 경계를 잡았다. 정상 SIGTERM→정본 t728Shutdown이51개행+version1 complete snapshot을 저장했다. 원래 T1308 runner의 rc3은870 checkpoint가 아닌 곳에서 의도적으로 내린 결과이며, 완주 성공도 제품 저장 실패도 아니다. 별도로 정상종료 저장·checksum/명부·파일사본 무결성을 확인했다. 원본 DB/WAL/SHM은 새 SQLite 연결로 열지 않고 hash→사본→hash 보존 후 사본으로만 재개했다. 위상/keep 파일의 실제 날은666이다.

저장703→최종제품7cc 새 process의 엄격 그래프 비교는 **전역 실패**다. 마을676몸+분리1367몸=2043 기록·원래pid·좌표·HP·대형·통제·ctx120·투사체·탄·cd·RNG·heap/Map/alias·nextPid44901은 일치한다. `at/nextPid/bodyIds/_stepMs`도 제외하지 않은 비교에서 차이는 `playerOrder`와 `npcOrder`뿐이다. 명부밖NPC8(p37155~p37158, p43044~p43047)이 없으며 추가 몸은0이다. 해당8토큰만 뺀 잔존2324몸의 전체 상대순서도 같다. 이 제외 비교를 전체 graph 성공으로 세지 않는다. 저장 그래프는 이 NPC의 몸 데이터를 records에 담지 않았으므로 유형은 미확정이다. T1372 캐러밴91/91·281몸 복원 로그와 별도 Bandits `T1438_DECAY before initialization` 복원 오류가 있으나, 이를8몸의 유형 증명으로 쓰지 않는다. 전역 NPC 소멸0/전체세계동등은 충족하지 못했고 다음 카드로 회부한다. 이 판은666 이후 연속 대조 process가 없으므로 성숙세계 후속 경로/결과 동등성 주장도0이다.

W25 저장 전 실제 BC6817step/227.233초에 화살20·돌315를 썼다. 저장 뒤 실제667일까지 BC10908step/363.6초 동안 form-wait5600→form-ready1, 반경 안 clear 막힘5070+실제 전진5070→clear1/advance-release1을 봤다. 처음 blocked 거리는45.124m, 해제 전투시각582.9초다. 저장 뒤 탄0으로 제어 사수 탄없음202737 unit-step·발사0이었으나 이후 근접전과 정본 종결이 있었다(귀환4명). 제어 궁수 한 장면만으로 무발사 원인을 판정하지 않았고 이 새 W25에서 비종결은 재현되지 않았다. 옛 W44의 ctx를 추정하지 않는다.

seed1020 별도 무전쟁10일 OFF/ON 양팔은 각각86초/85초에 종료했다. 선포/교전/snapshot payload0이며 zone meta 문자열과 villages의9개컬럼51행이 바이트 동일, pop613·dead0·51마을 및 결과지표가 같다. 이것은 SQLite 파일/WAL의 물리 바이트나 모든 별도 표의 동일성 주장이 아니다.

## 최종 지역 검사와 CI

CI 밖 기존7종(T1338 war-tick, T1349 war-stall, T1381 walk-heap, T1431 raid-battle, T1429 hunt-body3, T1459 raid-ground, war-world)은 모두 RC0이다. `WAR_WORLD_NO_SERVER=1` 조건이며 별도 실서버7판으로 세지 않는다. 나머지 core 중복은 제품7cc CI 통과 결과를 재사용했다. 중간에 중단한 혼합 로컬 러너의 미실행 부분을 통과로 세지 않았다.

`test-route-persist.js`는 첫판55통과/4실패였고 당시 다른 경제판 CPU 경합이 있었다(원인 미확정). 다른 CPU 검증을 끝낸 뒤 신규 소스 단독도55/4·476.6초, 동일 Node/flags 원래main c976 단독도55/4·461.6초였다. 두 단독판에서 같은4항목이 재현됐다: 캐시 신규221/main243(<594), 후속콜드18/14, 캐러밴최대94>60ms/125>81ms, 전쌍재탐색245/594·263/594. '새 회귀가 아니다'라고 단정하지 않는다. 동일 환경 main에서도 같은4검사가 실패한 기준선 한계로 회부하며 기대값/문턱/제품 변경0, 추가 실행0이다. raw 로그·source SHA는 `/workspace/scratch/war-snap-route-solo/`에 있다.

최종 제품/하네스 소스7ccaa48e는 CI46039640008의13개 잡 모두 success다. 근거는 `계측/.../ci-green-7ccaa48e.json`이다. 이후 성숙/무전쟁 증거와 보고만 추가했으며 `.github/scripts/server/sim/public/lab` 소스는7cc와 같다. 자료 커밋653의 중복 fullCI 및 최종 보고 전용 커밋 CI의 실제 현재 상태는 최종 인계에 따로 기록하며, 제품CI13개green과 혼동하지 않는다. 배포·SSH·force/main push는0이다.
