/**
 * pages/topology.page.js
 *
 * Mapa de topología (Criticidad → Aplicación → Base de Datos →
 * Servidor → Datacenter/Nube), persistido en PostgreSQL vía la misma
 * API/sesión/RBAC del resto del panel — reemplaza la versión standalone
 * (artifact con window.storage) por un recurso compartido de equipo.
 *
 * Edición requiere topology.edit; con solo topology.view el mapa se
 * muestra en modo solo-lectura (sin botones de agregar/conectar/borrar).
 */

import { auth } from '../auth/session.js';
import { Layout } from '../components/Layout.js';
import { toast } from '../components/Toast.js';
import { confirmDialog } from '../components/ConfirmDialog.js';
import { topologyService } from '../services/topology.service.js';
import { PERMISSIONS } from '../permissions/catalog.js';

const COLUMNS = [
  { title: 'Criticidad', color: '#e5484d' },
  { title: 'Aplicación', color: '#2E74B5' },
  { title: 'Base de Datos', color: '#d97706' },
  { title: 'Servidor / Instancia', color: '#059669' },
  { title: 'Datacenter / Nube', color: '#8b5cf6' },
];
const CRIT_LEVELS = [
  { name: 'Crítico', color: '#e5484d' },
  { name: 'Alto', color: '#e08a2c' },
  { name: 'Medio', color: '#d4b106' },
  { name: 'Bajo', color: '#059669' },
];

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
      ${canEdit ? 'Clic en una tarjeta para resaltar sus conexiones. Clic en una línea para eliminarla.' : 'Modo solo lectura — no tienes permiso de edición sobre este mapa.'}
    </p>
  `;

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

  let connectPanel = null;
  if (canEdit) {
    connectPanel = document.createElement('div');
    connectPanel.id = 'topology-connect-panel';
    connectPanel.innerHTML = `
      <h2>Crear conexión</h2>
      <div class="topology-connect-row">
        <select id="topology-sel-from"></select>
        <span>→</span>
        <select id="topology-sel-to"></select>
        <button type="button" class="btn btn--primary" id="topology-btn-connect">Conectar</button>
      </div>
    `;
    content.appendChild(connectPanel);
  }

  root.appendChild(Layout(content));

  await refresh();

  if (canEdit) {
    document.getElementById('topology-btn-connect').addEventListener('click', async () => {
      const fromNodeId = document.getElementById('topology-sel-from').value;
      const toNodeId = document.getElementById('topology-sel-to').value;
      if (!fromNodeId || !toNodeId) return;
      try {
        await topologyService.createEdge({ fromNodeId, toNodeId });
        toast.success('Conexión creada');
        await refresh();
      } catch (err) {
        toast.error(err.message);
      }
    });
  }

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
  if (canEdit) renderSelects();
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
        ${canEdit ? '<div class="topology-card__del" title="Eliminar">&times;</div>' : ''}
        <div class="topology-card__name">${escapeHtml(n.name)}</div>
        ${n.sub ? `<div class="topology-card__sub">${escapeHtml(n.sub)}</div>` : ''}
      `;
      card.addEventListener('click', (ev) => {
        if (ev.target.closest('.topology-card__del')) return;
        selectedNodeId = selectedNodeId === n.id ? null : n.id;
        renderColumns();
        renderLinks();
      });
      if (canEdit) {
        card.querySelector('.topology-card__del').addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = await confirmDialog({
            title: 'Eliminar nodo',
            message: `¿Eliminar "${n.name}"? También se eliminarán sus conexiones.`,
            confirmLabel: 'Eliminar',
            danger: true,
          });
          if (!ok) return;
          try {
            await topologyService.deleteNode(n.id);
            if (selectedNodeId === n.id) selectedNodeId = null;
            toast.success('Nodo eliminado');
            await refresh();
          } catch (err) {
            toast.error(err.message);
          }
        });
      }
      if (canEdit) {
        card.addEventListener('dblclick', () => startRename(n));
      }
      colEl.appendChild(card);
    });

    if (canEdit) {
      const addBtn = document.createElement('div');
      addBtn.className = 'topology-addcard';
      addBtn.textContent = ci === 0 ? '+ agregar nivel' : `+ agregar ${colDef.title.toLowerCase()}`;
      addBtn.addEventListener('click', () => showAddForm(ci, colEl, addBtn));
      colEl.appendChild(addBtn);
    }
  });
}

