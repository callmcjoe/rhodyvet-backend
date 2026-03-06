// Feed unit conversions
// Base unit: 1 Paint
// 1 Bag = 8 Paints
// 1/2 Bag = 4 Paints
// 1/3 Bag = 2.67 Paints (rounded to 2.67)
// 1 Paint = 1 Paint
// 1/2 Paint = 0.5 Paints

const PAINTS_PER_BAG = 8;
const PAINTS_PER_HALF_BAG = 4;
const PAINTS_PER_THIRD_BAG = 8 / 3; // ~2.67
const PAINTS_PER_PAINT = 1;
const PAINTS_PER_HALF_PAINT = 0.5;

// Convert various units to paints equivalent
const convertToPaints = (quantities) => {
  const {
    quantityBags = 0,
    quantityHalfBags = 0,
    quantityThirdBags = 0,
    quantityPaints = 0,
    quantityHalfPaints = 0
  } = quantities;

  const totalPaints =
    (quantityBags * PAINTS_PER_BAG) +
    (quantityHalfBags * PAINTS_PER_HALF_BAG) +
    (quantityThirdBags * PAINTS_PER_THIRD_BAG) +
    (quantityPaints * PAINTS_PER_PAINT) +
    (quantityHalfPaints * PAINTS_PER_HALF_PAINT);

  return totalPaints;
};

// Convert paints to display format (bags + remaining paints)
const paintsToDisplay = (paints) => {
  const bags = Math.floor(paints / PAINTS_PER_BAG);
  const remainingPaints = paints % PAINTS_PER_BAG;

  return {
    bags,
    paints: remainingPaints,
    totalPaints: paints
  };
};

// Calculate total price for feed items
const calculateFeedItemPrice = (quantities, product) => {
  const {
    quantityBags = 0,
    quantityHalfBags = 0,
    quantityThirdBags = 0,
    quantityPaints = 0,
    quantityHalfPaints = 0
  } = quantities;

  const totalPrice =
    (quantityBags * (product.pricePerBag || 0)) +
    (quantityHalfBags * (product.pricePerHalfBag || 0)) +
    (quantityThirdBags * (product.pricePerThirdBag || 0)) +
    (quantityPaints * (product.pricePerPaint || 0)) +
    (quantityHalfPaints * (product.pricePerHalfPaint || 0));

  return totalPrice;
};

// Format stock for display
const formatStockDisplay = (product) => {
  if (product.unitType === 'bag') {
    const display = paintsToDisplay(product.stockInPaints);
    if (display.bags > 0 && display.paints > 0) {
      return `${display.bags} ${display.bags === 1 ? 'bag' : 'bags'} and ${display.paints} ${display.paints === 1 ? 'paint' : 'paints'}`;
    } else if (display.bags > 0) {
      return `${display.bags} ${display.bags === 1 ? 'bag' : 'bags'}`;
    } else {
      return `${display.paints} ${display.paints === 1 ? 'paint' : 'paints'}`;
    }
  }

  // For store products with stock unit conversion
  if (product.stockUnit && product.stockUnitEquivalent && product.stockUnitEquivalent > 0) {
    const stockInBaseUnits = product.stockInQuantity;
    const stockUnitQty = Math.floor(stockInBaseUnits / product.stockUnitEquivalent);
    const remainingBaseUnits = stockInBaseUnits % product.stockUnitEquivalent;

    const stockUnitLabel = product.stockUnit || 'unit';
    const baseUnitLabel = product.baseUnit || 'unit';

    if (stockUnitQty > 0 && remainingBaseUnits > 0) {
      return `${stockUnitQty} ${stockUnitLabel}${stockUnitQty !== 1 ? 's' : ''} and ${remainingBaseUnits} ${baseUnitLabel}`;
    } else if (stockUnitQty > 0) {
      return `${stockUnitQty} ${stockUnitLabel}${stockUnitQty !== 1 ? 's' : ''}`;
    } else {
      return `${remainingBaseUnits} ${baseUnitLabel}`;
    }
  }

  // Fallback: show stock with base unit
  const baseUnit = product.baseUnit || 'unit';
  const qty = product.stockInQuantity;
  return `${qty} ${baseUnit}${qty !== 1 ? 's' : ''}`;
};

module.exports = {
  PAINTS_PER_BAG,
  PAINTS_PER_HALF_BAG,
  PAINTS_PER_THIRD_BAG,
  PAINTS_PER_PAINT,
  PAINTS_PER_HALF_PAINT,
  convertToPaints,
  paintsToDisplay,
  calculateFeedItemPrice,
  formatStockDisplay
};
