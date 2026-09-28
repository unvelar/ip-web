import { countries, websites, makeFixtures, normalizeKeywords, scopeFor, effectiveCoverage, searchPlan, validateScope } from './model.js';

const $ = id => document.getElementById(id);
const data = makeFixtures();
let companyId = data[0].id;
let brandId = data[0].brands[0].id;
let scopeId = 'bianco';
let page = 'monitoring';
const drafts = new Map();
let productSequence = 0;
const company = () => data.find(item => item.id === companyId);
const brand = () => company().brands.find(item => item.id === brandId);
const key = () => `${companyId}/${brandId}/${scopeId}`;
const savedScope = () => scopeFor(brand(), scopeId);
const current = () => drafts.get(key()) ?? savedScope();
const effectiveBrand = () => drafts.get(`${companyId}/${brandId}/brand`) ?? brand();
const isDirty = () => drafts.has(key());
const keywordCount = count => `${count} ${count === 1 ? 'keyword' : 'keywords'}`;

function option(value, text) {
  const item = document.createElement('option'); item.value = value; item.textContent = text; return item;
}
function textElement(tag, text, className) {
  const item = document.createElement(tag); item.textContent = text;
  if (className) item.className = className;
  return item;
}
function announce(text) { $('status').textContent = text; }
function edit(mutator) {
  const next = structuredClone(current());
  mutator(next);
  if (JSON.stringify(next) === JSON.stringify(savedScope())) drafts.delete(key());
  else drafts.set(key(), next);
  renderSummary();
}
function setScope(value) { scopeId = value; render(); }

function renderChoices(containerId, entries, selected, disabled) {
  $(containerId).replaceChildren(...entries.map(([id, name]) => {
    const label = document.createElement('label'); label.className = 'choice';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = id;
    checkbox.checked = selected.includes(id); checkbox.disabled = disabled;
    checkbox.addEventListener('change', () => {
      edit(scope => {
        const values = scope.coverage[containerId];
        scope.coverage[containerId] = checkbox.checked ? [...values, id] : values.filter(item => item !== id);
      });
    });
    label.append(checkbox, document.createTextNode(name)); return label;
  }));
}
function renderCoverage() {
  const inherited = scopeId !== 'brand' && current().coverage === null;
  const coverage = effectiveCoverage(effectiveBrand(), current());
  $('inherit-row').hidden = scopeId === 'brand';
  $('inherit').checked = inherited;
  $('coverage-fields').disabled = inherited;
  $('coverage-help').textContent = scopeId === 'brand' ? 'Default websites, markets and cadence for this brand.' : inherited ? 'Inherited from the brand. Turn off to customize this product.' : 'Custom coverage applies only to this product.';
  renderChoices('websites', websites.map(site => [site.id, site.name]), coverage.websites, inherited);
  renderChoices('countries', Object.entries(countries), coverage.countries, inherited);
  $('frequency').value = coverage.frequency;
}
function renderSummary() {
  const scope = current();
  const owner = effectiveBrand();
  const coverage = effectiveCoverage(owner, scope);
  const terms = normalizeKeywords(scope.keywords);
  const plan = searchPlan(owner, scope);
  $('keyword-count').textContent = keywordCount(terms.length);
  $('preview-title').textContent = scopeId === 'brand' ? 'Whole brand' : scope.name;
  $('preview-description').textContent = scopeId === 'brand' ? 'Find listings across the brand, including products you have not added yet.' : 'Search specifically for this product.';
  $('search-count').textContent = plan.searches.length;
  $('search-cadence').textContent = `searches / ${coverage.frequency === 'daily' ? 'day' : coverage.frequency === 'weekly' ? 'week' : 'month'}`;
  $('summary-details').replaceChildren(
    textElement('div', `${keywordCount(terms.length)} · ${coverage.websites.length} websites`),
    textElement('div', coverage.countries.map(code => countries[code]).join(' · ') || 'No countries selected'),
  );
  $('unsupported').hidden = !plan.unsupported.length;
  $('unsupported').textContent = plan.unsupported.map(item => `${item.website} · ${item.country}`).join('; ') + ' excluded from this example plan.';
  const inheritedProducts = brand().products.filter(product => product.coverage === null).length;
  const pendingBrand = drafts.has(`${companyId}/${brandId}/brand`) && scopeId !== 'brand' && current().coverage === null;
  $('impact').textContent = scopeId === 'brand'
    ? `Coverage changes also apply to ${inheritedProducts} ${inheritedProducts === 1 ? 'product using' : 'products using'} brand defaults. Brand keywords are searched separately.`
    : pendingBrand ? 'Preview includes unsaved brand coverage. Save or discard that brand draft first.' : 'Brand-wide keywords stay in the brand search. They are not added to this product search.';
  $('validation').textContent = isDirty() ? validateScope(owner, scope) ?? '' : '';
  $('save').disabled = !isDirty() || Boolean(validateScope(owner, scope)) || pendingBrand;
  $('discard').disabled = !isDirty();
  $('save-state').textContent = isDirty() ? 'Unsaved changes · retained when you switch scope' : 'No unsaved changes';
  $('preview-button').disabled = !plan.searches.length;
}
function renderProducts() {
  const query = $('product-search').value.trim().toLowerCase();
  const products = brand().products.filter(product => `${product.name} ${product.category}`.toLowerCase().includes(query));
  $('products-brand').textContent = brand().name;
  $('products-list').replaceChildren(...products.map(product => {
    const row = document.createElement('div'); row.className = 'product-row';
    const name = document.createElement('div');
    name.append(textElement('span', product.name, 'product-name'), textElement('div', `${product.category} · ${keywordCount(product.keywords.length)}`, 'product-meta'));
    const action = textElement('button', 'Configure', 'secondary'); action.setAttribute('aria-label', `Configure ${product.name}`);
    action.addEventListener('click', () => { page = 'monitoring'; setScope(product.id); });
    row.append(name, textElement('span', product.coverage === null ? 'Uses brand coverage' : 'Custom coverage', 'coverage-label'), action);
    return row;
  }));
  if (!products.length) $('products-list').append(textElement('p', 'No products match your search.'));
}
function render() {
  $('company').replaceChildren(...data.map(item => option(item.id, item.name)));
  $('company').value = companyId;
  $('brand-control').hidden = company().brands.length === 1;
  $('brand').replaceChildren(...company().brands.map(item => option(item.id, item.name)));
  $('brand').value = brandId;
  $('brand-name').textContent = brand().name;
  $('breadcrumb').textContent = `${company().name} / ${page === 'monitoring' ? 'Monitoring' : 'Products'}`;
  $('product-count').textContent = brand().products.length;
  for (const name of ['monitoring', 'products']) {
    $(`${name}-page`).hidden = page !== name;
    $(`nav-${name}`).setAttribute('aria-current', page === name ? 'page' : 'false');
  }
  $('scope').replaceChildren(option('brand', 'Whole brand'), ...brand().products.map(product => option(product.id, product.name)));
  $('scope').value = scopeId;
  $('scope-type').textContent = scopeId === 'brand' ? 'Discover across the catalog' : 'Product-specific search';
  $('keyword-help').textContent = scopeId === 'brand' ? 'Brand names, common spellings and local names.' : 'Product names, variants and phrases people use to sell it.';
  $('keywords').value = current().keywords.join('\n');
  renderCoverage(); renderSummary(); renderProducts();
}

