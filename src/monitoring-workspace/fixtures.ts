import type { Brand, Workspace } from './contracts';

export const exampleCompanies = [
  { id: 'giardini', name: 'Giardini di Toscana', email: 'editor@giardini.example' },
  { id: 'paula', name: 'Paula’s Choice', email: 'editor@paula.example' },
];
export function exampleWorkspace(companyId: string): Workspace {
  const paula = companyId === 'paula';
  const brand: Brand = {
    id: crypto.randomUUID(), name: paula ? 'Paula’s Choice' : 'Giardini di Toscana',
    keywords: paula ? ["paula's choice", 'paulas choice', '宝拉珍选'] : ['Giardini di Toscana', 'Giardini Toscana'],
    reference_materials: [{ id: crypto.randomUUID(), name: paula ? 'Paula’s Choice wordmark' : 'Giardini di Toscana wordmark', kind: 'image', note: 'Brand reference for review' }],
    coverage: { markets: (paula ? ['US', 'GB'] : ['IT', 'ES']).map(country => ({ country, sources: ['domain:ebay.com', 'search:google'] })), frequency: 'weekly' },
    products: (paula ? [
      ['RESIST Youth-Extending Daily Hydrating Fluid', "paula's choice youth extending daily hydrating fluid"],
      ['SKIN PERFECTING 2% BHA Liquid Exfoliant', "paula's choice 2% bha"],
      ['CLINICAL 1% Retinol Treatment', "paula's choice 1% retinol"],
      ['Pro-Collagen Peptide Plumping Moisturizer', "paula's choice peptide plumping moisturizer"],
      ['Triple Active Repair Serum', "paula's choice triple active repair serum"],
    ] : [['Bianco Latte', 'Bianco Latte', 'Biancolatte', 'Bianco Latte perfume']]).map(([name, ...keywords]) => ({
      id: crypto.randomUUID(), name, keywords,
      reference_materials: [{ id: crypto.randomUUID(), name: `${name} packshot`, kind: 'image', note: 'Product reference for review' }],
      coverage: null, catalog_product_id: null,
    })),
  };
  return { version: 4, brands: [brand] };
}
