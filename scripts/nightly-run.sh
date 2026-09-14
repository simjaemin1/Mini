#!/usr/bin/env bash
# ═══ scripts/nightly-run.sh — 한 번 띄우면 밤새 혼자 돈다 [T293 2026-09-14 · 재민 확정] ═══
#
# ★왜: 야간 세션(망고링고 04:00 KST)이 3시간 동안 청크마다 러너를 부르고 그 출력을 **대화에 쌓았다**.
#   통과 판정 · 빨강 단독 재실행 · 상시 목록 대조 · 보고 표 — 전부 모델이 했는데, 판단이 필요한
#   자리는 "상시 밖 빨강의 귀속 카드 찾기" 하나뿐이다(09-14 실측 0건). 나머지가 밤마다 한도를 먹었다.
#   ⇒ 러너는 그대로 컨테이너에서 돌되 **모델이 지켜보지 않게** 한다. 세션은 띄우고, 드물게
#     `$LOG.state` 한 줄만 보고, 끝나면 보고의 "귀속: 모델 몫" 칸만 채운다.
#
# ★★이 파일은 **목록을 하나도 안 들고 있다** — `nightly-split.sh`(T220)에게 묻고, 그걸 그대로 돌린다.
#   러너 둘(`run-regress.sh` · `nightly-split.sh`)은 **한 글자도 안 고친다**. 감싸기만 한다.
#   빨강 판정도 제가 안 한다 — `nightly-report.js --reds` 에게 묻는다(파서 사본 0).
#
# 쓰는 법:
#   nohup bash scripts/nightly-run.sh > /tmp/night/boot.log 2>&1 &   # 띄우고 잊는다
#   cat /tmp/night/regress.log.state                                  # 폴링은 이 한 줄만
#
# 손잡이(전부 env · 새 수 0):
#   LOG=/tmp/night/regress.log   로그 자리(이어 쓴다 · `.state`·`.retry`·`.pid` 가 옆에 선다)
#   NIGHT_TZ=Asia/Seoul          `nightly-split.sh auto` 의 날짜 기준(09-14 실측: UTC 로 두면 하루 어긋난다)
#   NIGHT_LIST="a.js b.js"       ★시험용 — 목록을 덮어쓴다(기본은 auto)
#   NIGHT_BASE=<커밋>            보고 머리의 기준 커밋(기본 = 지금 HEAD)
#   NIGHT_OUT=<경로>             보고 자리(기본: `보고/야간러너_<날짜>.md` · NIGHT_LIST 를 쓰면 로그 옆)
#   NIGHT_NO_REPORT=1            보고를 안 낸다(로그만)
#   NIGHT_NO_RETRY=1             빨강 단독 재실행을 건너뛴다
#   NIGHT_DRY=1                  오늘 목록만 뽑고 선다(3시간을 걸기 전에 목록을 눈으로 보는 자리)
#   TIMEOUT_SEC · DRAIN_SEC      러너의 것 그대로 — 여기서 새로 정하지 않는다(`e2e-thirst` 15~20분은 러너가 안다)
#
# ⚠stdin 을 안 읽는다(`nohup` 으로 띄워도 멈추지 않게 · 러너 자식도 `</dev/null`).
set -u
cd "$(dirname "$0")/.."

export TZ="${NIGHT_TZ:-Asia/Seoul}"
LOG="${LOG:-/tmp/night/regress.log}"
mkdir -p "$(dirname "$LOG")" || exit 1
STATE="$LOG.state"; RETRY="$LOG.retry"; PIDF="$LOG.pid"

