#!/usr/bin/env bash
# === scripts/t1473-run.sh — 끔 기본 손잡이 하나씩 켠 서버 판 400날 × 3시드(T1473 · 코드 손 0 · T1417 run.sh 꼴) ===
#   판 하나 = (팔 · 시드) = `server-baseline-check.js --make <팔>-<시드>.json --days 400 --seeds <시드> --par 1 --vclock [팔 인자]`
#   + 곁 관찰기 scripts/t1473-observe.js. 한 번에 JOBS(2)까지 · 판마다 제 TMPDIR(끝나면 지운다) · 교역로 캐시 한 폴더 공유.
#   이어 돌리기: done.txt 에 있는 판은 건너뛴다(죽은 판도 rc 그대로 적고 덮지 않는다). 끝에 `ALL DONE` 표시 파일.
#   팔 = 이름|env(공백으로 여럿)|판 자 추가 인자   ·  env: ROOT · OUT · DAYS(400) · JOBS(2) · CAP_SEC(21600) · ARMSET(main|body)
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; DAYS="${DAYS:-400}"; JOBS="${JOBS:-2}"; CAP_SEC="${CAP_SEC:-21600}"; ARMSET="${ARMSET:-main}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/runs" "$OUT/tmp" "$OUT/route-cache"; touch "$OUT/done.txt"
BANDIT="T1404_DEN_ROUTE=1 T1404_GANG_FORAGE=1 T1404_GANG_SIZE=1 T1404_RAID_LURK=1"
if [ "$ARMSET" = main ]; then
SEEDS=(1020 7 42)
ARMS=(
  "off||"
  "food|T1419_FOOD_NEED=seen|"
  "side|T1422_SIDE_WORK=1|"
  "nobuild|T1423_NO_BUILD=1|"
  "react|T1423_BLOCK_REACT=1|"
  "bandit|$BANDIT|"
  "raid|$BANDIT T1431_RAID_BATTLE=1|"
  "npcdeath|T1432_NPC_DEATH=1|"
  "terrseq|T1433_TERR_SEQ=1|"
  "decay|T1438_DECAY=1|"
  "road|T1440_ROAD_RULE=1|"
)
else
  SEEDS=(1020)
  mapfile -t ARMS < "$OUT/body-arms.txt"   # 몸 세계 팔(나중에 정한다) — 줄마다 이름|env|인자
fi
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) days=$DAYS jobs=$JOBS set=$ARMSET" >> "$OUT/meta.txt"
one() {   # $1 = 팔|env|인자   $2 = 시드
  local arm="${1%%|*}"; local rest="${1#*|}"; local envs="${rest%%|*}" xa="${rest#*|}"; local s="$2" tag="$arm-$2"
  grep -q "^$tag " "$OUT/done.txt" && return 0
  local T="$OUT/tmp/$tag"; rm -rf "$T"; mkdir -p "$T"; local t0; t0=$(date +%s)
  ( cd "$ROOT" && env $envs TMPDIR="$T" T1473_OBS="$OUT/runs" T1473_ARM="$arm" \
      NODE_OPTIONS="--require $HERE/t1473-observe.js" \
      timeout "$CAP_SEC" node scripts/server-baseline-check.js --make "$OUT/runs/$tag.json" --days "$DAYS" --seeds "$s" --par 1 --vclock $xa \
      --route-cache "$OUT/route-cache" > "$OUT/runs/$tag.out" 2>&1 )
  local rc=$? dt=$(( $(date +%s) - t0 ))
  if [ "$rc" = 124 ]; then for p in $(pgrep -x node); do grep -qz "^TMPDIR=$T\$" "/proc/$p/environ" 2>/dev/null && kill "$p"; done; fi
  local lg; lg=$(ls "$T"/sbc-*/sbc-"$s".log 2>/dev/null | head -1); [ -n "$lg" ] && cp "$lg" "$OUT/runs/$tag.log"
  echo "$tag $rc $dt" >> "$OUT/done.txt"
  touch "$OUT/runs/$tag.done"
  rm -rf "$T"
}
export -f one; export OUT ROOT DAYS CAP_SEC HERE
for a in "${ARMS[@]}"; do for s in "${SEEDS[@]}"; do printf '%s\t%s\n' "$a" "$s"; done; done \
  | xargs -P "$JOBS" -d '\n' -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r a s <<< "$1"; one "$a" "$s"' _ {}
echo "done $(date -u +%FT%TZ)" >> "$OUT/meta.txt"
echo "ALL DONE $(date -u +%FT%TZ)" > "$OUT/ALL_DONE.$ARMSET"
