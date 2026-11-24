#!/usr/bin/env python3
# T1452 진단 — 지금 식 셋((가) · 겪은 낙폭 · 한 해 율)이 날마다 말한 "모자람"이 실제와 얼마나 어긋났나 · 앞날 장부(켠 판)도 같은 자로
#   훅 칸(t1452hook.js · .t1452.json[.gz])에서 마을 · 날마다:
#     곳간 날치 sd = S ÷ (N × 하루치)
#     실제 모자람(앞 H 날) = 그날 뒤 H 날 안에 못 먹은 날(빚 Σ `_fdS` > 0)이 있다
#     (가)          모자람이라 함 ⇔ sd < ga(버틸 날)
#     겪은 낙폭      모자람이라 함 ⇔ sd < ga + 여유분(T1437 고리 셈을 칸에서 따로 — x = sd − 빚 ÷ N · 지난 365날 꼭대기 → 바닥 · 한 해 전 = 가뭄 14)
#     한 해 율       모자람이라 함 ⇔ yf < N × 하루치(T1421 출생 문의 율 — 한 사람 더 아닌 지금 사람)
#     앞날 장부      모자람이라 함 ⇔ sd < need(켠 판 칸 ah[4] — 여유분까지 든 문 값)
#     장부 골        모자람이라 함 ⇔ 0 밑 첫날(ah[9]) ≤ H(여유분 없이 — 예상 곳간 그 자체가 앞 H 날 안에 0 밑으로 가나)
#   틀린 날 = 모자란데 넉넉하다 함(놓침) · 넉넉한데 모자라다 함(헛울림) — 마을-날 %(산 마을 · 끝 H 날 뺌)
# 쓰는 법: python3 t1452_diag.py <out.json> <run.t1452.json[.gz]> … [--H 90] [--plot out.png]
import json, sys, gzip, os, math

def _load(f):
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

def typ(nm):
    import re
    return re.sub(r'[0-9]+$', '', nm or '')

def buf_series(sd, sh, N, Y=365, dr=14):   # T1437 고리 셈(곳간 날치 − 빚 ÷ 사람) — 날마다 그날 아침 앞 Y 칸의 가장 깊은 낙폭
    x = [None if (s is None or not n) else s - (b or 0) / n for s, b, n in zip(sd, sh, N)]
    out = []
    for t in range(len(x)):
        if t < Y: out.append(dr); continue
        pk, dd = -1e18, 0.0
        for k in range(t - Y, t):
            v = x[k]
            if v is None: continue
            if v > pk: pk = v
            elif pk - v > dd: dd = pk - v
        out.append(dd)
    return out

def one(f, H):
    d = _load(f); dfc = d.get('dfc') or 1.0; tag = os.path.basename(f).split('.')[0]
    rows = {'ga': [0, 0, 0], 'seen': [0, 0, 0], 'yf': [0, 0, 0], 'ah': [0, 0, 0], 'ah0': [0, 0, 0]}   # [놓침, 헛울림, 날]
    by_type = {}
    for v in d['vil']:
        S, N, sh, ga, yf = v['S'], v['N'], v['sh'], v['ga'], v['yf']
        L = len(S)
        sd = [(S[i] / (N[i] * dfc)) if (N[i] and S[i] is not None) else None for i in range(L)]
        hungry = [(sh[i] or 0) > 1e-6 for i in range(L)]
        # 앞 H 날 안 못 먹은 날(뒤에서부터 · 다음 배고픈 날까지 거리)
        nxt = [None] * L; nh = None
        for i in range(L - 1, -1, -1):
            nxt[i] = nh
            if hungry[i]: nh = i
        bf = buf_series(sd, sh, N)
        T = by_type.setdefault(typ(v['name']), {'ga': [0, 0, 0], 'seen': [0, 0, 0], 'yf': [0, 0, 0], 'ah': [0, 0, 0], 'ah0': [0, 0, 0]})
        for i in range(L - H):
            if not N[i] or sd[i] is None: continue
            truth = nxt[i] is not None and nxt[i] - i <= H
            claims = {}
            if ga[i] is not None: claims['ga'] = sd[i] < ga[i]; claims['seen'] = sd[i] < ga[i] + bf[i]
            if yf[i] is not None: claims['yf'] = yf[i] < N[i] * dfc
            a = v.get('ah', [None] * L)[i] if v.get('ah') else None
            if a and len(a) > 4 and a[4] is not None: claims['ah'] = sd[i] < a[4]
            if a and len(a) > 9: claims['ah0'] = bool(a[9]) and a[9] <= H
            for k, c in claims.items():
                for R in (rows[k], T[k]):
                    R[2] += 1
                    if truth and not c: R[0] += 1
                    if c and not truth: R[1] += 1
    pct = lambda R: {'놓침%': round(100 * R[0] / max(1, R[2]), 1), '헛울림%': round(100 * R[1] / max(1, R[2]), 1), '틀림%': round(100 * (R[0] + R[1]) / max(1, R[2]), 1), '날': R[2]}
    return {'tag': tag, 'arm': d.get('arm'), 'H': H, 'all': {k: pct(R) for k, R in rows.items() if R[2]}, 'byType': {t: {k: pct(R) for k, R in T.items() if R[2]} for t, T in by_type.items()}}

