#!/bin/bash
# T1313 표 — 레포 뿌리에서: bash 계측/T1313_2026-11-14/mk-table.sh > 계측/T1313_2026-11-14/표.md
#   판: 이 폴더(끔 OFF · + T1293 SAT · + T1313 ⓑ SUR · + ⓑ + λ SURLZ × 1020 · 7 · 회부 ③ 짝 OFFM × 1020 · 7) · T1266 + T1271(FIX)은 T1293 판(`계측/T1293_2026-11-13/` — 같은 세계 · F 절)
D=계측/T1313_2026-11-14; O=계측/T1293_2026-11-13
echo "# T1313 표 — 몸 세계 100날 · 시드 1020 · 7 × 다섯 팔"
echo
for s in 1020 7; do
  echo "## A-$s. 판 요약 — 시드 $s(날 100)"; echo
  node scripts/t1313-arms.js 끔=$D/OFF-$s T1266+T1271=$O/FIX-$s +T1293=$D/SAT-$s +T1313ⓑ=$D/SUR-$s +ⓑ+λ=$D/SURLZ-$s --ten --json $D/팔-$s.json
  echo
done
for r in SAT-1020 SAT-7 SUR-1020 SUR-7 SURLZ-1020 SURLZ-7 OFF-1020 OFF-7; do
  echo "## C. 진단 — $r"; echo
  node scripts/t1313-diag.js $D/$r
  echo
done
for r in FIX-1020 FIX-7; do echo "## C. 진단(로그 · t1256 만) — $r(T1293 판)"; echo; node scripts/t1313-diag.js $O/$r; echo; done
for s in 1020 7; do
  echo "## D-$s. 회부 ③ — 끔 $s 합치기 앞(OFF · 2cc89e70b) ↔ main(land1076 · T1294 + T1314) 합친 뒤(OFFM · bd0bdf654) — 같은 때 돈 짝"; echo
  node scripts/t1313-cpu.js "OFF(합치기 앞)=$D/OFF-$s" "OFFM(main land1076 합친 뒤)=$D/OFFM-$s"
  echo
  echo "### 몸 모양 — 날 70 ~ 100 새로 선 모양(t1277-shape)"; echo
  for r in OFF-$s OFFM-$s; do echo "#### $r"; echo '```'; node scripts/t1277-shape.js $D/$r 70 100 | grep -B1 '^    +'; echo '```'; done
  echo
done
echo
echo "## E. λ — 랩 세계 날 100 · 51 곳(t1313-lam.js)"; echo
node scripts/t1313-lam.js --cmp $D/λ-끔.json $D/λ-켬.json
echo
echo "## F. 같은 세계 — 합치기 앞 새 판 ↔ T1293 판(t1277-same.js · 날 1 ~ 100)"; echo
echo '```'
for r in SAT-7 SAT-1020 OFF-1020 OFF-7; do echo "== $r"; node scripts/t1277-same.js $O/$r $D/$r 100 | tail -3; done
for s in 1020 7; do echo "== OFF-$s ↔ OFFM-$s(main land1076 합친 뒤)"; node scripts/t1277-same.js $D/OFF-$s $D/OFFM-$s 100 | tail -3; done
echo '```'
