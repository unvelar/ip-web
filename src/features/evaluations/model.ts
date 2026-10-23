/** Synthetic, deterministic illustrations. These are not production observations. */
export type Action = 'takedown' | 'clearance'
export type Judgment = Action | 'unclear'
export type DemoPrediction = {
  id: string
  action: Judgment
  predictedAgreement: number | null
  reviewerJudgment: Judgment
  evidenceEligible: boolean
  path: string
}
export type Summary = {
  n: number
  supported: number
  disagreed: number
  unresolved: number
  agreement: number | null
  interval: [number, number]
}
export type ReliabilityBin = {
  min: number
  max: number
  n: number
  resolved: number
  supported: number
  predicted: number | null
  observed: number | null
  interval: [number, number]
}
export type QualityMetrics = {
  ece: number | null
  brier: number | null
  resolved: number
  unresolved: number
}

const clamp = (value: number) => Math.min(1, Math.max(0, value))

/** Wilson's 95% interval; an empty sample spans the full possible range. */
export function wilson95(supported: number, total: number): [number, number] {
  if (total <= 0) return [0, 1]
  const p = clamp(supported / total)
  const z2 = 1.959963984540054 ** 2
  const denominator = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denominator
  const margin = Math.sqrt(z2 * (p * (1 - p) / total + z2 / (4 * total ** 2))) / denominator
  return [clamp(center - margin), clamp(center + margin)]
}

function randomSequence(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 4294967296
  }
}

function makeRows(seed: number, split: string): DemoPrediction[] {
  const random = randomSequence(seed)
  const groups: [Judgment, number][] = [['takedown', 240], ['clearance', 160], ['unclear', 80]]
  return groups.flatMap(([action, count]) => Array.from({ length: count }, (_, index) => {
    const probability = action === 'unclear' ? null : Math.round((0.5 + random() * 0.49) * 100) / 100
    const evidenceEligible = random() > (action === 'takedown' ? 0.16 : 0.07)
    const unresolved = random() < 0.08
    const agreementDraw = random()
    const accuracy = probability === null ? 0 : clamp(probability - (action === 'takedown' ? 0.11 : 0.04))
    const reviewerJudgment: Judgment = action === 'unclear' || unresolved ? 'unclear'
      : agreementDraw < accuracy ? action : action === 'takedown' ? 'clearance' : 'takedown'
    const paths = action === 'takedown'
      ? ['Counterfeit indicators', 'Unauthorized reproduction', 'Brand identity and wording']
      : action === 'clearance' ? ['Used item wording', 'Packaging only', 'No violation evidence']
        : ['Insufficient evidence', 'Conflicting evidence']
    return {
      id: `${split}-${action}-${index + 1}`,
      action,
      predictedAgreement: probability,
      reviewerJudgment,
      evidenceEligible,
      path: paths[index % paths.length],
    }
  }))
}

export const HOLDOUT_ROWS = makeRows(20261023, 'holdout')
export const VALIDATION_ROWS = makeRows(20260919, 'validation')

/** Review-only predictions and unresolved reference labels cannot score action agreement. */
export function summarize(rows: readonly DemoPrediction[]): Summary {
  let supported = 0
  let disagreed = 0
  let unresolved = 0
  for (const row of rows) {
    if (row.action === 'unclear' || row.reviewerJudgment === 'unclear') unresolved++
    else if (row.action === row.reviewerJudgment) supported++
    else disagreed++
  }
  const resolved = supported + disagreed
  return { n: rows.length, supported, disagreed, unresolved,
    agreement: resolved ? supported / resolved : null, interval: wilson95(supported, resolved) }
}

export function reliabilityBins(rows: readonly DemoPrediction[], action: Action): ReliabilityBin[] {
  const candidates = rows.filter(row => row.action === action && row.predictedAgreement !== null)
  return Array.from({ length: 10 }, (_, index) => {
    const min = index / 10
    const max = (index + 1) / 10
    // Bins are [min, max); the last also includes 1, so boundaries never duplicate a row.
    const members = candidates.filter(row => {
      const p = clamp(row.predictedAgreement!)
      return p >= min && (index === 9 ? p <= max : p < max)
    })
    const resolvedRows = members.filter(row => row.reviewerJudgment !== 'unclear')
    const supported = resolvedRows.filter(row => row.reviewerJudgment === action).length
    const resolved = resolvedRows.length
    return { min, max, n: members.length, resolved, supported,
      predicted: resolved ? resolvedRows.reduce((sum, row) => sum + clamp(row.predictedAgreement!), 0) / resolved : null,
      observed: resolved ? supported / resolved : null,
      interval: wilson95(supported, resolved) }
  })
}

