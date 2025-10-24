/**
 * Slope Calculation for Terrain Analysis
 * 
 * Calculates slopes, aspects, and other terrain derivatives
 * for use in tree placement and biome classification.
 */

/**
 * Calculate slope at each cell (in degrees)
 * Uses central difference method for interior cells
 * 
 * @param {Float32Array} elevationData - Height field in meters
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {number} cellSize - Size of each cell in meters (default 1.0)
 * @returns {Float32Array} Slope in degrees for each cell
 */
export function calculateSlopes(elevationData, width, height, cellSize = 1.0) {
    const slopes = new Float32Array(width * height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            // Get neighboring heights (with boundary handling)
            const hc = elevationData[idx];
            const hLeft = x > 0 ? elevationData[idx - 1] : hc;
            const hRight = x < width - 1 ? elevationData[idx + 1] : hc;
            const hUp = y > 0 ? elevationData[idx - width] : hc;
            const hDown = y < height - 1 ? elevationData[idx + width] : hc;
            
            // Central difference
            const dzdx = (hRight - hLeft) / (2 * cellSize);
            const dzdy = (hDown - hUp) / (2 * cellSize);
            
            // Calculate slope magnitude
            const slopeMagnitude = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
            
            // Convert to degrees
            slopes[idx] = Math.atan(slopeMagnitude) * (180 / Math.PI);
        }
    }
    
    return slopes;
}

/**
 * Calculate aspect (direction of slope) at each cell
 * Returns angle in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 * 
 * @param {Float32Array} elevationData 
 * @param {number} width 
 * @param {number} height 
 * @param {number} cellSize
 * @returns {Float32Array} Aspect in degrees (0-360) for each cell
 */
export function calculateAspects(elevationData, width, height, cellSize = 1.0) {
    const aspects = new Float32Array(width * height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            
            const hc = elevationData[idx];
            const hLeft = x > 0 ? elevationData[idx - 1] : hc;
            const hRight = x < width - 1 ? elevationData[idx + 1] : hc;
            const hUp = y > 0 ? elevationData[idx - width] : hc;
            const hDown = y < height - 1 ? elevationData[idx + width] : hc;
            
            const dzdx = (hRight - hLeft) / (2 * cellSize);
            const dzdy = (hDown - hUp) / (2 * cellSize);
            
            // Calculate aspect (atan2 gives angle of steepest descent)
            let aspect = Math.atan2(dzdy, dzdx) * (180 / Math.PI);
            
            // Convert to compass bearing (0 = North)
            aspect = 90 - aspect;
            if (aspect < 0) aspect += 360;
            
            // Flat areas have no meaningful aspect
            const slope = Math.sqrt(dzdx * dzdx + dzdy * dzdy);
            if (slope < 0.001) aspect = -1; // Mark as flat
            
            aspects[idx] = aspect;
        }
    }
    
    return aspects;
}

/**
 * Create suitability mask for tree placement
 * 
 * @param {Float32Array} elevationData - Heights in meters
 * @param {Float32Array} slopes - Slopes in degrees  
 * @param {number} width 
 * @param {number} height 
 * @param {number} seaLevel - Sea level in meters
 * @param {Object} constraints - { minHeight, maxHeight, maxSlope, beachBuffer }
 * @returns {Uint8Array} Binary mask (1 = suitable, 0 = unsuitable)
 */
export function createTreeSuitabilityMask(
    elevationData,
    slopes,
    width,
    height,
    seaLevel,
    constraints = {}
) {
    const {
        minHeight = seaLevel + 2.0,  // Above beach
        maxHeight = 60.0,             // Below alpine/snow
        maxSlope = 35.0,              // Maximum slope in degrees
        beachBuffer = 2.0             // Extra buffer above sea level
    } = constraints;
    
    const mask = new Uint8Array(width * height);
    
    for (let i = 0; i < mask.length; i++) {
        const height = elevationData[i];
        const slope = slopes[i];
        
        // Check all constraints
        const aboveWater = height > seaLevel + beachBuffer;
        const belowAlpine = height < maxHeight;
        const notTooSteep = slope < maxSlope;
        
        mask[i] = (aboveWater && belowAlpine && notTooSteep) ? 1 : 0;
    }
    
    return mask;
}

