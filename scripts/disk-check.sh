#!/usr/bin/env bash
# === scripts/disk-check.sh — 서버 디스크 · 백업 점검 한 줄(두 호스트 · 읽기만 · 지우기는 --prune 일 때만) (T901 · 2026-10-23) ======================
#
# ★왜: 10-23 초기화 예행 — 서울 빈 자리 9.0 GB(도쿄 35.4 GB). 볼륨에 08-03 · 08-04 `.bak` 여섯(옛 세계 DB) · `/srv/durango/_reset/20261023-*` 백업 셋 ·
#   갱신마다 쌓이는 도커 이미지(`:pre-reset` · T897 `:prev-<대상>`) · 빌드 캐시. 갱신이 잦아졌다 — 디스크가 차서 부팅 · 저장이 깨지는 판을 미리 본다.
#
# 재민 맥에서 한 줄(T878 · T887 · T892 와 같은 꼴):
#   bash <(ssh seoul cat /opt/Mini/scripts/disk-check.sh)            # 두 호스트 — 빈 자리 · 볼륨 · .bak · _reset · 도커(이미지 · 매달린 것 · 빌드 캐시) · 로그 · 판정 한 줄
#   bash <(ssh seoul cat /opt/Mini/scripts/disk-check.sh) --prune    # 지울 목록을 먼저 찍고 → 그 호스트 별칭을 그대로 쳐야 지운다(호스트마다 따로 묻는다)
#     지우는 것은 셋뿐: 매달린 이미지(`docker image prune` — 컨테이너가 안 쓰는 이름 없는 것) · 빌드 캐시(`docker builder prune`) ·
#     **되돌리기에 안 쓰는 옛 durango 이미지**(컨테이너가 쓰는 것 · `:latest` · `:prev-<대상>`(T897 갱신 되돌리기) · `:pre-reset`(초기화 되돌리기)이 아닌 durango-* 태그).
#     ★DB · `.bak` · `_reset` 백업 · 볼륨 · 컨테이너 · durango 밖 이미지는 **안 지운다**(목록 · 크기만 — 지울지는 재민 판단).
#   별칭: `seoul` · `tokyo`(T878) · 다른 이름이면 SYNC_SEOUL= · SYNC_TOKYO= (update-live · sync-tokyo 와 같은 env) · 한 호스트만이면 SYNC_TOKYO=-.
#   볼륨 뿌리 DISK_SRV(기본 /srv/durango — 하네스가 판을 옮길 때만 준다).
#
# 판정(호스트마다 한 줄) — 새 수 0: 빈 자리 ≥ **백업 한 벌**(그 호스트 볼륨의 DB 합 × 11/10 + 64 MB — `reset-world.sh` 가 백업 앞에 보는 그 자리 규칙 ·
#   글자 사본은 `test-disk-check` 가 두 파일에서 같은지 본다). 그 밖(빌드 한 판 몫 · 로그 · 이미지 몫)은 문턱이 없어 수만 찍는다(회부).
# ★제품 0 · 새 수 0 · 비밀 0(컨테이너 env 를 안 읽는다 — 이름 · 크기 · 날짜만).
set -uo pipefail

S="${SYNC_SEOUL:-seoul}"; T="${SYNC_TOKYO:-tokyo}"
PRUNE=0
case "${1:-}" in --prune) PRUNE=1 ;; "") ;; *) sed -n '2,18p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 2 ;; esac
say() { echo "$*"; }

# ── 호스트에서 도는 줄(ssh 'bash -s' 로 보낸다) — $1 = list | prune · prune 이면 $2… = 지울 이미지 id(목록에서 고른 그대로 · 다시 확인한다) ──
read -r -d '' PROBE <<'PROBE'
set -u
SRV="${DISK_SRV:-/srv/durango}"; MODE="${1:-list}"; shift || true
H() { awk -v b="${1:-0}" 'BEGIN{ split("B KB MB GB TB",u," "); i=1; while (b>=1024 && i<5) { b/=1024; i++ } printf (i==1 ? "%d %s" : "%.1f %s"), b, u[i] }'; }
DK=0; command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 && DK=1
# 되돌리기에 쓰는 이미지(지우면 안 되는 것) — 컨테이너가 쓰는 이미지 · durango-*:latest · :prev-* · :pre-reset
keepset() {
  { docker ps -aq | xargs -r docker inspect --format '{{.Image}}' 2>/dev/null
    docker images --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}' | awk '$1 ~ /^durango-[a-z]+:(latest|pre-reset|prev-[a-z0-9_]+)$/ {print $2}'; } | sort -u
}
cands() {   # 지울 후보 durango-* 태그 — "id 크기 이름"
  local K; K="$(keepset)"
  docker images --no-trunc --format '{{.ID}} {{.Size}} {{.Repository}}:{{.Tag}}' | awk '$3 ~ /^durango-/' | while read -r id sz nm; do
    printf '%s\n' "$K" | grep -qx "$id" || echo "$id $sz $nm"
  done
}
if [ "$MODE" = prune ]; then
  [ "$DK" = 1 ] || { echo "✗ docker 를 못 쓴다"; exit 3; }
  K="$(keepset)"; n=0
  for id in "$@"; do
    printf '%s\n' "$K" | grep -qx "$id" && { echo "  ⚠$id 는 그 사이 되돌리기에 쓰는 이미지가 됐다 — 안 지운다"; continue; }
    for tg in $(docker images --no-trunc --format '{{.ID}} {{.Repository}}:{{.Tag}}' | awk -v i="$id" '$1==i && $2 ~ /^durango-/ {print $2}'); do
      docker image rm "$tg" >/dev/null 2>&1 && { echo "  지움 $tg"; n=$((n + 1)); } || echo "  ⚠$tg 를 못 지웠다(다른 태그 · 컨테이너가 쥐었다)"
    done
  done
  echo "  옛 durango 이미지 태그 $n개를 뗐다"
  echo "  매달린 이미지: $(docker image prune -f 2>&1 | tail -1)"
  echo "  빌드 캐시: $(docker builder prune -f 2>&1 | tail -1)"
  echo "V 지운 뒤 빈 자리 $(H "$(df -PB1 "$SRV" 2>/dev/null | awk 'NR==2{print $4}')")"
  exit 0