# ── 이중 실행 거부 — 하네스가 전부 central 3010 · zone 3020 을 쓴다(러너 머리 ②).
#    두 개가 뜨면 `EADDRINUSE` 가 **없는 회귀**를 보고한다. 그래서 둘째가 죽는다.
#    ⚠`kill -0` 만으로는 모자라다 — 죽은 pid 를 남이 물려받았을 수 있다. 명령줄까지 본다.
alive() {
  local p="$1"
  [ -n "$p" ] || return 1
  kill -0 "$p" 2>/dev/null || return 1
  if [ -r "/proc/$p/cmdline" ]; then
    tr '\0' ' ' < "/proc/$p/cmdline" | grep -q 'nightly-run' || return 1
  fi
  return 0
}
if [ -f "$PIDF" ] && alive "$(cat "$PIDF" 2>/dev/null)"; then
  echo "  ✗ ★이미 돌고 있다(pid $(cat "$PIDF")) — 야간 러너는 한 번에 하나다(포트 3010/3020 공유)." >&2
  exit 3
fi
printf '%s\n' "$$" > "$PIDF"
trap 'rm -f "$PIDF"' EXIT

state() { printf '%s\n' "$*" > "$STATE"; }
# ★시각은 **줄마다** 찍는다 — 보고의 시작·종료가 로그 첫/끝 줄에서 나온다(모델이 안 센다).
#   ⚠`awk` 로 찍으면 안 된다: 입력 버퍼링 때문에 머리 몇 줄이 몇 분 늦게 나온다(T220 실측).
#   bash 의 `printf '%(...)T'` 는 포크가 없다 — 만 줄을 찍어도 `date` 를 한 번도 안 부른다.
say()  { printf '%(%Y-%m-%dT%H:%M:%S%z)T %s\n' -1 "$*" >> "$LOG"; }

state "starting"
say "===== nightly-run 시작 · TZ=$TZ · base=$(git rev-parse --short HEAD 2>/dev/null || echo '?') ====="

# ── 오늘 돌 목록 — **나는 안 만든다**. 분할기에게 묻는다(사본 0).
#   `auto` 를 두 번 부르지 않는다: 한 번 물어 **글자**를 받고, 돌릴 땐 그 글자로 부른다(날짜가
#   도중에 넘어가도 목록과 실행이 안 갈린다).
LIST=""; WHICH=""
if [ -n "${NIGHT_LIST:-}" ]; then
  LIST="$(printf '%s\n' $NIGHT_LIST)"
  WHICH="LIST"
  say "  [목록 덮어쓰기] NIGHT_LIST = $NIGHT_LIST"
else
  PROBE="$(bash scripts/nightly-split.sh auto --list-only 2>&1 </dev/null)"
  PRC=$?
  printf '%s\n' "$PROBE" | while IFS= read -r l; do say "  $l"; done
  if [ "$PRC" -ne 0 ]; then
    say "  ✗ ★분할기가 목록을 못 냈다(rc=$PRC) — 빈 목록으로는 안 돈다."
    state "failed · 목록 없음"; exit 4
  fi
  WHICH="$(printf '%s\n' "$PROBE" | sed -n 's/.*→ \*\*\([A-D]\)\*\*.*/\1/p' | head -1)"
  [ -n "$WHICH" ] || { say "  ✗ ★분할기 출력에서 묶음 글자를 못 읽었다."; state "failed · 묶음 불명"; exit 4; }
  LIST="$(printf '%s\n' "$PROBE" | grep -E '^[A-Za-z0-9_.-]+\.js$')"
fi
CNT="$(printf '%s\n' "$LIST" | grep -c . )"
[ "$CNT" -gt 0 ] || { say "  ✗ ★오늘 목록이 0종이다 — 조용한 빈 목록은 이 저장소에서 제일 위험한 답이다."; state "failed · 목록 0종"; exit 4; }
say "  [오늘] 묶음 $WHICH · $CNT종"
say "  [목록] $(printf '%s ' $LIST)"

if [ -n "${NIGHT_DRY:-}" ]; then
  say "  [예행] NIGHT_DRY=1 — 목록만 뽑고 선다"
  state "dry · 묶음 $WHICH · $CNT종"
  printf '%s\n' $LIST
  echo "dry · 묶음 $WHICH · ${CNT}종 · 로그 $LOG"
  exit 0
fi

