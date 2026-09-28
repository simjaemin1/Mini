#!/usr/bin/env bash
# === scripts/t485-rehearsal.sh — 두 호스트 리허설: 서울(central + 한반도 + 중원북) · 도쿄(닛폰) (T485 ②) ================
#
# ★계측기다 — 러너 밖. `t469-rehearsal.sh` 문법 — 배포 스크립트를 **그대로** 부르고, 절차서(§3)의 한 줄들을 **그 글자대로** 친다.
#   "호스트가 갈린다"를 흉내 내는 법(상자 사정 · VPS 해당 없음):
#     ① dockerd 를 `--bip=198.51.100.1/24`(TEST-NET-2 — `internal-door.isPrivateAddr` 가 사설로 안 보는 대역)로 띄운다
#        ⇒ 컨테이너끼리의 **사설 주소 폴백이 꺼진다**(라이브의 172.17 은 사설이라 통과했다 — 호스트가 갈리면 그게 없다).
#     ② 서울 = `198.51.100.1`(도커 다리 · central·한반도·중원북 포트) · 도쿄 = `192.0.2.2`(이 상자의 다른 주소 · 닛폰 포트)
#        ⇒ central 이 내주는 닛폰 주소 · 한반도가 핸드오프를 쏘는 주소가 **서울과 다른 이름**이다.
#   팔 둘: ⓐ 비밀 없음(안 문 행렬만 — 무엇이 404/401 인가) ⓑ 비밀 셋 다(절차서 그대로 → 경계 왕복 `e2e-zone-cross` 외부 모드).
#   비밀 값은 이 판에서 만들어 파일(600)로만 쥔다 — 화면·로그·보고에 0.
# 실행: bash scripts/t485-rehearsal.sh   (dockerd 가 --bip=198.51.100.1/24 로 떠 있어야 한다 · /opt/Mini = 이 레포 클론)
set -uo pipefail
OUT=/tmp/t485; rm -rf "$OUT"; mkdir -p "$OUT"
SEOUL=198.51.100.1; TOKYO=192.0.2.2
say() { echo "$(date +%H:%M:%S) $*" | tee -a "$OUT/steps.txt"; }
ALL26="canadia,nubiano,mayan,amazonia,patagona,atlantic,nordan,europa,sahar,sibara,centaria,hindgang,indoyang,bering,jungwon_n,jungwon_s,nanyang,nambingyang,hanbando,nippon,oseania,pacific,east_sea_s,pacific_arctic,japan_pacific,kongra"
ZH="{$(echo $ALL26 | tr ',' '\n' | sed "s/.*/\"&\":\"$SEOUL\"/" | paste -sd,)}"
wait_health() { local hp=$1 t0=$(date +%s); for i in $(seq 1 600); do curl -sf -m 3 "http://$hp/health" >/dev/null 2>&1 && { echo $(( $(date +%s) - t0 )); return; }; sleep 1; done; echo timeout; }
zones_list() { curl -s -m 5 "http://$SEOUL:3010/zones" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const z=JSON.parse(s).zones;console.log(['hanbando','jungwon_n','nippon'].map(k=>k+'='+(z[k]?z[k].wsUrl+'·pop '+z[k].population:'없음')).join(' '))}catch(e){console.log('(못 읽음)')}})"; }
# ── 절차서의 "env 한 줄 더해 다시 만들기"(§3 ⑥ · 같은 이미지 · 같은 볼륨) — 컨테이너 env 를 떠서 KEY 를 갈아 끼운다 ──
env_recreate() {   # env_recreate <이름> <이미지> <포트> <볼륨> KEY=VAL…  (값이 빈 KEY= 은 그 줄을 지운다 · KEY 만 쓰면 이 셸 env 에서 값을 읽는다)
  local N=$1 I=$2 P=$3 V=$4; shift 4
  local drop='^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME)='
  for kv in "$@"; do drop="$drop|^${kv%%=*}="; done
  docker inspect "$N" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -vE "$drop" > "/tmp/$N.env"
  local extra=(); for kv in "$@"; do case "$kv" in *=) ;; *=*) echo "$kv" >> "/tmp/$N.env" ;; *) extra+=(-e "$kv") ;; esac; done
  docker rm -f "$N" >/dev/null
  docker run -d --name "$N" --restart unless-stopped -p "$P:$P" -v "$V:/data" --env-file "/tmp/$N.env" ${extra[@]+"${extra[@]}"} "$I" >/dev/null
}
# 안 문 행렬 — 비사설 출발지(도쿄 흉내 컨테이너)에서 문 여덟(`t485-door.js` · 비밀 파일을 주면 헤더에 싣는다 · 값은 안 찍는다)
door_matrix() { docker run --rm -v /root/minirepo/scripts/t485-door.js:/d.js:ro ${2:+-v "$2:/s:ro"} node:22-alpine-orig node /d.js $SEOUL $TOKYO ${2:+/s} 2>/dev/null | sed "s/^/  [$1] /" | tee -a "$OUT/steps.txt"; }

