#!/usr/bin/env bash
# === scripts/deploy-check.sh — 배포 뒤 확인 한 줄 (#27 · T310 · T319) ==========
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
#   bash scripts/deploy-check.sh                                   # ★주소는 아래 세 자리에서 찾는다
#   bash scripts/deploy-check.sh <central 주소> <존 주소> [계정이름]
#   DEPLOY_HOST='<central> <zone> [이름]' bash scripts/deploy-check.sh
#   ~/Mini/실서버.txt 한 줄:  https://<central>  https://<zone>  <계정이름>
#
# ★라우트 기대표는 **여기 적지 않는다** — `scripts/lib-routes.js`(정본 · T290)에게 묻는다.
#   문이 하나 늘면 `test-doors`·`test-guest-identity` 와 **같이** 이 표도 움직인다(사본 0).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── ★★[T319] 실호스트 자리 — **레포에 안 둔다.** ─────────────────────────────
#   T310 이 잰 것: `DEPLOY.md`·`Caddyfile` 은 둘 다 `example.com` 견본이고, 레포 전수에 실호스트가 0 건이다.
#   레포는 공개라 주소를 여기 적을 수 없다 ⇒ **자리를 레포 밖에 하나** 둔다. 찾는 차례는 셋:
#     ① 인자           bash scripts/deploy-check.sh <central> <zone> [이름]
#     ② env            DEPLOY_HOST="<central> <zone> [이름]"  (또는 DEPLOY_CENTRAL·DEPLOY_ZONE)
#     ③ ★파일          ~/Mini/실서버.txt   — 한 줄:  <central> <zone> [이름]
#                       (`DEPLOY_HOSTFILE` 로 다른 자리를 가리킬 수 있다 · `#` 줄과 빈 줄은 건너뛴다)
#   셋 다 없으면 **로컬 판**으로 선다(에러가 아니다 — 그게 이 스크립트의 종전 쓰임이다).
#   ⇒ 재민의 실기는 **파일 한 줄**이다. 놓는 순간 인자 없이 `bash scripts/deploy-check.sh` 가 실서버 확인이 된다.
HOSTFILE="${DEPLOY_HOSTFILE:-$HOME/Mini/실서버.txt}"
SRC=""
C="${1:-}"; Z="${2:-}"; WHO="${3:-}"
if [ -n "$C" ] && [ -n "$Z" ]; then SRC="인자"; fi
if [ -z "$SRC" ]; then
  if [ -n "${DEPLOY_CENTRAL:-}" ] && [ -n "${DEPLOY_ZONE:-}" ]; then
    C="$DEPLOY_CENTRAL"; Z="$DEPLOY_ZONE"; WHO="${WHO:-${DEPLOY_WHO:-}}"; SRC="env DEPLOY_CENTRAL/DEPLOY_ZONE"
  elif [ -n "${DEPLOY_HOST:-}" ]; then
    read -r C Z WHO <<< "$DEPLOY_HOST"; SRC="env DEPLOY_HOST"
  elif [ -r "$HOSTFILE" ]; then
    LINE="$(grep -v -E '^[[:space:]]*(#|$)' "$HOSTFILE" | head -1)"
    if [ -n "$LINE" ]; then read -r C Z WHO <<< "$LINE"; SRC="파일 $HOSTFILE"; fi
  fi
fi
if [ -z "${C:-}" ] || [ -z "${Z:-}" ]; then
  echo "⚠**실호스트 없음 — 로컬 판**"
  echo "   실서버를 확인하려면 셋 중 하나:"
  echo "     ① bash scripts/deploy-check.sh <central 주소> <존 주소> [계정이름]"
  echo "     ② DEPLOY_HOST='<central> <zone> [이름]' bash scripts/deploy-check.sh"
  echo "     ③ $HOSTFILE 에 한 줄:  https://<central>  https://<zone>  <계정이름>"
  echo "   (레포엔 주소를 안 둔다 — 공개 레포다. 자리는 레포 밖 파일 하나다.)"
  exit 3
