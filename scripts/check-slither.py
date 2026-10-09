"""Fail CI on any unreviewed Slither finding; retain the full baseline for reviewers."""
import json
import sys
from collections import Counter

def findings(path):
    data = json.load(open(path, encoding='utf8'))
    if not data.get('success'):
        raise SystemExit(f'Slither failed: {path}')
    return Counter((row['check'], row['description']) for row in data['results'].get('detectors', []))

baseline = findings('docs/slither-baseline.json')
current = findings(sys.argv[1])
unreviewed = current - baseline
if unreviewed:
    for (check, description), count in unreviewed.items():
        print(f'{check} ({count}): {description}')
    raise SystemExit('Unreviewed static analysis findings')
print(f'{sum(current.values())} findings match reviewed baseline; no unreviewed findings.')
