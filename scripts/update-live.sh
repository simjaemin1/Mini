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
#   ⓪ ★[T919] 갱신 앞 — 갱신 직전이 DB 가 가장 위험한 때다(새 코드가 옛 DB 를 처음 연다):
#        디스크 = `disk-check.sh` 판정(두 호스트 빈 자리 ≥ 백업 한 벌 — T901 · reset-world 규칙 · 새 수 0) 아니면 멈춤(이유 한 줄 · 라이브 무변)
#        → 스냅샷 = `backup-live.sh` 한 판(T907 · 도는 central · 존 마다 · 라벨 `update-live <앞 커밋> <갱신 커밋>`) — 이 갱신이 다시 띄울 대상이 있는 호스트만
#          (②-고정과 같은 판정 — 바꿀 것 0 이면 안 뜬다 · 서울 판의 backup-live.sh 를 두 호스트에 그대로 흘린다) · ✗ 면 멈춤
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
#   ⑧ ★[T1048] 경계 한 줄(읽기만 · env 값 0) — 서울 한반도 컨테이너 env 에 `ZONE_HOST_<도쿄 존>` 이 **있고** 그 존이 보는 주소의 `/health` 가 **존 안에서** 닿는가
#        (도쿄 존 = 도쿄 `durango-zone-*` · 없으면 nippon) · 하나라도 ✗ 면 멈춤(갱신은 끝났다 — 경계만 막힌 것) · `--dry` 도 찍는다(멈추지 않는다)
#   ★[T897] 고정 — ② 뒤 · ③ 앞: 이 갱신이 다시 띄울 대상만 지금 이미지에 `:prev-<대상>` 태그(`reset-world.sh <대상> --pin-prev` · 서울 central · 한반도 · 도쿄 닛폰은 ④ 뒤 —
#     도쿄 reset-world.sh 가 새 판이어야 해서) · 안 바뀔 대상은 `:prev` 를 뗀다(`--drop-prev`) · 바꿀 것이 하나도 없는 갱신이면 고정본을 그대로 둔다.
#
# 되돌리기(T897) — 갱신이 라이브를 깨면 같은 꼴 한 줄로 **바로 앞 판**(이미지만 · DB 무접촉 · env 그대로):
#   bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh) --rollback --dry   # 무엇을 되돌릴지만(대상마다 지금 이미지 · `:prev` · 커밋)
#   bash <(ssh seoul cat /opt/Mini/scripts/update-live.sh) --rollback         # 서울 central → 한반도 → 도쿄 닛폰 `reset-world.sh --rollback`(`:prev` 가 없거나 이미 그것이면 할 일 0)
#     → 도쿄 코드 트리 = 돌아간 닛폰 이미지의 커밋(`SYNC_COMMIT=<커밋> sync-tokyo` · 서울 `git reset` 은 안 한다 — 서울 HEAD 는 기록만)
#     → 스탬프: 돌아간 호스트의 스탬프를 그 이미지 커밋으로(모르면 지운다 — 다음 갱신이 전부 한다) → 관측 셋 → live-lag 판정.
#   ★[T919] 되돌리기는 **이미지만** — DB 는 안 건드린다. 대신 "이 갱신 앞 스냅샷" 자리(대상마다 라벨 `update-live` 인 가장 새 사본 · 시각 · 갱신 커밋)와
#     되놓기 줄(T907 `backup-live.sh <대상> --restore <그 폴더>` — 재민이 고르는 별도 줄)을 같이 찍는다(`--dry` 도).
#   ⚠`:prev` 는 한 칸이다 — 되돌린 뒤 다시 되돌리면 할 일 0(더 앞으로 가지 않는다). 다시 앞으로 가려면 갱신 한 줄(스탬프가 지워졌으면 전부 다시 굽는다).
#
# 별칭 · 자리: `seoul` · `tokyo`(맥 `~/.ssh/config` — T878) · 다른 이름이면 SYNC_SEOUL= · SYNC_TOKYO= · 코드 자리 SYNC_SEOUL_DIR · SYNC_TOKYO_DIR(기본 /opt/Mini 둘 —
#   sync-tokyo · live-lag 와 같은 env 를 넘긴다). 도쿄 스탬프 자리 TOKYO_STAMP(기본 /srv/durango/deployed-nippon.sha) · 서울 SEOUL_STAMP(기본 /srv/durango/deployed-hanbando.sha — 되돌리기 · ⓪ 라벨이 읽는다).
# ★새 수 0 · 제품 0 · 비밀 값 화면 · 파일 0(T887 규약 — 도쿄 비밀은 도쿄 셸 env 로만 · 맥으로 오는 것은 이름 · 수 · 판정뿐).
set -uo pipefail

