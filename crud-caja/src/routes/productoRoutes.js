const express = require('express');
const productoController = require('../controllers/productoController');

const router = express.Router();

router.get('/', productoController.getProductos);
router.get('/categorias', productoController.getCategorias);
router.get('/:id', productoController.getProductoById);
router.post('/', productoController.createProducto);
router.put('/:id', productoController.updateProducto);
router.patch('/:id/stock', productoController.updateStock);
router.delete('/:id', productoController.deleteProducto);

module.exports = router;
