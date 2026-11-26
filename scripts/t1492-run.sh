#!/usr/bin/env bash
# === scripts/t1492-run.sh — T1492 긴 판 러너(코드 손 0 · `t1486-run.sh` 꼴 + 마디 판) ===
#   판 목록 = $OUT/jobs.tsv(한 줄 한 판 · 차례 = 먼저 띄울 차례):  이름  꼴(long|short)  날  시드  손짓(T1492_ACTS · all = T1486 그대로 · none)  존(- = 한반도)  probe(- | prof | ss | count · + 로 묶음 — count 는 env 칸에 T1492_COUNT=이름+이름)  env(K=V,K=V · - = 없음)
#   long  = scripts/t1308-long-run.js <날> <시드> --every 100(100날마다 체크포인트 · 끊기면 마지막 체크포인트에서 잇는다) + 봇 프리로드(scripts/t1492-bots.js · 마디마다 seg-<날>.bots.json)
#   short = scripts/t577-server-run.js <날> <시드>(T1486 판 자 그대로) + 봇 프리로드 + (probe 면) scripts/t1492-probe.js
#   이어 돌리기: 같은 줄을 다시 부르면 done.txt 에 있는 판은 건너뛰고, 돌던 긴 판은 체크포인트에서 잇고(죽은 판 = dead.txt 에 한 줄), 돌던 짧은 판은 처음부터.
#   판마다 끝 표시 runs/<이름>.done · 다 끝나면 ALL_DONE. 긴 판이 끝나면 DB(w.db*)와 체크포인트(ck/)는 지운다(디스크) — 크기는 봇 관찰기가 20날마다 적었다.
#   env: ROOT · OUT · JOBS(3) · BOTS(8) · JOBFILE($OUT/jobs.tsv · 덧붙인 판은 다른 목록 파일로 따로 부른다) · $OUT/STOP 이 있으면 새 판을 안 띄운다
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"; JOBS="${JOBS:-3}"; BOTS="${BOTS:-8}"; JOBFILE="${JOBFILE:-$OUT/jobs.tsv}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT/runs" "$OUT/tmp" "$OUT/route-cache"; touch "$OUT/done.txt" "$OUT/dead.txt"
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD) jobs=$JOBS bots=$BOTS" >> "$OUT/meta.txt"
one() {   # 한 줄(탭 갈림)
  local name kind days seed acts zone probe envs
  IFS=$'\t' read -r name kind days seed acts zone probe envs <<< "$1"
  [ -z "$name" ] && return 0; case "$name" in \#*) return 0;; esac
  grep -q "^$name " "$OUT/done.txt" && return 0
  [ -f "$OUT/STOP" ] && return 0
  local R="$OUT/runs/$name"; mkdir -p "$R"
  local T="$OUT/tmp/$name"; mkdir -p "$T"
  local E=(T745_VCLOCK=1 VILLAGE_DAY_MS=1440000 T699_ROUTE_CACHE="$OUT/route-cache" T1486_BOTS="$BOTS" TMPDIR="$T")
  [ "$acts" != "all" ] && E+=(T1492_ACTS="$acts")
  [ "$zone" != "-" ] && E+=(T577_ZONE="$zone")
  if [ "$envs" != "-" ]; then IFS=',' read -ra KV <<< "$envs"; E+=("${KV[@]}"); fi
  if [ -f "$R/running" ]; then echo "$name $(cat "$R/running") 끊김 → 다시 $(date -u +%FT%TZ) ck=$( [ -f "$R/progress.json" ] && node -e "console.log(require('$R/progress.json').ck)" || echo 0)" >> "$OUT/dead.txt"; fi
  date -u +%FT%TZ > "$R/running"
  local t0; t0=$(date +%s); local rc=0
  if [ "$kind" = long ]; then
    local tries=0 last=-1
    while :; do
      local ck=0; [ -f "$R/progress.json" ] && ck=$(node -e "const p=require('$R/progress.json');console.log(p.done?'done':p.ck)")
      [ "$ck" = done ] && { rc=0; break; }
      if [ "$ck" = "$last" ]; then tries=$((tries+1)); else tries=0; last="$ck"; fi
      [ "$tries" -ge 3 ] && { rc=3; echo "$name 같은 마디(ck=$ck) 세 번 죽음 — 멈춤 $(date -u +%FT%TZ)" >> "$OUT/dead.txt"; break; }
      [ -f "$OUT/STOP" ] && { rc=9; break; }
      if [ -f "$R/progress.json" ]; then
        ( cd "$ROOT" && env "${E[@]}" node scripts/t1308-long-run.js --resume "$R" >> "$R/runner.log" 2>&1 ); rc=$?
      else
        ( cd "$ROOT" && env "${E[@]}" T577_TAG=sbc T1492_SEG=1 NODE_OPTIONS="--max-old-space-size=4608 --require $HERE/t1492-bots.js" \
            node scripts/t1308-long-run.js "$days" "$seed" --every 100 --dir "$R" --tag sbc >> "$R/runner.log" 2>&1 ); rc=$?
      fi
      [ "$rc" = 0 ] && continue
      [ "$rc" = 3 ] && { echo "$name 마디 죽음(코드 3 · ck=$ck) $(date -u +%FT%TZ) — 다시" >> "$OUT/dead.txt"; continue; }
      echo "$name 판 자 코드 $rc(ck=$ck) $(date -u +%FT%TZ)" >> "$OUT/dead.txt"; break
    done
    if [ "$rc" = 0 ]; then rm -rf "$R/ck" "$R/ck.old" "$R/ck.tmp"; rm -f "$R"/w.db "$R"/w.db-wal "$R"/w.db-shm; for f in "$R"/seg-*.log; do [ -f "$f" ] && gzip -f "$f"; done; fi
  else
    local PO=""; [ "$probe" != "-" ] && PO=" --require $HERE/t1492-probe.js"
    local PE=(); [ "$probe" != "-" ] && PE=(T1492_PROBE_OUT="$R/probe.json"); case "$probe" in *prof*) PE+=(T1492_PROF=1);; esac; case "$probe" in *ss*) PE+=(T1492_SS=1);; esac
    ( cd "$ROOT" && env "${E[@]}" "${PE[@]}" T577_DIR="$T" T577_TAG=sbc T577_PAR=1 T1492_OUT="$R/bots.json" \
        NODE_OPTIONS="--max-old-space-size=4608 --require $HERE/t745-vclock.js --require $HERE/t1492-bots.js$PO" \
        node scripts/t577-server-run.js "$days" "$seed" > "$R/run.out" 2>&1 ); rc=$?
    [ -f "$T/sbc-$seed.json" ] && cp "$T/sbc-$seed.json" "$R/sbc.json"
    [ -f "$T/sbc-$seed.log" ] && gzip -c "$T/sbc-$seed.log" > "$R/sbc.log.gz"
  fi
  [ "$rc" = 9 ] && { rm -f "$R/running"; return 0; }
  local dt=$(( $(date +%s) - t0 ))
  echo "$name $rc $dt" >> "$OUT/done.txt"
  touch "$OUT/runs/$name.done"; rm -f "$R/running"
  rm -rf "$T"
}
export -f one; export OUT ROOT HERE BOTS
grep -v '^\s*$' "$JOBFILE" | xargs -P "$JOBS" -d '\n' -I{} bash -c 'one "$1"' _ {}
echo "done $(date -u +%FT%TZ)" >> "$OUT/meta.txt"
[ -f "$OUT/STOP" ] || [ "$JOBFILE" != "$OUT/jobs.tsv" ] || echo "ALL DONE $(date -u +%FT%TZ)" > "$OUT/ALL_DONE"
