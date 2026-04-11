const express = require('express');
const pagoController = require('../controllers/pagoController');

const router = express.Router();

router.get('/', pagoController.getPagos);
router.get('/:id', pagoController.getPagoById);
router.post('/por-mesa', pagoController.createPagoPorMesa);
router.post('/', pagoController.createPago);
router.put('/:id', pagoController.updatePago);
router.delete('/:id', pagoController.deletePago);

module.exports = router;
