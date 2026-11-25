#!/usr/bin/env bash
# === scripts/t1480-run.sh — 커밋 하나에서 하네스 하나를 N 판 [T1480 · S14 · 2026-11-24] =====================
# (@regress 없음 — 러너 밖 · 판 도구 · 제품 코드 · 있던 스크립트 손 0)
# ★무엇: 레포 밖 임시 worktree 를 커밋 C 로 만들고, **지금(`53a54a4f8`)의 하네스 파일만** 그 위에 덮어 쓴 뒤 N 판을 돈다(제품 코드는 C 것).
#   판마다 네트워크 · pid · 마운트 이름공간 따로 + /tmp 따로(`/tmp/t511-zone-<pid>.db` 겹침 막기 · T1458 lane.sh 꼴) · `timeout 40m`.
#   초록 G = rc 0 · 유보 Y = rc 75 · 못 뜸 X(`Cannot find module` · 기동 못 함 = 건너뜀) · 나머지(rc 124 포함) R.
#   끝 줄: `<커밋> <하네스> <판> <G|R|Y|X> <rc> <초> <첫 ✗ 줄>` 을 `$OUT/runs.tsv` 에 붙인다. 판 로그는 `$LOGS`(레포 밖)에만 둔다.
#   JOBS(기본 1) 판을 나란히 돈다(이름공간이 따로라 포트 겹침 없음). POS=1 이면 읽기만 하는 귀(`t1480-posdump.js`)를 건다 — ⑦ 빨강의 자리 기록.
#   쓰는 법: OUT=<디렉터리> [LOGS=/var/tmp/t1480] [JOBS=1] [POS=1] [KEEP=1] bash scripts/t1480-run.sh <커밋> <하네스(e2e-membership)> <판 수> [첫판번호=1]
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
OUT="${OUT:?OUT}"; LOGS="${LOGS:-/var/tmp/t1480}"; JOBS="${JOBS:-1}"; POS="${POS:-0}"; HEAD_C="${HEAD_C:-53a54a4f8}"
C="$1"; H="$2"; N="$3"; K0="${4:-1}"
mkdir -p "$OUT" "$LOGS"; touch "$OUT/runs.tsv"
Cs="$(git rev-parse --short=9 "$C")"
WT="/home/user/wt-t1480-${H#e2e-}-$Cs-$$"
if [ ! -d "$WT" ]; then git worktree add --detach "$WT" "$C" >/dev/null 2>&1 || { echo "worktree 실패 $C" >&2; exit 3; }; fi
[ -e "$WT/node_modules" ] || ln -s /home/user/Mini/node_modules "$WT/node_modules"
git show "$HEAD_C:scripts/$H.js" > "$WT/scripts/$H.js" || exit 4        # 하네스만 지금 것으로
# 하네스가 부르는 같은 폴더 보조 모듈(`./lib-port` 같은 것)이 옛 커밋에 **없을 때만** 지금 것을 채운다(있으면 그 커밋 것 그대로 · 제품 코드 `server/` `client/` `sim/` 는 안 건드린다).
queue="$H"; seen=" $H "
while [ -n "$queue" ]; do
  cur="${queue%% *}"; [ "$queue" = "$cur" ] && queue="" || queue="${queue#* }"
  src="$(git show "$HEAD_C:scripts/$cur.js" 2>/dev/null)" || continue
  for dep in $(printf '%s' "$src" | grep -oE "require\('\./[A-Za-z0-9_.-]+'\)" | sed -E "s/require\('\.\/(.*)'\)/\1/" | sed 's/\.js$//' | sort -u); do
    case "$seen" in *" $dep "*) continue;; esac; seen="$seen$dep "
    if [ ! -e "$WT/scripts/$dep.js" ] && git cat-file -e "$HEAD_C:scripts/$dep.js" 2>/dev/null; then
      git show "$HEAD_C:scripts/$dep.js" > "$WT/scripts/$dep.js"; echo "$dep" >> "$OUT/filled.$Cs.txt"; queue="$queue $dep"; queue="${queue# }"
    fi
  done
done
TOPT=""; [ "$POS" = 1 ] && TOPT="--require $ROOT/scripts/t1480-posdump.js"
one() {
  local k="$1" tag="$Cs.$H.$k" t0 PT rc res line
  PT="$LOGS/tmp-$tag"; rm -rf "$PT"; mkdir -p "$PT"; chmod 1777 "$PT"
  t0=$(date +%s)
  timeout --kill-after=60 40m unshare -n -p -m -f --kill-child --mount-proc bash -c "
    mount --bind $PT /tmp || exit 96
    python3 $ROOT/scripts/t853/uplo.py || exit 97
    cd $WT && TIDE_FREEZE_MS=372603 T1480_POS=/tmp/t1480-pos.jsonl NODE_OPTIONS='$TOPT' node scripts/$H.js
  " > "$LOGS/$tag.log" 2>&1 < /dev/null
  rc=$?
  if [ $rc -eq 0 ]; then res=G; elif [ $rc -eq 75 ]; then res=Y; elif [ $rc -eq 124 ] || [ $rc -eq 137 ]; then res=R   # 40분 끊김 = 빨강(T1435 RC=124 꼴 · 줄 하나도 못 찍어도 X 아님)
  elif ! grep -qE '^\s*(✓|✗)' "$LOGS/$tag.log"; then res=X; else res=R; fi
  line="$(grep -m1 -E '^\s*(✗|❌)' "$LOGS/$tag.log" | cut -c1-300 | tr '\t' ' ')"
  [ -z "$line" ] && line="$(tail -n 2 "$LOGS/$tag.log" | tr '\n\t' '  ' | cut -c1-200)"
  [ -s "$PT/t1480-pos.jsonl" ] && cp "$PT/t1480-pos.jsonl" "$OUT/pos.$tag.jsonl"
  rm -rf "$PT"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$Cs" "$H" "$k" "$res" "$rc" "$(( $(date +%s) - t0 ))" "$line" >> "$OUT/runs.tsv"
  [ "$res" = R ] || [ "${KEEPLOG:-0}" = 1 ] || rm -f "$LOGS/$tag.log"
}
k=$K0; end=$(( K0 + N - 1 ))
while [ $k -le $end ]; do
  pids=""
  for j in $(seq 1 "$JOBS"); do
    [ $k -le $end ] || break
    one $k & pids="$pids $!"; k=$(( k + 1 ))
  done
  wait $pids
done
[ "${KEEP:-0}" = 1 ] || { git worktree remove --force "$WT" >/dev/null 2>&1; rm -rf "$WT"; git worktree prune; }
