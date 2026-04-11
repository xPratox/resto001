function normalizeMesa(rawMesa) {
  const text = String(rawMesa || '').trim();
  if (!text) return null;

  // Acepta formatos como: "Mesa 1", "mesa1", "M-01", "01", "1"
  const match = text.match(/\d+/);
  if (!match) return null;

  const numero = Number.parseInt(match[0], 10);
  if (!Number.isInteger(numero) || numero < 1 || numero > 5) return null;

  return `Mesa ${numero}`;
}

module.exports = normalizeMesa;
