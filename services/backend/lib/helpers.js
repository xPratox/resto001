const mongoose = require('mongoose');

function buildDisplayName(value) {
  return String(value || '')
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function roundCurrency(value) {
  return Number(Number(value || 0).toFixed(2));
}

function parseCurrency(value) {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? roundCurrency(parsed) : NaN;
}

function computeOrderTotal(items) {
  return items.reduce((sum, item) => sum + Number(item.price || 0), 0);
}

function normalizeOrderItem(item) {
  const normalizedNote =
    (typeof item.note === 'string' && item.note.trim()) ||
    (typeof item.notas === 'string' && item.notas.trim()) ||
    (typeof item.observaciones === 'string' && item.observaciones.trim()) ||
    'Sin notas';

  return {
    _id:
      item._id && mongoose.Types.ObjectId.isValid(item._id)
        ? item._id
        : new mongoose.Types.ObjectId(),
    name: item.name,
    price: Number(item.price || 0),
    note: normalizedNote,
    notas: normalizedNote,
  };
}

function hasRemovedItems(currentItems, nextItems) {
  const nextItemIds = new Set(
    nextItems
      .filter((item) => item._id)
      .map((item) => String(item._id))
  );

  return currentItems.some((item) => !nextItemIds.has(String(item._id)));
}

function normalizePaymentMethod(method) {
  const normalized = String(method || 'efectivo').trim().toLowerCase();

  if (!normalized) {
    return 'efectivo';
  }

  return normalized;
}

function getHistoryDateKey(date, timezone = 'America/Caracas') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

module.exports = {
  buildDisplayName,
  roundCurrency,
  parseCurrency,
  computeOrderTotal,
  normalizeOrderItem,
  hasRemovedItems,
  normalizePaymentMethod,
  getHistoryDateKey,
};