fi
# ── list(읽기만) ──
fs_line() { df -PB1 "$1" 2>/dev/null | awk -v p="$1" 'NR==2{printf "%s %s %s %s\n", $2, $3, $4, $6}'; }
read -r SZ US AV MP <<<"$(fs_line "$SRV")"
echo "L 디스크($SRV · $MP) 전체 $(H "$SZ") · 씀 $(H "$US") · 남음 $(H "$AV")"
if [ "$DK" = 1 ]; then DR="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)"; read -r _ _ dav dmp <<<"$(fs_line "$DR")"
  [ "$dmp" != "$MP" ] && echo "L 도커 자리($DR · $dmp) 남음 $(H "$dav")"; fi
DB=0
for d in "$SRV"/*/; do
  b="$(basename "$d")"; case "$b" in _reset|_daily) continue ;; esac
  s="$(du -sb "$d" 2>/dev/null | cut -f1)"; [ "${s:-0}" -gt 4096 ] || continue
  dbs="$(find "$d" -maxdepth 1 -type f \( -name '*.db' -o -name '*.db-wal' -o -name '*.db-shm' -o -name '*.db-journal' \) -printf '%s\n' | awk '{t+=$1} END{print t+0}')"
  DB=$((DB + dbs)); echo "L 볼륨 $b $(H "$s")(DB $(H "$dbs"))"
done
nb=0; tb=0
while read -r sz dt p; do [ -n "$p" ] || continue; nb=$((nb + 1)); tb=$((tb + sz)); echo "L   .bak $dt $(H "$sz") $p"; done < <(find "$SRV" -maxdepth 3 -name '*.bak*' -type f -printf '%s %TY-%Tm-%Td %p\n' 2>/dev/null | sort -k2)
echo "L .bak $nb개 · $(H "$tb")(목록만 — 지울지는 재민)"
nr=0; tr=0
if [ -d "$SRV/_reset" ]; then
  while read -r sz p; do [ -n "$p" ] || continue; nr=$((nr + 1)); tr=$((tr + sz)); echo "L   _reset $(H "$sz") $(basename "$p")"; done < <(du -sb "$SRV"/_reset/*/ 2>/dev/null | sort -k2)
