#!/usr/bin/env bash
# (@regress 없음 — 러너 밖 · T588 ④⑤ 한 번에 · 관측 전용 · 세계 무변)
# =============================================================================
# 해안 손잡이 끔 · 켬 a · 켬 b 로 띠를 굽고 → 모양 자(T549) · 바뀌는 것(t588-coast-impact) · 갇힌 땅(T524 자) ·
#   다리 계획(plan-bridges-v2) · 그림(t588-coast-fig) 을 차례로 낸다. (T591 착지 뒤 판 = 추신2 — 참고치 판 mar/mbr 은 없앴다:
#   닛폰 구간 셋이 켬 판에 들어간다.) `now` = ① 지금(끔) 전 뭍 존 띠 · 모양 표 · 세계 그림.
#   T549 모양 자 = `scripts/t549-coast-shape.py`(main) — 다른 판을 쓰려면 env T549_SHAPE.
# 쓰는 법: bash scripts/t588-run.sh <out_dir> [단계…=now,mask,measure,impact,t524,bridge,fig]
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/t588}"; STEPS="${2:-now,mask,measure,impact,t524,bridge,fig}"
mkdir -p "$OUT"
has() { [[ ",$STEPS," == *",$1,"* ]]; }
ZS="hanbando nippon jungwon_n"
arm() { case "$1" in m0) echo '' ;; ma) echo a ;; mb) echo b ;; esac; }
if has now; then
  mkdir -p "$OUT/now"; LZ=$(node -e "const {ZONES}=require('./server/zone-config');console.log(Object.keys(ZONES).filter(k=>!ZONES[k].isOcean).join(' '))")
  args=""; for z in $LZ; do env -u T588_COAST node scripts/t588-coast-mask.js $z "$OUT/now/$z.u8" "$OUT/now/$z.json" > /dev/null || exit 1; args="$args $z=$OUT/now/$z.u8:$OUT/now/$z.json"; done
  python3 scripts/t588-coast-measure.py $args > "$OUT/now/measure_all.json" 2> "$OUT/now/measure_all.log" || { echo '[t588-run] now measure 실패'; tail -3 "$OUT/now/measure_all.log"; exit 1; }
  mkdir -p "$OUT/fig"; python3 scripts/t588-coast-fig.py "$OUT/fig" - - - --now "$OUT/now/measure_all.json" "$OUT/now"
fi
if has mask; then
  for v in m0 ma mb; do mkdir -p "$OUT/$v"; for z in $ZS jungwon_s; do
    a=$(arm $v); if [ -n "$a" ]; then T588_COAST=$a node scripts/t588-coast-mask.js $z "$OUT/$v/$z.u8" "$OUT/$v/$z.json"; else env -u T588_COAST node scripts/t588-coast-mask.js $z "$OUT/$v/$z.u8" "$OUT/$v/$z.json"; fi
  done; done
fi
if has measure; then
  args=""; for v in m0 ma mb; do for z in $ZS; do args="$args ${v}_$z=$OUT/$v/$z.u8:$OUT/$v/$z.json"; done; done
  python3 scripts/t588-coast-measure.py $args > "$OUT/measure.json" 2> "$OUT/measure.log" || { echo '[t588-run] measure 실패'; tail -3 "$OUT/measure.log"; exit 1; }
fi
if has impact; then mkdir -p "$OUT/imp"; for z in $ZS; do node scripts/t588-coast-impact.js $z "$OUT/imp/$z.json" a,b | cut -c1-400; done; fi
if has t524; then
  for v in off a b; do mkdir -p "$OUT/t524/$v"; for z in $ZS; do
    if [ "$v" = off ]; then env -u T588_COAST node scripts/t524-land-audit.js $z "$OUT/t524/$v" > "$OUT/t524/$v/$z.log" 2>&1; else T588_COAST=$v node scripts/t524-land-audit.js $z "$OUT/t524/$v" > "$OUT/t524/$v/$z.log" 2>&1; fi
    echo "[t524] $v $z $(tail -1 "$OUT/t524/$v/$z.log" | cut -c1-140)"
  done; done
fi
if has bridge; then
  mkdir -p "$OUT/br"
  for v in off a b; do for z in $ZS; do f="$OUT/br/$v-$z.log"
    if [ "$v" = off ]; then env -u T588_COAST node scripts/plan-bridges-v2.js $z > "$f" 2>&1; else T588_COAST=$v node scripts/plan-bridges-v2.js $z > "$f" 2>&1; fi
    echo "[bridge] $v $z $(grep -E '^도달 불가|^추가할' "$f" | tr '\n' ' ' | cut -c1-160)"
  done; done
fi
if has fig; then mkdir -p "$OUT/fig"; python3 scripts/t588-coast-fig.py "$OUT/fig" "$OUT" "$OUT/measure.json" "$OUT/imp"; fi
echo "[t588-run] 끝 — $OUT"
