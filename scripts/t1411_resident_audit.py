"""Resident identity findings are separate from world completion and body capacity."""

def resident_link_audit(rows, *, enforce=True, report_gaps=False, details=None):
    gaps = [dict(day=int(r['day']), missingResidents=int(r['missingResidents']),
                 population=int(r['pop']), bodies=int(r['bodies']))
            for r in rows if int(r['missingResidents']) > 0]
    assert all(int(r['missingResidents']) >= 0 for r in rows)
    days = [r['day'] for r in gaps]
    if details is not None:
        assert {r['day'] for r in details} == set(days), 'identity detail coverage mismatch'
    audit = dict(applicable=True, passed=not gaps,
                 status='RED' if gaps else 'PASS', affectedDays=days,
                 maxMissingResidents=max((r['missingResidents'] for r in gaps), default=0),
                 mode='record-red-gaps' if report_gaps else ('strict' if enforce else 'live-observation'),
                 observations=details if details is not None else gaps)
    if enforce and not report_gaps:
        assert audit['passed'], 'resident without linked physical body: '+str(days)
    return audit
