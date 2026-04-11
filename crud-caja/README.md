# CRUD Caja API

Backend base para el modulo **Caja** usando Node.js, Express y MongoDB.

## Estados definidos

- Estado de pedido: `pagado`, `en_cocina`, `entregado`
- Estado de pago: `confirmado`, `rechazado`, `completado`

## Requisitos

- Node.js 18+
- MongoDB local o remoto

## Instalacion

```bash
npm install
```

Crea tu `.env` usando el ejemplo:

```bash
cp .env.example .env
```

Si usas PowerShell en Windows:

```powershell
Copy-Item .env.example .env
```

## Ejecutar

```bash
npm run dev
```

API base: `http://localhost:4000`

## Endpoints

### Health

- `GET /health`

### Pedidos

- `POST /api/pedidos`
- `POST /api/pedidos/demo/cargar`
- `GET /api/pedidos`
- `GET /api/pedidos/:id`
- `PUT /api/pedidos/:id`
- `PATCH /api/pedidos/:id/estado`
- `PATCH /api/pedidos/:id/enviar-cocina`
- `PATCH /api/pedidos/:id/entregar`
- `DELETE /api/pedidos/:id`

Nota: los `items` del pedido ahora se validan contra el catalogo de productos por `productoId` o por `nombre`.

### Productos (catalogo e inventario)

- `POST /api/productos`
- `GET /api/productos`
- `GET /api/productos/categorias`
- `GET /api/productos/:id`
- `PUT /api/productos/:id`
- `PATCH /api/productos/:id/stock`
- `DELETE /api/productos/:id`

### Pagos

- `POST /api/pagos/por-mesa`
- `POST /api/pagos`
- `GET /api/pagos`
- `GET /api/pagos/:id`
- `PUT /api/pagos/:id`
- `DELETE /api/pagos/:id`

## Ejemplos JSON

### Crear pedido

```json
{
  "mesa": "M-08",
  "items": [
    {
      "productoId": "ID_PRODUCTO_LOMO",
      "cantidad": 2
    },
    {
      "nombre": "Inca Kola",
      "cantidad": 2
    }
  ]
}
```

### Crear producto

```json
{
  "codigo": "nestea",
  "nombre": "Nestea",
  "categoria": "Bebidas",
  "precio": 2.5,
  "controlStock": true,
  "stock": 35,
  "activo": true
}
```

### Crear pago

```json
{
  "pedidoId": "ID_DEL_PEDIDO",
  "metodoPago": "efectivo",
  "montoRecibido": 50,
  "estado": "completado"
}
```

### Crear pago por mesa (sin usar ID)

```json
{
  "mesa": "Mesa 1",
  "metodoPago": "efectivo",
  "montoRecibido": 50,
  "estado": "completado"
}
```
