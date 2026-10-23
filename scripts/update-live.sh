#!/usr/bin/env bash
# === scripts/update-live.sh — 라이브 갱신 한 줄: 서울 재배포 → 도쿄 차분 받기 → 도쿄 재배포 → 렉 판정 (T892 · 2026-10-23) ===================
#
# ★왜: 초기화(10-23) 뒤로 라이브 갱신이 잦다. 절차서 §8 은 맥에서 줄 셋(서울 `redeploy-hanbando.sh` · `sync-tokyo.sh` · 도쿄 빌드 + `redeploy-light.sh`)이고
#   줄 사이 검증을 재민이 눈으로 봤다. 배포는 그대로 재민 손이다 — 줄 셋을 한 줄로 묶고, 줄 사이 검증을 이 스크립트가 본다.
#
# 재민 맥에서 한 줄(T878 · T887 과 같은 꼴 · 서울에 있는 그 판):
#   bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh)          # 갱신
#   bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh) --dry    # 무엇을 할지만(라이브 무변 — 서울 `git fetch` 만)
#   ⚠이 줄이 도는 판은 **서울이 지금 가진** update-live.sh 다(①이 받기 전 판). 이 파일 자체가 바뀐 갱신이면 끝난 뒤 한 번 더 치면 새 판이 돈다.
#   ⚠처음 한 번(서울에 이 파일이 아직 없으면): `ssh seoul 'cd /opt/Mini && git pull --ff-only'` 를 먼저 치거나 맥 레포에서 `bash scripts/update-live.sh`.
#
# 차례(어느 단계든 ✗ 면 거기서 멈추고 "바뀐 것 · 안 한 것"을 찍는다):
#   ① 서울 `git pull --ff-only`
#   ② 할 일 판정 — `redeploy-hanbando.sh --dry` 그대로(같은 규칙 · 사본 0):
#        서울 = 서울 스탬프(`/srv/durango/deployed-hanbando.sha`) 기준 · 도쿄 = 도쿄 스탬프(`/srv/durango/deployed-nippon.sha`) 사본을 `STAMP=` 로 준 같은 판정의 zone 칸
#        (도쿄 스탬프가 없으면 "기준점을 몰라 전부" — 첫 판은 도쿄도 다시 굽는다)
#   ③ 서울 `redeploy-hanbando.sh`(자동 판정 · central · 한반도) → `reset-world.sh hanbando|central --live`(관측자 한 줄 — 안 돌면 멈춤)
#   ④ `sync-tokyo.sh` — 끝에 두 호스트 HEAD 가 같지 않으면(= `✓ 두 줄이 같다` 가 아니면) 멈춤(도쿄 무변 — sync-tokyo 가 reset 앞에서 멈춘다)
#   ⑤ 도쿄(②의 zone 칸이 1 일 때만): 빌드(커밋 라벨) · `redeploy-light.sh` — §8 의 env 그대로(`CHAR_SPRITE=on T565_MAP_LIVE=0` · 비밀은 도쿄 파일에서 셸 env 로만)
#        · central 주소 = 옛 컨테이너의 `CENTRAL_HOST` · 정원 = 옛 컨테이너의 `PLAYER_CAP`(없으면 redeploy-light 기본)
#        · 옛 컨테이너에만 있던 env **이름**을 찍는다(§8 줄은 env 를 새로 짓는다 — 빠지는 손잡이가 있으면 보인다 · 값 0)
#   ⑥ `reset-world.sh nippon --live`(관측자 한 줄) → 도쿄 스탬프 = 도쿄 HEAD
#   ⑦ `live-lag.sh` 판정 한 줄
#   ★[T897] 고정 — ② 뒤 · ③ 앞: 이 갱신이 다시 띄울 대상만 지금 이미지에 `:prev-<대상>` 태그(`reset-world.sh <대상> --pin-prev` · 서울 central · 한반도 · 도쿄 닛폰은 ④ 뒤 —
#     도쿄 reset-world.sh 가 새 판이어야 해서) · 안 바뀔 대상은 `:prev` 를 뗀다(`--drop-prev`) · 바꿀 것이 하나도 없는 갱신이면 고정본을 그대로 둔다.
#
# 되돌리기(T897) — 갱신이 라이브를 깨면 같은 꼴 한 줄로 **바로 앞 판**(이미지만 · DB 무접촉 · env 그대로):
#   bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh) --rollback --dry   # 무엇을 되돌릴지만(대상마다 지금 이미지 · `:prev` · 커밋)
#   bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh) --rollback         # 서울 central → 한반도 → 도쿄 닛폰 `reset-world.sh --rollback`(`:prev` 가 없거나 이미 그것이면 할 일 0)
#     → 도쿄 코드 트리 = 돌아간 닛폰 이미지의 커밋(`SYNC_COMMIT=<커밋> sync-tokyo` · 서울 `git reset` 은 안 한다 — 서울 HEAD 는 기록만)
#     → 스탬프: 돌아간 호스트의 스탬프를 그 이미지 커밋으로(모르면 지운다 — 다음 갱신이 전부 한다) → 관측 셋 → live-lag 판정.
#   ⚠`:prev` 는 한 칸이다 — 되돌린 뒤 다시 되돌리면 할 일 0(더 앞으로 가지 않는다). 다시 앞으로 가려면 갱신 한 줄(스탬프가 지워졌으면 전부 다시 굽는다).
#
# 별칭 · 자리: `seoul` · `tokyo`(맥 `~/.ssh/config` — T878) · 다른 이름이면 SYNC_SEOUL= · SYNC_TOKYO= · 코드 자리 SYNC_SEOUL_DIR · SYNC_TOKYO_DIR(기본 /opt/Mini 둘 —
#   sync-tokyo · live-lag 와 같은 env 를 넘긴다). 도쿄 스탬프 자리 TOKYO_STAMP(기본 /srv/durango/deployed-nippon.sha).
# ★새 수 0 · 제품 0 · 비밀 값 화면 · 파일 0(T887 규약 — 도쿄 비밀은 도쿄 셸 env 로만 · 맥으로 오는 것은 이름 · 수 · 판정뿐).
set -uo pipefail

