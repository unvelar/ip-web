import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import type { MarketplaceClient, MarketplaceEdit } from '../src/monitoring-workspace/contracts';
const happyWindow = new Window({url:'http://localhost:5173'});
Object.assign(globalThis, {window:happyWindow, document:happyWindow.document, navigator:happyWindow.navigator,
  HTMLElement:happyWindow.HTMLElement, Element:happyWindow.Element, Event:happyWindow.Event, MouseEvent:happyWindow.MouseEvent, Node:happyWindow.Node, IS_REACT_ACT_ENVIRONMENT:true});
const { createRoot } = await import('react-dom/client');
const { default: MarketplaceAdmin } = await import('../src/monitoring-workspace/MarketplaceAdmin');
let root: Root;
afterEach(()=>{if(root) act(()=>root.unmount()); document.body.replaceChildren();});
const originalMarket = {country:'US',storefront_domain:'amazon.com',evidence_url:'https://amazon.com/'};
async function mount() {
  const saved: MarketplaceEdit[]=[];
  const client: MarketplaceClient = {
    catalog:async()=>({marketplaces:[{key:'domain:amazon.com',revision:4,name:'Amazon',domain:'amazon.com',kind:'domain',logo_key:'amazon',categories:[{key:'general',name:'General'}],markets:[originalMarket]}],categories:[{key:'general',name:'General'}],countries:[{code:'US',name:'United States'},{code:'DE',name:'Germany'}]}),
    saveMarketplace:async value=>{saved.push(value);return {key:value.key ?? `domain:${value.domain}`,revision:5};},
    addSector:async()=>{throw new Error('unexpected sector mutation');},
  };
  const container=document.createElement('div'); document.body.append(container); root=createRoot(container);
  await act(async()=>root.render(<MarketplaceAdmin client={client} embedded />));
  const dialog=container.querySelector('dialog')!;
  dialog.showModal=()=>{dialog.setAttribute('open','');}; dialog.close=()=>dialog.removeAttribute('open');
  await act(async()=>container.querySelector<HTMLButtonElement>('.page-heading button')!.click());
  return {container,saved};
}
async function select(selector:string,value:string) {
  const input=document.querySelector<HTMLSelectElement>(selector)!;
  await act(async()=>{input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));});
}
async function input(selector:string,value:string) {
  const field=document.querySelector<HTMLInputElement>(selector)!;
  await act(async()=>{field.focus();Object.getOwnPropertyDescriptor(happyWindow.HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));field.dispatchEvent(new happyWindow.KeyboardEvent('keyup',{key:'a',bubbles:true}));});
}
async function submit() { await act(async()=>document.querySelector('dialog form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); }
test('adding a country to an existing marketplace retains its identity, revision and existing storefronts',async()=>{
  const {saved}=await mount();
  await select('#marketplace-choice','domain:amazon.com');
  expect(document.querySelector('#marketplace-name')).toBeNull();
  expect(document.querySelector('dialog')!.textContent).toContain('Existing countries:');
  await select('[aria-label="Add marketplace country"]','DE');
  await input('#storefront-DE','amazon.de');
  await submit();
  expect(saved[0]).toMatchObject({key:'domain:amazon.com',expected_revision:4,name:'Amazon',logo_key:'amazon',categories:['general'],markets:[originalMarket,{country:'DE',storefront_domain:'amazon.de',evidence_url:'https://amazon.de/'}]});
});
test('the same add flow creates a new marketplace with its first country and default sector',async()=>{
  const {saved}=await mount();
  await input('#marketplace-name','New Market'); await input('#marketplace-domain','newmarket.com');
  await select('[aria-label="Add marketplace country"]','DE');
  await submit();
  expect(saved[0]).toMatchObject({key:null,expected_revision:0,name:'New Market',domain:'newmarket.com',categories:['general'],markets:[{country:'DE',storefront_domain:'newmarket.com',evidence_url:'https://newmarket.com/'}]});
});
test('switching marketplace choices requires discarding unsaved storefront changes',async()=>{
  await mount();
  await input('#marketplace-name','Unfinished marketplace');
  await select('#marketplace-choice','domain:amazon.com');
  expect(document.querySelector('#marketplace-name')).not.toBeNull();
  const button = (name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('dialog button')).find(item=>item.textContent===name)!;
  await act(async()=>button('Keep editing').click());
  expect((document.querySelector('#marketplace-name') as HTMLInputElement).value).toBe('Unfinished marketplace');
  await select('#marketplace-choice','domain:amazon.com');
  await act(async()=>button('Discard changes').click());
  expect(document.querySelector('#marketplace-name')).toBeNull();
  expect((document.querySelector('#marketplace-choice') as HTMLSelectElement).value).toBe('domain:amazon.com');
});