function isRelated(id) {
  if (id === selectedNodeId) return true;
  return graph.edges.some((e) => (e.from === selectedNodeId && e.to === id) || (e.to === selectedNodeId && e.from === id));
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function showAddForm(col, colEl, addBtn) {
  const form = document.createElement('div');
  form.className = 'topology-inline-form';

  if (col === 0) {
    const existingNames = new Set(graph.nodes.filter((n) => n.col === 0).map((n) => n.name));
    const available = CRIT_LEVELS.filter((l) => !existingNames.has(l.name));
    if (!available.length) {
      toast.info('Ya agregaste los 4 niveles de criticidad');
      return;
    }
    form.innerHTML = `
      <select id="topology-crit-level">${available.map((l) => `<option value="${l.name}">${l.name}</option>`).join('')}</select>
      <input type="text" placeholder="Detalle (opcional)" id="topology-new-sub">
      <div class="topology-inline-form__row">
        <button type="button" class="btn btn--primary btn--sm">Agregar</button>
        <button type="button" class="btn btn--ghost btn--sm">Cancelar</button>
      </div>
    `;
  } else {
    form.innerHTML = `
      <input type="text" placeholder="Nombre" id="topology-new-name" autofocus>
      <input type="text" placeholder="Detalle (opcional)" id="topology-new-sub">
      <div class="topology-inline-form__row">
        <button type="button" class="btn btn--primary btn--sm">Agregar</button>
        <button type="button" class="btn btn--ghost btn--sm">Cancelar</button>
      </div>
    `;
  }

  colEl.replaceChild(form, addBtn);
  const [okBtn, cancelBtn] = form.querySelectorAll('button');

  okBtn.addEventListener('click', async () => {
    try {
      if (col === 0) {
        const levelName = form.querySelector('#topology-crit-level').value;
        const level = CRIT_LEVELS.find((l) => l.name === levelName);
        const sub = form.querySelector('#topology-new-sub').value.trim();
        await topologyService.createNode({ columnIndex: 0, name: level.name, sub, color: level.color });
      } else {
        const name = form.querySelector('#topology-new-name').value.trim();
        const sub = form.querySelector('#topology-new-sub').value.trim();
        if (!name) return;
        await topologyService.createNode({ columnIndex: col, name, sub });
      }
      toast.success('Nodo agregado');
      await refresh();
    } catch (err) {
      toast.error(err.message);
    }
  });
  cancelBtn.addEventListener('click', () => renderColumns());
}

async function startRename(node) {
  const name = prompt('Nuevo nombre:', node.name);
  if (!name || !name.trim()) return;
  const sub = prompt('Detalle (opcional):', node.sub || '');
  try {
    await topologyService.updateNode(node.id, { name: name.trim(), sub: (sub || '').trim() });
    toast.success('Nodo actualizado');
    await refresh();
  } catch (err) {
    toast.error(err.message);
  }
}

function renderSelects() {
  const from = document.getElementById('topology-sel-from');
  const to = document.getElementById('topology-sel-to');
  if (!from || !to) return;
  const opts = COLUMNS.map((c, ci) => {
    const items = graph.nodes.filter((n) => n.col === ci);
    if (!items.length) return '';
    return `<optgroup label="${c.title}">${items.map((n) => `<option value="${n.id}">${escapeHtml(n.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  from.innerHTML = opts;
  to.innerHTML = opts;
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
