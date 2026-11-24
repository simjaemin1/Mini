#!/usr/bin/env python3
"""Archive and draft T1411 only after all six actual outcomes exist. No world launches."""
import argparse, gzip, hashlib, json, shutil, subprocess, time, traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--root', type=Path, required=True)
p.add_argument('--repo', type=Path, required=True)
p.add_argument('--wait', action='store_true')
p.add_argument('--commit-push', action='store_true')
a = p.parse_args()
root, repo = a.root.resolve(), a.repo.resolve()
durable = Path('/workspace/scratch/t1411')
names = [f'{arm}-{seed}' for seed in [1020, 7, 42] for arm in ['ON', 'OFF']]
data = repo/'계측/T1411_2026-11-21'
report = repo/'보고/T1411_2026-11-21.md'
read = lambda f: json.loads(f.read_text())

def command(argv, **kw):
    return subprocess.run(argv, cwd=repo, check=True, **kw)

def ready():
    state = read(root/'campaign.json')
    assert state['stage'] != 'stopped', state
    return state['stage'] == 'worlds-finished' and all(
        (root/'worlds'/(n+'.exit.json')).exists() for n in names)

def archive(src, dst):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        with gzip.open(dst, 'rb') as f:
            assert hashlib.sha256(f.read()).digest() == hashlib.sha256(src.read_bytes()).digest(), str(dst)
        return
    tmp = dst.with_suffix('.tmp')
    with src.open('rb') as f, gzip.open(tmp, 'wb', compresslevel=5) as g:
        shutil.copyfileobj(f, g)
    tmp.replace(dst)

