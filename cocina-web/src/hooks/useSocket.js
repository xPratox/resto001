import { useEffect, useRef } from 'react'

import { restoSocket } from '../lib/socket'

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

export function useSocket({ setPedidos, setError, onPedidoRemovido }) {
  const socketRef = useRef(null)

  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = restoSocket
    }

    const socket = socketRef.current

    const handleKitchenOrder = (payload) => {
      const nuevoPedido = normalizeKitchenOrder(payload)

      if (!nuevoPedido) {
        return
      }

      setPedidos((prev) => {
        const existingIndex = prev.findIndex((pedido) => pedido.idPedido === nuevoPedido.idPedido)

        if (existingIndex === -1) {
          return [...prev, nuevoPedido]
        }

        const next = [...prev]
        next[existingIndex] = nuevoPedido
        return next
      })

      setError('')
    }

    const handleConnectError = (error) => {
      setError(error?.message || 'La cocina perdio la conexion en tiempo real.')
    }

    const handleKitchenRemoved = (payload) => {
      const orderId = String(payload?.idPedido || '')

      if (!orderId) {
        return
      }

      setPedidos((prev) => prev.filter((pedido) => pedido.idPedido !== orderId))
      onPedidoRemovido?.(orderId)
    }

    socket.on('PEDIDO_GLOBAL', handleKitchenOrder)
    socket.on('kitchen_order_removed', handleKitchenRemoved)
    socket.on('connect_error', handleConnectError)

    if (!socket.connected) {
      socket.connect()
    }

    return () => {
      socket.off('PEDIDO_GLOBAL', handleKitchenOrder)
      socket.off('kitchen_order_removed', handleKitchenRemoved)
      socket.off('connect_error', handleConnectError)
    }
  }, [onPedidoRemovido, setError, setPedidos])

  return socketRef.current
}