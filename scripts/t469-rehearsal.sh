#!/usr/bin/env bash
# === scripts/t469-rehearsal.sh — 배포 리허설: 재민이 칠 두 줄을 도커로 그대로 밟는다 (T469 ②) ======================
#
# ★계측기다 — 러너 밖. **배포 스크립트는 한 글자도 안 바꾼다** — `/opt/Mini/scripts/redeploy-hanbando.sh --all` 과
#   `redeploy-light.sh` 를 **그대로** 부른다(REPO_DIR·STAMP 기본값 그대로 · VPS 와 같은 자리 `/opt/Mini` · `/srv/durango`).
#   다른 것은 셋뿐(상자 사정 — VPS 해당 없음):
#     ① `/opt/Mini` 는 이 레포의 클론이다(origin = 이 레포 · `git pull` 이 이 가지 끝을 당긴다)
#     ② 공인 IP 대신 도커 다리 `172.17.0.1`(존 → central · central → 존 · 브라우저 → 존 모두 닿는 자리)
#     ③ 이 샌드박스는 밖으로 나가는 TLS 를 가로챈다 → `node:22-alpine` 을 그 CA 를 믿는 판으로 **미리** 바꿔 둔다(npm install 용)
#   "라이브 앞 상태"는 옛 커밋(PREV)으로 구운 이미지 + central·한반도 컨테이너 둘(env 는 redeploy-light 문법 + CHAR_SPRITE=on ·
#   central ENABLED_ZONES=hanbando — 가장 나쁜 쪽)이다.
#
# 실행: bash scripts/t469-rehearsal.sh [PREV=8121ccb4]   → /tmp/t469/ 에 단계별 시각·RSS·로그
set -uo pipefail
PREV="${1:-8121ccb4}"
OUT=/tmp/t469; rm -rf "$OUT"; mkdir -p "$OUT"
IP=172.17.0.1
say() { echo "$(date +%H:%M:%S) $*" | tee -a "$OUT/steps.txt"; }
ALL26="canadia,nubiano,mayan,amazonia,patagona,atlantic,nordan,europa,sahar,sibara,centaria,hindgang,indoyang,bering,jungwon_n,jungwon_s,nanyang,nambingyang,hanbando,nippon,oseania,pacific,east_sea_s,pacific_arctic,japan_pacific,kongra"
ZH="{$(echo $ALL26 | tr ',' '\n' | sed "s/.*/\"&\":\"$IP\"/" | paste -sd,)}"
pidof_c() { docker inspect -f '{{.State.Pid}}' "$1" 2>/dev/null; }
kb() { awk -v k="$2" '$1==k":"{print $2}' "/proc/$1/status" 2>/dev/null; }
# ── RSS 파수(2초) — 컨테이너 이름으로 pid 를 매번 다시 찾는다(재생성되면 pid 가 바뀐다) ──
watch_rss() { while [ ! -f "$OUT/stop" ]; do for n in durango-central durango-zone-hanbando durango-zone-nippon durango-zone-jungwon_n; do
  p=$(pidof_c $n); [ -n "$p" ] && [ "$p" != 0 ] && echo "$(date +%s) $n $(kb $p VmRSS) $(kb $p VmHWM)" >> "$OUT/rss.txt"; done; sleep 2; done; }
wait_health() { local port=$1 t0=$(date +%s); for i in $(seq 1 900); do curl -sf -m 3 "http://$IP:$port/health" >/dev/null 2>&1 && { echo $(( $(date +%s) - t0 )); return; }; sleep 1; done; echo timeout; }
snap() { for n in durango-central durango-zone-hanbando durango-zone-nippon durango-zone-jungwon_n; do p=$(pidof_c $n); [ -n "$p" ] && [ "$p" != 0 ] && say "  [$1] $n RSS $(( $(kb $p VmRSS) / 1024 ))MB · 최고 $(( $(kb $p VmHWM) / 1024 ))MB"; done; free -m | sed -n 2p | tee -a "$OUT/steps.txt"; }
zones_list() { curl -s -m 5 "http://$IP:3010/zones" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(Object.keys(JSON.parse(s).zones).join(','))}catch(e){console.log('(못 읽음)')}})"; }

