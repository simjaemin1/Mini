#!/bin/bash
# T1344 표 — 레포 뿌리에서: bash 계측/T1344_2026-11-16/mk-table.sh > 계측/T1344_2026-11-16/표.md
#   판: 이 폴더(몸 세계 100날 OFF · ALLOY · AB · ABM × 1020 · 7 / 서버 자 400날 SOFF · SALLOY · SAB · SABM × 1020 · 7 · 42 · SM · SB × 1020)
#   자: t1333-arms.js(카드 ⑥ 칸 — 청동 · 녹임 · 광산5 구리 짐 · 잠김 · 무기 Q · 끔비 …) · t1344-arms.js(병기고 문 · 둘째 화물 · 식량 교역 · 은 든 주조 · 첫째 화물 다리)
D=계측/T1344_2026-11-16
echo "# T1344 표 — 청동 몫 곳간(병기고) · 섞어 싣기 · 합금 표(은)"
echo
for s in 1020 7; do
  A="끔=$D/OFF-$s ⓐ=$D/ALLOY-$s ⓐ+병=$D/AB-$s ⓐ+병+섞=$D/ABM-$s"
  echo "## A-$s. 몸 세계 100날 — 시드 $s"; echo
  node scripts/t1333-arms.js $A --json $D/몸-$s.json
  echo
  node scripts/t1344-arms.js $A --json $D/몸44-$s.json
  echo
  echo "### 어촌1 문"; echo
  node scripts/t1344-arms.js $A --v 어촌1 | sed -n '1,2p;4,6p'
  echo
done
for s in 1020 7 42; do
  A="끔=$D/SOFF-$s ⓐ=$D/SALLOY-$s ⓐ+병=$D/SAB-$s ⓐ+병+섞=$D/SABM-$s"
  [ "$s" = "1020" ] && A="$A 병=$D/SB-$s 섞=$D/SM-$s"
  echo "## B-$s. 서버 자 400날 — 시드 $s"; echo
  node scripts/t1333-arms.js $A --json $D/서버-$s.json
  echo
  node scripts/t1344-arms.js $A --json $D/서버44-$s.json
  echo
  echo "### 날 100 머리(같은 판 · 몸 세계 판 길이)"; echo
  node scripts/t1333-arms.js $A --at 100
  echo
done
