#!/usr/bin/env bash
# 26개 zone 컨테이너 stop + rm + 재생성. central은 건드리지 않음.
# 사용법: bash /opt/Mini/durango-mini/scripts/redeploy-zones.sh
#
# 전제:
#   - durango-zone 이미지 빌드되어 있음 (없으면 redeploy-all.sh 사용)
#   - central은 이미 띄워져 있음
#   - 데이터 디렉토리: /srv/durango/<zone_id>/
#   - 방화벽: 3001:3030/tcp 열림
set -euo pipefail

# === 설정 (서버 IP만 환경에 따라 바꾸면 됨) ===
CENTRAL_IP="${CENTRAL_IP:-141.164.35.114}"
PLAYER_CAP="${PLAYER_CAP:-150}"

# zone id : 호스트 port (3010은 central용이라 skip)
ZONES="canadia:3001 nubiano:3002 mayan:3003 amazonia:3004 patagona:3005 \
atlantic:3006 nordan:3007 europa:3008 sahar:3009 sibara:3011 \
centaria:3012 hindgang:3013 indoyang:3014 bering:3015 jungwon_n:3016 \
jungwon_s:3017 nanyang:3018 nambingyang:3019 hanbando:3020 nippon:3021 \
oseania:3022 pacific:3024 east_sea_s:3026 pacific_arctic:3027 japan_pacific:3028 \
kongra:3030"

# ENABLED_ZONES와 ZONE_HOSTS JSON 자동 생성
IDS=""
HOSTS=""
for Z in $ZONES; do
  ID=${Z%:*}
  IDS+="$ID,"
  HOSTS+="\"$ID\":\"$CENTRAL_IP\","
done
EN="${IDS%,}"
ZH="{${HOSTS%,}}"

echo "[redeploy-zones] central=$CENTRAL_IP, zones=$(echo $ZONES | wc -w)"

for Z in $ZONES; do
  ID=${Z%:*}; PORT=${Z#*:}
  mkdir -p /srv/durango/$ID
  docker rm -f durango-zone-$ID >/dev/null 2>&1 || true
  docker run -d --name durango-zone-$ID --restart unless-stopped \
    -p $PORT:$PORT -v /srv/durango/$ID:/data \
    -e ZONE_ID=$ID -e PORT=$PORT -e DB_PATH=/data/world-$ID.db \
    -e CENTRAL_HOST=$CENTRAL_IP -e CENTRAL_PORT=3010 \
    -e ENABLED_ZONES=$EN \
    -e "ZONE_HOSTS=$ZH" \
    -e PLAYER_CAP=$PLAYER_CAP \
    durango-zone >/dev/null
  echo "  [up] durango-zone-$ID  port=$PORT"
done

sleep 2
echo
echo "=== 상태 ==="
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango | sort
