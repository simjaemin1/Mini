#!/usr/bin/env bash
# === scripts/deploy-check.sh — 배포 뒤 확인 한 줄 (#27 · T310) ==================
#
# ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음 · 러너는 `.js` 등재 표로 찾는다).
# ⚠**읽기만 한다.** 쓰기 라우트(POST 로 세계를 바꾸는 것)는 **한 번도 안 친다** ·
#   열쇠(`CENTRAL_SECRET`·게스트 토큰·비밀번호)는 **한 번도 안 보낸다** ·
#   응답에 열쇠꼴 값이 보이면 찍기 전에 **마스킹**한다.
#   ⇒ 그래서 이 스크립트는 **바깥 사람**이 하는 것과 정확히 같은 일만 한다. 그게 이 검사의 뜻이다.
# ⚠**바깥에서 돌려라**(집 노트북 등). 서버 안에서 `localhost` 로 두드리면 사설 주소라 **안 문이 열린다**
#   — 그건 다른 검사다(`인계/N-네트워크.md` N-배포뒤 경고 그대로).
#
# 쓰기:
#   bash scripts/deploy-check.sh <central 주소> <존 주소> [확인할 계정이름]
#   예: bash scripts/deploy-check.sh https://central.example.com https://kr.example.com 재민
#
# ★라우트 기대표는 **여기 적지 않는다** — `scripts/lib-routes.js`(정본 · T290)에게 묻는다.
#   문이 하나 늘면 `test-doors`·`test-guest-identity` 와 **같이** 이 표도 움직인다(사본 0).
set -uo pipefail
C="${1:-}"; Z="${2:-}"; WHO="${3:-}"
if [ -z "$C" ] || [ -z "$Z" ]; then
  echo "쓰기: bash scripts/deploy-check.sh <central 주소> <존 주소> [계정이름]" >&2; exit 2
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CURL=(curl -sS --max-time 10)
# 열쇠꼴 값 마스킹 — 응답을 화면에 낼 때 반드시 통과시킨다.
mask() { sed -E 's/("(guest_token|password_hash|salt|token|secret)"[[:space:]]*:[[:space:]]*")[^"]*"/\1***"/g'; }
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' "$1" 2>/dev/null || echo 000; }

echo "=== 배포 뒤 확인 (#27 · T310) — $(date '+%Y-%m-%d %H:%M %Z') ==="
echo "  central $C"
echo "  zone    $Z"
echo

# ── ① #2 `/check_username` — 셋 (있는 이름 / 없는 이름 / 빈 값) ───────────────
#   ⚠이것만 POST 다. **세계를 한 칸도 안 바꾼다**(`central.js` 는 `findAccount` 를 읽고 `{taken}` 만 낸다) —
#     "쓰기 0" 규칙의 뜻은 *상태를 바꾸지 않는다*이지 *POST 를 안 친다*가 아니다. 회부 #2 의 대상이 이 문이다.
echo "① #2 POST /check_username — 열린 문(회부됨) · 이름 존재를 바깥에 알려 준다"
for CASE in "있는이름:${WHO:-__없을이름__}" "없는이름:__존재하지않는이름_$$__" "빈값:"; do
  L="${CASE%%:*}"; V="${CASE#*:}"
  R=$("${CURL[@]}" -X POST -H 'Content-Type: application/json' \
        --data "$(printf '{"username":"%s"}' "$V")" "$C/check_username" 2>/dev/null | mask)
  S=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
        --data "$(printf '{"username":"%s"}' "$V")" "$C/check_username" 2>/dev/null || echo 000)
  printf '   %-10s %s  %s\n' "$L" "$S" "${R:-(빈 응답)}"
done
echo

# ── ② #9 `?as=` — 존 `/startinfo` ────────────────────────────────────────────
#   ★묻는 것: **이름만으로** 남의 벗·소속이 읽히나. 열쇠를 안 보낸다.
echo "② #9 GET /startinfo?as= — 이름만으로 남의 벗·소속이 읽히나"
A=$("${CURL[@]}" "$Z/startinfo" 2>/dev/null | mask)
B=$("${CURL[@]}" "$Z/startinfo?as=$(printf '%s' "${WHO:-재민}" | sed 's/ /%20/g')" 2>/dev/null | mask)
printf '   %-10s %s\n' "as 없음" "$(printf '%s' "$A" | head -c 200)"
printf '   %-10s %s\n' "as=${WHO:-재민}" "$(printf '%s' "$B" | head -c 200)"
if [ "$A" = "$B" ]; then echo "   ⇒ 같다 — 이름으로 더 나오는 것이 없다"; else echo "   ⇒ ★다르다 — 이름만으로 더 나온다(회부 #9 그대로 열려 있다)"; fi
echo

