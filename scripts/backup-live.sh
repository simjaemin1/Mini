#!/usr/bin/env bash
# === scripts/backup-live.sh — 라이브 DB 매일 스냅샷 · 복원 (T907 · 2026-10-24) ===============================================
#
# ★왜: 10-23 초기화로 라이브가 새 세계다. 백업은 초기화 때 한 벌(`/srv/durango/_reset/20261023-*`)뿐 — 그 뒤 세계는 스냅샷이 없다.
#   결함 · 디스크 · 실수로 DB 가 깨지면 되돌릴 데가 없다 ⇒ 하루 한 번, **도는 컨테이너를 멈추지 않고** 일관 사본을 남긴다.
#
# 호스트에서(서울 · 도쿄 · /opt/Mini · root):
#   bash scripts/backup-live.sh                    스냅샷 — 이 호스트에서 도는 durango 컨테이너(central · 존)마다 DB 를 SQLite 온라인 백업으로
#                                                  `${BACKUP_DAILY_ROOT:-/srv/durango/_daily}/<UTC시각>-<대상>/` 에 → 사본 `PRAGMA quick_check` · 표마다 행 수 ·
#                                                  sha256(SHA256SUMS) · meta.txt(비밀 아닌 칸만) → 대상마다 새것 BACKUP_KEEP 벌(기본 7 — 임시 · 회부)만 남기고 옛것은 지운다
#   bash scripts/backup-live.sh --list             스냅샷 목록(대상 · 시각 · 크기 · 행 수 요약)
#   bash scripts/backup-live.sh --install HH:MM    이 호스트 root crontab 에 하루 한 번(호스트 시계 — 보통 UTC) · 이미 있으면 바꾼다 · 표 `# durango-backup-live`
#   bash scripts/backup-live.sh --uninstall        그 줄을 뺀다
#   bash scripts/backup-live.sh --status           crontab 의 그 줄 · 마지막 스냅샷 · 기록(backup.log) 끝 몇 줄
#   bash scripts/backup-live.sh <대상> --restore <스냅샷 폴더>   복원 — 대상 이름을 쳐야 → 컨테이너 멈춤(SIGTERM · 존은 저장하고 내린다)
#                                                  → 지금 DB 파일을 `<스냅샷 뿌리>/<UTC시각>-<대상>-replaced/` 로 옮기고(**안 지운다**) → 사본을 놓고 sha256 확인
#                                                  → 같은 컨테이너를 다시 켠다(같은 이미지 · 같은 env · 같은 볼륨) → /health
#
# ★온라인 백업 = node:sqlite `backup()`(SQLite 온라인 백업 API — 쓰는 중이어도 한 시점의 일관 사본) · 그 대상 컨테이너의 이미지 안 node 로 돈다
#   (호스트에 sqlite3 · node 가 없어도 된다 · `reset-world.sh` 의 손발과 같은 꼴 — 이미지 · 볼륨만 빌린다 · 망 끔).
# ★비밀 0 — 컨테이너 env 는 `DB_PATH` 한 칸만 읽는다(값을 찍는 것은 그 경로뿐). 새 수: 보관 개수 7 은 카드의 임시 값(기존 계측 판 값 없음 — 회부).
set -uo pipefail
umask 077
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${BACKUP_DAILY_ROOT:-/srv/durango/_daily}"
KEEP="${BACKUP_KEEP:-7}"
TAG='# durango-backup-live'
say() { echo "$*"; }
die() { echo "  ✗ $*" >&2; exit 1; }
H() { awk -v b="${1:-0}" 'BEGIN{ split("B KB MB GB TB",u," "); i=1; while (b>=1024 && i<5) { b/=1024; i++ } printf (i==1 ? "%d %s" : "%.1f %s"), b, u[i] }'; }
targets() { local n; n="$(docker ps --format '{{.Names}}' | grep -E '^durango-(central|zone-.+)$' | sort)"
  #   마른 연습 흉내(한 상자에 두 호스트)만 — 흉내 판이 이 호스트 몫 이름을 env 로 준다(live-lag.sh 와 같은 칸 · 라이브 ssh 는 이 env 를 안 싣는다)
  if [ -n "${LAG_NAMES:-}" ]; then n="$(for x in $n; do case " $LAG_NAMES " in *" $x "*) echo "$x" ;; esac; done)"; fi
  [ -n "$n" ] && printf '%s\n' "$n"; }
tname() { case "$1" in durango-central) echo central ;; durango-zone-*) echo "${1#durango-zone-}" ;; esac; }
cname() { [ "$1" = central ] && echo durango-central || echo "durango-zone-$1"; }
vol_of() { docker inspect "$1" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}'; }
db_of() { local v; v="$(docker inspect "$1" --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^DB_PATH=//p' | head -1)"; echo "${v:-/data/world.db}"; }