S="${SYNC_SEOUL:-seoul}"; T="${SYNC_TOKYO:-tokyo}"
SD="${SYNC_SEOUL_DIR:-/opt/Mini}"; TD="${SYNC_TOKYO_DIR:-/opt/Mini}"
TSTAMP="${TOKYO_STAMP:-/srv/durango/deployed-nippon.sha}"; SSTAMP="${SEOUL_STAMP:-/srv/durango/deployed-hanbando.sha}"   # [T919] 서울 스탬프 자리도 env(하네스 · 종전 값 그대로)
DRY=0; RB=0
for a in "$@"; do case "$a" in --dry) DRY=1 ;; --rollback) RB=1 ;; *) sed -n '2,39p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 2 ;; esac; done
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
# ★[T1048] 경계 확인 — 서울 한반도 존이 다른 호스트(도쿄) 이웃 존에 닿나. 읽기만 · env **값** 0 · 비밀 0 · 쓰기 라우트 0(GET /health 만).
#   재민 11-01 "닛폰(으)로 못 넘어간다 — 저쪽 서버가 연결을 받지 않는다" = 한반도 env 에서 `ZONE_HOST_NIPPON` 이 빠져 `ZONE_HOSTS[nippon]`(서울):3021 로 간 ECONNREFUSED.
#   env 를 옮겨 싣는 재배포(redeploy-hanbando · reset-world)는 빠진 줄을 되살리지도 않는다 ⇒ 갱신 끝마다 이 줄이 본다.
#   주소는 존 정본(`server/zone-config.js` `hostFromEnv` — ZONE_HOST_<ID> > ZONE_HOSTS > PUBLIC_HOST > localhost)에게 **존 컨테이너 안에서** 묻는다(사본 0 · 존 프로세스와 같은 길).
#   찍는 것: 키 있음/없음 · 주소가 도쿄 ssh 주소와 같은가(값 0) · 포트 · /health 코드 또는 오류 이름(ECONNREFUSED · ETIMEDOUT …) · ms.
xhost_check() {
  local ids ta
  ids="$(ssh -n "$T" "docker ps -a --format '{{.Names}}'" 2>/dev/null | sed -n 's/^durango-zone-//p' | tr '\n' ' ')"
  [ -n "${ids// /}" ] || ids=nippon
  ta="$(ssh -G "$T" 2>/dev/null | awk '$1=="hostname"{print $2; exit}')"
  ssh "$S" bash -s -- "${ta:--}" $ids <<'XHOST'
ta="$1"; shift; [ "$ta" = - ] && ta=""
C=durango-zone-hanbando; bad=0
JS='const [id,ta]=process.argv.slice(1);let Z;try{Z=require("./server/zone-config.js").ZONES}catch(e){console.log("no 존 표를 못 읽었다");process.exit(0)}
const t=Z[id];if(!t){console.log("no 이 존 표(ENABLED_ZONES)에 "+id+" 없음");process.exit(0)}
const same=ta?(t.host===ta?"주소 = 도쿄 ssh 주소":"주소 ≠ 도쿄 ssh 주소"):"도쿄 ssh 주소 모름";const t0=Date.now();
const q=require("http").get({host:t.host,port:t.port,path:"/health",timeout:5000},(r)=>{r.resume();console.log((r.statusCode===200?"ok ":"no ")+same+" · :"+t.port+"/health "+r.statusCode+" · "+(Date.now()-t0)+"ms")});
q.on("timeout",()=>q.destroy(Object.assign(new Error("timeout"),{code:"ETIMEDOUT"})));q.on("error",(e)=>console.log("no "+same+" · :"+t.port+" "+(e.code||e.message)+" · "+(Date.now()-t0)+"ms"));'
for id in "$@"; do
  K="ZONE_HOST_$(printf %s "$id" | tr '[:lower:]' '[:upper:]')"
  n="$(docker inspect "$C" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep -c "^$K=" || true)"
  r="$(docker exec "$C" node -e "$JS" "$id" "$ta" 2>&1 | tail -1)"
  case "$r" in "ok "*) st=ok; d="${r#ok }" ;; "no "*) st=no; d="${r#no }" ;; *) st=no; d="존 안에서 못 물었다: $(printf %s "$r" | cut -c1-100)" ;; esac
  if [ "${n:-0}" -ge 1 ]; then kp="env $K 있음"; else kp="env $K 없음"; fi
  if [ "${n:-0}" -ge 1 ] && [ "$st" = ok ]; then echo "✓ 경계 서울 한반도 → $id: $kp · $d"; else echo "✗ 경계 서울 한반도 → $id: $kp · $d"; bad=1; fi
