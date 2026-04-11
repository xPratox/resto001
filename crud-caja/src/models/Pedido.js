const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema(
  {
    productoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', required: true },
    nombre: { type: String, required: true, trim: true },
    categoria: { type: String, required: true, trim: true },
    cantidad: { type: Number, required: true, min: 1 },
    precioUnitario: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const pedidoSchema = new mongoose.Schema(
  {
    mesa: { type: String, required: true, trim: true },
    items: {
      type: [itemSchema],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length > 0,
        message: 'El pedido debe tener al menos un item'
      }
    },
    total: { type: Number, required: true, min: 0 },
    estado: {
      type: String,
      enum: ['pagado', 'en_cocina', 'entregado'],
      default: 'pagado'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pedido', pedidoSchema);
