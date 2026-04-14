const Pago = require('../models/Pago');
const Pedido = require('../models/Pedido');
const normalizeMesa = require('../utils/normalizeMesa');

function isValidEstadoPago(estado) {
  return ['confirmado', 'rechazado', 'completado'].includes(estado);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findPedidoPendienteByMesa(mesa) {
  const mesaNormalizada = normalizeMesa(mesa);
  if (!mesaNormalizada) {
    return { pedido: null, reason: 'INVALID_MESA' };
  }

  const pedidosMesa = await Pedido.find({
    mesa: new RegExp(`^${escapeRegex(mesaNormalizada)}$`, 'i'),
    estado: { $ne: 'entregado' }
  }).sort({ createdAt: -1 });

  if (pedidosMesa.length === 0) {
    return { pedido: null, reason: 'NO_PEDIDOS' };
  }

  for (const pedido of pedidosMesa) {
    const existePago = await Pago.exists({ pedidoId: pedido._id });
    if (!existePago) {
      return { pedido, reason: null };
    }
  }

  return { pedido: null, reason: 'YA_PAGADO' };
}

exports.createPago = async (req, res, next) => {
  try {
    const { pedidoId, mesa, metodoPago, montoRecibido, estado } = req.body;
    const mesaNormalizada = normalizeMesa(mesa);

    if ((!pedidoId && !mesaNormalizada) || !metodoPago || montoRecibido === undefined) {
      return res.status(400).json({
        message: 'Debes enviar pedidoId o mesa valida (Mesa 1 a Mesa 5), ademas de metodoPago y montoRecibido'
      });
    }

    if (estado && !isValidEstadoPago(estado)) {
      return res.status(400).json({ message: 'Estado de pago invalido' });
    }

    let pedido = null;
    let reason = null;

    if (pedidoId) {
      pedido = await Pedido.findById(pedidoId);
    } else {
      const result = await findPedidoPendienteByMesa(mesaNormalizada);
      pedido = result.pedido;
      reason = result.reason;
    }

    if (!pedido) {
      if (!pedidoId && reason === 'YA_PAGADO') {
        return res.status(400).json({
          message: `La ${mesaNormalizada} ya tiene sus pedidos abiertos pagados. Usa "Marcar entregado" o espera un nuevo pedido.`
        });
      }

      return res.status(404).json({
        message: 'No se encontro un pedido pendiente para esa mesa (Mesa 1 a Mesa 5)'
      });
    }

    const pedidoIdFinal = pedido._id;

    const pagoExistente = await Pago.findOne({ pedidoId: pedidoIdFinal });
    if (pagoExistente) {
      return res.status(400).json({
        message: 'Este pedido ya tiene un pago registrado'
      });
    }

    const cambio = Number(montoRecibido) - Number(pedido.total);

    if (cambio < 0) {
      return res.status(400).json({ message: 'Monto insuficiente para completar el pago' });
    }

    const pago = await Pago.create({
      pedidoId: pedidoIdFinal,
      metodoPago,
      montoRecibido,
      cambio,
      pedidoSnapshot: {
        mesa: pedido.mesa,
        total: pedido.total,
        items: pedido.items.map((item) => ({
          nombre: item.nombre,
          categoria: item.categoria,
          cantidad: item.cantidad,
          precioUnitario: item.precioUnitario
        }))
      },
      estado: estado || 'completado'
    });

    if (pago.estado === 'completado' || pago.estado === 'confirmado') {
      pedido.estado = 'limpieza';
      await pedido.save();
    }

    return res.status(201).json(pago);
  } catch (error) {
    return next(error);
  }
};

exports.createPagoPorMesa = async (req, res, next) => {
  req.body = { ...req.body, pedidoId: undefined };
  return exports.createPago(req, res, next);
};

exports.getPagos = async (_req, res, next) => {
  try {
    const pagos = await Pago.find().populate('pedidoId').sort({ createdAt: -1 });
    return res.status(200).json(pagos);
  } catch (error) {
    return next(error);
  }
};

exports.getPagoById = async (req, res, next) => {
  try {
    const pago = await Pago.findById(req.params.id).populate('pedidoId');

    if (!pago) {
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    return res.status(200).json(pago);
  } catch (error) {
    return next(error);
  }
};

exports.updatePago = async (req, res, next) => {
  try {
    const { metodoPago, montoRecibido, estado } = req.body;

    const pago = await Pago.findById(req.params.id);
    if (!pago) {
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    if (estado && !isValidEstadoPago(estado)) {
      return res.status(400).json({ message: 'Estado de pago invalido' });
    }

    if (metodoPago) pago.metodoPago = metodoPago;
    if (estado) pago.estado = estado;

    if (montoRecibido !== undefined) {
      const pedido = await Pedido.findById(pago.pedidoId);
      pago.montoRecibido = montoRecibido;
      pago.cambio = Number(montoRecibido) - Number(pedido.total);

      if (pago.cambio < 0) {
        return res.status(400).json({ message: 'Monto insuficiente para completar el pago' });
      }
    }

    await pago.save();

    if (pago.estado === 'completado' || pago.estado === 'confirmado') {
      await Pedido.findByIdAndUpdate(pago.pedidoId, { estado: 'limpieza' });
    }

    return res.status(200).json(pago);
  } catch (error) {
    return next(error);
  }
};

exports.deletePago = async (req, res, next) => {
  try {
    const deleted = await Pago.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Pago no encontrado' });
    }

    return res.status(200).json({ message: 'Pago eliminado correctamente' });
  } catch (error) {
    return next(error);
  }
};
