#!/usr/bin/env bash
# === scripts/reset-world.sh — 세계 초기화 한 대상(central | <존>) · T587 ==========================================
#
#   ★기본은 예행(--dry-run): **아무것도 안 바꾸고** 지울 것 · 남길 것 · 백업 자리 · 바꿀 env 를 찍는다.
#   절차서 = `설계/초기화_절차서.md` (재민이 서울·도쿄에서 칠 줄이 글자 그대로 있다 · 순서도 거기).
#
#   쓰는 법(서울·도쿄 호스트에서 · /opt/Mini):
#     bash scripts/reset-world.sh <대상>                 예행 — 지울 것 목록만(기본)
#     bash scripts/reset-world.sh <대상> --apply         ① 대상 이름을 쳐야 멈춘다 → 멈춤(SIGTERM · 존은 몸·짐승을 저장하고 내린다)
#                                                        → 바이트 백업 + sha256 확인(**안 맞으면 여기서 멈춘다 · 아무것도 안 지운다**)
#                                                        → ② "지운다" 를 쳐야 DB 파일(본·-wal·-shm)을 지운다
#     bash scripts/reset-world.sh central --apply --keep-accounts   ⓐ-B 지우지 않고 **계정만 남긴다**(② 는 "계정만")
#     bash scripts/reset-world.sh central --apply --keep-all        ⓐ-C 백업만 하고 central 을 그대로 둔다(② 없음 — 지울 것 0)
#     bash scripts/reset-world.sh <대상> --up            새 이미지로 다시 띄운다 — env 는 옛 컨테이너 것을 그대로 옮겨 싣고(비밀 포함 · 값은 안 찍는다)
#                                                        존이면 ★`T565_MAP_LIVE=0`(지도 실시간 점 끔 — 정식 판 · 재민 10-02) + `PLAYER_CAP=0`(닫힌 채)
#     bash scripts/reset-world.sh <존> --open            열기 — `PLAYER_CAP` 를 옛 값으로 되돌려 다시 띄운다(같은 이미지 · 실시간 점은 끈 채)
#     bash scripts/reset-world.sh <대상> --pin           옛 이미지 고정 — 지금 도는 컨테이너의 이미지에 `<이미지>:pre-reset` 태그(★빌드 **전에** · 되돌리기용)
#                                                        ⚠containerd 이미지 저장소(도커 29 새 설치의 기본)는 빌드가 태그를 옮기는 순간 옛 이미지를 지운다
#                                                          — 컨테이너가 쓰고 있어도(마른 연습 실측 `No such image`) ⇒ 고정은 빌드 앞이다
#     bash scripts/reset-world.sh <대상> --image         굽기 확인 — 새로 구운 이미지 = 이 레포 checkout 인가(server·sim 바이트 지문 · 커밋 라벨) · 굽힌 정본의 수
#     bash scripts/reset-world.sh <대상> --check         확인 — /health · 관측자 welcome(달력 · 마을 수) · DB 수(T569 겹친 영토)
#     bash scripts/reset-world.sh <대상> --restore <백업 폴더>   되돌리기 — 지금 DB 를 옆으로 치우고(안 지운다) 백업을 되놓고
#                                                        옛 이미지(`<이미지>:pre-reset`)·옛 env 로 다시 띄운다
#
#   ★비밀: `/root/.durango-secret` 은 **무접촉** — 이 스크립트는 그 파일을 읽지도 쓰지도 옮기지도 않는다(있나·권한만 본다).
#     컨테이너를 다시 만들 때 env 는 `docker inspect` 로 떠서 **이 셸의 env 로만** 옮기고 `docker run -e 이름` 으로 넘긴다
#     ⇒ 비밀 값이 명령줄·파일·화면·로그 어디에도 안 남는다(redeploy-hanbando.sh 는 /tmp/<이름>.env 에 남긴다 — 회부).
#   ★지우는 줄은 백업 확인 뒤에만 있다. 백업은 `${RESET_BACKUP_ROOT:-/srv/durango/_reset}/<UTC시각>-<대상>/`(700 · 바이트 사본 · SHA256SUMS ·
#     meta.txt(비밀 아닌 칸만) · 옛 로그 끝 5,000줄).
#   ★새 수 0 · 제품 코드 0 — 존·central 이 이미 읽는 손잡이 둘(`T565_MAP_LIVE` · `PLAYER_CAP`)만 env 로 만진다.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$HERE/reset-world.js"
BACKUP_ROOT="${RESET_BACKUP_ROOT:-/srv/durango/_reset}"
SECRET_FILE=/root/.durango-secret
WAIT_ZONE="${RESET_WAIT_ZONE:-3600}"        # 초 — 새 세계 첫 부팅(시딩 · 교역로 A*) 기다림 상한
WAIT_CENTRAL="${RESET_WAIT_CENTRAL:-120}"
DROP_ENV='^(PATH|NODE_VERSION|YARN_VERSION|NODE_ENV|HOME|HOSTNAME)='   # redeploy-hanbando.sh recreate() 와 같은 줄 — 이미지가 다시 넣는다
F_ENV='{{range .Config.Env}}{{println .}}{{end}}'
F_STATE='{{.State.Status}}'
F_IMAGE='{{.Config.Image}}'
F_IMAGEID='{{.Image}}'
F_DATA='{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}'
F_PORT='{{range $p, $b := .HostConfig.PortBindings}}{{$p}} {{(index $b 0).HostPort}}{{println}}{{end}}'
F_LABELS='{{range $k, $v := .Config.Labels}}{{$k}}={{$v}}{{println}}{{end}}'
F_COMMIT='{{index .Config.Labels "durango.commit"}}'