$('company').addEventListener('change', event => {
  companyId = event.target.value; brandId = company().brands[0].id; scopeId = 'brand';
  $('product-search').value = ''; announce('Company changed. Other drafts are retained in this tab.'); render();
});
$('brand').addEventListener('change', event => { brandId = event.target.value; scopeId = 'brand'; render(); });
$('scope').addEventListener('change', event => { announce(''); setScope(event.target.value); });
$('keywords').addEventListener('input', event => edit(scope => { scope.keywords = event.target.value.split('\n'); }));
$('inherit').addEventListener('change', event => {
  edit(scope => { scope.coverage = event.target.checked ? null : structuredClone(effectiveBrand().coverage); }); renderCoverage();
});
$('frequency').addEventListener('change', event => edit(scope => { scope.coverage.frequency = event.target.value; }));
$('save').addEventListener('click', () => {
  if ($('save').disabled) return;
  const scope = current(); scope.keywords = normalizeKeywords(scope.keywords);
  // Only the edited settings are saved; never replace the brand's product list
  // with a potentially older list captured when its draft was first opened.
  Object.assign(savedScope(), { keywords: [...scope.keywords], coverage: structuredClone(scope.coverage) });
  drafts.delete(key()); render(); announce('Saved in this sandbox tab. No production data changed.');
});
$('discard').addEventListener('click', () => { drafts.delete(key()); render(); announce('Draft discarded. Saved sandbox settings restored.'); });
for (const name of ['monitoring', 'products']) $('nav-' + name).addEventListener('click', () => { page = name; render(); });
$('product-search').addEventListener('input', renderProducts);
$('preview-button').addEventListener('click', () => {
  const plan = searchPlan(effectiveBrand(), current());
  $('preview-heading').textContent = `${plan.searches.length} planned searches`;
  $('preview-context').textContent = `${scopeId === 'brand' ? brand().name + ' · Whole brand' : current().name} · Example only. Each row is one keyword, website and search country.`;
  $('preview-rows').replaceChildren(...plan.searches.map(search => {
    const row = document.createElement('tr'); row.append(...[search.keyword, search.website, search.country].map(text => textElement('td', text))); return row;
  }));
  $('preview-dialog').showModal();
});
$('close-preview').addEventListener('click', () => $('preview-dialog').close());
$('add-product').addEventListener('click', () => { $('product-form').reset(); $('product-error').textContent = ''; $('product-dialog').showModal(); $('product-name').focus(); });
$('cancel-product').addEventListener('click', () => $('product-dialog').close());
$('product-form').addEventListener('submit', event => {
  event.preventDefault();
  const name = $('product-name').value.trim();
  const keywords = normalizeKeywords($('product-keywords').value);
  if (!name || !keywords.length) { $('product-error').textContent = 'Enter a name and at least one keyword.'; return; }
  if (brand().products.some(product => product.name.toLowerCase() === name.toLowerCase())) { $('product-error').textContent = 'This product already exists in the brand.'; return; }
  const product = { id: `example-product-${++productSequence}`, name, keywords, category: 'Uncategorized', coverage: null };
  brand().products.push(product); $('product-dialog').close(); page = 'monitoring'; setScope(product.id);
  announce('Product added in this sandbox tab with brand coverage.');
});
render();