# ── 본 판 — 분할기를 그대로 부르고, 지나가는 줄에 시각을 찍으면서 `$LOG.state` 를 갱신한다.
run_stream() {   # $@ = 실행할 명령
  local seen=0 cur=""
  while IFS= read -r line; do
    printf '%(%Y-%m-%dT%H:%M:%S%z)T %s\n' -1 "$line" >> "$LOG"
    case "$line" in
      '##### '*' #####')
        cur="${line#\#\#\#\#\# }"; cur="${cur%% \#\#\#\#\#}"
        seen=$((seen + 1)); state "running $seen/$CNT · $cur" ;;
    esac
  done < <( "$@" 2>&1 </dev/null )
}

state "running 0/$CNT · (기동)"
if [ -n "${NIGHT_LIST:-}" ]; then
  run_stream bash scripts/run-regress.sh $LIST
else
  run_stream bash scripts/nightly-split.sh "$WHICH"
fi
say "===== 본 판 끝 ====="

# ── 빨강 단독 재실행 — 판정은 제가 안 한다(보고기에게 묻는다 · 파서 사본 0).
#   왜 단독으로 한 번 더: 2코어에서 앞 하네스 정리와 서버 둘 세우기가 겹치면 **없는 회귀**가 보인다
#   (족보 167 · 09-13·09-14 야간 실측: `e2e-cold` 가 전수에선 빨갛고 단독에선 초록).
: > "$RETRY"
REDS=""
if [ -z "${NIGHT_NO_RETRY:-}" ]; then
  REDS="$(node scripts/nightly-report.js --reds "$LOG" 2>/dev/null)"
fi
RN="$(printf '%s\n' "$REDS" | grep -c . )"
if [ "$RN" -gt 0 ]; then
  say "  [재실행] 빨강 ${RN}종 — 단독으로 한 번 더 (로그: $RETRY)"
  i=0
  for f in $REDS; do
    i=$((i + 1)); state "retry $i/$RN · $f"
    printf '%(%Y-%m-%dT%H:%M:%S%z)T %s\n' -1 "===== 단독 재실행: $f =====" >> "$RETRY"
    bash scripts/run-regress.sh "$f" 2>&1 </dev/null | while IFS= read -r line; do
      printf '%(%Y-%m-%dT%H:%M:%S%z)T %s\n' -1 "$line" >> "$RETRY"
    done
  done
else
  say "  [재실행] 빨강 0종 — 재실행할 것이 없다"
fi

# ── 보고 — 로그만 읽어 결정적으로 낸다(같은 로그 → 바이트 동일).
OUTMD=""
if [ -z "${NIGHT_NO_REPORT:-}" ]; then
  state "reporting"
  # ★로그는 이어 쓴다 — 그래서 날짜도 **이번 판의 시작 줄**에서 읽는다(보고기도 같은 표를 본다).
  DAY="$(grep -F '===== nightly-run 시작' "$LOG" | tail -1 | cut -c1-10)"
  # ★시험 목록(`NIGHT_LIST`)으로 돈 판은 **레포의 보고를 안 덮는다** — 그 이름은 그 밤의 것이다.
  #   (첫 판에서 실제로 09-14 보고를 덮었다. 그래서 기본값을 갈랐다.)
  if [ -n "${NIGHT_OUT:-}" ]; then OUTMD="$NIGHT_OUT"
  elif [ -n "${NIGHT_LIST:-}" ]; then OUTMD="$(dirname "$LOG")/야간러너_${DAY}.md"
  else OUTMD="보고/야간러너_${DAY}.md"; fi
  BASE="${NIGHT_BASE:-$(git rev-parse --short HEAD 2>/dev/null || echo '?')}"
  if node scripts/nightly-report.js --log "$LOG" --base "$BASE" --out "$OUTMD" >/dev/null 2>&1; then
    say "  [보고] $OUTMD"
  else
    say "  ✗ 보고를 못 냈다 — 로그는 그대로 있다($LOG)"; OUTMD=""
  fi
fi

say "===== nightly-run 끝 ====="
state "done"
echo "done · 로그 $LOG · 재실행 $RETRY${OUTMD:+ · 보고 $OUTMD}"
