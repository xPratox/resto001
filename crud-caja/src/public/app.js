const pagoForm = document.getElementById('pagoForm');
const pedidosList = document.getElementById('pedidosList');
const reporteList = document.getElementById('reporteList');
const reporteSection = document.getElementById('reporteSection');
const openReporteBtn = document.getElementById('openReporte');
const loadDemoPedidosBtn = document.getElementById('loadDemoPedidos');
const reloadPedidosBtn = document.getElementById('reloadPedidos');
const reloadReporteBtn = document.getElementById('reloadReporte');
const liveNotice = document.getElementById('liveNotice');
const lastUpdated = document.getElementById('lastUpdated');
const reportTotal = document.getElementById('reportTotal');
const reportMeta = document.getElementById('reportMeta');
const reportDailyCards = document.getElementById('reportDailyCards');

const { API_BASE_URL, SOCKET_URL } = window.RESTO_CONFIG || {
  API_BASE_URL: 'http://192.168.0.100:5000',
  SOCKET_URL: 'http://192.168.0.100:5000',
};

let socketInstance = null;
let noticeTimer = null;
let pollingTimer = null;
let elapsedTimer = null;
let lastPedidosSyncAt = null;
let pedidosRequestInFlight = null;

const POLLING_INTERVAL_MS = 10000;

function setStatus(message, data) {
  if (data) {
    console.log(message, data);
    return;
  }

  console.log(message);
}

function showLiveNotice(message, variant = 'success') {
  if (!liveNotice) {
    return;
  }

  liveNotice.textContent = message;
  liveNotice.classList.remove('hidden');
  liveNotice.classList.toggle('success', variant === 'success');

  if (noticeTimer) {
    window.clearTimeout(noticeTimer);
  }

  noticeTimer = window.setTimeout(() => {
    liveNotice.classList.add('hidden');
    liveNotice.classList.remove('success');
  }, 3200);
}

function updateLastUpdatedLabel() {
  if (!lastUpdated) {
    return;
  }

  if (!lastPedidosSyncAt) {
    lastUpdated.textContent = 'Sincronizando pedidos...';
    return;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastPedidosSyncAt) / 1000));
  lastUpdated.textContent = `Actualizado hace: ${elapsedSeconds}s`;
}

function markPedidosSynced() {
  lastPedidosSyncAt = Date.now();
  updateLastUpdatedLabel();
}

function ensureElapsedTimer() {
  if (elapsedTimer) {
    return;
  }

  elapsedTimer = window.setInterval(updateLastUpdatedLabel, 1000);
}

function stopElapsedTimer() {
  if (!elapsedTimer) {
    return;
  }

  window.clearInterval(elapsedTimer);
  elapsedTimer = null;
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || 'Error en la solicitud');
  }

  return data;
}

function requestCentral(path, options = {}) {
  return requestJson(`${API_BASE_URL}${path}`, options);
}

function requestLocal(path, options = {}) {
  return requestJson(path, options);
}

