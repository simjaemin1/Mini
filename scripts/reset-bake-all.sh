#!/usr/bin/env bash
# (@regress 없음 — 러너 밖 · T601 초기화 굽기 한 줄 · 기본 = 예행(레포 정본 무변))
# =============================================================================
# 초기화 전 지형 굽기를 **정해진 차례로** 한 줄에 — (0 작업 파일 → 정본) → 폭 → 해안 꼴 → 동쪽 채우기 → 마을 자리 → 광맥·숲·군락 → 다리 → 개울 → 에디터 내장 정본.
#   차례가 틀리면 앞 단계가 뒤 단계를 깬다(해안이 바뀌면 마을·광맥이 물에 잠기고 개울 지문이 어긋난다 · 족보 541).
#   각 단계는 **이미 있는 스크립트를 부르기만** 한다(사본 0) · 단계마다 게이트 · 한 단계라도 빨강이면 거기서 멈춘다.
#   재민 값이 안 정해진 단계(손잡이가 비었다)는 **지금 정본 그대로 통과**한다 — 그래서 지금 정본의 예행은 바뀜 0 이어야 한다(멱등).
#   단계 표 · 재민 칸 = `설계/초기화_굽기.md` · 배포 절차와 잇는 자리 = `설계/초기화_절차서.md` §3 0 ④.
#
# 쓰는 법:
#   bash scripts/reset-bake-all.sh                 예행(= --dry-run) — 작업 트리를 임시 사본에 떠서 차례로 적용하고 "무엇이 바뀔지" 표만 · 레포 무변
#   bash scripts/reset-bake-all.sh --apply         레포에 차례로 적용(빨강이면 멈춤) — 끝나면 `git status` 의 정본 파일을 커밋(PM)
#   bash scripts/reset-bake-all.sh --table         단계 표만(아무것도 안 돈다)
#   붙이는 것: --audit(입력이 안 바뀐 배치 단계도 다시 돌려 정본 어긋남을 찾는다) · --no-boot(끝 부팅 게이트 건너뜀)
#             --rulers(끝에 3시드 t17 — 일곱째 판 값과 바이트 비교) · --keep(예행 사본을 안 지운다) · --log <dir>
#             --keep-going(예행 전용 — 빨강에서 안 멈추고 끝까지 돌려 "켜면 무엇이 바뀌나" 표를 낸다 · 적용엔 안 먹는다)
# 재민 칸(손잡이 — 비면 그 단계는 지금 정본 그대로):
#   T601_WORK=<작업 파일>   [T624] 0 단계 — 에디터 작업 파일(mf 세계 판)을 정본 존 절로(`work-to-canon.js` · 왕복 게이트) · 비면 0 단계 통과
#   T588_COAST=a|b          해안 꼴(T588 · 끔 = 지금 해안) — ★존 env 에도 같은 값을 실어야 한다(굽기 + 실행 둘 다 · 절차서 §1 #21)
#   T601_EAST=1             닛폰 동쪽 채우기 안 ○(T595 — 적재 줄은 그 카드 착지 뒤)
#   T601_VILLAGES=1         마을 자리 승인(T596 `scripts/plan-villages-reset.js --apply`)
#   T601_NIPPON_MINOR=<수>  닛폰 자잘 광맥 수(T586 적재기 · T595 ③ 띠 거르기 뒤)
#   T601_ORE_L=500          광종 꼬리 L(재민 10-03 확정 500 — 바꿀 일 없으면 비움)
#   T601_BASE=8279,8258,8591  --rulers 비교값(일곱째 판 · 족보 560)
# =============================================================================
set -o pipefail   # (-u 안 씀 — 맥 bash 3.2 는 빈 배열 펼침을 unbound 로 친다)
ROOT=$(cd "$(dirname "$0")/.." && pwd)
MODE=dry; AUDIT=0; RULERS=0; BOOT=1; KEEP=0; TABLE=0; LOG=""; GOON=0
while [ $# -gt 0 ]; do case "$1" in
  --dry-run) MODE=dry ;; --apply) MODE=apply ;; --table) TABLE=1 ;; --audit) AUDIT=1 ;; --rulers) RULERS=1 ;;
  --no-boot) BOOT=0 ;; --keep-going) GOON=1 ;; --keep) KEEP=1 ;; --log) LOG="$2"; shift ;;
  -h|--help) sed -n 2,28p "$0"; exit 0 ;; *) echo "모르는 인자: $1"; exit 2 ;; esac; shift; done

