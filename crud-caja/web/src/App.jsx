import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'

import { API_BASE_URL } from './config'
import { restoSocket } from './socket'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, DoughnutController, Tooltip, Legend)

const DASHBOARD_TIMEZONE = 'America/Caracas'
const CAJA_PAYABLE_STATUSES = ['en_cocina', 'entregado']
const PAYMENT_METHOD_OPTIONS = ['efectivo', 'tarjeta', 'transferencia', 'binance']
const REPORT_RANGE_OPTIONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last7days', label: 'Ultimos 7 dias' },
]

function requestJson(url, options = {}) {
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(payload.message || 'Error en la solicitud')
    }

    return payload
  })
}

function requestCentral(path, options = {}) {
  return requestJson(`${API_BASE_URL}${path}`, options)
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`
}

function formatBs(amount) {
  return `BS ${Number(amount || 0).toFixed(2)}`
}

function formatPesos(amount) {
  return `COP ${Number(amount || 0).toFixed(2)}`
}

function formatReportMethod(method) {
  const normalized = String(method || '').trim().toLowerCase()

  if (normalized === 'tarjeta' || normalized === 'punto') {
    return 'Punto'
  }

  if (normalized === 'transferencia') {
    return 'Transferencia'
  }

  if (normalized === 'efectivo') {
    return 'Efectivo'
  }

  if (normalized === 'binance') {
    return 'Binance'
  }

  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Otro'
}

function formatReportHour(dateValue) {
  if (!dateValue) {
    return '--'
  }

  return new Intl.DateTimeFormat('es-VE', {
    timeZone: DASHBOARD_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateValue))
}

function formatMesaSelectionLabel(mesa) {
  const rawMesa = String(mesa || '').trim()

  if (!rawMesa) {
    return '--'
  }

  const numberMatch = rawMesa.match(/(\d+)/)

  if (!numberMatch) {
    return rawMesa
  }

  return numberMatch[1].padStart(2, '0')
}

function parseDecimalInput(value) {
  const normalized = String(value ?? '').replace(',', '.').trim()
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function normalizePedido(order) {
  const normalizedStatus = String(order.status || '').trim().toLowerCase()
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
      cantidad: Number(item.cantidad || 1),
      nombre: item.name,
      precioUnitario: Number(item.price || 0),
      nota: item.note || 'Sin notas',
    })),
  }
}

function getPedidoStatusMeta(status) {
  if (status === 'limpieza') {
    return {
      cardClass: 'status-pagado',
      badgeClass: 'ok',
      label: 'LIMPIEZA',
    }
  }

  if (status === 'entregado') {
    return {
      cardClass: 'status-entregado',
      badgeClass: 'delivered',
      label: 'ENTREGADO',
    }
  }

  if (status === 'pagado') {
    return {
      cardClass: 'status-pagado',
      badgeClass: 'ok',
      label: 'PAGADO',
    }
  }

  return {
    cardClass: 'status-en-cocina',
    badgeClass: 'kitchen',
    label: 'EN COCINA',
  }
}

function buildNotice(message, variant = 'success') {
  return { id: `${Date.now()}-${Math.random()}`, message, variant }
}

function getEnteredAmountInUsd(rawValue, currency, dailyBcvRate, dailyPesoRate) {
  const parsedAmount = parseDecimalInput(rawValue)
  const selectedCurrency = String(currency || 'USD').toUpperCase()

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return Number.NaN
  }

  if (selectedCurrency === 'USD') {
    return parsedAmount
  }

  if (selectedCurrency === 'BS') {
    if (!Number.isFinite(dailyBcvRate) || dailyBcvRate <= 0) {
      return Number.NaN
    }

    return parsedAmount / dailyBcvRate
  }

  if (selectedCurrency === 'COP' || selectedCurrency === 'PESOS') {
    if (!Number.isFinite(dailyPesoRate) || dailyPesoRate <= 0) {
      return Number.NaN
    }

    return parsedAmount / dailyPesoRate
  }

  return Number.NaN
}

export default function App() {
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [socketConnected, setSocketConnected] = useState(restoSocket.connected)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState(null)
  const [selectedMesa, setSelectedMesa] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [estadoPago, setEstadoPago] = useState('completado')
  const [montoRecibido, setMontoRecibido] = useState('')
  const [monedaPago, setMonedaPago] = useState('USD')
  const [dailyBcvRate, setDailyBcvRate] = useState(null)
  const [dailyPesoRate, setDailyPesoRate] = useState(null)
  const [canEditBcvRate, setCanEditBcvRate] = useState(true)
  const [canEditPesoRate, setCanEditPesoRate] = useState(true)
  const [bcvDraft, setBcvDraft] = useState('')
  const [pesoDraft, setPesoDraft] = useState('')
  const [mostrarReportes, setMostrarReportes] = useState(false)
  const [reportRange, setReportRange] = useState('today')
  const [reportData, setReportData] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [lastPedidosSyncAt, setLastPedidosSyncAt] = useState(null)
  const [lastRealtimeOrderAt, setLastRealtimeOrderAt] = useState(null)
  const [lastRealtimeOrderLabel, setLastRealtimeOrderLabel] = useState('')
  const [currentDateTime, setCurrentDateTime] = useState('--')
  const noticeTimerRef = useRef(null)
  const pollingTimerRef = useRef(null)
  const reportVisibilityRef = useRef(mostrarReportes)
  const reportRangeRef = useRef(reportRange)

  const payableOrders = useMemo(
    () => orders.filter((pedido) => CAJA_PAYABLE_STATUSES.includes(pedido.estado)),
    [orders],
  )

  const monitorOrders = useMemo(
    () => orders.filter((pedido) => CAJA_PAYABLE_STATUSES.includes(pedido.estado)),
    [orders],
  )

  const selectedTable = useMemo(
    () => payableOrders.find((table) => table.mesa === selectedMesa) || null,
    [selectedMesa, payableOrders],
  )

  const pendingAmount = useMemo(
    () => Math.max(0, Number(selectedTable?.restante || 0)),
    [selectedTable],
  )

  const enteredAmountUsd = useMemo(
    () => getEnteredAmountInUsd(montoRecibido, monedaPago, dailyBcvRate, dailyPesoRate),
    [montoRecibido, monedaPago, dailyBcvRate, dailyPesoRate],
  )

  const missingRateForCurrency = useMemo(() => {
    if (!montoRecibido) {
      return false
    }

    if (monedaPago === 'BS') {
      return !Number.isFinite(dailyBcvRate) || dailyBcvRate <= 0
    }

    if (monedaPago === 'COP') {
      return !Number.isFinite(dailyPesoRate) || dailyPesoRate <= 0
    }

    return false
  }, [montoRecibido, monedaPago, dailyBcvRate, dailyPesoRate])

  const isAmountInvalid = useMemo(
    () => montoRecibido !== '' && (!Number.isFinite(enteredAmountUsd) || enteredAmountUsd <= 0),
    [enteredAmountUsd, montoRecibido],
  )

  const exceedsPending = useMemo(
    () => Boolean(selectedTable) && montoRecibido !== '' && Number.isFinite(enteredAmountUsd) && enteredAmountUsd > pendingAmount,
    [enteredAmountUsd, montoRecibido, pendingAmount, selectedTable],
  )

  const paymentDisabled = !selectedTable || pendingAmount <= 0 || !montoRecibido || isAmountInvalid || exceedsPending || missingRateForCurrency

  const lastUpdatedLabel = useMemo(() => {
    if (!lastPedidosSyncAt) {
      return 'Sincronizando pedidos...'
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastPedidosSyncAt) / 1000))
    return `Sync ${elapsedSeconds}s`
  }, [lastPedidosSyncAt, currentDateTime])

  const lastOrderReceivedLabel = useMemo(() => {
    if (!lastRealtimeOrderAt) {
      return 'Ultimo pedido: esperando'
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastRealtimeOrderAt) / 1000))
    const elapsedLabel = elapsedSeconds < 60 ? `${elapsedSeconds}s` : `${Math.floor(elapsedSeconds / 60)}m`
    return `Ultimo pedido: ${elapsedLabel}${lastRealtimeOrderLabel ? ` | ${lastRealtimeOrderLabel}` : ''}`
  }, [currentDateTime, lastRealtimeOrderAt, lastRealtimeOrderLabel])

  const systemHost = useMemo(() => {
    try {
      return new URL(API_BASE_URL).hostname || '--'
    } catch {
      return '--'
    }
  }, [])

  const reportSummary = reportData?.kpis || {}
  const reportRangeLabel = reportData?.range?.label || 'Periodo actual'

  const hourlyChartData = useMemo(() => ({
    labels: (reportData?.hourlySales || []).map((item) => item.hour),
    datasets: [
      {
        label: 'Ventas USD',
        data: (reportData?.hourlySales || []).map((item) => Number(item.total || 0)),
        backgroundColor: '#00D8FF',
        borderRadius: 12,
        maxBarThickness: 28,
      },
    ],
  }), [reportData])

  const paymentBreakdown = reportData?.paymentMethodBreakdown || []
  const doughnutPalette = ['#00D8FF', '#10B981', '#F97316', '#64748B', '#FFFFFF']
  const doughnutData = useMemo(() => ({
    labels: paymentBreakdown.map((item) => formatReportMethod(item.method)),
    datasets: [
      {
        data: paymentBreakdown.map((item) => Number(item.total || 0)),
        backgroundColor: paymentBreakdown.map((_, index) => doughnutPalette[index % doughnutPalette.length]),
        borderColor: '#111827',
        borderWidth: 3,
      },
    ],
  }), [paymentBreakdown])

  const showNotice = (message, variant = 'success') => {
    setNotice(buildNotice(message, variant))
  }

  useEffect(() => {
    reportVisibilityRef.current = mostrarReportes
  }, [mostrarReportes])

  useEffect(() => {
    if (!selectedMesa) {
      return
    }

    if (!payableOrders.some((pedido) => pedido.mesa === selectedMesa)) {
      setSelectedMesa('')
    }
  }, [payableOrders, selectedMesa])

  useEffect(() => {
    reportRangeRef.current = reportRange
  }, [reportRange])

  useEffect(() => {
    if (!notice) {
      return undefined
    }

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current)
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimerRef.current = null
    }, 3200)

    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current)
      }
    }
  }, [notice])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = new Date()
      const formattedTime = new Intl.DateTimeFormat('es-VE', {
        timeZone: DASHBOARD_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(now)
      const formattedDate = new Intl.DateTimeFormat('es-VE', {
        timeZone: DASHBOARD_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
      }).format(now)
      setCurrentDateTime(`${formattedTime} | ${formattedDate}`)
    }, 1000)

    return () => window.clearInterval(intervalId)
  }, [])

  const fetchRates = async () => {
    const [bcvData, pesoData] = await Promise.all([
      requestCentral('/api/exchange-rate/today?type=bcv'),
      requestCentral('/api/exchange-rate/today?type=pesos'),
    ])

    const parsedBcvRate = Number(bcvData.rate)
    const parsedPesoRate = Number(pesoData.rate)

    setDailyBcvRate(Number.isFinite(parsedBcvRate) && parsedBcvRate > 0 ? parsedBcvRate : null)
    setDailyPesoRate(Number.isFinite(parsedPesoRate) && parsedPesoRate > 0 ? parsedPesoRate : null)
    setCanEditBcvRate(Boolean(bcvData.canEdit))
    setCanEditPesoRate(Boolean(pesoData.canEdit))
    setBcvDraft(Number.isFinite(parsedBcvRate) && parsedBcvRate > 0 ? parsedBcvRate.toFixed(2) : '')
    setPesoDraft(Number.isFinite(parsedPesoRate) && parsedPesoRate > 0 ? parsedPesoRate.toFixed(2) : '')
  }

  const fetchOrders = async (silent = false) => {
    try {
      if (!silent) {
        setLoadingOrders(true)
      }

      const data = await requestCentral('/api/tables/status')
      const occupiedTables = (data.tables || []).filter((table) => table.occupied && table.orderId)
      const nextOrders = await Promise.all(
        occupiedTables.map(async (table) => {
          const orderResponse = await requestCentral(`/api/orders/${table.orderId}`)
          return normalizePedido({
            ...orderResponse.order,
            cliente_nombre: table.cliente_nombre || orderResponse.order?.cliente_nombre,
          })
        }),
      )

      setOrders(nextOrders)
      setLastPedidosSyncAt(Date.now())
      setErrorMessage('')

      if (selectedMesa && !nextOrders.some((pedido) => CAJA_PAYABLE_STATUSES.includes(pedido.estado) && pedido.mesa === selectedMesa)) {
        setSelectedMesa('')
      }
    } catch (error) {
      setErrorMessage(error.message || 'No se pudieron cargar los pedidos de caja.')
    } finally {
      if (!silent) {
        setLoadingOrders(false)
      }
    }
  }

  const fetchReport = async (silent = false, range = reportRangeRef.current, allowWhenHidden = false) => {
    if (!allowWhenHidden && !reportVisibilityRef.current) {
      return
    }

    try {
      if (!silent) {
        setLoadingReport(true)
      }

      const data = await requestCentral(`/api/orders/history?range=${encodeURIComponent(range)}`)
      setReportData(data)
    } catch (error) {
      if (!silent) {
        setErrorMessage(error.message || 'No se pudo cargar la analitica.')
      }
    } finally {
      if (!silent) {
        setLoadingReport(false)
      }
    }
  }

  useEffect(() => {
    void Promise.all([fetchRates(), fetchOrders(false)])
  }, [])

  useEffect(() => {
    if (!mostrarReportes) {
      return undefined
    }

    void fetchReport(false)
    return undefined
  }, [mostrarReportes, reportRange])

  useEffect(() => {
    pollingTimerRef.current = window.setInterval(() => {
      void fetchOrders(true)
    }, 10000)

    return () => {
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current)
      }
    }
  }, [selectedMesa])

  useEffect(() => {
    const handleConnect = () => {
      setSocketConnected(true)
      showNotice('Caja conectada en tiempo real.', 'success')
    }

    const handleDisconnect = () => {
      setSocketConnected(false)
      showNotice('Socket desconectado. Polling de respaldo activo.', 'default')
    }

    const handleGlobalUpdate = async (payload) => {
      const normalizedPedido = normalizePedido(payload || {})

      if (normalizedPedido._id && normalizedPedido.mesa) {
        setOrders((prev) => [normalizedPedido, ...prev.filter((pedido) => pedido._id !== normalizedPedido._id)])
      }

      setLastRealtimeOrderAt(Date.now())
      setLastRealtimeOrderLabel(payload?.table || payload?.mesa || '')
      setLastPedidosSyncAt(Date.now())

      if (reportVisibilityRef.current) {
        await fetchReport(true, reportRangeRef.current)
      }

      showNotice(`Pedido global recibido: ${payload?.table || payload?.mesa || 'mesa actualizada'}`)
    }

    const handleOrderSync = async (payload) => {
      setLastRealtimeOrderAt(Date.now())
      setLastRealtimeOrderLabel(payload?.table || payload?.mesa || '')
      await fetchOrders(true)

      if (reportVisibilityRef.current) {
        await fetchReport(true, reportRangeRef.current)
      }
    }

    const handleRateUpdated = async () => {
      await fetchRates()
    }

    restoSocket.on('connect', handleConnect)
    restoSocket.on('disconnect', handleDisconnect)
    restoSocket.on('ACTUALIZACION_GLOBAL', handleGlobalUpdate)
    restoSocket.on('PEDIDO_GLOBAL', handleGlobalUpdate)
    restoSocket.on('CAMBIO_ESTADO_MESA', handleOrderSync)
    restoSocket.on('orden_actualizada', handleOrderSync)
    restoSocket.on('pedido_entregado', handleOrderSync)
    restoSocket.on('mesa_liberada', handleOrderSync)
    restoSocket.on('mesa_ocupada', handleOrderSync)
    restoSocket.on('mesa_actualizada', handleOrderSync)
    restoSocket.on('tasa_actualizada', handleRateUpdated)

    if (!restoSocket.connected) {
      restoSocket.connect()
    }

    return () => {
      restoSocket.off('connect', handleConnect)
      restoSocket.off('disconnect', handleDisconnect)
      restoSocket.off('ACTUALIZACION_GLOBAL', handleGlobalUpdate)
      restoSocket.off('PEDIDO_GLOBAL', handleGlobalUpdate)
      restoSocket.off('CAMBIO_ESTADO_MESA', handleOrderSync)
      restoSocket.off('orden_actualizada', handleOrderSync)
      restoSocket.off('pedido_entregado', handleOrderSync)
      restoSocket.off('mesa_liberada', handleOrderSync)
      restoSocket.off('mesa_ocupada', handleOrderSync)
      restoSocket.off('mesa_actualizada', handleOrderSync)
      restoSocket.off('tasa_actualizada', handleRateUpdated)
    }
  }, [])

  const saveRate = async (type) => {
    const draftValue = type === 'bcv' ? bcvDraft : pesoDraft
    const parsedRate = parseDecimalInput(draftValue)

    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setErrorMessage(`Ingresa una tasa ${type === 'bcv' ? 'BCV' : 'COP'} valida mayor a cero.`)
      return
    }

    await requestCentral(`/api/exchange-rate/today?type=${type === 'bcv' ? 'bcv' : 'pesos'}`, {
      method: 'PUT',
      headers: {
        'x-resto-module': 'caja-react',
      },
      body: JSON.stringify({ rate: parsedRate }),
    })

    await fetchRates()
    showNotice(`Tasa ${type === 'bcv' ? 'BCV' : 'COP'} fijada en ${parsedRate.toFixed(2)} para hoy.`)
  }

  const handlePayOrder = async (event) => {
    event.preventDefault()

    if (!selectedMesa) {
      setErrorMessage('Debes seleccionar una mesa ocupada para cobrar.')
      return
    }

    if (missingRateForCurrency || isAmountInvalid || exceedsPending || paymentDisabled) {
      setErrorMessage('Revisa el monto y la moneda seleccionada antes de registrar el pago.')
      return
    }

    try {
      const orderLookup = await requestCentral(`/api/orders/active/table/${encodeURIComponent(selectedMesa)}`)
      await requestCentral(`/api/orders/${orderLookup.order._id}/pay`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: orderLookup.order.items || [],
          metodo: metodoPago,
          estado: estadoPago,
          montoRecibido: Number(enteredAmountUsd.toFixed(2)),
        }),
      })

      setMontoRecibido('')
      setSelectedMesa('')
      showNotice(`Pago registrado para ${selectedMesa}.`)
      await fetchOrders(false)
      if (reportVisibilityRef.current) {
        await fetchReport(true, reportRangeRef.current)
      }
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo registrar el pago.')
    }
  }

  const toggleReportes = () => {
    setMostrarReportes((prev) => !prev)
  }

  const paymentWarning = missingRateForCurrency
    ? monedaPago === 'BS'
      ? 'Debes fijar la tasa BCV del dia para cobrar en Bs.'
      : 'Debes fijar la tasa COP del dia para cobrar en COP.'
    : isAmountInvalid
      ? 'Ingresa un monto valido mayor a cero.'
      : exceedsPending
        ? 'El monto excede el saldo pendiente.'
        : ''

  return (
    <main className="layout">
      <header className="hero">
        <div className="hero-head">
          <div className="hero-identity">
            <p className="eyebrow">Caja</p>
            <h1>Panel de cobros</h1>
            <p className="subtitle">Control en tiempo real para pagos, limpieza y trazabilidad de mesas.</p>
          </div>

          <section className="hero-rates" aria-label="Tasas del dia">
            <div className="rate-compact-wrap rate-compact-wrap--pill">
              <div className={`rate-compact-row rate-compact-row--pill rate-view ${canEditBcvRate ? 'is-visible' : 'is-hidden'}`}>
                <span className="rate-inline-label">BCV</span>
                <input
                  type="text"
                  className="rate-input-compact"
                  inputMode="decimal"
                  value={bcvDraft}
                  disabled={!canEditBcvRate}
                  onChange={(event) => setBcvDraft(event.target.value)}
                />
                <button type="button" className="secondary rate-button-compact" disabled={!canEditBcvRate} onClick={() => void saveRate('bcv')}>
                  Guardar
                </button>
              </div>
              {!canEditBcvRate && Number.isFinite(dailyBcvRate) ? (
                <p className="rate-status-line rate-status-line--pill is-visible">
                  <span className="rate-lock-icon is-closed" aria-hidden="true">
                    <span className="rate-lock-shackle"></span>
                    <span className="rate-lock-body"></span>
                    <span className="rate-lock-pulse"></span>
                  </span>
                  <span className="rate-status-copy">
                    <span className="rate-status-code">BCV</span>
                    <span className="rate-status-amount">{dailyBcvRate.toFixed(2)}</span>
                  </span>
                </p>
              ) : null}
            </div>

            <div className="rate-compact-wrap rate-compact-wrap--pill">
              <div className={`rate-compact-row rate-compact-row--pill rate-view ${canEditPesoRate ? 'is-visible' : 'is-hidden'}`}>
                <span className="rate-inline-label">COP</span>
                <input
                  type="text"
                  className="rate-input-compact"
                  inputMode="decimal"
                  value={pesoDraft}
                  disabled={!canEditPesoRate}
                  onChange={(event) => setPesoDraft(event.target.value)}
                />
                <button type="button" className="secondary rate-button-compact" disabled={!canEditPesoRate} onClick={() => void saveRate('pesos')}>
                  Guardar
                </button>
              </div>
              {!canEditPesoRate && Number.isFinite(dailyPesoRate) ? (
                <p className="rate-status-line rate-status-line--pill is-visible">
                  <span className="rate-lock-icon is-closed" aria-hidden="true">
                    <span className="rate-lock-shackle"></span>
                    <span className="rate-lock-body"></span>
                    <span className="rate-lock-pulse"></span>
                  </span>
                  <span className="rate-status-copy">
                    <span className="rate-status-code">COP</span>
                    <span className="rate-status-amount">{dailyPesoRate.toFixed(2)}</span>
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          <div className="sync-cluster sync-cluster--header">
            <div className="sync-pill sync-pill--header">
              <span className="sync-dot"></span>
              <span className="status-primary">{socketConnected ? 'Sistema en linea' : 'Reconectando'}</span>
              <span className="system-host status-accent">{systemHost}</span>
            </div>
            <p className="sync-secondary sync-secondary--header sync-secondary--time">{currentDateTime}</p>
            <p className="sync-secondary sync-secondary--header sync-secondary--order">{lastOrderReceivedLabel}</p>
            <p className={lastPedidosSyncAt ? '' : 'hidden'}>{lastUpdatedLabel}</p>
          </div>
        </div>

        {notice ? <p className={`live-notice ${notice.variant === 'success' ? 'success' : ''}`}>{notice.message}</p> : null}
      </header>

      <section className="operational-shell" aria-label="Bloque operativo de caja">
        <div className="dashboard-shell">
          <aside className="sidebar-column">
          <article className="card payment-card sticky-card">
            <div className="section-heading compact-heading">
              <div>
                <p className="section-kicker">Sidebar de cobro</p>
                <h2>Registrar Pago</h2>
              </div>
              <span className="mini-chip">Caja React</span>
            </div>

            <form className="stack compact-form" onSubmit={handlePayOrder}>
              <div className="form-two-columns">
                <label>
                  <span>Metodo</span>
                  <select value={metodoPago} onChange={(event) => setMetodoPago(event.target.value)}>
                    {PAYMENT_METHOD_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Estado</span>
                  <select value={estadoPago} onChange={(event) => setEstadoPago(event.target.value)}>
                    <option value="completado">completado</option>
                    <option value="fallido">fallido</option>
                  </select>
                </label>
              </div>

              <label>
                <span>Monto recibido</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={montoRecibido}
                  disabled={!selectedTable}
                  onChange={(event) => setMontoRecibido(event.target.value)}
                />
              </label>

              <label>
                <span>Moneda del monto</span>
                <select value={monedaPago} onChange={(event) => setMonedaPago(event.target.value)}>
                  <option value="USD">USD</option>
                  <option value="BS">Bs</option>
                  <option value="COP">COP</option>
                </select>
              </label>

              <p className="form-helper">Pendiente por cobrar: {formatMoney(pendingAmount)}</p>
              <p className="form-helper">Mesa seleccionada: {formatMesaSelectionLabel(selectedMesa)}</p>
              <p className="form-helper">Selecciona la mesa desde el boton de cada tarjeta en el monitor.</p>
              <p className="form-helper">
                Equivalente: {Number.isFinite(dailyBcvRate) && dailyBcvRate > 0 ? formatBs(pendingAmount * dailyBcvRate) : 'BS --'} | {Number.isFinite(dailyPesoRate) && dailyPesoRate > 0 ? formatPesos(pendingAmount * dailyPesoRate) : 'COP --'}
              </p>
              {paymentWarning ? <p className="form-warning">{paymentWarning}</p> : <p className="form-warning hidden">&nbsp;</p>}
              <button type="submit" disabled={paymentDisabled}>Registrar pago</button>
            </form>

            {errorMessage ? <p className="live-notice">{errorMessage}</p> : null}
          </article>
          </aside>

          <section className="monitor-column" aria-label="Monitor de pedidos recibidos">
            <article className="card monitor-card">
            <div className="toolbar toolbar-monitor">
              <div className="monitor-heading">
                <p className="section-kicker">Panel de monitoreo</p>
                <h2>Pedidos Recibidos</h2>
                <p className="subtitle-inline">Vista central de mesas, clientes y montos sincronizados en tiempo real</p>
              </div>
              <div className="toolbar-actions toolbar-actions--end">
                <button type="button" className={`secondary analytics-toggle-btn ${mostrarReportes ? 'is-active' : ''}`} onClick={toggleReportes}>
                  {mostrarReportes ? '✕ Cerrar Reportes' : '👁️ Ver Reportes'}
                </button>
              </div>
            </div>

            {loadingOrders ? (
              <article className="empty-state">
                <p>Cargando pedidos...</p>
              </article>
            ) : monitorOrders.length === 0 ? (
              <article className="empty-state">
                <p>No hay pedidos activos pendientes en caja.</p>
              </article>
            ) : (
              <div className="monitor-grid">
                {monitorOrders.map((pedido) => {
                  const statusMeta = getPedidoStatusMeta(pedido.estado)

                  return (
                    <article key={pedido._id} className={`pedido-card ${statusMeta.cardClass}`}>
                      <div className="pedido-card-top">
                        <div className="mesa-stack">
                          <p className="mesa-kicker">Mesa</p>
                          <p className="mesa-value">{pedido.mesa}</p>
                          <p className="cliente-name">{pedido.clienteNombre || 'Cliente sin nombre'}</p>
                        </div>
                        <span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                      </div>

                      <div className="pedido-meta-row">
                        <p className="pedido-id">ID: {pedido._id}</p>
                      </div>

                      <ul className="pedido-items">
                        {pedido.items.length ? pedido.items.map((item, index) => (
                          <li key={`${pedido._id}-${item.nombre}-${index}`} className="pedido-item">
                            <div className="pedido-item-line">
                              <span className="pedido-item-name">{item.cantidad} x {item.nombre}</span>
                              <span className="pedido-item-price">{formatMoney(item.precioUnitario)}</span>
                            </div>
                            <span className="pedido-item-note">{item.nota || 'Sin notas'}</span>
                          </li>
                        )) : <li className="pedido-item"><span className="pedido-item-note">Sin items registrados</span></li>}
                      </ul>

                      <div className="pedido-footer">
                        <div>
                          <p className="pedido-total-label">Monto total</p>
                          <p className="pedido-total-value">
                            <span>USD {Number(pedido.total || 0).toFixed(2)}</span>
                            {Number.isFinite(dailyBcvRate) && dailyBcvRate > 0 ? <span className="pedido-total-bs">{formatBs(pedido.total * dailyBcvRate)}</span> : null}
                            {Number.isFinite(dailyPesoRate) && dailyPesoRate > 0 ? <span className="pedido-total-bs">{formatPesos(pedido.total * dailyPesoRate)}</span> : null}
                          </p>
                          <p className="pedido-balance-line">Pagado: {formatMoney(pedido.montoPagado)}</p>
                          <p className={`pedido-balance-line ${pedido.restante > 0 ? 'is-pending' : 'is-complete'}`}>Restante: {formatMoney(pedido.restante)}</p>
                        </div>
                        <button type="button" onClick={() => setSelectedMesa(pedido.mesa)}>Seleccionar</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
            </article>
          </section>
        </div>
      </section>

      {mostrarReportes && (
        <section className="analytics-react-shell" aria-label="Analitica y reportes de ventas">
          <div className="report-block report-block--react" aria-hidden="false">
            <div className="section-divider">
              <span className="section-divider-line"></span>
              <span className="section-divider-label">Analitica</span>
              <span className="section-divider-line"></span>
            </div>

            <section className="card full">
              <div className="toolbar toolbar-monitor">
                <div>
                  <p className="section-kicker">Analitica</p>
                  <h2>Reporte de Ventas</h2>
                  <p className="subtitle-inline">Dashboard operativo con tendencias, metodos de pago y trazabilidad de transacciones.</p>
                </div>
                <div className="report-toolbar-actions">
                  <div className="report-filter-group" role="group" aria-label="Filtrar reporte por fecha">
                    {REPORT_RANGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`report-filter-chip ${reportRange === option.value ? 'is-active' : ''}`}
                        onClick={() => setReportRange(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="secondary" onClick={() => void fetchReport(false)}>Refrescar reporte</button>
                </div>
              </div>

              {loadingReport ? <p className="report-empty-react">Cargando analitica...</p> : null}

              <div className="report-summary-grid">
                <article className="report-kpi-card report-kpi-card--sales">
                  <p className="report-label">Ventas</p>
                  <p className="report-total-amount">{formatMoney(reportSummary.totalRevenue || 0)}</p>
                  <p className="report-meta">{reportSummary.totalOrders || 0} ordenes registradas en {reportRangeLabel}</p>
                  <div className="report-equivalents">
                    <div>
                      <span className="report-mini-label">Bs</span>
                      <strong className="report-mini-value">{Number.isFinite(dailyBcvRate) && dailyBcvRate > 0 ? formatBs((reportSummary.totalRevenue || 0) * dailyBcvRate) : 'BS --'}</strong>
                    </div>
                    <div>
                      <span className="report-mini-label">COP</span>
                      <strong className="report-mini-value">{Number.isFinite(dailyPesoRate) && dailyPesoRate > 0 ? formatPesos((reportSummary.totalRevenue || 0) * dailyPesoRate) : 'COP --'}</strong>
                    </div>
                  </div>
                </article>

                <article className="report-kpi-card">
                  <p className="report-label">Eficiencia</p>
                  <p className="report-kpi-value">{formatMoney(reportSummary.averageTicket || 0)}</p>
                  <p className="report-meta">Ticket promedio por orden pagada</p>
                </article>

                <article className="report-kpi-card">
                  <p className="report-label">Volumen</p>
                  <p className="report-kpi-value">{reportSummary.totalOrders || 0} ordenes</p>
                  <p className="report-meta">{reportSummary.cleaningPercentage || 0}% de mesas pasaron por limpieza</p>
                </article>
              </div>

              <div className="report-visual-grid">
                <article className="report-panel report-panel--chart-wide">
                  <div className="report-panel-head">
                    <div>
                      <p className="report-label">Ventas por hora</p>
                      <h3>Flujo de ventas por hora</h3>
                    </div>
                  </div>
                  <div className="chart-shell chart-shell--bar">
                    <Bar
                      data={hourlyChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { grid: { display: false }, ticks: { color: '#94A3B8' }, border: { display: false } },
                          y: { beginAtZero: true, ticks: { color: '#94A3B8' }, border: { display: false } },
                        },
                      }}
                    />
                  </div>
                </article>

                <article className="report-panel report-panel--chart-side">
                  <div className="report-panel-head">
                    <div>
                      <p className="report-label">Metodos de pago</p>
                      <h3>Distribucion por metodo</h3>
                    </div>
                  </div>
                  <div className="chart-shell chart-shell--pie">
                    <Doughnut
                      data={doughnutData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '62%',
                        plugins: { legend: { display: false } },
                      }}
                    />
                  </div>
                  <div className="report-legend">
                    {paymentBreakdown.length ? paymentBreakdown.map((item, index) => (
                      <div key={`${item.method}-${index}`} className="report-legend-item">
                        <span className="report-legend-dot" style={{ background: doughnutPalette[index % doughnutPalette.length] }}></span>
                        <span className="report-legend-label">{formatReportMethod(item.method)}</span>
                        <strong className="report-legend-value">{formatMoney(item.total)}</strong>
                      </div>
                    )) : <p className="report-meta">Sin metodos de pago para este periodo.</p>}
                  </div>
                </article>
              </div>

              <article className="report-panel report-panel--table">
                <div className="report-panel-head">
                  <div>
                    <p className="report-label">Transacciones</p>
                    <h3>Detalle de pagos</h3>
                  </div>
                  <p className="report-meta">Mostrando: {reportRangeLabel}</p>
                </div>
                <div className="report-table-shell">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>ID Pedido</th>
                        <th>Mesa</th>
                        <th>Monto (USD)</th>
                        <th>Metodo</th>
                        <th>Hora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportData?.transactions || []).length ? (reportData.transactions || []).map((venta) => (
                        <tr key={venta._id}>
                          <td className="report-table-id">{String(venta._id || '').slice(-8)}</td>
                          <td>{venta.table}{venta.cliente_nombre ? <span className="report-client-inline"> · {venta.cliente_nombre}</span> : null}</td>
                          <td className="report-table-money">{formatMoney(venta.paymentAmount)}</td>
                          <td>{formatReportMethod(venta.paymentMethod)}</td>
                          <td className="report-table-time">{formatReportHour(venta.hora_pago)}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="5" className="report-empty-cell">No hay ventas para reportar en este periodo.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          </div>
        </section>
      )}
    </main>
  )
}