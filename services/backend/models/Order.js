const mongoose = require('mongoose');

const ORDER_STATUS = {
  AVAILABLE: 'disponible',
  PENDING: 'pendiente',
  KITCHEN: 'en_cocina',
  DELIVERED: 'entregado',
  CLEANING: 'limpieza',
  PAID: 'pagado',
};

const TABLE_DEFINITIONS = [
  { table: 'Mesa 1', section: 'Sala', capacity: 4, highlighted: false },
  { table: 'Mesa 2', section: 'Sala', capacity: 4, highlighted: false },
  { table: 'Mesa 3', section: 'Sala', capacity: 4, highlighted: false },
  { table: 'Mesa 4', section: 'Sala', capacity: 4, highlighted: false },
  { table: 'Mesa 5', section: 'Sala', capacity: 4, highlighted: false },
  { table: 'Mesa 6', section: 'Sala', capacity: 4, highlighted: false },
  { table: 'Mesa 7', section: 'Sala', capacity: 8, highlighted: true },
  { table: 'Mesa 8', section: 'Terraza', capacity: 4, highlighted: false },
  { table: 'Mesa 9', section: 'Terraza', capacity: 4, highlighted: false },
  { table: 'Mesa 10', section: 'Terraza', capacity: 4, highlighted: false },
  { table: 'Mesa 11', section: 'Terraza', capacity: 4, highlighted: false },
];

const TABLES = TABLE_DEFINITIONS.map((table) => table.table);
const LEGACY_MENU_NAMES = ['Hamburguesa Clasica', 'Perro Caliente', 'Club House', 'Pizza Margarita'];
const KITCHEN_COMANDA_LIMIT = 50;

const orderSchema = new mongoose.Schema(
  {
    table: { type: String, required: true, trim: true },
    cliente_nombre: { type: String, default: '', trim: true },
    mesonero_usuario: { type: String, default: '', trim: true, lowercase: true },
    seccion: { type: String, enum: ['Sala', 'Terraza'], required: true, default: 'Sala', trim: true },
    items: [
      {
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        note: { type: String, default: 'Sin notas', trim: true },
        notas: { type: String, default: 'Sin notas', trim: true },
      },
    ],
    total: { type: Number, required: true, min: 0 },
    montoPagado: { type: Number, default: 0, min: 0 },
    historialPagos: [
      {
        monto: { type: Number, required: true, min: 0 },
        metodo: { type: String, required: true, trim: true },
        fecha: { type: Date, required: true, default: Date.now },
      },
    ],
    status: {
      type: String,
      enum: [ORDER_STATUS.PENDING, ORDER_STATUS.KITCHEN, ORDER_STATUS.DELIVERED, ORDER_STATUS.CLEANING, ORDER_STATUS.PAID],
      default: ORDER_STATUS.KITCHEN,
      trim: true,
    },
    preparedAt: { type: Date, default: null },
    comanda_impresa_at: { type: Date, default: null },
    hora_pago: { type: Date, default: null },
    mesa_liberada: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = {
  Order,
  ORDER_STATUS,
  TABLE_DEFINITIONS,
  TABLES,
  LEGACY_MENU_NAMES,
  KITCHEN_COMANDA_LIMIT,
};
