const express = require('express');
const reporteController = require('../controllers/reporteController');

const router = express.Router();

router.get('/ventas', reporteController.getReporteVentas);

module.exports = router;
