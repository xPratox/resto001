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
const tasaBcvEditor = document.getElementById('tasaBcvEditor');
const tasaBcvStatus = document.getElementById('tasaBcvStatus');
const tasaPesosInput = document.getElementById('tasaPesosInput');
const guardarTasaPesosButton = document.getElementById('guardarTasaPesos');
const tasaPesosEditor = document.getElementById('tasaPesosEditor');
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

const browserProtocol = window.location.protocol || 'http:';
const browserHost = window.location.hostname || '127.0.0.1';
const defaultBackendBaseUrl = `${browserProtocol}//${browserHost}:5000`;

const { API_BASE_URL, SOCKET_URL } = window.RESTO_CONFIG || {
  API_BASE_URL: defaultBackendBaseUrl,
  SOCKET_URL: defaultBackendBaseUrl,
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
let isBcvLocked = false;
let isPesoLocked = false;

const EXCHANGE_RATE_STORAGE_KEYS = {
  bcv: 'resto001:caja:exchange-rate:bcv',
  pesos: 'resto001:caja:exchange-rate:cop',
};

const RATE_LOCK_PULSE_MS = 720;

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

  maybeUnlockRateForNewDay('bcv');
  maybeUnlockRateForNewDay('pesos');

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

function formatShortDate(dateInput) {
  if (!dateInput) {
    return '';
  }

  const rawValue = String(dateInput).trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawValue)) {
    return rawValue;
  }

  if (/^\d{2}-\d{2}-\d{4}$/.test(rawValue)) {
    return rawValue.replace(/-/g, '/');
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [year, month, day] = rawValue.split('-');
    return `${day}/${month}/${year}`;
  }

  const parsedDate = new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('es-VE', {
    timeZone: DASHBOARD_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsedDate);
}

function getCurrentExchangeDayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function isRateExpired(dayKey) {
  if (!dayKey) {
    return false;
  }

  return String(dayKey).trim() !== getCurrentExchangeDayKey();
}

function buildRateStatusMarkup(type, rate, dayKey) {
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const shortDate = formatShortDate(dayKey);
  const dateMarkup = shortDate ? `<span class="rate-status-date"> | Fecha: ${shortDate}</span>` : '';

  return [
    '<span class="rate-lock-icon is-closed" aria-hidden="true"><span class="rate-lock-shackle"></span><span class="rate-lock-body"></span><span class="rate-lock-pulse"></span></span>',
    `<span class="rate-status-copy">Tasa ${type}: <span class="rate-status-amount">${Number(rate).toFixed(2)}</span>${dateMarkup}</span>`,
    `<button type="button" class="rate-status-reset" data-rate-type="${type.toLowerCase() === 'cop' ? 'pesos' : 'bcv'}" aria-label="Reiniciar tasa ${type}">✏️</button>`,
  ].join('');
}

function persistExchangeRate(type, rate, dayKey) {
  const storageKey = EXCHANGE_RATE_STORAGE_KEYS[type];

  if (!storageKey) {
    return;
  }

  try {
    if (!Number.isFinite(rate) || rate <= 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify({
      rate: Number(rate),
      dayKey: dayKey || null,
    }));
  } catch {
    // Ignore local persistence failures and keep the UI usable.
  }
}

function readPersistedExchangeRate(type) {
  const storageKey = EXCHANGE_RATE_STORAGE_KEYS[type];

  if (!storageKey) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue);
    const rate = Number(parsedValue?.rate);
    const dayKey = parsedValue?.dayKey || null;

    if (!Number.isFinite(rate) || rate <= 0 || isRateExpired(dayKey)) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      rate,
      dayKey,
    };
  } catch {
    return null;
  }
}

function hydratePersistedExchangeRates() {
  const persistedBcvRate = readPersistedExchangeRate('bcv');
  const persistedPesoRate = readPersistedExchangeRate('pesos');

  if (persistedBcvRate) {
    applyBcvRateState({
      rate: persistedBcvRate.rate,
      canEdit: false,
      dayKey: persistedBcvRate.dayKey,
    });
  }

  if (persistedPesoRate) {
    applyPesosRateState({
      rate: persistedPesoRate.rate,
      canEdit: false,
      dayKey: persistedPesoRate.dayKey,
    });
  }
}

function triggerRateLockPulse(statusElement) {
  if (!statusElement) {
    return;
  }

  statusElement.classList.remove('rate-status-line--pulse');
  void statusElement.offsetWidth;
  statusElement.classList.add('rate-status-line--pulse');

  window.setTimeout(() => {
    statusElement.classList.remove('rate-status-line--pulse');
  }, RATE_LOCK_PULSE_MS);
}