say() { echo "$*"; }
die() { echo "  ✗ $*" >&2; exit 1; }
usage() { sed -n '4,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

TARGET="${1:-}"; [ $# -gt 0 ] && shift
case "$TARGET" in
  ""|-h|--help) usage; exit 2 ;;
  central) C=durango-central; KIND=central ;;
  *) [[ "$TARGET" =~ ^[a-z][a-z0-9_]*$ ]] || die "대상은 central 이나 존 이름(소문자): $TARGET"; C="durango-zone-$TARGET"; KIND=zone ;;
esac
MODE=dry; KEEP=""; RESTORE_DIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE=dry ;;
    --apply) MODE=apply ;;
    --up) MODE=up ;;
    --open) MODE=open ;;
    --check) MODE=check ;;
    --image) MODE=image ;;
    --pin) MODE=pin ;;
    --restore) MODE=restore; RESTORE_DIR="${2:-}"; [ $# -gt 1 ] && shift ;;
    --keep-accounts) KEEP=accounts ;;
    --keep-all) KEEP=all ;;
    *) die "모르는 인자: $1  (bash scripts/reset-world.sh --help)" ;;
  esac
  shift
done
[ -n "$KEEP" ] && [ "$KIND" != central ] && die "--keep-accounts · --keep-all 은 central 에만 있다(존 DB 는 통째로 지운다)"
[ -n "$KEEP" ] && [ "$MODE" != apply ] && [ "$MODE" != dry ] && die "--keep-* 은 --apply(또는 예행)와 같이 쓴다"
[ "$MODE" = open ] && [ "$KIND" != zone ] && die "--open 은 존에만 있다(central 은 닫지 않는다)"
[ "$MODE" = restore ] && [ -z "$RESTORE_DIR" ] && die "--restore 뒤에 백업 폴더를 달라(예 $BACKUP_ROOT/20261010-010203-$TARGET)"

# ── 컨테이너에서 읽는 것(값을 찍는 건 비밀 아닌 손잡이 몇 개뿐) ─────────────────────────────────
exists() { docker inspect "$C" --format '{{.Name}}' >/dev/null 2>&1; }
insp() { docker inspect "$C" --format "$1"; }
env_lines() { insp "$F_ENV" | grep -vE "$DROP_ENV" | grep -v '^$' || true; }
env_val() { env_lines | sed -n "s/^$1=//p" | head -1; }          # 비밀 아닌 칸에만 부른다(DB_PATH · PLAYER_CAP · T565_MAP_LIVE)
orig_of() { local v; if env_lines | grep -q "^$1="; then v="$(env_val "$1")"; echo "${v:--}"; else echo -; fi; }
label_of() { insp "$F_LABELS" | sed -n "s/^$1=//p" | head -1; }
orig_keep() { local v; v="$(label_of "durango.reset.orig.$1")"; [ -n "$v" ] && echo "$v" || orig_of "$1"; }   # 이미 한 번 --up 한 판이면 그때 적어 둔 옛 값
fsize() { stat -c %s "$1" 2>/dev/null || echo 0; }
human() { awk -v b="$1" 'BEGIN{ split("B KB MB GB TB",u," "); i=1; while (b>=1024 && i<5) { b/=1024; i++ } f = (i==1) ? "%d %s" : "%.1f %s"; printf f, b, u[i] }'; }
commit_of() { local v; v="$(docker image inspect "$1" --format "$F_COMMIT" 2>/dev/null || true)"; [ -z "$v" ] || [ "$v" = "<no value>" ] && v="-"; echo "${v:0:12}"; }
helper() {   # helper <네트워크> <볼륨 또는 -> <이미지> 인자… — 이미지 안의 node 로 reset-world.js 를 부른다
  local net=$1 vol=$2 img=$3; shift 3
  local mv=(); [ "$vol" != - ] && mv=(-v "$vol:/data")
  docker run --rm --network "$net" ${mv[@]+"${mv[@]}"} -v "$HELPER:/rw.js:ro" "$img" node --no-warnings --experimental-sqlite /rw.js "$@"
}
ask() {   # ask <말> <쳐야 하는 글자> — 표준입력 한 줄이 그 글자와 같아야 참
  local a=""; printf '%s' "$1"; IFS= read -r a || true; echo; [ "$a" = "$2" ]
}

