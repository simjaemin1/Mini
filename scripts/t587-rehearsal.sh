#!/usr/bin/env bash
# === scripts/t587-rehearsal.sh — 초기화 마른 연습: 두 호스트 흉내 판에서 절차서(`설계/초기화_절차서.md`)를 **그 글자대로** 친다 (T587 ④) ===
#
# ★계측기다 — 러너 밖. `t485-rehearsal.sh` 판 그대로 — dockerd `--bip=198.51.100.1/24`(TEST-NET-2 · 안 문의 사설 폴백 꺼짐) ·
#   서울 = 198.51.100.1(도커 다리 · central·한반도) · 도쿄 = 192.0.2.2(이 상자의 eth0 · 닛폰) · 비밀은 /root/.durango-secret(600) 한 파일.
#   ⚠한 상자라 갈리는 것: 도쿄의 코드 자리만 /opt/tokyo/Mini 로 옮겨 친다(도쿄 줄의 `/opt/Mini` → `/opt/tokyo/Mini` · `-C /opt ` → `-C /opt/tokyo `).
#     도커 데몬·이미지 이름은 한 벌을 같이 쓴다(같은 커밋 → 같은 이미지).
#
#   bash scripts/t587-rehearsal.sh old            옛 세계를 라이브처럼 세운다 — 옛 커밋 이미지 · 서울 9-30 사본 DB(day 3341 · 겹친 영토 38,032) ·
#                                                  central(ZONE_HOSTS 26 → 서울 · 도쿄 env 한 줄 · 비밀 셋) · 닛폰(light · 새 DB) · 옛 사람(계정·손님)
#   bash scripts/t587-rehearsal.sh runbook <장>   절차서의 그 장(§)에 있는 `ssh root@<서울|도쿄> …` 줄을 차례로 친다(프롬프트 답은 표에서)
#   bash scripts/t587-rehearsal.sh probe          확인 자 — 달력 · 시딩 · /zones · 겹친 영토(T569) · 경계 왕복(e2e-zone-cross 외부 모드)
# 실행 전제: dockerd 가 --bip=198.51.100.1/24 로 떠 있다 · /opt/Mini = 리허설 origin(/root/rh/origin.git) 클론 · node:22-alpine 이 상자 CA 를 믿는 판
set -uo pipefail
SEOUL=198.51.100.1; TOKYO=192.0.2.2
LIVE_S=141.164.35.114; LIVE_T=108.160.135.177
OUT=/tmp/t587; mkdir -p "$OUT"
OLD="${T587_OLD:-3949ab0f}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOC="${T587_DOC:-$REPO/설계/초기화_절차서.md}"
say() { echo "$(date +%H:%M:%S) $*" | tee -a "$OUT/steps.txt"; }
wait_health() { local hp=$1 t0; t0=$(date +%s); for i in $(seq 1 1800); do curl -sf -m 3 "http://$hp/health" >/dev/null 2>&1 && { echo $(( $(date +%s) - t0 )); return; }; sleep 1; done; echo timeout; }

