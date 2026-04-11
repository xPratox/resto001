const Pago = require('../models/Pago');

exports.getReporteVentas = async (_req, res, next) => {
  try {
    const pagos = await Pago.find().populate('pedidoId').sort({ createdAt: -1 });

    const data = pagos.map((pago) => ({
      pagoId: pago._id,
      mesa: pago.pedidoSnapshot?.mesa || pago.pedidoId?.mesa || 'Mesa no disponible',
      totalPedido: pago.pedidoSnapshot?.total ?? pago.pedidoId?.total ?? 0,
      metodoPago: pago.metodoPago,
      estadoPago: pago.estado,
      montoRecibido: pago.montoRecibido,
      cambio: pago.cambio,
      fecha: pago.createdAt,
      items: pago.pedidoSnapshot?.items || pago.pedidoId?.items || []
    }));

    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
};