load() {   # 컨테이너 정보를 전역으로
  exists || die "컨테이너 $C 가 없다 — 이 호스트에 그 대상이 없거나 이름이 다르다(docker ps -a)"
  STATE="$(insp "$F_STATE")"
  IMG_NAME="$(insp "$F_IMAGE")"; IMG_ID="$(insp "$F_IMAGEID")"
  case "$IMG_NAME" in   # 이미지 id 로 만든 컨테이너(옛 판 --open)면 이름이 없다 — 대상의 이미지 이름으로
    sha256:*) IMG_BASE="$([ "$KIND" = central ] && echo durango-central || echo durango-zone)" ;;
    *) IMG_BASE="${IMG_NAME%%:*}" ;;
  esac
  PRE_TAG="$IMG_BASE:pre-reset"
  IMG_OK=0; docker image inspect "$IMG_ID" >/dev/null 2>&1 && IMG_OK=1                     # 도는 컨테이너의 이미지가 아직 저장소에 있나
  PRE_ID="$(docker image inspect "$PRE_TAG" --format '{{.Id}}' 2>/dev/null || true)"     # 고정해 둔 옛 이미지(없으면 빈칸)
  HIMG="$IMG_BASE"; docker image inspect "$HIMG" >/dev/null 2>&1 || HIMG="$IMG_ID"         # 손발(reset-world.js)을 돌릴 node — 지금 태그(새 판이면 새 이미지)
  VOL="$(insp "$F_DATA")"; [ -n "$VOL" ] || die "$C 에 /data 볼륨이 없다 — DB 가 컨테이너 안에 있으면 이 스크립트가 다루지 않는다"
  local pl; pl="$(insp "$F_PORT" | grep -v '^$' || true)"
  [ "$(printf '%s\n' "$pl" | grep -c .)" = 1 ] || die "$C 의 포트 묶음이 하나가 아니다: $(printf '%s' "$pl" | paste -sd' ')"
  CONT_PORT="${pl%%/*}"; HOST_PORT="${pl##* }"
  DB_PATH_IN="$(env_val DB_PATH)"; [ -n "$DB_PATH_IN" ] || DB_PATH_IN=/data/world.db
  case "$DB_PATH_IN" in /data/*) ;; *) die "DB_PATH 가 /data 밖이다($DB_PATH_IN) — 볼륨 밖 DB 는 다루지 않는다" ;; esac
  DB_BASE="${DB_PATH_IN#/data/}"; [[ "$DB_BASE" == */* ]] && die "DB_PATH 가 /data 아래 하위 폴더다($DB_PATH_IN)"
  DBF=(); local s; for s in "" -wal -shm -journal; do [ -e "$VOL/$DB_BASE$s" ] && DBF+=("$DB_BASE$s"); done
  DB_BYTES=0; local f; for f in ${DBF[@]+"${DBF[@]}"}; do DB_BYTES=$(( DB_BYTES + $(fsize "$VOL/$f") )); done
  OTHERS="$(cd "$VOL" && ls -A 2>/dev/null | grep -vxF -f <(printf '%s\n' "$DB_BASE" "$DB_BASE-wal" "$DB_BASE-shm" "$DB_BASE-journal") | paste -sd' ' || true)"
  local n; for n in $(env_lines | sed 's/=.*//'); do
    [[ "$n" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || die "env 이름이 이상하다: $n"
    case "$n" in DOCKER_*|LD_*|BASH_ENV|ENV|IFS|PS4|SHELLOPTS|BASHOPTS) die "env 에 셸을 흔드는 이름이 있다($n) — 손으로 다시 만들어라" ;; esac
  done
}
cur_commit() { if [ "$IMG_OK" = 1 ]; then commit_of "$IMG_ID"; elif [ -n "$PRE_ID" ] && [ "$PRE_ID" = "$IMG_ID" ]; then commit_of "$PRE_TAG"; else echo -; fi; }
pin_state() {
  if [ -n "$PRE_ID" ] && [ "$PRE_ID" = "$IMG_ID" ]; then echo "$PRE_TAG = 이 컨테이너 것 ✓(되돌리기 이미지)"
  elif [ "$IMG_OK" = 1 ]; then echo "고정 전 — 빌드 **전에** --pin(태그 $PRE_TAG)$([ -n "$PRE_ID" ] && echo " · 지금 그 태그는 다른 이미지($(echo "$PRE_ID" | cut -c8-19))")"
  else echo "✗ 이 컨테이너의 이미지가 저장소에 없다(빌드가 태그를 옮겼다) · 고정본 $([ -n "$PRE_ID" ] && echo "$(echo "$PRE_ID" | cut -c8-19) ≠ 이 컨테이너" || echo 없음) — 되돌리기는 옛 DB + 새 이미지로만"; fi
}
free_at() { local d="$1"; while [ ! -d "$d" ]; do d="$(dirname "$d")"; done; df -PB1 "$d" | awk 'NR==2{print $4}'; }

