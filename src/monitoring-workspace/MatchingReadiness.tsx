import type { MatchingReadiness as State } from './contracts';

export default function MatchingReadiness({ state }: { state?: State }) {
  if (!state) return null;
  const label = { ready: 'Ready for matching', indexing: 'Images need processing', references_needed: 'Reference images needed' }[state.status];
  return <div className={`matching-readiness status-${state.status}`} role="status">
    <strong>{label}</strong>
    <p>{state.detail}</p>
    {state.scope_kind === 'brand' && state.shared_reference_count > 0 && <p className="reference-sharing-note">
      {state.shared_reference_count} product reference {state.shared_reference_count === 1 ? 'image is' : 'images are'} available for brand checks. Each image stays with its product.
    </p>}
  </div>;
}
