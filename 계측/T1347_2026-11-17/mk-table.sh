#!/bin/bash
# T1347 표 — 팔 이름에 띄어쓰기 0(인자로 넘긴다) · (가) 광산5 를 먹인다 · (나) 취약 갈래에도 청동 몫 · (다) 전사 0 마을 최솟값 2 다시 · 섞기 = 섞어 싣기만(좁히기 전 T1344)
# T1347 표 — 레포 뿌리에서: bash 계측/T1347_2026-11-17/mk-table.sh > 계측/T1347_2026-11-17/표.md
#   판: 이 폴더(몸 세계 100날 OFF · A · B · AB × 1020 · 7 / 서버 자 400날 SOFF · SALLOY · SA · SB · SAB · SM × 1020 · 7 · 42 · 판정 표 SGA · SNA · SDA × 1020 · 7 · 42 · 같음 판 VB-1020)
#   자: t1333-arms.js(청동 · 광산5 구리 짐 · 인구) · t1344-arms.js(식량 교역 · 섞어 실은 짐) · t1347-card.js(카드 칸 한 장 — 위 둘 요약 + 관찰기 t1333 장부 · t1344 · t1347 · fd-deaths)
D=계측/T1347_2026-11-17
pick() { local o=""; for x in "$@"; do local h=${x#*=}; [ -f "$h.json" ] && o="$o $x"; done; echo $o; }
armsA() { pick "끔=$D/OFF-$1" "ⓐ=$D/A-$1" "ⓑ=$D/B-$1" "ⓐ+ⓑ=$D/AB-$1"; }
armsB() { pick "끔=$D/SOFF-$1" "합금만=$D/SALLOY-$1" "ⓐ=$D/SA-$1" "ⓑ=$D/SB-$1" "ⓐ+ⓑ=$D/SAB-$1" "섞기=$D/SM-$1"; }
armsJ() { pick "끔=$D/SOFF-$1" "ⓐ=$D/SA-$1" "(가)=$D/SGA-$1" "(나)=$D/SNA-$1" "(다)=$D/SDA-$1"; }
card() {   # 요약 열쇠(파일 이름 · 아스키) · 묶음 이름 · 팔들
  local k=$1 g=$2; shift 2; [ $# -gt 0 ] || return
  node scripts/t1333-arms.js "$@" --json $D/_s33-$k.json > /dev/null 2>&1
  node scripts/t1344-arms.js "$@" --json $D/_s44-$k.json > /dev/null 2>&1
  node scripts/t1347-card.js "$g" $D/_s33-$k.json $D/_s44-$k.json "$@" --json $D/_s47-$k.json $HEAD
}
echo "# T1347 표 — 받아 올 짐(ⓐ) · 섞어 싣기 목적지 발주(ⓑ) · 판정 표 (가)(나)(다)"
echo
echo "## 카드 ⑤ 판 — 몸 세계 100날 · 서버 자 400날(첫 줄 끔 = 끔비 분모 · ⓐ · ⓑ 팔은 합금 발주 \`T1333_ALLOY_ORDER\` 를 같이 켠다 — 광산5 구리 발주가 서는 자리)"; echo
HEAD=--head
for s in 1020 7; do card body-$s "몸 $s" $(armsA $s); HEAD=; done
for s in 1020 7 42; do card srv-$s "서버 $s" $(armsB $s); done
echo
echo "## 카드 ④ 판정 표 — 서버 자 400날(갈래마다 단독 · ⓐ 위 · 판 자 사본 \`variants.py\` — 제품 무변)"; echo
HEAD=--head
for s in 1020 7 42; do card judge-$s "판정 $s" $(armsJ $s); HEAD=; done
echo
echo "## 끔 = 바이트 같음 — 새 코드 끔(관찰기 t1347 단 판) VB-1020 ↔ main 끔 SOFF-1020 날 1 ~ 100"; echo
echo '```'; node scripts/t1277-same.js $D/VB-1020 $D/SOFF-1020 100; echo '```'
echo
echo '판 JSON md5 — 서버 자 끔(이 카드 · main 1e2eb209f) ↔ T1344 끔(옛 main):'; echo; echo '```'
for s in 1020 7 42; do [ -f $D/SOFF-$s.json ] && md5sum $D/SOFF-$s.json 계측/T1344_2026-11-16/SOFF-$s.json; done
echo '```'