# 정본 파일 — 굽기가 쓰는 것 전부(이 밖은 굽기가 안 쓴다 · 예행 바뀜 표의 자)
CANON=(server/hanbando-terrain.json server/zone-config.js server/region-bake-off.json
       server/streams/jungwon_n.bin server/streams/hanbando.bin server/streams/nippon.bin
       lab/map-editor-baked.json lab/map-editor-pins.json lab/map-editor-coast.json)
ORE_L="${T601_ORE_L:-500}"
WORKF=""; if [ -n "${T601_WORK:-}" ]; then case "$T601_WORK" in /*) WORKF="$T601_WORK" ;; *) WORKF="$ROOT/$T601_WORK" ;; esac
  [ -f "$WORKF" ] || { echo "✗ T601_WORK 파일이 없다: $T601_WORK"; exit 2; }; fi
COAST="${T588_COAST:-}"; case "$COAST" in 1|a|b) ;; *) COAST="" ;; esac

TABLE_ROWS=(
"0|작업 파일 → 정본(T624)|T601_WORK=<작업 파일>(재민 손질본)|work-to-canon.js(id 로 짝 · export-editor-work.js 를 부르기만)|hanbando-terrain.json(바뀐 존 절만)|왕복 같음(정본 → export → mf = 작업 mf)"
"1|폭(T591)|zone-config 존 폭 — 재민 10-03 닛폰 7000 · 착지|(부름 0 — 폭은 코드)|—|test-seam"
"2|해안 꼴(T588)|T588_COAST=a·b(재민)|(부름 0 — 실행 env · 아래 단계가 그 env 로 굽는다)|— (존 env)|test-coast-shape(켬일 때)"
"3|동쪽 채우기(T595)|T601_EAST=1(재민 ○)|T595 적재 줄(착지 뒤)|hanbando-terrain.json nippon|그 줄의 게이트"
"4|마을 자리(T596)|T601_VILLAGES=1(재민 승인)|plan-villages-reset.js --apply|hanbando-terrain.json villages|그 스크립트 rc"
"5|광맥·숲·군락|T601_NIPPON_MINOR=<수> · T601_ORE_L(500)|t586-minor-ores.js · t574-bake.js / t580-bake-nippon.js · plan-village-forage.js|hanbando-terrain.json ores·groves · region-bake-off.json|바뀔 광맥 0 · 군락 계획기 rc"
"6|다리|(T580_EMPTY_MIN — 닛폰 1000 · zone-config 주석)|plan-bridges-v2.js 세 존(계획만)|— (다리 줄은 손 — 바뀌면 빨강)|놓을 다리 0(알려진 예외 밖)"
"7|개울(T585)|—|bake-streams.js --check → 다르면 bake-streams.js|server/streams/*.bin|bake-streams --check"
"8|에디터 내장 정본 + 해안 바다 띠 층|(해안 env — 비면 b · 정본 coastShift 가 있으면 그 판)|editor-coast-bake.py(→ t588-coast-mask.js) · editor-baked-check.js → 다르면 --write + MAPED_UPDATE_PINS=1 test-map-editor|lab/map-editor-coast.json · map-editor-baked.json · map-editor-pins.json|editor-baked-check · test-map-editor"
)
if [ $TABLE = 1 ]; then
  echo "| # | 단계 | 입력(손잡이) | 부르는 것 | 바뀌는 정본 | 게이트 |"; echo "|---|---|---|---|---|---|"
  for r in "${TABLE_ROWS[@]}"; do echo "| ${r//|/ | } |"; done; exit 0
fi

TS=$(date +%Y%m%d-%H%M%S)
[ -n "$LOG" ] || LOG="${TMPDIR:-/tmp}/reset-bake-$TS"
mkdir -p "$LOG"
if [ $MODE = dry ]; then
  W="$LOG/w"; mkdir -p "$W"
  # 작업 트리(커밋 안 된 손질 포함 · git 이 아는 파일만)를 그대로 뜬다 — 굽기 스크립트는 레포 자리 기준으로 쓴다
  ( cd "$ROOT" && git ls-files -co --exclude-standard -z -- server sim scripts lab public tools package.json package-lock.json \
      | tar --null -T - -cf - ) | tar -C "$W" -xf - || { echo "✗ 예행 사본을 못 떴다"; exit 1; }
  ln -s "$ROOT/node_modules" "$W/node_modules"
else
  W="$ROOT"
fi
cd "$W"
SHA0="$LOG/sha-base.txt"   # 출발 판(단계 0 의 sha 는 sha0.txt)
if command -v sha256sum >/dev/null; then SHA="sha256sum"; else SHA="shasum -a 256"; fi
sha_canon() { for f in "${CANON[@]}"; do if [ -f "$f" ]; then $SHA "$f"; else echo "없음  $f"; fi; done; }
sha_canon > "$SHA0"

RES=()      # 단계 결과 줄
RED=""      # --keep-going 에서 빨강이었던 단계
UP=0        # 앞 단계가 정본(또는 해안 env)을 바꿨나
UPV=0       # 군락의 입력(해안 · 동쪽 · 마을 자리 — 단계 2~4)이 바뀌었나 — 바뀌었으면 군락 계획기를 다시 돈다
[ $MODE = apply ] && GOON=0
STOP=0
say() { echo "$*" | tee -a "$LOG/run.txt"; }
stage() {  # stage <번호> <이름> <입력> <부른 것> <게이트 결과 ✓/✗/통과> — 바뀐 정본은 sha 로
  local n="$1" name="$2" in="$3" called="$4" gate="$5" ch
  sha_canon > "$LOG/sha$n.txt"
  local prev="$LOG/sha$((n-1)).txt"; [ "$n" = 0 ] && prev="$SHA0"
  ch=$(diff <(cat "$prev" 2>/dev/null || cat "$SHA0") "$LOG/sha$n.txt" | awk '/^>/{print $NF}' | sed 's#.*/##' | sort -u | paste -sd' ' -)
  [ -n "$ch" ] && UP=1
  [ -n "$ch" ] && { [ "$n" = 0 ] || { [ "$n" -ge 2 ] && [ "$n" -le 4 ]; }; } && UPV=1   # 0 단계(작업 파일)도 물·마을을 바꾼다
  RES+=("| $n | $name | $in | $called | ${ch:-0} | $gate |")
  say "[$n $name] 부름: $called · 바뀐 정본: ${ch:-0} · 게이트: $gate"
  case "$gate" in ✗*) [ $GOON = 1 ] && RED="$RED $n" || STOP=1 ;; esac
}
runlog() { local tag="$1"; shift; "$@" > "$LOG/$tag.log" 2>&1; }
say "== 초기화 굽기 한 줄 — $( [ $MODE = dry ] && echo "예행(사본 $W)" || echo "적용(레포)" ) · 베이스 $(git -C "$ROOT" rev-parse --short HEAD) · 작업 파일 ${T601_WORK:-없음} · 해안 ${COAST:-끔} · L $ORE_L"

