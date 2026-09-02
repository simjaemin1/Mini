#!/usr/bin/env bash
# === scripts/tidal-mutations.sh — T54 돌연변이 검사 (계측기 · ⚠러너에 넣지 마라) ==========
#
# ★★족보 (94)·(83): **표에 칸을 넣는 것과 그 칸을 읽는 것은 다른 명제다.**
#   재민/PM 판정이 정확히 그 함정 자리를 짚었다 — `returns` 칸을 두고 정본 하나가 읽게 하되,
#   **그 한 줄을 지우면 하네스가 빨개지는지**를 증명하라고 했다. 이 스크립트가 그 증명이다.
#
# 하는 일: 저장소를 하드링크로 싸게 복제하고(원본 무접촉), 돌연변이를 하나씩 넣고,
#          `test-tidal` 이 **실제로 빨개지는지** 센다. 초록이면 그 검사는 이빨이 없는 것이다.
#
# 실행: bash scripts/tidal-mutations.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK=/tmp/t54-mut
PASS=0; FAIL=0

run_mut () {   # $1=이름  $2=파이썬 돌연변이 스크립트  $3=빨개져야 할 절 표시
  local name="$1" pyscript="$2" expect="$3"
  rm -rf "$WORK"; mkdir -p "$WORK"
  # 하드링크 복제 — 즉시 끝나고 디스크를 안 먹는다. 고칠 파일만 진짜 사본으로 덮는다.
  cp -al "$ROOT"/server "$ROOT"/scripts "$ROOT"/sim "$ROOT"/public "$WORK"/ 2>/dev/null
  cp -a "$ROOT"/package.json "$WORK"/ 2>/dev/null
  ln -s "$ROOT"/node_modules "$WORK"/node_modules
  python3 - "$WORK" <<PY
import sys, os
W = sys.argv[1]
$pyscript
PY
  if [ $? -ne 0 ]; then echo "  ✗ [$name] 돌연변이를 못 넣었다(소스가 바뀐 것이다 — 검사 자체가 낡았다)"; FAIL=$((FAIL+1)); return; fi
  out="$(cd "$WORK" && node scripts/test-tidal.js 2>&1)"
  line="$(echo "$out" | grep -E '^=== [0-9]+건 중' | tail -1)"
  reds="$(echo "$out" | grep -c '✗' || true)"
  if [ "$reds" -gt 0 ]; then
    echo "  ✓ [$name] 하네스가 **잡았다** — 빨강 ${reds}건 · $line"
    echo "$out" | grep '✗' | head -3 | sed 's/^/        /'
    PASS=$((PASS+1))
  else
    echo "  ✗ [$name] ★★하네스가 **못 잡았다** — 초록이다($expect 가 이빨이 없다) · $line"
    FAIL=$((FAIL+1))
  fi
  rm -rf "$WORK"
}

echo ""
echo "=== T54 돌연변이 검사 — 하네스가 실제로 잡는가 ==="

run_mut "① returns 읽는 줄 제거" '
p = os.path.join(W, "server", "zone.js"); s = open(p, encoding="utf-8").read()
i = [l for l in s.split("\n") if "eff.returns" in l]
assert len(i) == 1, "eff.returns 줄이 하나가 아니다"
os.remove(p); open(p, "w", encoding="utf-8").write(s.replace(i[0] + "\n", ""))
' "⑨ 병 개수 보존"

run_mut "② 용기 게이트를 === BRINE 으로 되돌림" '
p = os.path.join(W, "server", "zone.js"); s = open(p, encoding="utf-8").read()
old = "if (require(\x27./tidal\x27).usesVessel(src.kind)) {"
assert old in s, "게이트 줄을 못 찾음"
os.remove(p); open(p, "w", encoding="utf-8").write(s.replace(old, "if (src.kind === Salt.BRINE) {", 1))
' "⑧·⑨ 채수 게이트"

run_mut "③ PRESERVED_EFFECTS 주입 줄 제거" '
p = os.path.join(W, "server", "zone.js"); s = open(p, encoding="utf-8").read()
i = [l for l in s.split("\n") if "driedEffects()" in l]
assert len(i) == 1, "driedEffects 줄이 하나가 아니다"
os.remove(p); open(p, "w", encoding="utf-8").write(s.replace(i[0] + "\n", ""))
' "⑩ 말린 것을 먹을 수 있다"

echo ""
echo "=== 돌연변이 ${PASS}건 잡음 · ${FAIL}건 놓침 ==="
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
