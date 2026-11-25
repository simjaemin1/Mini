#!/usr/bin/env bash
# === scripts/t1485-run.sh — 한 판(⑦ 하네스 또는 걸어간 봇) · 이름공간 · /tmp 따로 · 끝 표시 [T1485 · S14] ==========================
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 코드 · 있던 스크립트 손 0)
#   쓰는 법: [RAW=/var/tmp/t1485w] bash scripts/t1485-run.sh <kind: mem|memplain|walk|walklong|walkre|walkre2> <arm: on|off|edge> <k>
#     mem      = e2e-membership 에 읽기 귀(t1485-observer.js)를 걸고 · memplain = 귀 없이(귀가 판을 안 바꾸는지 견주는 대조)
#     walk     = scripts/t1485-walkbot.js(걸어서 곳간 앞에 가 `/인출`) + 귀 · walklong = 같은 봇 · 하루 길이 1시간(마을 하루 장부 마감이 판 안에 안 든다 · 실서버 꼴에 가깝게) · walkre = 닿아 두 번 누른 뒤 쪽을 다시 열어(다시 접속) 한 번 더 · walkre2 = 거기에 2초 뒤 한 번 더(다시 눌러 되나)
#     on = 기본(T1327_ROUTE_FIX 켬) · off = T1327_ROUTE_FIX=0 · edge = T1327_ROUTE_FIX=0 T598_ROUTE_EDGE=1(이웃 잇기 규칙만)
#   끝 표시: $RAW/done/<tag>.done 이 이미 있으면 건너뛴다(이어 돌기). 판 로그 · 귀 줄은 $RAW/raw 에(레포 밖).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 2
RAW="${RAW:-/var/tmp/t1485w}"; kind="$1"; arm="$2"; k="$3"
tag="$kind-$arm-$(printf %02d "$k")"
[ -e "$RAW/done/$tag.done" ] && { echo "skip $tag"; exit 0; }
mkdir -p "$RAW/raw" "$RAW/done"
PT="$RAW/tmp-$tag"; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
OFFENV=""; [ "$arm" = off ] && OFFENV="T1327_ROUTE_FIX=0"
[ "$arm" = edge ] && OFFENV="T1327_ROUTE_FIX=0 T598_ROUTE_EDGE=1"   # 길 고침 끔 + 이웃 잇기 규칙만 켬(`_T598E` 하나만 켠 쪽)
case "$kind" in
  mem) SCRIPT=scripts/e2e-membership.js; TOPT="--require $ROOT/scripts/t1485-observer.js";;
  memplain) SCRIPT=scripts/e2e-membership.js; TOPT="";;
  walk) SCRIPT=scripts/t1485-walkbot.js; TOPT="--require $ROOT/scripts/t1485-observer.js";;
  walklong) SCRIPT=scripts/t1485-walkbot.js; TOPT="--require $ROOT/scripts/t1485-observer.js"; OFFENV="$OFFENV T1485_DAY_MS=3600000";;
  walkre) SCRIPT=scripts/t1485-walkbot.js; TOPT="--require $ROOT/scripts/t1485-observer.js"; OFFENV="$OFFENV T1485_RECONN=1";;
  walkre2) SCRIPT=scripts/t1485-walkbot.js; TOPT="--require $ROOT/scripts/t1485-observer.js"; OFFENV="$OFFENV T1485_RECONN=2";;
  *) echo "kind?" >&2; exit 2;;
esac
t0=$(date +%s)
timeout --kill-after=60 40m unshare -n -p -m -f --kill-child --mount-proc bash -c "
  mount --bind $PT /tmp || exit 96
  python3 $ROOT/scripts/t853/uplo.py || exit 97
  cd $ROOT && env $OFFENV TIDE_FREEZE_MS=372603 T1485_LOG=/tmp/t1485-obs.jsonl NODE_OPTIONS='$TOPT' node $SCRIPT
" > "$RAW/raw/$tag.log" 2>&1 < /dev/null
rc=$?
[ -s "$PT/t1485-obs.jsonl" ] && cp "$PT/t1485-obs.jsonl" "$RAW/raw/$tag.obs.jsonl"
[ -s "$PT/t1485-walk.json" ] && cp "$PT/t1485-walk.json" "$RAW/raw/$tag.walk.json"
rm -rf "$PT"
# 로그는 ✓/✗ 줄만 남겨 작게(전문은 지운다)
grep -E '^\s*(✓|✗|❌)|통과|실패' "$RAW/raw/$tag.log" | cut -c1-260 > "$RAW/raw/$tag.res.txt"; rm -f "$RAW/raw/$tag.log"
echo "$rc $(( $(date +%s) - t0 ))" > "$RAW/done/$tag.done"
