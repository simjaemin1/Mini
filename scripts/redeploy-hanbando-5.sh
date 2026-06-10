#!/usr/bin/env bash
# 한반도 + 인접 4 zone만 재시작 (SVG 강·호수 데이터 적용 검증용).
# 다른 21 zone은 그대로 둠 — 26 zone 오픈월드 구조 유지.
# 사용법: bash /opt/Mini/durango-mini/scripts/redeploy-hanbando-5.sh
set -euo pipefail

CENTRAL_IP="${CENTRAL_IP:-141.164.35.114}"
PLAYER_CAP="${PLAYER_CAP:-150}"

# 전체 26 zone (ENABLED_ZONES / ZONE_HOSTS 생성용 — 핸드오프 라우팅 유지)
ALL_ZONES="canadia:3001 nubiano:3002 mayan:3003 amazonia:3004 patagona:3005 \
atlantic:3006 nordan:3007 europa:3008 sahar:3009 sibara:3011 \
centaria:3012 hindgang:3013 indoyang:3014 bering:3015 jungwon_n:3016 \
jungwon_s:3017 nanyang:3018 nambingyang:3019 hanbando:3020 nippon:3021 \
oseania:3022 pacific:3024 east_sea_s:3026 pacific_arctic:3027 japan_pacific:3028 \
kongra:3030"

# 재시작 대상: 한반도 + 인접 4
TARGET_ZONES="hanbando:3020 bering:3015 jungwon_n:3016 nippon:3021 east_sea_s:3026"

IDS=""
HOSTS=""
for Z in $ALL_ZONES; do
  ID=${Z%:*}
  IDS+="$ID,"
  HOSTS+="\"$ID\":\"$CENTRAL_IP\","
done
EN="${IDS%,}"
ZH="{${HOSTS%,}}"

echo "[redeploy-hanbando-5] central=$CENTRAL_IP, 재시작 대상=$(echo $TARGET_ZONES | wc -w) zone"

# 이미지 재빌드 (terrain.js + hanbando-terrain.json 포함)
PROJ_DIR="${PROJ_DIR:-/opt/Mini/durango-mini}"
cd "$PROJ_DIR"
echo "[build] durango-zone 이미지 재빌드..."
docker build -f Dockerfile.zone -t durango-zone . >/dev/null
echo "[build] 완료"

for Z in $TARGET_ZONES; do
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
echo "=== 상태 (한반도 + 인접) ==="
for Z in $TARGET_ZONES; do
  ID=${Z%:*}
  docker ps --format '{{.Names}}\t{{.Status}}' | grep "durango-zone-$ID" || echo "  $ID: 없음"
done

echo
echo "=== 검증 ==="
echo "1. 게임 접속 → 한반도 zone 들어가서 강·호수 시각 확인 (얄리·대마·낙만·천지·청록호 등)"
echo "2. 한반도 N→베링 (천지 경계 근처)"
echo "3. 한반도 W→중원북 (압록강 끝)"
echo "4. 한반도 E→닛폰 (두만강 끝)"
echo "5. 한반도 S→동중국해 (낙만강이 ocean 도달)"
