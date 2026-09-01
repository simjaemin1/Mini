#!/usr/bin/env bash
# ★한반도 단독 재배포 — 재민 확정(2026-08-03): "한반도만 배포하는 건데 왜 자꾸 다 배포하냐"
#   redeploy-all.sh 는 존 26개를 전부 재생성한다 — 한반도 단독 운영에선 과잉이다.
#   이 스크립트는 git pull + 빌드 + central(선택) + durango-zone-hanbando 만 재생성한다.
#   DB(/srv/durango/hanbando)는 볼륨이라 절대 안 건드린다 — 리셋은 별도 절차(DB리셋_절차.md).
#
# 사용:
#   bash /opt/Mini/scripts/redeploy-hanbando.sh              # ★자동 판정(권장) — 바뀐 파일만큼만 한다
#   bash /opt/Mini/scripts/redeploy-hanbando.sh --all        # 전부(종전 --central 과 같음)
#   bash /opt/Mini/scripts/redeploy-hanbando.sh --central    # central 강제 포함
#   bash /opt/Mini/scripts/redeploy-hanbando.sh --zone       # 존 강제 포함
#
# ★★[2026-09-01 재민 "매번 너무 오래 걸린다"] **시간의 거의 전부는 존 재생성이다.**
#   종전 판은 바뀐 게 `public/client.js` 한 줄이어도 존을 다시 굽고 **재생성**했다.
#   그런데 클라는 존과 아무 상관이 없다 — central 이 `fs.createReadStream` 으로
#   **매 요청마다 디스크에서 읽어** 내보낸다(central.js:1049, Cache-Control: no-store).
#   존은 클라를 서빙하지 않는다. ⇒ 클라만 바뀐 배포에서 존을 건드리는 건 100% 낭비였고,
#   그 낭비가 첫 시딩·거리행렬(주석대로 ~190초, 50마을 첫 부팅은 훨씬 더)을 매번 다시 치르게 했다.
#
#   ⇒ 이제 **바뀐 파일을 보고 정한다.** 판단은 화면에 찍는다(조용히 건너뛰지 않는다).
#     · public/** · *.md · scripts/**  만 바뀌었다  → 존 **무접촉**(central 만)
#     · server/** · sim/** · package*.json · Dockerfile* 이 바뀌었다 → 존도 한다
#     · 무엇이 바뀌었는지 모르겠다(스탬프 없음·판정 실패) → **전부 한다**(안전한 쪽)
#   ★기준점은 "직전에 **실제로 배포된** 커밋"이다(아래 STAMP). pull 전 HEAD 가 아니다 —
#     지난번이 도중에 실패했으면 pull 전 HEAD 를 믿는 순간 빠뜨린다.
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/Mini}"
STAMP="${STAMP:-/srv/durango/deployed-hanbando.sha}"
cd "$REPO_DIR"

MODE="${1:-}"
FORCE_ALL=0; FORCE_CENTRAL=0; FORCE_ZONE=0
case "$MODE" in
  --all)     FORCE_ALL=1 ;;
  --central) FORCE_CENTRAL=1 ;;
  --zone)    FORCE_ZONE=1 ;;
  "")        ;;
  *) echo "모르는 옵션: $MODE  (--all | --central | --zone | 무인자=자동)"; exit 2 ;;
esac

_T0=$(date +%s)
echo "[1/4] git pull"
BEFORE=""
[ -f "$STAMP" ] && BEFORE="$(tr -d ' \n\r' < "$STAMP" || true)"
git pull
AFTER="$(git rev-parse HEAD)"
git log --oneline -1

# ── 무엇을 해야 하나 ──────────────────────────────────────────────────────────
DO_CENTRAL=1; DO_ZONE=1; WHY="기준점을 몰라 전부 한다(첫 실행이거나 스탬프 없음)"
if [ "$FORCE_ALL" = 1 ]; then
  WHY="--all 지정"
elif [ -n "$BEFORE" ] && git cat-file -e "${BEFORE}^{commit}" 2>/dev/null; then
  if [ "$BEFORE" = "$AFTER" ]; then
    CHANGED=""
  else
    CHANGED="$(git diff --name-only "$BEFORE" "$AFTER")"
  fi
  if [ -z "$CHANGED" ]; then
    DO_CENTRAL=0; DO_ZONE=0; WHY="배포된 커밋과 같다 — 바뀐 파일 0"
  else
    # 존이 굽는 것: server/** · sim/** · package*.json · Dockerfile.zone
    #   (public/** · *.md · scripts/** 는 존이 쓰지 않는다)
    if echo "$CHANGED" | grep -qvE '^(public/|scripts/|.*\.md$)'; then DO_ZONE=1; else DO_ZONE=0; fi
    if echo "$CHANGED" | grep -qE '^(public/|server/|sim/|package.*\.json|Dockerfile\.central)'; then DO_CENTRAL=1; else DO_CENTRAL=0; fi
    WHY="바뀐 파일 $(echo "$CHANGED" | wc -l | tr -d ' ')개 · ${BEFORE:0:8}..${AFTER:0:8}"
  fi
fi
[ "$FORCE_CENTRAL" = 1 ] && DO_CENTRAL=1
[ "$FORCE_ZONE" = 1 ] && DO_ZONE=1