# ── 0 작업 파일 → 정본(T624) ─────────────────────────────────────────────────
if [ -n "$WORKF" ]; then
  if runlog 0-work node scripts/work-to-canon.js "$WORKF" --apply --json "$LOG/0-work.json"; then
    g="✓ 왕복 같음 · $(grep -oE '같음 [0-9]+ · 기하 바뀜 [0-9]+ · 이름 바뀜 [0-9]+ · 존 옮김 [0-9]+ · 뺌 [0-9]+ · 새로 [0-9]+' "$LOG/0-work.log" | head -1)"
  else g="✗ work-to-canon — $(grep -m1 -E '왕복|멈춘다|아니다' "$LOG/0-work.log" | sed 's/^ *//' | cut -c1-120)(로그 $LOG/0-work.log)"; fi
  stage 0 "작업 파일 → 정본" "T601_WORK=${T601_WORK}" "work-to-canon.js --apply" "$g"
else
  sha_canon > "$LOG/sha0.txt"
fi

# ── 1 폭 ─────────────────────────────────────────────────────────────────────
W1=$(node -e "const Z=require('./server/zone-config').ZONES;console.log(['hanbando','nippon','jungwon_n','bering'].map(k=>k+' '+Math.floor(Z[k].zoneWidth/32)).join(' · '))")
if runlog 1-seam node scripts/test-seam.js; then g="✓ test-seam $(grep -o 'PASS [0-9]* / FAIL [0-9]*' "$LOG/1-seam.log" | tail -1)"; else g="✗ test-seam(로그 $LOG/1-seam.log)"; fi
stage 1 "폭" "존 폭(셀) $W1" "(부름 0)" "$g"

