/**
 * pages/topology.page.js
 *
 * Mapa de topología (Criticidad → Aplicación → Base de Datos →
 * Servidor → Datacenter/Nube), persistido en PostgreSQL vía la misma
 * API/sesión/RBAC del resto del panel.
 *
 * Es un DASHBOARD de solo visualización + gestión de conexiones entre
 * cajas ya existentes (resaltar, conectar, desconectar). El alta, baja
 * y modificación de las cajas en sí vive en el ABM de
 * topology-admin.page.js (topology.edit) — así el mapa no se satura de
 * controles de edición de cajas.
 *
 * Edición de conexiones requiere topology.edit; con solo topology.view
 * el mapa se muestra en modo solo-lectura.
 */

import { auth } from '../auth/session.js';
import { Layout } from '../components/Layout.js';
import { toast } from '../components/Toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { openModal } from '../components/Modal.js';
import { Form } from '../components/Form.js';
import { topologyService } from '../services/topology.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';
import { navigate } from '../router/router.js';
import { COLUMNS } from '../constants/topology.js';

let graph = { nodes: [], edges: [] };
let selectedNodeId = null;
let canEdit = false;

export async function renderTopologyPage() {
  const root = document.getElementById('app');
  root.innerHTML = '';
  canEdit = auth.hasPermission(PERMISSIONS.TOPOLOGY_EDIT);
  selectedNodeId = null;

  const content = document.createElement('div');
  content.className = 'topology-page';
  content.innerHTML = `
    <h1>Mapa de Topología</h1>
    <p class="topology-page__hint">
      ${canEdit ? 'Clic en una tarjeta para resaltar sus conexiones. Usá el ícono &#8646; de cada tarjeta para agregar o quitar sus conexiones. Clic en una línea para eliminarla.' : 'Modo solo lectura — no tienes permiso de edición sobre este mapa.'}
    </p>
  `;

  if (canEdit) {
    const adminLink = document.createElement('button');
    adminLink.type = 'button';
    adminLink.className = 'btn btn--ghost btn--sm';
    adminLink.textContent = 'Administrar cajas (alta / baja / modificación) →';
    adminLink.addEventListener('click', () => navigate('/topology/admin'));
    content.appendChild(adminLink);
  }

  const boardWrap = document.createElement('div');
  boardWrap.id = 'topology-board-wrap';
  const board = document.createElement('div');
  board.id = 'topology-board';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('id', 'topology-links');
  board.appendChild(svg);

  COLUMNS.forEach((_, i) => {
    const col = document.createElement('div');
    col.className = 'topology-col';
    col.dataset.col = String(i);
    board.appendChild(col);
  });
  boardWrap.appendChild(board);
  content.appendChild(boardWrap);

  root.appendChild(Layout(content));

  await refresh();

  window.addEventListener('resize', renderLinks);
}

async function refresh() {
  try {
    graph = await topologyService.getGraph();
  } catch (err) {
    toast.error('No se pudo cargar el mapa: ' + err.message);
    return;
  }
  renderColumns();
  requestAnimationFrame(renderLinks);
}

function renderColumns() {
  COLUMNS.forEach((colDef, ci) => {
    const colEl = document.querySelector(`.topology-col[data-col="${ci}"]`);
    const nodes = graph.nodes.filter((n) => n.col === ci);

    colEl.innerHTML = `<div class="topology-col__head"><span>${colDef.title}</span><span class="topology-col__count">${nodes.length}</span></div>`;

    nodes.forEach((n) => {
      const color = n.color || colDef.color;
      const dim = selectedNodeId && !isRelated(n.id) ? 'topology-card--dim' : '';
      const sel = selectedNodeId === n.id ? 'topology-card--selected' : '';
      const card = document.createElement('div');
      card.className = `topology-card ${dim} ${sel}`;
      card.style.setProperty('--c', color);
      card.dataset.id = n.id;
      card.innerHTML = `
        ${canEdit ? '<div class="topology-card__link" title="Editar conexiones">&#8646;</div>' : ''}
        <div class="topology-card__name">${escapeHtml(n.name)}</div>
        ${n.sub ? `<div class="topology-card__sub">${escapeHtml(n.sub)}</div>` : ''}
      `;
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('.topology-card__link')) return;
        selectedNodeId = selectedNodeId === n.id ? null : n.id;
        renderColumns();
        renderLinks();
      });
      if (canEdit) {
        card.querySelector('.topology-card__link').addEventListener('click', (ev) => {
          ev.stopPropagation();
          openConnectionsManager(n);
        });
      }
      colEl.appendChild(card);
    });
  });
}

