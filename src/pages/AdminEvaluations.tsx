import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { ArrowRight, Check, FlaskConical, LockKeyhole } from "lucide-react";
import { AdminPage } from "../components/admin/AdminPage";
import {
  DEMO_EXAMPLES,
  HOLDOUT_ROWS,
  VALIDATION_ROWS,
  qualityMetrics,
  reliabilityBins,
  routingSummary,
  summarize,
  wilson95 as wilsonInterval,
  type Action,
  type DemoExample,
  type Judgment,
} from "../features/evaluations/model";
import "../features/evaluations/evaluations.css";

const views = [
  { id: "evaluation", label: "Evaluation" },
  { id: "review", label: "Review examples" },
  { id: "routing", label: "Review routing" },
  { id: "queue", label: "Queue preview" },
] as const;
type View = typeof views[number]["id"];
type Review = { judgment: Judgment; reason: string };
const judgmentLabels: Record<Judgment, string> = {
  takedown: "Takedown justified",
  clearance: "No takedown justified",
  unclear: "Insufficient evidence",
};
const suggestionLabels: Record<Judgment, string> = {
  takedown: "Takedown candidate",
  clearance: "Do not pursue",
  unclear: "No conclusion",
};
const percent = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;
const intervalLabel = ([low, high]: readonly [number, number]) => `${percent(low)}–${percent(high)}`;

