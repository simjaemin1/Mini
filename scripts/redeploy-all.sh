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

echo "[3/4] central 재시작"
# central env에 ZONE_HOSTS가 박혀있으니, 컨테이너 새로 만들지 말고 restart만.
# (만약 zone 목록이 바뀌면 별도 처리 필요)
docker restart durango-central >/dev/null
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango-central

echo "[4/4] zone 26개 재생성"
bash "$(dirname "$0")/redeploy-zones.sh"

echo
echo "=== 헬스 ==="
sleep 2
curl -s "http://$CENTRAL_IP:3010/health" || echo "central health 실패"
echo
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango | wc -l | xargs echo "총 컨테이너:"
