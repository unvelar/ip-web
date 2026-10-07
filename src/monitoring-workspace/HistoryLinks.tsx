import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../api/transport';
import { isRecord, requireResponse } from '../api/validation';

type History = {id: string; name: string; scope_id: string | null; reason: string | null; cases: number; searches: number};

async function readHistory(signal?: AbortSignal): Promise<History[]> {
  const value = await request<unknown>('/api/monitoring-workspace/history', {signal});
  requireResponse(isRecord(value) && Array.isArray(value.records), 'monitoring history');
  const rows = (value as {records: unknown[]}).records;
  requireResponse(rows.every(row => isRecord(row) && typeof row.id === 'string' && typeof row.name === 'string'
    && (row.scope_id === null || typeof row.scope_id === 'string') && (row.reason === null || typeof row.reason === 'string') && typeof row.cases === 'number'
    && Number.isFinite(row.cases) && typeof row.searches === 'number' && Number.isFinite(row.searches)), 'monitoring history records');
  return rows as History[];
}

export default function HistoryLinks({scopeId, name}: {scopeId: string; name: string}) {
  const [records, setRecords] = useState<History[]>([]);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void readHistory(controller.signal).then(setRecords).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'History could not be loaded');
    });
    return () => controller.abort();
  }, []);
  const linked = records.filter(row => row.scope_id === scopeId);
  const available = records.filter(row => !row.scope_id && (row.cases > 0 || row.searches > 0));
  async function link() {
    setBusy(true); setError('');
    try {
      await request('/api/monitoring-workspace/history', {method: 'POST', body: JSON.stringify({scope_id: scopeId, ip_catalog_id: selected, reason: reason.trim()})});
      setRecords(await readHistory()); setSelected(''); setReason('');
    } catch (error) { setError(error instanceof Error ? error.message : 'History could not be linked'); }
    finally { setBusy(false); }
  }
  if (!available.length && !linked.length && !error) return null;
  return <section className="panel"><h2>Earlier monitoring history</h2>
    <p className="field-note">Linked records are shown under {name}. Original cases, evidence and review history are kept. The earlier record stops scheduling separate searches.</p>
    {linked.map(row => <div key={row.id}><p><Link to={`/ips/${row.id}#search`}>{row.name}</Link> · {row.searches} completed searches · {row.cases} cases</p><p className="field-note">{row.reason}</p></div>)}
    {available.length > 0 && <details><summary>Link an earlier record</summary><p className="field-note">Only link a record after checking that its history belongs to this brand or product. Apply the scope first.</p>
      <label htmlFor={`history-${scopeId}`}>Earlier record</label><select id={`history-${scopeId}`} value={selected} onChange={event => setSelected(event.target.value)}><option value="">Choose a record</option>{available.map(row => <option key={row.id} value={row.id}>{row.name} · {row.searches} searches · {row.cases} cases</option>)}</select>
      <label htmlFor={`history-reason-${scopeId}`}>Why this history belongs here</label><input id={`history-reason-${scopeId}`} className="full-width" value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} />
      <button type="button" className="secondary" disabled={busy || !selected || !reason.trim()} onClick={() => void link()}>{busy ? 'Linking…' : 'Link history and stop its separate searches'}</button></details>}
    {error && <p role="alert" className="notice">{error}</p>}
  </section>;
}
