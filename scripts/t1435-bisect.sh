#!/usr/bin/env bash
# === scripts/t1435-bisect.sh — `e2e-membership` ⑦ 한 판(⑦ 줄까지만) — 커밋 하나 [T1435 덧붙임 · S11 · 2026-11-23] =====================
# (@regress 없음 — 러너 밖 · 판 도구 · 코드 · 하네스 손 0)
#
# ★무엇: 레포 밖 worktree(`$WT`)를 커밋 C 로 돌려 놓고 **그 커밋의 하네스 · 제품 그대로** `node scripts/e2e-membership.js` 를 띄운다.
#   `⑦ 곳간은 촌장만` 줄이 나오면 프로세스 무리를 죽이고 그 줄 하나로 G(✓)/R(✗)를 낸다(PM 덧붙임 "⑦ 까지만 돌리면 한 판 1분").
#   300초 안에 ⑦ 줄이 안 나오면 X(못 잼).
# ★판마다 제 TMPDIR · 판 뒤 /tmp 에 새로 생긴 DB 만 지운다(T1366 규약). node_modules 는 본 레포 것을 잇는다(그 사이 package*.json 차 0).
#
#   WT=/home/user/t1435bis OUT=/home/user/t1435w/bisect.tsv bash scripts/t1435-bisect.sh <커밋> [판 수=1]
set -u
ROOT="$(git rev-parse --show-toplevel)"; cd "$ROOT" || exit 2
WT="${WT:?WT 를 줘라(레포 밖 worktree)}"; OUT="${OUT:?OUT 을 줘라}"; C="$1"; N="${2:-1}"
[ -d "$WT" ] || git worktree add --detach "$WT" "$C" >/dev/null 2>&1
git -C "$WT" checkout -q --detach "$C" || exit 3
[ -e "$WT/node_modules" ] || ln -s "$ROOT/node_modules" "$WT/node_modules"
Cs="$(git rev-parse --short=9 "$C")"
for k in $(seq 1 "$N"); do
  st="$WT/.stamp"; touch "$st"; td="$(mktemp -d)"; log="$(mktemp)"; t0=$(date +%s)
  ( cd "$WT" && TIDE_FREEZE_MS=372603 TMPDIR="$td" exec setsid node scripts/e2e-membership.js ) > "$log" 2>&1 &
  pid=$!
  for i in $(seq 1 300); do grep -q '⑦ 곳간은' "$log" && break; kill -0 "$pid" 2>/dev/null || break; sleep 1; done
  kill -- -"$pid" 2>/dev/null; sleep 1; kill -9 -- -"$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  line="$(grep -m1 '⑦ 곳간은' "$log" | cut -c1-200)"
  case "$line" in *'✓ ⑦'*) r=G;; *'✗ ⑦'*) r=R;; *) r=X; line="$(tail -2 "$log" | tr '\n\t' '  ' | cut -c1-200)";; esac
  printf '%s\t%s\t%s\t%s\t%s\n' "$Cs" "$k" "$r" "$(( $(date +%s) - t0 ))" "$line" | tee -a "$OUT"
  rm -rf "$td" "$log"
  find /tmp -maxdepth 2 -type f -newer "$st" \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' -o -name '*.sqlite' \) ! -path '/tmp/claude*' -delete 2>/dev/null
  [ "$r" = R ] && break
done