# ── 2 해안 꼴 ────────────────────────────────────────────────────────────────
if [ $STOP = 0 ]; then
  if [ -n "$COAST" ]; then
    export T588_COAST="$COAST"; UP=1; UPV=1
    if runlog 2-coast node scripts/test-coast-shape.js; then g="✓ test-coast-shape"; else g="✗ test-coast-shape $(grep -o 'PASS [0-9]* / FAIL [0-9]*' "$LOG/2-coast.log" | tail -1) — 켬 갈래가 아직 빨강(T604 ⓪)"; fi
    stage 2 "해안 꼴" "T588_COAST=$COAST" "(부름 0 — 아래 단계가 이 env 로 굽는다)" "$g"
  else unset T588_COAST; stage 2 "해안 꼴" "T588_COAST 비움(끔)" "(부름 0)" "통과 — 지금 해안"; fi
fi

# ── 3 동쪽 채우기(T595) ───────────────────────────────────────────────────────
if [ $STOP = 0 ]; then
  if [ "${T601_EAST:-}" = 1 ]; then stage 3 "동쪽 채우기" "T601_EAST=1" "(없음)" "✗ T595 적재 줄이 아직 없다 — 그 카드 착지가 이 칸에 부를 줄을 단다"
  else stage 3 "동쪽 채우기" "T601_EAST 비움" "(부름 0)" "통과 — 지금 정본(재민 ○ 전)"; fi
fi

# ── 4 마을 자리(T596) ─────────────────────────────────────────────────────────
if [ $STOP = 0 ]; then
  if [ "${T601_VILLAGES:-}" = 1 ]; then
    if [ -f scripts/plan-villages-reset.js ]; then
      if runlog 4-villages node scripts/plan-villages-reset.js --apply; then g="✓ rc 0"; else g="✗ plan-villages-reset rc ≠ 0(로그 $LOG/4-villages.log)"; fi
      stage 4 "마을 자리" "T601_VILLAGES=1" "plan-villages-reset.js --apply" "$g"
    else stage 4 "마을 자리" "T601_VILLAGES=1" "(없음)" "✗ scripts/plan-villages-reset.js 가 아직 없다(T596 착지 뒤)"; fi
  else stage 4 "마을 자리" "T601_VILLAGES 비움" "(부름 0)" "통과 — 지금 자리(재민 승인 전)"; fi
fi

