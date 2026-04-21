import { useEffect, useRef } from 'react'

import { createRestoSocket } from '../lib/socket'

function getRealtimeTableStatus(payload) {
  if (payload?.action === 'table_released') {
    return 'disponible'
  }

  if (payload?.tableStatus) {
    return payload.tableStatus
  }

  if (payload?.action === 'paid') {
    return 'limpieza'
  }

  if (payload?.status === 'pagado') {
    return 'limpieza'
  }

  return payload?.status || 'pendiente'
}

function patchTableStatuses(previousTables, payload) {
  const tableName = payload?.table || payload?.order?.table

  if (!tableName) {
    return previousTables
  }

  const nextStatus = getRealtimeTableStatus(payload)
  const isAvailable = nextStatus === 'disponible'
  const nextEntry = {
    table: tableName,
    seccion: payload?.seccion || 'Sala',
    occupied: !isAvailable,
    orderId: isAvailable ? null : payload?.orderId || payload?.order?._id || null,
    status: nextStatus,
    cliente_nombre: isAvailable ? '' : payload?.cliente_nombre || payload?.order?.cliente_nombre || '',
  }

  const existingIndex = previousTables.findIndex((tableStatus) => tableStatus.table === tableName)

  if (existingIndex === -1) {
    return [...previousTables, nextEntry]
  }

  return previousTables.map((tableStatus, index) =>
    index === existingIndex
      ? {
          ...tableStatus,
          ...nextEntry,
          seccion: nextEntry.seccion || tableStatus.seccion,
        }
      : tableStatus,
  )
}

export function useRestoRealtime({
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
  onRemoteRelease,
  normalizeOrder,
  onMenuUpdated,
}) {
  const liveStateRef = useRef({
    currentOrder,
    isDirty,
    initialOrder,
    fetchTableStatuses,
    syncCurrentOrder,
    onRemoteRelease,
  })

  useEffect(() => {
    liveStateRef.current = {
      currentOrder,
      isDirty,
      initialOrder,
      fetchTableStatuses,
      syncCurrentOrder,
      onRemoteRelease,
    }
  }, [currentOrder, fetchTableStatuses, initialOrder, isDirty, onRemoteRelease, syncCurrentOrder])

  useEffect(() => {
    const socket = createRestoSocket(authToken)

    const handleSocketConnect = () => {
      setIsCajaConnected(true)
    }

    const handleSocketDisconnect = () => {
      setIsCajaConnected(false)
    }

    const handleRealtimePayload = async (payload) => {
      const liveState = liveStateRef.current

      setTableStatuses((previousTables) => patchTableStatuses(previousTables, payload))

      if (payload?.order) {
        const normalized = normalizeOrder(payload.order)

        if (payload.orderId === liveState.currentOrder?._id || normalized.table === liveState.currentOrder?.table) {
          if (payload.action === 'table_released') {
            liveState.onRemoteRelease?.(payload)
            setCurrentOrder(liveState.initialOrder)
            setEditableItems([])
          } else {
            setCurrentOrder(normalized)

            if (!liveState.isDirty) {
              setEditableItems(normalized.items)
            }
          }
        }
      }

      if (payload?.table) {
        const isCleaning = getRealtimeTableStatus(payload) === 'limpieza'
        const isAvailable = getRealtimeTableStatus(payload) === 'disponible'

        setFeedbackType(isCleaning ? 'success' : 'default')
        setFeedback(
          isAvailable
            ? `Mesa liberada en tiempo real: ${payload.table}`
            : isCleaning
              ? `Mesa en limpieza: ${payload.table}`
              : `Actualizacion en tiempo real: ${payload.table}`,
        )
      }

      await liveState.fetchTableStatuses(false)

      if (liveState.currentOrder?._id) {
        await liveState.syncCurrentOrder()
      }
    }

    socket.on('mesa_ocupada', handleRealtimePayload)
    socket.on('new_order', handleRealtimePayload)
    socket.on('orden_actualizada', handleRealtimePayload)
    socket.on('CAMBIO_ESTADO_MESA', handleRealtimePayload)
    socket.on('mesa_en_limpieza', handleRealtimePayload)
    socket.on('mesa_actualizada', handleRealtimePayload)
    socket.on('mesa_liberada', handleRealtimePayload)
    socket.on('connect', handleSocketConnect)
    socket.on('disconnect', handleSocketDisconnect)
    socket.on('menu_updated', onMenuUpdated)

    if (socket.connected) {
      setIsCajaConnected(true)
    }

    return () => {
      socket.off('mesa_ocupada', handleRealtimePayload)
      socket.off('new_order', handleRealtimePayload)
      socket.off('orden_actualizada', handleRealtimePayload)
      socket.off('CAMBIO_ESTADO_MESA', handleRealtimePayload)
      socket.off('mesa_en_limpieza', handleRealtimePayload)
      socket.off('mesa_actualizada', handleRealtimePayload)
      socket.off('mesa_liberada', handleRealtimePayload)
      socket.off('connect', handleSocketConnect)
      socket.off('disconnect', handleSocketDisconnect)
      socket.off('menu_updated', onMenuUpdated)
      socket.disconnect()
      setIsCajaConnected(false)
    }
  }, [
    authToken,
    normalizeOrder,
    setCurrentOrder,
    setEditableItems,
    setFeedback,
    setFeedbackType,
    setIsCajaConnected,
    setTableStatuses,
    onMenuUpdated,
  ])
}