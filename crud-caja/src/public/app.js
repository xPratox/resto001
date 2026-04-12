const pagoForm = document.getElementById('pagoForm');
const mesaPagoSelect = document.getElementById('mesaPago');
const metodoPagoSelect = document.getElementById('metodoPago');
const montoRecibidoInput = document.getElementById('montoRecibido');
const monedaPagoSelect = document.getElementById('monedaPago');
const estadoPagoSelect = document.getElementById('estadoPago');
const saldoPendiente = document.getElementById('saldoPendiente');
const mesaSeleccionadaInfo = document.getElementById('mesaSeleccionadaInfo');
const tasaBcvInput = document.getElementById('tasaBcvInput');
const guardarTasaBcvButton = document.getElementById('guardarTasaBcv');
const tasaBcvStatus = document.getElementById('tasaBcvStatus');
const tasaPesosInput = document.getElementById('tasaPesosInput');
const guardarTasaPesosButton = document.getElementById('guardarTasaPesos');
const tasaPesosStatus = document.getElementById('tasaPesosStatus');
const conversionHint = document.getElementById('conversionHint');
const paymentWarning = document.getElementById('paymentWarning');
const paymentSubmitButton = pagoForm?.querySelector('button[type="submit"]');
const pedidosList = document.getElementById('pedidosList');
const reporteList = document.getElementById('reporteList');
const reporteSection = document.getElementById('reporteSection');
const openReporteBtn = document.getElementById('openReporte');
const reloadReporteBtn = document.getElementById('reloadReporte');
const liveNotice = document.getElementById('liveNotice');
const lastUpdated = document.getElementById('lastUpdated');
const lastOrderReceived = document.getElementById('lastOrderReceived');
const systemStatus = document.getElementById('systemStatus');
const reportTotal = document.getElementById('reportTotal');
const reportMeta = document.getElementById('reportMeta');
const reportDailyCards = document.getElementById('reportDailyCards');
const currentDateTime = document.getElementById('currentDateTime');

const { API_BASE_URL, SOCKET_URL } = window.RESTO_CONFIG || {
  API_BASE_URL: 'http://192.168.0.100:5000',
  SOCKET_URL: 'http://192.168.0.100:5000',
};

let socketInstance = null;
let noticeTimer = null;
let pollingTimer = null;
let elapsedTimer = null;
let dateTimeTimer = null;
let lastPedidosSyncAt = null;
let lastRealtimeOrderAt = null;
let lastRealtimeOrderLabel = '';
let pedidosRequestInFlight = null;
let activePaymentTables = [];
let paymentAmountDraft = '';
let currentDailyBcvRate = null;
let currentBcvDayKey = null;
let canEditBcvRate = true;
let currentDailyPesoRate = null;
let currentPesoDayKey = null;
let canEditPesoRate = true;

const POLLING_INTERVAL_MS = 10000;
const DASHBOARD_TIMEZONE = 'America/Caracas';

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

function getBackendHostLabel() {
  try {
    const parsedUrl = new URL(API_BASE_URL);
    return parsedUrl.hostname || '--';
  } catch {
    return '--';
  }
}