done
exit $bad
XHOST
}
tokyo_old() { ssh -n "$T" "docker inspect durango-zone-nippon --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | awk -F= 'NF{n=n (n?\" \":\"\") \$1} /^PLAYER_CAP=/{c=substr(\$0,12)} /^CENTRAL_HOST=/{h=substr(\$0,14)} END{printf \"cap=%s host=%s names=%s\n\", c, h, n}'"; }

say "== update-live $(date '+%Y-%m-%d %H:%M:%S') — 서울($S:$SD) → 도쿄($T:$TD)$([ "$DRY" = 1 ] && echo ' · 예행(라이브 무변)') =="
SH0="$(ssh -n "$S" "cd $SD && git rev-parse HEAD")" || stop "서울($S)에 못 붙었다" "전부"
TH0="$(ssh -n "$T" "cd $TD 2>/dev/null && git rev-parse HEAD 2>/dev/null" || true)"
TST="$(ssh -n "$T" "cat $TSTAMP 2>/dev/null" | tr -d ' \r\n' || true)"
OLD="$(tokyo_old || true)"
say "  서울 HEAD ${SH0:0:12} · 도쿄 HEAD ${TH0:0:12} · 도쿄 스탬프 ${TST:0:12}$([ -z "$TST" ] && echo '(없음 — 도쿄는 전부 한다)') · 도쿄 옛 존 정원 $(echo "$OLD" | sed -n 's/.*cap=\([^ ]*\).*/\1/p') · central $(echo "$OLD" | sed -n 's/.*host=\([^ ]*\).*/\1/p')"