function resetPersistedExchangeRate(type) {
  const storageKey = EXCHANGE_RATE_STORAGE_KEYS[type];

  if (!storageKey) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup errors.
  }
}

function maybeUnlockRateForNewDay(type) {
  if (type === 'bcv') {
    if (currentBcvDayKey && isRateExpired(currentBcvDayKey)) {
      resetPersistedExchangeRate('bcv');
      applyBcvRateState({ rate: null, canEdit: true, dayKey: getCurrentExchangeDayKey() });
    }
    return;
  }

  if (currentPesoDayKey && isRateExpired(currentPesoDayKey)) {
    resetPersistedExchangeRate('pesos');
    applyPesosRateState({ rate: null, canEdit: true, dayKey: getCurrentExchangeDayKey() });
  }
}

async function editTasaHoy(type) {
  const currentRate = type === 'bcv' ? currentDailyBcvRate : currentDailyPesoRate;
  const currentDayKey = type === 'bcv' ? currentBcvDayKey : currentPesoDayKey;

  resetPersistedExchangeRate(type);

  try {
    await requestCentral(`/api/exchange-rate/today?type=${type}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-resto-module': 'caja',
      },
    });
  } catch (error) {
    setStatus('Error reiniciando tasa diaria', { type, error: error.message });
  }

  if (type === 'bcv') {
    applyBcvRateState({
      rate: Number.isFinite(currentRate) ? currentRate : null,
      canEdit: true,
      dayKey: currentDayKey || getCurrentExchangeDayKey(),
    });
    showLiveNotice('Tasa BCV lista para correccion.', 'success');
    tasaBcvInput?.focus();
    return;
  }

  applyPesosRateState({
    rate: Number.isFinite(currentRate) ? currentRate : null,
    canEdit: true,
    dayKey: currentDayKey || getCurrentExchangeDayKey(),
  });
  showLiveNotice('Tasa COP lista para correccion.', 'success');
  tasaPesosInput?.focus();
}

function toggleRateVisibility({ editorElement, statusElement, canEdit, hasRate }) {
  const showSummary = !canEdit && hasRate;

  if (editorElement) {
    editorElement.classList.toggle('is-visible', !showSummary);
    editorElement.classList.toggle('is-hidden', showSummary);
    editorElement.setAttribute('aria-hidden', showSummary ? 'true' : 'false');
  }

  if (statusElement) {
    statusElement.classList.toggle('is-visible', showSummary);
    statusElement.classList.toggle('is-hidden', !showSummary);
    statusElement.setAttribute('aria-hidden', showSummary ? 'false' : 'true');
  }
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
  activePaymentTables = tables.filter((table) => isOccupiedTableForPayment(table));

  mesaPagoSelect.innerHTML = `
    <option value="">Selecciona una mesa ocupada</option>
    ${activePaymentTables
      .map(
        (table) => `<option value="${table.mesa}">${formatMesaOptionLabel(table)}</option>`,
      )
      .join('')}
  `;

  if (activePaymentTables.some((table) => table.mesa === currentValue)) {
    mesaPagoSelect.value = currentValue;
  }

  syncPaymentFormState();
}

function isOccupiedTableForPayment(table) {
  if (!table) {
    return false;
  }

  const estado = String(table.estado || '').trim().toLowerCase();
  return Boolean(table.mesa) && estado !== 'limpieza' && estado !== 'pagado' && Number(table.restante || 0) > 0;
}

function formatMesaSelectionLabel(mesa) {
  const rawMesa = String(mesa || '').trim();

  if (!rawMesa) {
    return '--';
  }

  const numberMatch = rawMesa.match(/(\d+)/);

  if (!numberMatch) {
    return rawMesa;
  }

  return numberMatch[1].padStart(2, '0');
}

function formatMesaOptionLabel(table) {
  const mesaLabel = formatMesaSelectionLabel(table?.mesa);
  const clienteLabel = table?.clienteNombre ? ` · ${table.clienteNombre}` : '';

  return `Mesa ${mesaLabel}${clienteLabel}`;
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
  const selectedMesaLabel = formatMesaSelectionLabel(selectedMesa);
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
    mesaSeleccionadaInfo.textContent = `Mesa seleccionada: ${selectedMesaLabel}`;
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

function handleTableSelect(mesaId) {
  if (!mesaPagoSelect) {
    return;
  }

  const normalizedMesaId = String(mesaId || '').trim();
  mesaPagoSelect.value = normalizedMesaId;
  paymentAmountDraft = '';
  syncPaymentFormState();
}

function focusMesaForPayment(mesa) {
  if (!mesaPagoSelect) {
    return;
  }

  handleTableSelect(mesa);
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

  const hasRate = Number.isFinite(currentDailyBcvRate) && currentDailyBcvRate > 0;
  tasaBcvStatus.innerHTML = buildRateStatusMarkup('BCV', currentDailyBcvRate, currentBcvDayKey) || '';
  isBcvLocked = !canEditBcvRate && hasRate;

  toggleRateVisibility({
    editorElement: tasaBcvEditor,
    statusElement: tasaBcvStatus,
    canEdit: !isBcvLocked,
    hasRate,
  });
}

function refreshPesosStatusLabel() {
  if (!tasaPesosStatus) {
    return;
  }

  const hasRate = Number.isFinite(currentDailyPesoRate) && currentDailyPesoRate > 0;
  tasaPesosStatus.innerHTML = buildRateStatusMarkup('COP', currentDailyPesoRate, currentPesoDayKey) || '';
  isPesoLocked = !canEditPesoRate && hasRate;

  toggleRateVisibility({
    editorElement: tasaPesosEditor,
    statusElement: tasaPesosStatus,
    canEdit: !isPesoLocked,
    hasRate,
  });
}

function applyBcvRateState({ rate, canEdit, dayKey, animateLock = false }) {
  currentDailyBcvRate = Number.isFinite(Number(rate)) ? Number(rate) : null;
  currentBcvDayKey = dayKey || null;
  canEditBcvRate = Boolean(canEdit);
  isBcvLocked = !canEditBcvRate && Number.isFinite(currentDailyBcvRate) && currentDailyBcvRate > 0;

  if (tasaBcvInput) {
    tasaBcvInput.disabled = !canEdit;
    if (Number.isFinite(currentDailyBcvRate)) {
      tasaBcvInput.value = currentDailyBcvRate.toFixed(2);
    } else if (canEdit) {
      tasaBcvInput.value = '';
    }
  }

  if (guardarTasaBcvButton) {
    guardarTasaBcvButton.disabled = !canEdit;
    guardarTasaBcvButton.textContent = 'Guardar';
  }

  persistExchangeRate('bcv', currentDailyBcvRate, currentBcvDayKey);
  refreshBcvStatusLabel();

  if (!canEditBcvRate && Number.isFinite(currentDailyBcvRate) && animateLock) {
    triggerRateLockPulse(tasaBcvStatus);
  }
}

function applyPesosRateState({ rate, canEdit, dayKey, animateLock = false }) {
  currentDailyPesoRate = Number.isFinite(Number(rate)) ? Number(rate) : null;
  currentPesoDayKey = dayKey || null;
  canEditPesoRate = Boolean(canEdit);
  isPesoLocked = !canEditPesoRate && Number.isFinite(currentDailyPesoRate) && currentDailyPesoRate > 0;

  if (tasaPesosInput) {
    tasaPesosInput.disabled = !canEdit;
    if (Number.isFinite(currentDailyPesoRate)) {
      tasaPesosInput.value = currentDailyPesoRate.toFixed(2);
    } else if (canEdit) {
      tasaPesosInput.value = '';
    }
  }

  if (guardarTasaPesosButton) {
    guardarTasaPesosButton.disabled = !canEdit;
    guardarTasaPesosButton.textContent = 'Guardar';
  }

  persistExchangeRate('pesos', currentDailyPesoRate, currentPesoDayKey);
  refreshPesosStatusLabel();

  if (!canEditPesoRate && Number.isFinite(currentDailyPesoRate) && animateLock) {
    triggerRateLockPulse(tasaPesosStatus);
  }
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
    animateLock: true,
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
    animateLock: true,
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
mesaPagoSelect?.addEventListener('change', (event) => {
  handleTableSelect(event.target.value);
});
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

tasaBcvStatus?.addEventListener('click', async (event) => {
  const resetButton = event.target.closest('.rate-status-reset');

  if (!resetButton) {
    return;
  }

  await editTasaHoy('bcv');
});

tasaPesosStatus?.addEventListener('click', async (event) => {
  const resetButton = event.target.closest('.rate-status-reset');

  if (!resetButton) {
    return;
  }

  await editTasaHoy('pesos');
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
  hydratePersistedExchangeRates();
  syncPaymentFormState();
  ensureElapsedTimer();
  ensureDateTimeTimer();
  await Promise.all([loadBcvRate(), loadPesosRate()]);
  await ensureSocket();
  await loadPedidos();
  startPedidosPolling();
})();
