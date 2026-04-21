import { useEffect, useMemo, useState } from 'react'

import { API_BASE_URL, SOCKET_URL } from '../config/api'
import { restoSocket } from '../lib/socket'

const HISTORY_REFRESH_MS = 10000

function normalizeStatus(value) {
  return String(value || 'en_cocina').trim().toLowerCase().replace(/\s+/g, '_')
}

function getStatusMeta(status) {
  if (status === 'pagado') {
    return {
      label: 'Pagado',
      badgeClass: 'kitchen-silver-pill',
    }
  }

  if (status === 'limpieza') {
    return {
      label: 'Limpieza',
      badgeClass: 'kitchen-silver-pill',
    }
  }

  if (status === 'entregado') {
    return {
      label: 'Entregado',
      badgeClass: 'kitchen-silver-pill',
    }
  }

  return {
    label: 'En cocina',
    badgeClass: 'kitchen-silver-pill',
  }
}

function formatDateTime(value) {
  if (!value) {
    return '--'
  }

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsedDate)
}

function normalizeKitchenOrder(order) {
  const orderId = order?.idPedido || order?._id
  const mesa = order?.numeroMesa || order?.table || order?.mesa

  if (!orderId || !mesa) {
    return null
  }

  return {
    idPedido: String(orderId),
    numeroMesa: String(mesa),
    status: normalizeStatus(order?.status),
    clienteNombre: String(order?.clienteNombre || order?.cliente_nombre || '').trim(),
    mesoneroUsuario: String(order?.mesoneroUsuario || order?.mesonero_usuario || '').trim(),
    createdAt: order?.createdAt || null,
    preparedAt: order?.preparedAt || null,
    horaPago: order?.horaPago || order?.hora_pago || null,
    items: Array.isArray(order.items)
      ? order.items
          .map((item) => ({
            nombre: String(item?.nombre || item?.name || '').trim(),
            cantidad: Number(item?.cantidad || item?.qty || 1),
            notas: typeof item?.notas === 'string' ? item.notas.trim() : typeof item?.note === 'string' ? item.note.trim() : '',
          }))
          .filter((item) => item.nombre && item.cantidad > 0)
      : [],
    notas: Array.isArray(order.notas)
      ? order.notas.filter((note) => typeof note === 'string' && note.trim())
      : [],
  }
}

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || 'No se pudo completar la solicitud de cocina.')
  }

  return payload
}

