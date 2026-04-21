import { useCallback, useEffect, useMemo, useState } from 'react'

import { API_BASE_URL } from '../config/api'
import { useRestoRealtime } from '../hooks/use-resto-realtime'

const fallbackMenu = {
  Bebidas: [
    { name: 'Nestea', price: 2.5, type: 'drink', category: 'Bebidas' },
    { name: 'Pepsi', price: 2, type: 'drink', category: 'Bebidas' },
  ],
  Platos: [
    { name: 'Hamburguesa', price: 7.5, type: 'dish', category: 'Platos' },
    { name: 'Perro Caliente', price: 5.5, type: 'dish', category: 'Platos' },
  ],
}

const quickNotesByCategory = {
  Bebidas: ['Sin hielo', 'Poca azucar', 'Vaso aparte'],
  Platos: ['Con todo', 'Sin verduras', 'Extra queso'],
}
const tables = ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4']

function formatPrice(amount) {
  return `$${amount.toFixed(2)}`
}

function formatPesos(amount) {
  return `Pesos ${amount.toFixed(2)}`
}

function normalizeOrder(order) {
  return {
    _id: order._id,
    table: order.table,
    items: (order.items ?? []).map((item) => ({
      _id: item._id,
      name: item.name,
      price: Number(item.price ?? 0),
      note: item.note || 'Sin notas',
    })),
    total: Number(order.total ?? 0),
    status: order.status ?? 'pendiente',
    hora_pago: order.hora_pago ?? null,
  }
}

function isOrderLocked(status) {
  return status === 'limpieza' || status === 'pagado'
}

function groupItems(items) {
  const grouped = new Map()

  items.forEach((item) => {
    const key = `${item.name}::${item.note}::${item.price}`
    const existing = grouped.get(key)

    if (existing) {
      existing.quantity += 1
      existing.items.push(item)
      return
    }

    grouped.set(key, {
      key,
      name: item.name,
      note: item.note,
      price: item.price,
      quantity: 1,
      items: [item],
    })
  })

  return Array.from(grouped.values())
}

function buildItemsBatch(item, note, quantity) {
  return Array.from({ length: quantity }, () => ({
    name: item.name,
    price: item.price,
    note,
  }))
}

async function parseJsonResponse(response) {
  const data = await response.json()

  if (!response.ok) {
    const error = new Error(data.message || 'La solicitud no se pudo completar')
    error.data = data
    throw error
  }

  return data
}

function normalizeMenuCatalog(payload) {
  if (!payload || typeof payload !== 'object') {
    return fallbackMenu
  }

  if (payload.categories && typeof payload.categories === 'object' && Object.keys(payload.categories).length > 0) {
    return payload.categories
  }

  if (!Array.isArray(payload.items)) {
    return fallbackMenu
  }

  return payload.items.reduce((accumulator, item) => {
    const category = item.category || item.categoria || 'Menu'

    if (!accumulator[category]) {
      accumulator[category] = []
    }

    accumulator[category].push({
      name: item.name || item.nombre,
      price: Number(item.price ?? item.precio ?? 0),
      type: item.type || (String(category).toLowerCase().includes('bebida') ? 'drink' : 'dish'),
      category,
      description: item.description || item.descripcion || '',
      _id: item._id || item.id,
    })

    return accumulator
  }, {})
}

