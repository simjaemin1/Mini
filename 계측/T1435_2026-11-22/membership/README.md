# T1435 덧붙임 — `e2e-membership` ⑦ 이분 자료 (2026-11-23)

* `bisect.tsv` — `scripts/t1435-bisect.sh` 한 줄 = 커밋 · 판 · G/R · 초 · ⑦ 줄. 끝 둘(`1aa63e63` R · `21b20703` G×3) + first-parent 이분(`bisect-drive.sh` · 초록 = 세 판 다 초록 · 빨강 하나면 빨강).
* `boundary.tsv` — 경계 두 커밋 여섯 판씩(멈춤 없이).
* `route-fix-off.tsv` — 빨강 두 커밋을 `T1327_ROUTE_FIX=0` 으로 여섯 판씩.
* `diag.tsv` · `diag-membership.patch` — 진단 사본(레포 밖 worktree 의 `scripts/diag-membership.js` · 하네스 본은 손 0)의 판.
  `on/off` = `T1327_ROUTE_FIX` 1/0 · `wait` = ⑦ 앞에서 촌장 브리핑 답(`__evLastBrief.vid`)을 15초까지 기다림 · `nowait2` = 웹소켓 보낸/받은 틀(ms · `:` 보냄 · `<` 받음).
  patch 는 마지막 꼴(`nowait2`)이다. 앞 줄(`nowait` · `wait`)은 틀 기록이 없는 앞 꼴로 돌았다.