fi
CURL=(curl -sS --max-time 10)
# 열쇠꼴 값 마스킹 — 응답을 화면에 낼 때 반드시 통과시킨다.
mask() { sed -E 's/("(guest_token|password_hash|salt|token|secret)"[[:space:]]*:[[:space:]]*")[^"]*"/\1***"/g'; }
# ⚠`curl -w '%{http_code}'` 는 연결 실패에도 `000` 을 찍고 **종료코드가 0 이 아니다** —
#   `|| echo 000` 을 붙이면 `000000` 이 된다(첫 판이 그랬다). 종료코드는 버리고 찍힌 것만 쓴다.
code() { c="";  c=$("${CURL[@]}" -o /dev/null -w "%{http_code}" "$1" 2>/dev/null); echo "${c:-000}"; }

# ★루프백 판정 — ④ 의 갈래가 여기서 갈린다(호스트를 읽어서 정한다 · 손으로 안 고른다).
LOOPBACK=0
case "$C $Z" in *localhost*|*127.0.0.1*|*'[::1]'*|*' http://0.0.0.0'*) LOOPBACK=1;; esac

echo "=== 배포 뒤 확인 (#27 · T310 · T319) — $(date '+%Y-%m-%d %H:%M %Z') ==="
echo "  주소 출처 $SRC"
echo "  central   $C"
echo "  zone      $Z"
[ "$LOOPBACK" = 1 ] && echo "  ⚠**루프백 판** — 사설 주소 폴백으로 안 문이 열린다. 아래 ③ 은 그 갈래로 센다(문 판정이 아니다)."
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
        --data "$(printf '{"username":"%s"}' "$V")" "$C/check_username" 2>/dev/null); S="${S:-000}"
  printf '   %-10s %s  %s\n' "$L" "$S" "${R:-(빈 응답)}"
done
echo

# ── ② #9 `?as=` — 존 `/startinfo` ────────────────────────────────────────────
#   ★묻는 것: **이름만으로** 남의 벗·소속이 읽히나. 열쇠를 안 보낸다.
echo "② #9 GET /startinfo?as= — 이름만으로 남의 벗·소속이 읽히나 (T319 가 DEV_AS 뒤로 닫았다 · 실서버엔 env 가 없다)"
A=$("${CURL[@]}" "$Z/startinfo" 2>/dev/null | mask)
B=$("${CURL[@]}" "$Z/startinfo?as=$(printf '%s' "${WHO:-재민}" | sed 's/ /%20/g')" 2>/dev/null | mask)
printf '   %-10s %s\n' "as 없음" "$(printf '%s' "$A" | head -c 200)"
printf '   %-10s %s\n' "as=${WHO:-재민}" "$(printf '%s' "$B" | head -c 200)"
if [ "$A" = "$B" ]; then echo '   ⇒ **같다 — 닫혔다**(T319 · DEV_AS 없는 판)'; else echo '   ⇒ ★**다르다 — 이름만으로 더 나온다**. 그 존에 DEV_AS=1 이 걸려 있다는 뜻이다(실서버면 빼라).'; fi
echo