def main():
    while not ready():
        assert a.wait, 'six worlds have not all terminated'
        time.sleep(5)
    manifest = read(root/'candidate-manifest.json')
    for f, expected in manifest['featureSource'].items():
        for tree in [root/'fast', repo]:
            assert hashlib.sha256((tree/f).read_bytes()).hexdigest() == expected, str(tree/f)
    out = data/'six-worlds'
    # Preserve known resident identity findings as RED, not a silent pass or a
    # reason to lose all six actual outcomes. Other strict checks still apply.
    command(['python3', 'scripts/t1411-collect.py', '--runs', str(root/'worlds'), '--out', str(out), '--report-link-gaps'])
    summary = read(out/'summary.json')
    assert set(summary) == set(names)
    for name in names:
        result = summary[name]
        assert result['done'] or result['failed'], name
        launch = result['launch']
        assert launch['days'] == result['target'] == 730 and launch['every'] == 10, name
        assert result['failed'] or result['days'] == 730, name
        assert launch['seed'] == int(name.rsplit('-', 1)[1]), name
        assert launch['arm'] == name.split('-', 1)[0], name
        assert launch['source'] == {k: v for k, v in manifest['featureSource'].items() if k != 'sim/economy-sim.js'}, name
        assert launch['env']['VILLAGE_NPC_CAP'] == 'Infinity', name
        assert launch['env']['VILLAGE_DAY_MS'] == '1440000', name
        d = root/'worlds'/name
        dst = out/'raw'/name
        # All worlds have exited: the failed final segment is evidence too.
        for f in sorted(d.glob('seg-*')):
            if f.is_file() and f.name.endswith(('.json', '.jsonl', '.log')):
                archive(f, dst/(f.name+'.gz'))
        dst.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(d/'progress.json', dst/'progress.json')
        for suffix in ['.launch.json', '.exit.json', '.guard.log']:
            f = root/'worlds'/(name+suffix)
            if f.exists():
                archive(f, dst/(f.name+'.gz'))
    shutil.copyfile(root/'campaign.json', out/'campaign.json')
    failed = [n for n in names if summary[n]['failed']]
    identity_red = [n for n in names if summary[n].get('residentLinkAudit', {}).get('passed') is False]
    campaign = read(root/'campaign.json')
    recoveries = {n: e.get('infrastructureResumes', []) for n, e in campaign['worlds'].items() if e.get('infrastructureResumes')}
    recovery_count = sum(len(entries) for entries in recoveries.values())
    if recoveries:
        (out/'infrastructure-resumes.json').write_text(json.dumps(recoveries, ensure_ascii=False, indent=1))
    text = ['\n### 3시드 양팔 최종 결과\n',
            '집계 시각: '+datetime.now(timezone(timedelta(hours=9))).isoformat(timespec='seconds')+'. '
            '양팔 모두 몸 상한 없음·하루 24분이다. 완료와 실제 중단을 구분했다.\n',
            '| 팔 | 실제 장부 날 | 완료 | 실패 | 마지막 인구 | 평균 CPU 초/날 |',
            '|---|---:|---|---|---:|---:|']
    fmt = lambda x: '미확인' if x is None else (f'{x:.3f}' if isinstance(x, float) else str(x))
    for name in names:
        r = summary[name]
        text.append('| '+' | '.join(map(str, [name, r['days'], r['done'], r['failed'], fmt(r.get('pop')), fmt(r.get('cpuMeanAll'))]))+' |')
    if identity_red:
        text += ['\n**마을 사람 ID 연결 점검 빨강**: 집계는 `--report-link-gaps`로 실제 결과와 빨강 관측을 함께 보존했다. '
                 '기본 엄격 검사는 유지하며 이 모드에서도 passed=false다. 정상 프로세스 종료와 ID 연결 검사는 별도다.\n',
                 '| 팔 | ID 연결 누락 관측 날 | 최대 누락 |', '|---|---|---:|']
        for name in identity_red:
            audit = summary[name]['residentLinkAudit']
            text.append('| '+name+' | '+', '.join(map(str, audit['affectedDays']))+' | '+str(audit['maxMissingResidents'])+' |')
    if recovery_count:
        text += ['\n환경 중단 뒤의 체크포인트 복구 이력은 팔별 '+str(recovery_count)+'건이다. '
                 '실제 종료 코드를 관측한 세계 실패와 구분해 `infrastructure-resumes.json`에 보존했다. '
                 '미완성 마디는 복구 전에 별도로 보존했고 최종 일일 평균에는 복구 후 채택한 마디를 한 번씩 넣었다. '
                 '환경 중단 전 미완성 마디에서 이미 쓴 CPU는 복구 기록의 별도 관측값이다.\n']
    text += ['\n끔비 = 같은 시드·같은 날의 켬 인구 / 끔 인구. 한쪽이 그 날에 닿지 못했으면 비를 만들지 않는다. '
             'CPU는 기동·10날마다 재기동을 포함한 누적 평균이다. `daily.csv`와 `summary.json`에는 100날 창 평균도 있다. '
             '완공 0은 몸 완공의 당일 증가가 없는 마을 수이며, 몸 영토 끔 팔에는 해당하지 않는다.\n',
             '| 팔 | 날 | 인구 | 영토 칸 | 당일 완공 0 | 빈 마을 | 이탈 | 누적 CPU 초/날 | 인구 끔비 |',
             '|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for name in names:
        for day, r in summary[name].get('points', {}).items():
            if int(day) < 100:
                continue
            zero = r['zeroVillages'] if name.startswith('ON-') else '해당 없음'
            text.append('| '+' | '.join(fmt(x) for x in [name, day, r['pop'], r['territory'], zero,
                r['empty'], r['emigrated'], r['cpuMeanAll'], r.get('offRatio') if name.startswith('ON-') else '—'])+' |')
    for name in failed:
        text += ['\n실제 중단 `'+name+'`: 다음은 관측된 종료 증거다. 마지막 장부/로그/체크포인트의 날을 구분하며 미관측 구간을 채우지 않는다.\n',
                 '```json', json.dumps(summary[name].get('failureEvidence', summary[name]['actualExit']), ensure_ascii=False, indent=1), '```']
    text += ['\n원표·닫힌 마디·중단 마디·실제 종료: [six-worlds](../계측/T1411_2026-11-21/six-worlds/summary.json). '
             '고정 후보의 전체 CPU 개선은 같은 100날 대조에서 확인하지 못했다. '
             '이 결과로 기본 켬을 제안하지 않으며 켬 판정은 재민 님 몫이다.\n']
    (out/'results.md').write_text('\n'.join(text))
    body = report.read_text()
    body = body.replace('730날 완료·실패 비율은 아직 집계하지 않는다. 긴 판이 끝나면 실제 수치로 갱신한다.', '\n'.join(text))
    lines = body.splitlines()
    lines[0] = ('CPU 동일100날 99.012→100.488초/날(관측 +1.5%·30초 목표 미달·전체 개선 확인 못 함) · '
                '잔여 꼭대기 메인 몸/걸음 준비/공간 색인 · 두 해 3시드 실제 결과 §5 · '
                f'종료 실패 {len(failed)}/6 · 환경 복구 이력 {recovery_count}건(팔별) · 완공 0·끔비 원표 §5 · 지문 100/100 · '
                '끈 판 1/1(경제·생활층 400/400) · 하네스 14종 초록 · 미끼 2/2 · '
                f'마을 ID 연결 빨강 {len(identity_red)}팔 · 회부 {1 if identity_red else 0} · 기본 켬 채택 요청 0')
    body = '\n'.join(lines)+'\n'
    body = body.replace('## 0. 진행 상태', '## 0. 결과 상태')
    body = body.replace('제품 후보 `768d740b0` 고정 · 아직 완료/채택 보고가 아님',
                        '제품 후보 `768d740b0` 고정 · 성능 목표 미달 · 기본 켬 채택 요청 없음')
    body = body.replace('후보 경제·모든 마을 필드 지문 100/100 같음 · ON/OFF 1020 진행 중·나머지 4팔 대기',
                        f'지문 100/100 같음 · 6팔 종료 관측 · 목표 완료 {6-len(failed)}·실제 중단 {len(failed)} (§5)')
    body = body.replace('3시드 730날 양팔 · 최종 승인 대기 커밋', '기본 켬 여부는 재민 님 판정 · 전체 속도 개선 확인 못 함')
    body = '\n'.join(
        f'| 후보·긴 판 | 지문100/100 · 6팔 종료 관측 · 정상 목표 완료 {6-len(failed)}·실제 중단 {len(failed)} · ID 연결 빨강 {len(identity_red)}팔 (§5) |'
        if line.startswith('| 후보·긴 판 |') else
        f'| 판정 대기 | 성능 목표 미달 · 기본 켬 제안0 · 마을 ID 연결 회부 {1 if identity_red else 0} |'
        if line.startswith('| 남은 것 |') else line for line in body.splitlines())+'\n'
    report.write_text(body)
    command(['git', 'diff', '--check'])
    if a.commit_push:
        branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=repo, text=True).strip()
        assert branch == 'batch/terr-body-cpu-1121', branch
        staged = subprocess.check_output(['git', 'diff', '--cached', '--name-only'], cwd=repo, text=True).splitlines()
        assert all(f.startswith('계측/T1411_2026-11-21/') or f == '보고/T1411_2026-11-21.md' for f in staged), staged
        command(['git', 'add', str(data.relative_to(repo)), str(report.relative_to(repo))])
        command(['git', 'commit', '-m', '[승인 대기 · T1411] 몸 영토 CPU 해부와 3시드 양팔 최종 자료'])
        command(['git', 'push', 'origin', 'HEAD:batch/terr-body-cpu-1121'])
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        remote = subprocess.check_output(['git', 'ls-remote', 'origin', 'refs/heads/'+branch], cwd=repo, text=True).split()[0]
        assert head == remote
        (durable/'finalized.json').write_text(json.dumps(dict(commit=head, failed=failed, summary=str(out/'summary.json')), ensure_ascii=False, indent=1))

if __name__ == '__main__':
    try:
        main()
    except BaseException:
        durable.mkdir(parents=True, exist_ok=True)
        (durable/'finish-error.txt').write_text(traceback.format_exc())
        raise
