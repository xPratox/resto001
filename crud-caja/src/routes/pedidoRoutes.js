const express = require('express');
const pedidoController = require('../controllers/pedidoController');

const router = express.Router();

router.post('/demo/cargar', pedidoController.cargarPedidosDemo);
router.get('/', pedidoController.getPedidos);
router.get('/:id', pedidoController.getPedidoById);
router.post('/', pedidoController.createPedido);
router.put('/:id', pedidoController.updatePedido);
router.patch('/:id/estado', pedidoController.updateEstadoPedido);
router.patch('/:id/enviar-cocina', pedidoController.enviarACocina);
router.patch('/:id/entregar', pedidoController.marcarEntregado);
router.delete('/:id', pedidoController.deletePedido);

module.exports = router;