# ── ③ 62 라우트 한 바퀴 — **읽기(GET)만** ────────────────────────────────────
#   기대: 공개·투영 = 200 · 안 문 = 404(`denyOutside` 는 몸통이 `{"error":"not found"}` 하나다).
#   ⚠쓰기 라우트(POST)는 **안 친다** — 그건 `test-doors` 가 로컬에서 본다(T290 · 38/0).
# ── ★★[T319 ④] **루프백 갈래.** T310 판은 로컬에서 "어긋남 13" 을 냈다 — 그 13 은 전부
#   *사설 주소라 열린 안 문*이었다. 곧 **거짓 어긋남**이다: 스크립트가 "어긋남"이라 적었는데
#   그 자리는 어긋난 게 아니라 **그렇게 열리는 게 맞는** 자리였다.
#   ⇒ 호스트가 루프백이면 안 문의 **기대를 뒤집는다**: 200(열림)이 맞고, 404 면 그게 어긋남이다
#     (`internal-door.isInternal` 이 루프백을 안으로 치기 때문이다 — `test-doors` ⓒ3 이 그걸 판정으로 세워 뒀다).
#   ⇒ 표에도 갈라 적는다: `맞음` · `로컬열림`(루프백 판에서만 · 어긋남 아님) · `어긋남`.
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
N=0; OKN=0; BAD=0; LOCALOPEN=0
while IFS=$'\t' read -r KEY KIND URL; do
  [ -z "${KEY:-}" ] && continue
  N=$((N+1))
  S=$(code "$URL")
  BODY=$("${CURL[@]}" "$URL" 2>/dev/null | head -c 120 | mask)
  HID=no; case "$BODY" in *'"error":"not found"'*) HID=yes;; esac
  MARK=""
  case "$KIND" in
    안문)
      if [ "$S" = "404" ] && [ "$HID" = yes ]; then OKN=$((OKN+1)); MARK="맞음"
      elif [ "$LOOPBACK" = 1 ] && [ "$S" != "000" ] && [ "$HID" = no ]; then LOCALOPEN=$((LOCALOPEN+1)); MARK="로컬열림"
      else BAD=$((BAD+1)); MARK="★어긋남"; fi ;;
    *)
      if [ "$S" != "000" ] && [ "$HID" = no ]; then OKN=$((OKN+1)); MARK="맞음"
      else BAD=$((BAD+1)); MARK="★어긋남"; fi ;;
  esac
  [ "$MARK" = "★어긋남" ] && printf '   %-6s %-34s %-4s %s %s\n' "$KIND" "$KEY" "$S" "$MARK" "$BODY"
  [ "$MARK" = "로컬열림" ] && [ "${DC_VERBOSE:-0}" = 1 ] && printf '   %-6s %-34s %-4s %s\n' "$KIND" "$KEY" "$S" "로컬열림(정상)"
done < /tmp/dc-routes.$$
rm -f /tmp/dc-routes.$$
if [ "$LOOPBACK" = 1 ]; then
  echo "   읽기 라우트 $N — 맞음 $OKN · **로컬열림 $LOCALOPEN**(루프백이라 안 문이 열린다 · 어긋남 아님) · 어긋남 $BAD"
  echo "   ⇒ 문 판정은 **바깥에서** 한 판 더 돌려야 나온다(이 판이 잰 것은 스크립트가 도는가다). DC_VERBOSE=1 이면 그 $LOCALOPEN 줄도 찍는다."
else
  echo "   읽기 라우트 $N — 맞음 $OKN · 어긋남 $BAD   (쓰기 라우트는 안 쳤다 — test-doors 가 본다)"
fi
echo

# ── ④ `/perf` 한 줄 — 안 문이라 바깥에선 404 가 맞다 ─────────────────────────
# ── ④ 존의 안부 — `/perf` 는 안 문이고, 그 대신 `/health` 에 칸 둘이 있다(T319 ③) ──────
echo "④ 존 안부 — /perf 는 안 문(T225)이라 바깥 404 가 정상이다. 틱 p50·마을 수는 T319 가 /health 로 냈다"
printf '   %-12s %s\n' "존 /perf" "$(code "$Z/perf")     ← 바깥이면 404 가 맞다"
printf '   %-12s %s\n' "존 /metrics" "$(code "$Z/metrics")     ← 〃"
printf '   %-12s %s\n' "존 /health" "$(code "$Z/health")"
HJ=$("${CURL[@]}" "$Z/health" 2>/dev/null | mask)
printf '   %s\n' "$(printf '%s' "$HJ" | head -c 400)"
# 칸 둘만 따로 한 줄 — 재민이 눈으로 볼 자리
node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const h=JSON.parse(s);
  console.log("   ★한 줄  마을 " + (h.villages===null?"(마을 층 없음)":h.villages+"곳") +
              " · 틱 p50 " + (h.tickP50Ms===null?"(없음)":h.tickP50Ms+"ms") +
              " · 관측자 " + h.observers + " · 사람 " + h.humans + "/" + h.cap);
}catch(e){console.log("   ★한 줄  (health 를 못 읽었다)")}})' <<< "$HJ"
echo
if [ "$LOOPBACK" = 1 ]; then echo "=== 끝 · 어긋남 $BAD · 로컬열림 $LOCALOPEN(정상) ==="
else echo "=== 끝 · 어긋남 $BAD ==="; fi
