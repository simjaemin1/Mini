#!/usr/bin/env bash
# ★한반도 단독 재배포 — 재민 확정(2026-08-03): "한반도만 배포하는 건데 왜 자꾸 다 배포하냐"
#   redeploy-all.sh 는 존 26개를 전부 재생성한다 — 한반도 단독 운영에선 과잉이다.
#   이 스크립트는 git pull + 빌드 + central(선택) + durango-zone-hanbando 만 재생성한다.
#   DB(/srv/durango/hanbando)는 볼륨이라 절대 안 건드린다 — 리셋은 별도 절차(DB리셋_절차.md).
#
# 사용:
#   bash /opt/Mini/scripts/redeploy-hanbando.sh              # 존만 (central 이미지 무변경일 때)
#   bash /opt/Mini/scripts/redeploy-hanbando.sh --central    # central 도
#   ★--central 판정 기준(2026-08-05 정정): central.js 만이 아니라 **central 이미지에 들어가는
#     파일 전부**다 — server/central*.js **+ public/**(클라는 central 이 서빙한다. central.js:1049).
#     public/client.js 만 바뀐 배포도 --central 이 필요하다(배치 15 아이콘 404 · 배치 18 층 렌더가 그 실증).
set -euo pipefail
REPO_DIR="${REPO_DIR:-/opt/Mini}"
cd "$REPO_DIR"

echo "[1/3] git pull"
git pull
git log --oneline -1

echo "[2/3] docker build"
docker build -f Dockerfile.zone -t durango-zone .
if [ "${1:-}" = "--central" ]; then docker build -f Dockerfile.central -t durango-central .; fi

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

echo "[3/3] 재생성"
if [ "${1:-}" = "--central" ]; then recreate durango-central durango-central 3010 /srv/durango/central; sleep 2; fi
recreate durango-zone-hanbando durango-zone 3020 /srv/durango/hanbando

sleep 2
docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'durango-central|durango-zone-hanbando'

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
    echo "  ✅ zone 접속 가능 ($(( $(date +%s) - _t0 ))초)"
    docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'durango-central|durango-zone-hanbando'
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
