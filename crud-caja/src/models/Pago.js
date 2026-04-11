const mongoose = require('mongoose');

const snapshotItemSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    categoria: { type: String, trim: true },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const pagoSchema = new mongoose.Schema(
  {
    pedidoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pedido',
      required: true,
      unique: true
    },
    metodoPago: {
      type: String,
      enum: ['efectivo', 'tarjeta', 'transferencia', 'yape', 'plin', 'binance', 'otro'],
      required: true
    },
    montoRecibido: { type: Number, required: true, min: 0 },
    cambio: { type: Number, required: true, min: 0 },
    pedidoSnapshot: {
      mesa: { type: String, required: true, trim: true },
      total: { type: Number, required: true, min: 0 },
      items: { type: [snapshotItemSchema], default: [] }
    },
    estado: {
      type: String,
      enum: ['confirmado', 'rechazado', 'completado'],
      default: 'confirmado'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pago', pagoSchema);