# ── ③ 62 라우트 한 바퀴 — **읽기(GET)만** ────────────────────────────────────
#   기대: 공개·투영 = 200 · 안 문 = 404(`denyOutside` 는 몸통이 `{"error":"not found"}` 하나다).
#   ⚠쓰기 라우트(POST)는 **안 친다** — 그건 `test-doors` 가 로컬에서 본다(T290 · 19/0).
case "$C$Z" in *localhost*|*127.0.0.1*) echo "   ⚠루프백 주소다 — **사설 주소 폴백**으로 안 문이 열린다. 아래 '안문 어긋남'은 정상이고, 문 판정이 아니라 **스크립트가 도는지**를 본 것이다.";; esac
echo "③ 라우트 전수(읽기만) — 기대표는 scripts/lib-routes.js 정본"
node -e '
const L = require(process.argv[1] + "/scripts/lib-routes.js");
const SAMPLE = { "/player/": process.argv[4] || "재민", "/friends/": process.argv[4] || "재민",
                 "/tribe/": "1", "/economy/prices/": "농촌1", "/startinfo": "" };
const out = [];
for (const [key, v] of Object.entries(L.ROUTES)) {
  const r = L.parseKey(key);
  if (r.svc === "dispatcher") continue;                 // 디스패처는 별도 호스트다
  if (!r.methods.includes("GET")) continue;             // ★읽기만
  const base = r.svc === "zone" ? process.argv[3] : process.argv[2];
  const p = r.prefix ? (r.path + (SAMPLE[r.path] || "")) : r.path;
  out.push([key, v[0], base + p]);
}
for (const [key, kind, url] of out) console.log([key, kind, url].join("\t"));
' "$ROOT" "$C" "$Z" "${WHO:-재민}" > /tmp/dc-routes.$$ 2>/dev/null
N=0; OKN=0; BAD=0
while IFS=$'\t' read -r KEY KIND URL; do
  [ -z "${KEY:-}" ] && continue
  N=$((N+1))
  S=$(code "$URL")
  BODY=$("${CURL[@]}" "$URL" 2>/dev/null | head -c 120 | mask)
  HID=no; case "$BODY" in *'"error":"not found"'*) HID=yes;; esac
  case "$KIND" in
    안문) if [ "$S" = "404" ] && [ "$HID" = yes ]; then OKN=$((OKN+1)); MARK="✅"; else BAD=$((BAD+1)); MARK="★어긋남"; fi ;;
    *)    if [ "$S" != "000" ] && [ "$HID" = no ]; then OKN=$((OKN+1)); MARK="✅"; else BAD=$((BAD+1)); MARK="★어긋남"; fi ;;
  esac
  [ "$MARK" != "✅" ] && printf '   %-6s %-34s %-4s %s %s\n' "$KIND" "$KEY" "$S" "$MARK" "$BODY"
done < /tmp/dc-routes.$$
rm -f /tmp/dc-routes.$$
echo "   읽기 라우트 $OKN/$N 맞음 · 어긋남 $BAD   (쓰기 라우트는 안 쳤다 — test-doors 가 본다)"
echo

# ── ④ `/perf` 한 줄 — 안 문이라 바깥에선 404 가 맞다 ─────────────────────────
echo "④ /perf — 안 문(T225 가 닫았다). 바깥 404 가 정상이고, 그러면 존 틱 p50 은 HTTP 로 못 읽는다"
printf '   %-10s %s\n' "존 /perf" "$(code "$Z/perf")"
printf '   %-10s %s\n' "존 /metrics" "$(code "$Z/metrics")"
printf '   %-10s %s\n' "존 /health" "$(code "$Z/health")"
"${CURL[@]}" "$Z/health" 2>/dev/null | mask | head -c 300; echo
echo
echo "=== 끝 · 어긋남 $BAD ==="