export default function Cocina({ authToken, session, onLogout }) {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastSyncLabel, setLastSyncLabel] = useState('--')

  const totalPedidos = useMemo(() => pedidos.length, [pedidos])

  async function loadKitchenHistory({ silent = false } = {}) {
    if (!silent) {
      setLoading(true)
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/kitchen/history`, {
        headers: {
          Accept: 'application/json',
        },
      })

      const payload = await parseJsonResponse(response)

      setPedidos(
        (Array.isArray(payload?.orders)
          ? payload.orders.map((order) => normalizeKitchenOrder(order)).filter(Boolean)
          : [])
          .sort((left, right) => {
            const leftDate = new Date(left.createdAt || 0).getTime()
            const rightDate = new Date(right.createdAt || 0).getTime()
            return rightDate - leftDate
          }),
      )

      setLastSyncLabel(
        new Intl.DateTimeFormat('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date()),
      )
      setError('')
    } catch (loadError) {
      if (!silent) {
        setError(loadError.message || 'No se pudo cargar el historial de cocina.')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    void loadKitchenHistory()

    const refreshTimerId = window.setInterval(() => {
      void loadKitchenHistory({ silent: true })
    }, HISTORY_REFRESH_MS)

    return () => {
      window.clearInterval(refreshTimerId)
    }
  }, [])

  useEffect(() => {
    const refreshFromRealtime = () => {
      void loadKitchenHistory({ silent: true })
    }

    const handleConnectError = (connectError) => {
      setError(
        connectError?.message || `El historial perdio la conexion en tiempo real. Verifica que SOCKET_URL apunte a ${SOCKET_URL}.`,
      )
    }

    restoSocket.on('ACTUALIZACION_GLOBAL', refreshFromRealtime)
    restoSocket.on('PEDIDO_GLOBAL', refreshFromRealtime)
    restoSocket.on('PEDIDO_COCINA', refreshFromRealtime)
    restoSocket.on('kitchen_order_removed', refreshFromRealtime)
    restoSocket.on('orden_actualizada', refreshFromRealtime)
    restoSocket.on('pedido_entregado', refreshFromRealtime)
    restoSocket.on('connect_error', handleConnectError)

    if (!restoSocket.connected) {
      restoSocket.auth = {
        token: authToken,
      }
      restoSocket.connect()
    }

    return () => {
      restoSocket.off('ACTUALIZACION_GLOBAL', refreshFromRealtime)
      restoSocket.off('PEDIDO_GLOBAL', refreshFromRealtime)
      restoSocket.off('PEDIDO_COCINA', refreshFromRealtime)
      restoSocket.off('kitchen_order_removed', refreshFromRealtime)
      restoSocket.off('orden_actualizada', refreshFromRealtime)
      restoSocket.off('pedido_entregado', refreshFromRealtime)
      restoSocket.off('connect_error', handleConnectError)
    }
  }, [authToken])

  return (
    <main className="min-h-screen bg-mesh-carbon px-3 py-4 sm:px-4 lg:px-6">
      <section className="luxury-glass mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-4 rounded-[24px] p-3 shadow-glow sm:p-4 lg:p-5">
        <header className="grid gap-4 border-b border-resto-cyan/30 pb-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-resto-accent/85">
              Resto 001
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Historial cocina
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-metallicMuted">
              Comandas principales registradas en tiempo real. Socket: {SOCKET_URL}
            </p>
          </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 xl:self-stretch">
            <div className="luxury-glass luxury-hover-lift rounded-2xl px-4 py-3 shadow-cyan">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                Sesion activa
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {session?.usuario}
                  </p>
                  <p className="text-xs text-metallicMuted">
                    Rol {session?.rol}
                  </p>
                </div>

                <button
                  type="button"
                  className="luxury-primary min-h-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition"
                  onClick={onLogout}
                >
                  Salir
                </button>
              </div>
            </div>

            <div className="luxury-glass luxury-hover-lift rounded-2xl px-4 py-3 shadow-cyan sm:text-left xl:text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                Comandas
              </p>
              <p className="mt-1 font-display text-4xl font-semibold text-resto-accent">
                {totalPedidos}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-metallicMuted">
                Sync: {lastSyncLabel}
              </p>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm font-semibold text-white">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="luxury-glass flex min-h-[32vh] items-center justify-center rounded-[24px] px-5 py-10 text-xl font-semibold text-white">
            Cargando pedidos...
          </div>
        ) : null}

        {!loading && pedidos.length === 0 ? (
          <div className="luxury-glass flex min-h-[32vh] items-center justify-center rounded-[24px] border border-dashed border-resto-cyan/30 px-5 py-10 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                Sin pendientes
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-white">
                No hay comandas en historial.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && pedidos.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {pedidos.map((order) => {
              const statusMeta = getStatusMeta(order.status)

              return (
                <article
                  key={order.idPedido}
                  className="luxury-glass luxury-kitchen-card luxury-hover-lift flex min-h-[18rem] flex-col rounded-[22px] p-3 shadow-glow"
                >
                  <div className="border-b border-resto-cyan/30 pb-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                        Mesa
                      </p>
                      <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${statusMeta.badgeClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                      Comanda principal
                    </p>
                    <h2 className="mt-1 font-display text-4xl font-semibold leading-none text-resto-accent sm:text-5xl">
                      {order.numeroMesa}
                    </h2>
                    <p className="mt-2 text-xs text-metallicMuted">
                      {order.clienteNombre || 'Cliente sin nombre'} · Mesonero: {order.mesoneroUsuario || 'N/D'}
                    </p>
                  </div>

                  <ul className="mt-3 flex-1 space-y-2.5">
                    {order.items.map((item) => (
                      <li key={`${order.idPedido}-${item.nombre}-${item.notas}`} className="rounded-xl border border-resto-cyan/30 bg-resto-panel px-3 py-2.5">
                        <p className="text-lg font-semibold leading-snug text-white">
                          {item.cantidad} {item.nombre}
                        </p>
                        {item.notas ? (
                          <p className="mt-1 text-xs font-medium text-metallicMuted">
                            Nota: {item.notas}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 space-y-1.5 rounded-2xl border border-resto-cyan/20 bg-resto-panel px-3 py-3 text-xs text-metallicMuted">
                    <p>Creada: {formatDateTime(order.createdAt)}</p>
                    <p>Entregada: {formatDateTime(order.preparedAt)}</p>
                    <p>Pagada: {formatDateTime(order.horaPago)}</p>
                    <p>ID: {order.idPedido}</p>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </main>
  )
}