echo
echo "[판정] $WHY"
[ -n "${CHANGED:-}" ] && echo "$CHANGED" | sed 's/^/         /' | head -20
echo "         central: $([ "$DO_CENTRAL" = 1 ] && echo '한다' || echo '건너뛴다')  ·  zone: $([ "$DO_ZONE" = 1 ] && echo '한다' || echo '★건너뛴다 — 존이 쓰는 파일이 안 바뀌었다')"
echo

if [ "$DO_CENTRAL" = 0 ] && [ "$DO_ZONE" = 0 ]; then
  echo "할 일이 없다. ($(( $(date +%s) - _T0 ))초)"
  echo "$AFTER" > "$STAMP" 2>/dev/null || true
  exit 0
fi

echo "[2/4] docker build"
if [ "$DO_ZONE" = 1 ]; then docker build -f Dockerfile.zone -t durango-zone .; fi
if [ "$DO_CENTRAL" = 1 ]; then docker build -f Dockerfile.central -t durango-central .; fi

recreate() {  # recreate <name> <image> <port> <volume>
  local NAME=$1 IMAGE=$2 PORT=$3 VOL=$4
  if ! docker ps -a --format '{{.Names}}' | grep -q "^${NAME}$"; then
    echo "  [err] ${NAME} 컨테이너 없음 — 최초 생성은 redeploy-zones.sh/redeploy-all.sh 로"; return 1
  fi
  docker inspect "$NAME" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -v -E '^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME)=' > "/tmp/${NAME}.env"
  docker rm -f "$NAME" >/dev/null
  docker run -d --name "$NAME" --restart unless-stopped \
    -p "${PORT}:${PORT}" -v "${VOL}:/data" \
    --env-file "/tmp/${NAME}.env" "$IMAGE" >/dev/null
  echo "  [up] $NAME"
}

echo "[3/4] 재생성"
if [ "$DO_CENTRAL" = 1 ]; then recreate durango-central durango-central 3010 /srv/durango/central; sleep 2; fi
if [ "$DO_ZONE" = 1 ]; then recreate durango-zone-hanbando durango-zone 3020 /srv/durango/hanbando; fi

sleep 2
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'durango-central|durango-zone-hanbando'

# ★존을 안 건드렸으면 기다릴 것도 없다 — central 은 몇 초면 뜬다. 여기서 끝낸다.
if [ "$DO_ZONE" = 0 ]; then
  for i in $(seq 1 60); do curl -sf -m 3 http://localhost:3010/health >/dev/null 2>&1 && break; sleep 1; done
  echo
  echo "  ✅ central 만 재배포 — 존은 안 건드렸다(접속 끊김 없음). 총 $(( $(date +%s) - _T0 ))초"
  echo "     클라만 바뀐 배포는 이 경로다. 브라우저에서 강력 새로고침(⌘⇧R) 한 번 하면 끝."
  echo "$AFTER" > "$STAMP" 2>/dev/null || true
  exit 0
fi

# ★[2026-08-06] **여기서 끝내면 안 된다.** `docker run -d` 는 컨테이너가 뜨면 즉시 반환하는데,
#   그 안의 Node 는 그 뒤로도 한참 초기화한다(50마을 존은 교역 거리행렬만 ~190초, 첫 시딩이면 훨씬 더).
#   종전 스크립트는 `sleep 2` 뒤 `Up 3 seconds (health: starting)` 만 찍고 끝나서
#   **다 된 것처럼 보였다** — 실제로 재민이 그 상태에서 접속했다가 "접속 가능 지역이 없다"를 봤다.
#   ⇒ 실제로 붙을 수 있을 때까지 기다린다. 진짜 준비 신호는 zone 의 /health 다.
echo
echo "[4/4] 부팅 대기 — 컨테이너 기동 ≠ 접속 가능. zone /health 가 뜰 때까지 본다."
_t0=$(date +%s)
for i in $(seq 1 900); do            # 최대 15분(첫 시딩이면 더 걸릴 수 있다 — 아래 안내 참조)
  if curl -sf -m 3 http://localhost:3020/health >/dev/null 2>&1; then
    echo "  ✅ zone 접속 가능 (존 부팅 $(( $(date +%s) - _t0 ))초 · 전체 $(( $(date +%s) - _T0 ))초)"
    docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'durango-central|durango-zone-hanbando'
    echo "$AFTER" > "$STAMP" 2>/dev/null || true
    exit 0
  fi
  if ! docker ps --format '{{.Names}}' | grep -q '^durango-zone-hanbando$'; then
    echo "  ❌ zone 컨테이너가 죽었다 — docker logs --tail 80 durango-zone-hanbando"; exit 1
  fi
  if [ $((i % 15)) -eq 0 ]; then
    echo "  … $(( $(date +%s) - _t0 ))초 경과 · $(docker logs --tail 1 durango-zone-hanbando 2>&1 | cut -c1-110)"
  fi
  sleep 1
done
echo "  ⚠ 15분 안에 안 떴다. 첫 시딩이면 정상일 수 있다(50마을 첫 부팅은 1시간 넘게 걸린다 — 인계 배치 16 미해결 항목)."
echo "     계속 보기: docker logs -f durango-zone-hanbando 2>&1 | grep -E '마을|시딩|zone server up|Error'"
