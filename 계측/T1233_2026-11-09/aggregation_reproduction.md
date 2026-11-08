# 공개 자료 집계 재현 및 문서 대조

이 절은 고증 원문을 대신하는 추정이나 게임 시험이 아니다. 공개 CSV를 읽어 문서에 기록한 집계·분모·결측 처리·입력 해시가 일치하는지 확인하는 절차다. 연구자의 공표 통계 모형을 실행하지 않는다.

## 입력

저자 저장소를 임시 경로에 읽어온 후 아래 고정 커밋으로 맞춘다. 이미 같은 커밋의 사본이 있으면 다시 내려받을 필요가 없다.

- `/tmp/t1233-research/hgc-ta`: `https://github.com/sheinalewlevy/HGC-TA`, `dffa7fa883fbf2a4b8d8f90c8a7fe30c0bc3126b`.
- `/tmp/t1233-research/dplace-sccs`: `https://github.com/D-PLACE/dplace-dataset-sccs`, `734044bf96880420d64156625e869c6d57a734a7`.

아래 Python은 개인별 행을 새 파일로 내보내지 않고 기존 집계 CSV와 대조한다. 산술 범위는 `public_data_method.md`와 같다. Python 표준 라이브러리만 사용한다. 다른 체크아웃 경로를 쓸 때는 `D`와 `roots`만 바꾼다.

```python
import csv,json,hashlib,math,collections
from pathlib import Path
D=Path('/workspace/Mini/계측/T1233_2026-11-09')
P=json.loads((D/'provenance.json').read_text())
roots={'hgc':Path('/tmp/t1233-research/hgc-ta'),'dplace':Path('/tmp/t1233-research/dplace-sccs')}
for tag,root in roots.items():
 for name,m in P['sources'][tag]['files'].items():
  b=(root/name).read_bytes()
  assert len(b)==m['bytes'] and hashlib.sha256(b).hexdigest()==m['sha256'],(tag,name)
def num(v):
 try:
  n=float(v);return n if math.isfinite(n) else None
 except (ValueError,TypeError):return None
expected={(r['dataset'],r['activity']):r for r in csv.DictReader((D/'hgc_descriptive.csv').open())}
seen=set()
for name in P['sources']['hgc']['files']:
 if not name.endswith('.csv'):continue
 rs=list(csv.DictReader((roots['hgc']/name).open(encoding='utf-8-sig')))
 rs=[r for r in rs if num(r.get('Age')) is not None and 3<=math.floor(num(r['Age']))<=20 and num(r.get('offset')) is not None and num(r['offset'])>0]
 for col in ['food_production','household','childcare','play']:
  a=[r for r in rs if num(r.get(col)) is not None];n=sum(num(r[col]) for r in a);den=sum(num(r['offset']) for r in a);e=expected[name,col];seen.add((name,col))
  actual={'eligible_rows':len(rs),'category_known_rows':len(a),'unique_ids':len({r['newID'] for r in a}),'numerator':n,'offset_denominator':den,'percent':round(100*n/den,6) if den else None,'min_age':min((num(r['Age']) for r in a),default=None),'max_age':max((num(r['Age']) for r in a),default=None)}
  for k,v in actual.items():
   if v is None:assert e[k]=='',(name,col,k)
   else:assert abs(float(e[k])-v)<1e-8,(name,col,k,e[k],v)
assert seen==set(expected)
vars={'SCCS116','SCCS121','SCCS123','SCCS125','SCCS127','SCCS128'}
counts=collections.Counter();societies=collections.defaultdict(set)
for r in csv.DictReader((roots['dplace']/'cldf/data.csv').open()):
 if r['Var_ID'] in vars:counts[r['Var_ID'],r['Code_ID']]+=1;societies[r['Var_ID']].add(r['Soc_ID'])
rows=list(csv.DictReader((D/'dplace_codes.csv').open()))
assert {(r['variable_id'],r['code_id']):int(r['count']) for r in rows}==dict(counts)
for v in vars:assert sum(n for (a,b),n in counts.items() if a==v)==186 and len(societies[v])==186
metrics=list(csv.DictReader((D/'requested_metrics.csv').open()))
assert len(metrics)==24 and len({r['metric_id'] for r in metrics})==24
assert all(r['status']=='미확인' and r['value']=='' and r['range']=='' for r in metrics)
print('원자료 20파일 SHA-256 일치 · HGC 48집계행 재계산 일치 · SCCS 6변수 각186사회/행 일치 · 요청24지표 미확인 표시 일치')
```

이번 대조 결과: 원자료 20파일의 크기·SHA-256 일치, HGC 48집계행 재계산 일치, SCCS 6변수 각각 186사회/행 일치, 요청 24지표의 미확인 표시 일치. 원 논문 쪽·표 확인 수는 여전히 0/24다.