stage_old() {
  rm -rf "$OUT/steps.txt" "$OUT"/old-people.txt "$OUT"/line-*.log "$OUT/mac"
  say "== 옛 세계 세우기(라이브 흉내) — 옛 커밋 $OLD =="
  for n in $(docker ps -a --format '{{.Names}}' | grep '^durango-'); do docker rm -f "$n" >/dev/null; done
  rm -rf /srv/durango /opt/tokyo; mkdir -p /srv/durango/central /srv/durango/hanbando /opt/tokyo
  ( cd /opt/Mini && git fetch -q origin && git checkout -q main && git reset -q --hard "$OLD" && git log --oneline -1 | cut -c1-80 ) | tee -a "$OUT/steps.txt"
  ( cd /opt/Mini && docker build -q -f Dockerfile.zone -t durango-zone --label "durango.commit=$(git rev-parse HEAD)" . >/dev/null && docker build -q -f Dockerfile.central -t durango-central --label "durango.commit=$(git rev-parse HEAD)" . >/dev/null )
  # 도쿄 코드 = 서울 사본(T485 §3 ④ 와 같은 tar · 한 상자라 /opt/tokyo 로)
  tar -C /opt -czf - --exclude=node_modules --exclude='*.db*' Mini | tar -C /opt/tokyo -xzf -
  # 비밀 — 이 상자에서 만든 값(600) · 화면·로그·보고에 0
  [ -s /root/.durango-secret ] || ( umask 077; openssl rand -hex 24 > /root/.durango-secret )
  # 서울 옛 DB = 라이브 9-30 사본(맥 ~/Mini/_db/hanbando-0930.db 와 같은 것 · T566 이 쓴 그 파일)
  cp /root/t566/seoul-orig.db /srv/durango/hanbando/world-hanbando.db
  cp /root/t566/seoul-orig.db-wal /srv/durango/hanbando/world-hanbando.db-wal
  local ALL26="canadia,nubiano,mayan,amazonia,patagona,atlantic,nordan,europa,sahar,sibara,centaria,hindgang,indoyang,bering,jungwon_n,jungwon_s,nanyang,nambingyang,hanbando,nippon,oseania,pacific,east_sea_s,pacific_arctic,japan_pacific,kongra"
  local ZH; ZH="{$(echo $ALL26 | tr ',' '\n' | sed "s/.*/\"&\":\"$SEOUL\"/" | paste -sd,)}"
  export CENTRAL_SECRET; CENTRAL_SECRET="$(cat /root/.durango-secret)"
  docker run -d --name durango-central --restart unless-stopped -p 3010:3010 -v /srv/durango/central:/data \
    -e PUBLIC_HOST=$SEOUL -e "ZONE_HOSTS=$ZH" -e ZONE_HOST_NIPPON=$TOKYO -e CENTRAL_SECRET durango-central >/dev/null
  sleep 2
  ( cd /opt/Mini && RUN_ZONES=hanbando CENTRAL_IP=$SEOUL EXTRA_ENV="CHAR_SPRITE=on ZONE_HOST_NIPPON=$TOKYO" WAIT_HEALTH=0 bash scripts/redeploy-light.sh > "$OUT/old-light-seoul.log" 2>&1 )
  ( cd /opt/tokyo/Mini && RUN_ZONES=nippon CENTRAL_IP=$SEOUL EXTRA_ENV="CHAR_SPRITE=on" WAIT_HEALTH=0 bash scripts/redeploy-light.sh > "$OUT/old-light-tokyo.log" 2>&1 )
  unset CENTRAL_SECRET
  say "[옛] central $(wait_health $SEOUL:3010)s · 한반도(9-30 사본) $(wait_health $SEOUL:3020)s · 닛폰(새 DB) $(wait_health $TOKYO:3021)s"
  # 옛 사람 — 계정 둘(가입 = 자리 박힘) · 손님 하나
  for u in rh_alice rh_bob; do curl -s -m 5 -X POST "http://$SEOUL:3010/auth" -H 'Content-Type: application/json' \
      -d "{\"username\":\"$u\",\"password\":\"pw-$u\",\"home_zone\":\"hanbando\",\"home_x\":240000,\"home_y\":300000}" | cut -c1-60 >> "$OUT/old-people.txt"; echo >> "$OUT/old-people.txt"; done
  curl -s -m 5 -X POST "http://$SEOUL:3010/guest" -H 'Content-Type: application/json' -d '{}' | sed -E 's/"token":"[0-9a-f]+"/"token":"…"/' | cut -c1-60 >> "$OUT/old-people.txt"
  say "[옛] 사람: $(grep -c '"ok":true' "$OUT/old-people.txt")/3 가입·손님 · env 이름(central): $(docker inspect durango-central --format '{{range .Config.Env}}{{println .}}{{end}}' | sed 's/=.*//' | paste -sd' ')"
  say "[옛] 비밀 값이 리허설 로그에 있나: $(grep -rlF "$(cat /root/.durango-secret)" "$OUT" 2>/dev/null | wc -l)"
}

# 절차서 줄 뽑기 — `### <장>` 아래 ```sh 묶음의 `ssh [-t] root@<라이브 IP> '…'` 한 줄씩. 답은 줄 끝 주석 `# 답: a / b`.
stage_runbook() {
  local sec="$1"; local n=0
  say "== 절차서 $sec — $(basename "$DOC") 의 줄을 그 글자대로 =="
  python3 - "$DOC" "$sec" > "$OUT/lines-$$.txt" <<'PY'
import sys, re
doc, sec = sys.argv[1], sys.argv[2]
on = False; inblk = False
for line in open(doc, encoding='utf-8'):
    s = line.rstrip('\n')
    if s.startswith('### '):
        on = s[4:].strip().startswith(sec)
        continue
    if not on: continue
    if s.startswith('```'):
        inblk = not inblk; continue
    if inblk and s.startswith('ssh '):
        print(s)
PY
  while IFS= read -r line; do
    n=$((n + 1))
    local host cmd ans=""
    case "$line" in *"root@$LIVE_S"*) host=seoul ;; *"root@$LIVE_T"*) host=tokyo ;; *) say "  ? 호스트 모름: $line"; continue ;; esac
    [[ "$line" == *"# 답: "* ]] && ans="${line##*# 답: }"
    cmd="$(python3 - "$line" <<'PY'