# ── 0. 판 치우기 ──
for n in $(docker ps -a --format '{{.Names}}' | grep '^durango-'); do docker rm -f $n >/dev/null; done
rm -rf /srv/durango; mkdir -p /srv/durango/central /srv/durango/hanbando
( watch_rss ) & WPID=$!

# ── 1. 라이브 앞 상태 — PREV 로 구운 이미지 · central + 한반도(새 DB = 라이브의 첫 부팅 흉내) ──
( cd /opt/Mini && git checkout -q -B main "$PREV" && git branch -q -u origin/batch/deploy-rehearsal-0927 && git log --oneline -1 | cut -c1-70 ) | tee -a "$OUT/steps.txt"
( cd /opt/Mini && docker build -q -f Dockerfile.zone -t durango-zone . && docker build -q -f Dockerfile.central -t durango-central . ) >/dev/null
docker run -d --name durango-central --restart unless-stopped -p 3010:3010 -v /srv/durango/central:/data \
  -e PUBLIC_HOST=$IP -e ENABLED_ZONES=hanbando -e "ZONE_HOSTS=$ZH" durango-central >/dev/null
sleep 3
docker run -d --name durango-zone-hanbando --restart unless-stopped -p 3020:3020 -v /srv/durango/hanbando:/data \
  -e ZONE_ID=hanbando -e PORT=3020 -e DB_PATH=/data/world-hanbando.db -e CENTRAL_HOST=$IP -e CENTRAL_PORT=3010 \
  -e ENABLED_ZONES=$ALL26 -e "ZONE_HOSTS=$ZH" -e PLAYER_CAP=150 -e CHAR_SPRITE=on durango-zone >/dev/null
say "[1] 라이브 앞 상태 — 한반도 첫 부팅(새 DB) $(wait_health 3020)s"
echo "$PREV" > /srv/durango/deployed-hanbando.sha
sleep 150; snap 1-가라앉음
say "[1] central /zones = $(zones_list)"

# ── 2. 재민 앞 준비 한 줄(권장): 옛 이미지 태그 · DB 백업 ──
docker tag durango-zone durango-zone:prev; docker tag durango-central durango-central:prev
T=$(date +%s); docker stop durango-zone-hanbando >/dev/null; cp -a /srv/durango/hanbando /srv/durango/hanbando.bak; docker start durango-zone-hanbando >/dev/null
say "[2] 백업(멈춤 → 복사 → 다시 켬) $(( $(date +%s) - T ))s · 복사 $(du -sh /srv/durango/hanbando.bak | cut -f1) · 다시 뜸 $(wait_health 3020)s"

# ── 3. 재민 한 줄 ① — redeploy-hanbando.sh --all (그대로) ──
T=$(date +%s)
bash /opt/Mini/scripts/redeploy-hanbando.sh --all > "$OUT/redeploy-hanbando.log" 2>&1; RC=$?
say "[3] redeploy-hanbando.sh --all 종료 $RC · 총 $(( $(date +%s) - T ))s · $(grep -E '✅|❌|⚠' "$OUT/redeploy-hanbando.log" | tail -1)"
say "[3] central /zones = $(zones_list)"
say "[3] 한반도 CHAR_SPRITE 이어받음: $(docker inspect durango-zone-hanbando --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -c '^CHAR_SPRITE=on')"

# ── 4. 재민 한 줄 ② — redeploy-light.sh 로 닛폰·중원북(그대로 · 첫 부팅 = 새 DB) ──
T=$(date +%s)
RUN_ZONES="jungwon_n nippon" CENTRAL_IP=$IP bash /opt/Mini/scripts/redeploy-light.sh > "$OUT/redeploy-light.log" 2>&1; RC=$?
say "[4] redeploy-light.sh 종료 $RC · 총 $(( $(date +%s) - T ))s · $(grep -E 'ready|FAIL|timeout' "$OUT/redeploy-light.log" | tr '\r' '\n' | grep -E 'ready|FAIL|timeout' | sed 's/  */ /g' | paste -sd'|')"
say "[4] central /zones = $(zones_list)"
say "[4] 닛폰 CHAR_SPRITE: $(docker inspect durango-zone-nippon --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -c '^CHAR_SPRITE=on')"
snap 4-셋-막-뜸

