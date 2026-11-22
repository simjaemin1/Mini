#!/usr/bin/env bash
# === scripts/live-status.sh — 한 호스트의 "배포가 끝까지 갔나" 읽기 전용 한 판(T1443 ③) — `update-live.sh --status` 가 호스트마다 부른다 ==========
#
# ★왜(사고 2026-11-21): 배포 줄이 존 `docker stop` 뒤에서 끊겼다(커널이 죽음). 다시 켜자 central(새 것) · caddy 는 떴는데 존은 `Exited (255)` —
#   `docker stop` 이 "손으로 멈춤" 표지를 남겨 `--restart unless-stopped` 가 다시 안 띄웠다. 스탬프(`deployed-hanbando.sha`)는 옛 커밋 그대로였다.
#   재민이 재부팅 뒤 한 줄로 "끊긴 배포인가 · 무엇을 하면 되나"를 보게 한다. **읽기만**(docker ps · inspect · 스탬프 · git merge-base) — 라이브 무변.
#
# 쓰는 법(서울 · 도쿄 호스트 안 — 보통은 맥에서 `update-live.sh --status` 가 ssh 로 부른다):
#   bash scripts/live-status.sh            # 표 + 판정
#   bash scripts/live-status.sh --brief    # 판정 한 줄(배포 줄 첫 줄 · 하네스)
#   env  EXPECT="durango-central durango-zone-hanbando"(기본 서울) · STAMP(기본 /srv/durango/deployed-hanbando.sha) · REPO_DIR(기본 /opt/Mini)
#        caddy 는 이름이 레포에 없어 **이미지 이름에 caddy 가 든 컨테이너**로 찾는다(없으면 "caddy 컨테이너 못 찾음" — 종료 코드는 안 바꾼다)
#   종료 코드 0 = 끝까지 감 · 1 = 끊긴 흔적(배포 줄을 다시) · 2 = 못 읽음(docker 없음 등)
#
# 판정(★새 규칙 0 — 배포 줄 `redeploy-hanbando.sh` 가 하는 일의 앞뒤만 본다):
#   ㉠ 기대 컨테이너가 없거나 돌지 않음 → 끊김(존 stop 뒤 · rm 뒤) 또는 죽음 — "배포 줄을 다시"(스탬프가 옛것이면 배포 줄이 그 존을 다시 굽고 띄운다 ·
#      스탬프가 새것이면 배포 줄은 할 일 0 이라 `--zone` 을 붙여야 한다 — 그 글자를 찍는다)
#   ㉡ 도는 컨테이너의 커밋(`durango.commit` 라벨)이 스탬프보다 **새것**(스탬프의 조상이 아님) → `run` 뒤 `/health` 앞에서 끊김(스탬프를 못 씀) — "배포 줄을 다시"
#   ㉢ 구운 이미지(`durango-zone` · `durango-central`)의 커밋이 도는 컨테이너보다 새것 → 빌드 뒤 · 바꾸기 앞에서 끊김 — "배포 줄을 다시"
#   ㉣ 코드 HEAD 가 스탬프보다 새것 → 받기(git pull)만 하고 배포가 안 끝남(빌드 중 끊김 · 또는 배포 앞) — "배포 줄을 다시"
#   다 아니면 "끝까지 감". (스탬프 = 마지막으로 끝난 배포의 HEAD — 안 바뀐 쪽 컨테이너는 그보다 옛 커밋이 맞다. 그래서 "같다"가 아니라 "새것인가"를 본다)
set -uo pipefail
EXPECT="${EXPECT:-durango-central durango-zone-hanbando}"
STAMP="${STAMP:-/srv/durango/deployed-hanbando.sha}"
REPO_DIR="${REPO_DIR:-/opt/Mini}"
BRIEF=0; [ "${1:-}" = "--brief" ] && BRIEF=1
command -v docker >/dev/null 2>&1 || { echo "상태 ? docker 를 못 찾음 — 이 호스트가 맞나"; exit 2; }

ST=""; [ -f "$STAMP" ] && ST="$(tr -d ' \n\r' < "$STAMP" 2>/dev/null || true)"
newer() {   # newer <A> <B> — A 가 B 보다 새것(B 의 조상이 아니고 같지도 않음)이면 0
  local a="$1" b="$2"
  [ -z "$a" ] || [ -z "$b" ] && return 1
  [ "$a" = "$b" ] && return 1
  git -C "$REPO_DIR" cat-file -e "${a}^{commit}" 2>/dev/null && git -C "$REPO_DIR" cat-file -e "${b}^{commit}" 2>/dev/null || return 1
  git -C "$REPO_DIR" merge-base --is-ancestor "$a" "$b" 2>/dev/null && return 1
  return 0
}
img_of() { case "$1" in durango-central) echo durango-central ;; durango-zone-*) echo durango-zone ;; *) echo "" ;; esac; }
short() { [ -n "$1" ] && echo "${1:0:8}" || echo "—"; }

