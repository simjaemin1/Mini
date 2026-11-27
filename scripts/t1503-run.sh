#!/usr/bin/env bash
# === scripts/t1503-run.sh — T1503 판 하나(끝 표시 · /tmp 따로 · 40분 끊김 · 끝 표시 있으면 건너뜀) [S14] ===================
# (@regress 없음 — 러너 밖 · 판 도구 · `t1495-run.sh` 를 본떠 새로 씀 · 있던 스크립트 손 0)
#   쓰는 법: [RAW=/var/tmp/t1503w] bash scripts/t1503-run.sh <tag> <kind> <arm> [K=V …]
#     kind  sbc  = 서버 기준선 자(`server-baseline-check.js 계측/서버기준선_2026-11-18.json --vclock --plan 1020:400` · 날 지문) + 조각 귀(`t1503-probe.js`)
#                  K=V needs=<tag> = 그 판 끝 표시가 설 때까지 기다린다(모든 kind)
#                  K=V 중 plan=<seed:days> · base=<기준선 파일> · make=<새 기준선 파일>(만들기 · days=N 시드 1020) · days=N(견주기 시드 1020) · pre=<scripts/ 안 프리로드> 는 자 옵션 · 나머지는 env
#           sbcmain = 같은 날 지문 자를 main 일터(`$RAW/wt-main`)에서(제품 = origin/main · 귀 없음)
#           lr   = 저장본 만들기(`t1308-long-run.js <days> 1020 --every days-1` · 체크포인트 ck/ = days-1 날 저장) · K=V 는 env(VILLAGE_DAY_MS 등)
#           rig  = 실시계 판(`t1503-rig.js` · 중앙 + 존 + 봇 · 이름공간 · 모드 boot · cross · day) · K=V 는 env
#     arm   off  = 손잡이 둘 끔(= main 제품) · keep = T1503_DIST_KEEP=1 · slice = T1503_CLOSE_SLICE=1 · on = 둘 다 켬
#           near-off · near-on = T1490 가지 일터(`$NEAR` · T1490_NEAR_NOW=1) 서버 + 위 팔
#   끝 표시: $RAW/done/<tag>.done = "<종료코드> <초>" · 작업 자료 $RAW/raw/<tag>/ (레포 밖)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 2
RAW="${RAW:-/var/tmp/t1503w}"; NEAR="${NEAR:-$RAW/wt-near}"; tag="$1"; kind="$2"; arm="$3"; shift 3
[ -e "$RAW/done/$tag.done" ] && { echo "skip $tag"; exit 0; }
D="$RAW/raw/$tag"; rm -rf "$D"; mkdir -p "$D" "$RAW/done"
PT="$RAW/tmp-$tag"; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
plan="1020:400"; base="계측/서버기준선_2026-11-18.json"; extra=""; make=""; days=""; pre=""
needs=""
for kv in "$@"; do case "$kv" in needs=*) needs="${kv#needs=}";; esac; done
if [ -n "$needs" ]; then while [ ! -e "$RAW/done/$needs.done" ]; do sleep 20; done; fi   # 앞 판(기준선 만들기 등)이 끝나야 도는 판
for kv in "$@"; do case "$kv" in needs=*) ;; plan=*) plan="${kv#plan=}";; base=*) base="${kv#base=}";; make=*) make="${kv#make=}";; days=*) days="${kv#days=}";; pre=*) pre="$pre --require $ROOT/scripts/${kv#pre=}";; *) extra="$extra $kv";; esac; done
ARMENV=""; SRV="$ROOT"
case "$arm" in
  off|near-off) ARMENV="";;
  keep) ARMENV="T1503_DIST_KEEP=1";;
  slice) ARMENV="T1503_CLOSE_SLICE=1";;
  on|near-on) ARMENV="T1503_DIST_KEEP=1 T1503_CLOSE_SLICE=1";;
  *) echo "arm?" >&2; exit 2;;
esac
case "$arm" in near-*) ARMENV="$ARMENV T1490_NEAR_NOW=1"; SRV="$NEAR";; esac
t0=$(date +%s); rc=0
case "$kind" in
  sbc)
    if [ -n "$make" ]; then SA="--make $make --days $days --seeds 1020"; else SA="$base --plan $plan"; [ -n "$days" ] && SA="$base --days $days --seeds 1020"; fi
    env TMPDIR="$PT" T699_ROUTE_CACHE="$RAW/route-cache" T1503_OUT="$D/probe" NODE_OPTIONS="--require $ROOT/scripts/t1503-probe.js$pre" $ARMENV $extra \
      timeout --kill-after=60 40m unshare -p -f --kill-child --mount-proc node scripts/server-baseline-check.js $SA --vclock > "$D/run.log" 2>&1; rc=$?
    cp "$PT"/sbc-*/*.log "$D/" 2>/dev/null; ls "$PT"/sbc-* > "$D/ls.txt" 2>&1;;
  sbcmain)   # main 일터(`$RAW/wt-main` · origin/main 그대로)로 같은 자를 돈다 — 끈 판이 main 과 같다는 맞대기
    ( cd "$RAW/wt-main" && env TMPDIR="$PT" T699_ROUTE_CACHE="$RAW/route-cache" $extra timeout --kill-after=60 40m unshare -p -f --kill-child --mount-proc node scripts/server-baseline-check.js "$base" --vclock --plan "$plan" ) > "$D/run.log" 2>&1; rc=$?;;
  lr)
    env TMPDIR="$PT" $ARMENV $extra timeout --kill-after=60 40m unshare -p -f --kill-child --mount-proc node scripts/t1308-long-run.js "$days" 1020 --every "$((days - 1))" --dir "$D/run" > "$D/run.log" 2>&1; rc=$?
    rm -f "$D/run/"*.db "$D/run/"*.db-wal "$D/run/"*.db-shm 2>/dev/null;;
  rig)
    env T1503_RIGOUT="$D" T1503_SRV="$SRV" T1503_ARM="$arm" T1503_TAG="$tag" $ARMENV $extra \
      timeout --kill-after=60 40m unshare -n -p -m -f --kill-child --mount-proc bash -c "
        mount --bind $PT /tmp || exit 96
        python3 $ROOT/scripts/t853/uplo.py || exit 97
        cd $ROOT && TMPDIR=/tmp node scripts/t1503-rig.js" > "$D/run.log" 2>&1; rc=$?;;
  *) echo "kind?" >&2; exit 2;;
esac
rm -rf "$PT" 2>/dev/null
echo "$rc $(( $(date +%s) - t0 ))" > "$RAW/done/$tag.done"