# ── 5. central 이 셋을 모르면(ENABLED_ZONES=hanbando) — env 한 줄 고쳐 다시 만든다(스크립트 밖 한 줄) ──
if ! zones_list | tr ',' '\n' | grep -qx nippon; then
  T=$(date +%s)
  docker inspect durango-central --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v -E '^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME|ENABLED_ZONES)=' > /tmp/central.env
  echo "ENABLED_ZONES=hanbando,jungwon_n,nippon" >> /tmp/central.env
  docker rm -f durango-central >/dev/null && docker run -d --name durango-central --restart unless-stopped -p 3010:3010 -v /srv/durango/central:/data --env-file /tmp/central.env durango-central >/dev/null
  say "[5] central ENABLED_ZONES 고침 → /health $(wait_health 3010)s · /zones = $(sleep 3; zones_list) · $(( $(date +%s) - T ))s"
fi

# ── 6. 가라앉힘 · RSS ──
sleep 180; snap 6-가라앉음

# ── 7. 경계 왕복(배포판 그대로) — e2e-zone-cross 외부 모드 ──
( cd /root/minirepo && ZX_EXTERNAL=http://$IP:3010 ZX_DOCKER=1 node scripts/e2e-zone-cross.js --shots "$OUT/zx" > "$OUT/e2e-zone-cross.txt" 2>&1 )
say "[7] e2e-zone-cross(외부) $(tail -2 "$OUT/e2e-zone-cross.txt" | head -1) · $(grep 'charSprite' "$OUT/e2e-zone-cross.txt" | sed 's/^ *//')"
for z in hanbando nippon jungwon_n; do say "[7] $z 로그 Error/스택 $(docker logs durango-zone-$z 2>&1 | grep -cE '(^|\s)(TypeError|ReferenceError)\b|Cannot read|is not a function|^\s+at\s')"; done

# ── 8. 재기동(같은 DB) — 셋 다시 ──
T=$(date +%s); RUN_ZONES="jungwon_n nippon" CENTRAL_IP=$IP bash /opt/Mini/scripts/redeploy-light.sh > "$OUT/redeploy-light-2.log" 2>&1
say "[8] redeploy-light(재기동 · 같은 DB) 총 $(( $(date +%s) - T ))s"
T=$(date +%s); docker restart durango-zone-hanbando >/dev/null; say "[8] 한반도 재기동(같은 DB) $(wait_health 3020)s"
for z in nippon:3021 jungwon_n:3016; do docker restart durango-zone-${z%:*} >/dev/null; say "[8] ${z%:*} 재기동(같은 DB) $(wait_health ${z#*:})s"; done
sleep 60; snap 8-재기동-뒤

# ── 9. 롤백 리허설 — :prev 이미지 + 백업 DB 로 한반도 되돌리기 ──
T=$(date +%s)
docker inspect durango-zone-hanbando --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v -E '^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME)=' > /tmp/hb.env
docker rm -f durango-zone-hanbando >/dev/null
rm -rf /srv/durango/hanbando.new; mv /srv/durango/hanbando /srv/durango/hanbando.new; cp -a /srv/durango/hanbando.bak /srv/durango/hanbando
docker run -d --name durango-zone-hanbando --restart unless-stopped -p 3020:3020 -v /srv/durango/hanbando:/data --env-file /tmp/hb.env durango-zone:prev >/dev/null
say "[9] 롤백(:prev + 백업 DB) → 한반도 $(wait_health 3020)s · 총 $(( $(date +%s) - T ))s"

touch "$OUT/stop"; wait $WPID 2>/dev/null
for n in durango-central durango-zone-hanbando durango-zone-nippon durango-zone-jungwon_n; do docker logs $n > "$OUT/$n.log" 2>&1; done
say "끝"
