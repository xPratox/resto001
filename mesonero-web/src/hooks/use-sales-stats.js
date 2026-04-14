import { useEffect, useState } from 'react'

import { API_BASE_URL } from '../config/api'

function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function resolveDateRange(filter) {
  const now = new Date()
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (filter === 'yesterday') {
    const yesterday = new Date(base)
    yesterday.setDate(yesterday.getDate() - 1)

    return {
      inicio: toIsoDate(yesterday),
      fin: toIsoDate(yesterday),
    }
  }

  if (filter === 'last7days') {
    const start = new Date(base)
    start.setDate(start.getDate() - 6)

    return {
      inicio: toIsoDate(start),
      fin: toIsoDate(base),
    }
  }

  return {
    inicio: toIsoDate(base),
    fin: toIsoDate(base),
  }
}

export function useSalesStats({ filter = 'today', tasaBCV = 0, tasaCOP = 0 }) {
  const [totalVentas, setTotalVentas] = useState(0)
  const [ticketPromedio, setTicketPromedio] = useState(0)
  const [totalOrdenes, setTotalOrdenes] = useState(0)
  const [metodosPago, setMetodosPago] = useState({})
  const [totalBs, setTotalBs] = useState(0)
  const [totalCop, setTotalCop] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false

    async function loadSalesStats() {
      setLoading(true)
      setError('')

      try {
        const { inicio, fin } = resolveDateRange(filter)
        const response = await fetch(
          `${API_BASE_URL}/api/stats/ventas?inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`,
          {
            headers: {
              Accept: 'application/json',
            },
            signal: controller.signal,
          },
        )
        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(payload?.message || 'No se pudieron cargar las estadisticas de ventas.')
        }

        const nextTotalVentas = Number(payload?.totalVentas ?? payload?.stats?.totalVentas ?? 0)
        const nextTicketPromedio = Number(payload?.ticketPromedio ?? payload?.stats?.ticketPromedio ?? 0)
        const nextTotalOrdenes = Number(payload?.cantidadOrdenes ?? payload?.totalOrdenes ?? payload?.stats?.cantidadOrdenes ?? payload?.stats?.totalOrdenes ?? 0)
        const nextMetodosPago = payload?.metodosPago && typeof payload.metodosPago === 'object'
          ? payload.metodosPago
          : {}
        const nextTotalBs = Number.isFinite(Number(tasaBCV)) && Number(tasaBCV) > 0
          ? Number((nextTotalVentas * Number(tasaBCV)).toFixed(2))
          : 0
        const nextTotalCop = Number.isFinite(Number(tasaCOP)) && Number(tasaCOP) > 0
          ? Number((nextTotalVentas * Number(tasaCOP)).toFixed(2))
          : 0

        if (ignore) {
          return
        }

        setTotalVentas(nextTotalVentas)
        setTicketPromedio(nextTicketPromedio)
        setTotalOrdenes(nextTotalOrdenes)
        setMetodosPago(nextMetodosPago)
        setTotalBs(nextTotalBs)
        setTotalCop(nextTotalCop)
      } catch (loadError) {
        if (ignore) {
          return
        }

        if (loadError.name === 'AbortError') {
          return
        }

        setTotalVentas(0)
        setTicketPromedio(0)
        setTotalOrdenes(0)
        setMetodosPago({})
        setTotalBs(0)
        setTotalCop(0)
        setError(loadError.message || 'No se pudieron cargar las estadisticas de ventas.')
      } finally {
        if (!ignore) {
          setLoading(false)
        }
      }
    }

    loadSalesStats()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [filter, tasaBCV, tasaCOP])

  return {
    totalVentas,
    ticketPromedio,
    totalOrdenes,
    metodosPago,
    totalBs,
    totalCop,
    loading,
    error,
  }
}