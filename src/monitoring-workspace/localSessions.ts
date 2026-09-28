import { workspaceClient } from './api';

const LOCAL_WORKSPACE = {
  name: 'Local workspace',
  email: 'monitoring-workspace@localhost.test',
};

/** A separate local tenant. It deliberately starts empty and never mirrors a
 * signed-in production tenant or seeds someone else’s product data. */
export async function openLocalWorkspace(hostname: string) {
  const client = workspaceClient(hostname);
  await client.signIn(LOCAL_WORKSPACE.email);
  const data = await client.load();
  return { client, data: { ...data, company: { ...data.company, name: LOCAL_WORKSPACE.name } } };
}

export async function openLocalCatalog(hostname: string) {
  const client = workspaceClient(hostname);
  await client.signIn('catalog-admin@unvelar.example', true);
  return client;
}
