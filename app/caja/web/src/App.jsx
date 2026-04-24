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
import ThemeToggle from './components/ThemeToggle'
import { useTheme } from './hooks/useTheme'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, DoughnutController, Tooltip, Legend)

const AUTH_STORAGE_KEY = 'resto001:auth:caja'
const DASHBOARD_TIMEZONE = 'America/Caracas'
const CAJA_PAYABLE_STATUSES = ['pendiente', 'en_cocina', 'entregado']
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
    const rawText = await response.text().catch(() => '')
    let payload = {}

    if (rawText) {
      try {
        payload = JSON.parse(rawText)
      } catch {
        payload = { message: rawText }
      }
    }

    if (!response.ok) {
      const statusPrefix = `HTTP ${response.status}`
      throw new Error(payload.message ? `${statusPrefix}: ${payload.message}` : `${statusPrefix}: Error en la solicitud`)
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

function escapeTicketText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildComandaHtml(pedido) {
  const itemsHtml = (pedido?.items || [])
    .map((item) => {
      const note = String(item?.nota || '').trim()
      const hasNote = note && note.toLowerCase() !== 'sin notas'

      return `<tr>
        <td>${item.cantidad || 1}</td>
        <td>
          <div class="item-name">${escapeTicketText(item.nombre || '')}</div>
          ${hasNote ? `<div class="item-note">Nota: ${escapeTicketText(note)}</div>` : ''}
        </td>
      </tr>`
    })
    .join('')

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Comanda ${escapeTicketText(pedido?.mesa || '')}</title>
    <style>
      @page { size: 58mm auto; margin: 2mm; }
      body { font-family: monospace; margin: 0; padding: 0; width: 56mm; }
      .ticket { width: 56mm; }
      h1 { font-size: 20px; margin: 0 0 8px; }
      p { margin: 2px 0; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th, td { font-size: 13px; text-align: left; padding: 2px 0; }
      .item-name { font-size: 13px; }
      .item-note { font-size: 12px; opacity: 0.9; }
    </style>
  </head>
  <body>
    <div class="ticket">
      <h1>Comanda</h1>
      <p>Mesa: ${escapeTicketText(pedido?.mesa || '--')}</p>
      <table>
        <thead><tr><th>Cant</th><th>Item</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
  </body>
</html>`
}

function printComandaInCurrentPage(pedido) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    let settled = false

    const cleanup = () => {
      if (settled) {
        return
      }

      settled = true

      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }

    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'

    const triggerPrint = () => {
      try {
        const frameWindow = iframe.contentWindow

        if (!frameWindow) {
          throw new Error('No se pudo abrir el visor de impresion interno.')
        }

        frameWindow.focus()
        frameWindow.print()

        window.setTimeout(() => {
          cleanup()
          resolve(true)
        }, 500)
      } catch (error) {
        cleanup()
        reject(error)
      }
    }

    document.body.appendChild(iframe)

    const frameDocument = iframe.contentDocument

    if (!frameDocument) {
      cleanup()
      reject(new Error('No se pudo preparar el documento de impresion.'))
      return
    }

    frameDocument.open()
    frameDocument.write(buildComandaHtml(pedido))
    frameDocument.close()

    window.setTimeout(triggerPrint, 250)
  })
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

  const groupedItems = new Map()

  ;(order.items || []).forEach((item) => {
    const nombre = item.name
    const precioUnitario = Number(item.price || 0)
    const nota = item.note || 'Sin notas'
    const cantidad = Number(item.cantidad || 1)
    const key = `${nombre}::${nota}::${precioUnitario}`
    const existing = groupedItems.get(key)

    if (existing) {
      existing.cantidad += Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1
      return
    }

    groupedItems.set(key, {
      cantidad: Number.isFinite(cantidad) && cantidad > 0 ? cantidad : 1,
      nombre,
      precioUnitario,
      nota,
    })
  })

  return {
    _id: order._id,
    mesa: order.table,
    estado: estadoVisible,
    total,
    montoPagado,
    restante,
    comandaImpresaAt: order.comanda_impresa_at || null,
    soloBebidaSinComanda: Boolean(order.soloBebidaSinComanda || order.solo_bebida_sin_comanda),
    clienteNombre: order.cliente_nombre || '',
    items: Array.from(groupedItems.values()),
  }
}

function getPedidoStatusMeta(status) {
  if (status === 'pendiente') {
    return {
      cardClass: 'status-entregado',
      badgeClass: 'ok',
      label: 'PENDIENTE PAGO',
    }
  }

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

function LoginThemeHeader({ theme, onToggleTheme }) {
  return (
    <div className="auth-card-head">
      <p className="auth-kicker">Resto 001</p>
      <ThemeToggle theme={theme} onToggle={onToggleTheme} compact />
    </div>
  )
}

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [usuario, setUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [session, setSession] = useState(() => {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [socketConnected, setSocketConnected] = useState(restoSocket.connected)
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState(null)
  const [selectedMesa, setSelectedMesa] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [montoRecibido, setMontoRecibido] = useState('')
  const [monedaPago, setMonedaPago] = useState('USD')
  const [imprimirComandaAlCobrar, setImprimirComandaAlCobrar] = useState(true)
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
  const apiRequestPrefix = API_BASE_URL || '/api'

  const canRenderApp = useMemo(
    () => Boolean(session?.token && session?.rol === 'caja'),
    [session?.rol, session?.token],
  )

  useEffect(() => {
    if (!session?.token) {
      return undefined
    }

    const originalFetch = window.fetch.bind(window)

    window.fetch = (input, init = {}) => {
      const requestUrl = typeof input === 'string' ? input : input?.url || ''
      const isApiRequest = requestUrl.startsWith(apiRequestPrefix) || requestUrl.startsWith('/api')

      if (!isApiRequest) {
        return originalFetch(input, init)
      }

      return originalFetch(input, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${session.token}`,
        },
      })
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [apiRequestPrefix, session?.token])

  const payableOrders = useMemo(
    () => orders.filter((pedido) => CAJA_PAYABLE_STATUSES.includes(pedido.estado)),
    [orders],
  )

  const monitorOrders = useMemo(
    () => orders.filter((pedido) => CAJA_PAYABLE_STATUSES.includes(pedido.estado) && !pedido.comandaImpresaAt),
    [orders],
  )

  const pendingPrintedOrders = useMemo(
    () => orders.filter((pedido) => CAJA_PAYABLE_STATUSES.includes(pedido.estado) && Boolean(pedido.comandaImpresaAt) && pedido.restante > 0),
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

  const [currentTimeLabel, currentDateLabel] = useMemo(() => {
    const [timePart = '--', datePart = '--'] = String(currentDateTime || '--').split(' | ')
    return [timePart, datePart]
  }, [currentDateTime])

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
  const mesoneroStats = reportData?.mesoneroStats || []
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

  const handleLogout = () => {
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
    restoSocket.disconnect()
    setSession(null)
    setUsuario('')
    setContrasena('')
    setLoginError('')
    setOrders([])
    setSelectedMesa('')
    setMontoRecibido('')
    setMostrarReportes(false)
    setReportData(null)
    setNotice(null)
    setErrorMessage('')
    setSocketConnected(false)
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoginLoading(true)
    setLoginError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ usuario, contrasena }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(data?.message || 'No se pudo iniciar sesion.')
      }

      if (data?.rol !== 'caja') {
        throw new Error('Este modulo solo permite usuarios con rol caja.')
      }

      const nextSession = {
        token: data.token,
        rol: data.rol,
        usuario: data.usuario,
      }

      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession))
      setSession(nextSession)
      setContrasena('')
      setErrorMessage('')
      showNotice(`Sesion iniciada: ${data.usuario || 'caja'}`)
    } catch (error) {
      setLoginError(error.message || 'Credenciales invalidas.')
    } finally {
      setLoginLoading(false)
    }
  }

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

    reportVisibilityRef.current = mostrarReportes
    return undefined
  }, [canRenderApp, mostrarReportes])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

    if (!selectedMesa) {
      return undefined
    }

    if (!payableOrders.some((pedido) => pedido.mesa === selectedMesa)) {
      setSelectedMesa('')
    }
    return undefined
  }, [canRenderApp, payableOrders, selectedMesa])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

    reportRangeRef.current = reportRange
    return undefined
  }, [canRenderApp, reportRange])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

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
  }, [canRenderApp, notice])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

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
  }, [canRenderApp])

  const fetchRates = async () => {
    const [bcvData, pesoData] = await Promise.all([
      requestCentral('/api/exchange-rate/today?type=bcv'),
      requestCentral('/api/exchange-rate/today?type=pesos'),
    ])

    const parsedBcvRate = Number(bcvData.rate)
    const parsedPesoRate = Number(pesoData.rate)

    setDailyBcvRate(Number.isFinite(parsedBcvRate) && parsedBcvRate > 0 ? parsedBcvRate : null)
    setDailyPesoRate(Number.isFinite(parsedPesoRate) && parsedPesoRate > 0 ? parsedPesoRate : null)
    setCanEditBcvRate(false)
    setCanEditPesoRate(false)
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
    if (!canRenderApp) {
      return undefined
    }

    void Promise.all([fetchRates(), fetchOrders(false)])
    return undefined
  }, [canRenderApp])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

    if (!mostrarReportes) {
      return undefined
    }

    void fetchReport(false)
    return undefined
  }, [canRenderApp, mostrarReportes, reportRange])

  useEffect(() => {
    if (!canRenderApp) {
      return undefined
    }

    pollingTimerRef.current = window.setInterval(() => {
      void fetchOrders(true)
    }, 10000)

    return () => {
      if (pollingTimerRef.current) {
        window.clearInterval(pollingTimerRef.current)
      }
    }
  }, [canRenderApp, selectedMesa])

  useEffect(() => {
    if (!canRenderApp) {
      restoSocket.disconnect()
      return undefined
    }

    restoSocket.auth = {
      token: session.token,
    }

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
      restoSocket.disconnect()
    }
  }, [canRenderApp, session?.token])

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
      await maybePrintComandaBeforePayment(orderLookup, metodoPago)

      await requestCentral(`/api/orders/${orderLookup.order._id}/pay`, {
        method: 'PATCH',
        body: JSON.stringify({
          items: orderLookup.order.items || [],
          metodo: metodoPago,
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

  const handlePrintComanda = async (pedido) => {
    if (!pedido?._id) {
      setErrorMessage('No se pudo identificar el pedido para imprimir.')
      return
    }

    if (pedido.soloBebidaSinComanda) {
      setErrorMessage('Una sola bebida se cobra directo y no genera comanda.')
      return
    }

    try {
      const metodo = metodoPago || 'efectivo'

      await requestCentral('/api/kitchen/comandas/print', {
        method: 'POST',
        body: JSON.stringify({
          orderId: pedido._id,
          metodo,
        }),
      })

      try {
        await printComandaInCurrentPage(pedido)
      } catch {
        setErrorMessage('No se pudo abrir la impresion interna. Verifica permisos del navegador.')
        return
      }

      showNotice(`Comanda impresa para ${pedido.mesa}.`)
      await fetchOrders(true)
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo imprimir la comanda.')
    }
  }

  const maybePrintComandaBeforePayment = async (orderLookup, metodo) => {
    if (!imprimirComandaAlCobrar) {
      return
    }

    if (orderLookup?.order?.comanda_impresa_at) {
      return
    }

    if (orderLookup?.order?.soloBebidaSinComanda) {
      return
    }

    await requestCentral('/api/kitchen/comandas/print', {
      method: 'POST',
      body: JSON.stringify({
        orderId: orderLookup.order._id,
        metodo,
      }),
    })

    const pedidoParaImprimir = normalizePedido(orderLookup.order)

    try {
      await printComandaInCurrentPage(pedidoParaImprimir)
    } catch {
      setErrorMessage('No se pudo abrir la impresion interna. Verifica permisos del navegador.')
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

  if (!canRenderApp) {
    return (
      <main className="layout caja-shell">
        <section className="auth-overlay" aria-live="polite">
          <article className="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitleCajaReact">
            <LoginThemeHeader theme={theme} onToggleTheme={toggleTheme} />
            <h1 id="authTitleCajaReact">Login caja</h1>
            <p className="auth-subtitle">Inicia sesion para acceder al panel de cobros.</p>

            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                <span>Usuario</span>
                <input
                  type="text"
                  autoComplete="username"
                  value={usuario}
                  onChange={(event) => setUsuario(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>Contrasena</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={contrasena}
                  onChange={(event) => setContrasena(event.target.value)}
                  required
                />
              </label>

              {loginError ? <p className="auth-error">{loginError}</p> : <p className="auth-error hidden"></p>}

              <button type="submit" disabled={loginLoading}>
                {loginLoading ? 'Ingresando...' : 'Entrar'}
              </button>
            </form>
          </article>
        </section>
      </main>
    )
  }

  return (
    <main className="layout caja-shell">
      <header className="hero hero--compact">
        <div className="hero-head hero-head--compact">
          <div className="hero-identity hero-identity--compact">
            <p className="eyebrow">Caja</p>
            <h1>Panel de cobros</h1>
          </div>

          <section className="hero-rates hero-rates--compact" aria-label="Tasas del dia">
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

          <div className="sync-cluster sync-cluster--header sync-cluster--compact">
            <div className="sync-pill sync-pill--header sync-pill--compact">
              <span className="sync-dot"></span>
              <span className="status-primary">{socketConnected ? 'Sistema en linea' : 'Reconectando'}</span>
            </div>
            <div className="sync-time-block" aria-label="Hora y fecha actual">
              <span className="sync-clock">{currentTimeLabel}</span>
              <span className="sync-date">{currentDateLabel}</span>
            </div>
            <div className="sync-user-chip">
              <span className="sync-user-label" title={session?.usuario || 'caja'}>{session?.usuario || 'caja'}</span>
              <ThemeToggle theme={theme} onToggle={toggleTheme} compact />
              <button
                type="button"
                className="sync-logout-btn sync-logout-btn--icon"
                onClick={handleLogout}
                aria-label="Cerrar sesion"
                title="Cerrar sesion"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15.75 3.75H9a2.25 2.25 0 0 0-2.25 2.25v12A2.25 2.25 0 0 0 9 20.25h6.75" />
                  <path d="M13.5 8.25 17.25 12 13.5 15.75" />
                  <path d="M17.25 12H9.75" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {notice ? <p className={`live-notice ${notice.variant === 'success' ? 'success' : ''}`}>{notice.message}</p> : null}
      </header>

      <section className="operational-shell" aria-label="Bloque operativo de caja">
        <div className="dashboard-shell">
          <aside className="sidebar-column">
          <article className="card payment-card sticky-card luxury-sidebar-glass luxury-hover-surface">
            <form className="stack compact-form" onSubmit={handlePayOrder}>
              <label>
                <span>Metodo</span>
                <select value={metodoPago} onChange={(event) => setMetodoPago(event.target.value)}>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>

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
              <label className="payment-print-option">
                <input
                  type="checkbox"
                  checked={imprimirComandaAlCobrar}
                  onChange={(event) => setImprimirComandaAlCobrar(event.target.checked)}
                />
                Imprimir comanda
              </label>
              <p className="form-helper">
                Equivalente: {Number.isFinite(dailyBcvRate) && dailyBcvRate > 0 ? formatBs(pendingAmount * dailyBcvRate) : 'BS --'} | {Number.isFinite(dailyPesoRate) && dailyPesoRate > 0 ? formatPesos(pendingAmount * dailyPesoRate) : 'COP --'}
              </p>
              {paymentWarning ? <p className="form-warning">{paymentWarning}</p> : <p className="form-warning hidden">&nbsp;</p>}
              <button type="submit" className="luxury-primary-button" disabled={paymentDisabled}>Registrar pago</button>
            </form>

            {errorMessage ? <p className="live-notice">{errorMessage}</p> : null}
          </article>
          </aside>

          <section className="monitor-column" aria-label="Monitor de pedidos recibidos">
            <article className="card monitor-card luxury-hover-surface">
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
                    <article key={pedido._id} className={`pedido-card luxury-hover-surface ${statusMeta.cardClass}`}>
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
                        <div className="pedido-actions">
                          <button type="button" className="luxury-primary-button" onClick={() => setSelectedMesa(pedido.mesa)}>Seleccionar</button>
                          {!pedido.comandaImpresaAt && !pedido.soloBebidaSinComanda ? (
                            <button type="button" className="secondary" onClick={() => void handlePrintComanda(pedido)}>Imprimir comanda</button>
                          ) : pedido.soloBebidaSinComanda ? (
                            <span className="pedido-comanda-printed">Solo cobrar</span>
                          ) : (
                            <span className="pedido-comanda-printed">Comanda impresa</span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            <section className="pending-comandas-panel" aria-label="Pendientes por pagar con comanda impresa">
              <div className="section-divider">
                <span className="section-divider-line"></span>
                <span className="section-divider-label">Pendientes por pagar</span>
                <span className="section-divider-line"></span>
              </div>

              {pendingPrintedOrders.length === 0 ? (
                <p className="subtitle-inline">No hay comandas impresas con saldo pendiente.</p>
              ) : (
                <div className="pending-comandas-list">
                  {pendingPrintedOrders.map((pedido) => (
                    <article key={`pendiente-${pedido._id}`} className="pending-comanda-card">
                      <div>
                        <p className="mesa-kicker">Mesa</p>
                        <p className="mesa-value">{pedido.mesa}</p>
                      </div>
                      <div>
                        <p className="pedido-balance-line">Total: {formatMoney(pedido.total)}</p>
                        <p className="pedido-balance-line">Abono: {formatMoney(pedido.montoPagado)}</p>
                        <p className="pedido-balance-line is-pending">Pendiente: {formatMoney(pedido.restante)}</p>
                      </div>
                      <button type="button" className="luxury-primary-button" onClick={() => setSelectedMesa(pedido.mesa)}>
                        Cobrar
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
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
                <article className="report-kpi-card report-kpi-card--sales luxury-hover-surface">
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

                <article className="report-kpi-card report-kpi-card--tables luxury-hover-surface">
                  <p className="report-label">Mesoneros</p>
                  <p className="report-kpi-value">{mesoneroStats.length || 1}</p>
                  <p className="report-meta">Mesas atendidas por mesonero disponibles en el sistema</p>
                  <div className="report-top-mesas-list">
                    {mesoneroStats.length ? mesoneroStats.map((mesonero) => (
                      <div key={mesonero.usuario || mesonero.nombre} className="report-top-mesa-item">
                        <div className="report-top-mesa-head">
                          <strong>{mesonero.nombre}</strong>
                          <span>{mesonero.mesasAtendidas || 0} mesas</span>
                        </div>
                        <div className="report-top-mesa-track">
                          <span
                            className="report-top-mesa-fill"
                            style={{ width: `${Math.max(12, Math.min(100, (Number(mesonero.mesasAtendidas || 0) / Math.max(1, Number(reportSummary.totalTablesUsed || 1))) * 100))}%` }}
                          ></span>
                        </div>
                      </div>
                    )) : (
                      <div className="report-top-mesa-item">
                        <div className="report-top-mesa-head">
                          <strong>Santiago</strong>
                          <span>0 mesas</span>
                        </div>
                      </div>
                    )}
                  </div>
                </article>

                <article className="report-kpi-card luxury-hover-surface">
                  <p className="report-label">Volumen</p>
                  <p className="report-kpi-value">{reportSummary.totalOrders || 0} ordenes</p>
                  <p className="report-meta">{reportSummary.cleaningPercentage || 0}% de mesas pasaron por limpieza</p>
                </article>
              </div>

              <div className="report-visual-grid">
                <article className="report-panel report-panel--chart-wide luxury-hover-surface">
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

                <article className="report-panel report-panel--chart-side luxury-hover-surface">
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

              <article className="report-panel report-panel--table luxury-hover-surface">
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
                        <th>Mesonero</th>
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
                          <td>{venta.mesonero_nombre || 'Santiago'}{venta.mesa_atendida ? <span className="report-client-inline"> · {venta.mesa_atendida}</span> : null}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan="6" className="report-empty-cell">No hay ventas para reportar en este periodo.</td>
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