import sys, shlex
line = sys.argv[1].split('  # ')[0].strip()
parts = shlex.split(line)
# ssh [-t] root@host '<cmd>'  ·  ssh root@a "…" | ssh root@b "…"(파이프 — 도쿄 코드 받기)  ·  ssh root@host '<cmd>' > ~/Mini/_db/<파일>(맥 사본)
if '|' in parts:
    print('PIPE')
elif '>' in parts:
    i = parts.index('>')
    print('MAC\t' + parts[i - 1] + '\t' + ' '.join(parts[i + 1:]))
else:
    print(parts[-1])
PY
)"
    local t0; t0=$(date +%s)
    if [ "$cmd" = PIPE ]; then
      # 서울 → 맥 → 도쿄 파이프(코드 받기) — 두 쪽을 이 상자에서 그대로
      local left right
      left="$(python3 -c "import sys,shlex;p=shlex.split(sys.argv[1].split('  # ')[0]);i=p.index('|');print(p[i-1])" "$line")"
      right="$(python3 -c "import sys,shlex;p=shlex.split(sys.argv[1].split('  # ')[0]);print(p[-1])" "$line")"
      right="${right//\/opt\/Mini//opt/tokyo/Mini}"; right="${right//-C \/opt /-C /opt/tokyo }"
      left="${left//$LIVE_S/$SEOUL}"; left="${left//$LIVE_T/$TOKYO}"; right="${right//$LIVE_S/$SEOUL}"; right="${right//$LIVE_T/$TOKYO}"
      echo "  [$n · $host] (파이프) $left | $right" >> "$OUT/steps.txt"
      bash -c "$left" | bash -c "$right" > "$OUT/line-$sec-$n.log" 2>&1
    elif [[ "$cmd" == MAC$'\t'* ]]; then
      # 맥에 한 벌 — 받는 쪽 ~/Mini/_db/ 를 이 판의 $OUT/mac/ 로(파일 이름의 $(date …) 는 셸이 편다)
      local inner dest; inner="$(printf '%s' "$cmd" | cut -f2)"; dest="$(printf '%s' "$cmd" | cut -f3)"
      mkdir -p "$OUT/mac"; dest="${dest/\~\/Mini\/_db\//$OUT/mac/}"; dest="$(eval echo "$dest")"
      echo "  [$n · $host] (맥 사본) $inner > $dest" >> "$OUT/steps.txt"
      bash -c "$inner" > "$dest" 2> "$OUT/line-$sec-$n.log"; echo "$(ls -la "$dest" | awk '{print $5, $9}')" >> "$OUT/line-$sec-$n.log"
    else
      cmd="${cmd//$LIVE_S/$SEOUL}"; cmd="${cmd//$LIVE_T/$TOKYO}"
      if [ "$host" = tokyo ]; then cmd="${cmd//\/opt\/Mini//opt/tokyo/Mini}"; fi
      echo "  [$n · $host] $cmd" >> "$OUT/steps.txt"
      if [ -n "$ans" ]; then printf '%s\n' ${ans//\// } | bash -c "$cmd" > "$OUT/line-$sec-$n.log" 2>&1
      else bash -c "$cmd" < /dev/null > "$OUT/line-$sec-$n.log" 2>&1; fi
    fi
    local rc=$?
    say "  [$sec·$n $host] rc=$rc · $(( $(date +%s) - t0 ))s · $(grep -vE '^\s*$' "$OUT/line-$sec-$n.log" | tail -1 | cut -c1-120)"
  done < "$OUT/lines-$$.txt"
  rm -f "$OUT/lines-$$.txt"
}