def plot(files, out):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib import font_manager as fm
    for f in fm.findSystemFonts():
        if any(k in f for k in ('NanumGothic.ttf', 'NotoSansCJK-Regular', 'NotoSansKR')):
            fm.fontManager.addfont(f); plt.rcParams['font.family'] = fm.FontProperties(fname=f).get_name(); break
    plt.rcParams['axes.unicode_minus'] = False
    SURF, INK, INK2, GRID = '#fcfcfb', '#0b0b0b', '#52514e', '#e4e3df'
    C = {'sd': INK, 'ga': '#2a78d6', 'seen': '#eb6834', 'yf': '#1baf7a', 'ah': '#6250d6'}
    panels = []
    for f in files:
        d = _load(f); dfc = d.get('dfc') or 1.0
        if d.get('server'):
            for t in ('농촌', '어촌', '광산', '임업'):
                cand = [v for v in d['vil'] if typ(v['name']) == t and v['N'] and max(v['N']) > 0]
                if not cand: continue
                cand.sort(key=lambda v: sorted(v['N'])[len(v['N']) // 2])
                panels.append(('밭 세계', d, cand[len(cand) // 2]))
        else:
            cand = [v for v in d['vil'] if v['N'] and max(v['N']) > 0]
            cand.sort(key=lambda v: sorted(v['N'])[len(v['N']) // 2])
            panels.append(('끔 세계(랩)', d, cand[len(cand) // 2]))
    fig, axs = plt.subplots(len(panels), 1, figsize=(12.5, 3.1 * len(panels) + 0.8), facecolor=SURF, sharex=False)
    if len(panels) == 1: axs = [axs]
    for ax, (wn, d, v) in zip(axs, panels):
        dfc = d.get('dfc') or 1.0; S, N, sh, ga, yf = v['S'], v['N'], v['sh'], v['ga'], v['yf']; L = len(S); d0 = v.get('d0', 0)
        xs = list(range(d0 + 1, d0 + L + 1))
        sd = [(S[i] / (N[i] * dfc)) if N[i] else None for i in range(L)]
        bf = buf_series(sd, sh, N)
        yfd = [(365 * (1 - (yf[i] - S[i] / 365) / (N[i] * dfc))) if (N[i] and yf[i] is not None) else None for i in range(L)]
        ax.set_facecolor(SURF)
        for i in range(L):
            if (sh[i] or 0) > 1e-6: ax.axvspan(xs[i] - 0.5, xs[i] + 0.5, color='#f6d0cf', lw=0, zorder=0)
        ax.plot(xs, sd, color=C['sd'], lw=2.0, label='곳간 날치(실제)', zorder=4)
        ax.plot(xs, ga, color=C['ga'], lw=1.2, label='(가) 버틸 날', zorder=3)
        ax.plot(xs, [None if g is None else g + b for g, b in zip(ga, bf)], color=C['seen'], lw=1.2, ls=(0, (5, 2)), label='(가) + 겪은 낙폭', zorder=3)
        ax.plot(xs, yfd, color=C['yf'], lw=1.2, ls=(0, (1, 1.5)), label='한 해 율이 모자람이라 할 곳간 날치', zorder=3)
        if v.get('ah') and any(a for a in v['ah']):
            ax.plot(xs, [a[4] if (a and len(a) > 4) else None for a in v['ah']], color=C['ah'], lw=1.5, label='앞날 장부 버틸 날', zorder=3)
        top = max([x for x in sd if x is not None] + [10])
        ax.set_ylim(0, min(top * 1.25, 900))
        ax.grid(axis='y', color=GRID, lw=0.8); ax.set_axisbelow(True)
        for s_ in ('top', 'right'): ax.spines[s_].set_visible(False)
        for s_ in ('left', 'bottom'): ax.spines[s_].set_color(INK2)
        ax.tick_params(colors=INK2, labelsize=8.5)
        ax.set_title(f"{wn} — {v['name']}(사람 가운데 {sorted(N)[len(N) // 2]}) · 붉은 칸 = 못 먹은 날", loc='left', fontsize=11, color=INK, pad=6)
        ax.set_ylabel('날치', color=INK2, fontsize=9)
    H_, L_ = axs[0].get_legend_handles_labels()
    fig.legend(H_, L_, frameon=False, fontsize=9, loc='upper left', ncol=5, bbox_to_anchor=(0.02, 0.985 - 0.35 / fig.get_figheight()))   # 그림 머리 밑 한 줄(칸 위 선을 안 가린다)
    axs[-1].set_xlabel('날', color=INK2, fontsize=9.5)
    fig.suptitle('T1452 진단 — 실제 곳간 날치와 지금 식 셋 · 앞날 장부가 날마다 말한 "버틸 날"(곳간 날치가 이 선 밑이면 모자람이라 한다)', x=0.02, ha='left', fontsize=13, color=INK)
    fig.tight_layout(rect=(0, 0, 1, 1 - 0.9 / fig.get_figheight()))
    fig.savefig(out, dpi=170, facecolor=SURF)
    return out

def main():
    A = sys.argv[1:]; out = A[0]; H = 90; pl = None; files = []
    i = 1
    while i < len(A):
        if A[i] == '--H': H = int(A[i + 1]); i += 2; continue
        if A[i] == '--plot': pl = A[i + 1]; i += 2; continue
        files.append(A[i]); i += 1
    R = [one(f, h) for f in files for h in sorted({30, H, 180})]
    json.dump(R, open(out, 'w'), ensure_ascii=False, indent=1)
    for r in R: print(r['tag'], r['arm'], 'H', r['H'], r['all'])
    if pl: print(plot(files, pl))

if __name__ == '__main__':
    main()