function OrderWizard({ currentOrder, setCurrentOrder, initialOrder, authToken }) {
  const [menuCatalog, setMenuCatalog] = useState(fallbackMenu)
  const [step, setStep] = useState(1)
  const [selectedCategory, setSelectedCategory] = useState('Bebidas')
  const [selectedMenuItem, setSelectedMenuItem] = useState(null)
  const [selectedNote, setSelectedNote] = useState('Sin hielo')
  const [selectedQuantity, setSelectedQuantity] = useState(1)
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [feedbackType, setFeedbackType] = useState('default')
  const [editableItems, setEditableItems] = useState([])
  const [isDirty, setIsDirty] = useState(false)
  const [tableStatuses, setTableStatuses] = useState([])
  const [isLoadingTables, setIsLoadingTables] = useState(true)
  const [isCajaConnected, setIsCajaConnected] = useState(false)
  const [isReleasingTable, setIsReleasingTable] = useState(false)
  const [dailyExchangeRate, setDailyExchangeRate] = useState(null)
  const menuCategories = useMemo(() => Object.keys(menuCatalog), [menuCatalog])

  const quickNotes = selectedMenuItem
    ? quickNotesByCategory[selectedMenuItem.category] || quickNotesByCategory.Platos
    : quickNotesByCategory[selectedCategory] || quickNotesByCategory.Platos

  const totalItems = useMemo(
    () => currentOrder.items.reduce((count, item) => count + 1, 0),
    [currentOrder.items],
  )
  const canRemoveItems = !currentOrder._id || currentOrder.status === 'pendiente'
  const canEditActiveOrder = currentOrder._id && !isOrderLocked(currentOrder.status)
  const groupedEditableItems = useMemo(() => groupItems(editableItems), [editableItems])
  const groupedCurrentItems = useMemo(() => groupItems(currentOrder.items), [currentOrder.items])
  const totalInPesos = useMemo(() => {
    if (!Number.isFinite(Number(dailyExchangeRate)) || Number(dailyExchangeRate) <= 0) {
      return null
    }

    return Number(currentOrder.total || 0) * Number(dailyExchangeRate)
  }, [currentOrder.total, dailyExchangeRate])

  const fetchTableStatuses = useCallback(async (showLoader = false) => {
    if (showLoader) {
      setIsLoadingTables(true)
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/tables/status`)
      const data = await parseJsonResponse(response)

      setTableStatuses(data.tables ?? [])
    } catch (error) {
      setFeedbackType('default')
      setFeedback('No se pudo cargar el estado de las mesas.')
    } finally {
      if (showLoader) {
        setIsLoadingTables(false)
      }
    }
  }, [])

  const fetchDailyExchangeRate = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/exchange-rate/today?type=pesos`)
      const data = await parseJsonResponse(response)
      const rate = Number(data?.rate)
      setDailyExchangeRate(Number.isFinite(rate) && rate > 0 ? rate : null)
    } catch (error) {
      setDailyExchangeRate(null)
    }
  }, [])

  const fetchMenuCatalog = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/menu`)
      const data = await parseJsonResponse(response)
      setMenuCatalog(normalizeMenuCatalog(data))
    } catch (_error) {
      setMenuCatalog(fallbackMenu)
    }
  }, [])

  const handleMenuUpdated = useCallback((payload) => {
    setMenuCatalog(normalizeMenuCatalog(payload))
    setFeedbackType('success')
    setFeedback('Menu actualizado en tiempo real.')
  }, [])

  useEffect(() => {
    fetchTableStatuses(true)
    fetchDailyExchangeRate()
    fetchMenuCatalog()

    const intervalId = window.setInterval(() => {
      fetchTableStatuses(false)
      fetchDailyExchangeRate()
    }, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [fetchDailyExchangeRate, fetchMenuCatalog, fetchTableStatuses])

  useEffect(() => {
    if (!menuCategories.length) {
      return
    }

    if (!menuCatalog[selectedCategory]) {
      setSelectedCategory(menuCategories[0])
    }
  }, [menuCatalog, menuCategories, selectedCategory])

  useEffect(() => {
    if (!isDirty) {
      setEditableItems(currentOrder.items ?? [])
    }
  }, [currentOrder.items, isDirty])

  const syncCurrentOrder = useCallback(async () => {
    if (!currentOrder._id) {
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${currentOrder._id}`)

      if (!response.ok) {
        return
      }

      const data = await response.json()
      const normalized = normalizeOrder(data.order)
      setCurrentOrder(normalized)

      if (!isDirty) {
        setEditableItems(normalized.items)
      }
    } catch (error) {
      // noop during polling
    }
  }, [currentOrder._id, isDirty, setCurrentOrder])

  useEffect(() => {
    if (!currentOrder._id) {
      return undefined
    }

    const intervalId = window.setInterval(syncCurrentOrder, 15000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [currentOrder._id, syncCurrentOrder])

  const handleRemoteRelease = useCallback((payload) => {
    if (!payload?.table || payload.table !== currentOrder.table) {
      return
    }

    setStep(1)
    setSelectedMenuItem(null)
    setSelectedNote('Sin hielo')
    setSelectedCategory('Bebidas')
    setEditableItems([])
    setIsDirty(false)
  }, [currentOrder.table])

  useRestoRealtime({
    authToken,
    fetchTableStatuses,
    syncCurrentOrder,
    setTableStatuses,
    setCurrentOrder,
    setEditableItems,
    setFeedback,
    setFeedbackType,
    setIsCajaConnected,
    currentOrder,
    isDirty,
    initialOrder,
    onRemoteRelease: handleRemoteRelease,
    normalizeOrder,
    onMenuUpdated: handleMenuUpdated,
  })

  function updateOrder(items, table = currentOrder.table) {
    const total = items.reduce((sum, item) => sum + item.price, 0)

    setCurrentOrder({
      table,
      items,
      total,
      status: 'pendiente',
    })
  }

  async function handleTableSelect(table) {
    setFeedback('')
    setFeedbackType('default')
    const tableStatus = tableStatuses.find((item) => item.table === table)

    if (tableStatus?.occupied && tableStatus.orderId) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${tableStatus.orderId}`)
        const data = await parseJsonResponse(response)
        const normalized = normalizeOrder(data.order)

        setCurrentOrder(normalized)
        setEditableItems(normalized.items)
        setIsDirty(false)
        setStep(2)
        if (normalized.status === 'limpieza') {
          setFeedback(`${table} esta en limpieza. Usa "Mesa limpia / liberar mesa" cuando quede disponible.`)
        } else {
          setFeedback(`${table} ya tiene un pedido activo.`)
        }
        return
      } catch (error) {
        setFeedback('No se pudo abrir la orden activa de la mesa.')
        return
      }
    }

    setCurrentOrder({
      ...initialOrder,
      table,
    })
    setEditableItems([])
    setIsDirty(false)
    setStep(2)
  }

  function handleMenuSelection(item) {
    setFeedback('')
    setFeedbackType('default')
    setSelectedMenuItem(item)
    setSelectedNote(quickNotesByCategory[item.category][0])
    setSelectedQuantity(1)
    setStep(3)
  }

  async function handleAddCustomizedItem() {
    if (!selectedMenuItem) {
      return
    }

    const normalizedQuantity = Number.parseInt(selectedQuantity, 10)
    const quantity = Number.isFinite(normalizedQuantity) ? Math.max(1, normalizedQuantity) : 1
    const itemsBatch = buildItemsBatch(selectedMenuItem, selectedNote, quantity)

    if (currentOrder._id) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${currentOrder._id}/update-items`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [
              ...currentOrder.items,
              ...itemsBatch,
            ],
          }),
        })

        const data = await parseJsonResponse(response)
        setCurrentOrder(normalizeOrder(data.order))
        setFeedbackType('default')
        setFeedback(`${selectedMenuItem.name} x${quantity} agregado a la orden activa.`)
        setSelectedMenuItem(null)
        setSelectedNote('Sin hielo')
        setSelectedQuantity(1)
        setStep(2)
        return
      } catch (error) {
        setFeedback('No se pudo agregar el item a la orden activa.')
        return
      }
    }

    const nextItems = [...currentOrder.items, ...itemsBatch]
    updateOrder(nextItems)
    setFeedbackType('default')
    setFeedback(`${selectedMenuItem.name} x${quantity} agregado a ${currentOrder.table}`)
    setSelectedMenuItem(null)
    setSelectedNote('Sin hielo')
    setSelectedQuantity(1)
    setStep(2)
  }

  async function handleRemoveItem(indexToRemove) {
    const nextItems = currentOrder.items.filter((_, index) => index !== indexToRemove)
    const itemToRemove = currentOrder.items[indexToRemove]

    if (!itemToRemove) {
      return
    }

    if (!canRemoveItems) {
      setFeedback('No puedes eliminar items cuando la orden ya no esta pendiente.')
      return
    }

    if (!window.confirm(`Vas a eliminar ${itemToRemove.name} del pedido actual.`)) {
      return
    }

    if (currentOrder._id && itemToRemove._id) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/orders/${currentOrder._id}/update-items`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: currentOrder.items.filter((item) => item._id !== itemToRemove._id),
          }),
        })

        const data = await parseJsonResponse(response)

        setCurrentOrder(normalizeOrder(data.order))
        setFeedbackType('default')
        setFeedback(`${itemToRemove.name} fue eliminado de la orden.`)
        return
      } catch (error) {
        setFeedback(error.message || 'No se pudo eliminar el item.')
        return
      }
    }

    updateOrder(nextItems)
  }

  function resetWizard() {
    setCurrentOrder(initialOrder)
    setStep(1)
    setSelectedMenuItem(null)
    setSelectedNote('Sin hielo')
    setSelectedQuantity(1)
    setSelectedCategory(menuCategories[0] || 'Bebidas')
    setEditableItems([])
    setIsDirty(false)
  }

  async function handleSendOrder() {
    if (!currentOrder.table || currentOrder.items.length === 0) {
      setFeedback('Selecciona una mesa y agrega al menos un item.')
      return
    }

    setSending(true)
    setFeedback('')

    try {
      const payload = {
        tableId: currentOrder.table,
        cliente_nombre: currentOrder.cliente_nombre,
        seccion: currentOrder.seccion,
        items: currentOrder.items,
      }

      const response = await fetch(`${API_BASE_URL}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await parseJsonResponse(response)
      setCurrentOrder(normalizeOrder(data.order))
      setEditableItems(normalizeOrder(data.order).items)
      setIsDirty(false)
      setFeedbackType('default')
      setFeedback('Pedido enviado al area de cocina/caja.')
    } catch (error) {
      if (error.message === 'La mesa ya tiene un pedido activo' && error.data?.order?._id) {
        try {
          const response = await fetch(`${API_BASE_URL}/api/orders/${error.data.order._id}`)
          const data = await parseJsonResponse(response)
          const normalized = normalizeOrder(data.order)
          setCurrentOrder(normalized)
          setEditableItems(normalized.items)
          setIsDirty(false)
          setStep(2)
        } catch (syncError) {
          // noop
        }
      }

      setFeedback(error.message || 'No se pudo enviar el pedido. Revisa la IP local del backend.')
    } finally {
      setSending(false)
    }
  }

  async function handleReleaseTable() {
    if (!currentOrder.table || currentOrder.status !== 'limpieza') {
      return
    }

    const tableToRelease = currentOrder.table

    if (!window.confirm(`Vas a marcar ${tableToRelease} como lista para nuevos clientes.`)) {
      return
    }

    setIsReleasingTable(true)
    setFeedbackType('default')
    setFeedback(`${tableToRelease} liberandose...`)

    // Oculta de inmediato la mesa en limpieza mientras se confirma en backend.
    setTableStatuses((previousTables) =>
      previousTables.map((tableStatus) =>
        tableStatus.table === tableToRelease
          ? {
              ...tableStatus,
              occupied: false,
              orderId: null,
              status: 'disponible',
              cliente_nombre: '',
            }
          : tableStatus,
      ),
    )

    setStep(1)
    setCurrentOrder(initialOrder)
    setEditableItems([])
    setIsDirty(false)
    setSelectedMenuItem(null)
    setSelectedNote('Sin hielo')
    setSelectedQuantity(1)
    setSelectedCategory(menuCategories[0] || 'Bebidas')

    try {
      const response = await fetch(`${API_BASE_URL}/api/tables/${encodeURIComponent(tableToRelease)}/liberar`, {
        method: 'PATCH',
      })

      await parseJsonResponse(response)

      setFeedbackType('success')
      setFeedback(`${tableToRelease} fue marcada como libre.`)

      void fetchTableStatuses(false)
    } catch (error) {
      setFeedbackType('default')
      setFeedback(error.message || 'No se pudo liberar la mesa.')
      void fetchTableStatuses(false)
    } finally {
      setIsReleasingTable(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] w-full max-w-7xl flex-col gap-5 lg:flex-row">
      <section className="glass-panel luxury-hover-lift relative flex-1 overflow-hidden rounded-[28px] p-4 shadow-glow sm:p-6 lg:p-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(212,175,55,0.14),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(192,192,192,0.1),transparent_24%)]" />

        <div className="relative flex h-full flex-col">
          <div className="mb-6 flex flex-col gap-4 border-b border-carbonLine pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.35em] text-sunset/90">
                Resto 001
              </p>
              <h1 className="mt-2 max-w-xl font-display text-3xl font-semibold tracking-tight text-snowText sm:text-4xl">
                Control de comandas
              </h1>
            </div>

            <div className="rounded-2xl border border-carbonLine bg-carbon px-4 py-3 text-sm text-snowText">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${
                    isCajaConnected
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                      : 'border-rose-400 bg-rose-500/20 text-rose-300'
                  }`}
                  aria-label={isCajaConnected ? 'Conectado con Caja' : 'Sin conexion con Caja'}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                    <path d="M12 20h.01" />
                    <path d="M2 8.82a16 16 0 0 1 20 0" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">Conexion con Caja</p>
                  <p className={`mt-1 ${isCajaConnected ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {isCajaConnected ? 'Conectado' : 'Sin conexion'}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {currentOrder.table || 'Sin mesa seleccionada'}
              </p>
            </div>
          </div>

          {step === 1 ? (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-snowText">
                    Selecciona la mesa
                  </h2>
                  <p className="mt-1 text-sm text-slate-300">
                    Las ocupadas aparecen en naranja y las mesas en limpieza resaltan en azul.
                  </p>
                </div>
              </div>

              {isLoadingTables ? (
                <div className="rounded-3xl border border-carbonLine bg-carbon p-5 text-sm text-slate-300">
                  Consultando estado de mesas...
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {tables.map((table) => {
                  const selected = currentOrder.table === table
                  const tableStatus = tableStatuses.find((item) => item.table === table)
                  const occupied = Boolean(tableStatus?.occupied)
                  const isCleaning = tableStatus?.status === 'limpieza'

                  return (
                    <button
                      key={table}
                      type="button"
                      onClick={() => handleTableSelect(table)}
                      className={`luxury-hover-lift min-h-[132px] rounded-3xl border p-5 text-left transition duration-200 ${
                        isCleaning
                          ? 'border-warning bg-warning text-deepCarbon shadow-glow'
                          : occupied
                            ? 'border-sunsetOrange bg-sunsetOrange text-deepCarbon shadow-glow'
                          : selected
                            ? 'border-sunset bg-carbon text-snowText shadow-glow'
                            : 'border-carbonLine bg-carbonCard text-snowText hover:border-sunset/60 hover:bg-carbon'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.35em] text-inherit/70">
                          {isCleaning ? 'Limpieza' : occupied ? 'Ocupada' : 'Disponible'}
                        </span>
                        {occupied ? (
                          <span className="text-lg font-semibold">
                            {isCleaning ? 'Lista para liberar' : 'Cliente'}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 font-display text-2xl font-semibold">{table}</p>
                      <p className="mt-2 text-sm text-inherit/80">
                        {isCleaning
                          ? 'Cuenta cobrada. Esperando confirmacion de limpieza para volver a estar libre.'
                          : occupied
                            ? 'Abrir pedido activo y seguir modificando.'
                            : 'Preparada para iniciar una nueva orden.'}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="flex flex-1 flex-col gap-5">
              <div className="flex flex-wrap items-center gap-3">
                {menuCategories.map((category) => {
                  const active = selectedCategory === category

                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setSelectedCategory(category)}
                      className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                        active
                          ? 'bg-sunsetOrange text-deepCarbon'
                          : 'border border-carbonLine bg-carbon text-slate-200 hover:bg-carbonCard'
                      }`}
                    >
                      {category}
                    </button>
                  )
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
                {(menuCatalog[selectedCategory] || []).map((item) => (
                  <button
                    key={item._id || item.name}
                    type="button"
                    onClick={() => handleMenuSelection(item)}
                    className="group luxury-hover-lift min-h-[148px] rounded-[28px] border border-carbonLine bg-carbon p-5 text-left transition hover:-translate-y-0.5 hover:border-sunset/70 hover:bg-carbonCard"
                  >
                    <span className="inline-flex rounded-full border border-carbonLine bg-carbonCard px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200">
                      {item.type === 'dish' ? 'Personalizable' : 'Rapido'}
                    </span>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <h3 className="font-display text-2xl font-semibold text-snowText">
                          {item.name}
                        </h3>
                        <p className="mt-2 text-sm text-slate-300">
                          {item.description || 'Pasa al paso 3 para elegir una nota rapida.'}
                        </p>
                      </div>
                      <p className="text-lg font-semibold text-sunset">
                        {formatPrice(item.price)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-auto flex flex-col gap-3 border-t border-carbonLine pt-5 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-secondary min-h-[52px] rounded-2xl px-5 font-semibold transition"
                >
                  Volver a mesas
                </button>

                <button
                  type="button"
                  onClick={handleSendOrder}
                    disabled={currentOrder.items.length === 0 || sending || Boolean(currentOrder._id)}
                  className="min-h-[52px] rounded-2xl bg-sunset px-5 font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-carbonLine disabled:text-slate-400"
                >
                    {sending ? 'Enviando...' : currentOrder._id ? 'Orden activa guardada' : 'Enviar pedido'}
                </button>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex flex-1 flex-col gap-5">
              <div>
                <h2 className="font-display text-2xl font-semibold text-snowText">
                  Personaliza {selectedMenuItem?.name}
                </h2>
                <p className="mt-2 text-sm text-slate-300">
                  Este paso funciona para bebidas y platos. Agrega una nota rapida antes de pasar el item al pedido.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {quickNotes.map((note) => {
                  const selected = selectedNote === note

                  return (
                    <button
                      key={note}
                      type="button"
                      onClick={() => setSelectedNote(note)}
                      className={`min-h-[118px] rounded-[24px] border p-5 text-left transition ${
                        selected
                          ? 'border-sunsetOrange bg-sunsetOrange text-deepCarbon shadow-glow'
                          : 'border-carbonLine bg-carbon text-snowText hover:border-sunset/60 hover:bg-carbonCard'
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-inherit/70">
                        Opcion rapida
                      </p>
                      <p className="mt-3 font-display text-xl font-semibold">{note}</p>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-[24px] border border-carbonLine bg-carbon p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
                  Cantidad
                </p>

                <div className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-carbonLine bg-[#0b1220] p-2">
                  <button
                    type="button"
                    onClick={() => setSelectedQuantity((current) => Math.max(1, Number(current || 1) - 1))}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-carbonLine bg-carbon text-lg font-bold text-snowText"
                    aria-label="Disminuir cantidad"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={selectedQuantity}
                    onChange={(event) => {
                      const nextValue = Number.parseInt(event.target.value, 10)
                      setSelectedQuantity(Number.isFinite(nextValue) ? Math.max(1, nextValue) : 1)
                    }}
                    className="h-10 w-20 rounded-xl border border-carbonLine bg-carbon px-3 text-center font-semibold text-snowText outline-none"
                    aria-label="Cantidad de producto"
                  />
                  <button
                    type="button"
                    onClick={() => setSelectedQuantity((current) => Number(current || 1) + 1)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-carbonLine bg-sunset text-lg font-bold text-black"
                    aria-label="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-carbonLine bg-carbon p-4">
                <label
                  htmlFor="order-note"
                  className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300"
                >
                  Comentario
                </label>
                <textarea
                  id="order-note"
                  value={selectedNote}
                  onChange={(event) => setSelectedNote(event.target.value)}
                  placeholder="Escribe una nota para cocina o barra"
                  className="mt-3 min-h-[120px] w-full rounded-2xl border border-carbonLine bg-[#0b1220] px-4 py-3 text-sm text-snowText outline-none transition placeholder:text-slate-500 focus:border-sunset"
                />
              </div>

              <div className="mt-auto flex flex-col gap-3 border-t border-carbonLine pt-5 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[52px] rounded-2xl border border-carbonLine bg-carbon px-5 font-semibold text-snowText transition hover:bg-carbonCard"
                >
                  Volver al menu
                </button>

                <button
                  type="button"
                  onClick={handleAddCustomizedItem}
                  className="min-h-[52px] rounded-2xl bg-sunset px-5 font-semibold text-black transition hover:brightness-110"
                >
                  Agregar x{selectedQuantity} al pedido
                </button>
              </div>
            </div>
          ) : null}

          {feedback ? (
            <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              feedbackType === 'success'
                ? 'border-success bg-success/10 text-success'
                : 'border-carbonLine bg-carbon text-snowText'
            }`}>
              {feedback}
            </div>
          ) : null}
        </div>
      </section>

      <aside className="glass-panel w-full rounded-[28px] p-4 sm:p-6 lg:max-w-md">
        <div className="flex items-center justify-between border-b border-carbonLine pb-4">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-slate-300">
              Pedido actual
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-snowText">
              {currentOrder.table || 'Mesa pendiente'}
            </h2>
          </div>

          <div className="rounded-2xl bg-carbon px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-300">Items</p>
            <p className="mt-1 text-2xl font-semibold text-snowText">{totalItems}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {currentOrder._id && currentOrder.status === 'limpieza' ? (
            <button
              type="button"
              onClick={handleReleaseTable}
              disabled={isReleasingTable}
              className="w-full rounded-2xl bg-warning px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-deepCarbon transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-carbonLine disabled:text-slate-400"
            >
              {isReleasingTable ? 'Liberando mesa...' : 'Mesa limpia / liberar mesa'}
            </button>
          ) : null}

          {currentOrder._id ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-2xl border border-carbonLine bg-carbon px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-snowText transition hover:bg-carbonCard"
            >
              Agregar mas platos
            </button>
          ) : null}

          {currentOrder._id ? (
            <div className="rounded-3xl border border-carbonLine bg-carbon p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
                    Detalle de mesa
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    Ajusta cantidades o elimina items y confirma los cambios.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const response = await fetch(`${API_BASE_URL}/api/orders/${currentOrder._id}/update-items`, {
                          method: 'PATCH',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            items: editableItems,
                          }),
                        })

                        const data = await parseJsonResponse(response)

                        const normalized = normalizeOrder(data.order)
                        setCurrentOrder(normalized)
                        setEditableItems(normalized.items)
                        setIsDirty(false)
                        setFeedbackType('default')
                        setFeedback('Cambios confirmados correctamente.')
                      } catch (error) {
                        setFeedbackType('default')
                        setFeedback(error.message || 'No se pudieron confirmar los cambios.')
                      }
                    }}
                    disabled={!canEditActiveOrder || !isDirty}
                    className="rounded-2xl bg-sunsetOrange px-4 py-3 text-sm font-semibold text-deepCarbon transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-carbonLine disabled:text-slate-400"
                  >
                    Confirmar cambios
                  </button>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {groupedEditableItems.map((group) => (
                  <div
                    key={group.key}
                    className="rounded-2xl border border-carbonLine bg-[#0b1220] p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-snowText">{group.name}</p>
                        <p className="mt-1 text-sm text-slate-300">{group.note}</p>
                        <p className="mt-2 text-sm font-semibold text-sunset">
                          {formatPrice(group.price)} c/u
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (currentOrder.status !== 'pendiente') {
                              setFeedback('Solo puedes eliminar items en estado pendiente.')
                              return
                            }

                            if (group.quantity === 1) {
                              const shouldDelete = window.confirm(
                                `Vas a eliminar ${group.name} del pedido. ¿Continuar?`,
                              )

                              if (!shouldDelete) {
                                return
                              }
                            }

                            const targetId = group.items[group.items.length - 1]?._id
                            const nextItems = targetId
                              ? editableItems.filter((item) => item._id !== targetId)
                              : editableItems.filter((item, index) => {
                                  const firstMatch = editableItems.findIndex(
                                    (candidate) =>
                                      candidate.name === group.name &&
                                      candidate.note === group.note &&
                                      candidate.price === group.price,
                                  )
                                  return index !== firstMatch
                                })

                            setEditableItems(nextItems)
                            setIsDirty(true)
                          }}
                          disabled={group.quantity === 0 || currentOrder.status !== 'pendiente'}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-carbonLine bg-carbon text-lg font-bold text-snowText disabled:cursor-not-allowed disabled:text-slate-500"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-base font-semibold text-snowText">
                          {group.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            if (isOrderLocked(currentOrder.status)) {
                              setFeedback('No puedes agregar items a una orden pagada.')
                              return
                            }

                            setEditableItems([
                              ...editableItems,
                              {
                                name: group.name,
                                note: group.note,
                                price: group.price,
                              },
                            ])
                            setIsDirty(true)
                          }}
                          disabled={isOrderLocked(currentOrder.status)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl border border-carbonLine bg-sunset text-lg font-bold text-black disabled:cursor-not-allowed disabled:bg-carbonLine disabled:text-slate-500"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {currentOrder.items.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-carbonLine bg-carbon px-4 py-6 text-center text-sm text-slate-300">
              Aun no hay items en la orden. Selecciona mesa y empieza desde el menu.
            </div>
          ) : (
            groupedCurrentItems.map((group) => (
              <div
                key={group.key}
                className="rounded-3xl border border-carbonLine bg-carbon p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-snowText">{group.quantity} x {group.name}</p>
                    <p className="mt-1 text-sm text-slate-300">{group.note}</p>
                  </div>
                  {!currentOrder._id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const indexToRemove = currentOrder.items.findIndex(
                            (candidate) =>
                              candidate.name === group.name &&
                              candidate.note === group.note &&
                              candidate.price === group.price,
                          )

                          if (indexToRemove < 0) {
                            return
                          }

                          if (group.quantity === 1) {
                            const shouldDelete = window.confirm(
                              `Vas a eliminar ${group.name} del pedido. ¿Continuar?`,
                            )

                            if (!shouldDelete) {
                              return
                            }
                          }

                          const nextItems = currentOrder.items.filter((_, index) => index !== indexToRemove)
                          updateOrder(nextItems)
                          setFeedbackType('default')
                          setFeedback(
                            group.quantity === 1
                              ? `${group.name} fue eliminado del pedido.`
                              : `${group.name} reducido en 1 unidad.`,
                          )
                        }}
                        disabled={!canRemoveItems || group.quantity <= 0}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-carbonLine bg-carbon text-lg font-bold text-snowText disabled:cursor-not-allowed disabled:text-slate-500"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          updateOrder([
                            ...currentOrder.items,
                            {
                              name: group.name,
                              note: group.note,
                              price: group.price,
                            },
                          ])
                          setFeedbackType('default')
                          setFeedback(`${group.name} agregado a ${currentOrder.table}`)
                        }}
                        disabled={isOrderLocked(currentOrder.status)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-carbonLine bg-sunset text-lg font-bold text-black disabled:cursor-not-allowed disabled:bg-carbonLine disabled:text-slate-500"
                      >
                        +
                      </button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-3 text-right text-sm font-semibold text-sunset">
                  {formatPrice(group.price * group.quantity)}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 rounded-3xl border border-carbonLine bg-carbon p-4">
          <div className="flex items-center justify-between text-sm text-slate-300">
            <span>Status</span>
            <span className={`rounded-full px-3 py-1 font-semibold ${
              currentOrder.status === 'limpieza'
                ? 'bg-warning text-deepCarbon'
                : currentOrder.status === 'pagado'
                  ? 'bg-success text-deepCarbon'
                  : 'bg-info text-deepCarbon'
            }`}>
              {currentOrder.status}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xl font-semibold text-snowText">
            <span>Total</span>
            <div className="text-right">
              <span>{formatPrice(currentOrder.total)}</span>
              {totalInPesos ? (
                <p className="mt-1 text-xs font-semibold text-slate-400">{formatPesos(totalInPesos)}</p>
              ) : null}
            </div>
          </div>
        </div>

      </aside>
    </div>
  )
}

export default OrderWizard