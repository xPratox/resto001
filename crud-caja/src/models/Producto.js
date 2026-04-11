const mongoose = require('mongoose');

const productoSchema = new mongoose.Schema(
  {
    codigo: { type: String, trim: true, unique: true, sparse: true },
    nombre: { type: String, required: true, trim: true },
    categoria: { type: String, required: true, trim: true },
    precio: { type: Number, required: true, min: 0 },
    controlStock: { type: Boolean, default: false },
    stock: { type: Number, min: 0, default: 0 },
    activo: { type: Boolean, default: true }
  },
  { timestamps: true }
);

productoSchema.index({ nombre: 1, categoria: 1 }, { unique: true });

module.exports = mongoose.model('Producto', productoSchema);
