#!/usr/bin/env bash
# === scripts/t10-stale-control.sh — T10-① 대조군 ================================
# "고쳤다"를 말하려면 **옛 방식이 실제로 실패하는 조건**을 만들고 둘을 같은 조건에서 재야 한다.
#
# 조건: 앞 하네스의 central·zone 이 3010/3020 을 아직 쥐고 있다(러너의 drain 이 8초라 놓칠 수 있다).
#       그 잔재 세계에는 **E2E_GIVE 가 없다** — 하네스가 켜 달라고 한 세계와 다르다는 표식이다.
#
# 옛 방식(HEAD 의 판 — 스스로 찾는다 · 족보 79): 고정 포트 3010/3020 · 자식의 죽음을 안 봄
#   ⇒ 남의 서버에 붙어 "기동 OK" 로 통과하고, 인벤 검사 4건이 **엉뚱한 이유로** 떨어진다.
# 새 방식(작업 트리): 빈 포트를 골라 뜬다 ⇒ 잔재와 무관하게 통과.
#
# 사용: bash scripts/t10-stale-control.sh
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# ★옛 판은 **scripts/ 안에** 꺼내야 한다. /tmp 에 두면 __dirname 이 달라져
#   `require(../node_modules/ws)` 가 깨지고, 그건 "옛 방식이 실패했다"가 아니라 내 실수다.
OLD=scripts/_t10-old-guest-rejoin.js
trap 'rm -f "$OLD"' EXIT
# ★옛 판을 **레포에서 꺼낸다.** 손으로 베끼면 그건 사본이고, 무엇과 비교했는지 알 수 없다.
git show HEAD:scripts/test-guest-rejoin.js > "$OLD" 2>/dev/null || {
  echo "HEAD 에 옛 판이 없다 — 이미 커밋한 뒤라면 HEAD~1 로 바꿔라"; exit 2; }

cleanup() { pkill -f "server/zon[e].js" 2>/dev/null; pkill -f "server/centra[l].js" 2>/dev/null; sleep 3; }
stale() {
  cleanup
  DB_PATH=/tmp/t10-stale-c.db PORT=3010 PUBLIC_HOST=localhost \
    node --experimental-sqlite server/central.js > /tmp/t10-stale-c.log 2>&1 &
  sleep 2
  DB_PATH=/tmp/t10-stale-z.db PORT=3020 ZONE_ID=hanbando \
    ENABLE_VILLAGES=0 ENABLE_WILDLIFE=0 ENABLE_BANDITS=0 \
    node --experimental-sqlite server/zone.js > /tmp/t10-stale-z.log 2>&1 &
  for i in $(seq 1 90); do curl -sf -m2 http://localhost:3020/health >/dev/null 2>&1 && return 0; sleep 1; done
  echo "잔재 서버가 안 떴다"; return 1
}

run() {  # $1=라벨 $2=스크립트경로
  local out rc
  out="$(timeout 900 node "$2" 2>&1)"; rc=$?
  local p f
  p="$(echo "$out" | grep -oE 'PASS [0-9]+' | tail -1 | grep -oE '[0-9]+')"
  f="$(echo "$out" | grep -oE 'FAIL [0-9]+' | tail -1 | grep -oE '[0-9]+')"
  echo "  $1 → PASS ${p:-?} · FAIL ${f:-?} (rc=$rc)"
  echo "$out" | grep -E '^\s*✗' | head -5 | sed 's/^/      /'
  # ★결과줄이 없으면(크래시) 그건 '실패 99'가 아니라 **측정 불가**다 — 구분해서 남긴다.
  if [ -z "${p:-}" ]; then echo "CRASH" > /tmp/t10-lastfail
    echo "      ↑ 결과줄이 없다 = 크래시. 마지막 줄:"; echo "$out" | tail -3 | sed 's/^/        /'
  else echo "${f:-0}" > /tmp/t10-lastfail; fi
}

echo "=== 잔재 있음 · 옛 방식 ==="
stale || exit 1
run "옛 방식" "$OLD"; OLDF="$(cat /tmp/t10-lastfail)"

echo
echo "=== 잔재 있음 · 새 방식 ==="
stale || exit 1
run "새 방식" scripts/test-guest-rejoin.js; NEWF="$(cat /tmp/t10-lastfail)"
cleanup

echo
if [ "$OLDF" = "CRASH" ] || [ "$NEWF" = "CRASH" ]; then
  echo "✗ 대조군 불성립 — 한쪽이 크래시했다(옛 $OLDF · 새 $NEWF). 조건이 아니라 하네스 실행 자체가 깨진 것이다."
  exit 1
fi
if [ "${OLDF:-0}" -gt 0 ] && [ "${NEWF:-99}" -eq 0 ]; then
  echo "★대조군 성립 — 같은 잔재 조건에서 옛 방식 실패 ${OLDF}건 · 새 방식 실패 0건."
  exit 0
fi
echo "✗ 대조군 불성립 — 옛 ${OLDF} · 새 ${NEWF}."
echo "  (옛 방식이 0이면 잔재 조건이 안 만들어진 것이다 — 잔재 서버 로그를 봐라)"
exit 1