stage_probe() {
  say "== 확인 자 =="
  local IMG; IMG="$(docker inspect durango-zone-hanbando --format '{{.Image}}')"
  for z in "hanbando $SEOUL:3020" "nippon $TOKYO:3021"; do
    set -- $z
    say "[자] $1 관측자: $(docker run --rm --network host -v "$REPO/scripts/reset-world.js:/rw.js:ro" "$IMG" node --no-warnings /rw.js live "$2" --json)"
    say "[자] $1 DB: $(docker run --rm --network none -v "/srv/durango/$1:/data" -v "$REPO/scripts/reset-world.js:/rw.js:ro" "$IMG" node --no-warnings --experimental-sqlite /rw.js db "/data/world-$1.db" --json)"
  done
  say "[자] central DB: $(docker run --rm --network none -v /srv/durango/central:/data -v "$REPO/scripts/reset-world.js:/rw.js:ro" "$IMG" node --no-warnings --experimental-sqlite /rw.js db /data/central.db --json)"
  say "[자] /zones: $(curl -s -m 5 "http://$SEOUL:3010/zones" | grep -oE '"(hanbando|nippon)":\{"id":"[a-z_]+","wsUrl":"[^"]*"' | paste -sd' ')"
  for a in rh_alice; do say "[자] 옛 계정 로그인($a): $(curl -s -m 5 -X POST "http://$SEOUL:3010/auth" -H 'Content-Type: application/json' -d "{\"username\":\"$a\",\"password\":\"pw-$a\"}" | grep -oE '"ok":(true|false)|"reason":"[^"]*"|"last_zone":[^,]*|"home_zone":[^,]*|"inventory_json":"[^"]*"' | paste -sd' ')"; done
}

stage_e2e() {
  # 배경 굽기(T333 지형 미리 굽기 · T565 큰 지도 — 기동 뒤 배경 · 한 번에 한 줄)가 끝난 뒤에 왕복한다 — 첫 판(열기 직후)은 이 상자(2코어 · 크롬 소프트 렌더)에서
  #   승격이 느려 좀비 재연결이 났다(보고 §④). 끝난 시각을 적고 60초 더 둔다. 왕복 동안 5초마다 존 /health 의 틱 p50 을 적는다.
  local t0; t0=$(date +%s)
  for z in hanbando nippon; do
    for i in $(seq 1 900); do docker logs durango-zone-$z 2>&1 | grep -q '지형 미리 굽기 —' && docker logs durango-zone-$z 2>&1 | grep -q '큰 지도 굽기 —' && break; sleep 1; done
    say "[자] $z 배경 굽기 끝 — 기다림 $(( $(date +%s) - t0 ))s · $(docker logs durango-zone-$z 2>&1 | grep -oE '지형 미리 굽기 — [^(]*' | tail -1 | cut -c1-90)"
  done
  sleep 60
  ( while :; do echo "$(date +%H:%M:%S) $(curl -s -m 3 http://$SEOUL:3020/health | grep -oE '"tickP50Ms":[0-9.null]+') $(curl -s -m 3 http://$TOKYO:3021/health | grep -oE '"tickP50Ms":[0-9.null]+')"; sleep 5; done ) > "$OUT/health-during-e2e.txt" 2>&1 &
  local HP=$!
  #   ⚠이 샌드박스의 나가는 프록시가 198.51.100/24 · 192.0.2/24 를 안 비켜 준다 — 프록시를 끄고 부른다(T485 그대로).
  ( cd "$REPO" && env -u HTTPS_PROXY -u HTTP_PROXY -u https_proxy -u http_proxy ZX_EXTERNAL=http://$SEOUL:3010 ZX_DOCKER=1 ZX_ZONES=hanbando,nippon node scripts/e2e-zone-cross.js --shots "$OUT/zx" > "$OUT/e2e-zone-cross.txt" 2>&1 )
  say "[자] e2e-zone-cross(외부 · 두 호스트 · 존 둘 — 라이브에 중원북 0) $(grep '===' "$OUT/e2e-zone-cross.txt" | tail -1)"
  kill $HP 2>/dev/null
  for z in hanbando nippon; do docker logs durango-zone-$z > "$OUT/$z-new-world.log" 2>&1; done
  for z in hanbando nippon; do say "[자] $z 로그: 예외 $(docker logs durango-zone-$z 2>&1 | grep -cE '(^|\s)(TypeError|ReferenceError)\b|Cannot read|is not a function') · handoff 실패 $(docker logs durango-zone-$z 2>&1 | grep -c 'handoff_prepare → .*실패') · central 401 $(docker logs durango-zone-$z 2>&1 | grep -cE 'central.*401')"; done
}

case "${1:-}" in
  old) stage_old ;;
  runbook) stage_runbook "${2:?장 이름}" ;;
  probe) stage_probe ;;
  e2e) stage_e2e ;;
  *) sed -n '2,14p' "$0"; exit 2 ;;
esac
