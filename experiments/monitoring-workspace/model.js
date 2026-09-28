// Synthetic, deliberately small examples. No production identifiers or records.
export const countries = { IT: 'Italy', ES: 'Spain', GB: 'United Kingdom', US: 'United States' };
// Illustrative capability matrix, not a claim about live scraper support.
export const websites = [
  { id: 'ebay', name: 'eBay', markets: ['IT', 'ES', 'GB', 'US'] },
  { id: 'etsy', name: 'Etsy', markets: ['IT', 'ES', 'GB', 'US'] },
  { id: 'vinted', name: 'Vinted', markets: ['IT', 'ES'] },
  { id: 'poshmark', name: 'Poshmark', markets: ['US'] },
  { id: 'web', name: 'Web search', markets: ['IT', 'ES', 'GB', 'US'] },
];

export function normalizeKeywords(input) {
  const unique = new Map();
  for (const raw of (Array.isArray(input) ? input : input.split('\n'))) {
    const value = raw.trim().replace(/\s+/gu, ' ');
    const key = value.toLowerCase();
    if (value && !unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()];
}

export function makeFixtures() {
  return [
    {
      id: 'giardini', name: 'Giardini di Toscana',
      brands: [{
        id: 'giardini-brand', name: 'Giardini di Toscana',
        keywords: ['Giardini di Toscana', 'Giardini Toscana'],
        coverage: { websites: ['ebay', 'vinted', 'web'], countries: ['IT', 'ES'], frequency: 'weekly' },
        products: [{ id: 'bianco', name: 'Bianco Latte', category: 'Fragrance', keywords: ['Bianco Latte', 'Biancolatte', 'Bianco Latte perfume'], coverage: null }],
      }],
    },
    {
      id: 'paula', name: 'Paula’s Choice',
      brands: [{
        id: 'paula-brand', name: 'Paula’s Choice', keywords: ["paula's choice", 'paulas choice', '宝拉珍选'],
        coverage: { websites: ['ebay', 'etsy', 'poshmark'], countries: ['US', 'GB'], frequency: 'weekly' },
        products: [
          { id: 'fluid', name: 'RESIST Youth-Extending Daily Hydrating Fluid', category: 'Sun protection', keywords: ["paula's choice youth extending daily hydrating fluid", 'paula choice hydrating fluid'], coverage: null },
          { id: 'bha', name: 'SKIN PERFECTING 2% BHA Liquid Exfoliant', category: 'Exfoliants', keywords: ["paula's choice 2% bha", 'paulas choice liquid exfoliant'], coverage: null },
          { id: 'retinol', name: 'CLINICAL 1% Retinol Treatment', category: 'Treatments', keywords: ["paula's choice 1% retinol"], coverage: { websites: ['ebay', 'etsy'], countries: ['US'], frequency: 'daily' } },
          { id: 'peptide', name: 'Pro-Collagen Peptide Plumping Moisturizer', category: 'Moisturizers', keywords: ["paula's choice peptide plumping moisturizer"], coverage: null },
          { id: 'serum', name: 'Triple Active Repair Serum', category: 'Serums', keywords: ["paula's choice triple active repair serum"], coverage: null },
        ],
      }],
    },
  ];
}

export function scopeFor(brand, scopeId) {
  if (scopeId === 'brand') return brand;
  const product = brand.products.find(p => p.id === scopeId);
  if (!product) throw new Error('Product does not belong to this brand.');
  return product;
}

export function effectiveCoverage(brand, scope) {
  return scope.coverage ?? brand.coverage;
}

export function searchPlan(brand, scope) {
  const coverage = effectiveCoverage(brand, scope);
  const searches = [];
  const unsupported = [];
  // Brand names are NOT silently prepended to product keywords.
  for (const siteId of new Set(coverage.websites)) {
    const site = websites.find(w => w.id === siteId);
    if (!site) throw new Error('Unknown website.');
    for (const country of new Set(coverage.countries)) {
      if (!Object.hasOwn(countries, country)) throw new Error('Unknown country.');
      if (!site.markets.includes(country)) {
        unsupported.push({ website: site.name, country: countries[country] });
        continue;
      }
      for (const keyword of normalizeKeywords(scope.keywords)) {
        searches.push({ website: site.name, country: countries[country], keyword });
      }
    }
  }
  return { searches, unsupported };
}

export function validateScope(brand, scope) {
  const coverage = effectiveCoverage(brand, scope);
  if (!normalizeKeywords(scope.keywords).length) return 'Add at least one search keyword.';
  if (!coverage.websites.length) return 'Choose at least one website.';
  if (!coverage.countries.length) return 'Choose at least one search country.';
  if (!['daily', 'weekly', 'monthly'].includes(coverage.frequency)) return 'Choose a monitoring frequency.';
  if (!searchPlan(brand, scope).searches.length) return 'Choose a supported website and country combination.';
  return null;
}
