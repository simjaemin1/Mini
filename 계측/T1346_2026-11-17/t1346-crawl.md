# T1346 ④ 기어감 — 끔 세계 + 고침(T1342 OKG 꼴) 시드 7 · 날 757 ~ 764 CPU 프로파일

판: `bash prof46.sh 764`(`T1334_BUNDLE=1 T325_WOOD_ACT=0 T1207_TERR_REAL=0 T1238_TERR_V2=0 T1283_WOOD_DEMAND=0` · `--vclock --side off` · 존 아이 `--cpu-prof --cpu-prof-interval 10000`) — 날 757 에 닿은 뒤 하루 6 ~ 10분(날 757 21:57 · 758 22:06 · 759 22:14 · 760 22:2x · 762 22:43 · 764 22:51 UTC).

## ⓐ 기어가는 동안 붙어서 잰 120초(날 757 · inspector `Profiler` · 10 ms 표본)
```
# prof/crawl-757.cpuprofile · 표본 시간 120.1s(시작 0ms 뒤)
## 자기 시간
 19.6%      23.5s  _standCellNear server/zone.js:15818
 10.7%      12.9s  _muSeparate server/war-live.js:217
 10.0%      12.0s  get server/war-live.js:78
  9.3%      11.1s  gGet sim/path-core.js:196
  9.1%      10.9s  get server/war-live.js:79
  8.8%      10.6s  (garbage collector) :0
  8.3%      10.0s  _warStandNear server/villages.js:8811
  4.8%       5.7s  _searchStep sim/path-core.js:325
  3.7%       4.4s  cameSet sim/path-core.js:199
  3.6%       4.4s  blockedStep server/villages.js:8936
  2.0%       2.4s  _muStepFollow server/war-live.js:231
  1.5%       1.8s  (anon) server/war-live.js:417
  1.1%       1.3s  stepFight server/war-live.js:410
  0.9%       1.0s  _t804Nearest server/villages.js:9002
  0.6%       0.8s  updateMorale sim/battle-core.js:426
## 포함 시간
100.0%     120.1s  (root) :0
 91.2%     109.5s  pump scripts/t745-vclock.js:100
 91.2%     109.5s  processImmediate node:internal/timers:436
 91.2%     109.5s  (anon) server/zone.js:17099
 91.0%     109.3s  onGameTick server/villages.js:10820
 90.5%     108.7s  g server/villages.js:11029
 90.5%     108.7s  _drainTickJobs server/villages.js:11579
 90.5%     108.7s  _t731Tick server/villages.js:10998
 89.8%     107.9s  _warTickOne server/villages.js:10571
 89.8%     107.9s  (anon) server/villages.js:11034
 83.2%      99.9s  _muStepFollow server/war-live.js:231
 81.8%      98.3s  _warAdvanceMarch server/villages.js:10667
 29.3%      35.2s  _muSeparate server/war-live.js:217
 28.1%      33.8s  _warStandNear server/villages.js:8811
 28.1%      33.8s  det.target server/villages.js:9114
```
## ⓑ 부른 자 · 부른 것(날 757)
```
## _muStepFollow 부른 자
 80.3%  _warAdvanceMarch villages.js:10667
  2.9%  _warWalkGroupTo villages.js:9527
## _muStepFollow 가 부른 것
 29.3%  _muSeparate war-live.js:217
 27.6%  det.target villages.js:9114
 23.7%  det.walk villages.js:9113
  2.0%  (self)
  0.2%  (anon) war-live.js:236
  0.2%  (anon) war-live.js:271
  0.1%  get war-live.js:78
  0.1%  blockedCell villages.js:8459
  0.1%  get war-live.js:79
  0.0%  set war-live.js:79
  0.0%  set war-live.js:78
## _warAdvanceMarch 부른 자
 81.9%  _warTickOne villages.js:10571
## _warAdvanceMarch 가 부른 것
 80.3%  _muStepFollow war-live.js:231
  0.9%  _warGroupReady villages.js:10663
  0.4%  (self)
  0.2%  _warWalkCap villages.js:8602
```
## ⓒ 날 760 다시 60초(같은 꼴)
```
# prof/crawl-760.cpuprofile · 표본 시간 60.1s(시작 0ms 뒤)
## 자기 시간
 20.3%      12.2s  _standCellNear server/zone.js:15818
 11.3%       6.8s  _muSeparate server/war-live.js:217
 11.1%       6.7s  get server/war-live.js:78
  9.7%       5.9s  get server/war-live.js:79
  8.9%       5.4s  (garbage collector) :0
  8.6%       5.2s  _warStandNear server/villages.js:8811
  8.3%       5.0s  gGet sim/path-core.js:196
  4.1%       2.5s  _searchStep sim/path-core.js:325
## 포함 시간
```
## ⓓ 판 전체 프로파일(존 아이 `--cpu-prof` · 판 끝에 씀) — 시작 2,000초 뒤(기어간 54분)
```
# prof/CPU.20261117.212358.10835.0.001.cpuprofile · 표본 시간 3239.9s(시작 2000000ms 뒤)
## 자기 시간
 20.3%     657.9s  _standCellNear server/zone.js:15818
 11.7%     378.1s  _muSeparate server/war-live.js:217
 10.7%     348.0s  get server/war-live.js:78
  9.2%     298.5s  get server/war-live.js:79
  8.7%     282.2s  (garbage collector) :0
  8.7%     281.5s  _warStandNear server/villages.js:8811
  8.2%     264.6s  gGet sim/path-core.js:196
  3.9%     128.0s  _searchStep sim/path-core.js:325
  3.3%     106.9s  blockedStep server/villages.js:8936
  3.0%      97.6s  cameSet sim/path-core.js:199
## 포함 시간
```
## ⓔ 그때 전쟁(존 `warPerf()` 읽기만 — inspector `Runtime.evaluate` · 날 760 · 22:28 UTC)
```
{ "soldiers": 197, "bodies": 1, "fights": 1, "engaged": 0, "wars": 1, "stat": { "engage": 30, "standoff": 3, "rout": 26, "withdrawQuiet": 5 } }
```
전쟁 몸 하나 · 싸움 하나(`advance` — 아직 안 붙음) · 병사 197. 그 싸움의 다가가는 쪽 대형이 슬롯에 다 모이지 못해(`T790_NO_SNAP` · `A.formed` 거짓 · `_warGroupReady` 거짓)
`_warAdvanceMarch` 가 틱마다 `_muStepFollow`(슬롯 추종) 만 부른다 — 그 안이 분리(`_muSeparate` · 병사 쌍 197² 훑기) · 설 칸 찾기(`det.target` → `_warStandNear` → 존 `_standCellNear`) · 걸음 탐색(`det.walk` → `_t804Way` → `_t804Local` → path-core `pathStep`).
⇒ 행군 길찾기 — T1349(S5 · `batch/long-run-stall-1117`) 몫. 이 카드는 줄만 적는다(코드 손 0).

