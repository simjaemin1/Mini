#!/bin/bash
# (@regress 없음 — 러너 밖 · T1335 맥 긴 판 러너 정본 · 제품 무변)
# === scripts/mac-long-run/판.sh — **맥 본체 긴 판 러너**: 판 코드 tgz · npm ci · T1308 체크포인트 판(멈추면 이어서) · caffeinate ===
#
# 왜: 맥 연결 VM(`device_bash`)은 부를 때마다 새 bwrap 상자라 부름이 끝나면 띄운 판이 죽는다(T1285 §0). 클라우드 컨테이너는 10 ~ 46시간에 다시 선다.
#     맥 본체 터미널에서 띄운 판은 산다 — T1304 가 끔 판 365날을 22.2시간에 끝냈다(`계측/T1304_2026-11-13/끔판.sh` 꼴을 이 자로 옮김).
#     T1304 는 멈추면 처음부터였다. 이 자는 T1308 이어 도는 판 자(`t1308-long-run.js` · 감독 `t1308-guard.sh`)를 써서 **마지막 체크포인트에서 이어 간다**.
#
# 쓰는 법(맥): 판 폴더 `~/Mini/_runs/<카드>/` 에 이 파일 · `진행.js` · `판목록.txt` · 판 코드 tgz(+ .sha256)를 두고
#     `~/Mini/<카드>_판.command` 를 더블클릭(= `bash 판.sh 판목록.txt`). 다시 더블클릭하면 진행을 보이고, 멈춘 판은 이어 띄운다.
#   판목록.txt(한 줄에 하나 · `#` 줄은 주석):
#     CODE=<code-….tgz>                      판 코드(`make-pack.sh` 가 만든 것 · 이 폴더에)
#     EVERY=<마디 날>                         T1308 체크포인트 간격(두 판을 견줄 땐 같은 값 — 마디 경계가 다르면 판이 갈린다 · 보고 T1308 §2)
#     OBS=<관찰기 …>                          판 코드 뿌리 기준 경로(빈칸으로 가름) — 아이 존에 `-r` 로 싣는다(읽기만 하는 훅)
#     DROP=1                                  (★[T1345] 있으면) 판이 끝나면 그 판의 세계 DB(`w.db*`) · 체크포인트(`ck/` · `stop-*.json`)를 지운다 — 관찰 json · 판 JSON 만 남긴다(맥 디스크 2 GB 안)
#     <이름> <날> <시드> [<env> …]            판 하나(env 는 K=V — 판 조건 · 손잡이)
#   판마다 폴더 `<판 폴더>/<이름>/`(T1308 꼴: progress.json · progress.txt · ck/ · seg-<날>.* · guard.log) + `guard.pid`.
#   상태: progress.done → 끝 · guard.pid 가 살아 있음 → 도는 중 · progress.json 있고 감독 없음 → **이어 띄움**(`t1308-guard.sh resume`) · 없음 → 새로 띄움(`new`).
#   ⚠ 판 코드가 바뀌면(tgz 의 REV ≠ run/REV) 도는 판 · 끝나지 않은 판이 있는 동안은 새로 풀지 않는다(판이 두 코드에 걸치지 않게).
set -u
LIST="${1:-$(cd "$(dirname "$0")" && pwd)/판목록.txt}"
[ -f "$LIST" ] || { echo "판목록이 없습니다: $LIST"; exit 2; }
BASE="$(cd "$(dirname "$LIST")" && pwd)"; RUN="$BASE/run"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then   # node — 클라우드 판(v22)과 같은 대가 있으면 그것: nvm 의 22 → Homebrew node@22 → PATH 의 node
  N22="$( set +u; . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; nvm which 22 2>/dev/null )"
  [ -n "$N22" ] && [ -x "$N22" ] && export PATH="$(dirname "$N22"):$PATH"
fi
[ -x /opt/homebrew/opt/node@22/bin/node ] && ! node -v 2>/dev/null | grep -q '^v22\.' && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
command -v node >/dev/null 2>&1 || { echo "node 가 없습니다 — brew install node 뒤 다시 여십시오."; exit 1; }
echo "node $(node -v) · $(uname -sm) · 판 폴더 $BASE"
FREE=$(df -k "$BASE" | awk 'NR==2{print $4}')
[ -n "$FREE" ] && [ "$FREE" -lt 3000000 ] && echo "⚠ 디스크 여유 $((FREE / 1024)) MB — 판 둘이 체크포인트까지 쓰면 2 GB 가까이 든다. 모자라면 판이 멈추고(자료는 마지막 체크포인트까지 남음), 여유를 만든 뒤 다시 더블클릭하면 이어 돈다."

CODE=$(sed -n 's/^CODE=//p' "$LIST" | head -1); EVERY=$(sed -n 's/^EVERY=//p' "$LIST" | head -1); OBS=$(sed -n 's/^OBS=//p' "$LIST" | head -1)
DROP=$(sed -n 's/^DROP=//p' "$LIST" | head -1)
[ -n "$CODE" ] && [ -f "$BASE/$CODE" ] || { echo "판 코드 tgz 가 없습니다: $BASE/$CODE"; exit 1; }
EVERY="${EVERY:-30}"
running() { [ -f "$1/guard.pid" ] && kill -0 "$(cat "$1/guard.pid")" 2>/dev/null; }
isdone() { [ -f "$1/progress.json" ] && node -e "process.exit(require(process.argv[1]).done?0:1)" "$1/progress.json"; }

