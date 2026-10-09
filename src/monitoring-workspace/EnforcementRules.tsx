import type { EnforcementRule } from './contracts';

const actionLabels = { do_not_pursue: 'Do not pursue', takedown: 'Recommend takedown', review: 'Needs review' };

export default function EnforcementRules({ rules, inherited = [], product, supported, onChange }: {
  rules: EnforcementRule[]; inherited?: EnforcementRule[]; product: boolean; supported: boolean;
  onChange: (rules: EnforcementRule[]) => void;
}) {
  const replaced = new Set(rules.flatMap(rule => rule.overrides_rule_id ? [rule.overrides_rule_id] : []));
  function add(override?: EnforcementRule) {
    onChange([...rules, { id: crypto.randomUUID(), condition: override?.condition ?? '',
      action: override?.action ?? 'review', explanation: '', overrides_rule_id: override?.id ?? null }]);
  }
  function update(id: string, change: Partial<EnforcementRule>) {
    onChange(rules.map(rule => rule.id === id ? { ...rule, ...change } : rule));
  }
  return <section className="panel enforcement-rules" aria-label="Enforcement rules">
    <div className="section-heading"><div><h2>Enforcement rules</h2><p>{product
      ? 'Brand rules apply here. Add product rules or replace a specific brand rule for this product.'
      : 'Set how to handle matching offers for this brand and its products.'}</p></div></div>
    <p className="field-note">Rules use the captured listing text and photos. Unclear evidence or conflicting rules require review. Takedowns always need your approval.</p>
    {!supported && <p className="notice" role="status">Enforcement rule editing is currently unavailable.</p>}
    {product && inherited.length > 0 && <div className="inherited-rules"><h3>From the brand</h3>{inherited.map(rule => <div className={`inherited-rule${replaced.has(rule.id) ? ' is-replaced' : ''}`} key={rule.id}>
      <div><span className="rule-action">{actionLabels[rule.action]}{replaced.has(rule.id) ? ' · Replaced below' : ''}</span><p>{rule.condition}</p>{rule.explanation && <p className="field-note">{rule.explanation}</p>}</div>
      {!replaced.has(rule.id) && <button type="button" className="secondary" disabled={!supported || rules.length >= 30} onClick={() => add(rule)}>Replace for this product</button>}
    </div>)}</div>}
    {rules.map((rule, index) => <fieldset className="enforcement-rule" key={rule.id} disabled={!supported}>
      <legend>{rule.overrides_rule_id ? 'Product replacement' : `Rule ${index + 1}`}</legend>
      <label htmlFor={`rule-condition-${rule.id}`}>When the offer matches this condition</label>
      <textarea id={`rule-condition-${rule.id}`} rows={3} maxLength={1000} value={rule.condition}
        placeholder="Describe an observable condition, such as an offer for an empty product box."
        onChange={event => update(rule.id, { condition: event.target.value })} />
      {rule.condition.trim().length < 10 && <p className="field-note">Use at least 10 characters to describe what should be checked.</p>}
      <label htmlFor={`rule-action-${rule.id}`}>Action</label>
      <select id={`rule-action-${rule.id}`} value={rule.action} onChange={event => update(rule.id, { action: event.target.value as EnforcementRule['action'] })}>
        {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <label htmlFor={`rule-explanation-${rule.id}`}>Reason or guidance <span className="field-note">Optional</span></label>
      <textarea id={`rule-explanation-${rule.id}`} rows={2} maxLength={2000} value={rule.explanation}
        placeholder="Explain why this offer should be handled this way."
        onChange={event => update(rule.id, { explanation: event.target.value })} />
      <button type="button" className="text-button" onClick={() => onChange(rules.filter(item => item.id !== rule.id))}>{rule.overrides_rule_id ? 'Remove replacement and use brand rule' : 'Remove rule'}</button>
    </fieldset>)}
    {!rules.length && !inherited.length && <p className="field-note">No enforcement rules yet. Existing review guidance applies.</p>}
    <button type="button" className="secondary" disabled={!supported || rules.length >= 30} onClick={() => add()}>+ Add {product ? 'product ' : ''}rule</button>
    <p className="field-note">After Save and apply, rules cover new findings and recheck existing tasks that have not been reviewed, using their saved evidence. Affected approved notices waiting to send are held for review. Sent notices and human decisions are kept.</p>
  </section>;
}
