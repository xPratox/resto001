import { useEffect, useState } from 'react';
import { restoSocket } from '../lib/socket';

function normalizePedido(payload) {
  if (!payload) return null;

  const idPedido = payload.idPedido || payload._id || payload.orderId;
  const numeroMesa = payload.numeroMesa || payload.table || payload.mesa;
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!idPedido) return null;

  return {
    idPedido: String(idPedido),
    numeroMesa: numeroMesa ? String(numeroMesa) : '',
    items: items.map((item) => ({
      nombre: String(item?.nombre || item?.name || '').trim(),
      cantidad: Number(item?.cantidad || item?.quantity || 0),
      notas: typeof item?.notas === 'string' ? item.notas : typeof item?.note === 'string' ? item.note : '',
    })),
    payload,
  };
}

export function usePedidos(authToken) {
  const [pedidos, setPedidos] = useState([]);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = restoSocket;

    const handleNuevoPedido = (payload) => {
      const nuevoPedido = normalizePedido(payload);
      if (!nuevoPedido) return;

      setPedidos((prevPedidos) => {
        const existingIndex = prevPedidos.findIndex((pedido) => pedido.idPedido === nuevoPedido.idPedido);
        if (existingIndex === -1) {
          return [...prevPedidos, nuevoPedido];
        }

        const nextPedidos = [...prevPedidos];
        nextPedidos[existingIndex] = nuevoPedido;
        return nextPedidos;
      });

      setError(null);
    };

    const handleConnect = () => {
      setConnected(true);
      setError(null);
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleConnectError = (err) => {
      setError(err?.message || 'Error al conectar con el servidor de pedidos.');
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('nuevo_pedido', handleNuevoPedido);
    socket.on('PEDIDO_COCINA', handleNuevoPedido);
    socket.on('kitchen_order_upsert', handleNuevoPedido);

    if (!socket.connected) {
      socket.auth = {
        token: authToken || '',
      };
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('nuevo_pedido', handleNuevoPedido);
      socket.off('PEDIDO_COCINA', handleNuevoPedido);
      socket.off('kitchen_order_upsert', handleNuevoPedido);
    };
  }, [authToken]);

  return {
    pedidos,
    error,
    connected,
  };
}
