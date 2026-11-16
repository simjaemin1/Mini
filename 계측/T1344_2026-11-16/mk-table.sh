#!/bin/bash
# T1344 표 — 레포 뿌리에서: bash 계측/T1344_2026-11-16/mk-table.sh > 계측/T1344_2026-11-16/표.md
#   판: 이 폴더(몸 세계 100날 OFF · ALLOY · AB · ABM × 1020 · 7 / 서버 자 400날 SOFF · SALLOY · SAB · SABM × 1020 · 7 · 42 · SM · SB × 1020)
#   자: t1333-arms.js(카드 ④ 칸 — 청동 · 녹임 · 광산5 구리 짐 · 잠김 · 무기 Q · 끔비 …) · t1344-arms.js(병기고 문 · 둘째 화물 · 식량 교역 · 은 든 주조 · 첫째 화물 다리) ·
#       t1344-card.js(카드 ④ 칸 한 장 — 위 둘의 요약) · t1344-alloy.js(합금 표 — 배합 꼴마다 은 뺀 배합)
D=계측/T1344_2026-11-16
armsA() { echo "끔=$D/OFF-$1 ⓐ=$D/ALLOY-$1 ⓐ+병=$D/AB-$1 ⓐ+병+섞=$D/ABM-$1"; }
armsB() { local A="끔=$D/SOFF-$1 ⓐ=$D/SALLOY-$1 ⓐ+병=$D/SAB-$1 ⓐ+병+섞=$D/SABM-$1"; [ "$1" = "1020" ] && A="$A 병=$D/SB-$1 섞=$D/SM-$1"; echo "$A"; }
for s in 1020 7; do node scripts/t1333-arms.js $(armsA $s) --json $D/몸-$s.json > /dev/null; node scripts/t1344-arms.js $(armsA $s) --json $D/몸44-$s.json > /dev/null; done
for s in 1020 7 42; do node scripts/t1333-arms.js $(armsB $s) --json $D/서버-$s.json > /dev/null; node scripts/t1344-arms.js $(armsB $s) --json $D/서버44-$s.json > /dev/null; done
echo "# T1344 표 — 청동 몫 곳간(병기고) · 섞어 싣기 · 합금 표(은)"
echo
echo "## 카드 ④ 칸 — 판 묶음마다(첫 줄 끔 = 끔비 분모)"; echo
node scripts/t1344-card.js "몸 1020=$D/몸-1020.json:$D/몸44-1020.json" "몸 7=$D/몸-7.json:$D/몸44-7.json" "서버 1020=$D/서버-1020.json:$D/서버44-1020.json" "서버 7=$D/서버-7.json:$D/서버44-7.json" "서버 42=$D/서버-42.json:$D/서버44-42.json"
echo
for s in 1020 7; do
  echo "## A-$s. 몸 세계 100날 — 시드 $s"; echo
  node scripts/t1333-arms.js $(armsA $s)
  echo
  node scripts/t1344-arms.js $(armsA $s)
  echo
  echo "### 어촌1 문"; echo
  node scripts/t1344-arms.js $(armsA $s) --v 어촌1 | sed -n '1,2p;4,6p'
  echo
done
for s in 1020 7 42; do
  echo "## B-$s. 서버 자 400날 — 시드 $s"; echo
  node scripts/t1333-arms.js $(armsB $s)
  echo
  node scripts/t1344-arms.js $(armsB $s)
  echo
  echo "### 날 100 머리(같은 판 · 몸 세계 판 길이)"; echo
  node scripts/t1333-arms.js $(armsB $s) --at 100
  echo
done
echo "## C. 합금 표 — 배합 꼴마다 은 뺀 배합(같은 주조 앞 곳간 · 같은 값 함수 · 같은 탐색)"; echo
node scripts/t1344-alloy.js 몸-끔-1020=$D/OFF-1020 몸-끔-7=$D/OFF-7 서버-끔-1020=$D/SOFF-1020 서버-끔-7=$D/SOFF-7 서버-끔-42=$D/SOFF-42
echo
echo "## D. 주조 문이 닫힌 갈래 — 마을-날 합(대장장이 날 · 닫힘 · 취약 갈래(전사 실수요) · 잘 먹는 갈래(청동 몫))"; echo
echo '| 판 | 대장장이 마을-날 | 닫힘 | 취약 갈래 | 잘 먹는 갈래 |'; echo '|---|---:|---:|---:|---:|'
for R in OFF-1020 ALLOY-1020 AB-1020 ABM-1020 OFF-7 ALLOY-7 AB-7 ABM-7 SOFF-1020 SALLOY-1020 SAB-1020 SABM-1020 SB-1020 SM-1020 SOFF-7 SALLOY-7 SAB-7 SABM-7 SOFF-42 SALLOY-42 SAB-42 SABM-42; do
  [ -f $D/$R.json ] || continue
  node scripts/t1344-gates.js $D/$R | grep '^| 합' | awk -F'|' -v r=$R '{gsub(/ /,"",$3);gsub(/ /,"",$5);gsub(/ /,"",$6);gsub(/ /,"",$7); print "| " r " | " $3 " | " $5 " | " $6 " | " $7 " |"}'
done
echo
echo "### 마을별 — 몸 끔 1020 · 서버 끔 1020"; echo
node scripts/t1344-gates.js $D/OFF-1020 $D/SOFF-1020
echo
echo "## E. 식량 교역 가르기 — 출발 · 첫째 화물 식량 · 둘째 화물 식량 · 받아 온 식량(econ 식량 단위 · 판 끝까지)"; echo
A=""; for R in OFF-1020 ALLOY-1020 AB-1020 ABM-1020 OFF-7 ALLOY-7 AB-7 ABM-7 SOFF-1020 SALLOY-1020 SAB-1020 SABM-1020 SB-1020 SM-1020 SOFF-7 SALLOY-7 SAB-7 SABM-7 SOFF-42 SALLOY-42 SAB-42 SABM-42; do [ -f $D/$R.json ] && A="$A $R=$D/$R"; done
node scripts/t1344-food.js $A 2>/dev/null | grep -v '^\[econ'
