const mongoose = require('mongoose');

const exchangeRateSchema = new mongoose.Schema(
  {
    dayKey: { type: String, required: true, index: true, trim: true },
    rate: { type: Number, required: true, min: 0.0001 },
    assignedBy: { type: String, default: 'caja', trim: true },
    assignedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const pesoRateSchema = new mongoose.Schema(
  {
    dayKey: { type: String, required: true, unique: true, index: true, trim: true },
    rate: { type: Number, required: true, min: 0.0001 },
    assignedBy: { type: String, default: 'caja', trim: true },
    assignedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const DailyExchangeRate = mongoose.models.DailyExchangeRate || mongoose.model('DailyExchangeRate', exchangeRateSchema);
const DailyPesoRate = mongoose.models.DailyPesoRate || mongoose.model('DailyPesoRate', pesoRateSchema);

module.exports = {
  DailyExchangeRate,
  DailyPesoRate,
};
