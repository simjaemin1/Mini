#!/usr/bin/env bash
# === scripts/t1489-run.sh — T1489 판 하나(끝 표시 · /tmp 따로 · 40분 끊김 · 이어 돌기) [S14] ============================
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 코드 · 있던 스크립트 손 0)
#   쓰는 법: [RAW=/var/tmp/t1489w] bash scripts/t1489-run.sh <tag> <kind> <arm> [k=v …]
#     kind  lr   = 긴 판(`t1308-long-run.js` · 가상 시계 · 마디 100날 · 끊기면 --resume) · k=v: days=400 zone=hanbando seed=1020 caravan=0 war=0 vmax=
#           hl   = 짧은 머리 판(`t1331-run.js` · 가상 시계) · k=v: days=20 zone=hanbando seed=1020 vmax= caravan=0 war=0
#           rig  = 실시계 판(`t1489-rig.js` · 중앙 + 존 + 봇 · 이름공간 · 하루 ms 를 줄 수 있다) · k=v 는 rig 에 env 로 간다(T1489_*)
#     arm   on = 기본(T1327_ROUTE_FIX 켬) · off = T1327_ROUTE_FIX=0 · edge = off + T598_ROUTE_EDGE=1
#   끝 표시: $RAW/done/<tag>.done = "<종료코드> <초>" — 이미 있으면 건너뛴다(이어 돌기).  작업 자료 $RAW/raw/<tag>/ (레포 밖)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 2
RAW="${RAW:-/var/tmp/t1489w}"; tag="$1"; kind="$2"; arm="$3"; shift 3
[ -e "$RAW/done/$tag.done" ] && { echo "skip $tag"; exit 0; }
D="$RAW/raw/$tag"
# 긴 판(lr)은 체크포인트가 있으면 자료를 안 지운다(상자가 다시 떠도 이어 돈다) · 그 밖은 새로
if [ "$kind" = lr ] && [ -s "$D/run/progress.json" ] && [ -d "$D/run/ck" ]; then echo "resume $tag"; else rm -rf "$D"; fi
mkdir -p "$D" "$RAW/done"
# 이어 돌기 전 손질: 끊긴 마디(체크포인트 날 뒤)의 귀 줄 · 그 마디 프로세스의 프로파일을 버린다(다시 도는 마디와 겹치지 않게)
trim_lr() {
  [ -s "$D/run/progress.json" ] || return 0
  local ck; ck=$(node -e 'try{const p=require(process.argv[1]);console.log(p.ck|0)}catch(e){console.log(-1)}' "$D/run/progress.json")
  [ "$ck" -ge 0 ] 2>/dev/null || return 0
  [ -f "$D/p.closes.jsonl" ] && node -e 'const fs=require("fs"),f=process.argv[1],ck=+process.argv[2];const L=fs.readFileSync(f,"utf8").split("\n").filter(Boolean).filter(l=>{try{return (JSON.parse(l).day|0)<=ck}catch(e){return false}});fs.writeFileSync(f,L.map(l=>l+"\n").join(""))' "$D/p.closes.jsonl" "$ck"
  find "$D" -maxdepth 1 -name 'p.prof.*.json*' -newer "$D/run/progress.json" -delete
  echo "trim $tag ck=$ck"
}
PT="$RAW/tmp-$tag"; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
days=20; zone=hanbando; seed=1020; vmax=""; caravan=0; war=0; extra=""
for kv in "$@"; do case "$kv" in days=*) days="${kv#days=}";; zone=*) zone="${kv#zone=}";; seed=*) seed="${kv#seed=}";; vmax=*) vmax="${kv#vmax=}";; caravan=*) caravan="${kv#caravan=}";; war=*) war="${kv#war=}";; *) extra="$extra $kv";; esac; done
ARMENV=""; [ "$arm" = off ] && ARMENV="T1327_ROUTE_FIX=0"; [ "$arm" = edge ] && ARMENV="T1327_ROUTE_FIX=0 T598_ROUTE_EDGE=1"
BODYENV="T1243_FARM_ON=1 T1316_BODY_CLOCK=1 T1316_SUBSTEP=1 T1326_HUNT_CLOCK=1 T1351_MINE_CLOCK=1 VILLAGE_NPC_CAP=Infinity T1195_HUNT_REAL=1"
CAR="VILLAGE_CARAVAN_MAX=$caravan"; WARENV=""; [ "$war" != 0 ] && WARENV="WAR_FIXTURE=$war WAR_FIXTURE_DAY=1 WAR_FIXTURE_REPEAT=1"
VM=""; [ -n "$vmax" ] && VM="VILLAGE_MAX=$vmax"
export T1489_OUT="$D/p" TMPDIR="$PT"
PRE="--require $ROOT/scripts/t1489-probe.js"
t0=$(date +%s); rc=0
case "$kind" in
  lr)
    # 이어 돌기: progress.done 이 설 때까지 최대 세 번(한 번 40분 끊김)
    for try in 1 2 3; do
      if [ -s "$D/run/progress.json" ]; then trim_lr; A="--resume $D/run"; else A="$days $seed --every 100 --dir $D/run --tag $tag"; fi
      env $ARMENV $BODYENV $CAR $WARENV $VM T577_ZONE=$zone T745_VCLOCK=1 NODE_OPTIONS="$PRE" \
        timeout --kill-after=60 40m node scripts/t1308-long-run.js $A > "$D/run.$try.log" 2>&1; rc=$?
      grep -q '"done": true' "$D/run/progress.json" 2>/dev/null && break
    done;;
  hl)
    env $ARMENV $BODYENV $CAR $WARENV $VM T1489_OUT="$D/p" NODE_OPTIONS="$PRE" \
      timeout --kill-after=60 40m node scripts/t1331-run.js "$D" h "$zone" "$seed" "$days" > "$D/run.log" 2>&1; rc=$?;;
  rig)
    env T1489_RIGOUT="$D" T1489_PRE="$PRE" T1489_PROBE=1 $ARMENV $WARENV $VM $extra \
      timeout --kill-after=60 40m unshare -n -p -m -f --kill-child --mount-proc bash -c "
        mount --bind $PT /tmp || exit 96
        python3 $ROOT/scripts/t853/uplo.py || exit 97
        cd $ROOT && TMPDIR=/tmp node scripts/t1489-rig.js" > "$D/run.log" 2>&1; rc=$?;;
  *) echo "kind?" >&2; exit 2;;
esac
rm -rf "$PT" "$D/run/ck.old" 2>/dev/null
[ "$kind" = lr ] && rm -f "$D/run/"*.db "$D/run/"*.db-wal "$D/run/"*.db-shm 2>/dev/null
echo "$rc $(( $(date +%s) - t0 ))" > "$RAW/done/$tag.done"
