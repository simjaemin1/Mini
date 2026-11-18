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
pickp() { local o=""; for x in "$@"; do local h=${x#*=}; { [ -f "$h.json" ] || [ -f "$h.t1333.json" ] || [ -f "$h.t1333.json.gz" ]; } && o="$o $x"; done; echo $o; }
echo
echo "### 서버 42 · 날 360 — ⓐ 판(SA-42)이 날 366 ~ 371 에서 멈췄다(힙 2 GB 판은 날 366 힙 넘침 · 힙 3 GB 판은 하루 8 분 — T1349 길찾기 멈춤 · 힙 자리) — 다섯 팔을 날 360 으로 견준다(먹을거리 줄은 날로 못 끊는다)"; echo
HEAD=--head; AT="--at 360"
k=srv-42-360; A42=$(pickp "끔=$D/SOFF-42" "합금만=$D/SALLOY-42" "ⓐ=$D/SA-42" "ⓑ=$D/SB-42" "ⓐ+ⓑ=$D/SAB-42" "섞기=$D/SM-42")
node scripts/t1333-arms.js $A42 --at 360 --json $D/_s33-$k.json > /dev/null 2>&1; node scripts/t1344-arms.js $A42 --json $D/_s44-$k.json > /dev/null 2>&1
node scripts/t1347-card.js "서버 42 · 날 360" $D/_s33-$k.json $D/_s44-$k.json $A42 --at 360 --head --json $D/_s47-$k.json
HEAD=; AT=
echo
echo "## 카드 ④ 판정 표 — 서버 자 400날(갈래마다 단독 · ⓐ 위 · 판 자 사본 \`variants.py\` — 제품 무변)"; echo
HEAD=--head
for s in 1020 7 42; do card judge-$s "판정 $s" $(armsJ $s); HEAD=; done
echo
echo "## 광산5 한 줄 — 발주가 서는가 · 받아 올 짐이 설 수 있는가(t1347-k5.js)"; echo
for s in 1020 7; do echo "### 몸 $s"; echo; node scripts/t1347-k5.js $(armsA $s); echo; done
for s in 1020 7 42; do echo "### 서버 $s"; echo; node scripts/t1347-k5.js $(armsB $s) $(pick "(가)=$D/SGA-$s" "(나)=$D/SNA-$s" "(다)=$D/SDA-$s"); echo; done
echo "## 식량 교역량 날마다 누계 — 합금 발주만 판이 분모(손잡이가 바꾼 줄은 몇 줄 · 세계는 그날부터 갈린다 — t1347-foodtime.js)"; echo
for s in 1020 7 42; do echo "### 서버 $s"; echo; node scripts/t1347-foodtime.js $(pick "합금만=$D/SALLOY-$s" "끔=$D/SOFF-$s" "ⓐ=$D/SA-$s" "ⓑ=$D/SB-$s" "ⓐ+ⓑ=$D/SAB-$s" "섞기=$D/SM-$s"); echo; done
for s in 1020 7; do echo "### 몸 $s(끔이 분모 — 몸 세계는 합금만 판을 안 돌렸다)"; echo; node scripts/t1347-foodtime.js $(armsA $s); echo; done
echo "## 랩 세계 100날(econ-lab-real 51 곳 · lab47.sh) — 기본 난수열 1020 + econ 난수열만 바꾼 넷(LAB_SEED 1 ~ 4 — 카오스 폭의 자)"; echo
node scripts/t1347-labtab.js $D
echo
echo "## 끔 = 바이트 같음 — 새 코드 끔(관찰기 t1347 단 판) VB-1020 ↔ main 끔 SOFF-1020 날 1 ~ 100"; echo
TMPS=$(mktemp -d); for r in VB-1020 VH-1020 SOFF-1020; do for k in json t1256.json t1243.json t1266.json t1277.json; do [ -f $D/$r.$k ] && cp $D/$r.$k $TMPS/; [ -f $D/$r.$k.gz ] && gunzip -c $D/$r.$k.gz > $TMPS/$r.$k; done; done   # t1277-same 은 .gz 를 안 읽는다 — 풀어서 견준다
echo '```'; node scripts/t1277-same.js $TMPS/VB-1020 $TMPS/SOFF-1020 100; echo '```'
echo; echo "힙 한도만 바꾼 판(VH-1020 — \`--max-old-space-size=3072\` · run47.sh srv) ↔ 기본 힙 판(VB-1020) 날 1 ~ 100 — 값 무변:"; echo
echo '```'; node scripts/t1277-same.js $TMPS/VH-1020 $TMPS/VB-1020 100; md5sum $TMPS/VH-1020.json $TMPS/VB-1020.json | sed "s#$TMPS/##"; echo '```'
rm -rf $TMPS
echo
echo '판 JSON md5 — 서버 자 끔 · 합금만(이 카드 · main 1e2eb209f + T1347 끔 갈래) ↔ T1344 같은 팔(옛 main) — 여섯 다 같다:'; echo; echo '```'
for s in 1020 7 42; do for a in SOFF SALLOY; do [ -f $D/$a-$s.json ] && md5sum $D/$a-$s.json 계측/T1344_2026-11-16/$a-$s.json; done; done
echo '```'