for n in $(docker ps -a --format '{{.Names}}' | grep '^durango-'); do docker rm -f $n >/dev/null; done
rm -rf /srv/durango; mkdir -p /srv/durango/central /srv/durango/hanbando
( cd /opt/Mini && git fetch -q origin && git checkout -q -B main origin/batch/two-hosts-0928 && git log --oneline -1 | cut -c1-70; docker build -q -f Dockerfile.zone -t durango-zone . >/dev/null; docker build -q -f Dockerfile.central -t durango-central . >/dev/null ) | tee -a "$OUT/steps.txt"

# ── 1. 서울(라이브 흉내): central(ZONE_HOSTS 26존 → 서울 · ENABLED_ZONES 없음 = 26존 목록) + 한반도 + 중원북(light) ──
docker run -d --name durango-central --restart unless-stopped -p 3010:3010 -v /srv/durango/central:/data \
  -e PUBLIC_HOST=$SEOUL -e "ZONE_HOSTS=$ZH" durango-central >/dev/null
sleep 2
RUN_ZONES="hanbando jungwon_n" CENTRAL_IP=$SEOUL EXTRA_ENV="CHAR_SPRITE=on" WAIT_HEALTH=0 bash /opt/Mini/scripts/redeploy-light.sh > "$OUT/light-seoul.log" 2>&1
say "[1] 서울 — 한반도 $(wait_health $SEOUL:3020)s · 중원북 $(wait_health $SEOUL:3016)s · /zones: $(zones_list)"

# ── 2. 도쿄 — 닛폰(light · 비밀 없음) + 서울 env 한 줄(ZONE_HOST_NIPPON) ──
T=$(date +%s)
RUN_ZONES=nippon CENTRAL_IP=$SEOUL EXTRA_ENV="CHAR_SPRITE=on" WAIT_HEALTH=0 bash /opt/Mini/scripts/redeploy-light.sh > "$OUT/light-tokyo-a.log" 2>&1
say "[2] 도쿄 닛폰 $(wait_health $TOKYO:3021)s(첫 부팅)"
env_recreate durango-central durango-central 3010 /srv/durango/central ZONE_HOST_NIPPON=$TOKYO
env_recreate durango-zone-hanbando durango-zone 3020 /srv/durango/hanbando ZONE_HOST_NIPPON=$TOKYO
env_recreate durango-zone-jungwon_n durango-zone 3016 /srv/durango/jungwon_n ZONE_HOST_NIPPON=$TOKYO
say "[2] 서울 env 한 줄(ZONE_HOST_NIPPON) → central $(wait_health $SEOUL:3010)s · 한반도 재기동 $(wait_health $SEOUL:3020)s · 중원북 $(wait_health $SEOUL:3016)s · /zones: $(sleep 6; zones_list)"
say "[ⓐ 비밀 없음] 안 문 행렬(출발지 = 비사설 198.51.100.x)"
door_matrix 비밀없음
sleep 40
say "[ⓐ] 닛폰 로그의 central 관련 줄: $(docker logs durango-zone-nippon 2>&1 | grep -iE 'central|tribe|길드' | tail -3 | cut -c1-110 | paste -sd'|')"

