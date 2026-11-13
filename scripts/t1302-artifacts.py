"""Check the prepared T1302 data and write its reproducible checksum manifest."""
from pathlib import Path
import gzip, hashlib, json, re

root = Path(__file__).resolve().parents[1] / '계측/T1302_2026-11-14'
patterns = [
    rb'\bgh[pousr]_[A-Za-z0-9]{30,}',
    rb'\bgithub_pat_[A-Za-z0-9_]{40,}',
    rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
]
checked = 0
for path in sorted(root.rglob('*')):
    if not path.is_file() or path.name == 'SHA256SUMS':
        continue
    assert '.db' not in path.name, f'Database artifact: {path.relative_to(root)}'
    data = path.read_bytes()
    name = path.name
    if path.suffix == '.gz':
        data = gzip.decompress(data)
        name = name[:-3]
    for pattern in patterns:
        assert not re.search(pattern, data), f'Credential pattern in {path.relative_to(root)}'
    if name.endswith('.json'):
        json.loads(data)
    elif name.endswith('.jsonl'):
        for line in data.splitlines():
            if line.strip():
                json.loads(line)
    checked += 1
manifest = ''.join(
    f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root)}\n'
    for path in sorted(root.rglob('*'))
    if path.is_file() and path.name != 'SHA256SUMS'
)
(root / 'SHA256SUMS').write_text(manifest)
print(f'Checked {checked} artifacts; no database or credential patterns; SHA256SUMS written.')
