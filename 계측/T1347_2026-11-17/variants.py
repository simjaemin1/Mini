#!/usr/bin/env python3
# T1347 판정 표 갈래 — 판 자 작업 트리의 `sim/economy-sim.js` 에만 박는 사본(제품 무변 · 레포 글자는 그대로 · 서버 자 판은 이 파일을 읽는다)
#   쓰는 법: python3 계측/T1347_2026-11-17/variants.py <작업 트리> <ga|na|da>
#   (가) ga — 광산5(세계에서 주석이 나는 한 곳)를 먹인다: 마을 틱 머리에서 곳간 식량을 60 일치(식량 안보 0.5 — 잘 먹는 갈래 0.45 위)까지 그 자리에서 채운다.
#            어디서 오는지 묻지 않는 위 끝(먹인 양은 `_t1347Fed` 에 쌓는다 — t1347 관찰기가 읽는다).
#   (나) na — 취약 갈래에도 청동 몫: 주조 문이 "근접검 < 전사 실수요"뿐 아니라 "오늘 배합이 청동이고 청동 근접검 < 사람 × 0.72 × 0.45"여도 연다 ·
#            석공 청동 우선권 · 대장장이 자리의 청동 몫 셈에서 잘 먹는 날 조건을 뺀다 · 청동 몫 셈(T1344 `_t1344Q`)을 켠다.
#   (다) da — 취약 갈래 한도의 최솟값 2 를 그 마을 청동 몫 크기(사람 × 0.72 × 0.45)로: max(2, 사람 × 0.72 × 0.45, 전사 × 1.2) — 근접검 전부를 센다(석검 포함).
#   바꾼 자리는 갈래마다 정확히 그 수(아래 단언) — 하나라도 안 맞으면 멈춘다.
import sys, os
wt, v = sys.argv[1], sys.argv[2]
p = os.path.join(wt, 'sim', 'economy-sim.js')
s = open(p, encoding='utf-8').read()
def rep(old, new):
    global s
    n = s.count(old)
    assert n == 1, (v, n, old[:90])
    s = s.replace(old, new)
if v == 'ga':
    rep("  if (v.npcs.length === 0) return;\n",
        "  if (v.npcs.length === 0) return;\n"
        "  if (v.name === '광산5') { const _n = v.npcs.length, _need = _n * 60 - totalFoodEquivalent(v); if (_need > 0) { v.storage.food = (v.storage.food || 0) + _need; v._t1347Fed = (v._t1347Fed || 0) + _need; } }   // ★[T1347 판정 표 (가) · 판 자 사본만]\n")
elif v == 'na':
    rep("const T1344_BRONZE_STOCK = (typeof process !== 'undefined' && process.env && process.env.T1344_BRONZE_STOCK === '1');",
        "const T1344_BRONZE_STOCK = true;   // ★[T1347 판정 표 (나) · 판 자 사본만] 청동 몫 셈을 켠다")
    rep("if (_melt && (_smSwordStock < _bronzeArmoryCap || (T1333_EXPORT_CAST && _t1333ExportCast(v)))) {",
        "if (_melt && (_smSwordStock < _bronzeArmoryCap || (_melt.bronzeness > 0 && _t1344BronzeStock(v) < (v.npcs.length || 0) * MELEE_ARMORY_PC * BRONZE_ARMORY_FRAC) || (T1333_EXPORT_CAST && _t1333ExportCast(v)))) {")
    rep("((T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF) ? _t1344BronzeStock(v) : _swordStock) < _bronzeArmoryCap",
        "((T1344_BRONZE_STOCK) ? _t1344BronzeStock(v) : _swordStock) < _bronzeArmoryCap")
    rep("const _t1344L = (T1344_BRONZE_STOCK && hasBronze && (v.storage.tin || 0) >= 0.12 && _foodSecF(v) > MELEE_ARMORY_SECF)",
        "const _t1344L = (T1344_BRONZE_STOCK && hasBronze && (v.storage.tin || 0) >= 0.12)")
elif v == 'da':
    rep(": Math.max(2, (v.counts.warrior || 0) * MELEE_COV_BUFFER);   // 취약 마을 = 전사 커버리지만",
        ": Math.max(2, (v.npcs.length || 0) * MELEE_ARMORY_PC * BRONZE_ARMORY_FRAC, (v.counts.warrior || 0) * MELEE_COV_BUFFER);   // ★[T1347 판정 표 (다) · 판 자 사본만] 최솟값 2 → 청동 몫 크기")
else:
    sys.exit('갈래 모름 ' + v)
open(p, 'w', encoding='utf-8').write(s)
print('갈래', v, '박음 —', p)