export function qualityMetrics(rows: readonly DemoPrediction[], action: Action): QualityMetrics {
  const candidates = rows.filter(row => row.action === action && row.predictedAgreement !== null)
  const resolvedRows = candidates.filter(row => row.reviewerJudgment !== 'unclear')
  const resolved = resolvedRows.length
  const bins = reliabilityBins(rows, action)
  return {
    resolved,
    unresolved: candidates.length - resolved,
    ece: resolved ? bins.reduce((sum, bin) => sum + (bin.resolved
      ? bin.resolved * Math.abs(bin.predicted! - bin.observed!) : 0), 0) / resolved : null,
    brier: resolved ? resolvedRows.reduce((sum, row) => {
      const outcome = row.reviewerJudgment === action ? 1 : 0
      return sum + (clamp(row.predictedAgreement!) - outcome) ** 2
    }, 0) / resolved : null,
  }
}

export type RoutingSummary = {
  total: number
  retained: DemoPrediction[]
  review: DemoPrediction[]
  blocked: DemoPrediction[]
  summary: Summary
}

/** Preview routing within the takedown candidate pool. Other action policies stay separate. */
export function routingSummary(rows: readonly DemoPrediction[], threshold: number): RoutingSummary {
  const candidates = rows.filter(row => row.action === 'takedown')
  const cutoff = Number.isFinite(threshold) ? clamp(threshold) : 1
  const retained = candidates.filter(row => row.evidenceEligible
    && row.predictedAgreement !== null && row.predictedAgreement >= cutoff)
  const retainedIds = new Set(retained.map(row => row.id))
  const review = candidates.filter(row => !retainedIds.has(row.id))
  const blocked = candidates.filter(row => !row.evidenceEligible)
  return { total: candidates.length, retained, review, blocked, summary: summarize(retained) }
}

export type DemoExample = {
  id: string
  title: string
  quote: string
  condition: string
  action: Judgment
  reason: string
  predictedAgreement: number | null
  referenceReviewed: number
  referenceSupported: number
  evidenceEligible: boolean
  calibrationCovered: boolean
}

/** Independently authored examples; they are not members of either synthetic dataset. */
export const DEMO_EXAMPLES: DemoExample[] = [
  { id: 'example-fragrance', title: 'Aurum Atelier fragrance · opened bottle',
    quote: 'Original bottle, about half left. Selling from my own collection.', condition: 'Used fragrance',
    action: 'takedown', reason: 'The illustrative AI interpreted resale wording as unauthorized distribution; the captured wording supports a used personal item.',
    predictedAgreement: 0.68, referenceReviewed: 50, referenceSupported: 34,
    evidenceEligible: true, calibrationCovered: true },
  { id: 'example-patch', title: 'Aurum Atelier logo patch · replica',
    quote: 'Replica logo patch. Not made by Aurum Atelier.', condition: 'New accessory',
    action: 'takedown', reason: 'The captured listing explicitly describes a replica carrying the fictional brand logo.',
    predictedAgreement: 0.97, referenceReviewed: 100, referenceSupported: 97,
    evidenceEligible: true, calibrationCovered: true },
  { id: 'example-box', title: 'Aurum Atelier empty presentation box',
    quote: 'Used empty box only. No perfume or bottle included.', condition: 'Used packaging',
    action: 'clearance', reason: 'The listing clearly offers used packaging; the captured evidence does not establish a violation.',
    predictedAgreement: 0.96, referenceReviewed: 75, referenceSupported: 72,
    evidenceEligible: true, calibrationCovered: true },
  { id: 'example-missing', title: 'Aurum Atelier bag · incomplete capture',
    quote: 'Designer style bag. See photos for details.', condition: 'Condition unknown',
    action: 'takedown', reason: 'The capture lacks the images or wording needed to support the proposed violation; confidence cannot replace missing evidence.',
    predictedAgreement: 0.98, referenceReviewed: 50, referenceSupported: 49,
    evidenceEligible: false, calibrationCovered: true },
  { id: 'example-uncovered', title: 'Aurum Atelier digital logo replica',
    quote: 'Digital replica of the Aurum Atelier logo, supplied as downloadable files.', condition: 'Unsupported category',
    action: 'takedown', reason: 'No comparable reviewed category is represented in this demonstration, so a reliability estimate is unavailable.',
    predictedAgreement: null, referenceReviewed: 0, referenceSupported: 0,
    evidenceEligible: true, calibrationCovered: false },
]