# 이미지 안 node 가 도는 손발 — 온라인 백업 · 검사 · 행 수(출력 JSON 한 줄)
read -r -d '' JS <<'JS'
'use strict';
const { DatabaseSync, backup } = require('node:sqlite'); const fs = require('fs');
const [mode, src, dst] = process.argv.slice(2);
const facts = (file) => { const d = new DatabaseSync(file, { readOnly: true }); try {
    const qc = d.prepare('PRAGMA quick_check').all().map((r) => Object.values(r)[0]).join(',');
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    const rows = {}; for (const t of tables) rows[t] = d.prepare(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`).get().n;
    return { quick: qc, tables: tables.length, rows, total: Object.values(rows).reduce((a, b) => a + b, 0) };
  } finally { d.close(); } };
(async () => {
  if (mode === 'backup') {
    const t0 = Date.now(); const s = new DatabaseSync(src, { readOnly: true });
    //   rate -1 = 한 걸음에 다 — 한 읽기 거래 안에서 베낀다(WAL: 쓰는 쪽은 안 막힌다). 기본 100쪽씩이면 다른 연결이 쓸 때마다 처음부터 다시라 쓰기가 안 멎으면 안 끝난다(T907 판)
    try { await backup(s, dst, { rate: -1 }); } finally { s.close(); }
    const f = facts(dst); f.ms = Date.now() - t0; f.bytes = fs.statSync(dst).size;
    process.stdout.write(JSON.stringify(f) + '\n');
  } else if (mode === 'facts') process.stdout.write(JSON.stringify(facts(src)) + '\n');
  else { console.error('mode?'); process.exit(2); }
})().catch((e) => { console.error(String(e && e.message || e)); process.exit(1); });
JS
jsrun() {   # jsrun <이미지> <볼륨> <밖 폴더> <인자…> — 볼륨은 /data · 밖 폴더는 /out
  local img=$1 vol=$2 out=$3; shift 3
  printf '%s\n' "$JS" | docker run --rm -i --network none -v "$vol:/data" -v "$out:/out" "$img" node --no-warnings --experimental-sqlite - "$@"
}

snapshot_one() {   # snapshot_one <컨테이너>
  local c=$1 t img vol db base ts dir out f
  t="$(tname "$c")"; img="$(docker inspect "$c" --format '{{.Image}}')"; vol="$(vol_of "$c")"; db="$(db_of "$c")"
  [ -n "$vol" ] || { say "  ✗ $c — /data 볼륨 없음(건너뜀)"; return 1; }
  case "$db" in /data/*) ;; *) say "  ✗ $c — DB_PATH 가 /data 밖($db · 건너뜀)"; return 1 ;; esac
  base="${db#/data/}"
  ts="$(date -u +%Y%m%d-%H%M%S)"; dir="$ROOT/$ts-$t"; local seq=1; while [ -e "$dir" ]; do seq=$((seq + 1)); dir="$ROOT/$ts.$seq-$t"; done
  mkdir -p "$dir" || { say "  ✗ $c — 자리를 못 만든다($dir)"; return 1; }
  #   손발 이미지 = 그 컨테이너의 이미지(같은 node · 같은 SQLite) · 저장소에서 지워졌으면(containerd — 빌드가 태그를 옮긴 판) 같은 이름의 지금 태그
  local himg="$img"; docker image inspect "$himg" >/dev/null 2>&1 || himg="$([ "$t" = central ] && echo durango-central || echo durango-zone)"
  out="$(jsrun "$himg" "$vol" "$dir" backup "/data/$base" "/out/$base" 2>"$dir/err.txt")" || { say "  ✗ $c — 백업 실패: $(tail -1 "$dir/err.txt")"; rm -rf "$dir"; return 1; }
  rm -f "$dir/err.txt"
  #   사본을 읽기만 연 검사가 옆에 남긴 빈 -wal · -shm(사본 머리가 WAL 이라) — 비었으면 뗀다(사본 = .db 한 파일 · sha 가 그 하나)
  [ -s "$dir/$base-wal" ] || rm -f "$dir/$base-wal" "$dir/$base-shm"
  ( cd "$dir" && sha256sum "$base" > SHA256SUMS )
  {
    echo "target=$t"; echo "container=$c"; echo "image_id=$img"; echo "image_commit=$(docker image inspect "$img" --format '{{index .Config.Labels "durango.commit"}}' 2>/dev/null)"
    echo "volume=$vol"; echo "db=$base"; echo "taken_at=$(date -u +%FT%TZ)"; echo "facts=$out"
  } > "$dir/meta.txt"
  local q n tb ms; q="$(echo "$out" | sed -n 's/.*"quick":"\([^"]*\)".*/\1/p')"; n="$(echo "$out" | sed -n 's/.*"total":\([0-9]*\).*/\1/p')"
  tb="$(echo "$out" | sed -n 's/.*"tables":\([0-9]*\).*/\1/p')"; ms="$(echo "$out" | sed -n 's/.*"ms":\([0-9]*\).*/\1/p')"
  [ "$q" = ok ] || { say "  ✗ $c — 사본 검사 $q(사본은 남긴다 · $dir)"; return 1; }
  say "  ✓ $t → $dir · $(H "$(stat -c %s "$dir/$base")") · 검사 ok · 표 $tb · 행 $n · ${ms}ms · sha $(cut -c1-12 "$dir/SHA256SUMS")"
  # 보관 — 이 대상의 스냅샷(뒤에 붙은 -replaced 는 셈 밖)을 새것 KEEP 벌만
  local all k=0 d; all="$(ls -1d "$ROOT"/*-"$t" 2>/dev/null | sort -r)"
  for d in $all; do k=$((k + 1)); [ "$k" -le "$KEEP" ] && continue; rm -rf -- "$d" && say "    · 보관 $KEEP 벌 넘음 — 지움 $(basename "$d")"; done
}

MODE=snap; TARGET=""; RDIR=""
case "${1:-}" in
  "") ;;
  --list) MODE=list ;;
  --install) MODE=install; AT="${2:-}" ;;
  --uninstall) MODE=uninstall ;;
  --status) MODE=status ;;
  -h|--help) sed -n '2,21p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) TARGET="$1"; [ "${2:-}" = --restore ] || die "모르는 인자: $*  (bash scripts/backup-live.sh --help)"; MODE=restore; RDIR="${3:-}" ;;
esac

case "$MODE" in
snap)
  say "== 스냅샷 $(date -u +%FT%TZ) — $(hostname) · 자리 $ROOT · 보관 $KEEP 벌 =="
  mkdir -p "$ROOT" || die "자리를 못 만든다: $ROOT"
  T="$(targets)"; [ -n "$T" ] || die "도는 durango 컨테이너가 없다"
  rc=0; for c in $T; do snapshot_one "$c" || rc=1; done
  say "  스냅샷 합 $(H "$(du -sb "$ROOT" 2>/dev/null | cut -f1)") · $(ls -1d "$ROOT"/*/ 2>/dev/null | wc -l)벌"
  exit $rc ;;
list)
  for d in $(ls -1d "$ROOT"/*/ 2>/dev/null | sort); do
    m="$d/meta.txt"; [ -f "$m" ] || { say "  $(basename "$d") $(H "$(du -sb "$d" | cut -f1)")"; continue; }
    say "  $(basename "$d") · $(H "$(du -sb "$d" | cut -f1)") · 행 $(sed -n 's/^facts=.*"total":\([0-9]*\).*/\1/p' "$m") · 커밋 $(sed -n 's/^image_commit=//p' "$m" | cut -c1-12)"
  done ;;
install)
  command -v crontab >/dev/null 2>&1 || die "crontab 이 없다(이 호스트에 cron 을 먼저 — apt-get install -y cron)"
  [[ "$AT" =~ ^([01][0-9]|2[0-3]):([0-5][0-9])$ ]] || die "--install HH:MM(호스트 시계 · 예 19:17)"
  hh="${BASH_REMATCH[1]#0}"; mm="${BASH_REMATCH[2]#0}"
  line="$mm $hh * * * cd $(cd "$HERE/.." && pwd) && bash scripts/backup-live.sh >> $ROOT/backup.log 2>&1 $TAG"
  #   지금 줄을 먼저 다 읽고 쓴다(읽는 중에 쓰기가 같은 파일을 비우는 판 0) · 남의 줄은 그대로
  cur="$(crontab -l 2>/dev/null | grep -vF "$TAG")"
  { if [ -n "$cur" ]; then printf '%s\n' "$cur"; fi; echo "$line"; } | crontab - || die "crontab 을 못 썼다"
  mkdir -p "$ROOT"
  say "  ✓ 설치 — $(crontab -l | grep -F "$TAG") · 호스트 시계 $(date +%Z)" ;;
uninstall)
  cur="$(crontab -l 2>/dev/null | grep -vF "$TAG")"
  { if [ -n "$cur" ]; then printf '%s\n' "$cur"; fi; } | crontab - || die "crontab 을 못 썼다"
  say "  ✓ 뺐다 — 남은 durango-backup-live 줄 $(crontab -l 2>/dev/null | grep -cF "$TAG")개" ;;
status)
  say "  crontab: $(crontab -l 2>/dev/null | grep -F "$TAG" || echo '(없음)')"
  say "  마지막 스냅샷: $(ls -1d "$ROOT"/*/ 2>/dev/null | grep -v -- '-replaced/$' | sort | tail -3 | xargs -r -n1 basename | paste -sd' ' -)"
  lg="(없음)"; [ -s "$ROOT/backup.log" ] && lg="$(tail -3 "$ROOT/backup.log" | paste -sd'|' -)"
  say "  기록 끝: $lg" ;;
restore)
  C="$(cname "$TARGET")"; docker inspect "$C" >/dev/null 2>&1 || die "컨테이너 $C 가 없다"
  [ -f "$RDIR/meta.txt" ] && [ -f "$RDIR/SHA256SUMS" ] || die "스냅샷 폴더가 아니다(meta.txt · SHA256SUMS 없음): $RDIR"
  grep -qx "target=$TARGET" "$RDIR/meta.txt" || die "이 스냅샷은 $TARGET 것이 아니다($(grep '^target=' "$RDIR/meta.txt"))"
  ( cd "$RDIR" && sha256sum -c --quiet SHA256SUMS ) || die "스냅샷이 SHA256SUMS 와 다르다 — 복원하지 않는다"
  VOL="$(vol_of "$C")"; DB="$(db_of "$C")"; BASE="${DB#/data/}"
  [ "$(sed -n 's/^db=//p' "$RDIR/meta.txt")" = "$BASE" ] || die "스냅샷 DB 이름이 지금 DB_PATH 와 다르다"
  PORT="$(docker inspect "$C" --format '{{range $p, $b := .HostConfig.PortBindings}}{{(index $b 0).HostPort}}{{end}}')"
  say "== 복원 — $TARGET ← $(basename "$RDIR") =="
  say "  컨테이너 $C · 볼륨 $VOL · DB $BASE · 스냅샷 $(sed -n 's/^taken_at=//p' "$RDIR/meta.txt") · 행 $(sed -n 's/^facts=.*"total":\([0-9]*\).*/\1/p' "$RDIR/meta.txt")"
  printf '  복원한다(지금 DB 는 옆으로 옮긴다 · 안 지운다). 대상 이름을 그대로 쳐라(%s): ' "$TARGET"; a=""; IFS= read -r a || true; echo
  [ "$a" = "$TARGET" ] || die "그만뒀다 — 아무것도 안 바꿨다"
  docker stop -t 30 "$C" >/dev/null && say "  [멈춤] $C"
  R="$ROOT/$(date -u +%Y%m%d-%H%M%S)-$TARGET-replaced"; mkdir -p "$R"
  for s in "" -wal -shm -journal; do [ -e "$VOL/$BASE$s" ] && mv -- "$VOL/$BASE$s" "$R/"; done
  say "  [옮김] 지금 DB → $R ($(ls -1 "$R" | paste -sd' ' -))"
  cp -- "$RDIR/$BASE" "$VOL/$BASE"
  ( cd "$VOL" && sha256sum -c --quiet "$RDIR/SHA256SUMS" ) || die "놓은 사본의 sha256 이 다르다 — $C 는 멈춘 채(지금 DB 는 $R)"
  say "  [놓음 ✓] sha256 일치 $(cut -c1-12 "$RDIR/SHA256SUMS")"
  #   행 수 — 놓은 파일을 다시 열어(띄우기 앞 · 아무도 안 쓴다) 스냅샷 때 센 표마다 행 수와 견준다
  HIMG="$(docker inspect "$C" --format '{{.Image}}')"; docker image inspect "$HIMG" >/dev/null 2>&1 || HIMG="$([ "$TARGET" = central ] && echo durango-central || echo durango-zone)"
  NOW="$(jsrun "$HIMG" "$VOL" "$R" facts "/data/$BASE" 2>/dev/null | sed -n 's/.*"rows":\({[^}]*}\).*/\1/p')"; WAS="$(sed -n 's/^facts=.*"rows":\({[^}]*}\).*/\1/p' "$RDIR/meta.txt")"
  [ -n "$NOW" ] && [ "$NOW" = "$WAS" ] || die "놓은 사본의 표마다 행 수가 스냅샷과 다르다 — $C 는 멈춘 채(지금 DB 는 $R)"
  say "  [행 ✓] 표마다 행 수 = 스냅샷(합 $(sed -n 's/^facts=.*"total":\([0-9]*\).*/\1/p' "$RDIR/meta.txt"))"
  docker start "$C" >/dev/null && say "  [켬] $C(같은 이미지 · env · 볼륨)"
  for i in $(seq 1 900); do curl -sf -m 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && { say "  ✅ /health — ${i}초"; exit 0; }; sleep 1; done
  die "15분 안에 /health 가 안 떴다 — docker logs $C" ;;
esac