# ① 판 코드 — 처음 한 번 풀고 npm ci
WANT=$(tar xzOf "$BASE/$CODE" REV 2>/dev/null | tr -d '\n')
HAVE=$(cat "$RUN/REV" 2>/dev/null | tr -d '\n')
if [ "$WANT" != "$HAVE" ]; then
  BUSY=0
  while read -r name _; do case "$name" in ''|'#'*|*=*) continue ;; esac; d="$BASE/$name"; if [ -f "$d/progress.json" ] && ! isdone "$d"; then BUSY=1; fi; done < "$LIST"
  if [ -n "$HAVE" ] && [ "$BUSY" = 1 ]; then echo "판 코드가 바뀌었는데(run ${HAVE:0:9} → tgz ${WANT:0:9}) 끝나지 않은 판이 있습니다 — 판이 두 코드에 걸치지 않게 풀지 않습니다. S1 에게 알려 주십시오."; exit 1; fi
  echo "판 코드 확인 · 푸는 중($CODE · ${WANT:0:9})…"
  ( cd "$BASE" && shasum -a 256 -c "$CODE.sha256" ) || { echo "판 코드 tgz 가 깨졌습니다 — S1 에게 알려 주십시오."; exit 1; }
  rm -rf "$RUN.new" && mkdir -p "$RUN.new" && tar xzf "$BASE/$CODE" -C "$RUN.new" || { echo "풀기 실패"; exit 1; }
  rm -rf "$RUN.old"; [ -d "$RUN" ] && mv "$RUN" "$RUN.old"; mv "$RUN.new" "$RUN"; rm -rf "$RUN.old"
fi
if ! ( cd "$RUN" && node -e "require('better-sqlite3')(':memory:').close()" ) >/dev/null 2>&1; then
  echo "npm ci 하는 중(1 ~ 3분)…"
  ( cd "$RUN" && npm ci --no-audit --no-fund ) || { echo "npm ci 실패 — 위 줄을 S1 에게 보여 주십시오."; exit 1; }
  ( cd "$RUN" && node -e "require('better-sqlite3')(':memory:').close()" ) || { echo "better-sqlite3 가 안 섭니다 — 위 줄을 S1 에게 보여 주십시오."; exit 1; }
fi
NODEOPT=""; for o in $OBS; do [ -f "$RUN/$o" ] || { echo "관찰기가 판 코드에 없습니다: $o"; exit 1; }; NODEOPT="$NODEOPT -r $RUN/$o"; done

# ② 판마다 — 끝 · 도는 중 · 이어 띄움 · 새로 띄움
#   ★[T1345] 감독이 끝나면(DROP=1 이고 판이 끝났으면) 그 판의 DB · 체크포인트를 지운다 — 판 폴더 안 글자만(`w.db*` · `ck/` · `stop-*.json`)
GUARD_THEN='g="$1"; d="$2"; drop="$3"; shift 3; bash "$g" "$@"; c=$?
  if [ "$drop" = 1 ] && node -e "process.exit(require(process.argv[1]).done?0:1)" "$d/progress.json" 2>/dev/null; then
    rm -rf "$d/ck" "$d/w.db" "$d/w.db-wal" "$d/w.db-shm" "$d"/stop-*.json; echo "$(date -u +%FT%TZ) 끝 — DB · 체크포인트 지움(DROP=1)"; fi
  exit $c'
bg() {   # $1 = 판 폴더 · 나머지 = 감독 인자 — 뒤에서(setsid · nohup · caffeinate), 창을 닫아도 산다
  local d="$1"; shift
  local CAF=""; command -v caffeinate >/dev/null 2>&1 && CAF="caffeinate -ims"
  if command -v perl >/dev/null 2>&1; then
    nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!"' $CAF bash -c "$GUARD_THEN" _ "$RUN/scripts/t1308-guard.sh" "$d" "${DROP:-0}" "$@" >> "$d/runner.txt" 2>&1 < /dev/null &
  else
    nohup $CAF bash -c "$GUARD_THEN" _ "$RUN/scripts/t1308-guard.sh" "$d" "${DROP:-0}" "$@" >> "$d/runner.txt" 2>&1 < /dev/null &
  fi
  echo $! > "$d/guard.pid"
}
while read -r name days seed rest; do
  case "$name" in ''|'#'*|*=*) continue ;; esac
  d="$BASE/$name"; mkdir -p "$d"
  if isdone "$d"; then echo "[$name] 끝"; continue; fi
  if running "$d"; then echo "[$name] 도는 중(pid $(cat "$d/guard.pid"))"; continue; fi
  if [ -f "$d/progress.json" ]; then
    echo "[$name] 멈춰 있음 — 마지막 체크포인트에서 이어 띄움"
    echo "$(date -u +%FT%TZ) 이어 띄움(판.sh) node $(node -v) rev $(cat "$RUN/REV")" >> "$d/runner.txt"
    ( cd "$RUN" && bg "$d" resume "$d" )
  else
    echo "[$name] 새로 띄움 — ${days}날 · 시드 $seed · 마디 ${EVERY}날 · $rest"
    echo "$(date -u +%FT%TZ) 새 판(판.sh) node $(node -v) $(uname -sm) $( (sysctl -n machdep.cpu.brand_string 2>/dev/null || true) ) rev $(cat "$RUN/REV") · ${days}날 · 시드 $seed · 마디 $EVERY · $rest" >> "$d/runner.txt"
    ( cd "$RUN"; for kv in $rest; do export "$kv"; done; export NODE_OPTIONS="${NODEOPT# }"
      bg "$d" new "$days" "$seed" --every "$EVERY" --dir "$d" --tag "$name" )
  fi
done < "$LIST"
sleep 5
node "$BASE/진행.js" "$BASE" 2>/dev/null || true