plan() {
  say "  컨테이너  $C · $STATE · 이미지 $IMG_NAME ($(echo "$IMG_ID" | cut -c8-19) · 커밋 $(cur_commit))"
  say "  볼륨      $VOL → /data · 포트 $HOST_PORT · DB $DB_PATH_IN"
  say "  옛 이미지 $(pin_state)"
  local f lst=""; for f in ${DBF[@]+"${DBF[@]}"}; do lst="$lst $f($(human "$(fsize "$VOL/$f")"))"; done
  if [ "$KIND" = central ] && [ "$KEEP" = all ]; then say "  지울 것   0 — ⓐ-C 다 남김(백업만)"
  elif [ "$KIND" = central ] && [ "$KEEP" = accounts ]; then say "  지울 것   파일 0 — ⓐ-B 계정만 남김: 몸·짐·자리·길드·전쟁·초대를 비운다(신원·벗은 남김) · 대상 파일${lst:- 없음}"
  else say "  지울 것  ${lst:- (DB 파일 없음)}  — 합 $(human "$DB_BYTES")"; fi
  say "  남길 것   볼륨 안 다른 파일: ${OTHERS:-없음} · 비밀 파일 · 이미지 · 다른 컨테이너"
  local need=$(( DB_BYTES * 11 / 10 + 64 * 1024 * 1024 )) av; av="$(free_at "$BACKUP_ROOT")"
  say "  백업      $BACKUP_ROOT/<UTC시각>-$TARGET/ — 바이트 사본 + sha256 · 빈 자리 $(human "$av") / 필요 $(human "$need") $([ "$av" -ge "$need" ] && echo ✓ || echo '✗ 모자란다')"
  if [ "$KIND" = zone ]; then
    say "  env       T565_MAP_LIVE $(orig_of T565_MAP_LIVE) → 0(실시간 점 끔 · 정식 판) · PLAYER_CAP $(orig_of PLAYER_CAP) → 0(--up 닫힌 채) → $(orig_of PLAYER_CAP)(--open)  [- = 없음 · 코드 기본]"
  fi
  say "  env 이름  $(env_lines | sed 's/=.*//' | paste -sd' ')"
  local sf="없음"; [ -e "$SECRET_FILE" ] && sf="있음 · $(stat -c %a "$SECRET_FILE")"
  say "  비밀      $SECRET_FILE: $sf (읽지 않는다) · 컨테이너 env 의 CENTRAL_SECRET: $(env_lines | grep -c '^CENTRAL_SECRET=' || true)개(이름만 — 그대로 옮겨 싣는다)"
}

