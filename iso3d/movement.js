export function computeMoveRange(unit, allUnits, mapCols, mapRows, mapHeights) {
  // Simple Chebyshev distance implementation for movement
  const moveRange = new Set();
  const visited = new Set();
  const queue = [{ col: unit.x, row: unit.z, distance: 0 }];
  
  // Add the starting position to visited and moveRange
  const startKey = `${unit.x},${unit.z}`;
  visited.add(startKey);
  moveRange.add({ col: unit.x, row: unit.z });
  
  while (queue.length > 0) {
    const { col, row, distance } = queue.shift();
    
    // If we've reached the maximum movement range, skip
    if (distance >= unit.moveRange) continue;
    
    // Check all 8 adjacent tiles (including diagonals)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        // Skip the current tile
        if (dx === 0 && dy === 0) continue;
        
        const newCol = col + dx;
        const newRow = row + dy;
        const newKey = `${newCol},${newRow}`;
        
        // Check if the new position is within bounds
        if (newCol < 0 || newCol >= mapCols || newRow < 0 || newRow >= mapRows) continue;
        
        // Check if we've already visited this tile
        if (visited.has(newKey)) continue;
        
        // Check if another unit occupies this tile
        const isOccupied = allUnits.some(u => u !== unit && u.x === newCol && u.z === newRow);
        if (isOccupied) continue;
        
        // Check elevation difference
        const currentHeight = mapHeights[row * mapCols + col];
        const newHeight = mapHeights[newRow * mapCols + newCol];
        const heightDiff = Math.abs(newHeight - currentHeight);
        
        // If the height difference is greater than jumpHeight, skip
        if (heightDiff > unit.jumpHeight) continue;
        
        // Add to visited and moveRange
        visited.add(newKey);
        moveRange.add({ col: newCol, row: newRow });
        
        // Add to queue for further exploration
        queue.push({ col: newCol, row: newRow, distance: distance + 1 });
      }
    }
  }
  
  return moveRange;
}
