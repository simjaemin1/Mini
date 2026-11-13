#!/usr/bin/env bash
# === 계측/T1304_2026-11-13/맥-러너.sh — T1263 끔 판(시드 1020 · 밭 끔) 365날을 맥에서 끝까지 (T1304) ===
#
# 무엇: T1263(S13)이 클라우드에서 날 300 에 끊긴 끔 판을 같은 판 꼴로 처음부터 365날 돌린다.
#   판 꼴 = T1244 · T1263 그대로 — 몸 전부(VILLAGE_NPC_CAP=Infinity) · 라이브 하루(VILLAGE_DAY_MS=1440000) · 집 끔(T400_BUILD_ACT=0) ·
#           캐러밴 끔(VILLAGE_CARAVAN_MAX=0) · 가상 시계(T745_VCLOCK=1 + t745-vclock.js) · 관찰기 t1243 · t1221 · t1230 · t1263 ·
#           밭 끔(T1243_FARM_ON 없음) · 시드 1020.
#   읽기: 보고/T1243_2026-11-09.md 회부 1(판 명령) · 보고/T1263_2026-11-11.md(관찰기 t1263 더함).
#
# 어디서: 이 저장소의 **T1263 판 코드**(df40c1042 — 켬 365날 판과 같은 코드)를 꺼낸 작업 폴더 뿌리에서.
#   git worktree add ../t1304-run df40c1042 && cd ../t1304-run && npm ci && bash 계측/T1304_2026-11-13/맥-러너.sh
#   (이 파일이 그 커밋에는 없으니 경로를 주어 부른다: bash /<이 가지 폴더>/계측/T1304_2026-11-13/맥-러너.sh)
#
# 얼마나: 하루 CPU 500 ~ 900 초(인구 ~3,800) — 365날 약 2.5일. 맥이 잠들면 멈춘다 — caffeinate 가 있으면 그 밑에서 돈다.
# 판 자료: T1304_OUT(기본 ../t1304-off) — <판>-1020.json · .log · .t1243.json · .t1221.json · .t1230.json · .t1263.json(10날마다 씀 — 판이 죽어도 그날까지 남는다).
# 진행 보기: bash 맥-러너.sh --진행     (마지막 10날 줄 · 인구 · 하루 CPU)
set -u
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"
OUT="${T1304_OUT:-$ROOT/../t1304-off}"
HEAD="$OUT/village_caravan_max0-1020"

if [ "${1:-}" = "--진행" ]; then
  node -e '
    const fs = require("fs"), h = process.argv[1];
    const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
    const t = rd(h + ".t1263.json"), a = rd(h + ".t1243.json");
    const s = t && t.snaps && t.snaps.length ? t.snaps[t.snaps.length - 1] : null;
    const c = a && a.cpu && a.cpu.length ? a.cpu[a.cpu.length - 1] : null;
    console.log(s ? `날 ${s.day} · 인구 ${s.pop} · 빈 마을 ${s.empty} · 식량 빚 죽음 ${s.fd} · 늙음 ${s.nat}` : "아직 10날 줄 없음");
    console.log(c ? `마지막 날 ${c[0]} · 그날 CPU ${c[1]} 초` : "");' "$HEAD"
  exit 0
fi

DAYS="${1:-365}"
mkdir -p "$OUT"
export T577_DIR="$OUT" VILLAGE_DAY_MS=1440000 VILLAGE_NPC_CAP=Infinity T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1
unset T1243_FARM_ON T577_TAG
export NODE_OPTIONS="-r $ROOT/scripts/t745-vclock.js -r $ROOT/scripts/t1243-observe.js -r $ROOT/scripts/t1221-observe.js -r $ROOT/scripts/t1230-observe.js -r $ROOT/scripts/t1263-observe.js"
for f in scripts/t745-vclock.js scripts/t1243-observe.js scripts/t1221-observe.js scripts/t1230-observe.js scripts/t1263-observe.js scripts/t577-server-run.js; do
  [ -f "$f" ] || { echo "없음: $f — T1263 판 코드(df40c1042 이후) 뿌리에서 부르세요"; exit 2; }
done
CAF=""
command -v caffeinate >/dev/null 2>&1 && CAF="caffeinate -dimsu"
{
  echo "start $(date -u +%FT%TZ) arm=off days=$DAYS rev=$(git rev-parse --short HEAD 2>/dev/null) node=$(node -v) host=$(uname -sm) caf=${CAF:-없음}"
} | tee "$OUT/러너.txt"
s=$(date +%s)
$CAF node scripts/t577-server-run.js "$DAYS" 1020 2>&1 | tee -a "$OUT/러너.txt"
rc=${PIPESTATUS[0]}
echo "exit=$rc sec=$(( $(date +%s) - s )) end $(date -u +%FT%TZ)" | tee -a "$OUT/러너.txt"
echo "표: node scripts/t1263-table.js 계측/T1263_2026-11-11/ON-1020 $HEAD"