# ── ⓪ [T919] 갱신 앞 — 디스크 판정 → 스냅샷 ─────────────────────────────────────────────────────────
#   서울 판의 스크립트를 쓴다(맥 한 줄 꼴 — 도쿄 트리가 옛 판이어도 같은 판) · 비밀 0(값을 안 옮긴다)
backup_on() {   # backup_on <호스트> <라벨> [--dry] — 서울 판 backup-live.sh 를 그 호스트 bash 에 흘린다
  ssh -n "$S" cat "$SD/scripts/backup-live.sh" | ssh "$1" "BACKUP_LABEL='$2' bash -s -- ${3:-}"
}
last_on() {   # last_on <호스트> <대상> — 그 대상의 가장 새 "갱신 앞" 사본 `폴더<탭>시각<탭>라벨`
  ssh -n "$S" cat "$SD/scripts/backup-live.sh" | ssh "$1" "bash -s -- --last $2 update-live"
}
disk_gate() {   # 두 호스트 판정 — 끝 줄이 "두 호스트 모두" 가 아니면 rc 1 · 찍을 줄은 DGL
  local out; out="$(bash <(ssh -n "$S" cat "$SD/scripts/disk-check.sh") 2>&1)"
  DGL="$(echo "$out" | awk '/^\[/{h=$1} /^  판정: /{sub(/^  판정: /,""); print h " " $0} /\] ✗ /{print}')"
  DGV="$(echo "$out" | sed -n 's/^판정: //p' | tail -1)"
  [ "$DGV" = '두 호스트 모두 빈 자리 ≥ 백업 한 벌' ]
}
if [ "$RB" = 0 ]; then
  P0S="$(plan_of 2>&1)"; P0TP="$(plan_of "$TST" 2>&1)"
  P0C="$(echo "$P0S" | sed -n 's/^PLAN central=\([01]\).*/\1/p' | tail -1)"; P0Z="$(echo "$P0S" | zone_of)"; P0T="$(echo "$P0TP" | zone_of)"
  P0A="$(echo "$P0S" | sed -n 's/^PLAN .*after=\([0-9a-f]*\).*/\1/p' | tail -1)"
  { [ -n "$P0C" ] && [ -n "$P0Z" ] && [ -n "$P0T" ] && [ -n "$P0A" ]; } || { echo "$P0S" | tail -3 | ind; stop "갱신 앞 판정(redeploy-hanbando.sh --dry)을 못 읽었다" "디스크 · 스냅샷 · 갱신 전부"; }
  #   라벨 = `update-live <그 호스트에 지금 배포된 커밋(스탬프 · 모르면 -)> <이 갱신이 받을 판>` — 되돌리기가 "이 갱신 앞" 을 이 두 칸으로 찾는다
  SST="$(ssh -n "$S" "cat $SSTAMP 2>/dev/null" | tr -d ' \r\n' || true)"
  LABEL_S="update-live ${SST:--} ${P0A}"; LABEL_T="update-live ${TST:--} ${P0A}"
  SNAP_S=0; SNAP_T=0; [ "$P0C$P0Z" != 00 ] && SNAP_S=1; [ "$P0T" = 1 ] && SNAP_T=1
  if disk_gate; then DOK=1; else DOK=0; fi
  say "[⓪ 디스크] $([ "$DOK" = 1 ] && echo ok || echo '✗') — ${DGV:-판정 줄 없음}"; echo "$DGL" | ind
  if [ "$DRY" = 1 ]; then
    if [ "$SNAP_S$SNAP_T" = 00 ]; then say "[⓪ 스냅샷] 안 뜬다 — 바꿀 것 0(갱신이 DB 를 새 코드로 열지 않는다 · ②-고정과 같은 판정)"
    else
      say "[⓪ 스냅샷] 갱신 ${SST:0:12}${SST:+(서울 스탬프)} · ${TST:0:12}${TST:+(도쿄 스탬프)} → ${P0A:0:12} — $([ "$DOK" = 1 ] || echo '(디스크 ✗ — 실제 판은 여기서 멈춘다) ')뜰 자리:"
      [ "$SNAP_S" = 1 ] && backup_on "$S" "$LABEL_S" --dry 2>&1 | sed '1s/^/서울 /' | ind
      [ "$SNAP_T" = 1 ] && backup_on "$T" "$LABEL_T" --dry 2>&1 | sed '1s/^/도쿄 /' | ind
      [ "$SNAP_S" = 0 ] && say "    서울 — 안 뜬다(central · 한반도 안 바뀜)"; [ "$SNAP_T" = 0 ] && say "    도쿄 — 안 뜬다(닛폰 안 바뀜)"
    fi
  else
    [ "$DOK" = 1 ] || stop "디스크 ✗(위 [⓪ 디스크] 줄) — 갱신 앞 스냅샷이 들어갈 자리를 못 믿는다(\`disk-check.sh --prune\` 뒤 다시 · 절차서 §8)" "스냅샷 · 갱신 전부"
    if [ "$SNAP_S$SNAP_T" = 00 ]; then say "[⓪ 스냅샷] 안 뜬다 — 바꿀 것 0(②-고정과 같은 판정)"
    else
      say "[⓪ 스냅샷] 갱신 앞 사본 — 라벨 서울 '$LABEL_S' · 도쿄 '$LABEL_T'"
      for x in "$S 서울 $SNAP_S S" "$T 도쿄 $SNAP_T T"; do set -- $x
        lb="$([ "$4" = S ] && echo "$LABEL_S" || echo "$LABEL_T")"
        [ "$3" = 1 ] || { say "    $2 — 안 뜬다(이 갱신이 다시 띄울 대상이 없다)"; continue; }
        backup_on "$1" "$lb" > "$TMP/snap-$2" 2>&1; rc=$?
        sed "1s/^/$2 /" "$TMP/snap-$2" | ind
        [ "$rc" = 0 ] || stop "$2 갱신 앞 스냅샷(backup-live rc $rc)" "갱신 전부"
        did "$2 스냅샷 $(grep -c '^  ✓ ' "$TMP/snap-$2")벌"
      done
    fi
  fi
fi