export default function AdminEvaluations() {
  const [view, setView] = useState<View>("evaluation");
  const [action, setAction] = useState<Action>("takedown");
  const [threshold, setThreshold] = useState(90);
  const [exampleIndex, setExampleIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [reviews, setReviews] = useState<Record<string, Review>>({});

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % views.length
      : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length
      : event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setView(views[nextIndex].id);
    document.getElementById(`evaluations-tab-${views[nextIndex].id}`)?.focus();
  }

  return (
    <AdminPage section="evaluations" title="Evaluations" wide
      description="Inspect suggested-action reliability, review captured evidence independently, and preview review routing."
      actions={<Badge tone="amber"><FlaskConical size={13} aria-hidden="true" />Demo · synthetic data</Badge>}
      meta={<><span>Suggested action</span><span>Illustrative policy v8 · reliability model v1</span></>}>
      <div className="evaluations">
        <div className="evaluations-demo-note"><FlaskConical size={15} aria-hidden="true" /><p>Interactive preview with fictional listings and synthetic reports. Reviews and thresholds stay on this page.</p></div>
        <div className="evaluations-tabs" role="tablist" aria-label="Evaluation workflow">
          {views.map(({ id, label }, index) => <button type="button" key={id}
            id={`evaluations-tab-${id}`} role="tab" aria-controls={`evaluations-panel-${id}`}
            aria-selected={view === id} tabIndex={view === id ? 0 : -1}
            onClick={() => setView(id)} onKeyDown={(event) => navigateTabs(event, index)}>{label}</button>)}
        </div>
        <section id={`evaluations-panel-${view}`} role="tabpanel" aria-labelledby={`evaluations-tab-${view}`}>
          {view === "evaluation" && <EvaluationReport action={action} onAction={setAction} onReview={() => setView("review")} />}
          {view === "review" && <>
            <div className="admin-card evaluations-review">
              <PanelHeading title="Independent evidence review" description="The AI suggestion stays hidden until your assessment is recorded."
                aside={<select aria-label="Review example" value={exampleIndex} onChange={(event) => setExampleIndex(Number(event.target.value))}>
                  {DEMO_EXAMPLES.slice(0, 3).map((example, index) => <option key={example.id} value={index}>{example.id} · {example.title}</option>)}
                </select>} />
              <ReviewExample key={DEMO_EXAMPLES[exampleIndex].id} example={DEMO_EXAMPLES[exampleIndex]}
                review={reviews[DEMO_EXAMPLES[exampleIndex].id]}
                onRecord={(review) => setReviews((current) => ({ ...current, [DEMO_EXAMPLES[exampleIndex].id]: review }))}
                onRevise={() => setReviews((current) => {
                  const next = { ...current };
                  delete next[DEMO_EXAMPLES[exampleIndex].id];
                  return next;
                })} />
              <PanelFooter><span>Fictional evidence · demo reviews reset when you leave this page</span><span>Independent labels remain separate from learned rules</span></PanelFooter>
            </div>
          </>}
          {view === "routing" && <RoutingPreview threshold={threshold} onThreshold={setThreshold} onQueue={() => setView("queue")} />}
          {view === "queue" && <QueuePreview threshold={threshold} selectedIndex={selectedIndex} onSelect={setSelectedIndex}
            onRouting={() => setView("routing")} onReview={(index) => { setExampleIndex(index); setView("review"); }} />}
        </section>
      </div>
    </AdminPage>
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" }) {
  return <span className="evaluations-badge" data-tone={tone}>{children}</span>;
}

function PanelHeading({ title, description, aside }: { title: string; description?: string; aside?: ReactNode }) {
  return <div className="evaluations-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{aside}</div>;
}

function PanelFooter({ children }: { children: ReactNode }) {
  return <div className="evaluations-panel-footer">{children}</div>;
}

function Metric({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return <article className="admin-card evaluations-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function EvaluationReport({ action, onAction, onReview }: { action: Action; onAction: (value: Action) => void; onReview: () => void }) {
  const overall = summarize(HOLDOUT_ROWS);
  const takedowns = summarize(HOLDOUT_ROWS.filter((row) => row.action === "takedown"));
  const clearances = summarize(HOLDOUT_ROWS.filter((row) => row.action === "clearance"));
  const paths = [...new Set(HOLDOUT_ROWS.map((row) => row.path))];
  const metrics = qualityMetrics(HOLDOUT_ROWS, action);
  return <>
    <div className="evaluations-metrics" aria-label="Synthetic holdout results">
      <Metric label="Holdout reviews" value={overall.n} detail={`${overall.n - overall.unresolved} resolved · ${overall.unresolved} unresolved`} />
      <Metric label="Takedowns supported" value={percent(takedowns.agreement)} detail={`${takedowns.supported} of ${takedowns.n - takedowns.unresolved} resolved recommendations`} />
      <Metric label="Clearances not supported" value={clearances.disagreed} detail={`${clearances.disagreed} disagreements · ${clearances.unresolved} unresolved`} />
    </div>
    <div className="evaluations-two-columns">
      <section className="admin-card">
        <PanelHeading title="Does confidence match reality?" aside={<select aria-label="Recommendation type" value={action} onChange={(event) => onAction(event.target.value as Action)}><option value="takedown">Takedown</option><option value="clearance">Do not pursue</option></select>} />
        <ReliabilityChart action={action} />
        <div className="evaluations-chart-legend"><span><i />Observed agreement · 95% interval</span><span><i className="evaluations-dashed" />Perfect calibration</span></div>
        <PanelFooter><span>{metrics.resolved} resolved reviews · ECE {percent(metrics.ece)} · Brier {metrics.brier === null ? "—" : metrics.brier.toFixed(3)}</span><span><LockKeyhole size={12} aria-hidden="true" />Frozen holdout</span></PanelFooter>
      </section>
      <section className="admin-card">
        <PanelHeading title="Evidence paths" aside={<span className="evaluations-muted">Holdout</span>} />
        <div className="evaluations-table-wrap"><table className="evaluations-table"><thead><tr><th scope="col">Recommendation basis</th><th scope="col">Reviewed</th><th scope="col">Supported / resolved</th></tr></thead><tbody>{paths.map((path) => {
          const result = summarize(HOLDOUT_ROWS.filter((row) => row.path === path));
          return <tr key={path}><td>{path}</td><td>{result.n}</td><td>{result.n === result.unresolved ? "Unresolved" : `${result.supported} / ${result.n - result.unresolved}`}{result.unresolved > 0 && result.n !== result.unresolved && <small>{result.unresolved} unresolved</small>}</td></tr>;
        })}</tbody></table></div>
        <ol className="evaluations-stages"><li><span>Develop rules and reliability model<small>Development data</small></span></li><li><span>Choose review thresholds<small>Separate validation set</small></span></li><li><span>Measure on fresh cases<small>This frozen holdout</small></span></li></ol>
      </section>
    </div>
    <div className="evaluations-bottom-note"><p>Grouped splits · frozen evidence and rules · unresolved judgments are excluded from agreement and shown separately.</p><button type="button" className="admin-button" onClick={onReview}>Inspect a review example<ArrowRight size={13} aria-hidden="true" /></button></div>
  </>;
}

function ReliabilityChart({ action }: { action: Action }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(180, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = 266, left = 49, right = 17, top = 17, bottom = 49;
  const x = (value: number) => left + value * (width - left - right);
  const y = (value: number) => height - bottom - value * (height - bottom - top);
  const bins = reliabilityBins(HOLDOUT_ROWS, action);
  return <div className="evaluations-chart" ref={ref}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${action === "takedown" ? "Takedown" : "Clearance"} reliability on synthetic holdout data: predicted versus observed reviewer agreement with 95% Wilson intervals.`}>
    <title>Predicted versus observed reviewer agreement</title>
    {[0, 0.5, 1].map((tick) => <g key={tick}><line className="evaluations-gridline" x1={x(0)} y1={y(tick)} x2={x(1)} y2={y(tick)} /><text x={left - 9} y={y(tick) + 4} textAnchor="end">{tick * 100}%</text><text x={x(tick)} y={height - bottom + 20} textAnchor="middle">{tick * 100}%</text></g>)}
    <line className="evaluations-ideal-line" x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} />
    {bins.map((bin) => {
      if (bin.predicted === null || bin.observed === null) return null;
      return <g key={bin.min}><title>{`${percent(bin.predicted)} predicted · ${percent(bin.observed)} observed · ${bin.resolved} resolved reviews · ${intervalLabel(bin.interval)} 95% interval`}</title><line className="evaluations-interval" x1={x(bin.predicted)} x2={x(bin.predicted)} y1={y(bin.interval[0])} y2={y(bin.interval[1])} /><circle className="evaluations-point" cx={x(bin.predicted)} cy={y(bin.observed)} r={4.5} /></g>;
    })}
    <text x={(left + width - right) / 2} y={height - 5} textAnchor="middle">Predicted agreement</text><text transform={`translate(13 ${(top + height - bottom) / 2}) rotate(-90)`} textAnchor="middle">Observed agreement</text>
  </svg></div>;
}

function ReviewExample({ example, review, onRecord, onRevise }: { example: DemoExample; review?: Review; onRecord: (value: Review) => void; onRevise: () => void }) {
  const [judgment, setJudgment] = useState<Judgment | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const decision = review?.judgment ?? judgment;
  return <div className="evaluations-evidence-grid">
    <div><article className="evaluations-capture"><p className="evaluations-kicker">Frozen listing · fictional example</p><h3>{example.title}</h3><blockquote>“{example.quote}”</blockquote><dl><div><dt>Monitored IP</dt><dd>Aurum Atelier</dd></div><div><dt>Condition / offer</dt><dd>{example.condition}</dd></div><div><dt>Source material</dt><dd>Captured listing text</dd></div></dl></article><p className="evaluations-criterion"><strong>Review criterion</strong>Product identity and independent violation evidence must both support a takedown. Prior use or a brand mention alone is insufficient.</p></div>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!judgment || reason.trim().length < 8) { setError("Choose an assessment and add a short evidence-based reason."); return; }
      setError("");
      onRecord({ judgment, reason: reason.trim() });
    }}>
      <fieldset className="evaluations-judgment" disabled={!!review}><legend>What does this evidence justify?</legend>{(["takedown", "clearance", "unclear"] as const).map((value) => <label key={value}><input type="radio" name="evaluation-judgment" value={value} checked={decision === value} onChange={() => setJudgment(value)} /><span>{judgmentLabels[value]}<small>{value === "takedown" ? "Identity and violation are supported" : value === "clearance" ? "Record the specific clearance reason" : "Further review or evidence is needed"}</small></span></label>)}</fieldset>
      <label className="evaluations-field" htmlFor="evaluations-review-reason">Evidence and reason<textarea id="evaluations-review-reason" placeholder="Which captured facts support your assessment?" value={review?.reason ?? reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} disabled={!!review} /></label>
      {!review && <button className="admin-button admin-button-primary" type="submit">Record demo review &amp; reveal AI</button>}
      {error && <p className="evaluations-error" role="alert">{error}</p>}
      {review && <div className="evaluations-reveal" aria-live="polite"><Badge tone={review.judgment === "unclear" ? "amber" : review.judgment === example.action ? "green" : "red"}>{review.judgment === "unclear" ? "Unresolved · needs adjudication" : review.judgment === example.action ? "Reviewer agrees" : "Reviewer disagrees"}</Badge><p><strong>AI suggestion:</strong> {example.action === "takedown" ? "Takedown recommended" : "Do not pursue"}</p><p><strong>Your assessment:</strong> {judgmentLabels[review.judgment]}</p><p>{example.reason}</p><button type="button" className="admin-button" onClick={onRevise}>Revise demo review</button></div>}
    </form>
  </div>;
}

function RoutingPreview({ threshold, onThreshold, onQueue }: { threshold: number; onThreshold: (value: number) => void; onQueue: () => void }) {
  const routing = routingSummary(VALIDATION_ROWS, threshold / 100);
  const result = routing.summary;
  const candidates = VALIDATION_ROWS.filter((row) => row.action === "takedown").length;
  return <>
    <div className="evaluations-two-columns"><section className="admin-card evaluations-routing">
      <PanelHeading title="When should takedowns go to review?" aside={<Badge tone="amber">Validation only</Badge>} />
      <div className="evaluations-routing-body"><div className="evaluations-range-label"><label htmlFor="evaluations-threshold">Minimum estimated reviewer agreement</label><output htmlFor="evaluations-threshold">{threshold}%</output></div><input id="evaluations-threshold" type="range" min={60} max={99} step={1} value={threshold} onChange={(event) => onThreshold(Number(event.target.value))} /><div className="evaluations-range-extents"><span>More suggestions</span><span>More human review</span></div>
      <div className="evaluations-stacked" role="img" aria-label={`${routing.retained.length} takedown suggestions retained, ${routing.review.length} sent to review`}><div style={{ width: `${routing.retained.length / candidates * 100}%` }} /></div><div className="evaluations-range-extents"><span>{routing.retained.length} suggestions kept</span><span>{routing.review.length} to review</span></div>
      <dl className="evaluations-routing-results" aria-live="polite"><div><dt>Reviewer support among resolved retained suggestions</dt><dd>{percent(result.agreement)}</dd></div><div><dt>95% interval · {result.supported} / {result.n - result.unresolved} resolved</dt><dd>{result.n === result.unresolved ? "Not enough labels" : intervalLabel(result.interval)}</dd></div><div><dt>Retained judgments needing adjudication</dt><dd>{result.unresolved}</dd></div><div><dt>Retained suggestions not supported</dt><dd>{result.disagreed}</dd></div><div><dt>Missing evidence · always sent to review</dt><dd>{routing.blocked.length}</dd></div></dl>
      <div className="evaluations-bottom-note"><p>{candidates} synthetic candidate takedowns</p><button type="button" className="admin-button admin-button-primary" onClick={onQueue}>Preview in queue<ArrowRight size={13} aria-hidden="true" /></button></div></div>
    </section><section className="admin-card"><PanelHeading title="Decision order" aside={<Badge>Draft policy</Badge>} /><ol className="evaluations-stages evaluations-decision-order"><li><span>Check evidence requirements<small>Strong identity + independent violation + no clearance exception</small></span></li><li><span>Check calibration coverage<small>Supported action, evidence type, language, and model version</small></span></li><li><span>Apply the review threshold<small>Below threshold or unsupported → legal review</small></span></li><li><span>Keep a human decision<small>A suggestion never submits a takedown</small></span></li></ol><PanelFooter>Choose on validation → freeze → verify on holdout</PanelFooter></section></div>
    <p className="evaluations-footnote">Changing the threshold changes the retained subset and review workload. Underlying model answers stay fixed.</p>
  </>;
}

function demoRoute(example: DemoExample, threshold: number) {
  if (!example.evidenceEligible) return { label: "Legal review", reason: "Independent violation evidence missing", tone: "amber" as const };
  if (!example.calibrationCovered || example.predictedAgreement === null) return { label: "Legal review", reason: "Calibration unavailable", tone: "amber" as const };
  if (example.action === "clearance") return { label: "Do not pursue", reason: "Separate clearance assessment", tone: "green" as const };
  if (example.predictedAgreement < threshold / 100) return { label: "Legal review", reason: `Below ${threshold}% review threshold`, tone: "amber" as const };
  return { label: "Takedown recommended", reason: "Evidence and reliability checks passed", tone: "green" as const };
}

function QueuePreview({ threshold, selectedIndex, onSelect, onRouting, onReview }: { threshold: number; selectedIndex: number; onSelect: (index: number) => void; onRouting: () => void; onReview: (index: number) => void }) {
  const selected = DEMO_EXAMPLES[selectedIndex];
  const routed = demoRoute(selected, threshold);
  const calibrated = selected.evidenceEligible && selected.calibrationCovered && selected.predictedAgreement !== null;
  return <>
    <div className="evaluations-queue-heading"><div><h2>Monitoring queue</h2><p>How reliability would appear beside the suggested action</p></div><button type="button" className="admin-button" onClick={onRouting}>Draft threshold · {threshold}%</button></div>
    <div className="admin-card evaluations-queue-list" aria-label="Synthetic monitoring queue">{DEMO_EXAMPLES.map((example, index) => {
      const route = demoRoute(example, threshold);
      return <button key={example.id} type="button" className="evaluations-queue-row" aria-pressed={index === selectedIndex} onClick={() => onSelect(index)}><span><strong>{example.title}</strong><small>{example.id} · fictional listing</small></span><span><Badge tone={route.tone}>{route.label}</Badge><small>{route.reason}</small></span><span><strong>{!example.evidenceEligible ? "Not evaluated" : !example.calibrationCovered || example.predictedAgreement === null ? "Unavailable" : `${Math.round(example.predictedAgreement * 100)}% agreement`}</strong><small>{!example.evidenceEligible ? "Evidence gate failed" : example.calibrationCovered ? `${example.referenceReviewed} reference reviews` : "Outside validated coverage"}</small></span></button>;
    })}</div>
    <section className="admin-card evaluations-queue-detail" aria-live="polite"><PanelHeading title={`${selected.id} · Recommendation basis`} aside={<Badge tone={routed.tone}>{routed.label}</Badge>} /><dl><div><dt>Policy candidate</dt><dd>{suggestionLabels[selected.action]}</dd></div><div><dt>Required evidence</dt><dd>{selected.evidenceEligible ? "AI assessments pass the evidence gate" : "Independent violation missing"}</dd></div><div><dt>Estimated reviewer agreement</dt><dd>{calibrated ? `${Math.round(selected.predictedAgreement! * 100)}% · model estimate` : selected.evidenceEligible ? "Calibration unavailable" : "Not evaluated · evidence gate failed"}</dd></div><div><dt>Comparable reference group</dt><dd>{calibrated ? <>{selected.referenceSupported} / {selected.referenceReviewed} supported<small>95% interval {intervalLabel(wilsonInterval(selected.referenceSupported, selected.referenceReviewed))}</small></> : "No applicable validated reference group"}</dd></div></dl><p>{selected.reason}</p>{selectedIndex < 3 && <button type="button" className="admin-button" onClick={() => onReview(selectedIndex)}>Review this example<ArrowRight size={13} aria-hidden="true" /></button>}</section>
    <p className="evaluations-footnote"><Check size={13} aria-hidden="true" />Estimated agreement is specific to the proposed action and captured evidence. Demo controls do not submit enforcement actions.</p>
  </>;
}