S="${SYNC_SEOUL:-seoul}"; T="${SYNC_TOKYO:-tokyo}"
SD="${SYNC_SEOUL_DIR:-/opt/Mini}"; TD="${SYNC_TOKYO_DIR:-/opt/Mini}"
TSTAMP="${TOKYO_STAMP:-/srv/durango/deployed-nippon.sha}"
DRY=0; RB=0
for a in "$@"; do case "$a" in --dry) DRY=1 ;; --rollback) RB=1 ;; *) sed -n '2,37p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 2 ;; esac; done
export SYNC_SEOUL="$S" SYNC_TOKYO="$T" SYNC_SEOUL_DIR="$SD" SYNC_TOKYO_DIR="$TD" LAG_SEOUL="$S" LAG_TOKYO="$T"
DONE=""
say() { echo "$*"; }
ind() { sed 's/^/    /'; }
did() { DONE="${DONE}${DONE:+ → }$1"; }
stop() { say "  ✗ 멈췄다 — $1"; say "  바뀐 것: ${DONE:-없음(라이브 무변)}"; say "  안 한 것: $2"; exit 1; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/update-live.XXXXXX")" || exit 1
trap 'rm -rf "$TMP"' EXIT

# 할 일 판정(서울에서 — `redeploy-hanbando.sh --dry` 의 끝 줄 PLAN). $1 = 기준 스탬프(빈 값이면 서울 스탬프 그대로)
plan_of() {
  if [ -z "${1+x}" ]; then ssh -n "$S" "cd $SD && bash scripts/redeploy-hanbando.sh --dry"
  else ssh -n "$S" "cd $SD && t=\$(mktemp) && printf '%s\n' '$1' > \$t && STAMP=\$t bash scripts/redeploy-hanbando.sh --dry; r=\$?; rm -f \$t; exit \$r"; fi
}
zone_of() { sed -n 's/^PLAN .*zone=\([01]\).*/\1/p' | tail -1; }
# 도쿄 옛 존 컨테이너 — 비밀 아닌 칸 둘(값) + env **이름**(값 0). 도쿄 셸에서 뽑는다.
tokyo_old() { ssh -n "$T" "docker inspect durango-zone-nippon --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | awk -F= 'NF{n=n (n?\" \":\"\") \$1} /^PLAYER_CAP=/{c=substr(\$0,12)} /^CENTRAL_HOST=/{h=substr(\$0,14)} END{printf \"cap=%s host=%s names=%s\n\", c, h, n}'"; }

say "== update-live $(date '+%Y-%m-%d %H:%M:%S') — 서울($S:$SD) → 도쿄($T:$TD)$([ "$DRY" = 1 ] && echo ' · 예행(라이브 무변)') =="
SH0="$(ssh -n "$S" "cd $SD && git rev-parse HEAD")" || stop "서울($S)에 못 붙었다" "전부"
TH0="$(ssh -n "$T" "cd $TD 2>/dev/null && git rev-parse HEAD 2>/dev/null" || true)"
TST="$(ssh -n "$T" "cat $TSTAMP 2>/dev/null" | tr -d ' \r\n' || true)"
OLD="$(tokyo_old || true)"
say "  서울 HEAD ${SH0:0:12} · 도쿄 HEAD ${TH0:0:12} · 도쿄 스탬프 ${TST:0:12}$([ -z "$TST" ] && echo '(없음 — 도쿄는 전부 한다)') · 도쿄 옛 존 정원 $(echo "$OLD" | sed -n 's/.*cap=\([^ ]*\).*/\1/p') · central $(echo "$OLD" | sed -n 's/.*host=\([^ ]*\).*/\1/p')"

if [ "$DRY" = 1 ] && [ "$RB" = 0 ]; then
  say "[예행 ②] 서울 판정(redeploy-hanbando.sh --dry — 받을 판 기준)"
  plan_of 2>&1 | ind
  say "[예행 ②] 도쿄 판정(같은 규칙 · 도쿄 스탬프 기준)"
  TP="$(plan_of "$TST" 2>&1)"; echo "$TP" | grep -E '^\[판정\]|^PLAN' | ind
  [ "$(echo "$TP" | zone_of)" = 1 ] && say "    → 도쿄 존: 빌드 · 재생성 한다" || say "    → 도쿄 존: 건너뛴다(존이 쓰는 파일이 안 바뀌었다)"
  say "[예행 ③] 도쿄 옛 존 env 이름(값 0): $(echo "$OLD" | sed -n 's/.*names=//p')"
  say "[예행 ④] sync-tokyo --dry(서울 지금 HEAD 기준 — 실제 판은 ① 뒤 HEAD)"
  bash <(ssh -n "$S" cat "$SD/scripts/sync-tokyo.sh") --dry 2>&1 | ind
  say "[예행 ⑦] 지금 렉 판정(읽기만)"
  bash <(ssh -n "$S" cat "$SD/scripts/live-lag.sh") 2>&1 | tail -1 | ind
  say "  (예행 — 라이브 무변 · 서울 git fetch 만)"
  exit 0
fi

# ── [T897] 되돌리기 ─────────────────────────────────────────────────────────────────────────────
# 한 대상의 지금 · :prev(이미지 id 12 · 커밋 라벨) — 그 호스트에서(값 0 · id · 커밋만)
prev_of() {   # prev_of <호스트> <컨테이너> <이미지 이름> <대상>
  ssh -n "$1" "c=\$(docker inspect $2 --format '{{.Image}}' 2>/dev/null); p=\$(docker image inspect $3:prev-$4 --format '{{.Id}}' 2>/dev/null); cm() { v=\$(docker image inspect \$1 --format '{{index .Config.Labels \"durango.commit\"}}' 2>/dev/null); [ -n \"\$v\" ] && [ \"\$v\" != '<no value>' ] && echo \${v:0:12} || echo -; }; echo \"지금 \${c:7:12}(\$( [ -n \"\$c\" ] && cm \$c || echo -)) · :prev-$4 \${p:7:12}\$( [ -n \"\$p\" ] && echo \"(\$(cm \$p))\" || echo '없음')\$( [ -n \"\$p\" ] && [ \"\$p\" = \"\$c\" ] && echo ' — 이미 그것' )\""
}
needs_rb() {   # needs_rb <호스트> <컨테이너> <이미지 이름> <대상> — :prev 가 있고 지금 이미지와 다르면 참(그 호스트 reset-world.sh 를 부를 일이 있다)
  ssh -n "$1" "c=\$(docker inspect $2 --format '{{.Image}}' 2>/dev/null); p=\$(docker image inspect $3:prev-$4 --format '{{.Id}}' 2>/dev/null); [ -n \"\$p\" ] && [ \"\$p\" != \"\$c\" ]"
}
img_commit() {   # img_commit <호스트> <컨테이너> — 지금 도는 이미지의 커밋 라벨(전체 · 없으면 빈칸)
  ssh -n "$1" "v=\$(docker image inspect \$(docker inspect $2 --format '{{.Image}}') --format '{{index .Config.Labels \"durango.commit\"}}' 2>/dev/null); [ \"\$v\" = '<no value>' ] || echo \$v"
}
if [ "$RB" = 1 ]; then
  say "[되돌리기] 대상마다 지금 · :prev(이미지 · 커밋) — DB · 볼륨 무접촉 · env 그대로"
  say "    서울 central  $(prev_of "$S" durango-central durango-central central)"
  say "    서울 hanbando $(prev_of "$S" durango-zone-hanbando durango-zone hanbando)"
  say "    도쿄 nippon   $(prev_of "$T" durango-zone-nippon durango-zone nippon)"
  if [ "$DRY" = 1 ]; then say "  (예행 — 라이브 무변)"; exit 0; fi
  SRB=0; TRB=0
  #   ★할 일이 있는 대상만 그 호스트의 reset-world.sh 를 부른다 — 되돌린 뒤 도쿄 코드 트리는 앞 커밋이라(그 판 reset-world.sh 에 --rollback 이 없을 수 있다)
  #     두 번째 되돌리기는 여기서 "할 일 0" 으로 끝나야 한다(마른 연습이 잡았다).
  for x in "$S central durango-central $SD 서울" "$S hanbando durango-zone $SD 서울" "$T nippon durango-zone $TD 도쿄"; do set -- $x
    c="durango-$([ "$2" = central ] && echo central || echo "zone-$2")"
    if ! needs_rb "$1" "$c" "$3" "$2"; then say "    ($5 $2 — :prev 가 없거나 이미 그것 · 할 일 0)"; continue; fi
    out="$(ssh -n "$1" "cd $4 && bash scripts/reset-world.sh $2 --rollback" 2>&1)"; rc=$?
    echo "$out" | grep -vE '^== ' | ind
    [ "$rc" = 0 ] || stop "$5 $2 되돌리기(rc $rc)" "그 뒤 대상 · 도쿄 코드 · 스탬프"
    if [ "$2" = nippon ]; then TRB=1; else SRB=1; fi; did "$5 $2 → :prev-$2"
  done
  #   관측 셋 — 도쿄 코드 트리를 옮기기 **앞**에(옮긴 뒤 그 판 reset-world.sh 에 --live 가 없을 수 있다)
  for x in "$S central $SD" "$S hanbando $SD" "$T nippon $TD"; do set -- $x
    out="$(ssh -n "$1" "cd $3 && bash scripts/reset-world.sh $2 --live" 2>&1)"; rc=$?
    echo "$out" | grep -vE '^== ' | ind
    { [ "$rc" = 0 ] && ! echo "$out" | grep -q '관측자 줄을 못 읽었다'; } || stop "$2 관측(--live rc $rc)" "도쿄 코드 · 스탬프 · live-lag"
  done
  # 도쿄 코드 트리 = 지금 도는 닛폰 이미지의 커밋(서울은 git 을 안 건드린다 — 기록만)
  TC="$(img_commit "$T" durango-zone-nippon)"; TH="$(ssh -n "$T" "cd $TD && git rev-parse HEAD" 2>/dev/null || true)"
  if [ -z "$TC" ]; then say "    도쿄 코드 트리 그대로 ${TH:0:12} — 도는 이미지에 커밋 라벨이 없다"
  elif [ "$TC" = "$TH" ]; then say "    도쿄 코드 트리 = 도는 이미지 커밋 ${TC:0:12} — 그대로"
  else
    say "    도쿄 코드 트리 ${TH:0:12} → ${TC:0:12}(도는 이미지 커밋 · SYNC_COMMIT)"
    SYNC_COMMIT="$TC" bash <(ssh -n "$S" cat "$SD/scripts/sync-tokyo.sh") 2>&1 | ind
    [ "$(ssh -n "$T" "cd $TD && git rev-parse HEAD" 2>/dev/null)" = "$TC" ] || stop "도쿄 코드 트리를 ${TC:0:12} 로 못 맞췄다" "스탬프 · 관측"
    did "도쿄 코드 → ${TC:0:12}"
  fi
  # 스탬프 — 돌아간 호스트만: 도는 이미지 커밋(서울은 central · 한반도가 같은 커밋일 때만) · 모르면 지운다(다음 갱신이 전부 한다)
  if [ "$SRB" = 1 ]; then
    a="$(img_commit "$S" durango-central)"; b="$(img_commit "$S" durango-zone-hanbando)"
    if [ -n "$a" ] && [ "$a" = "$b" ]; then ssh -n "$S" "echo $a > /srv/durango/deployed-hanbando.sha" && did "서울 스탬프 ${a:0:12}"
    else ssh -n "$S" "rm -f /srv/durango/deployed-hanbando.sha" && did "서울 스탬프 지움(central ${a:0:12} · 한반도 ${b:0:12} — 다음 갱신은 전부)"; fi
  fi
  if [ "$TRB" = 1 ]; then
    if [ -n "$TC" ]; then ssh -n "$T" "echo $TC > $TSTAMP" && did "도쿄 스탬프 ${TC:0:12}"; else ssh -n "$T" "rm -f $TSTAMP" && did "도쿄 스탬프 지움"; fi
  fi
  say "[되돌리기 ⑦] live-lag"
  bash <(ssh -n "$S" cat "$SD/scripts/live-lag.sh") > "$TMP/lag" 2>&1
  sed -n '2,$p' "$TMP/lag" | ind
  say "  ✓ 되돌림 끝 — 바뀐 것: ${DONE:-없음(되돌릴 것 0)} · 서울 코드 HEAD $(ssh -n "$S" "cd $SD && git rev-parse --short=12 HEAD")(그대로 — 기록만)"
  exit 0
fi

# ① 서울 코드 받기
say "[①] 서울 git pull --ff-only"
SH1="$(ssh -n "$S" "cd $SD && git pull --ff-only -q && git rev-parse HEAD")" || stop "서울 git pull" "서울 재배포 · 도쿄 전부"
[ "$SH1" != "$SH0" ] && did "서울 코드 ${SH0:0:12} → ${SH1:0:12}"
say "    ${SH0:0:12} → ${SH1:0:12} · $(ssh -n "$S" "cd $SD && git log --oneline --abbrev=12 -1" | cut -c1-90)"

# ② 판정 — 도쿄(서울 판정은 ③ 의 redeploy-hanbando 가 찍는다)
TP="$(plan_of "$TST" 2>&1)"; TZ="$(echo "$TP" | zone_of)"
[ -n "$TZ" ] || { echo "$TP" | tail -3 | ind; stop "도쿄 판정(redeploy-hanbando.sh --dry)을 못 읽었다" "서울 재배포 · 도쿄 전부"; }
say "[②] 도쿄 판정: $(echo "$TP" | sed -n 's/^\[판정\] //p') → 도쿄 존 $([ "$TZ" = 1 ] && echo '한다' || echo '건너뛴다')"

# ②-고정 — ★[T897] 이 갱신이 다시 띄울 대상만 `:prev`(되돌리기 한 칸) · 안 바뀔 대상은 뗀다 · 바꿀 것 0 이면 그대로
SP="$(plan_of 2>&1)"; SC="$(echo "$SP" | sed -n 's/^PLAN central=\([01]\).*/\1/p' | tail -1)"; SZ="$(echo "$SP" | zone_of)"
[ -n "$SC" ] && [ -n "$SZ" ] || stop "서울 판정(redeploy-hanbando.sh --dry)을 못 읽었다" "서울 재배포 · 도쿄 전부"
PINALL=1; [ "$SC$SZ$TZ" = 000 ] && PINALL=0
if [ "$PINALL" = 0 ]; then say "[②-고정] 바꿀 것 0 — 되돌리기 고정본(:prev)은 그대로(앞 갱신의 것)"
else
  say "[②-고정] 서울 central $([ "$SC" = 1 ] && echo 고정 || echo 뗌) · 한반도 $([ "$SZ" = 1 ] && echo 고정 || echo 뗌) · 도쿄 닛폰 $([ "$TZ" = 1 ] && echo '고정(④ 뒤)' || echo '뗌(④ 뒤)')"
  for x in "central $SC" "hanbando $SZ"; do set -- $x
    out="$(ssh -n "$S" "cd $SD && bash scripts/reset-world.sh $1 $([ "$2" = 1 ] && echo --pin-prev || echo --drop-prev)" 2>&1)"; rc=$?
    echo "$out" | grep -vE '^== ' | ind
    [ "$rc" = 0 ] || stop "서울 $1 고정(rc $rc)" "서울 재배포 · 도쿄 전부"
  done
fi

# ③ 서울 재배포 + 관측
say "[③] 서울 redeploy-hanbando.sh(자동 판정)"
ssh -n "$S" "cd $SD && bash scripts/redeploy-hanbando.sh" > "$TMP/seoul" 2>&1; rc=$?
ind < "$TMP/seoul"
[ "$rc" = 0 ] || stop "서울 redeploy-hanbando.sh 가 rc $rc" "서울 관측 · 도쿄 전부"
if grep -q '할 일이 없다' "$TMP/seoul"; then :; else did "서울 재배포($(grep -m1 'central: ' "$TMP/seoul" | sed 's/^ *//; s/ *— .*//; s/  */ /g'))"; fi
for tg in central hanbando; do
  out="$(ssh -n "$S" "cd $SD && bash scripts/reset-world.sh $tg --live" 2>&1)"; rc=$?
  echo "$out" | grep -vE '^== ' | ind
  { [ "$rc" = 0 ] && ! echo "$out" | grep -q '관측자 줄을 못 읽었다'; } || stop "서울 $tg 관측(--live rc $rc)" "도쿄 전부"
done

# ④ 도쿄 코드 받기(차분)
say "[④] sync-tokyo"
bash <(ssh -n "$S" cat "$SD/scripts/sync-tokyo.sh") > "$TMP/sync" 2>&1; rc=$?
ind < "$TMP/sync"
TH1="$(ssh -n "$T" "cd $TD && git rev-parse HEAD" 2>/dev/null || true)"
#   ★판정 = sync-tokyo 의 끝 줄과 같은 말(두 호스트 HEAD 가 같다) — 이미 같았던 판은 sync-tokyo 가 "받을 것 0" 으로 일찍 끝나 ✓ 줄이 없다(그래서 HEAD 를 직접 견준다)
{ [ "$rc" = 0 ] && [ -n "$TH1" ] && [ "$TH1" = "$SH1" ]; } || stop "sync-tokyo(두 HEAD 가 다르다 · rc $rc — 도쿄 코드는 옛 판 그대로)" "도쿄 재배포"
[ "$TH1" != "$TH0" ] && did "도쿄 코드 ${TH0:0:12} → ${TH1:0:12}"

# ④-고정 — ★[T897] 도쿄 닛폰(도쿄 reset-world.sh 가 ④ 로 새 판이 된 뒤)
if [ "$PINALL" = 1 ]; then
  out="$(ssh -n "$T" "cd $TD && bash scripts/reset-world.sh nippon $([ "$TZ" = 1 ] && echo --pin-prev || echo --drop-prev)" 2>&1)"; rc=$?
  echo "$out" | grep -vE '^== ' | ind
  [ "$rc" = 0 ] || stop "도쿄 nippon 고정(rc $rc)" "도쿄 재배포"
fi

# ⑤ 도쿄 재배포(판정이 1 일 때만) — §8 의 env 그대로 · 비밀은 도쿄 셸 env 로만
if [ "$TZ" = 1 ]; then
  say "[⑤] 도쿄 빌드 · redeploy-light.sh(RUN_ZONES=nippon · CHAR_SPRITE=on T565_MAP_LIVE=0 · 정원 = 옛 컨테이너 값)"
  ssh "$T" bash -s -- "$TD" <<'TOKYO' 2>&1 | ind
set -euo pipefail
cd "$1"
E() { docker inspect durango-zone-nippon --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null || true; }
CAP="$(E | sed -n 's/^PLAYER_CAP=//p' | head -1)"; CIP="$(E | sed -n 's/^CENTRAL_HOST=//p' | head -1)"
OLDN="$(E | sed 's/=.*//' | grep -v '^$' | sort -u)"
[ -n "$CIP" ] || { echo "✗ 옛 durango-zone-nippon 에서 CENTRAL_HOST 를 못 읽었다 — central 주소를 모른다(멈춤 · 도쿄 존 무변)"; exit 3; }
docker build -q -f Dockerfile.zone -t durango-zone --label "durango.commit=$(git rev-parse HEAD)" . >/dev/null
echo "빌드 ✓ 커밋 $(git rev-parse --short=12 HEAD)"
export CENTRAL_SECRET="$(cat /root/.durango-secret)"
env ${CAP:+PLAYER_CAP=$CAP} CENTRAL_IP="$CIP" RUN_ZONES=nippon EXTRA_ENV="CHAR_SPRITE=on T565_MAP_LIVE=0" bash scripts/redeploy-light.sh | grep -E '^\[light\]|\[up\]|\[ready\]|\[FAIL\]|\[timeout\]|=== 완료' | sed 's/\r//'
unset CENTRAL_SECRET
NEWN="$(E | sed 's/=.*//' | grep -v '^$' | sort -u)"
GONE="$(comm -23 <(echo "$OLDN") <(echo "$NEWN") | paste -sd' ' -)"; ADDN="$(comm -13 <(echo "$OLDN") <(echo "$NEWN") | paste -sd' ' -)"
echo "env 이름 — 옛 컨테이너에만: ${GONE:-없음}$([ -n "$GONE" ] && echo '  ⚠§8 줄이 안 싣는 손잡이(값은 안 찍는다)') · 새로 생김: ${ADDN:-없음}"
TOKYO
  [ "$?" = 0 ] || stop "도쿄 빌드 · redeploy-light(rc ≠ 0)" "도쿄 관측 · 도쿄 스탬프 · 렉 판정"
  did "도쿄 재배포"
else
  say "[⑤] 도쿄 존 건너뜀 — 판정: 존이 쓰는 파일이 안 바뀌었다(도쿄 스탬프 ${TST:0:12} 기준)"
fi

# ⑥ 도쿄 관측 → 스탬프
out="$(ssh -n "$T" "cd $TD && bash scripts/reset-world.sh nippon --live" 2>&1)"; rc=$?
echo "$out" | grep -vE '^== ' | ind
{ [ "$rc" = 0 ] && ! echo "$out" | grep -q '관측자 줄을 못 읽었다'; } || stop "도쿄 nippon 관측(--live rc $rc)" "도쿄 스탬프 · 렉 판정"
if [ "$TZ" = 1 ]; then ssh -n "$T" "git -C $TD rev-parse HEAD > $TSTAMP" && did "도쿄 스탬프 ${TH1:0:12}"; fi

# ⑦ 렉 판정
say "[⑦] live-lag"
bash <(ssh -n "$S" cat "$SD/scripts/live-lag.sh") > "$TMP/lag" 2>&1
sed -n '2,$p' "$TMP/lag" | ind
say "  ✓ 끝 — 서울 ${SH1:0:12} · 도쿄 ${TH1:0:12} · 바뀐 것: ${DONE:-없음(이미 최신)}"