# ── 3. 팔 ⓑ — 비밀 셋 다(절차서 §3 ⑤⑥ 그대로) ──
umask 077; openssl rand -hex 24 > "$OUT/.secret"; export CENTRAL_SECRET="$(cat "$OUT/.secret")"
T=$(date +%s)
env_recreate durango-central durango-central 3010 /srv/durango/central CENTRAL_SECRET
env_recreate durango-zone-hanbando durango-zone 3020 /srv/durango/hanbando CENTRAL_SECRET
env_recreate durango-zone-jungwon_n durango-zone 3016 /srv/durango/jungwon_n CENTRAL_SECRET
RUN_ZONES=nippon CENTRAL_IP=$SEOUL EXTRA_ENV="CHAR_SPRITE=on" WAIT_HEALTH=0 bash /opt/Mini/scripts/redeploy-light.sh > "$OUT/light-tokyo-b.log" 2>&1
say "[3] 비밀 셋 다 — central $(wait_health $SEOUL:3010)s · 한반도 $(wait_health $SEOUL:3020)s · 중원북 $(wait_health $SEOUL:3016)s · 닛폰 재기동(같은 DB) $(wait_health $TOKYO:3021)s · 총 $(( $(date +%s) - T ))s · /zones: $(sleep 6; zones_list)"
say "[3] 비밀 값이 docker 인자·스크립트 로그에 있나: $(grep -c "$CENTRAL_SECRET" "$OUT"/light-*.log 2>/dev/null | awk -F: '{s+=$2} END {print s+0}') · 컨테이너 env 에 이름: $(docker inspect durango-zone-nippon --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -c '^CENTRAL_SECRET=')"
say "[ⓑ 비밀 있음] 안 문 행렬(같은 출발지 · 헤더에 비밀)"
door_matrix 비밀있음 "$OUT/.secret"
sleep 150
#   ⚠이 샌드박스의 나가는 프록시가 198.51.100/24 · 192.0.2/24 를 안 비켜 준다 — 브라우저 ws 가 프록시로 가서 1006 으로 끊긴다(1판 19/27). 프록시를 끄고 부른다.
( cd /root/minirepo && env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy ZX_EXTERNAL=http://$SEOUL:3010 ZX_DOCKER=1 node scripts/e2e-zone-cross.js --shots "$OUT/zx" > "$OUT/e2e-zone-cross.txt" 2>&1 )
say "[3] e2e-zone-cross(외부 · 두 호스트) $(grep '===' "$OUT/e2e-zone-cross.txt" | tail -1) · $(grep -o 'ⓡ6 \[[^]]*\].*' "$OUT/e2e-zone-cross.txt" | cut -c1-150 | paste -sd'|')"
for z in hanbando nippon jungwon_n; do say "[3] $z 로그: 예외 $(docker logs durango-zone-$z 2>&1 | grep -cE '(^|\s)(TypeError|ReferenceError)\b|Cannot read|is not a function') · handoff 실패 $(docker logs durango-zone-$z 2>&1 | grep -c 'handoff_prepare → .*실패') · ACK 실패 $(docker logs durango-zone-$z 2>&1 | grep -c 'ACK → .*실패')"; done

# ── 4. 롤백 한 줄(§3 ⑨) — 서울 env 에서 ZONE_HOST_NIPPON 을 지우면 닛폰은 다시 서울 주소(= 서울 컨테이너가 있으면 그쪽) ──
T=$(date +%s)
env_recreate durango-central durango-central 3010 /srv/durango/central ZONE_HOST_NIPPON=
say "[4] 롤백(central 에서 ZONE_HOST_NIPPON 지움) $(( $(date +%s) - T ))s → /zones: $(sleep 8; zones_list)"
for n in durango-central durango-zone-hanbando durango-zone-nippon durango-zone-jungwon_n; do docker logs $n > "$OUT/$n.log" 2>&1; done
rm -f "$OUT/.secret"
say "끝"