# ── 5 광맥·숲·군락 ───────────────────────────────────────────────────────────
if [ $STOP = 0 ]; then
  called=(); g=""
  # 5a 닛폰 자잘 광맥(재민 수) — 이미 있으면 적재기가 멈추므로 먼저 본다
  NMIN=$(node -e "const d=JSON.parse(require('fs').readFileSync('server/hanbando-terrain.json','utf8'));console.log((d.nippon.ores||[]).filter(o=>o.minor).length)")
  if [ -n "${T601_NIPPON_MINOR:-}" ]; then
    if [ "$NMIN" -gt 0 ]; then called+=("자잘 광맥: 이미 $NMIN(적재기 안 부름)")
    elif runlog 5a-minor node scripts/t586-minor-ores.js --count "$T601_NIPPON_MINOR" --apply; then called+=("t586-minor-ores --count $T601_NIPPON_MINOR --apply")
    else g="✗ t586-minor-ores(로그 $LOG/5a-minor.log)"; fi
  fi
  # 5b 광종 굽기 L — 표로 "바뀔 광맥" 을 세고, 있으면 굽는다(한반도는 이미 구운 판 위에서 두 번 못 굽는다 — 빨강)
  ore_count() { node scripts/t574-bake.js --L "$ORE_L" --json "$LOG/5b-t574.json" > "$LOG/5b-t574.log" 2>&1 \
      && node scripts/t580-bake-nippon.js --json "$LOG/5b-t580.json" > "$LOG/5b-t580.log" 2>&1 \
      && node -e "const a=require('$LOG/5b-t574.json'),b=require('$LOG/5b-t580.json');console.log(a.hanbando.changed+' '+((b.L['$ORE_L']||{}).changed??'?'))"; }
  if [ -z "$g" ]; then
    read -r OH ON <<<"$(ore_count)"
    if [ "${OH:-x}" != 0 ] && [ -f server/region-bake-off.json ]; then g="✗ 한반도 바뀔 광맥 $OH — 이미 구운 판(region-bake-off.json) 위라 두 번 못 굽는다(되돌린 뒤 t574-bake)"
    elif [ "${OH:-x}" != 0 ]; then runlog 5b-apply node scripts/t574-bake.js --L "$ORE_L" --apply && called+=("t574-bake --L $ORE_L --apply") || g="✗ t574-bake --apply"
    elif [ "${ON:-x}" != 0 ]; then runlog 5b-apply node scripts/t580-bake-nippon.js --L "$ORE_L" --apply && called+=("t580-bake-nippon --L $ORE_L --apply") || g="✗ t580-bake-nippon --apply"
    else called+=("t574-bake·t580-bake-nippon 표(바뀔 광맥 0)"); fi
    if [ -z "$g" ]; then read -r OH2 ON2 <<<"$(ore_count)"; [ "$OH2 $ON2" = "0 0" ] && g="✓ 바뀔 광맥 0/0(한반도/닛폰 · L $ORE_L)" || g="✗ 굽고도 바뀔 광맥 $OH2/$ON2"; fi
  fi
  # 5c 군락(마을 어귀) — 입력(마을 자리·해안·동쪽)이 바뀌었을 때만 다시(계획기는 멱등 · 옛 군락이 새 계획에 없으면 스스로 멈춘다)
  if [ -z "${g%%✓*}" ]; then
    if [ $UPV = 1 ] || [ $AUDIT = 1 ]; then
      for z in hanbando nippon; do
        if runlog "5c-groves-$z" node scripts/plan-village-forage.js --zone $z --apply; then called+=("plan-village-forage --zone $z --apply")
        else g="✗ 군락 $z — $(grep -m1 '중단' "$LOG/5c-groves-$z.log" | sed 's/^ *//' | cut -c1-120)"; break; fi
      done
    else called+=("군락: 입력 무변(부름 0)"); fi
  fi
  called+=("자잘 숲: 부름 0(11차 손 고름 · T586 '더할 것 0')")
  stage 5 "광맥·숲·군락" "${T601_NIPPON_MINOR:+자잘 $T601_NIPPON_MINOR · }L $ORE_L" "$(IFS=';'; echo "${called[*]}" | sed 's/;/ · /g')" "$g"