BAD=(); ROWS=()
for N in $EXPECT; do
  L="$(docker inspect -f '{{.State.Status}}|{{.HostConfig.RestartPolicy.Name}}|{{index .Config.Labels "durango.commit"}}|{{.State.ExitCode}}' "$N" 2>/dev/null || true)"
  if [ -z "$L" ]; then ROWS+=("$N · 없음"); BAD+=("$N 컨테이너가 없다(rm 뒤 run 앞에서 끊겼거나 지워짐)"); continue; fi
  IFS='|' read -r STATE POL CC EXITC <<< "$L"
  IMG="$(img_of "$N")"; IC=""
  [ -n "$IMG" ] && IC="$(docker image inspect -f '{{index .Config.Labels "durango.commit"}}' "$IMG" 2>/dev/null || true)"
  ROWS+=("$N · $STATE$([ "$STATE" != running ] && echo "(코드 $EXITC)") · 재시작 $POL · 컨테이너 커밋 $(short "$CC")$([ -n "$IMG" ] && echo " · 구운 이미지 $(short "$IC")")")
  if [ "$STATE" != running ]; then BAD+=("$N 이 돌지 않는다($STATE · 코드 $EXITC — 배포 중 stop 뒤에 끊겼으면 '손으로 멈춤' 표지 때문에 재부팅해도 안 뜬다)"); continue; fi
  if newer "$CC" "$ST"; then BAD+=("$N 은 새 판($(short "$CC"))으로 도는데 스탬프는 옛것($(short "$ST")) — run 뒤 /health 앞에서 끊겼다"); fi
  if [ -n "$IC" ] && newer "$IC" "$CC"; then BAD+=("$N 의 이미지는 새로 구웠는데($(short "$IC")) 컨테이너는 옛것($(short "$CC")) — 빌드 뒤 바꾸기 앞에서 끊겼다"); fi
done
CADDY="$(docker ps -a --format '{{.Names}}|{{.Image}}|{{.State}}' 2>/dev/null | awk -F'|' 'tolower($2) ~ /caddy/ {print $1" · "$3; exit}')"
ROWS+=("caddy · ${CADDY:-컨테이너 못 찾음(이미지 이름에 caddy 가 든 것)}")
[ -n "$CADDY" ] && ! grep -q "running" <<< "$CADDY" && BAD+=("caddy 가 돌지 않는다 — https 가 안 된다")

HEAD0="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
if newer "$HEAD0" "$ST"; then BAD+=("코드는 새 판($(short "$HEAD0"))을 받았는데 스탬프는 옛것($(short "$ST")) — 받기만 하고 배포가 안 끝났다(빌드 중 끊김 · 또는 배포 앞)"); fi
ZONE_STOPPED=0; for b in "${BAD[@]+"${BAD[@]}"}"; do case "$b" in durango-zone-*'돌지 않는다'*|durango-zone-*'없다'*) ZONE_STOPPED=1 ;; esac; done
HEAD=""; HEAD="$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || true)"
FIX="배포 줄을 다시 돌린다(bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh))"
ZONE_GONE=0; for b in "${BAD[@]+"${BAD[@]}"}"; do case "$b" in durango-zone-*'없다'*) ZONE_GONE=1 ;; esac; done
if [ "$ZONE_GONE" = 1 ]; then FIX="존 컨테이너가 없다 — 배포 줄은 '컨테이너 없음'으로 멈춘다(옛 컨테이너와 함께 env 도 사라졌다) · 문서/라이브_재부팅_절차.md 의 '존 컨테이너가 없을 때'(재민 손)";
elif [ "$ZONE_STOPPED" = 1 ] && [ -n "$ST" ] && [ -n "$HEAD" ] && [ "$ST" = "$HEAD" ]; then FIX="스탬프가 이미 새것이라 배포 줄은 할 일 0 으로 끝난다 — 존만 다시: bash /opt/Mini/scripts/redeploy-hanbando.sh --zone"; fi

if [ "$BRIEF" = 1 ]; then
  if [ ${#BAD[@]} -eq 0 ]; then echo "상태 ○ 앞 배포가 끝까지 갔다 · 스탬프 $(short "$ST")"; exit 0; fi
  TOP="${BAD[0]}"; for b in "${BAD[@]}"; do case "$b" in durango-zone-*'돌지 않는다'*|durango-zone-*'없다'*) TOP="$b"; break ;; esac; done   # 존이 안 도는 것을 맨 앞에(사람이 못 들어가는 까닭)
  echo "상태 ✗ 앞 배포가 끊긴 흔적 — ${TOP}$([ ${#BAD[@]} -gt 1 ] && echo " 외 $(( ${#BAD[@]} - 1 ))") — $FIX"; exit 1
fi
echo "=== 배포 상태 — $(hostname 2>/dev/null || echo 호스트) · 스탬프 $(short "$ST") · 코드 HEAD $(short "$HEAD") ==="
for r in "${ROWS[@]}"; do echo "  $r"; done
if [ ${#BAD[@]} -eq 0 ]; then echo "  ○ 앞 배포가 끝까지 갔다(컨테이너가 다 돌고 · 스탬프보다 새 판이 없다)"; exit 0; fi
for b in "${BAD[@]}"; do echo "  ✗ $b"; done
echo "  ⇒ 앞 배포가 끊겼다 — $FIX"
exit 1