function formatElapsedFrom(timestamp) {
  if (!timestamp) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

function updateSystemStatusLabel(connected = true) {
  if (!systemStatus) {
    return;
  }

  const stateLabel = connected ? 'Sistema en linea' : 'Sistema con reconexion';
  systemStatus.textContent = `${stateLabel} - IP: ${getBackendHostLabel()}`;
}

function updateCurrentDateTimeLabel() {
  if (!currentDateTime) {
    return;
  }

  const now = new Date();
  const formattedDateTime = new Intl.DateTimeFormat('es-VE', {
    timeZone: DASHBOARD_TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(now);

  currentDateTime.textContent = `Fecha y hora: ${formattedDateTime}`;
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

  if (!lastOrderReceived) {
    return;
  }

  if (!lastRealtimeOrderAt) {
    lastOrderReceived.textContent = 'Ultimo pedido recibido: esperando evento...';
    return;
  }

  const elapsedLabel = formatElapsedFrom(lastRealtimeOrderAt);
  const tableLabel = lastRealtimeOrderLabel ? ` (${lastRealtimeOrderLabel})` : '';
  lastOrderReceived.textContent = `Ultimo pedido recibido hace ${elapsedLabel}${tableLabel}`;
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

function ensureDateTimeTimer() {
  if (dateTimeTimer) {
    return;
  }

  updateCurrentDateTimeLabel();
  dateTimeTimer = window.setInterval(updateCurrentDateTimeLabel, 1000);
}

function stopElapsedTimer() {
  if (!elapsedTimer) {
    return;
  }

  window.clearInterval(elapsedTimer);
  elapsedTimer = null;
}

function stopDateTimeTimer() {
  if (!dateTimeTimer) {
    return;
  }

  window.clearInterval(dateTimeTimer);
  dateTimeTimer = null;
}

function markRealtimeActivity(payload) {
  lastRealtimeOrderAt = Date.now();
  lastRealtimeOrderLabel = payload?.table || payload?.mesa || '';
  updateLastUpdatedLabel();
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
  const estadoVisible = order.status === 'limpieza'
    ? 'limpieza'
    : order.hora_pago && order.mesa_liberada !== true
      ? 'limpieza'
      : order.status

  const total = Number(order.total || 0)
  const montoPagado = Number(order.montoPagado || 0)
  const restante = Math.max(0, Number((total - montoPagado).toFixed(2)))

  return {
    _id: order._id,
    mesa: order.table,
    estado: estadoVisible,
    total,
    montoPagado,
    restante,
    clienteNombre: order.cliente_nombre || '',
    items: (order.items || []).map((item) => ({
      cantidad: 1,
      nombre: item.name,
      precioUnitario: Number(item.price || 0),
      nota: item.note || 'Sin notas',
    })),
  };
}

function renderMesaPagoOptions(tables) {
  if (!mesaPagoSelect) {
    return;
  }

  const currentValue = mesaPagoSelect.value;
  activePaymentTables = tables;

  mesaPagoSelect.innerHTML = `
    <option value="">Selecciona una mesa ocupada</option>
    ${tables
      .map(
        (table) => `<option value="${table.mesa}">${table.mesa}${table.clienteNombre ? ` - ${table.clienteNombre}` : ''}</option>`,
      )
      .join('')}
  `;

  if (tables.some((table) => table.mesa === currentValue)) {
    mesaPagoSelect.value = currentValue;
  }

  syncPaymentFormState();
}

function getSelectedPaymentTable() {
  const selectedMesa = mesaPagoSelect?.value?.trim();

  if (!selectedMesa) {
    return null;
  }

  return activePaymentTables.find((table) => table.mesa === selectedMesa) || null;
}

function syncPaymentFormState() {
  const selectedTable = getSelectedPaymentTable();
  const selectedMesa = selectedTable?.mesa || mesaPagoSelect?.value?.trim() || '';
  const pendingAmount = Math.max(0, Number(selectedTable?.restante || 0));
  const rawValue = paymentAmountDraft;
  const enteredAmountUsd = rawValue === '' ? 0 : getEnteredAmountInUsd(rawValue);
  const comparableEnteredUsd = Number.isFinite(enteredAmountUsd) ? Number(enteredAmountUsd.toFixed(2)) : NaN;
  const selectedCurrency = String(monedaPagoSelect?.value || 'USD').toUpperCase();
  const missingRateForCurrency =
    (selectedCurrency === 'BS' && rawValue !== '' && (!Number.isFinite(currentDailyBcvRate) || currentDailyBcvRate <= 0)) ||
    ((selectedCurrency === 'COP' || selectedCurrency === 'PESOS') && rawValue !== '' && (!Number.isFinite(currentDailyPesoRate) || currentDailyPesoRate <= 0));
  const exceedsPending = Boolean(selectedTable) && rawValue !== '' && Number.isFinite(comparableEnteredUsd) && comparableEnteredUsd > pendingAmount;

  if (saldoPendiente) {
    saldoPendiente.textContent = `Pendiente por cobrar: ${formatMoney(pendingAmount)}`;
  }

  if (mesaSeleccionadaInfo) {
    mesaSeleccionadaInfo.textContent = `Mesa seleccionada: ${selectedMesa || '--'}`;
  }

  if (conversionHint) {
    const bsLabel = Number.isFinite(currentDailyBcvRate) && currentDailyBcvRate > 0
      ? formatBs(pendingAmount * currentDailyBcvRate)
      : 'BS --';
    const copLabel = Number.isFinite(currentDailyPesoRate) && currentDailyPesoRate > 0
      ? formatPesos(pendingAmount * currentDailyPesoRate)
      : 'COP --';
    conversionHint.textContent = `Equivalente: ${bsLabel} | ${copLabel}`;
  }

  if (montoRecibidoInput) {
    if (selectedTable && pendingAmount > 0) {
      montoRecibidoInput.disabled = false;
      montoRecibidoInput.value = paymentAmountDraft;
    } else {
      montoRecibidoInput.disabled = true;
      paymentAmountDraft = '';
      montoRecibidoInput.value = '';
    }

    montoRecibidoInput.setCustomValidity('');
  }

  if (paymentWarning) {
    if (missingRateForCurrency) {
      paymentWarning.textContent = selectedCurrency === 'BS'
        ? 'Debes fijar la tasa BCV del dia para cobrar en Bs.'
        : 'Debes fijar la tasa COP del dia para cobrar en COP.';
      paymentWarning.classList.remove('hidden');
    } else if (exceedsPending) {
      paymentWarning.textContent = 'Monto excede el total';
      paymentWarning.classList.remove('hidden');
    } else {
      paymentWarning.classList.add('hidden');
    }
  }

  if (paymentSubmitButton) {
    paymentSubmitButton.disabled = !selectedTable || pendingAmount <= 0 || rawValue === '' || exceedsPending || missingRateForCurrency;
  }
}

function focusMesaForPayment(mesa) {
  if (!mesaPagoSelect) {
    return;
  }

  mesaPagoSelect.value = mesa;
  syncPaymentFormState();
  montoRecibidoInput?.focus();
  pagoForm?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatBs(amount) {
  return `BS ${Number(amount || 0).toFixed(2)}`;
}

function formatPesos(amount) {
  return `COP ${Number(amount || 0).toFixed(2)}`;
}

function parseDecimalInput(value) {
  const normalized = String(value ?? '').replace(',', '.').trim();
  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getEnteredAmountInUsd(rawValue) {
  const parsedAmount = parseDecimalInput(rawValue);
  const selectedCurrency = String(monedaPagoSelect?.value || 'USD').toUpperCase();

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return NaN;
  }

  if (selectedCurrency === 'USD') {
    return parsedAmount;
  }

  if (selectedCurrency === 'BS') {
    if (!Number.isFinite(currentDailyBcvRate) || currentDailyBcvRate <= 0) {
      return NaN;
    }

    return parsedAmount / currentDailyBcvRate;
  }

  if (selectedCurrency === 'COP' || selectedCurrency === 'PESOS') {
    if (!Number.isFinite(currentDailyPesoRate) || currentDailyPesoRate <= 0) {
      return NaN;
    }

    return parsedAmount / currentDailyPesoRate;
  }

  return NaN;
}

function refreshBcvStatusLabel() {
  if (!tasaBcvStatus) {
    return;
  }

  if (!Number.isFinite(currentDailyBcvRate) || currentDailyBcvRate <= 0) {
    tasaBcvStatus.textContent = 'Tasa BCV del dia: sin asignar';
    return;
  }

  const dayLabel = currentBcvDayKey ? ` (${currentBcvDayKey})` : '';
  const lockLabel = canEditBcvRate ? '' : ' · bloqueada hasta mañana';
  tasaBcvStatus.textContent = `Tasa BCV del dia: ${currentDailyBcvRate.toFixed(2)}${dayLabel}${lockLabel}`;
}

function refreshPesosStatusLabel() {
  if (!tasaPesosStatus) {
    return;
  }

  if (!Number.isFinite(currentDailyPesoRate) || currentDailyPesoRate <= 0) {
    tasaPesosStatus.textContent = 'Tasa COP del dia: sin asignar';
    return;
  }

  const dayLabel = currentPesoDayKey ? ` (${currentPesoDayKey})` : '';
  const lockLabel = canEditPesoRate ? '' : ' · bloqueada hasta mañana';
  tasaPesosStatus.textContent = `Tasa COP del dia: ${currentDailyPesoRate.toFixed(2)}${dayLabel}${lockLabel}`;
}

function applyBcvRateState({ rate, canEdit, dayKey }) {
  currentDailyBcvRate = Number.isFinite(Number(rate)) ? Number(rate) : null;
  currentBcvDayKey = dayKey || null;
  canEditBcvRate = Boolean(canEdit);

  if (tasaBcvInput) {
    tasaBcvInput.disabled = !canEdit;
    if (!canEdit && Number.isFinite(currentDailyBcvRate)) {
      tasaBcvInput.value = currentDailyBcvRate.toFixed(2);
    }
  }

  if (guardarTasaBcvButton) {
    guardarTasaBcvButton.disabled = !canEdit;
    guardarTasaBcvButton.textContent = canEdit ? 'Guardar' : 'Bloqueada hoy';
  }

  refreshBcvStatusLabel();
}

function applyPesosRateState({ rate, canEdit, dayKey }) {
  currentDailyPesoRate = Number.isFinite(Number(rate)) ? Number(rate) : null;
  currentPesoDayKey = dayKey || null;
  canEditPesoRate = Boolean(canEdit);

  if (tasaPesosInput) {
    tasaPesosInput.disabled = !canEdit;
    if (!canEdit && Number.isFinite(currentDailyPesoRate)) {
      tasaPesosInput.value = currentDailyPesoRate.toFixed(2);
    }
  }

  if (guardarTasaPesosButton) {
    guardarTasaPesosButton.disabled = !canEdit;
    guardarTasaPesosButton.textContent = canEdit ? 'Guardar' : 'Bloqueada hoy';
  }

  refreshPesosStatusLabel();
}

async function loadBcvRate() {
  const data = await requestCentral('/api/exchange-rate/today?type=bcv');
  applyBcvRateState({
    rate: data.rate,
    canEdit: Boolean(data.canEdit),
    dayKey: data.dayKey,
  });
  syncPaymentFormState();
}

async function loadPesosRate() {
  const data = await requestCentral('/api/exchange-rate/today?type=pesos');
  applyPesosRateState({
    rate: data.rate,
    canEdit: Boolean(data.canEdit),
    dayKey: data.dayKey,
  });
  syncPaymentFormState();
}

async function saveBcvRate() {
  const parsedRate = parseDecimalInput(tasaBcvInput?.value ?? '');

  if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
    throw new Error('Ingresa una tasa BCV valida mayor a cero.');
  }

  const data = await requestCentral('/api/exchange-rate/today?type=bcv', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-resto-module': 'caja',
    },
    body: JSON.stringify({ rate: parsedRate }),
  });

  applyBcvRateState({
    rate: data.rate,
    canEdit: false,
    dayKey: data.dayKey,
  });

  syncPaymentFormState();
  showLiveNotice(`Tasa BCV fijada en ${parsedRate.toFixed(2)} para hoy.`);
}

async function savePesosRate() {
  const parsedRate = parseDecimalInput(tasaPesosInput?.value ?? '');

  if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
    throw new Error('Ingresa una tasa COP valida mayor a cero.');
  }

  const data = await requestCentral('/api/exchange-rate/today?type=pesos', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-resto-module': 'caja',
    },
    body: JSON.stringify({ rate: parsedRate }),
  });

  applyPesosRateState({
    rate: data.rate,
    canEdit: false,
    dayKey: data.dayKey,
  });

  syncPaymentFormState();
  showLiveNotice(`Tasa COP fijada en ${parsedRate.toFixed(2)} para hoy.`);
}