fi

# ── 6 다리(계획만 — 다리 줄은 zone-config 에 손으로 옮긴다) ────────────────────
if [ $STOP = 0 ]; then
  # 알려진 예외: 한반도 어촌6 = 해안 띠 안 거짓 섬(재민 09-30 · zone-config `bridgeSites` 주석 T537 추신2)
  KNOWN="hanbando:어촌6"
  bad=""; notes=()
  for z in hanbando nippon jungwon_n; do
    if [ $z = nippon ]; then E="T580_EMPTY_MIN=1000"; else E=""; fi
    env $E node scripts/plan-bridges-v2.js $z > "$LOG/6-bridge-$z.log" 2>&1
    # ★[T624] 섬 이름에 빈칸이 있을 수 있다("(빈 덩이)" — T580_EMPTY_MIN) — 줄째로 읽고 · 판정은 "다리 가능 N섬" 수로 한다(이름 못 읽어도 안 새게)
    n=$(grep -oE '다리 가능 [0-9]+섬' "$LOG/6-bridge-$z.log" | grep -oE '[0-9]+')
    known=0
    while IFS= read -r line; do
      v=$(printf '%s' "$line" | sed -E 's/^\[섬 #([0-9]+)\] (.*) \(([0-9,]+)셀\) 최단 도하 ([0-9]+)셀.*/\2#\1 \3셀 도하 \4/')
      nm=${v%%#*}
      case " $KNOWN " in *" $z:$nm "*) notes+=("$z $nm(알려진 예외)"); known=$((known+1)) ;; *) bad="$bad $z:${v// /_}" ;; esac
    done < <(grep -E '^\[섬 #[0-9]+\] .* \([0-9,]+셀\) 최단 도하' "$LOG/6-bridge-$z.log")
    [ -n "$n" ] && [ "$n" -gt "$known" ] && ! printf '%s' "$bad" | grep -q " $z:" && bad="$bad $z:(다리 가능 $n섬 · 이름 못 읽음)"
    [ -z "$n" ] && bad="$bad $z:(계획기 출력 없음)"
  done
  if [ -n "$bad" ]; then g="✗ 새로 놓을 다리 —$bad(zone-config 다리 줄 · 손)"; else g="✓ 놓을 다리 0${notes:+ · ${notes[*]}}"; fi
  stage 6 "다리" "닛폰 T580_EMPTY_MIN=1000" "plan-bridges-v2 hanbando·nippon·jungwon_n(계획만)" "$g"
fi

# ── 7 개울 ───────────────────────────────────────────────────────────────────
if [ $STOP = 0 ]; then
  if runlog 7-check node scripts/bake-streams.js --check; then called="bake-streams --check(같다)"; g="✓ bake-streams --check"
  else
    if runlog 7-bake node scripts/bake-streams.js && runlog 7-check2 node scripts/bake-streams.js --check; then called="bake-streams → --check"; g="✓ 다시 구워 같다 · 점검 $(grep -oE '두 물 [0-9]+ · 끊긴 [0-9]+ · 큰 물 위 [0-9]+ · 가로지름 [0-9]+' "$LOG/7-bake.log" | head -1)"
    else called="bake-streams"; g="✗ bake-streams(로그 $LOG/7-*.log)"; fi
  fi
  stage 7 "개울" "$( [ -n "$COAST" ] && echo "T588_COAST=$COAST" || echo "—")" "$called" "$g"
fi

