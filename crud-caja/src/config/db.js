const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('Falta configurar MONGODB_URI en variables de entorno');
  }

  await mongoose.connect(uri);
  console.log('MongoDB conectado');
}

module.exports = connectDB;