function normalizePedido(order) {
  return {
    _id: order._id,
    mesa: order.table,
    estado: order.status,
    total: Number(order.total || 0),
    clienteNombre: order.cliente_nombre || '',
    items: (order.items || []).map((item) => ({
      cantidad: 1,
      nombre: item.name,
      precioUnitario: Number(item.price || 0),
      nota: item.note || 'Sin notas',
    })),
  };
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function renderPedidos(items) {
  pedidosList.innerHTML = '';

  if (!items.length) {
    pedidosList.innerHTML = '<p>No hay pedidos activos en el backend central.</p>';
    return;
  }

  items.forEach((pedido) => {
    const div = document.createElement('article');
    div.className = 'item';

    const itemsTxt = pedido.items
      .map((i) => `${i.cantidad} x ${i.nombre} ($${i.precioUnitario})${i.nota ? ` · ${i.nota}` : ''}`)
      .join(' | ');

    div.innerHTML = `
      <div class="item-head">
        <strong>${pedido.mesa}${pedido.clienteNombre ? ` - ${pedido.clienteNombre}` : ''}</strong>
        <span class="badge ${pedido.estado === 'pagado' ? 'ok' : ''}">${pedido.estado}</span>
      </div>
      <p><small>ID: ${pedido._id}</small></p>
      <p>${itemsTxt}</p>
      <p><strong>Total:</strong> $${pedido.total.toFixed(2)}</p>
      <div class="actions">
        ${pedido.estado !== 'pagado' ? `<button data-action="pagar" data-id="${pedido._id}">Marcar pagado</button>` : ''}
      </div>
    `;

    pedidosList.appendChild(div);
  });
}

function renderReportSummary(summaryByDay, daySummary) {
  if (reportTotal) {
    reportTotal.textContent = formatMoney(daySummary?.totalRevenue || 0);
  }

  if (reportMeta) {
    reportMeta.textContent = `${daySummary?.paidOrdersCount || 0} pedidos pagados el ${daySummary?.reportDate || 'dia actual'}`;
  }

  if (!reportDailyCards) {
    return;
  }

  if (!summaryByDay.length) {
    reportDailyCards.innerHTML = '<p class="report-meta">Todavia no hay ventas pagadas para resumir.</p>';
    return;
  }

  reportDailyCards.innerHTML = summaryByDay
    .map((summary) => `
      <article class="report-day-card">
        <p class="report-label">${summary.reportDate}</p>
        <p class="money">${formatMoney(summary.totalRevenue)}</p>
        <p class="report-meta">${summary.paidOrdersCount} pedidos pagados</p>
      </article>
    `)
    .join('');
}

function renderReporte(history) {
  const orders = history?.orders || [];
  renderReportSummary(history?.summaryByDay || [], history?.daySummary || null);

  reporteList.innerHTML = '';

  if (!orders.length) {
    reporteList.innerHTML = '<p>No hay ventas para reportar.</p>';
    return;
  }

  orders.forEach((venta) => {
    const div = document.createElement('article');
    div.className = 'report-order-card';

    const itemsTxt = (venta.items || [])
      .map((item) => `${item.name} (${formatMoney(item.price)})${item.note ? ` · ${item.note}` : ''}`)
      .join(' | ');

    div.innerHTML = `
      <div class="item-head">
        <strong>${venta.table}${venta.cliente_nombre ? ` - ${venta.cliente_nombre}` : ''}</strong>
        <span class="money">${formatMoney(venta.total)}</span>
      </div>
      <p class="report-order-id"><small>ID Orden: ${venta._id}</small></p>
      <p class="report-day-date"><small>Fecha: ${venta.reportDate}</small></p>
      <p class="report-order-items">${itemsTxt || 'Sin detalle de items'}</p>
    `;

    reporteList.appendChild(div);
  });
}

async function loadPedidos(options = {}) {
  const { silent = false } = options;

  if (pedidosRequestInFlight) {
    return pedidosRequestInFlight;
  }

  pedidosRequestInFlight = (async () => {
  try {
    const data = await requestCentral('/api/tables/status');
    const occupiedTables = (data.tables || []).filter((table) => table.occupied && table.orderId);
    const orders = await Promise.all(
      occupiedTables.map(async (table) => {
        const orderResponse = await requestCentral(`/api/orders/${table.orderId}`);
        return normalizePedido({
          ...orderResponse.order,
          cliente_nombre: table.cliente_nombre || orderResponse.order?.cliente_nombre,
        });
      }),
    );

    renderPedidos(orders);
    markPedidosSynced();
  } catch (error) {
    if (!silent) {
      alert('Error cargando pedidos: ' + error.message);
    }
    setStatus('Error cargando pedidos', { error: error.message });
  } finally {
    pedidosRequestInFlight = null;
  }
  })();

  return pedidosRequestInFlight;
}

async function loadReporte(options = {}) {
  const { silent = false } = options;

  try {
    const data = await requestCentral('/api/orders/history');
    renderReporte(data);
  } catch (error) {
    if (!silent) {
      alert('Error cargando reporte: ' + error.message);
    }
    setStatus('Error cargando reporte', { error: error.message });
  }
}

async function payOrderByMesa(mesa) {
  const orderLookup = await requestCentral(`/api/orders/active/table/${encodeURIComponent(mesa)}`);
  const order = orderLookup.order;

  await requestCentral(`/api/orders/${order._id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ items: order.items || [] }),
  });
}

async function payOrderById(orderId) {
  const orderResponse = await requestCentral(`/api/orders/${orderId}`);
  const order = orderResponse.order;

  await requestCentral(`/api/orders/${orderId}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({ items: order.items || [] }),
  });
}

