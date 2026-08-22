import { describe, it, expect, afterAll } from 'vitest';
import { createTestClient } from '../helpers/testClient.js';
import { closeDatabaseConnection } from '../../src/config/database.js';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD;

describe('Mapa de topología', () => {
  afterAll(async () => {
    await closeDatabaseConnection();
  });

  it('requiere autenticación para ver el grafo', async () => {
    const client = createTestClient();
    const res = await client.get('/api/topology');
    expect(res.status).toBe(401);
  });

  it('un usuario sin topology.view no puede ver el grafo (403)', async () => {
    const admin = createTestClient();
    await admin.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const username = `notopo.${Date.now()}`;
    await admin.post('/api/users', {
      firstName: 'No',
      lastName: 'Topo',
      username,
      email: `${username}@example.com`,
      initialPassword: 'ClaveDePrueba123',
      roleIds: [],
    });

    const client = createTestClient();
    await client.login(username, 'ClaveDePrueba123');
    const res = await client.get('/api/topology');
    expect(res.status).toBe(403);
  });

  it('crea un nodo, lo conecta, y al borrarlo se borra también la conexión (cascada)', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const before = await client.get('/api/topology');
    const azure = before.body.data.nodes.find((n) => n.name === 'Azure');
    expect(azure).toBeDefined();

    const createRes = await client.post('/api/topology/nodes', {
      columnIndex: 3,
      name: `Servidor Test ${Date.now()}`,
      sub: 'creado por test',
    });
    expect(createRes.status).toBe(201);
    const nodeId = createRes.body.data.id;

    const edgeRes = await client.post('/api/topology/edges', { fromNodeId: nodeId, toNodeId: azure.id });
    expect(edgeRes.status).toBe(201);
    const edgeId = edgeRes.body.data.id;

    const dupRes = await client.post('/api/topology/edges', { fromNodeId: nodeId, toNodeId: azure.id });
    expect(dupRes.status).toBe(409);

    const afterCreate = await client.get('/api/topology');
    expect(afterCreate.body.data.edges.some((e) => e.id === edgeId)).toBe(true);

    const deleteRes = await client.delete(`/api/topology/nodes/${nodeId}`);
    expect(deleteRes.status).toBe(204);

    const afterDelete = await client.get('/api/topology');
    expect(afterDelete.body.data.nodes.some((n) => n.id === nodeId)).toBe(false);
    expect(afterDelete.body.data.edges.some((e) => e.id === edgeId)).toBe(false); // cascada
  });

  it('rechaza conectar un nodo consigo mismo (422)', async () => {
    const client = createTestClient();
    await client.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const graph = await client.get('/api/topology');
    const anyNode = graph.body.data.nodes[0];

    const res = await client.post('/api/topology/edges', { fromNodeId: anyNode.id, toNodeId: anyNode.id });
    expect(res.status).toBe(422);
  });

  it('rechaza crear un nodo sin topology.edit (403) aunque tenga topology.view', async () => {
    const admin = createTestClient();
    await admin.login(ADMIN_USERNAME, ADMIN_PASSWORD);

    const roles = await admin.get('/api/roles');
    const permissions = await admin.get('/api/permissions');
    const viewOnlyPermission = permissions.body.data.find((p) => p.code === 'topology.view');

    const roleRes = await admin.post('/api/roles', {
      name: `topology-viewer-${Date.now()}`,
      permissionIds: [viewOnlyPermission.id],
    });
    const viewerRoleId = roleRes.body.data.id;

    const username = `topoviewer.${Date.now()}`;
    await admin.post('/api/users', {
      firstName: 'Topo',
      lastName: 'Viewer',
      username,
      email: `${username}@example.com`,
      initialPassword: 'ClaveDePrueba123',
      roleIds: [viewerRoleId],
    });

    const client = createTestClient();
    await client.login(username, 'ClaveDePrueba123');

    const viewRes = await client.get('/api/topology');
    expect(viewRes.status).toBe(200);

    const createRes = await client.post('/api/topology/nodes', { columnIndex: 1, name: 'No debería crearse' });
    expect(createRes.status).toBe(403);
  });
});
