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
const logoutButton = document.getElementById('logoutButton');
const systemStatus = document.getElementById('systemStatus');
const systemHost = document.getElementById('systemHost');
const reportTotal = document.getElementById('reportTotal');
const reportMeta = document.getElementById('reportMeta');
const reportDailyCards = document.getElementById('reportDailyCards');
const reportTotalBs = document.getElementById('reportTotalBs');
const reportTotalCop = document.getElementById('reportTotalCop');
const reportAvgTicket = document.getElementById('reportAvgTicket');
const reportVolumeValue = document.getElementById('reportVolumeValue');
const reportCleaningMeta = document.getElementById('reportCleaningMeta');
const reportRangeMeta = document.getElementById('reportRangeMeta');
const reportRangeFilter = document.getElementById('reportRangeFilter');
const reportDivider = document.getElementById('reportDivider');
const reportBlock = document.getElementById('reportBlock');
const salesByHourChart = document.getElementById('salesByHourChart');
const paymentMethodChart = document.getElementById('paymentMethodChart');
const reportMethodLegend = document.getElementById('reportMethodLegend');
const currentDateTime = document.getElementById('currentDateTime');
const authOverlay = document.getElementById('authOverlay');
const dashboardLayout = document.getElementById('dashboardLayout');
const authForm = document.getElementById('authForm');
const authUsuarioInput = document.getElementById('authUsuario');
const authContrasenaInput = document.getElementById('authContrasena');
const authSubmitButton = document.getElementById('authSubmit');
const authError = document.getElementById('authError');

const browserProtocol = window.location.protocol || 'http:';
const browserHost = window.location.hostname || '127.0.0.1';
const defaultBackendBaseUrl = `${browserProtocol}//${browserHost}:5000`;

const { API_BASE_URL, SOCKET_URL } = window.RESTO_CONFIG || {
  API_BASE_URL: defaultBackendBaseUrl,
  SOCKET_URL: defaultBackendBaseUrl,
};

const AUTH_STORAGE_KEY = 'resto001:auth:caja';
let authToken = '';
let authUsuario = '';

let socketInstance = null;
let socketListenersBound = false;
let noticeTimer = null;
let pollingTimer = null;
let elapsedTimer = null;
let dateTimeTimer = null;
let lastPedidosSyncAt = null;
let lastRealtimeOrderAt = null;
let lastRealtimeOrderLabel = '';
let pedidosRequestInFlight = null;
let currentPedidos = [];
let currentReportRange = 'today';
let latestReportPayload = null;
let mostrarAnalitica = false;
let salesByHourChartInstance = null;
let paymentMethodChartInstance = null;
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

const EXCHANGE_RATE_LOCK_STORAGE_KEYS = {
  bcv: {
    flag: 'tasa_bcv_fijada',
    date: 'tasa_bcv_fecha',
  },
  pesos: {
    flag: 'tasa_cop_fijada',
    date: 'tasa_cop_fecha',
  },
};

const RATE_LOCK_PULSE_MS = 720;

const POLLING_INTERVAL_MS = 10000;
const DASHBOARD_TIMEZONE = 'America/Caracas';
const CAJA_VISIBLE_STATUSES = ['en_cocina', 'entregado'];

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
  if (!systemStatus && !systemHost) {
    return;
  }

  const stateLabel = connected ? 'En linea' : 'Reconectando';

  if (systemStatus) {
    systemStatus.textContent = stateLabel;
  }

  if (systemHost) {
    systemHost.textContent = getBackendHostLabel();
  }
}