function isRelated(id) {
  if (id === selectedNodeId) return true;
  return graph.edges.some((e) => (e.from === selectedNodeId && e.to === id) || (e.to === selectedNodeId && e.from === id));
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function getEdgeBetween(aId, bId) {
  return graph.edges.find((e) => (e.from === aId && e.to === bId) || (e.from === bId && e.to === aId));
}

function openConnectionsManager(node) {
  const connected = new Set(
    graph.edges.filter((e) => e.from === node.id || e.to === node.id).map((e) => (e.from === node.id ? e.to : e.from))
  );

  const groups = COLUMNS
    .map((c, ci) => ({ ci, title: c.title, nodes: graph.nodes.filter((n) => n.col === ci && n.id !== node.id) }))
    .filter((g) => g.nodes.length);

  if (!groups.length) {
    toast.info('No hay otras cajas para conectar');
    return;
  }

  const fields = groups.map((g) => ({
    name: `col_${g.ci}`,
    label: g.title,
    type: 'checkbox-group',
    options: g.nodes.map((n) => ({ value: n.id, label: n.name })),
    value: g.nodes.filter((n) => connected.has(n.id)).map((n) => n.id),
  }));

  const form = Form({
    fields,
    submitLabel: 'Guardar conexiones',
    onSubmit: async (values) => {
      const selected = new Set(Object.values(values).flat());
      const toAdd = [...selected].filter((id) => !connected.has(id));
      const toRemove = [...connected].filter((id) => !selected.has(id));

      for (const otherId of toAdd) {
        const other = graph.nodes.find((n) => n.id === otherId);
        const [fromNodeId, toNodeId] = node.col <= other.col ? [node.id, otherId] : [otherId, node.id];
        await topologyService.createEdge({ fromNodeId, toNodeId });
      }
      for (const otherId of toRemove) {
        const edge = getEdgeBetween(node.id, otherId);
        if (edge) await topologyService.deleteEdge(edge.id);
      }

      modal.close();
      toast.success('Conexiones actualizadas');
      await refresh();
    },
  });

  const modal = openModal({ title: `Conexiones de "${node.name}"`, content: form });
}

function renderLinks() {
  const svg = document.getElementById('topology-links');
  const board = document.getElementById('topology-board');
  if (!svg || !board) return;
  const boardRect = board.getBoundingClientRect();
  svg.setAttribute('width', boardRect.width);
  svg.setAttribute('height', boardRect.height);

  let paths = '';
  graph.edges.forEach((e) => {
    const fromEl = document.querySelector(`.topology-card[data-id="${e.from}"]`);
    const toEl = document.querySelector(`.topology-card[data-id="${e.to}"]`);
    if (!fromEl || !toEl) return;
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();
    const x1 = fr.right - boardRect.left;
    const y1 = fr.top + fr.height / 2 - boardRect.top;
    const x2 = tr.left - boardRect.left;
    const y2 = tr.top + tr.height / 2 - boardRect.top;
    const dx = Math.max(30, (x2 - x1) / 2);
    const fromNode = graph.nodes.find((n) => n.id === e.from);
    const color = (fromNode && (fromNode.color || COLUMNS[fromNode.col].color)) || '#999';
    let cls = 'topology-link';
    if (selectedNodeId) cls += e.from === selectedNodeId || e.to === selectedNodeId ? ' topology-link--hl' : ' topology-link--dim';
    paths += `<path class="${cls}" data-eid="${e.id}" stroke="${color}" d="M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}"/>`;
  });
  svg.innerHTML = paths;

  if (canEdit) {
    svg.querySelectorAll('path.topology-link').forEach((p) => {
      p.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Eliminar conexión', message: '¿Eliminar esta conexión?', confirmLabel: 'Eliminar', danger: true });
        if (!ok) return;
        try {
          await topologyService.deleteEdge(p.getAttribute('data-eid'));
          toast.success('Conexión eliminada');
          await refresh();
        } catch (err) {
          toast.error(err.message);
        }
      });
    });
  }
}
