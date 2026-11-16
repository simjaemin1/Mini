# T1277 실험 팔 E(제품 아님 · 판 전용 작업 트리에만 덧댄다) — 회부 1 ⓐ "녹임 목표(흐름 × 30날)를 넘은 곳간에서 그 원석 덩이 값 0"
#   그림자 값 칸 = 그 마을 값표 그대로 · 단 곳간(유효 재고 `sEff`)이 그 원석 목표(`_targetV2` — 값표가 쓰는 그 목표 · 녹임 흐름 × 30날 · 세계 공급 몫 상한)에 닿았으면 0.
#   쓰는 법: python3 E-patch.py <작업 트리 뿌리>
import sys
p = sys.argv[1] + '/sim/economy-sim-v2.js'
s = open(p, 'rb').read()
a = "  for (const id in M) { const f = M[id]; if (!(f > 0)) continue; p += f * (px[id] || 0); }   // ★[T1277] 그림자 값 한 칸(순수출가 안 읽음)\n".encode('utf-8')
b = ("  const _eCtx = _targetCtxV2(v);   // ★[T1277 실험 E] 목표에 닿은 곳간의 덩이 값 0\n"
     "  for (const id in M) { const f = M[id]; if (!(f > 0)) continue; const _T = _targetV2(v, id, _eCtx); p += f * ((_T && _T.sEff >= _T.target) ? 0 : (px[id] || 0)); }\n").encode('utf-8')
assert s.count(a) == 1, 'patch site'
open(p, 'wb').write(s.replace(a, b))
print('E patch applied', p)
