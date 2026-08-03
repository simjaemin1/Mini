#!/usr/bin/env bash
# ★한반도 단독 재배포 — 재민 확정(2026-08-03): "한반도만 배포하는 건데 왜 자꾸 다 배포하냐"
#   redeploy-all.sh 는 존 26개를 전부 재생성한다 — 한반도 단독 운영에선 과잉이다.
#   이 스크립트는 git pull + 빌드 + central(선택) + durango-zone-hanbando 만 재생성한다.
#   DB(/srv/durango/hanbando)는 볼륨이라 절대 안 건드린다 — 리셋은 별도 절차(DB리셋_절차.md).
#
# 사용:
#   bash /opt/Mini/scripts/redeploy-hanbando.sh              # 존만 (central 무변경일 때)
#   bash /opt/Mini/scripts/redeploy-hanbando.sh --central    # central 도 (central.js/central-client.js 가 바뀐 배포)
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
echo
echo "확인: docker logs -f durango-zone-hanbando 2>&1 | grep -E '마을|zone server up'"
