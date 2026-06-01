#!/usr/bin/env bash
# 전체 재배포: git pull + 이미지 rebuild + central 재시작 + 26 zone 재생성.
# 사용법: bash /opt/Mini/durango-mini/scripts/redeploy-all.sh
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/Mini}"
CENTRAL_IP="${CENTRAL_IP:-141.164.35.114}"

cd "$REPO_DIR"
echo "[1/4] git pull"
git pull

# Dockerfile은 repo root (/opt/Mini)에 직접 있음 — durango-mini 서브폴더 X.
echo "[2/4] docker build"
docker build -f Dockerfile.central -t durango-central .
docker build -f Dockerfile.zone -t durango-zone .

echo "[3/4] central rm + 새 container (새 image 적용)"
# 주의: docker restart는 새 image 적용 안 함. 옛 container의 옛 filesystem 그대로.
# 새 client.js / server.js 적용하려면 rm + run 필수.
# 기존 env (ZONE_HOSTS 등) 보존하기 위해 inspect로 백업 후 --env-file 전달.
if docker ps -a --format '{{.Names}}' | grep -q '^durango-central$'; then
  docker inspect durango-central --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -v -E '^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME)=' \
    > /tmp/central-app.env
  docker rm -f durango-central >/dev/null
  docker run -d --name durango-central --restart unless-stopped \
    -p 3010:3010 -v /srv/durango/central:/data \
    --env-file /tmp/central-app.env \
    durango-central >/dev/null
else
  echo "  [warn] durango-central 컨테이너 없음 — 수동으로 만들어야 함 (env 정보 모름)"
fi
sleep 1
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango-central

echo "[4/4] zone 26개 재생성"
bash "$(dirname "$0")/redeploy-zones.sh"

echo
echo "=== 헬스 ==="
sleep 2
curl -s "http://$CENTRAL_IP:3010/health" || echo "central health 실패"
echo
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango | wc -l | xargs echo "총 컨테이너:"
