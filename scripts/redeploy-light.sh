#!/usr/bin/env bash
# === redeploy-light.sh — 1GB VM용 경량 재배포 ===
# central은 건드리지 않고, RUN_ZONES 에 지정한 존만 "한 번에 하나씩" 재생성한다.
#   - 나머지 존은 정지(+auto-restart 끔) → RAM 회수.
#   - 존 부팅이 무거워서(해안선 수십만 타일) 동시에 띄우면 1GB가 스왑 지옥에 빠짐 → sleep 으로 직렬화.
#   - ZONE_HOSTS/ENABLED_ZONES 는 전체 26존 기준으로 넣어 핸드오프 라우팅은 유지.
# 사용:
#   bash scripts/redeploy-light.sh                         # 기본: 그려진 11존
#   RUN_ZONES="hanbando jungwon_n nippon" bash scripts/redeploy-light.sh   # 더 적게
set -euo pipefail
CENTRAL_IP="${CENTRAL_IP:-141.164.35.114}"
PLAYER_CAP="${PLAYER_CAP:-150}"
BOOT_GAP="${BOOT_GAP:-4}"   # 존 사이 대기(초) — 1GB면 4~6 권장

# 전체 26존 (port 매핑 + 라우팅용)
ALL="canadia:3001 nubiano:3002 mayan:3003 amazonia:3004 patagona:3005 \
atlantic:3006 nordan:3007 europa:3008 sahar:3009 sibara:3011 \
centaria:3012 hindgang:3013 indoyang:3014 bering:3015 jungwon_n:3016 \
jungwon_s:3017 nanyang:3018 nambingyang:3019 hanbando:3020 nippon:3021 \
oseania:3022 pacific:3024 east_sea_s:3026 pacific_arctic:3027 japan_pacific:3028 \
kongra:3030"

# 실제로 띄울 존 (기본: 그려진 11존). 공백 구분.
RUN_ZONES="${RUN_ZONES:-hanbando nippon bering jungwon_n jungwon_s sibara centaria hindgang europa nordan sahar}"

# ENABLED_ZONES / ZONE_HOSTS — 전체 기준
IDS=""; HOSTS=""
for Z in $ALL; do ID=${Z%:*}; IDS+="$ID,"; HOSTS+="\"$ID\":\"$CENTRAL_IP\","; done
EN="${IDS%,}"; ZH="{${HOSTS%,}}"

# port 룩업
declare -A PORT
for Z in $ALL; do PORT[${Z%:*}]=${Z#*:}; done

echo "[light] 띄울 존($(echo $RUN_ZONES | wc -w)개): $RUN_ZONES"
echo "[light] central=$CENTRAL_IP  부팅간격=${BOOT_GAP}s"

# 1) RUN_ZONES 외 존 정지 — RAM 회수 + 크래시루프 차단
echo "[light] 불필요 존 정지(RAM 회수)…"
for Z in $ALL; do ID=${Z%:*}
  if ! printf ' %s ' $RUN_ZONES | grep -q " $ID "; then
    docker update --restart=no "durango-zone-$ID" >/dev/null 2>&1 || true
    docker stop "durango-zone-$ID" >/dev/null 2>&1 || true
  fi
done

# 2) RUN_ZONES 직렬 재생성
for ID in $RUN_ZONES; do
  P="${PORT[$ID]:-}"; [ -z "$P" ] && { echo "  [skip] $ID — 포트 미정"; continue; }
  mkdir -p "/srv/durango/$ID"
  docker rm -f "durango-zone-$ID" >/dev/null 2>&1 || true
  docker run -d --name "durango-zone-$ID" --restart unless-stopped \
    -p "$P:$P" -v "/srv/durango/$ID:/data" \
    -e ZONE_ID="$ID" -e PORT="$P" -e DB_PATH="/data/world-$ID.db" \
    -e CENTRAL_HOST="$CENTRAL_IP" -e CENTRAL_PORT=3010 \
    -e ENABLED_ZONES="$EN" -e "ZONE_HOSTS=$ZH" -e PLAYER_CAP="$PLAYER_CAP" \
    durango-zone >/dev/null
  echo "  [up] durango-zone-$ID :$P  (다음까지 ${BOOT_GAP}s 대기)"
  sleep "$BOOT_GAP"
done

echo
echo "=== 완료: central + $(echo $RUN_ZONES | wc -w)개 존 ==="
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango | sort
free -h | head -2
