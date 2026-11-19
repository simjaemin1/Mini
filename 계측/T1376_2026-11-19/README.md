# 계측/T1376_2026-11-19 — 두 존 캐러밴 가상 시계 판 빨강 20/20 고침(세션8)

보고 `보고/T1376_2026-11-19.md`. 판은 다 이 상자(vCPU 2)에서 가상 시계(T745 + T1320 발맞춤) 두 존 판 · 하루 3,000ms · 고정 포트 판은 한 번에 하나(판 사슬).

| 자리 | 무엇 |
|---|---|
| `진단/` | 진단 판 D0 · D1 · D2 · D3 · D5 · D6 · D7 출력(`D*.txt` — e2e 판정 줄 그대로) · 진단 픽스처 `diag-linger.js`(러너 밖 · 존 프로세스에 `--require` · villages.js 에 기록 줄 셋 — 동작 0) · 몸 때 맞대기 출력 `lgan_D0.txt` · `lgan_D5.txt` · `lgan_D6.txt` · `lgan_D7.txt`(도구 `도구/lgan.py`) · D0 다시 뜬 닛폰 로그 발췌 `D0_nippon-2_발췌.txt` |
| `e2e/` | 합친 나무(`7eee1d2ba`) 기본 판 E01 ~ E20 · 베이스 제품 X1 · 고침 ①② 끈 X0 출력(`*.txt`) · 상자 재부팅으로 끊긴 E06 첫 판(`E06_재부팅끊김.txt` — 다시 돌린 E06 이 표에 든다) · 표(`표.md` — `도구/e_rows.py` · `도구/e2e_table.py` · 서명 `도구/sig.py`) |
| `판/` | 3시드 300날 두 존 판 — 고침 뒤 L1020 · L7 · L42(합친 나무) · 고침 앞 LB1020 · LB7 · LB42(land1084 나무 `0efc1b193`) · 같은 자 `t1324-vclock-beast.js run … --nobeast --env T952_XZ_STAY=0` — 분석 `an1292_*.json`(`t1292-xzone-live.js analyze` — 판이 고정 포트를 쥔 동안 돌려 포트 기다림 한 줄만 뺀 껍데기 `도구/nohold.js` 로 실음 · 셈 무변) · 하루 줄 끝 맞춤 `lan_*.json`(`도구/lan.py`) · 판 머리 `meta_*.json` · 판 끝 `final_*.json` · 표 `표.md`(`도구/l_rows.py` · `도구/cmp_lb.py`) · 존 DB(판마다 1.3 ~ 1.4GB)는 분석 뒤 지웠다(`도구/post_l.js`) |
| `지키기/` | 끈 판(11-18 정본 · 11-16 `T1327_ROUTE_FIX=0` · ① 나무 11-16) · t17(합친 나무 · land1084 · ① 나무) · 게이트 셋 · 옛 코드 빨강(main · land1084 · 고친 하네스 둘) · touched 목록 · 러너 판 · lint |
| `도구/` | 판 사슬 `chain.js` · `after.js` · `runB.js` · 판 목록 `판목록_*.json` · 지키기 `guards.sh` · 서명 `sig.py` · e2e 표 `e2e_table.py` · `e_rows.py` · 진단 `lgan.py` · 300날 `lan.py` · `l_rows.py` · `cmp_lb.py` · 뒤처리 `post_l.js` · `nohold.js` · 싣기 `pack.py` |
