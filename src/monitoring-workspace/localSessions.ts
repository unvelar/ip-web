import { DraftError, workspaceClient } from './api';
import { exampleCompanies, exampleWorkspace } from './fixtures';

export async function openLocalCompany(company: typeof exampleCompanies[number], hostname: string) {
  const client = workspaceClient(hostname);
  await client.signIn(company.email);
  let data = await client.load();
  if (data.revision === 0) {
    try { await client.save(exampleWorkspace(company.id), 0); }
    catch (error) { if (!(error instanceof DraftError && error.status === 409)) throw error; }
    data = await client.load();
  }
  return { client, data: { ...data, company: { ...data.company, name: company.name } } };
}

export async function openLocalCatalog(hostname: string) {
  const client = workspaceClient(hostname);
  await client.signIn('catalog-admin@unvelar.example', true);
  return client;
}
