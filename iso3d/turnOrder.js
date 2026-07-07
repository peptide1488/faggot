/**
 * Compute turn order based on unit speed stats (round-robin sorted by speed)
 * @param {Array} units - Array of unit objects
 * @returns {Array} Ordered list of units for turns
 */
export function computeTurnOrder(units) {
  // Filter alive units and sort by speed (highest first)
  return units
    .filter(unit => unit.alive)
    .sort((a, b) => b.speed - a.speed);
}

/**
 * Turn Manager class to handle turn cycling
 */
export class TurnManager {
  constructor(units) {
    this.units = units;
    this.turnOrder = computeTurnOrder(units);
    this.currentIndex = 0;
  }

  /**
   * Get the current unit in turn
   * @returns {Object} Current unit or null if no alive units
   */
  currentUnit() {
    if (this.turnOrder.length === 0) return null;
    return this.turnOrder[this.currentIndex];
  }

  /**
   * Move to the next unit's turn
   * @returns {Object} Next unit or null if no alive units
   */
  nextTurn() {
    // Skip dead units
    do {
      this.currentIndex = (this.currentIndex + 1) % this.turnOrder.length;
    } while (!this.turnOrder[this.currentIndex].alive && 
             this.currentIndex !== 0);
    
    return this.currentUnit();
  }

  /**
   * Update turn order when units change
   */
  updateTurnOrder() {
    this.turnOrder = computeTurnOrder(this.units);
    this.currentIndex = 0;
  }
}