/**
 * Calculate suitable area (in cells and percentage)
 */
export function calculateSuitableArea(mask) {
    let suitableCells = 0;
    for (let i = 0; i < mask.length; i++) {
        if (mask[i]) suitableCells++;
    }
    
    return {
        suitableCells,
        totalCells: mask.length,
        percentage: (suitableCells / mask.length) * 100
    };
}

/**
 * Create a function to test suitability at continuous coordinates
 * (for use with Poisson sampling)
 * 
 * @param {Uint8Array} mask 
 * @param {number} width 
 * @param {number} height 
 * @returns {function} (x, y) => boolean
 */
export function createSuitabilityFunction(mask, width, height) {
    return (x, y) => {
        // Convert continuous coordinates to grid indices
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        
        // Check bounds
        if (gx < 0 || gx >= width || gy < 0 || gy >= height) return false;
        
        const idx = gy * width + gx;
        return mask[idx] === 1;
    };
}

/**
 * Calculate curvature (second derivative) for more advanced analysis
 * Positive = convex (hill), Negative = concave (valley)
 */
export function calculateCurvature(elevationData, width, height, cellSize = 1.0) {
    const curvature = new Float32Array(width * height);
    
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            
            // 3x3 neighborhood
            const hc = elevationData[idx];
            const hLeft = elevationData[idx - 1];
            const hRight = elevationData[idx + 1];
            const hUp = elevationData[idx - width];
            const hDown = elevationData[idx + width];
            
            // Second derivatives
            const d2zdx2 = (hRight - 2 * hc + hLeft) / (cellSize * cellSize);
            const d2zdy2 = (hDown - 2 * hc + hUp) / (cellSize * cellSize);
            
            // Mean curvature (Laplacian)
            curvature[idx] = d2zdx2 + d2zdy2;
        }
    }
    
    return curvature;
}

/**
 * Find flat areas suitable for buildings/settlements
 */
export function findFlatAreas(slopes, width, height, maxSlope = 5.0, minAreaSize = 9) {
    const flatMask = new Uint8Array(width * height);
    
    // Mark flat cells
    for (let i = 0; i < slopes.length; i++) {
        flatMask[i] = slopes[i] < maxSlope ? 1 : 0;
    }
    
    // Connected component analysis to find contiguous flat regions
    const regions = [];
    const visited = new Uint8Array(width * height);
    
    function floodFill(startIdx) {
        const stack = [startIdx];
        const region = [];
        
        while (stack.length > 0) {
            const idx = stack.pop();
            if (visited[idx] || !flatMask[idx]) continue;
            
            visited[idx] = 1;
            region.push(idx);
            
            const x = idx % width;
            const y = Math.floor(idx / width);
            
            // Check 4-connected neighbors
            if (x > 0) stack.push(idx - 1);
            if (x < width - 1) stack.push(idx + 1);
            if (y > 0) stack.push(idx - width);
            if (y < height - 1) stack.push(idx + width);
        }
        
        return region;
    }
    
    for (let i = 0; i < flatMask.length; i++) {
        if (flatMask[i] && !visited[i]) {
            const region = floodFill(i);
            if (region.length >= minAreaSize) {
                regions.push(region);
            }
        }
    }
    
    return regions;
}

/**
 * Calculate terrain statistics
 */
export function calculateSlopeStatistics(slopes) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    
    const histogram = new Array(91).fill(0); // 0-90 degrees
    
    for (let i = 0; i < slopes.length; i++) {
        const slope = slopes[i];
        min = Math.min(min, slope);
        max = Math.max(max, slope);
        sum += slope;
        count++;
        
        const bin = Math.min(90, Math.floor(slope));
        histogram[bin]++;
    }
    
    const mean = sum / count;
    
    return {
        min,
        max,
        mean,
        histogram
    };
}