# ── 8 에디터 내장 정본 ───────────────────────────────────────────────────────
if [ $STOP = 0 ]; then
  # 해안 바다 띠 층(PM 기본 판 · T601 추신2) — 결정적 굽기라 늘 다시 굽고 sha 로 본다(해안 손잡이 = env · 비면 b · 정본 coastShift 가 들면 그 판)
  if runlog 8-coast python3 scripts/editor-coast-bake.py; then ccalled="editor-coast-bake.py"; else ccalled="editor-coast-bake.py ✗"; fi
  if runlog 8-check node scripts/editor-baked-check.js; then called="$ccalled · editor-baked-check(같다)"
  else runlog 8-write node scripts/editor-baked-check.js --write && MAPED_UPDATE_PINS=1 runlog 8-pins node scripts/test-map-editor.js; called="$ccalled · editor-baked-check --write · MAPED_UPDATE_PINS=1 test-map-editor"; fi
  if [ "$ccalled" = "editor-coast-bake.py" ] && runlog 8-check2 node scripts/editor-baked-check.js && runlog 8-test node scripts/test-map-editor.js; then g="✓ editor-baked-check · test-map-editor $(grep -oE 'PASS [0-9]+ · FAIL [0-9]+' "$LOG/8-test.log" | tail -1)"
  else g="✗ editor-coast-bake/editor-baked-check/test-map-editor(로그 $LOG/8-*.log)"; fi
  stage 8 "에디터 내장" "해안 띠 층 T588_COAST=${COAST:-b(기본)}" "$called" "$g"
fi

# ── 끝 게이트 — 부팅 · (고르면) 3시드 ─────────────────────────────────────────
if [ $STOP = 0 ] && [ $BOOT = 1 ]; then
  for t in test-nippon-boot test-jungwon-boot; do
    if runlog "9-$t" node scripts/$t.js; then say "[끝] $t ✓ $(grep -oE '(PASS|통과) [0-9]+[^0-9]+[0-9]+' "$LOG/9-$t.log" | tail -1)"; else say "[끝] $t ✗(로그 $LOG/9-$t.log)"; STOP=1; fi
  done
fi
if [ $STOP = 0 ] && [ $RULERS = 1 ]; then
  IFS=, read -r B1 B2 B3 <<<"${T601_BASE:-8279,8258,8591}"; i=0; rb=""
  for s in 1020 7 42; do i=$((i+1)); eval "want=\$B$i"
    T17_JSON="$LOG/ruler-$s.json" node scripts/t17-metrics.js 800 $s > "$LOG/ruler-$s.out" 2>&1
    got=$(node -e "console.log(require('$LOG/ruler-$s.json').base.pop)" 2>/dev/null || echo '?')
    [ "$got" = "$want" ] && rb="$rb $s:$got✓" || { rb="$rb $s:$got✗(기대 $want)"; STOP=1; }
  done
  say "[끝] 3시드 t17(개울 술어 기본) —$rb"
fi

# ── 표 ───────────────────────────────────────────────────────────────────────
TOT=$(diff "$SHA0" <(sha_canon) | awk '/^>/{print $NF}' | sort -u | wc -l | tr -d ' ')
{
echo; echo "| # | 단계 | 입력 | 부른 것 | 바뀐 정본 | 게이트 |"; echo "|---|---|---|---|---|---|"
for r in "${RES[@]}"; do echo "$r"; done
echo; echo "정본 바뀜 합: $TOT 파일 · $( if [ $STOP = 1 ]; then echo '★멈춤 — 빨강 단계 뒤는 안 돌았다'; elif [ -n "$RED" ]; then echo "★빨강 단계$RED(--keep-going — 적용이면 거기서 멈춘다)"; else echo '끝까지 초록'; fi )"
} | tee -a "$LOG/run.txt"
if [ $MODE = dry ]; then
  [ "$TOT" -gt 0 ] && { echo "바뀔 파일:"; diff "$SHA0" <(sha_canon) | awk '/^>/{print "  " $NF}'; }
  [ $KEEP = 1 ] && echo "예행 사본 남김: $W" || rm -rf "$W"
else
  [ "$TOT" -gt 0 ] && echo "레포에 적용됨 — git status 의 정본 파일을 확인하고 커밋(PM)."
fi
echo "로그: $LOG"
[ $STOP = 0 ] && [ -z "$RED" ] || exit 1
