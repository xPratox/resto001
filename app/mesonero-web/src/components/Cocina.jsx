import { useEffect, useMemo, useRef, useState } from 'react'

import { API_BASE_URL } from '../config/api'
import { createRestoSocket } from '../lib/socket'

const EXIT_ANIMATION_MS = 260

function normalizeKitchenOrder(order) {
  if (!order?.idPedido || !order?.numeroMesa) {
    return null
  }

  return {
    idPedido: String(order.idPedido),
    numeroMesa: String(order.numeroMesa),
    items: Array.isArray(order.items)
      ? order.items
        .map((item) => ({
          nombre: String(item?.nombre || '').trim(),
          cantidad: Number(item?.cantidad || 0),
          notas: typeof item?.notas === 'string' ? item.notas.trim() : '',
        }))
        .filter((item) => item.nombre && item.cantidad > 0)
      : [],
    notas: Array.isArray(order.notas)
      ? order.notas.filter((note) => typeof note === 'string' && note.trim())
      : [],
  }
}

function upsertKitchenOrder(currentOrders, nextOrder) {
  const normalizedOrder = normalizeKitchenOrder(nextOrder)

  if (!normalizedOrder) {
    return currentOrders
  }

  const existingIndex = currentOrders.findIndex((order) => order.idPedido === normalizedOrder.idPedido)

  if (existingIndex === -1) {
    return [...currentOrders, normalizedOrder]
  }

  const nextOrders = [...currentOrders]
  nextOrders[existingIndex] = normalizedOrder
  return nextOrders
}

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.message || 'No se pudo completar la solicitud de cocina.')
  }

  return payload
}

export default function Cocina() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dispatchingIds, setDispatchingIds] = useState([])
  const [exitingIds, setExitingIds] = useState([])
  const exitTimersRef = useRef(new Map())

  const totalOrders = useMemo(() => orders.length, [orders])

  useEffect(() => {
    let ignore = false
    const socket = createRestoSocket()

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

        setOrders(
          Array.isArray(payload?.orders)
            ? payload.orders.map((order) => normalizeKitchenOrder(order)).filter(Boolean)
            : [],
        )
      } catch (loadError) {
        if (!ignore) {
          setError(loadError.message || 'No se pudo cargar la cola de cocina.')
          setOrders([])
        }
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    function handleKitchenUpsert(payload) {
      setOrders((currentOrders) => upsertKitchenOrder(currentOrders, payload))
      setError('')
    }

    function handleKitchenRemoved(payload) {
      const orderId = String(payload?.idPedido || '')

      if (!orderId) {
        return
      }

      setOrders((currentOrders) => currentOrders.filter((order) => order.idPedido !== orderId))
      setDispatchingIds((currentIds) => currentIds.filter((id) => id !== orderId))
      setExitingIds((currentIds) => currentIds.filter((id) => id !== orderId))
    }

    loadKitchenQueue()

    socket.on('kitchen_order_upsert', handleKitchenUpsert)
    socket.on('kitchen_order_removed', handleKitchenRemoved)

    return () => {
      ignore = true
      socket.off('kitchen_order_upsert', handleKitchenUpsert)
      socket.off('kitchen_order_removed', handleKitchenRemoved)
      socket.disconnect()

      exitTimersRef.current.forEach((timerId) => {
        window.clearTimeout(timerId)
      })
      exitTimersRef.current.clear()
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
        setOrders((currentOrders) => currentOrders.filter((order) => order.idPedido !== orderId))
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
    <main className="min-h-screen bg-mesh-carbon px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col gap-6 rounded-[28px] border border-carbonLine bg-[#111827]/95 p-4 shadow-glow sm:p-6 lg:p-8">
        <header className="flex flex-col gap-3 border-b border-carbonLine pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.4em] text-resto-accent/85">
              Resto 001
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Cocina
            </h1>
            <p className="mt-2 text-base text-metallicMuted">
              Cola operativa de alta visibilidad. Solo lectura, toque y despacho.
            </p>
          </div>

          <div className="rounded-3xl border border-cyan/30 bg-[#0b1220] px-5 py-4 text-right shadow-cyan">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-metallicMuted">
              En cola
            </p>
            <p className="mt-2 font-display text-5xl font-semibold text-resto-accent">
              {totalOrders}
            </p>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-error/40 bg-error/10 px-4 py-3 text-base font-semibold text-white">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-[28px] border border-carbonLine bg-[#1E293B] px-6 py-12 text-2xl font-semibold text-white">
            Cargando pedidos...
          </div>
        ) : null}

        {!loading && orders.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-[28px] border border-dashed border-carbonLine bg-[#1E293B] px-6 py-12 text-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-metallicMuted">
                Sin pendientes
              </p>
              <p className="mt-3 font-display text-3xl font-semibold text-white">
                No hay pedidos en cocina.
              </p>
            </div>
          </div>
        ) : null}

        {!loading && orders.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
            {orders.map((order) => {
              const isDispatching = dispatchingIds.includes(order.idPedido)
              const isExiting = exitingIds.includes(order.idPedido)

              return (
                <article
                  key={order.idPedido}
                  className={`flex min-h-[24rem] flex-col rounded-[28px] border border-cyan/20 bg-[#1E293B] p-5 shadow-glow transition-all duration-300 ${
                    isExiting
                      ? 'translate-y-4 scale-[0.98] opacity-0'
                      : 'translate-y-0 scale-100 opacity-100'
                  }`}
                >
                  <div className="border-b border-cyan/20 pb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-metallicMuted">
                      Mesa
                    </p>
                    <h2 className="mt-2 font-display text-6xl font-semibold leading-none text-resto-accent sm:text-7xl">
                      {order.numeroMesa}
                    </h2>
                  </div>

                  <ul className="mt-5 flex-1 space-y-4">
                    {order.items.map((item) => (
                      <li key={`${order.idPedido}-${item.nombre}-${item.notas}`} className="rounded-2xl border border-white/10 bg-[#111827] px-4 py-4">
                        <p className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
                          {item.cantidad} {item.nombre}
                        </p>
                        {item.notas ? (
                          <p className="mt-2 text-base font-medium text-metallicMuted sm:text-lg">
                            Nota: {item.notas}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {order.notas.length > 0 ? (
                    <div className="mt-5 rounded-2xl border border-cyan/20 bg-cyan/5 px-4 py-3 text-base text-metallicMuted">
                      {order.notas.map((note) => (
                        <p key={`${order.idPedido}-${note}`}>• {note}</p>
                      ))}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => handleReady(order.idPedido)}
                    disabled={isDispatching}
                    className="mt-5 min-h-[4.75rem] w-full rounded-[22px] bg-resto-accent px-6 py-4 text-2xl font-black uppercase tracking-[0.28em] text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
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