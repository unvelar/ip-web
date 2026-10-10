import {useEffect, useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronDown, LoaderCircle, RefreshCw} from 'lucide-react';
import {getCoverageRecovery, retryCoverageRecovery, type CoverageRecoverySource} from '../../api/coverageRecovery';

const reasons: Record<string, string> = {
  uncertain_continuation: 'Pagination needs validation', no_progress: 'Collection stopped advancing',
  unsupported_action: 'Transport cannot perform the next action', extraction_gaps: 'Some listings could not be extracted',
  collection_changed: 'Search collection changed', query_changed: 'Pagination changed the query',
  transport_changed: 'Transport changed', access_failure: 'Marketplace access failed',
  listing_budget: 'Collection limit reached', page_budget: 'Page limit reached', model_budget: 'Observation limit reached',
};
const timestamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const labels = {active: 'Working', scheduled: 'Retry scheduled', blocked: 'Needs admin review', needed: 'Needs review', idle: 'Paused'};

export function CoverageRecovery({refreshAt}: {refreshAt: string}) {
  const [sources, setSources] = useState<CoverageRecoverySource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  const visible = sources.filter(source => !needle || [source.ip_name, source.tenant_name, source.label,
    source.domain, source.country || 'Anywhere'].some(value => value.toLocaleLowerCase().includes(needle)));
  useEffect(() => {
    const controller = new AbortController();
    void getCoverageRecovery(controller.signal).then(data => {
      if (!controller.signal.aborted) {setSources(data.sources); setError(null); setLoaded(true);}
    }).catch(() => {if (!controller.signal.aborted) setError('Could not load monitoring recovery.');});
    return () => controller.abort();
  }, [refreshAt, revision]);
  async function retry(runId: string, source = false, keyword?: string) {
    setBusy(runId); setMessage(null);
    try {
      const result = await retryCoverageRecovery(runId, source, keyword);
      setMessage(result.created ? 'Recovery queued for this search.' : 'This search already has a recovery job.');
      setRevision(value => value + 1);
    } catch {setMessage('Recovery could not be queued. Refresh the current source state and try again.');}
    finally {setBusy(null);}
  }
  return <section className="admin-card p-4" aria-label="Search coverage recovery">
    <div className="flex items-center justify-between gap-3"><div>
      <h2 className="text-sm font-bold text-stone-900">Search coverage recovery</h2>
      <p className="mt-1 text-xs text-stone-500">Automatic continuation and strategy repair. Exhausted recovery and collection limits require admin review.</p>
    </div><button type="button" onClick={() => setRevision(value => value + 1)} className="rounded border border-stone-200 p-1.5 text-stone-500" aria-label="Refresh coverage recovery"><RefreshCw size={14}/></button></div>
    <input value={query} maxLength={200} onChange={event => setQuery(event.target.value)} aria-label="Filter coverage recovery"
      placeholder="Search brand, tenant, website or country" className="mt-3 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-700 outline-none focus:border-stone-400"/>
    {error && <p role="alert" className="mt-3 text-xs text-amber-800">{error}</p>}
    {message && <p role="status" className="mt-3 text-xs text-stone-600">{message}</p>}
    {!loaded && !error && <p className="mt-3 text-xs text-stone-500">Loading recovery status...</p>}
    {loaded && !sources.length && !error && <p className="mt-3 text-xs text-stone-500">No searches currently require recovery.</p>}
    {loaded && sources.length > 0 && !visible.length && !error && <p className="mt-3 text-xs text-stone-500">No recovery searches match this filter.</p>}
    <div className="mt-3 max-h-[32rem] overflow-auto divide-y divide-stone-100">
      {visible.map(source => <details key={source.source_id} className="group py-3">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-xs">
          <div><p className="font-semibold text-stone-800">{source.ip_name} · {source.label} · {source.country || 'Anywhere'}</p>
            <p className="mt-1 text-stone-500">{source.tenant_name} · {source.checked_keywords}/{source.expected_keywords} keyword checks complete · Last full check {timestamp(source.last_checked_at)}</p></div>
          <span className="flex shrink-0 items-center gap-2 text-stone-500">{labels[source.recovery_state]}<ChevronDown className="group-open:rotate-180" size={14}/></span>
        </summary>
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
          {source.next_retry_at && <p className="mb-2 text-xs text-stone-500">Next setup retry {timestamp(source.next_retry_at)}</p>}
          {!source.issues.length && <p className="text-xs text-stone-500">{source.recovery_state === 'blocked'
            ? 'Automatic source setup retries are exhausted. Review the browser evidence before retrying setup.'
            : 'Waiting for source setup or the first completed keyword check.'}</p>}
          {!source.issues.length && <button type="button" disabled={busy !== null || source.state === 'paused' || source.recovery_state === 'active'} onClick={() => void retry(source.source_id, true)} className="mt-2 rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 disabled:opacity-40">Retry source setup</button>}
          {source.issues.map(issue => <div key={issue.job_id} className="flex items-start justify-between gap-3 border-b border-stone-200 py-2 last:border-0">
            <div className="min-w-0 text-xs"><p className="font-medium text-stone-700">{issue.keyword}</p>
              <p className="mt-1 break-words text-stone-500">{reasons[issue.reason] || issue.reason} · {issue.repair_attempt} {issue.repair_attempt === 1 ? 'repair' : 'repairs'} · {issue.job_status}</p>
              {issue.retry_at && <p className="mt-1 text-stone-500">Next search attempt {timestamp(issue.retry_at)}</p>}
            </div>
            <button type="button" disabled={busy !== null || source.state === 'paused' || source.recovery_state === 'active'} onClick={() => void retry(issue.run_id ?? source.source_id, !issue.run_id, issue.keyword)} className="shrink-0 rounded border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600 disabled:opacity-40">
              {busy === (issue.run_id ?? source.source_id) ? <LoaderCircle className="animate-spin" size={13}/> : 'Retry recovery'}
            </button>
          </div>)}
          <Link to={`/admin/browser-activity?q=${encodeURIComponent(source.label)}`} className="mt-3 block w-fit text-xs font-medium text-stone-600 hover:underline">View browser evidence</Link>
        </div>
      </details>)}
    </div>
  </section>;
}
