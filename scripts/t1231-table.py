#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T1231 표) — `t1231-observe.js` 가 낸 `<판>-<시드>.t1231.json` 들을 표로.
#   쓰는 법: python3 scripts/t1231-table.py <json> [<json> …]
#   낮 몫 % = 그 상태 사람-틱 ÷ 낮 사람-틱 · µs = 그 상태 ns 합 ÷ 사람-틱 ÷ 1000(시계 몫 빼기 전 · 뺀 값은 괄호)
import json, sys, collections

STATES = ['work', 'walk', 'wander', 'rest', 'sleep', 'eat', 'other']
KO = {'work': '일', 'walk': '걸음', 'wander': '배회', 'rest': '쉼', 'sleep': '잠', 'eat': '먹기', 'other': '그 밖'}
WALK = {'출근', '귀가', '운반', '저장', '인출'}
WORK = {'경작', '수확', '낚시', '드리움', '놓침', '낚음', '벌목', '채석', '채광', '제작', '수색', '채집', '파종', '모내기', '김매기', '추수', '사냥', '건축', '개간'}

def load(paths):
    tot = {'calls': 0, 'ns': 0, 'overNs': 0, 'overN': 0}
    tabs = {k: collections.defaultdict(lambda: [0, 0]) for k in ('byState', 'byJob', 'bySeason', 'bySize', 'byWar', 'labels')}
    vill = []
    for p in paths:
        d = json.load(open(p))
        for k in tot: tot[k] += d.get(k, 0)
        for t in tabs:
            for k, v in (d.get(t) or {}).items():
                tabs[t][k][0] += v[0]; tabs[t][k][1] += v[1]
        vill += d.get('vill') or []
    return tot, tabs, vill

def fix(tabs):
    # 관찰기가 놓친 일 라벨(첫 판의 '모내기' 등) — 라벨 표에서 다시 가른다: 일 라벨인데 쉼 → 일 · 배회 → 걸음
    moved = collections.defaultdict(lambda: [0, 0])
    for k, v in tabs['labels'].items():
        dn_st, lab, beh = k.split('|')
        dn, st = dn_st.split(':')
        if lab in WORK and st in ('rest', 'wander'):
            ns = 'work' if st == 'rest' else 'walk'
        elif lab in WALK and st in ('rest', 'wander'):
            ns = 'walk'
        else:
            continue
        moved[(dn, st, ns)][0] += v[0]; moved[(dn, st, ns)][1] += v[1]
    for (dn, st, ns), v in moved.items():
        for src, dst in ((dn + ':' + st, dn + ':' + ns),):
            tabs['byState'][src][0] -= v[0]; tabs['byState'][src][1] -= v[1]
            tabs['byState'][dst][0] += v[0]; tabs['byState'][dst][1] += v[1]
    return moved

def share(tab, prefix=''):
    out = {}
    for dn in ('d', 'n'):
        tot = sum(v[0] for k, v in tab.items() if k.startswith(prefix) and k[len(prefix):].startswith(dn + ':'))
        out[dn] = {s: (tab.get(prefix + dn + ':' + s, [0, 0])[0] / tot * 100 if tot else 0) for s in STATES}
        out[dn]['_n'] = tot
    return out

def us(tab, prefix=''):
    out = {}
    for dn in ('d', 'n'):
        for s in STATES:
            v = tab.get(prefix + dn + ':' + s)
            out[dn + ':' + s] = (v[1] / v[0] / 1000) if v and v[0] else None
        a = [v for k, v in tab.items() if k.startswith(prefix + dn + ':')]
        n = sum(x[0] for x in a); ns = sum(x[1] for x in a)
        out[dn + ':all'] = ns / n / 1000 if n else None
    return out

def fmt(x, nd=1): return '—' if x is None else f'{x:.{nd}f}'

def main(paths):
    tot, tabs, vill = load(paths)
    moved = fix(tabs)
    over = tot['overNs'] / tot['overN'] / 1000 if tot['overN'] else 0
    print(f"# 판 {len(paths)} · npcStep 부름 {tot['calls']:,} · 평균 {tot['ns']/tot['calls']/1000:.3f} µs · 시계 한 번 몫 {over:.3f} µs")
    S = share(tabs['byState']); U = us(tabs['byState'])
    print('\n## 상태 몫(사람-틱 %) · µs/사람-틱(시계 몫 뺀 값)')
    print('| 상태 | 낮 몫 % | 밤 몫 % | 낮 µs | 밤 µs |\n|---|---:|---:|---:|---:|')
    for s in STATES:
        print(f"| {KO[s]} | {fmt(S['d'][s])} | {fmt(S['n'][s])} | {fmt(U['d:'+s] and U['d:'+s]-over,3)} | {fmt(U['n:'+s] and U['n:'+s]-over,3)} |")
    print(f"| 합(사람-틱) | {S['d']['_n']:,} | {S['n']['_n']:,} | {fmt(U['d:all']-over,3)} | {fmt(U['n:all']-over,3)} |")
    for name, key in (('직업', 'byJob'), ('철', 'bySeason'), ('마을 크기', 'bySize'), ('전쟁 중 마을', 'byWar')):
        groups = sorted({k.split('|')[0] for k in tabs[key]})
        print(f'\n## {name}별 낮 몫 %(밤 잠 몫) · 낮 µs')
        print('| ' + name + ' | 낮 사람-틱 | ' + ' | '.join(KO[s] for s in STATES) + ' | 밤 잠 % | 낮 µs |\n|---|---:|' + '---:|' * len(STATES) + '---:|---:|')
        for g in groups:
            sub = {k.split('|', 1)[1]: v for k, v in tabs[key].items() if k.split('|')[0] == g}
            sh = share(sub); u = us(sub)
            if not sh['d']['_n'] and not sh['n']['_n']: continue
            print(f"| {g} | {sh['d']['_n']:,} | " + ' | '.join(fmt(sh['d'][s]) for s in STATES) + f" | {fmt(sh['n']['sleep'])} | {fmt(u['d:all'] and u['d:all']-over,3)} |")
    print('\n## 라벨 위 25(낮 · 밤 · 상태 · 라벨 · 행동 · 사람-틱 · µs)')
    for k, v in sorted(tabs['labels'].items(), key=lambda x: -x[1][0])[:25]:
        print(f"| {k} | {v[0]:,} | {v[1]/v[0]/1000-over:.3f} |")
    if moved: print('\n(라벨 표로 다시 가른 몫: ' + ', '.join(f"{a}:{b}→{c} {v[0]:,}" for (a, b, c), v in moved.items()) + ')')
    if vill:
        e = sum(v['econ'] for v in vill); b = sum(v['bodies'] for v in vill)
        print(f"\n몸 · econ 사람(판 끝 · 판 합): 몸 {b:,} · econ {e:,} · 몸 몫 {b/e*100 if e else 0:.1f}%")

if __name__ == '__main__':
    main(sys.argv[1:])
