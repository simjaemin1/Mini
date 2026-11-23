# 계측/T1423_2026-11-21 — 길을 막으면(T1423) 판 · 표 · 도구 · 지키기

* `판/` — 봇 막기 판 아홉(서버 자 · 가상 시계 · 80날 · 날 10 에 봇이 놓는다 · 시드 1020 · 7 · 42 × 켬 · 대조 · 끔):
  `BOT_<팔>_<시드>_probe.json`(계측기 `scripts/t1423-block-probe.js` — 자리 · 놓은 울타리 · 쌍 걸음 비 · 날마다 서 있는 울타리 · 곁에 선 캐러밴 · T1423 셈 · 마을 굶어 죽음) ·
  `BOT_<팔>_<시드>-<시드>.json`(판 자 표).
  팔: 켬 = `T1423_NO_BUILD=1 T1423_BLOCK_REACT=1` · 대조 = 켬 + `T1423_REACT_MEET=1`(만나고 서고 가르기만 — 치우기 0) · 끔 = 손잡이 0.
* `표/` — `bot.json`(판마다 자리별 수) · `tabGroup.md`(자리 × 시드) · `tabWorld.md`(세계 — 고립 귀환 · 굶어 죽음 · 인구) · `oneblock.json`(S16 막기 자 `audit-reachability --walk --one-block` 출력 — 라이브 한반도 11-09 영토).
* `도구/` — 판 사슬 `chain.js` · 표 `ana.py` · 하네스 차례 `harn.sh` · 게이트 `gates.sh` · 판 목록 `bot.json` · 하네스 목록 셋.
* `지키기/` — 끈 판 · 켬 세 시드 400날(플레이어 없는 세계) · t17 · 게이트 셋 · 규약 · 만진 하네스 · core · 서버 잡 · 새 하네스 · 옛 코드 빨강 · 막기 자(`audit-reachability --one-block`) · 빨강 셋 다시 판(`다시_*.txt`) · distmatrix 까닭 진단(`진단_distmatrix_T1327끔.txt`) · 보고 린트 · 봇 판 사슬 시각(`판사슬_status_bot.json`).
* 다시 하는 법: `node 계측/T1423_2026-11-21/도구/chain.js 계측/T1423_2026-11-21/도구/bot.json 2`(레포 뿌리 `T1423_ROOT`) → `python3 …/도구/ana.py`.
