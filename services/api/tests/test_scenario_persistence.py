"""Saved scenarios remain owned and removable with foreign keys enabled."""
def test_saved_scenario_delete_removes_results_first(client, judge):
    saved = client.post('/api/shocks/scenarios', headers=judge, json={
        'name': 'Persistence check', 'request': {'account_id': 1001,
        'components': [{'type': 'job_loss', 'income_replacement_pct': 55}], 'mode': 'judging'}})
    assert saved.status_code == 200
    sid = saved.json()['id']
    deleted = client.delete(f'/api/shocks/scenarios/{sid}', headers=judge)
    assert deleted.status_code == 200
    assert all(row['id'] != sid for row in client.get('/api/shocks/scenarios', headers=judge).json()['items'])