async function ensureSocket() {
  if (socketInstance) {
    return socketInstance;
  }

  if (!window.io) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `${SOCKET_URL}/socket.io/socket.io.js`;
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  socketInstance = window.io(SOCKET_URL, {
    transports: ['websocket'],
  });

  socketInstance.on('connect', () => {
    showLiveNotice('Caja conectada en tiempo real.', 'success');
  });

  socketInstance.on('disconnect', () => {
    showLiveNotice('Socket desconectado. Polling de respaldo activo.', 'default');
  });

  socketInstance.on('orden_actualizada', async (payload) => {
    await loadPedidos({ silent: true });
    if (!reporteSection.classList.contains('hidden')) {
      await loadReporte({ silent: true });
    }
    showLiveNotice(`Caja sincronizada: ${payload?.table || 'pedido actualizado'}`);
  });

  return socketInstance;
}

function startPedidosPolling() {
  if (pollingTimer) {
    return;
  }

  pollingTimer = window.setInterval(() => {
    void loadPedidos({ silent: true });
  }, POLLING_INTERVAL_MS);
}

function stopPedidosPolling() {
  if (!pollingTimer) {
    return;
  }

  window.clearInterval(pollingTimer);
  pollingTimer = null;
}

function cleanupRealtimeResources() {
  stopPedidosPolling();
  stopElapsedTimer();

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

pagoForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const mesa = document.getElementById('mesaPago').value.trim();

    if (!mesa) {
      throw new Error('Debes indicar la mesa a cobrar.');
    }

    await payOrderByMesa(mesa);

    setStatus('Pago registrado en backend central', { mesa });
    pagoForm.reset();
    showLiveNotice(`Pago confirmado para ${mesa}`);
    await loadPedidos();
    if (!reporteSection.classList.contains('hidden')) {
      await loadReporte();
    }
  } catch (error) {
    alert('Error registrando pago: ' + error.message);
    setStatus('Error registrando pago', { error: error.message });
  }
});

pedidosList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;

  try {
    if (action === 'pagar') {
      await payOrderById(id);
      showLiveNotice('Pedido marcado como pagado.');
    }

    await loadPedidos();
  } catch (error) {
    alert('Error actualizando pedido: ' + error.message);
    setStatus('Error actualizando pedido', { error: error.message });
  }
});

reloadPedidosBtn.addEventListener('click', loadPedidos);
reloadReporteBtn.addEventListener('click', loadReporte);

if (loadDemoPedidosBtn) {
  loadDemoPedidosBtn.addEventListener('click', async () => {
    showLiveNotice('Los pedidos demo locales no forman parte del backend central.', 'default');
  });
}

openReporteBtn.addEventListener('click', async () => {
  const isHidden = reporteSection.classList.contains('hidden');
  if (isHidden) {
    reporteSection.classList.remove('hidden');
    openReporteBtn.textContent = 'Ocultar reporte';
    await loadReporte();
    return;
  }

  reporteSection.classList.add('hidden');
  openReporteBtn.textContent = 'Reporte';
});

window.addEventListener('beforeunload', cleanupRealtimeResources);
window.addEventListener('pagehide', cleanupRealtimeResources);

(async function init() {
  ensureElapsedTimer();
  await ensureSocket();
  await loadPedidos();
  startPedidosPolling();
})();