if [ "$DRY" = 1 ] && [ "$RB" = 0 ]; then
  say "[예행 ②] 서울 판정(redeploy-hanbando.sh --dry — 받을 판 기준)"
  echo "$P0S" | ind
  say "[예행 ②] 도쿄 판정(같은 규칙 · 도쿄 스탬프 기준)"
  TP="$P0TP"; echo "$TP" | grep -E '^\[판정\]|^PLAN' | ind
  [ "$(echo "$TP" | zone_of)" = 1 ] && say "    → 도쿄 존: 빌드 · 재생성 한다" || say "    → 도쿄 존: 건너뛴다(존이 쓰는 파일이 안 바뀌었다)"
  say "[예행 ③] 도쿄 옛 존 env 이름(값 0): $(echo "$OLD" | sed -n 's/.*names=//p')"
  say "[예행 ④] sync-tokyo --dry(서울 지금 HEAD 기준 — 실제 판은 ① 뒤 HEAD)"
  bash <(ssh -n "$S" cat "$SD/scripts/sync-tokyo.sh") --dry 2>&1 | ind
  say "[예행 ⑦] 지금 렉 판정(읽기만)"
  bash <(ssh -n "$S" cat "$SD/scripts/live-lag.sh") 2>&1 | tail -1 | ind
  say "[예행 ⑧] 경계 — 서울 한반도 → 도쿄 존(읽기만 · env 값 0 · 실제 판은 ✗ 면 끝에서 멈춘다)"
  xhost_check 2>&1 | ind
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
  #   ★[T919] 이 갱신 앞 스냅샷 자리 — 찍기만(DB 무접촉). 되놓기는 재민이 고르는 별도 줄(T907 · 절차서 §3 11)
  say "[되돌리기 · 갱신 앞 스냅샷] DB 는 안 건드린다 — 라이브 DB 도 되돌릴 때만 아래 줄(대상마다 · 재민이 고른다):"
  for x in "$S central durango-central 서울" "$S hanbando durango-zone-hanbando 서울" "$T nippon durango-zone-nippon 도쿄"; do set -- $x
    l="$(last_on "$1" "$2" 2>/dev/null)"
    if [ -z "$l" ]; then say "    $4 $2 — 갱신 앞 사본 없음(라벨 update-live · T919 앞 갱신이거나 그 갱신이 이 대상을 안 바꿨다)"; continue; fi
    d="$(echo "$l" | cut -f1)"; at="$(echo "$l" | cut -f2)"; to="$(echo "$l" | cut -f3 | awk '{print $3}')"; fr="$(echo "$l" | cut -f3 | awk '{print $2}')"
    c="$(img_commit "$1" "$3")"
    if [ -n "$c" ] && [ "$c" = "$to" ]; then m=" = 지금 이미지 커밋(이 갱신)"; elif [ -n "$c" ]; then m=" · 지금 이미지 커밋 ${c:0:12}(그 갱신 커밋과 다르다 — 그 갱신이 이 대상 이미지를 안 바꿨거나 그 뒤 판)"; else m=" · 지금 이미지 커밋 라벨 없음"; fi
    say "    $4 $2 — $d · $at · 갱신 ${fr:0:12} → ${to:0:12}$m"
    say "      ssh -t $1 'cd $([ "$4" = 도쿄 ] && echo "$TD" || echo "$SD") && bash scripts/backup-live.sh $2 --restore $d'  # 답: $2"
  done
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
    if [ -n "$a" ] && [ "$a" = "$b" ]; then ssh -n "$S" "echo $a > $SSTAMP" && did "서울 스탬프 ${a:0:12}"
    else ssh -n "$S" "rm -f $SSTAMP" && did "서울 스탬프 지움(central ${a:0:12} · 한반도 ${b:0:12} — 다음 갱신은 전부)"; fi
  fi
  if [ "$TRB" = 1 ]; then
    if [ -n "$TC" ]; then ssh -n "$T" "echo $TC > $TSTAMP" && did "도쿄 스탬프 ${TC:0:12}"; else ssh -n "$T" "rm -f $TSTAMP" && did "도쿄 스탬프 지움"; fi
  fi
  say "[되돌리기 ⑦] live-lag"
  bash <(ssh -n "$S" cat "$SD/scripts/live-lag.sh") > "$TMP/lag" 2>&1
  sed -n '2,$p' "$TMP/lag" | ind
  say "  ✓ 되돌림 끝 — 바뀐 것: ${DONE:-없음(되돌릴 것 0)} · 서울 코드 HEAD $(ssh -n "$S" "cd $SD && git rev-parse --short=12 HEAD")(그대로 — 기록만) · DB 그대로(되놓기 줄은 위 [갱신 앞 스냅샷])"
  exit 0
fi

