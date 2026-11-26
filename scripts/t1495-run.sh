#!/usr/bin/env bash
# === scripts/t1495-run.sh — T1495 판 하나(끝 표시 · /tmp 따로 · 40분 끊김 · 이어 돌기) [S14] ============================
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 코드 · 있던 스크립트 손 0 · `t1489-run.sh` 를 본떠 새로 씀)
#   쓰는 법: [RAW=/var/tmp/t1495w] bash scripts/t1495-run.sh <tag> <kind> <arm> [k=v …]
#     kind  lrx  = 긴 판 늘이기(T1489 의 끝난 긴 판 체크포인트를 복사해 `t1308-long-run.js --resume` 으로 더 돈다 · 가상 시계) · k=v: src=<T1489 판 폴더> days=1201
#                  (마지막 마디는 체크포인트를 안 남기니 1,200날 체크포인트를 얻으려고 1,201날까지 돈다)
#           rig  = 실시계 판(`t1495-rig.js` · 중앙 + 존 + 봇 · 이름공간) · k=v 는 rig 에 env 로 간다(T1495_* · VILLAGE_* …)
#     arm   on   = 기본(T1327_ROUTE_FIX 켬) · off = T1327_ROUTE_FIX=0
#           main = 기본 그대로(켬 · 이 가지의 서버 = main 제품) · near = T1490 가지 일터(`$NEAR`) 서버 + T1490_NEAR_NOW=1
#   끝 표시: $RAW/done/<tag>.done = "<종료코드> <초>" — 이미 있으면 건너뛴다(이어 돌기).  작업 자료 $RAW/raw/<tag>/ (레포 밖)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 2
RAW="${RAW:-/var/tmp/t1495w}"; NEAR="${NEAR:-$RAW/wt-near}"; tag="$1"; kind="$2"; arm="$3"; shift 3
[ -e "$RAW/done/$tag.done" ] && { echo "skip $tag"; exit 0; }
D="$RAW/raw/$tag"
if [ "$kind" = lrx ] && [ -s "$D/run/progress.json" ] && [ -d "$D/run/ck" ]; then echo "resume $tag"; else rm -rf "$D"; fi
mkdir -p "$D" "$RAW/done"
PT="$RAW/tmp-$tag"; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
src=""; days=1201; extra=""; prep=0
for kv in "$@"; do case "$kv" in src=*) src="${kv#src=}";; days=*) days="${kv#days=}";; *) extra="$extra $kv";; esac; done
ARMENV=""; SRV="$ROOT"
case "$arm" in
  off) ARMENV="T1327_ROUTE_FIX=0";;
  near) ARMENV="T1490_NEAR_NOW=1"; SRV="$NEAR";;
esac
t0=$(date +%s); rc=0
case "$kind" in
  lrx)
    if [ ! -s "$D/run/progress.json" ]; then
      # T1489 판에서 체크포인트 · 진행 파일만 복사(원본은 손대지 않는다) · 진행 파일은 새 폴더 · 새 날 수 · 귀 없이
      mkdir -p "$D/run" && cp -a "$src/ck" "$D/run/ck" && cp "$src/progress.json" "$D/run/progress.json" || { echo "copy fail"; prep=91; }
      node -e '
        const fs=require("fs"),f=process.argv[1],P=JSON.parse(fs.readFileSync(f,"utf8")),ck=+fs.readFileSync(process.argv[2]+"/ck/day","utf8");
        P.dir=process.argv[2]; P.days=+process.argv[3]; P.ck=ck; P.segs=(P.segs||[]).filter(s=>s.to<=ck); P.done=false; delete P.ended; P.tries=0; P.tag=process.argv[4];
        delete P.env.NODE_OPTIONS; delete P.env.T1489_OUT;
        fs.writeFileSync(f,JSON.stringify(P,null,1));' "$D/run/progress.json" "$D/run" "$days" "$tag" || prep=92
    fi
    for try in 1 2 3; do
      [ "$prep" = 0 ] || { rc=$prep; break; }
      env TMPDIR="$PT" timeout --kill-after=60 40m unshare -p -f --kill-child --mount-proc node scripts/t1308-long-run.js --resume "$D/run" > "$D/run.$try.log" 2>&1; rc=$?   # 이름공간 — 끊기면 아이 존도 같이 죽는다
      grep -q '"done": true' "$D/run/progress.json" 2>/dev/null && { rc=0; break; }
    done
    rm -f "$D/run/"*.db "$D/run/"*.db-wal "$D/run/"*.db-shm "$D/run/"seg-*.json.t740.json 2>/dev/null;;
  rig)
    env T1495_RIGOUT="$D" T1495_SRV="$SRV" T1495_ARM="$arm" T1495_TAG="$tag" $ARMENV $extra \
      timeout --kill-after=60 40m unshare -n -p -m -f --kill-child --mount-proc bash -c "
        mount --bind $PT /tmp || exit 96
        python3 $ROOT/scripts/t853/uplo.py || exit 97
        cd $ROOT && TMPDIR=/tmp node scripts/t1495-rig.js" > "$D/run.log" 2>&1; rc=$?;;
  *) echo "kind?" >&2; exit 2;;
esac
rm -rf "$PT" "$D/run/ck.old" 2>/dev/null
echo "$rc $(( $(date +%s) - t0 ))" > "$RAW/done/$tag.done"
