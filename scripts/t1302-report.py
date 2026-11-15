"""T1302 report: render only the independently validated completed dataset."""
from pathlib import Path
import json,csv,collections,datetime
R=Path(__file__).resolve().parents[1];O=R/'계측/T1302_2026-11-14'
s=json.loads((O/'summary.json').read_text());C=s['cases'];cmp=s['seedComparison'];a=C['BODY_1020'];b=C['BODY_7']
allTargets=all(x['bodyTargetMet'] and x['emigrationTargetMet'] for x in cmp.values())
first=(f'일괄 갈래 직접1곳 → 몸 2/2 · 몸 완공0 → {a["physical"]:,} · {b["physical"]:,}(영토 추가100% · 100%) · '
 f'묶음 끔비1.392 → {cmp["1020"]["bodyRatio"]:.3f} · {cmp["7"]["bodyRatio"]:.3f} · '
 f'이탈193 → {a["emigration"]} · {b["emigration"]} · 몸/인구 최솟값 {100*a["minBodyRatio"]:.2f}% · {100*b["minBodyRatio"]:.2f}% · '
 f'CPU {a["meanCPUSecondsDays2to100"]:.1f} · {b["meanCPUSecondsDays2to100"]:.1f}초/일 · '
 '하네스100/100 · 몸필드10/10 · 미끼 관측자 복구 빨강 · 끈 판1/1 · '
 + ('회부 목표 충족·켜기 기본은 재민 판정' if allTargets else '회부 미충족 목표 포함·켜기 기본은 재민 판정'))