## ⓕ 묶음 + 고침(T1346 제품 글) 시드 7 두 해 판 — 날 680 에서 같은 꼴(30초 · inspector)
```
# prof/f7r-680.cpuprofile · 표본 시간 30.0s(시작 0ms 뒤)
## 자기 시간
 45.9%      13.8s  _standCellNear server/zone.js:15818
 22.4%       6.7s  _warStandNear server/villages.js:8811
  7.4%       2.2s  get server/war-live.js:79
  7.3%       2.2s  _muSeparate server/war-live.js:217
  5.6%       1.7s  get server/war-live.js:78
  3.1%       0.9s  (garbage collector) :0
  1.8%       0.5s  _muStepFollow server/war-live.js:231
  1.2%       0.4s  _t804Local server/villages.js:8913
  0.9%       0.3s  updateMorale sim/battle-core.js:426
  0.5%       0.1s  _warRectHas server/villages.js:9051
  0.4%       0.1s  _warClearLine server/villages.js:9143
  0.3%       0.1s  _mkHeap sim/path-core.js:56
## 포함 시간
```
전쟁 몸 1 · 싸움 1(안 붙음) · 병사 178(존 `warPerf()` 읽기만). 판은 날 680 에서 세웠다 — 훅 줄은 날 680 까지 다 쓰였다.

## ⓖ 끔 세계 시드 1020 세 해 판(이 카드 · `--side off` · T1346 훅) — 날 947(3년 10월)에서 같은 꼴(30초 · inspector)
날 0 ~ 946 을 46분에 돌고(하루 3초) 날 946 → 947 에 8분 · 날 948 은 그 뒤 5분 넘게 안 왔다. 붙어서 잰 30초(날 947):
```
# prof/off1020-947.cpuprofile · 표본 시간 32.1s
## 자기 시간
 18.5%       5.9s  _muSeparate server/war-live.js:217
 18.4%       5.9s  get server/war-live.js:78
 14.8%       4.7s  _standCellNear server/zone.js:15818
 14.1%       4.5s  get server/war-live.js:79
  7.3%       2.3s  (garbage collector) 
  5.8%       1.8s  _warStandNear server/villages.js:8811
  3.2%       1.0s  (anon) server/war-live.js:417
  2.6%       0.8s  gGet sim/path-core.js:196
  2.0%       0.6s  _muStepFollow server/war-live.js:231
  1.8%       0.6s  stepFight server/war-live.js:410
## 포함 시간
 92.7%      29.7s  _warTickOne server/villages.js:10571
 80.6%      25.8s  _muStepFollow server/war-live.js:231
 79.2%      25.4s  _warAdvanceMarch server/villages.js:10667
 50.2%      16.1s  _muSeparate server/war-live.js:217
 20.7%       6.6s  _warStandNear server/villages.js:8811
 20.7%       6.6s  det.target server/villages.js:9114
 18.4%       5.9s  get server/war-live.js:78
 14.9%       4.8s  _standCellNear server/zone.js:15818
 14.1%       4.5s  get server/war-live.js:79
  8.2%       2.6s  det.walk server/villages.js:9113
```
그때 전쟁(존 `warPerf()` 읽기만): 전쟁 몸 2 · 싸움 2(안 붙음 · `engaged` 0) · 병사 240 · 누계 붙음 43 · 대치 8 · 무너짐 33.
판은 날 947 에서 세웠다(inspector `process.exit(0)` — 훅이 끝 줄을 써서 날 947 까지 남음) — 세 해 칸 끔 쪽은 "날 947 까지".
⇒ 셋째 같은 꼴(끔 7 날 761 · 고침 7 날 680 · 끔 1020 날 947) — 세계 · 손잡이와 무관하게 다가가는 대형이 슬롯에 못 모이면 행군이 끝나지 않는다 · T1349 몫.
