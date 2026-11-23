"""2026-11-23: orchestration fixture only; no simulation or world launches."""
import ast, contextlib, hashlib, io, json, subprocess, sys, tempfile, time
from pathlib import Path

source = Path(__file__).resolve().parents[3]/'scripts/t1411-reattach.py'
with tempfile.TemporaryDirectory(prefix='t1411-controller-fixture-') as td:
    root = Path(td)
    proc = root/'fake-proc'
    proc.mkdir()
    (root/'worlds').mkdir()
    (root/'gates/final').mkdir(parents=True)
    write = lambda p, value: p.write_text(json.dumps(value))
    write(root/'candidate-fingerprint100.json', dict(same=True))
    write(root/'gates/final/status.json', [dict(exit=0)])
    write(root/'candidate-manifest.json', dict(featureSource={}, methodsVersion='fixture-method', methods={}))
    state = dict(stage='six-worlds', fingerprint30=True, diagnostics={}, worlds={})
    for seed in [1020, 7, 42]:
        for arm in ['ON', 'OFF']:
            name = f'{arm}-{seed}'
            failed = name == 'ON-1020'
            case = root/'worlds'/name
            case.mkdir()
            write(case/'progress.json', dict(ck=120 if failed else 730, days=730, done=not failed))
            (case/'progress.txt').write_text('SYNTHETIC FIXTURE ONLY')
            write(root/'worlds'/(name+'.exit.json'), dict(exit=7 if failed else 0))
            state['worlds'][name] = dict(pid=-1, command=['never-executed'])
    write(root/'campaign.json', state)
    class FakeProc(ast.NodeTransformer):
        def visit_Call(self, node):
            self.generic_visit(node)
            if isinstance(node.func, ast.Name) and node.func.id == 'Path' and len(node.args) == 1 and isinstance(node.args[0], ast.Constant) and node.args[0].value == '/proc':
                node.args[0] = ast.Constant(str(proc))
            return node
    tree = ast.fix_missing_locations(FakeProc().visit(ast.parse(source.read_text())))
    original_argv, popen, sleep = sys.argv, subprocess.Popen, time.sleep
    def forbidden(*args, **kwargs):
        raise AssertionError('offline fixture must not launch or wait for worlds')
    try:
        sys.argv = [str(source), '--root', str(root), '--repo', str(root)]
        subprocess.Popen = time.sleep = forbidden
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compile(tree, str(source), 'exec'), dict(__name__='__main__', __file__=str(source)))
    finally:
        sys.argv, subprocess.Popen, time.sleep = original_argv, popen, sleep
    result = json.loads((root/'campaign.json').read_text())
    assert result['stage'] == 'worlds-finished'
    assert result['worlds']['ON-1020']['exit'] == 7
    assert result['worlds']['ON-1020']['checkpoint'] == 120
    assert result['worlds']['ON-1020']['done'] is False
    assert len(result['worlds']) == 6
    assert result['controllerReattachments'][0]['wrappers'] == {}
    print(json.dumps(dict(kind='offline-controller-fixture', physicalWorldsLaunched=0,
        syntheticFixtures=1, preservedExit=7, preservedCheckpoint=120, targetDays=730,
        incompleteNotPromoted=True, observedOutcomesNotRelaunched=True,
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest())))
