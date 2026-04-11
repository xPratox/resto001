const express = require('express');
const pedidoRoutes = require('./pedidoRoutes');
const pagoRoutes = require('./pagoRoutes');
const productoRoutes = require('./productoRoutes');
const reporteRoutes = require('./reporteRoutes');

const router = express.Router();

router.use('/pedidos', pedidoRoutes);
router.use('/pagos', pagoRoutes);
router.use('/productos', productoRoutes);
router.use('/reportes', reporteRoutes);

module.exports = router;