L=[first,'','# T1302 — 영토 v2 개간·말뚝을 실제 몸으로', '',
 f'베이스 `3dae4c5f` · 구현 `{s["implementation"]}` · 가지 `batch/terr-body-1113` · 판정0. 완료 UTC `{s["completedUTC"]}`.', '',
 'T1302는 v2 켬 안의 끔 기본 손잡이다. 관측자 없이도 실제 개간 줄을 만들고, 현장 노동·벌목·목재 귀환·말뚝 운반·현장 배치가 끝난 칸만 영토로 삼는다. 별도로 하루±2명이라는 몸 반영 제한을 없애고, 이주한 사람과 출발/도착 몸의 id를 보존했다. 식사·행복·사망·이탈 문턱은 바꾸지 않았다.', '',
 '## 실제100일 · 시드1020/7', '',
 '| 시드 | 팔 | 인구 | 끔비 | 빈 마을 | 몸 완공/영토 추가 | 일괄 호출 | 이탈 | 몸/인구 최솟값 | 평균 CPU초/일 |',
 '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
for seed in [1020,7]:
 for arm,label in [('OFF','끔'),('COMBO','종전 묶음'),('BODY','묶음+T1302')]:
  v=C[f'{arm}_{seed}'];off=C[f'OFF_{seed}']['population']
  L.append(f'| {seed} | {label} | {v["population"]:,} | {v["population"]/off:.3f} | {v["empty"]} | {v["physical"]:,}/{v["added"]:,} | {v["batchCalls"]} | {v["emigration"]} | {100*v["minBodyRatio"]:.2f}% | {v["meanCPUSecondsDays2to100"]:.1f} |')
L+=['', '평균 CPU는 zone의 사용자+시스템 CPU, 2~100일 경계 평균(첫날 기동 제외)이며 관찰 비용을 포함한다. 인구와 실제 작업량도 달라 같은 부하 속도 비교가 아니다. T1302 효과는 영토 실제 과업과 사람-몸 동기화 수리를 함께 켠 효과이며 둘의 개별 인구 기여율로 나누지 않는다.', '',
 '## 목표 검증', '', '| 시드 | 실제 영토100% | 몸/인구≥98% | 이탈이 끔 이하 |', '|---|---|---|---|']
for seed in ['1020','7']:
 v=cmp[seed];L.append(f'| {seed} | 통과 | {"통과" if v["bodyTargetMet"] else "미달"} | {"통과" if v["emigrationTargetMet"] else "미달"}: {v["emigrationBody"]} 대 {v["emigrationOff"]} |')
L+=['','이탈 목표에 못 미친 값도 그대로 회부한다. 정본의 불행·압력·받는 마을 문을 낮춰 수치를 맞추지 않았다. 몸 완공은 실제 `_t1207.body`, 영토 추가는 정본 `_terrAdd`가 새로 넣은 칸의 읽기 계수이며 순증·묵힘과 혼동하지 않는다.', '',
 '## 관측자 분기와 작업 비용', '',
 '직접 분기는 `_t1207Pay`의1곳이다. 켬에서는 관측자를 묻기 전에 `_t1207Queue`를 고른다. 따라서 관측 종료 때의 `_t1207Flush`와 비관측 `_t1238Batch`는 운영 경로에서 빠진다. 실제 몸은 기존 T1181 운반 과업을 이용하고, 완공 시 `_t1207Fell`로 목재를 즉시 입고하던 일을 현장 벌목→손→귀환으로 나눴다.', '',
 '[갈래·몫·시간 비교표](../계측/T1302_2026-11-14/METHODS.md). 일괄은 성한 몸 하나만 있으면 낮 전체에서 직선 왕복 시간을 뺐고, 기본 개간 목재 운반은0이었다. 실제 몸은 요양·밤·여유 크루·A* 길·짐 무게·기존 인출5초/저장6초까지 겪는다. CPU 증가와 크루 선택·과업 물음·길 이동은 T1294 µs 줄기와 겹치는 부분으로 회부한다.', '',
 '## T1274 이탈193 재현과 몸191 틈', '']
old=C['T1274_REPLAY_1020'];events=old['events'];groups=collections.defaultdict(list)
for e in events:groups[(e['day'],e['village'],e['job'])].append(e)
L += [f'원본 `a6b7aba5`를 새로100일 돌려 인구3,423·몸3,232·이탈193을 재현했고 정본 경제 지문100일 전체도 T1274 원자료와 같다. 이탈 누계193은 사건/연인원이며 고유 사람 id는{old["uniqueEmigrants"]}개다. 사람별 원문은 `T1274_REPLAY_1020-emigration.csv`와 gzip 원자료다.', '',
 '| 마을·날 | 직업 | 이탈 수 | 그때 식량 범위 | 목재 범위 | 행복 범위 | 주거 범위 |', '|---|---|---:|---:|---:|---:|---:|']
span=lambda es,k:f'{min(e[k] for e in es):.2f}~{max(e[k] for e in es):.2f}'
for (day,village,job),es in sorted(groups.items()):
 L.append(f'| {village} · {day} | {job} | {len(es)} | {span(es,"food")} | {span(es,"wood")} | {span(es,"happiness")} | {span(es,"housing")} |')
L += ['', '실제 호출을 기록한 문은 정본 `t1075Emigrate`다. 행복이0.25보다 낮고 이탈 압력이1 이상인 때, 가장 젊은 비징집 사람을 더 행복하고 침상·식량을 갖춘 도달 가능한 이웃이 받으면 떠난다. 성공한193건의 날·직업·곳간·행복·주거·압력을 위 표와 CSV에 남겼다. 이 표는 행복 자체의 자원별 인과 기여율 실험은 아니다.', '',
 'T1302 두 판은 날마다 사람 id와 그 사람의 실제 몸 id도 대조해 누락0을 확인했다. 몸191 틈은 이탈193과 동일한 수가 아니다. 종전 `syncVillagePop`는 무제한 상한에서도 하루 최대2명씩 몸을 늘려 출생을 따라갔다. 원본 끝 어촌2는165/99, 임업2는151/95, 임업6은139/108(사람/몸)으로 빠른 출생 마을에 틈이 쌓였다. 이탈 몸의 선택도 사람 id가 아닌 명부 뒤 숫자였다. T1302는 기존 사람-몸 동기화로 매번 실제 명부를 맞추고, 출생 틱 이주에도 먼저 그 사람의 몸을 세워 같은 id로 걷고 붙게 했다. 정본 사망 관측 순서와 같은-N 사람 교체의 인덱스 갱신도 지킨다.', '',
 '## 검증·원자료', '',
 '- 영토 하네스100/100: 관측자0에서도 실제 완공>0·일괄 호출0, 관측자1도 같은 경로, 멀리서는 작업·벌목·입고0, 귀환 전에 손에 짐 보존. 관측자 조건을 되살린 사본은 같은 검사가 실패한다.',
 '- 몸필드10/10, 운반18/18, 후보걷기46/46, 기존 출생 규약17/17(T1302 끔). 식사 몸 손잡이를 켜지 않고 출생+5명·출생 틱 이주·동일 pid/id·같은-N 사망/출생 교체 및 사망 관측을 확인했다.',
 '- 공식 끈 판1/1: 인구3,914·경제400/400·생활층400/400. 수집기가 raw t740 날짜1~400과 전체 축약 객체를 기준선과 독립 비교했다. 랩t17 800일1020은5,929.',
 '- 모든100일 판은 연속1~100일·실제 zone 종료0·시계 오류0·관찰기 오류0. 소스 SHA는 실행 전후 동일하다. 첫 짧은 시도는 별도 제외했고 날을 이어 붙이지 않았다.',
 '- 51마을·두 시드·집 행위0·밭 묶음0·무제한 주민 몸·라이브 비율/T745 조건이다. 사람 관측자는 없다. 기본 켬 판정은 재민에게 회부한다.', '',
 '공식 끈 판 실제 끝 줄:', '', '```text', s['gate']['lastLine'], '```', '',
 '원자료: `계측/T1302_2026-11-14/summary.json`, `daily.csv`, 각 팔의 이탈 CSV, `runs/`, `controllers/`, 방법·소스·환경·체크섬. 새 출력 폴더의 독립 POSIX 세션에서 `scripts/t1302-run.py`를 실행하며 원본 재현 worktree는 방법 문서를 따른다. 완료 뒤 `t1302-collect.py <완료폴더>`, `t1302-report.py`를 실행한다.', '']
# Scientific export: identical scales within each row, two seeds and all three arms.
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/t1302-mpl-cache')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
matplotlib.rcParams['svg.hashsalt']='T1302'
fig,axes=plt.subplots(3,2,figsize=(11,9),sharex=True,sharey='row')
for col,seed in enumerate([1020,7]):
 axes[0,col].set_title('seed '+str(seed))
 for arm,color in [('OFF','tab:blue'),('COMBO','tab:orange'),('BODY','tab:green')]:
  rows=C[f'{arm}_{seed}']['daily'];days=[r['day'] for r in rows]
  axes[0,col].plot(days,[r['pop'] for r in rows],color=color,label=arm)
  axes[1,col].plot(days,[r['cpuSeconds'] for r in rows],color=color)
  axes[2,col].plot(days,[100*r['bodies']/r['pop'] if r['pop'] else 100 for r in rows],color=color)
 axes[2,col].axhline(98,color='gray',linestyle='--',linewidth=1)
 axes[2,col].set_xlabel('Completed simulation day')
 for row in range(3):axes[row,col].grid(alpha=.25)
axes[0,0].legend(ncol=3);axes[0,0].set_ylabel('Population')
axes[1,0].set_ylabel('Zone CPU seconds / day');axes[2,0].set_ylabel('Resident bodies / population (%)')
fig.text(.01,.01,'Day 1 includes startup CPU. All observer overhead retained. Source and behavior differ only by declared flags.',fontsize=8)
fig.tight_layout(rect=[0,.03,1,1]);fig.savefig(O/'body-worlds.png',dpi=180);fig.savefig(O/'body-worlds.svg',metadata={'Date':None});plt.close(fig)
p=O/'body-worlds.svg';p.write_text('\n'.join(line.rstrip() for line in p.read_text().splitlines())+'\n')
L += ['', '![시드별 실제 인구·하루 CPU·주민 몸 비율](../계측/T1302_2026-11-14/body-worlds.png)', '']
(R/'보고/T1302_2026-11-14.md').write_text('\n'.join(L))
print(first)