# ① 서울 코드 받기
say "[①] 서울 git pull --ff-only"
SH1="$(ssh -n "$S" "cd $SD && git pull --ff-only -q && git rev-parse HEAD")" || stop "서울 git pull" "서울 재배포 · 도쿄 전부"
[ "$SH1" != "$SH0" ] && did "서울 코드 ${SH0:0:12} → ${SH1:0:12}"
say "    ${SH0:0:12} → ${SH1:0:12} · $(ssh -n "$S" "cd $SD && git log --oneline --abbrev=12 -1" | cut -c1-90)"
#   ★[T919] ⓪ 의 판정 · 스냅샷 라벨은 받을 판 ${P0A:0:12} 기준이었다 — 그 사이 main 이 움직였으면 사본 라벨 · 뜬 호스트가 이 갱신과 어긋난다 ⇒ 멈춘다(다시 치면 ⓪ 부터 새 판)
[ "$SH1" = "$P0A" ] || stop "받은 판 ${SH1:0:12} ≠ ⓪ 판정 · 스냅샷 라벨의 판 ${P0A:0:12}(그 사이 main 이 움직였다 — 한 번 더 치면 ⓪ 부터 새 판)" "서울 재배포 · 도쿄 전부"

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
  #   ★[T901 마른 연습이 잡음] 고칠 수 있나를 **먼저** 다 본다 — 고정할 대상의 도는 이미지가 저장소에 있어야 한다. 하나라도 없으면 아무 태그도 안 건드리고 멈춘다
  #     (종전: central 고정본을 먼저 뗀 뒤 한반도 고정이 ✗ 로 멈춰 "바뀐 것: 없음" 이라 찍고도 되돌리기 한 칸을 잃었다).
  for x in "central $SC durango-central" "hanbando $SZ durango-zone-hanbando"; do set -- $x
    [ "$2" = 1 ] || continue
    ssh -n "$S" "docker image inspect \$(docker inspect $3 --format '{{.Image}}') >/dev/null 2>&1" \
      || stop "서울 $1 고정 못 함 — 도는 컨테이너의 이미지가 저장소에 없다(고정할 것이 없다 · 태그 무변)" "서울 재배포 · 도쿄 전부"
  done
  for x in "central $SC" "hanbando $SZ"; do set -- $x   # 고정 먼저 · 떼기 나중
    [ "$2" = 1 ] || continue
    out="$(ssh -n "$S" "cd $SD && bash scripts/reset-world.sh $1 --pin-prev" 2>&1)"; rc=$?
    echo "$out" | grep -vE '^== ' | ind
    [ "$rc" = 0 ] || stop "서울 $1 고정(rc $rc)" "서울 재배포 · 도쿄 전부"
    did "서울 $1 :prev-$1 고정"
  done
  for x in "central $SC" "hanbando $SZ"; do set -- $x
    [ "$2" = 0 ] || continue
    out="$(ssh -n "$S" "cd $SD && bash scripts/reset-world.sh $1 --drop-prev" 2>&1)"; rc=$?
    echo "$out" | grep -vE '^== ' | ind
    [ "$rc" = 0 ] || stop "서울 $1 고정 떼기(rc $rc)" "서울 재배포 · 도쿄 전부"
    echo "$out" | grep -q '를 뗐다' && did "서울 $1 :prev-$1 뗌"
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
  [ "$TZ" = 1 ] && did "도쿄 nippon :prev-nippon 고정" || { echo "$out" | grep -q '를 뗐다' && did "도쿄 nippon :prev-nippon 뗌"; }
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
env ${CAP:+PLAYER_CAP=$CAP} CENTRAL_IP="$CIP" RUN_ZONES=nippon EXTRA_ENV="CHAR_SPRITE=on T565_MAP_LIVE=0" bash scripts/redeploy-light.sh | grep -E '^\[light\]|\[이어 싣기\]|\[up\]|\[ready\]|\[FAIL\]|\[timeout\]|=== 완료' | sed 's/\r//'
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

# ⑧ ★[T1048] 경계 — 서울 한반도 → 도쿄 존(읽기만 · env 값 0). ✗ 면 멈춘다(갱신은 끝났다 · 넘기만 막혀 있다)
say "[⑧] 경계 — 서울 한반도 → 도쿄 존(env 키 있음 · 존 안에서 /health 닿음)"
XL="$(xhost_check 2>&1)"; xrc=$?
echo "$XL" | ind
[ "$xrc" = 0 ] || stop "경계 ✗(위 [⑧] 줄) — 한반도가 도쿄 존에 못 넘긴다(사람 눈엔 '…(으)로 못 넘어간다 — <까닭>')" "없음 — 갱신은 다 됐다 · 남은 것은 서울 한반도 env 키 · 도쿄 포트(보고/T1048 §5 재민 손)"
say "  ✓ 끝 — 서울 ${SH1:0:12} · 도쿄 ${TH1:0:12} · 바뀐 것: ${DONE:-없음(이미 최신)}"
