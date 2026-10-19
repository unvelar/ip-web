import { afterEach, expect, test } from 'bun:test';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import EnforcementRules from '../src/monitoring-workspace/EnforcementRules';
import type { EnforcementRule } from '../src/monitoring-workspace/contracts';

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });
const inherited: EnforcementRule = { id: '11111111-1111-4111-8111-111111111111', condition: 'The offer is an empty product box', action: 'do_not_pursue', explanation: 'Packaging is outside our scope', overrides_rule_id: null };

test('a product replaces a brand rule explicitly and removing it restores inheritance', async () => {
  let saved: EnforcementRule[] = [];
  function Harness() {
    const [rules, setRules] = useState<EnforcementRule[]>([]);
    return <EnforcementRules rules={rules} inherited={[inherited]} product supported onChange={next => { saved = next; setRules(next); }} />;
  }
  root = createRoot(document.body);
  await act(async () => root!.render(<Harness />));
  const button = [...document.querySelectorAll('button')].find(item => item.textContent === 'Replace for this product')!;
  await act(async () => button.click());
  expect(saved).toHaveLength(1);
  expect(saved[0].id).not.toBe(inherited.id);
  expect(saved[0]).toMatchObject({ condition: inherited.condition, action: inherited.action, overrides_rule_id: inherited.id });
  const select = document.querySelector('select')!;
  await act(async () => { select.value = 'takedown'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(saved[0].action).toBe('takedown');
  expect(document.body.textContent).toContain('Replaced below');
  const remove = [...document.querySelectorAll('button')].find(item => item.textContent === 'Remove replacement and use brand rule')!;
  await act(async () => remove.click());
  expect(saved).toEqual([]);
  expect(document.body.textContent).not.toContain('Replaced below');
});

test('an older API keeps rules read-only during rollout', async () => {
  root = createRoot(document.body);
  await act(async () => root!.render(<EnforcementRules rules={[]} inherited={[inherited]} product supported={false} onChange={() => { throw new Error('Must not edit'); }} />));
  expect([...document.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
  expect(document.body.textContent).toContain('currently unavailable');
});
