#!/usr/bin/env bash
# === redeploy-light.sh — 존 직렬 재생성 (부팅 폭주 방지) ===
# central은 건드리지 않고, RUN_ZONES 의 존만 "한 번에 하나씩" 재생성한다(고친 이미지 적용).
#   - 존 부팅이 무거워서(해안선 수십만 타일) 26존을 동시에 띄우면 부팅 폭주로 박스가 멈춤 → sleep 으로 직렬화.
#   - 기본은 멀쩡한 다른 존(canadia 등)은 그대로 둠. STOP_OTHERS=1 줘야 정지(저RAM 모드).
#   - ZONE_HOSTS/ENABLED_ZONES 는 전체 26존 기준으로 넣어 핸드오프 라우팅 유지.
#   - ★스크립트는 존이 전부 healthy(시딩·부팅 완료 = 접속 가능)가 된 뒤에야 "완료"를 찍는다.
#     띄우기만 하고 끝나던 구판은 신규 시딩(수 분) 중에도 완료처럼 보여 혼동[사용자 지적].
#     WAIT_HEALTH=0 으로 끄기 · 존당 타임아웃 WAIT_TIMEOUT(기본 900s).
# 사용:
#   bash scripts/redeploy-light.sh                          # 그려진 11존만 고친 이미지로 직렬 재생성
#   STOP_OTHERS=1 bash scripts/redeploy-light.sh            # 나머지 존은 정지(저RAM)
#   RUN_ZONES="hanbando jungwon_n nippon" bash scripts/redeploy-light.sh   # 일부만
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

# 1) (선택) RUN_ZONES 외 존 정지 — RAM 더 쥐어짜야 할 때만. 기본은 멀쩡한 존 그대로 둠.
if [ "${STOP_OTHERS:-0}" = "1" ]; then
  echo "[light] STOP_OTHERS=1 — RUN_ZONES 외 존 정지(RAM 회수)…"
  for Z in $ALL; do ID=${Z%:*}
    if ! printf ' %s ' $RUN_ZONES | grep -q " $ID "; then
      docker update --restart=no "durango-zone-$ID" >/dev/null 2>&1 || true
      docker stop "durango-zone-$ID" >/dev/null 2>&1 || true
    fi
  done
fi

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

# 3) ★준비 대기 — '컨테이너 떴음'과 '접속 가능(healthy)'은 다르다: DB 리셋 후 신규 시딩은 수 분.
#    healthy 될 때까지 존별로 최신 시딩 로그를 보여주며 블록 — 이 스크립트가 끝나면 진짜 끝난 것.
if [ "${WAIT_HEALTH:-1}" = "1" ]; then
  echo
  echo "[light] 준비 대기 — 시딩·부팅이 끝나야 접속 가능. (Ctrl+C 해도 부팅 자체는 백그라운드 계속)"
  for ID in $RUN_ZONES; do
    T0=$(date +%s)
    while :; do
      ST=$(docker inspect --format '{{.State.Health.Status}}' "durango-zone-$ID" 2>/dev/null || echo gone)
      RUN=$(docker inspect --format '{{.State.Status}}' "durango-zone-$ID" 2>/dev/null || echo gone)
      EL=$(( $(date +%s) - T0 ))
      if [ "$ST" = "healthy" ]; then
        printf '\r  [ready] %-14s %4ss — 접속 가능%-60s\n' "$ID" "$EL" ""
        break
      fi
      if [ "$RUN" != "running" ]; then
        echo
        echo "  [FAIL] $ID 컨테이너 상태=$RUN — docker logs --tail 50 durango-zone-$ID 로 원인 확인"
        break
      fi
      if [ "$EL" -gt "${WAIT_TIMEOUT:-900}" ]; then
        echo
        echo "  [timeout] $ID ${WAIT_TIMEOUT:-900}s 초과 — docker logs --tail 50 durango-zone-$ID 확인"
        break
      fi
      L=$(docker logs --tail 1 "durango-zone-$ID" 2>&1 | tail -1 | tr -d '\r' | cut -c1-90)
      printf '\r  [wait] %-14s %4ss  %-92s' "$ID" "$EL" "$L"
      sleep 3
    done
  done
fi

echo
echo "=== 완료: $(echo $RUN_ZONES | wc -w)개 존 준비됨(healthy=접속 가능) ==="
docker ps --format '{{.Names}}\t{{.Status}}' | grep durango | sort
free -h | head -2