backup_and_stop() {   # 멈춤 → 백업 → 확인 · 전역 B 에 폴더
  if [ "$STATE" = running ]; then
    say "  [멈춤] docker stop -t 30 $C"
    docker stop -t 30 "$C" >/dev/null
  fi
  STATE="$(insp "$F_STATE")"; [ "$STATE" != running ] || die "$C 가 안 멈췄다"
  if [ "$IMG_OK" = 1 ]; then docker tag "$IMG_ID" "$PRE_TAG"; PRE_ID="$IMG_ID"; say "  [옛 이미지] $PRE_TAG = $(echo "$IMG_ID" | cut -c8-19) (되돌리기용)"
  elif [ "$PRE_ID" = "$IMG_ID" ]; then say "  [옛 이미지] $PRE_TAG = $(echo "$IMG_ID" | cut -c8-19) (--pin 으로 고정해 둔 것)"
  else PRE_ID=""; say "  [옛 이미지] ⚠없다 — 되돌리기는 옛 DB + 새 이미지로만 된다(빌드 전에 --pin 을 안 했다)"; fi
  local need=$(( DB_BYTES * 11 / 10 + 64 * 1024 * 1024 )) av
  mkdir -p "$BACKUP_ROOT" 2>/dev/null || { say "  ✗ 백업 자리를 못 만든다: $BACKUP_ROOT"; return 1; }
  av="$(free_at "$BACKUP_ROOT")"
  [ "$av" -ge "$need" ] || { say "  ✗ 백업 자리가 모자란다($(human "$av") < $(human "$need"))"; return 1; }
  B="$BACKUP_ROOT/$(date -u +%Y%m%d-%H%M%S)-$TARGET"
  mkdir "$B" || { say "  ✗ 백업 폴더를 못 만든다: $B"; return 1; }
  local f
  for f in ${DBF[@]+"${DBF[@]}"}; do cp -p -- "$VOL/$f" "$B/$f" || { say "  ✗ 복사 실패: $f"; return 1; }; done
  if [ ${#DBF[@]} -gt 0 ]; then
    ( cd "$VOL" && sha256sum -- "${DBF[@]}" ) > "$B/SHA256SUMS" || { say "  ✗ sha256 을 못 쟀다"; return 1; }
    ( cd "$B" && sha256sum -c --quiet SHA256SUMS ) || { say "  ✗ 백업이 원본과 다르다"; return 1; }
  else : > "$B/SHA256SUMS"; fi
  {
    echo "target=$TARGET"; echo "container=$C"; echo "image=$IMG_NAME"; echo "image_id=$IMG_ID"; echo "image_commit=$(cur_commit)"
    echo "pre_reset_tag=$([ -n "$PRE_ID" ] && echo "$PRE_TAG" || echo -)"; echo "volume=$VOL"; echo "db_path=$DB_PATH_IN"; echo "port=$HOST_PORT:$CONT_PORT"
    echo "stopped_at=$(date -u +%FT%TZ)"; echo "orig.T565_MAP_LIVE=$(orig_of T565_MAP_LIVE)"; echo "orig.PLAYER_CAP=$(orig_of PLAYER_CAP)"
    echo "env_names=$(env_lines | sed 's/=.*//' | paste -sd' ')"
  } > "$B/meta.txt"
  docker logs --tail 5000 "$C" > "$B/logs-tail.txt" 2>&1 || true
  say "  [백업 ✓] $B — 파일 ${#DBF[@]}개 $(human "$DB_BYTES") · sha256 일치 · meta.txt · logs-tail.txt"
}

recreate() {   # recreate <이미지> — 전역 NEWENV(K=V…) · LABELS(k=v…)로 같은 이름·포트·볼륨에 다시 만든다(값은 env 로만 넘긴다)
  local img=$1
  [ "$(insp "$F_STATE")" = running ] && docker stop -t 30 "$C" >/dev/null   # 존은 SIGTERM 에 몸·짐승을 저장하고 내린다(rm -f 는 SIGKILL)
  docker rm "$C" >/dev/null
  (
    a=()
    for kv in ${NEWENV[@]+"${NEWENV[@]}"}; do export "$kv"; a+=(-e "${kv%%=*}"); done
    for lb in ${LABELS[@]+"${LABELS[@]}"}; do a+=(--label "$lb"); done
    docker run -d --name "$C" --restart unless-stopped -p "$HOST_PORT:$CONT_PORT" -v "$VOL:/data" ${a[@]+"${a[@]}"} "$img" >/dev/null
  )
  say "  [up] $C ← $(echo "$img" | cut -c1-40) (커밋 $(commit_of "$img"))"
}
build_env() {   # build_env <K=V 덮어쓰기…> — 옛 env 에서 그 키를 빼고 덮어쓴다(값이 '-' 면 줄을 뺀다)
  local drop='^$' kv
  for kv in "$@"; do drop="$drop|^${kv%%=*}="; done
  mapfile -t NEWENV < <(env_lines | grep -vE "$drop" || true)
  for kv in "$@"; do [ "${kv#*=}" = - ] || NEWENV+=("$kv"); done
}
wait_health() {   # wait_health <상한 초>
  local max=$1 t0 i=0 st; t0=$(date +%s)
  while :; do
    if curl -sf -m 3 "http://127.0.0.1:$HOST_PORT/health" >/dev/null 2>&1; then say "  ✅ /health 응답 — $(( $(date +%s) - t0 ))초"; return 0; fi
    st="$(insp "$F_STATE" 2>/dev/null || echo 없음)"
    if [ "$st" != running ]; then say "  ❌ $C 가 섰다($st) — 마지막 로그:"; docker logs --tail 40 "$C" 2>&1 | sed 's/^/     /'; return 1; fi
    if [ $(( $(date +%s) - t0 )) -ge "$max" ]; then say "  ⚠ ${max}초 안에 안 떴다 — 계속 보기: docker logs -f $C"; return 1; fi
    i=$((i + 1)); [ $((i % 15)) -eq 0 ] && say "  … $(( $(date +%s) - t0 ))초 · $(docker logs --tail 1 "$C" 2>&1 | cut -c1-110)"
    sleep 2
  done
}
live_line() { helper host - "$HIMG" live "127.0.0.1:$HOST_PORT" || say "  (관측자 줄을 못 읽었다)"; }
db_line() { [ -e "$VOL/$DB_BASE" ] || { say "  DB $DB_BASE 없음"; return 0; }; helper none "$VOL" "$HIMG" db "/data/$DB_BASE" || say "  (DB 수를 못 셌다)"; }

load
case "$MODE" in
dry)
  say "== 예행(--dry-run · 아무것도 안 바꾼다) — $TARGET =="
  plan
  [ "$KIND" = zone ] && [ ${#DBF[@]} -gt 0 ] && db_line
  if [ "$KIND" = central ]; then
    [ ${#DBF[@]} -gt 0 ] && db_line
    say "  ⓐ 고르기  지움(기본) = central DB 를 지운다 · --keep-accounts = 계정(이름·비번·색·게스트 열쇠·벗)만 남긴다 · --keep-all = 그대로 둔다"
  fi
  say "  다음      bash scripts/reset-world.sh $TARGET --apply${KEEP:+ --keep-$KEEP}"
  ;;
apply)
  say "== 초기화 --apply — $TARGET =="
  plan
  ask "  ① 멈추고 백업한다. 대상 이름을 그대로 쳐라($TARGET): " "$TARGET" || die "그만뒀다 — 아무것도 안 바꿨다"
  if ! backup_and_stop; then
    say "  ✗ 백업이 안 됐다 — **아무것도 안 지웠다**. $C 는 멈춘 채다(옛 세계로 다시 켜려면: docker start $C)"
    exit 1
  fi
  if [ "$KIND" = central ] && [ "$KEEP" = all ]; then
    say "  ⓐ-C 다 남김 — 지울 것 0. 다음: bash scripts/reset-world.sh central --up"; exit 0
  fi
  if [ ${#DBF[@]} -eq 0 ]; then say "  DB 파일이 없다 — 지울 것 0. 다음: bash scripts/reset-world.sh $TARGET --up"; exit 0; fi
  if [ "$KIND" = central ] && [ "$KEEP" = accounts ]; then
    ask "  ② 백업 확인됨. \"계정만\" 을 치면 몸·짐·자리·길드·전쟁·초대를 비운다(신원·벗은 남김): " "계정만" \
      || { say "  그만뒀다 — DB 그대로 · 백업 $B · $C 는 멈춘 채(다시 켜려면 docker start $C)"; exit 1; }
    helper none "$VOL" "$HIMG" keep-accounts "/data/$DB_BASE"
    say "  다음: bash scripts/reset-world.sh central --up"; exit 0
  fi
  ask "  ② 백업 확인됨($B). \"지운다\" 를 치면 DB 파일 ${#DBF[@]}개를 지운다: " "지운다" \
    || { say "  그만뒀다 — 아무것도 안 지웠다 · 백업 $B · $C 는 멈춘 채(다시 켜려면 docker start $C)"; exit 1; }
  for f in "${DBF[@]}"; do rm -f -- "$VOL/$f"; done
  left=0; for f in "${DBF[@]}"; do [ -e "$VOL/$f" ] && left=$((left + 1)); done
  [ "$left" = 0 ] || die "지우지 못한 파일 $left 개"
  say "  [지움 ✓] $VOL 에서 ${DBF[*]} — 남은 것: $(cd "$VOL" && ls -A | paste -sd' ' || true)"
  say "  다음: bash scripts/reset-world.sh $TARGET --up"
  ;;
up)
  say "== 띄움 --up — $TARGET =="
  [ "$STATE" != running ] || die "$C 가 돌고 있다 — 먼저 --apply(멈춤·백업·지움)"
  if [ "$KIND" = zone ] && [ ${#DBF[@]} -gt 0 ]; then die "DB 가 남아 있다($VOL/${DBF[0]}) — 이대로 띄우면 옛 세계가 뜬다(--apply 를 끝까지 했나?)"; fi
  docker image inspect "$IMG_BASE" >/dev/null 2>&1 || die "이미지 $IMG_BASE 가 없다 — 코드 받기·빌드를 먼저"
  NEW_ID="$(docker image inspect "$IMG_BASE" --format '{{.Id}}')"
  say "  이미지    $IMG_BASE = $(echo "$NEW_ID" | cut -c8-19) (커밋 $(commit_of "$NEW_ID")) · 옛 $(echo "$IMG_ID" | cut -c8-19)$([ "$NEW_ID" = "$IMG_ID" ] && echo ' ⚠같은 이미지다 — 빌드를 했나?')"
  LABELS=("durango.reset.at=$(date -u +%FT%TZ)")
  if [ "$KIND" = zone ]; then
    LABELS+=("durango.reset.orig.T565_MAP_LIVE=$(orig_keep T565_MAP_LIVE)" "durango.reset.orig.PLAYER_CAP=$(orig_keep PLAYER_CAP)" "durango.reset.state=closed")
    build_env T565_MAP_LIVE=0 PLAYER_CAP=0
    say "  env       옛 컨테이너 env ${#NEWENV[@]}줄 그대로 + T565_MAP_LIVE=0 · PLAYER_CAP=0(닫힌 채 — 확인 뒤 --open)"
  else
    build_env
    say "  env       옛 컨테이너 env ${#NEWENV[@]}줄 그대로"
  fi
  recreate "$IMG_BASE"
  wait_health "$([ "$KIND" = zone ] && echo "$WAIT_ZONE" || echo "$WAIT_CENTRAL")" || exit 1
  if [ "$KIND" = zone ]; then live_line; fi
  say "  다음: bash scripts/reset-world.sh $TARGET --check$([ "$KIND" = zone ] && echo " → --open")"
  ;;
open)
  say "== 열기 --open — $TARGET =="
  [ "$STATE" = running ] || die "$C 가 안 돈다($STATE) — --up 먼저"
  [ "$(label_of durango.reset.state)" = closed ] || die "$C 는 닫힌 판이 아니다(--up 으로 띄운 판만 연다)"
  OCAP="$(label_of durango.reset.orig.PLAYER_CAP)"; [ -n "$OCAP" ] || OCAP=-
  LABELS=("durango.reset.at=$(label_of durango.reset.at)" "durango.reset.orig.T565_MAP_LIVE=$(label_of durango.reset.orig.T565_MAP_LIVE)" "durango.reset.state=open")
  build_env "PLAYER_CAP=$OCAP"
  say "  env       PLAYER_CAP 0 → ${OCAP/-/(없음 · 코드 기본)} · T565_MAP_LIVE $(env_val T565_MAP_LIVE)(그대로)"
  OIMG="$IMG_BASE"; [ "$(docker image inspect "$IMG_BASE" --format '{{.Id}}' 2>/dev/null)" = "$IMG_ID" ] || OIMG="$IMG_ID"   # 같은 이미지 — 이름이 그걸 가리키면 이름으로
  recreate "$OIMG"
  wait_health "$WAIT_ZONE" || exit 1
  live_line
  ;;
pin)
  say "== 옛 이미지 고정 --pin — $TARGET =="
  if [ "$IMG_OK" = 1 ]; then docker tag "$IMG_ID" "$PRE_TAG"; say "  ✓ $PRE_TAG = $(echo "$IMG_ID" | cut -c8-19)(커밋 $(cur_commit)) — 이제 빌드해도 옛 이미지가 남는다"
  elif [ "$PRE_ID" = "$IMG_ID" ]; then say "  ✓ 이미 고정됨 — $PRE_TAG = $(echo "$IMG_ID" | cut -c8-19)"
  else die "이 컨테이너의 이미지가 저장소에 벌써 없다(빌드가 태그를 옮겼다) — 고정할 것이 없다 · 되돌리기는 옛 DB + 새 이미지로만"; fi
  ;;
image)
  say "== 굽기 확인 --image — $TARGET (이미지 $IMG_BASE = 이 레포?) =="
  RROOT="$(cd "$HERE/.." && pwd)"
  docker image inspect "$IMG_BASE" >/dev/null 2>&1 || die "이미지 $IMG_BASE 가 없다 — 빌드를 먼저"
  HEAD12="$(git -C "$RROOT" rev-parse HEAD 2>/dev/null | cut -c1-12 || echo -)"; LBL="$(commit_of "$IMG_BASE")"
  TI="$(docker run --rm --network none -v "$HELPER:/rw.js:ro" "$IMG_BASE" node --no-warnings /rw.js tree /app)"
  TR="$(docker run --rm --network none -v "$RROOT:/src:ro" -v "$HELPER:/rw.js:ro" "$IMG_BASE" node --no-warnings /rw.js tree /src)"
  say "$TI"; say "$TR"
  say "  커밋      레포 HEAD $HEAD12 · 이미지 라벨 $LBL $([ "$LBL" = "$HEAD12" ] && echo ✓ || echo '✗(라벨 없음·다름 — 빌드 줄에 --label 을 붙였나)')"
  NEWI="$(docker image inspect "$IMG_BASE" --format '{{.Id}}')"
  if [ "${TI##*지문 }" = "${TR##*지문 }" ]; then
    say "  ✓ 이미지 = 레포(server·sim 바이트 지문 같음) · 돌던 컨테이너 이미지와 $([ "$NEWI" = "$IMG_ID" ] && echo '같다(⚠새로 안 구웠다)' || echo '다른 새 이미지')"
  else say "  ✗ 이미지 ≠ 레포 — 빌드를 다시(코드 받기 뒤 docker build)"; exit 1; fi
  docker run --rm --network none -v "$HELPER:/rw.js:ro" "$IMG_BASE" node --no-warnings /rw.js canon /app
  ;;
check)
  say "== 확인 --check — $TARGET =="
  say "  컨테이너  $C · $STATE · 커밋 $(cur_commit) · 포트 $HOST_PORT"
  if [ "$KIND" = zone ]; then
    say "  env       T565_MAP_LIVE=$(env_val T565_MAP_LIVE) · PLAYER_CAP=$(env_val PLAYER_CAP) · 판 $(label_of durango.reset.state)"
    [ "$STATE" = running ] && live_line
  else
    say "  /health   $(curl -s -m 5 "http://127.0.0.1:$HOST_PORT/health" | cut -c1-120)"
    say "  /zones    $(curl -s -m 5 "http://127.0.0.1:$HOST_PORT/zones" | grep -oE '"(hanbando|nippon)":\{"id":"[a-z_]+","wsUrl":"[^"]*"' | sed -E 's/"([a-z_]+)":\{"id":"[a-z_]+","wsUrl":"([^"]*)"/\1=\2/' | paste -sd' ')"
  fi
  db_line
  ;;
restore)
  say "== 되돌리기 --restore — $TARGET ← $RESTORE_DIR =="
  [ -f "$RESTORE_DIR/meta.txt" ] && [ -f "$RESTORE_DIR/SHA256SUMS" ] || die "백업 폴더가 아니다(meta.txt · SHA256SUMS 없음): $RESTORE_DIR"
  grep -qx "target=$TARGET" "$RESTORE_DIR/meta.txt" || die "이 백업은 $TARGET 것이 아니다($(grep '^target=' "$RESTORE_DIR/meta.txt"))"
  ( cd "$RESTORE_DIR" && sha256sum -c --quiet SHA256SUMS ) || die "백업 파일이 SHA256SUMS 와 다르다 — 되돌리지 않는다"
  mapfile -t RF < <(awk '{print $2}' "$RESTORE_DIR/SHA256SUMS" | sed 's/^\*//')
  OT5="$(sed -n 's/^orig.T565_MAP_LIVE=//p' "$RESTORE_DIR/meta.txt")"; OCAP="$(sed -n 's/^orig.PLAYER_CAP=//p' "$RESTORE_DIR/meta.txt")"
  RIMG="$PRE_TAG"; MID="$(sed -n 's/^image_id=//p' "$RESTORE_DIR/meta.txt")"
  if [ "$PRE_ID" != "$MID" ]; then
    if docker image inspect "$MID" >/dev/null 2>&1; then RIMG="$MID"
    else RIMG="$IMG_BASE"; say "  ⚠옛 이미지가 없다($PRE_TAG ≠ 백업의 $(echo "$MID" | cut -c8-19)) — 옛 DB 를 **지금 이미지**로 띄운다(코드는 새 것)"; fi
  fi
  say "  되놓을 것  ${RF[*]:-(없음)} · 이미지 $(echo "$RIMG" | cut -c1-40) (커밋 $(commit_of "$RIMG")) · env T565_MAP_LIVE ${OT5:--} · PLAYER_CAP ${OCAP:--}(옛 값)"
  say "  지금 DB    ${DBF[*]:-(없음)} → $BACKUP_ROOT/<UTC시각>-$TARGET-replaced/ 로 옮긴다(안 지운다)"
  ask "  되돌린다. 대상 이름을 그대로 쳐라($TARGET): " "$TARGET" || die "그만뒀다 — 아무것도 안 바꿨다"
  [ "$STATE" = running ] && { docker stop -t 30 "$C" >/dev/null; say "  [멈춤] $C"; }
  if [ ${#DBF[@]} -gt 0 ]; then
    R="$BACKUP_ROOT/$(date -u +%Y%m%d-%H%M%S)-$TARGET-replaced"; mkdir -p "$R"
    for f in "${DBF[@]}"; do mv -- "$VOL/$f" "$R/$f"; done
    say "  [치움] ${DBF[*]} → $R"
  fi
  for f in ${RF[@]+"${RF[@]}"}; do cp -p -- "$RESTORE_DIR/$f" "$VOL/$f"; done
  ( cd "$VOL" && sha256sum -c --quiet "$RESTORE_DIR/SHA256SUMS" ) || die "되놓은 파일이 백업과 다르다 — 띄우지 않는다"
  say "  [되놓음 ✓] ${#RF[@]}개 · sha256 일치"
  build_env "T565_MAP_LIVE=${OT5:--}" "PLAYER_CAP=${OCAP:--}"
  LABELS=("durango.reset.restored_from=$RESTORE_DIR")
  recreate "$RIMG"
  wait_health "$([ "$KIND" = zone ] && echo "$WAIT_ZONE" || echo "$WAIT_CENTRAL")" || exit 1
  if [ "$KIND" = zone ]; then live_line; fi
  db_line
  say "  다음: bash scripts/reset-world.sh $TARGET --check"
  ;;
esac
