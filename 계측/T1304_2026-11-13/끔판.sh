#!/bin/bash
# === 계측/T1304_2026-11-13/끔판.sh — 맥(~/Mini/_t1304/끔판.sh)에서 T1304 끔 판을 띄우거나(처음) 진행을 보여 준다(도는 중 · 끝남) ===
#   부르는 곳: ~/Mini/T1304_끔판.command(더블클릭) · 손으로: bash ~/Mini/_t1304/끔판.sh
#   처음 한 번: 판 코드 code-df40c1042.tgz(df40c1042 = T1263 판 코드 · 켬 365날 판과 같은 코드 · 계측 · 보고 · 증거 · 문서 폴더만 뺌)를 run/ 에 풀고 npm ci →
#              맥-러너.sh 365 를 뒤에서 띄운다(setsid · nohup — 창을 닫아도 돈다 · caffeinate -ims 로 잠자기 막음).
#   다시 부르면: 도는 중이면 진행(진행.js) · 끝났으면 끝 줄 · 멈춰 있으면(맥 재시동 등) 그 자료를 off-멈춤-<시각>/ 로 옮기고 처음부터 다시.
#   판 자료: off/(10날마다 관찰기 JSON · 러너.txt · pid) — 클라우드 세션은 Cowork 폴더 연결로 이 폴더를 읽는다.
set -u
cd "$(dirname "$0")" || exit 1
BASE="$(pwd)"; RUN="$BASE/run"; OUT="$BASE/off"; HEAD="$OUT/village_caravan_max0-1020"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
# node — 클라우드 판(v22)과 같은 대가 있으면 그것: nvm 의 22 → Homebrew node@22 → PATH 의 node
if [ -s "$HOME/.nvm/nvm.sh" ]; then   # nvm 은 22 를 찾는 데만 쓴다(nvm 기본 대가 PATH 를 바꾸지 않게 버금 셸에서)
  N22="$( set +u; . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1; nvm which 22 2>/dev/null )"
  [ -n "$N22" ] && [ -x "$N22" ] && export PATH="$(dirname "$N22"):$PATH"
fi
[ -x /opt/homebrew/opt/node@22/bin/node ] && ! node -v 2>/dev/null | grep -q '^v22\.' && export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
command -v node >/dev/null 2>&1 || { echo "node 가 없습니다 — brew install node 뒤 다시 여십시오."; exit 1; }
echo "node $(node -v) ($(command -v node)) · $(uname -sm)"

if [ -f "$OUT/pid" ] && kill -0 "$(cat "$OUT/pid")" 2>/dev/null; then
  echo "판이 이미 도는 중입니다(pid $(cat "$OUT/pid")) — 진행:"; node "$BASE/진행.js" "$HEAD"; exit 0
fi
if [ -f "$OUT/러너.txt" ] && grep -q '^exit=' "$OUT/러너.txt"; then
  echo "판이 끝났습니다 — 진행:"; node "$BASE/진행.js" "$HEAD"; exit 0
fi
if [ -f "$OUT/러너.txt" ]; then
  ST="$BASE/off-멈춤-$(date +%Y%m%d-%H%M%S)"
  echo "앞 판이 끝나지 않고 멈춰 있습니다 — 그 자료를 $(basename "$ST")/ 로 옮기고 처음부터 다시 띄웁니다."
  mv "$OUT" "$ST" || exit 1
fi

if [ ! -f "$RUN/scripts/t577-server-run.js" ]; then
  echo "판 코드 확인 · 푸는 중(풀면 약 235 MB)…"
  ( cd "$BASE" && shasum -a 256 -c code-df40c1042.tgz.sha256 ) || { echo "판코드 tgz 가 깨졌습니다 — S1 에게 알려 주십시오."; exit 1; }
  mkdir -p "$RUN" && tar xzf "$BASE/code-df40c1042.tgz" -C "$RUN" || { echo "풀기 실패"; exit 1; }
fi
if ! ( cd "$RUN" && node -e "require('better-sqlite3')(':memory:').close()" ) >/dev/null 2>&1; then
  echo "npm ci 하는 중(1 ~ 3분)…"
  ( cd "$RUN" && npm ci --no-audit --no-fund ) || { echo "npm ci 실패 — 위 줄을 S1 에게 보여 주십시오."; exit 1; }
  ( cd "$RUN" && node -e "require('better-sqlite3')(':memory:').close()" ) || { echo "better-sqlite3 가 안 섭니다 — 위 줄을 S1 에게 보여 주십시오."; exit 1; }
fi

mkdir -p "$OUT"
cd "$RUN" || exit 1
export T1304_ROOT="$RUN" T1304_OUT="$OUT"
if command -v perl >/dev/null 2>&1; then
  nohup perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!"' bash "$BASE/맥-러너.sh" 365 > "$OUT/nohup.txt" 2>&1 < /dev/null &
else
  nohup bash "$BASE/맥-러너.sh" 365 > "$OUT/nohup.txt" 2>&1 < /dev/null &
fi
echo $! > "$OUT/pid"
sleep 8
if kill -0 "$(cat "$OUT/pid")" 2>/dev/null; then
  echo "띄웠습니다 — 끔 판 365날(시드 1020 · 밭 끔) · pid $(cat "$OUT/pid")"
  head -1 "$OUT/러너.txt" 2>/dev/null
  echo "이 창은 닫아도 됩니다(판은 뒤에서 돕니다). 맥은 전원에 꽂고 뚜껑을 열어 두십시오 — 덮으면 잠들어 판이 멈춥니다."
  echo "진행은 이 파일을 다시 더블클릭하면 보입니다(10날마다 갱신)."
else
  echo "판이 바로 멈췄습니다 — 아래 줄을 S1 에게 보여 주십시오:"; tail -20 "$OUT/nohup.txt"
fi
