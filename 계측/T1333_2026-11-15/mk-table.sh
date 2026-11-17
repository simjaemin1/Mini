#!/bin/bash
# T1333 표 — 레포 뿌리에서: bash 계측/T1333_2026-11-15/mk-table.sh > 계측/T1333_2026-11-15/표.md
#   판: 이 폴더(몸 세계 100날 OFF · ALLOY · EXPORT × 1020 · 7 / 서버 자 400날 SOFF · SALLOY3 · SEXPORT2 · SWS · SAWS3 × 1020 · 7 · 42) · T1313 판 열(`계측/T1313_2026-11-14/` · `계측/T1293_2026-11-13/` — 진단 ③)
D=계측/T1333_2026-11-15; P=계측/T1313_2026-11-14; O=계측/T1293_2026-11-13
echo "# T1333 표 — 청동 길(합금 발주 ⓐ · 수출 주조 ⓑ · 투입재 상한 밖 ④)"
echo
for s in 1020 7; do
  OFFH=$D/OFF-$s; [ -f $OFFH.json ] || OFFH=$P/OFF-$s   # 끔 7 = T1313 OFF-7 판(같은 세계 — 끔 1020 새 판이 T1313 판과 날 1 ~ 100 306/0)
  echo "## A-$s. 몸 세계 100날 — 시드 $s(끔 · ⓐ · ⓑ · 끔 판 ${OFFH#계측/})"; echo
  node scripts/t1333-arms.js 끔=$OFFH ⓐ=$D/ALLOY-$s ⓑ=$D/EXPORT-$s --json $D/몸-$s.json
  echo
done
for s in 1020 7 42; do
  echo "## B-$s. 서버 자 400날 — 시드 $s(끔 · ⓐ · ⓑ · ④ · ⓐ + ④)"; echo
  node scripts/t1333-arms.js 끔=$D/SOFF-$s ⓐ=$D/SALLOY3-$s ⓑ=$D/SEXPORT2-$s ④=$D/SWS-$s ⓐ+④=$D/SAWS3-$s --json $D/서버-$s.json
  echo
  echo "### 날 100 머리(같은 판 · 몸 세계 판 길이)"; echo
  node scripts/t1333-arms.js 끔=$D/SOFF-$s ⓐ=$D/SALLOY3-$s ⓑ=$D/SEXPORT2-$s ④=$D/SWS-$s ⓐ+④=$D/SAWS3-$s --at 100
  echo
done
echo "## C. 진단 — 구리가 광산5 로 가나(T1313 판 열 열 · 이 카드 몸 세계 판)"; echo
node scripts/t1333-diag.js $P/OFF-1020 $O/FIX-1020 $P/SAT-1020 $P/SUR-1020 $P/SURLZ-1020 $P/OFF-7 $O/FIX-7 $P/SAT-7 $P/SUR-7 $P/SURLZ-7
echo
node scripts/t1333-diag.js $D/OFF-1020 $D/ALLOY-1020 $D/EXPORT-1020 $D/ALLOY-7 $D/EXPORT-7
echo
echo "## D. λ 표 — 랩 세계 날 100 · 51 곳(t1333-lam.js · 광부 한 시간 단위 0.632 = T1313 몸 세계 λ 판 물음당 평균)"; echo
node scripts/t1333-lam.js --md $D/λ-켬.json --u 0.632
echo
node scripts/t1333-lam.js --md $D/λ-끔.json --u 0.632 | tail -2