function handleMontoChange(event) {
  const value = event.target.value;

  if (value === '' || /^\d*\.?\d*$/.test(value)) {
    paymentAmountDraft = value;
    syncPaymentFormState();
    return;
  }

  event.target.value = paymentAmountDraft;
}

function getPedidoStatusMeta(status) {
  if (status === 'limpieza') {
    return {
      cardClass: 'status-limpieza',
      badgeClass: 'cleaning',
      label: 'EN LIMPIEZA',
    };
  }

  if (status === 'pagado') {
    return {
      cardClass: 'status-pagado',
      badgeClass: 'ok',
      label: 'PAGADO',
    };
  }

  return {
    cardClass: 'status-pendiente',
    badgeClass: 'pending',
    label: 'PENDIENTE',
  };
}

function renderPedidos(items) {
  const visibleItems = items.filter((pedido) => pedido.estado !== 'limpieza');

  pedidosList.innerHTML = '';

  if (!visibleItems.length) {
    pedidosList.innerHTML = `
      <article class="empty-state">
        <p>No hay pedidos activos pendientes en caja.</p>
      </article>
    `;
    return;
  }

  visibleItems.forEach((pedido) => {
    const div = document.createElement('article');
    const statusMeta = getPedidoStatusMeta(pedido.estado);
    div.className = `pedido-card ${statusMeta.cardClass}`;

    const itemsMarkup = pedido.items.length
      ? pedido.items
          .map((i) => `
            <li class="pedido-item">
              <div class="pedido-item-line">
                <span class="pedido-item-name">${i.cantidad} x ${i.nombre}</span>
                <span class="pedido-item-price">${formatMoney(i.precioUnitario)}</span>
              </div>
              <span class="pedido-item-note">${i.nota || 'Sin notas'}</span>
            </li>
          `)
          .join('')
      : '<li class="pedido-item"><span class="pedido-item-note">Sin items registrados</span></li>';

    div.innerHTML = `
      <div class="pedido-card-top">
        <div class="mesa-stack">
          <p class="mesa-kicker">Mesa</p>
          <p class="mesa-value">${pedido.mesa}</p>
          <p class="cliente-name">${pedido.clienteNombre || 'Cliente sin nombre'}</p>
        </div>
        <span class="badge ${statusMeta.badgeClass}">${statusMeta.label}</span>
      </div>

      <div class="pedido-meta-row">
        <p class="pedido-id">ID: ${pedido._id}</p>
      </div>

      <ul class="pedido-items">${itemsMarkup}</ul>

      <div class="pedido-footer">
        <div>
          <p class="pedido-total-label">Monto total</p>
          <p class="pedido-total-value">
            <span>USD ${Number(pedido.total || 0).toFixed(2)}</span>
            ${Number.isFinite(currentDailyBcvRate) && currentDailyBcvRate > 0 ? `<span class="pedido-total-bs">${formatBs(pedido.total * currentDailyBcvRate)}</span>` : ''}
            ${Number.isFinite(currentDailyPesoRate) && currentDailyPesoRate > 0 ? `<span class="pedido-total-bs">${formatPesos(pedido.total * currentDailyPesoRate)}</span>` : ''}
          </p>
          <p class="pedido-balance-line">Pagado: ${formatMoney(pedido.montoPagado)}</p>
          <p class="pedido-balance-line ${pedido.restante > 0 ? 'is-pending' : 'is-complete'}">Restante: ${formatMoney(pedido.restante)}</p>
        </div>
        ${pedido.estado !== 'pagado' && pedido.estado !== 'limpieza' ? `<button data-action="seleccionar-mesa" data-mesa="${pedido.mesa}">Seleccionar</button>` : ''}
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
    reportMeta.textContent = `${daySummary?.transactionsCount || 0} transacciones registradas el ${daySummary?.reportDate || 'dia actual'}`;
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
        <p class="report-meta">${summary.transactionsCount} transacciones</p>
      </article>
    `)
    .join('');
}

function renderReporte(history) {
  const transactions = history?.transactions || [];
  renderReportSummary(history?.summaryByDay || [], history?.daySummary || null);

  reporteList.innerHTML = '';

  if (!transactions.length) {
    reporteList.innerHTML = '<article class="empty-state"><p>No hay ventas para reportar.</p></article>';
    return;
  }

  transactions.forEach((venta) => {
    const div = document.createElement('article');
    div.className = 'report-order-card';

    const itemsTxt = (venta.items || [])
      .map((item) => `${item.name} (${formatMoney(item.price)})${item.note ? ` · ${item.note}` : ''}`)
      .join(' | ');

    div.innerHTML = `
      <div class="item-head">
        <strong>${venta.table}${venta.cliente_nombre ? ` - ${venta.cliente_nombre}` : ''}</strong>
        <span class="money">${formatMoney(venta.paymentAmount)}</span>
      </div>
      <p class="report-order-id"><small>ID Orden: ${venta._id}</small></p>
      <p class="report-day-date"><small>Fecha: ${venta.reportDate}</small></p>
      <p class="report-day-date"><small>Metodo: ${venta.paymentMethod}</small></p>
      <p class="report-day-date"><small>Pagado acumulado: ${formatMoney(venta.montoPagado)} · Restante: ${formatMoney(venta.remainingAmount)}</small></p>
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

    const payableTables = orders.filter((order) => order.estado !== 'limpieza' && order.estado !== 'pagado');

    renderMesaPagoOptions(payableTables);
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

async function payOrderByMesa(mesa, paymentData) {
  const orderLookup = await requestCentral(`/api/orders/active/table/${encodeURIComponent(mesa)}`);
  const order = orderLookup.order;

  await requestCentral(`/api/orders/${order._id}/pay`, {
    method: 'PATCH',
    body: JSON.stringify({
      items: order.items || [],
      ...paymentData,
    }),
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
    updateSystemStatusLabel(true);
    showLiveNotice('Caja conectada en tiempo real.', 'success');
  });

  socketInstance.on('disconnect', () => {
    updateSystemStatusLabel(false);
    showLiveNotice('Socket desconectado. Polling de respaldo activo.', 'default');
  });

  socketInstance.on('orden_actualizada', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
    if (!reporteSection.classList.contains('hidden')) {
      await loadReporte({ silent: true });
    }
    showLiveNotice(`Caja sincronizada: ${payload?.table || 'pedido actualizado'}`);
  });

  socketInstance.on('mesa_liberada', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
    showLiveNotice(`Mesa liberada: ${payload?.table || 'actualizacion recibida'}`);
  });

  socketInstance.on('mesa_ocupada', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
    showLiveNotice(`Mesa ocupada: ${payload?.table || 'nuevo pedido'}`);
  });

  socketInstance.on('mesa_en_limpieza', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
    showLiveNotice(`Mesa en limpieza: ${payload?.table || 'pago completado'}`);
  });

  socketInstance.on('mesa_actualizada', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
  });

  socketInstance.on('tasa_actualizada', async (payload) => {
    try {
      if (payload?.rateType === 'pesos') {
        await loadPesosRate();
      } else {
        await loadBcvRate();
      }
    } catch (error) {
      setStatus('Error sincronizando tasa diaria', { error: error.message });
    }
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
  stopDateTimeTimer();

  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

pagoForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const mesa = mesaPagoSelect?.value?.trim();
    const metodo = metodoPagoSelect?.value || 'efectivo';
    const estado = estadoPagoSelect?.value || 'completado';
    const montoRecibidoUsd = getEnteredAmountInUsd(paymentAmountDraft || '0');
    const montoRecibido = Number.isFinite(montoRecibidoUsd) ? Number(montoRecibidoUsd.toFixed(2)) : NaN;

    if (!mesa) {
      throw new Error('Debes seleccionar una mesa ocupada para cobrar.');
    }

    const selectedTable = getSelectedPaymentTable();
    const pendingAmount = Math.max(0, Number(selectedTable?.restante || 0));

    if (!Number.isFinite(montoRecibido) || montoRecibido <= 0) {
      throw new Error('Monto recibido invalido para la moneda seleccionada.');
    }

    if (montoRecibido > pendingAmount) {
      throw new Error(`Monto excede el total pendiente (${formatMoney(pendingAmount)}).`);
    }

    await payOrderByMesa(mesa, {
      metodo,
      estado,
      montoRecibido,
    });

    setStatus('Pago registrado en backend central', { mesa });
    paymentAmountDraft = '';
    pagoForm.reset();
    syncPaymentFormState();
    showLiveNotice(`Pago registrado para ${mesa}.`);
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

  const action = button.dataset.action;
  const mesa = button.dataset.mesa;

  try {
    if (action === 'seleccionar-mesa' && mesa) {
      focusMesaForPayment(mesa);
      showLiveNotice(`Mesa ${mesa} lista para registrar abono.`, 'default');
    }

    await loadPedidos({ silent: true });
  } catch (error) {
    alert('Error actualizando pedido: ' + error.message);
    setStatus('Error actualizando pedido', { error: error.message });
  }
});

reloadReporteBtn.addEventListener('click', loadReporte);
mesaPagoSelect?.addEventListener('change', syncPaymentFormState);
montoRecibidoInput?.addEventListener('input', handleMontoChange);
monedaPagoSelect?.addEventListener('change', syncPaymentFormState);
tasaBcvInput?.addEventListener('input', () => {
  if (tasaBcvInput?.disabled) {
    return;
  }

  const draftRate = parseDecimalInput(tasaBcvInput.value);
  currentDailyBcvRate = Number.isFinite(draftRate) && draftRate > 0 ? draftRate : null;
  syncPaymentFormState();
});
guardarTasaBcvButton?.addEventListener('click', async () => {
  try {
    await saveBcvRate();
  } catch (error) {
    alert('Error guardando tasa BCV: ' + error.message);
    setStatus('Error guardando tasa BCV', { error: error.message });
    await loadBcvRate().catch(() => {});
  }
});

tasaPesosInput?.addEventListener('input', () => {
  if (tasaPesosInput?.disabled) {
    return;
  }

  const draftRate = parseDecimalInput(tasaPesosInput.value);
  currentDailyPesoRate = Number.isFinite(draftRate) && draftRate > 0 ? draftRate : null;
  syncPaymentFormState();
});

guardarTasaPesosButton?.addEventListener('click', async () => {
  try {
    await savePesosRate();
  } catch (error) {
    alert('Error guardando tasa COP: ' + error.message);
    setStatus('Error guardando tasa COP', { error: error.message });
    await loadPesosRate().catch(() => {});
  }
});

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
  updateSystemStatusLabel(false);
  syncPaymentFormState();
  ensureElapsedTimer();
  ensureDateTimeTimer();
  await Promise.all([loadBcvRate(), loadPesosRate()]);
  await ensureSocket();
  await loadPedidos();
  startPedidosPolling();
})();