fi
echo "L _reset 백업 $nr벌 · $(H "$tr")(목록만 — 지울지는 재민)"
# ★[T907] 매일 스냅샷(backup-live.sh) — 목록 · 크기만(옛것 떼기는 backup-live 의 보관 개수 몫 · 복원이 옮긴 -replaced 는 재민)
nd=0; td=0
if [ -d "$SRV/_daily" ]; then
  while read -r sz p; do [ -n "$p" ] || continue; nd=$((nd + 1)); td=$((td + sz)); echo "L   _daily $(H "$sz") $(basename "$p")"; done < <(du -sb "$SRV"/_daily/*/ 2>/dev/null | sort -k2)
fi
echo "L _daily 매일 스냅샷 $nd벌 · $(H "$td")(backup-live.sh — 보관 개수 넘는 옛것은 backup-live 가 뗀다 · 이 줄은 안 지운다)"
if [ "$DK" = 1 ]; then
  docker system df --format '{{.Type}}|{{.Size}}|{{.Reclaimable}}' 2>/dev/null | while IFS='|' read -r ty sz rc; do echo "L 도커 $ty $sz(되찾을 수 있는 몫 $rc)"; done
  echo "L 매달린 이미지 $(docker images -f dangling=true -q | sort -u | wc -l)개"
  docker images --format '{{.Repository}}:{{.Tag}}|{{.ID}}|{{.Size}}|{{.CreatedSince}}' | awk -F'|' '$1 ~ /^durango-/' | sort | while IFS='|' read -r nm id sz cr; do echo "L   이미지 $nm ${id:0:12} $sz ($cr)"; done
  lt=0; for c in $(docker ps -a --format '{{.Names}}' | grep '^durango-'); do lp="$(docker inspect --format '{{.LogPath}}' "$c" 2>/dev/null)"; ls_="$(stat -c %s "$lp" 2>/dev/null || echo 0)"; lt=$((lt + ls_)); echo "L   로그 $c $(H "$ls_")"; done
  echo "L 컨테이너 로그 합 $(H "$lt")"
  cands | while read -r id sz nm; do echo "C $id $sz $nm"; done
else echo "L 도커 — 못 읽는다(docker 없음 · 권한)"; fi
JU="$(journalctl --disk-usage 2>/dev/null | sed -n 's/.*take up \([^ ]*\) .*/\1/p')"; [ -n "$JU" ] && echo "L 저널(journald) $JU"
# 판정 — 빈 자리 ≥ 백업 한 벌(reset-world.sh 의 백업 자리 규칙 그대로)
need=$(( DB * 11 / 10 + 64 * 1024 * 1024 ))
[ "${AV:-0}" -ge "$need" ] && echo "V ok 빈 자리 $(H "$AV") ≥ 백업 한 벌 $(H "$need")(DB 합 $(H "$DB") × 1.1 + 64 MB — reset-world.sh 백업 자리 규칙)" \
                          || echo "V bad 빈 자리 $(H "$AV") < 백업 한 벌 $(H "$need")(DB 합 $(H "$DB") × 1.1 + 64 MB) — 초기화 · 되돌리기 백업이 안 들어간다"
PROBE

TMP="$(mktemp -d "${TMPDIR:-/tmp}/disk-check.XXXXXX")" || exit 1
trap 'rm -rf "$TMP"' EXIT
say "== disk-check $(date '+%Y-%m-%d %H:%M:%S') — 서울($S) · 도쿄($T)$([ "$PRUNE" = 1 ] && echo ' · --prune') =="
BAD=""
for h in "$S" "$T"; do
  [ "$h" = - ] && continue
  lab=서울; [ "$h" = "$T" ] && lab=도쿄
  if ! ssh -o ConnectTimeout=8 "$h" bash -s -- list <<<"$PROBE" > "$TMP/$h" 2> "$TMP/$h.err" || ! grep -q '^V ' "$TMP/$h"; then
    say "[$lab($h)] ✗ 못 읽었다 — $(tail -1 "$TMP/$h.err" 2>/dev/null | cut -c1-80)"; BAD="$BAD${BAD:+ / }$lab 못 읽음"; continue
  fi
  say "[$lab($h)]"
  sed -n 's/^L /  /p' "$TMP/$h"
  nc="$(grep -c '^C ' "$TMP/$h")"
  [ "$nc" -gt 0 ] && { say "  지울 수 있는 옛 durango 이미지(되돌리기에 안 쓰는 것) $nc개:"; awk '/^C /{printf "    %s %s %s\n", substr($2,8,12), $3, $4}' "$TMP/$h"; } || say "  지울 수 있는 옛 durango 이미지 0개"
  v="$(sed -n 's/^V //p' "$TMP/$h")"; say "  판정: ${v#* }"
  case "$v" in bad*) BAD="$BAD${BAD:+ / }$lab ${v#bad }" ;; esac
done
say "판정: $([ -z "$BAD" ] && echo '두 호스트 모두 빈 자리 ≥ 백업 한 벌' || echo "$BAD")"
[ "$PRUNE" = 1 ] || exit 0

# ── --prune — 호스트마다: 목록 → 별칭을 그대로 쳐야 지운다 ──────────────────────────────────────────
for h in "$S" "$T"; do
  [ "$h" = - ] && continue
  [ -s "$TMP/$h" ] && grep -q '^V ' "$TMP/$h" || continue
  lab=서울; [ "$h" = "$T" ] && lab=도쿄
  ids="$(awk '/^C /{print $2}' "$TMP/$h" | paste -sd' ' -)"
  say ""
  say "[$lab($h) 지우기] 지울 것 — 매달린 이미지 · 빌드 캐시(도커가 셈) · 옛 durango 이미지 $(echo "$ids" | wc -w | tr -d ' ')개${ids:+: $(awk '/^C /{printf "%s ", $4}' "$TMP/$h")}"
  say "  안 지우는 것 — DB · .bak · _reset · _daily · 볼륨 · 컨테이너 · 컨테이너가 쓰는 이미지 · :latest · :prev-<대상> · :pre-reset · durango 밖 이미지"
  printf '  지운다. 이 호스트 별칭을 그대로 쳐라(%s): ' "$h"; a=""; IFS= read -r a || true
  if [ "$a" != "$h" ]; then say "  그만뒀다 — $lab 아무것도 안 지웠다"; continue; fi
  ssh "$h" bash -s -- prune $ids <<<"$PROBE" 2>&1 | sed 's/^V /  /; s/^/  /'
done
