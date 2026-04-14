import { useEffect, useMemo, useRef, useState } from 'react'

import { API_BASE_URL, SOCKET_URL } from '../config/api'
import { restoSocket } from '../lib/socket'

const EXIT_ANIMATION_MS = 260

function normalizeKitchenOrder(order) {
  const orderId = order?.idPedido || order?._id
  const mesa = order?.numeroMesa || order?.table || order?.mesa

  if (!orderId || !mesa) {
    return null
  }

  return {
    idPedido: String(orderId),
    numeroMesa: String(mesa),
    items: Array.isArray(order.items)
      ? order.items
          .map((item) => ({
            nombre: String(item?.nombre || item?.name || '').trim(),
            cantidad: Number(item?.cantidad || 1),
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

export default function Cocina() {
  const [pedidos, setPedidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dispatchingIds, setDispatchingIds] = useState([])
  const [exitingIds, setExitingIds] = useState([])
  const exitTimersRef = useRef(new Map())
  const highlightTimersRef = useRef(new Map())
  const [highlightedIds, setHighlightedIds] = useState([])

  const totalPedidos = useMemo(() => pedidos.length, [pedidos])

  useEffect(() => {
    let ignore = false

    async function loadKitchenQueue() {
      setLoading(true)
      setError('')

      try {
        const response = await fetch(`${API_BASE_URL}/api/kitchen/orders`, {
          headers: {
            Accept: 'application/json',
          },
        })

        const payload = await parseJsonResponse(response)

        if (ignore) {
          return
        }

        setPedidos(
          Array.isArray(payload?.orders)
            ? payload.orders.map((order) => normalizeKitchenOrder(order)).filter(Boolean)
            : [],
        )
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || 'No se pudo cargar la cola de cocina.')
          setPedidos([])
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadKitchenQueue()

    return () => {
      ignore = true

      exitTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      exitTimersRef.current.clear()

      highlightTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      highlightTimersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    const handlePedidoEntrante = (pedido) => {
      const nuevoPedido = normalizeKitchenOrder(pedido)

      if (!nuevoPedido) {
        return
      }

      setPedidos((prev) => [nuevoPedido, ...prev.filter((pedidoActual) => pedidoActual.idPedido !== nuevoPedido.idPedido)])
      setHighlightedIds((prev) => [...prev.filter((id) => id !== nuevoPedido.idPedido), nuevoPedido.idPedido])

      const existingTimerId = highlightTimersRef.current.get(nuevoPedido.idPedido)

      if (existingTimerId) {
        window.clearTimeout(existingTimerId)
      }

      const timerId = window.setTimeout(() => {
        setHighlightedIds((prev) => prev.filter((id) => id !== nuevoPedido.idPedido))
        highlightTimersRef.current.delete(nuevoPedido.idPedido)
      }, 3000)

      highlightTimersRef.current.set(nuevoPedido.idPedido, timerId)
      setError('')
    }

    const handleKitchenRemoved = (payload) => {
      const orderId = String(payload?.idPedido || '')

      if (!orderId) {
        return
      }

      setPedidos((prev) => prev.filter((pedido) => pedido.idPedido !== orderId))
      setHighlightedIds((prev) => prev.filter((id) => id !== orderId))
      setDispatchingIds((currentIds) => currentIds.filter((id) => id !== orderId))
      setExitingIds((currentIds) => currentIds.filter((id) => id !== orderId))

      const existingTimerId = highlightTimersRef.current.get(orderId)

      if (existingTimerId) {
        window.clearTimeout(existingTimerId)
        highlightTimersRef.current.delete(orderId)
      }
    }

    const handleConnectError = (connectError) => {
      setError(
        connectError?.message || `La cocina perdio la conexion en tiempo real. Verifica que SOCKET_URL apunte a ${SOCKET_URL}.`,
      )
    }

    restoSocket.on('ACTUALIZACION_GLOBAL', handlePedidoEntrante)
    restoSocket.on('PEDIDO_GLOBAL', handlePedidoEntrante)
    restoSocket.on('PEDIDO_COCINA', handlePedidoEntrante)
    restoSocket.on('kitchen_order_removed', handleKitchenRemoved)
    restoSocket.on('connect_error', handleConnectError)

    if (!restoSocket.connected) {
      restoSocket.connect()
    }

    return () => {
      restoSocket.off('ACTUALIZACION_GLOBAL', handlePedidoEntrante)
      restoSocket.off('PEDIDO_GLOBAL', handlePedidoEntrante)
      restoSocket.off('PEDIDO_COCINA', handlePedidoEntrante)
      restoSocket.off('kitchen_order_removed', handleKitchenRemoved)
      restoSocket.off('connect_error', handleConnectError)
    }
  }, [])

  async function handleReady(orderId) {
    if (dispatchingIds.includes(orderId)) {
      return
    }

    setDispatchingIds((currentIds) => [...currentIds, orderId])
    setError('')

    try {
      const response = await fetch(`${API_BASE_URL}/api/kitchen/orders/${orderId}/ready`, {
        method: 'PATCH',
        headers: {
          Accept: 'application/json',
        },
      })

      await parseJsonResponse(response)

      setExitingIds((currentIds) => [...currentIds, orderId])

      const timerId = window.setTimeout(() => {
        setPedidos((currentOrders) => currentOrders.filter((order) => order.idPedido !== orderId))
        setDispatchingIds((currentIds) => currentIds.filter((id) => id !== orderId))
        setExitingIds((currentIds) => currentIds.filter((id) => id !== orderId))
        exitTimersRef.current.delete(orderId)
      }, EXIT_ANIMATION_MS)

      exitTimersRef.current.set(orderId, timerId)
    } catch (requestError) {
      setDispatchingIds((currentIds) => currentIds.filter((id) => id !== orderId))
      setError(requestError.message || 'No se pudo despachar el pedido.')
    }
  }

  return (
    <main className="min-h-screen bg-mesh-carbon px-3 py-4 sm:px-4 lg:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-[1600px] flex-col gap-4 rounded-[24px] border border-cyan-500/30 bg-[#111827]/95 p-3 shadow-glow sm:p-4 lg:p-5">
        <header className="flex flex-col gap-2 border-b border-cyan-500/30 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-resto-accent/85">
              Resto 001
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Cocina
            </h1>
            <p className="mt-1 text-sm text-metallicMuted">
              Cola compacta en tiempo real. Socket: {SOCKET_URL}
            </p>
          </div>

          <div className="rounded-2xl border border-cyan-500/30 bg-[#0b1220] px-4 py-3 text-right shadow-cyan">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
              En cola
            </p>
            <p className="mt-1 font-display text-4xl font-semibold text-resto-accent">
              {totalPedidos}
            </p>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-error/40 bg-error/10 px-3 py-2 text-sm font-semibold text-white">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[32vh] items-center justify-center rounded-[24px] border border-cyan-500/30 bg-resto-surface px-5 py-10 text-xl font-semibold text-white">
            Cargando pedidos...
          </div>
        ) : null}

        {!loading && pedidos.length === 0 ? (
          <div className="flex min-h-[32vh] items-center justify-center rounded-[24px] border border-dashed border-cyan-500/30 bg-resto-surface px-5 py-10 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                Sin pendientes
              </p>
              <p className="mt-2 font-display text-2xl font-semibold text-white">
                No hay pedidos en cocina.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && pedidos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
            {pedidos.map((order) => {
              const isDispatching = dispatchingIds.includes(order.idPedido)
              const isExiting = exitingIds.includes(order.idPedido)
              const isHighlighted = highlightedIds.includes(order.idPedido)

              return (
                <article
                  key={order.idPedido}
                  className={`flex min-h-[18rem] flex-col rounded-[22px] border border-cyan-500/30 bg-resto-surface p-3 shadow-glow transition-all duration-300 ${
                    isHighlighted ? 'animate-pulse-cyan' : ''
                  } ${
                    isExiting
                      ? 'translate-y-4 scale-[0.98] opacity-0'
                      : 'translate-y-0 scale-100 opacity-100'
                  }`}
                >
                  <div className="border-b border-cyan-500/30 pb-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-metallicMuted">
                      Mesa
                    </p>
                    <h2 className="mt-1 font-display text-4xl font-semibold leading-none text-resto-accent sm:text-5xl">
                      {order.numeroMesa}
                    </h2>
                  </div>

                  <ul className="mt-3 flex-1 space-y-2.5">
                    {order.items.map((item) => (
                      <li key={`${order.idPedido}-${item.nombre}-${item.notas}`} className="rounded-xl border border-cyan-500/30 bg-resto-panel px-3 py-2.5">
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

                  <button
                    type="button"
                    onClick={() => handleReady(order.idPedido)}
                    disabled={isDispatching}
                    className="mt-3 min-h-[3.25rem] w-full rounded-[18px] bg-resto-accent px-4 py-3 text-lg font-black uppercase tracking-[0.22em] text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isDispatching ? 'Enviando...' : 'Listo'}
                  </button>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>
    </main>
  )
}