function updateCurrentDateTimeLabel() {
  if (!currentDateTime) {
    return;
  }

  maybeUnlockRateForNewDay('bcv');
  maybeUnlockRateForNewDay('pesos');

  const now = new Date();
  const formattedTime = new Intl.DateTimeFormat('es-VE', {
    timeZone: DASHBOARD_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
  const formattedDate = new Intl.DateTimeFormat('es-VE', {
    timeZone: DASHBOARD_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(now);

  currentDateTime.textContent = `${formattedTime} | ${formattedDate}`;
}

function updateLastUpdatedLabel() {
  if (!lastPedidosSyncAt) {
    if (lastUpdated) {
      lastUpdated.textContent = 'Sincronizando pedidos...';
    }

    return;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastPedidosSyncAt) / 1000));
  if (lastUpdated) {
    lastUpdated.textContent = `Sync ${elapsedSeconds}s`;
  }
}

function isAnalyticsVisible() {
  return Boolean(reportBlock) && mostrarAnalitica === true && !reportBlock.classList.contains('hidden');
}

function syncAnalyticsVisibility() {
  if (!reportBlock || !openReporteBtn) {
    return;
  }

  reportBlock.classList.toggle('hidden', !mostrarAnalitica);
  reportBlock.setAttribute('aria-hidden', mostrarAnalitica ? 'false' : 'true');
  openReporteBtn.setAttribute('aria-expanded', mostrarAnalitica ? 'true' : 'false');
  openReporteBtn.classList.toggle('is-active', mostrarAnalitica);
  openReporteBtn.textContent = mostrarAnalitica ? '✕ Cerrar Reportes' : '👁️ Ver Reportes';
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
  const shouldAttachAuth = authToken && String(url).startsWith(API_BASE_URL);
  const { headers: customHeaders = {}, ...restOptions } = options;
  const res = await fetch(url, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(shouldAttachAuth ? { Authorization: `Bearer ${authToken}` } : {}),
      ...customHeaders,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && shouldAttachAuth) {
      clearCajaSession();
      setCajaAuthVisibility(false);
      showAuthError('Tu sesion expiro. Inicia sesion nuevamente.');
      stopPedidosPolling();
      cleanupRealtimeResources();
    }

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

function loadStoredCajaSession() {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeCajaSession(session) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function clearCajaSession() {
  authToken = '';
  authUsuario = '';
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

function setCajaAuthVisibility(isAuthenticated) {
  authOverlay?.classList.toggle('hidden', isAuthenticated);
  dashboardLayout?.classList.toggle('hidden', !isAuthenticated);
}

function showAuthError(message) {
  if (!authError) {
    return;
  }

  if (!message) {
    authError.textContent = '';
    authError.classList.add('hidden');
    return;
  }

  authError.textContent = message;
  authError.classList.remove('hidden');
}

async function loginCajaUser(usuario, contrasena) {
  return requestJson(`${API_BASE_URL}/api/login`, {
    method: 'POST',
    body: JSON.stringify({ usuario, contrasena }),
  });
}

async function ensureCajaLogin() {
  const storedSession = loadStoredCajaSession();

  if (storedSession?.token && storedSession?.rol === 'caja') {
    authToken = storedSession.token;
    authUsuario = storedSession.usuario || '';
    setCajaAuthVisibility(true);
    return;
  }

  setCajaAuthVisibility(false);

  await new Promise((resolve) => {
    if (!authForm || !authUsuarioInput || !authContrasenaInput) {
      resolve();
      return;
    }

    const submitHandler = async (event) => {
      event.preventDefault();

      const usuario = String(authUsuarioInput.value || '').trim();
      const contrasena = String(authContrasenaInput.value || '').trim();

      if (!usuario || !contrasena) {
        showAuthError('Debes completar usuario y contrasena.');
        return;
      }

      if (authSubmitButton) {
        authSubmitButton.disabled = true;
        authSubmitButton.textContent = 'Ingresando...';
      }

      showAuthError('');

      try {
        const data = await loginCajaUser(usuario, contrasena);

        if (data?.rol !== 'caja') {
          throw new Error('Este modulo solo permite usuarios con rol caja.');
        }

        authToken = data.token;
        authUsuario = data.usuario || '';
        storeCajaSession({
          token: authToken,
          rol: data.rol,
          usuario: authUsuario,
        });

        setCajaAuthVisibility(true);
        authContrasenaInput.value = '';
        showLiveNotice(`Sesion iniciada: ${authUsuario}`, 'success');
        authForm.removeEventListener('submit', submitHandler);
        resolve();
      } catch (error) {
        showAuthError(error.message || 'Credenciales invalidas.');
      } finally {
        if (authSubmitButton) {
          authSubmitButton.disabled = false;
          authSubmitButton.textContent = 'Entrar';
        }
      }
    };

    authForm.addEventListener('submit', submitHandler);
  });
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

function formatReportMethod(method) {
  const normalized = String(method || '').trim().toLowerCase();

  if (normalized === 'tarjeta' || normalized === 'punto') {
    return 'Punto';
  }

  if (normalized === 'transferencia') {
    return 'Transferencia';
  }

  if (normalized === 'efectivo') {
    return 'Efectivo';
  }

  if (normalized === 'binance') {
    return 'Binance';
  }

  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Otro';
}

function formatReportHour(dateValue) {
  if (!dateValue) {
    return '--';
  }

  return new Intl.DateTimeFormat('es-VE', {
    timeZone: DASHBOARD_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateValue));
}

function destroyReportCharts() {
  if (salesByHourChartInstance) {
    salesByHourChartInstance.destroy();
    salesByHourChartInstance = null;
  }

  if (paymentMethodChartInstance) {
    paymentMethodChartInstance.destroy();
    paymentMethodChartInstance = null;
  }
}

function renderSalesByHourChart(dataset) {
  if (!salesByHourChart || !window.Chart) {
    return;
  }

  const labels = dataset.map((item) => item.hour);
  const data = dataset.map((item) => Number(item.total || 0));

  salesByHourChartInstance = new window.Chart(salesByHourChart, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Ventas USD',
        data,
        backgroundColor: '#00D8FF',
        borderRadius: 12,
        borderSkipped: false,
        maxBarThickness: 28,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          borderColor: 'rgba(0, 216, 255, 0.24)',
          borderWidth: 1,
          titleColor: '#FFFFFF',
          bodyColor: '#E2E8F0',
          callbacks: {
            label(context) {
              return ` ${formatMoney(context.raw)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94A3B8' },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: '#94A3B8',
            callback(value) {
              return `$${value}`;
            },
          },
          grid: { color: 'rgba(148, 163, 184, 0.12)' },
          border: { display: false },
        },
      },
    },
  });
}

function renderPaymentMethodChart(dataset) {
  if (!paymentMethodChart || !window.Chart) {
    return;
  }

  const palette = ['#00D8FF', '#10B981', '#F97316', '#64748B', '#FFFFFF'];
  const labels = dataset.map((item) => formatReportMethod(item.method));
  const data = dataset.map((item) => Number(item.total || 0));

  paymentMethodChartInstance = new window.Chart(paymentMethodChart, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, index) => palette[index % palette.length]),
        borderColor: '#111827',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          borderColor: 'rgba(0, 216, 255, 0.24)',
          borderWidth: 1,
          titleColor: '#FFFFFF',
          bodyColor: '#E2E8F0',
          callbacks: {
            label(context) {
              return ` ${formatMoney(context.raw)}`;
            },
          },
        },
      },
    },
  });

  if (reportMethodLegend) {
    reportMethodLegend.innerHTML = dataset.length
      ? dataset
          .map((item, index) => `
            <div class="report-legend-item">
              <span class="report-legend-dot" style="background:${palette[index % palette.length]}"></span>
              <span class="report-legend-label">${formatReportMethod(item.method)}</span>
              <strong class="report-legend-value">${formatMoney(item.total)}</strong>
            </div>
          `)
          .join('')
      : '<p class="report-meta">Sin metodos de pago para este periodo.</p>';
  }
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
  const amount = Number(rate).toFixed(2);
  const amountMarkup = shortDate
    ? `<span class="rate-status-amount" title="Actualizada el ${shortDate}">${amount}</span>`
    : `<span class="rate-status-amount">${amount}</span>`;

  return [
    '<span class="rate-lock-icon is-closed" aria-hidden="true"><span class="rate-lock-shackle"></span><span class="rate-lock-body"></span><span class="rate-lock-pulse"></span></span>',
    `<span class="rate-status-copy"><span class="rate-status-code">${type}</span>${amountMarkup}</span>`,
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

function persistExchangeRateLock(type, isLocked, dayKey) {
  const storageKeys = EXCHANGE_RATE_LOCK_STORAGE_KEYS[type];

  if (!storageKeys) {
    return;
  }

  try {
    if (!isLocked || !dayKey || isRateExpired(dayKey)) {
      window.localStorage.removeItem(storageKeys.flag);
      window.localStorage.removeItem(storageKeys.date);
      return;
    }

    window.localStorage.setItem(storageKeys.flag, 'true');
    window.localStorage.setItem(storageKeys.date, dayKey);
  } catch {
    // Ignore storage cleanup errors.
  }
}

function readPersistedExchangeRateLock(type) {
  const storageKeys = EXCHANGE_RATE_LOCK_STORAGE_KEYS[type];

  if (!storageKeys) {
    return {
      isLockedToday: false,
      dayKey: null,
    };
  }

  try {
    const isLocked = window.localStorage.getItem(storageKeys.flag) === 'true';
    const dayKey = window.localStorage.getItem(storageKeys.date);

    if (!isLocked || !dayKey || isRateExpired(dayKey)) {
      persistExchangeRateLock(type, false, null);
      return {
        isLockedToday: false,
        dayKey: null,
      };
    }

    return {
      isLockedToday: true,
      dayKey,
    };
  } catch {
    return {
      isLockedToday: false,
      dayKey: null,
    };
  }
}

function hydratePersistedExchangeRates() {
  const persistedBcvRate = readPersistedExchangeRate('bcv');
  const persistedPesoRate = readPersistedExchangeRate('pesos');
  const persistedBcvLock = readPersistedExchangeRateLock('bcv');
  const persistedPesoLock = readPersistedExchangeRateLock('pesos');

  if (persistedBcvRate) {
    applyBcvRateState({
      rate: persistedBcvRate.rate,
      canEdit: !persistedBcvLock.isLockedToday,
      dayKey: persistedBcvLock.dayKey || persistedBcvRate.dayKey,
    });
  }

  if (persistedPesoRate) {
    applyPesosRateState({
      rate: persistedPesoRate.rate,
      canEdit: !persistedPesoLock.isLockedToday,
      dayKey: persistedPesoLock.dayKey || persistedPesoRate.dayKey,
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

  persistExchangeRateLock(type, false, null);
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
  const normalizedStatus = String(order.status || '').trim().toLowerCase();
  const estadoVisible = normalizedStatus === 'pagado'
    ? 'pagado'
    : normalizedStatus === 'en cocina'
      ? 'en_cocina'
      : normalizedStatus || 'en_cocina'

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

function syncCajaOrders(orders) {
  currentPedidos = Array.isArray(orders) ? orders : [];
  const payableTables = currentPedidos.filter((order) => CAJA_VISIBLE_STATUSES.includes(order.estado));

  renderMesaPagoOptions(payableTables);
  renderPedidos(currentPedidos);
  markPedidosSynced();
}

function upsertPedidoFromGlobal(payload) {
  const normalizedPedido = normalizePedido(payload || {});

  if (!normalizedPedido._id || !normalizedPedido.mesa) {
    return;
  }

  currentPedidos = [
    normalizedPedido,
    ...currentPedidos.filter((pedido) => pedido._id !== normalizedPedido._id),
  ];

  const payableTables = currentPedidos.filter((order) => CAJA_VISIBLE_STATUSES.includes(order.estado));
  renderMesaPagoOptions(payableTables);
  renderPedidos(currentPedidos);
  markPedidosSynced();
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
  return Boolean(table.mesa) && CAJA_VISIBLE_STATUSES.includes(estado) && Number(table.restante || 0) > 0;
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

function getPaymentValidationState() {
  const selectedTable = getSelectedPaymentTable();
  const pendingAmount = Math.max(0, Number(selectedTable?.restante || 0));
  const rawValue = paymentAmountDraft;
  const selectedCurrency = String(monedaPagoSelect?.value || 'USD').toUpperCase();
  const enteredAmountUsd = rawValue === '' ? NaN : getEnteredAmountInUsd(rawValue);
  const normalizedEnteredUsd = Number.isFinite(enteredAmountUsd) ? Number(enteredAmountUsd.toFixed(2)) : NaN;
  const missingRateForCurrency =
    (selectedCurrency === 'BS' && rawValue !== '' && (!Number.isFinite(currentDailyBcvRate) || currentDailyBcvRate <= 0)) ||
    ((selectedCurrency === 'COP' || selectedCurrency === 'PESOS') && rawValue !== '' && (!Number.isFinite(currentDailyPesoRate) || currentDailyPesoRate <= 0));
  const isAmountMissing = rawValue === '';
  const isAmountInvalid = !isAmountMissing && (!Number.isFinite(normalizedEnteredUsd) || normalizedEnteredUsd <= 0);
  const exceedsPending = Boolean(selectedTable) && !isAmountMissing && Number.isFinite(normalizedEnteredUsd) && normalizedEnteredUsd > pendingAmount;

  return {
    selectedTable,
    pendingAmount,
    rawValue,
    selectedCurrency,
    enteredAmountUsd: normalizedEnteredUsd,
    missingRateForCurrency,
    isAmountMissing,
    isAmountInvalid,
    exceedsPending,
  };
}

function syncPaymentFormState() {
  const paymentState = getPaymentValidationState();
  const { selectedTable, pendingAmount, rawValue, selectedCurrency, missingRateForCurrency, isAmountInvalid, exceedsPending } = paymentState;
  const selectedMesa = selectedTable?.mesa || mesaPagoSelect?.value?.trim() || '';
  const selectedMesaLabel = formatMesaSelectionLabel(selectedMesa);

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

    if (missingRateForCurrency) {
      montoRecibidoInput.setCustomValidity(selectedCurrency === 'BS'
        ? 'Debes fijar la tasa BCV del dia para cobrar en Bs.'
        : 'Debes fijar la tasa COP del dia para cobrar en COP.');
    } else if (isAmountInvalid) {
      montoRecibidoInput.setCustomValidity('Ingresa un monto valido mayor a cero.');
    } else if (exceedsPending) {
      montoRecibidoInput.setCustomValidity('El monto excede el saldo pendiente');
    } else {
      montoRecibidoInput.setCustomValidity('');
    }
  }

  if (paymentWarning) {
    if (missingRateForCurrency) {
      paymentWarning.textContent = selectedCurrency === 'BS'
        ? 'Debes fijar la tasa BCV del dia para cobrar en Bs.'
        : 'Debes fijar la tasa COP del dia para cobrar en COP.';
      paymentWarning.classList.remove('hidden');
    } else if (isAmountInvalid) {
      paymentWarning.textContent = 'Ingresa un monto valido mayor a cero.';
      paymentWarning.classList.remove('hidden');
    } else if (exceedsPending) {
      paymentWarning.textContent = 'El monto excede el saldo pendiente';
      paymentWarning.classList.remove('hidden');
    } else {
      paymentWarning.classList.add('hidden');
    }
  }

  if (paymentSubmitButton) {
    paymentSubmitButton.disabled = !selectedTable || pendingAmount <= 0 || rawValue === '' || isAmountInvalid || exceedsPending || missingRateForCurrency;
  }
}

function handleTableSelect(mesaId) {
  if (!mesaPagoSelect) {
    return;
  }

  const normalizedMesaId = String(mesaId || '').trim();
  if (!normalizedMesaId) {
    mesaPagoSelect.value = '';
    paymentAmountDraft = '';
    syncPaymentFormState();
    return;
  }

  if (!activePaymentTables.some((table) => table.mesa === normalizedMesaId)) {
    return;
  }

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
    tasaBcvInput.readOnly = !canEdit;
    if (Number.isFinite(currentDailyBcvRate)) {
      tasaBcvInput.value = currentDailyBcvRate.toFixed(2);
    } else if (canEdit) {
      tasaBcvInput.value = '';
    }
  }

  if (guardarTasaBcvButton) {
    guardarTasaBcvButton.disabled = !canEdit;
    guardarTasaBcvButton.hidden = !canEdit;
    guardarTasaBcvButton.textContent = 'Guardar';
  }

  persistExchangeRate('bcv', currentDailyBcvRate, currentBcvDayKey);
  persistExchangeRateLock('bcv', isBcvLocked, currentBcvDayKey);
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
    tasaPesosInput.readOnly = !canEdit;
    if (Number.isFinite(currentDailyPesoRate)) {
      tasaPesosInput.value = currentDailyPesoRate.toFixed(2);
    } else if (canEdit) {
      tasaPesosInput.value = '';
    }
  }

  if (guardarTasaPesosButton) {
    guardarTasaPesosButton.disabled = !canEdit;
    guardarTasaPesosButton.hidden = !canEdit;
    guardarTasaPesosButton.textContent = 'Guardar';
  }

  persistExchangeRate('pesos', currentDailyPesoRate, currentPesoDayKey);
  persistExchangeRateLock('pesos', isPesoLocked, currentPesoDayKey);
  refreshPesosStatusLabel();

  if (!canEditPesoRate && Number.isFinite(currentDailyPesoRate) && animateLock) {
    triggerRateLockPulse(tasaPesosStatus);
  }
}

async function loadBcvRate() {
  const data = await requestCentral('/api/exchange-rate/today?type=bcv');
  const persistedRate = readPersistedExchangeRate('bcv');
  const persistedLock = readPersistedExchangeRateLock('bcv');
  const resolvedRate = Number.isFinite(Number(data.rate)) ? Number(data.rate) : persistedRate?.rate;
  const resolvedDayKey = data.dayKey || persistedLock.dayKey || persistedRate?.dayKey || getCurrentExchangeDayKey();
  const shouldHonorLocalLock = persistedLock.isLockedToday && Number.isFinite(resolvedRate) && resolvedRate > 0;

  applyBcvRateState({
    rate: resolvedRate,
    canEdit: Boolean(data.canEdit) && !shouldHonorLocalLock,
    dayKey: resolvedDayKey,
  });

  if (latestReportPayload && isAnalyticsVisible()) {
    renderReporte(latestReportPayload);
  }

  syncPaymentFormState();
}

async function loadPesosRate() {
  const data = await requestCentral('/api/exchange-rate/today?type=pesos');
  const persistedRate = readPersistedExchangeRate('pesos');
  const persistedLock = readPersistedExchangeRateLock('pesos');
  const resolvedRate = Number.isFinite(Number(data.rate)) ? Number(data.rate) : persistedRate?.rate;
  const resolvedDayKey = data.dayKey || persistedLock.dayKey || persistedRate?.dayKey || getCurrentExchangeDayKey();
  const shouldHonorLocalLock = persistedLock.isLockedToday && Number.isFinite(resolvedRate) && resolvedRate > 0;

  applyPesosRateState({
    rate: resolvedRate,
    canEdit: Boolean(data.canEdit) && !shouldHonorLocalLock,
    dayKey: resolvedDayKey,
  });

  if (latestReportPayload && isAnalyticsVisible()) {
    renderReporte(latestReportPayload);
  }

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
  if (status === 'entregado') {
    return {
      cardClass: 'status-entregado',
      badgeClass: 'delivered',
      label: 'ENTREGADO',
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
    cardClass: 'status-en-cocina',
    badgeClass: 'kitchen',
    label: 'EN COCINA',
  };
}

function renderPedidos(items) {
  const visibleItems = items.filter((pedido) => CAJA_VISIBLE_STATUSES.includes(pedido.estado));

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
        ${CAJA_VISIBLE_STATUSES.includes(pedido.estado) ? `<button data-action="seleccionar-mesa" data-mesa="${pedido.mesa}">Seleccionar</button>` : ''}
      </div>
    `;

    pedidosList.appendChild(div);
  });
}

function renderReportSummary(summaryByDay, daySummary) {
  const totalRevenue = Number(daySummary?.totalRevenue || 0);
  const totalBcv = Number.isFinite(currentDailyBcvRate) && currentDailyBcvRate > 0
    ? formatBs(totalRevenue * currentDailyBcvRate)
    : 'BS --';
  const totalCop = Number.isFinite(currentDailyPesoRate) && currentDailyPesoRate > 0
    ? formatPesos(totalRevenue * currentDailyPesoRate)
    : 'COP --';

  if (reportTotal) {
    reportTotal.textContent = formatMoney(totalRevenue);
  }

  if (reportMeta) {
    reportMeta.textContent = `${daySummary?.transactionsCount || 0} ordenes registradas en ${daySummary?.reportDate || 'el periodo actual'}`;
  }

  if (reportTotalBs) {
    reportTotalBs.textContent = totalBcv;
  }

  if (reportTotalCop) {
    reportTotalCop.textContent = totalCop;
  }
}

function renderReporte(history) {
  latestReportPayload = history;
  const transactions = history?.transactions || [];
  const kpis = history?.kpis || {};
  const rangeLabel = history?.range?.label || 'Periodo actual';

  destroyReportCharts();
  renderReportSummary(history?.summaryByDay || [], {
    totalRevenue: kpis.totalRevenue || 0,
    transactionsCount: kpis.totalOrders || 0,
    reportDate: rangeLabel,
  });

  if (reportAvgTicket) {
    reportAvgTicket.textContent = formatMoney(kpis.averageTicket || 0);
  }

  if (reportVolumeValue) {
    reportVolumeValue.textContent = `${kpis.totalOrders || 0} ordenes`;
  }

  if (reportCleaningMeta) {
    reportCleaningMeta.textContent = `${kpis.cleaningPercentage || 0}% de mesas pasaron por limpieza`;
  }

  if (reportRangeMeta) {
    reportRangeMeta.textContent = `Mostrando: ${rangeLabel}`;
  }

  renderSalesByHourChart(history?.hourlySales || []);
  renderPaymentMethodChart(history?.paymentMethodBreakdown || []);

  reporteList.innerHTML = '';

  if (!transactions.length) {
    reporteList.innerHTML = '<tr><td colspan="5" class="report-empty-cell">No hay ventas para reportar en este periodo.</td></tr>';
    return;
  }

  reporteList.innerHTML = transactions
    .map((venta) => `
      <tr>
        <td class="report-table-id">${String(venta._id || '').slice(-8)}</td>
        <td>${venta.table}${venta.cliente_nombre ? `<span class="report-client-inline"> · ${venta.cliente_nombre}</span>` : ''}</td>
        <td class="report-table-money">${formatMoney(venta.paymentAmount)}</td>
        <td>${formatReportMethod(venta.paymentMethod)}</td>
        <td class="report-table-time">${formatReportHour(venta.hora_pago)}</td>
      </tr>
    `)
    .join('');
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

    const payableTables = orders.filter((order) => CAJA_VISIBLE_STATUSES.includes(order.estado));
    void payableTables;
    syncCajaOrders(orders);
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

  if (!isAnalyticsVisible()) {
    return;
  }

  try {
    const data = await requestCentral(`/api/orders/history?range=${encodeURIComponent(currentReportRange)}`);
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
    if (!socketListenersBound) {
      // fall through and bind listeners exactly once
    } else {
      return socketInstance;
    }
  }

  if (!socketInstance) {
    socketInstance = await window.getRestoSocket(authToken);
  }

  if (socketListenersBound) {
    return socketInstance;
  }

  socketListenersBound = true;

  socketInstance.on('connect', () => {
    updateSystemStatusLabel(true);
    showLiveNotice('Caja conectada en tiempo real.', 'success');
  });

  socketInstance.on('disconnect', () => {
    updateSystemStatusLabel(false);
    showLiveNotice('Socket desconectado. Polling de respaldo activo.', 'default');
  });

  socketInstance.on('ACTUALIZACION_GLOBAL', async (payload) => {
    markRealtimeActivity(payload);
    upsertPedidoFromGlobal(payload);

    if (isAnalyticsVisible()) {
      await loadReporte({ silent: true });
    }

    showLiveNotice(`Pedido global recibido: ${payload?.table || payload?.mesa || 'mesa actualizada'}`);
  });

  socketInstance.on('PEDIDO_GLOBAL', async (payload) => {
    markRealtimeActivity(payload);
    upsertPedidoFromGlobal(payload);

    if (isAnalyticsVisible()) {
      await loadReporte({ silent: true });
    }

    showLiveNotice(`Pedido global recibido: ${payload?.table || payload?.mesa || 'mesa actualizada'}`);
  });

  socketInstance.on('orden_actualizada', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
    if (isAnalyticsVisible()) {
      await loadReporte({ silent: true });
    }

    if (payload?.status === 'entregado') {
      showLiveNotice(`Pedido entregado: ${payload?.table || 'actualizacion recibida'}`);
      return;
    }

    showLiveNotice(`Caja sincronizada: ${payload?.table || 'pedido actualizado'}`);
  });

  socketInstance.on('pedido_entregado', async (payload) => {
    markRealtimeActivity(payload);
    await loadPedidos({ silent: true });
    showLiveNotice(`Pedido listo para cobro: ${payload?.table || 'actualizacion recibida'}`);
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
    const paymentState = getPaymentValidationState();
    const { pendingAmount, enteredAmountUsd: montoRecibido, isAmountInvalid, exceedsPending, missingRateForCurrency } = paymentState;

    if (!mesa) {
      throw new Error('Debes usar el boton Seleccionar en la tarjeta del pedido para cobrar.');
    }

    if (missingRateForCurrency) {
      throw new Error('Debes fijar la tasa del dia antes de cobrar en esa moneda.');
    }

    if (isAmountInvalid || !Number.isFinite(montoRecibido) || montoRecibido <= 0) {
      throw new Error('Monto recibido invalido para la moneda seleccionada.');
    }

    if (exceedsPending || montoRecibido > pendingAmount) {
      throw new Error('El monto excede el saldo pendiente');
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
    if (isAnalyticsVisible()) {
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
reportRangeFilter?.addEventListener('click', async (event) => {
  const trigger = event.target.closest('[data-range]');

  if (!trigger) {
    return;
  }

  const nextRange = String(trigger.dataset.range || 'today');

  if (nextRange === currentReportRange) {
    return;
  }

  currentReportRange = nextRange;

  reportRangeFilter.querySelectorAll('[data-range]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.range === currentReportRange);
  });

  await loadReporte();
});
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

openReporteBtn.addEventListener('click', async () => {
  mostrarAnalitica = !mostrarAnalitica;
  syncAnalyticsVisibility();

  if (mostrarAnalitica) {
    await loadReporte();
  }
});

logoutButton?.addEventListener('click', () => {
  cleanupRealtimeResources();
  clearCajaSession();
  window.location.reload();
});

window.addEventListener('beforeunload', cleanupRealtimeResources);
window.addEventListener('pagehide', cleanupRealtimeResources);

(async function init() {
  syncAnalyticsVisibility();
  await ensureCajaLogin();
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
