/**
 * Poisson Disk Sampling for Even Distribution
 * 
 * Generates points with minimum distance constraint,
 * producing blue-noise distribution without grid artifacts.
 */

/**
 * Bridson's algorithm for Poisson disk sampling
 * 
 * @param {number} width - Domain width
 * @param {number} height - Domain height
 * @param {number} minDistance - Minimum distance between points
 * @param {function} rng - Random number generator (0-1)
 * @param {number} maxAttempts - Maximum attempts per point (default 30)
 * @param {function} suitabilityMask - Optional (x, y) => boolean function
 * @returns {Array<{x, y}>} Array of sample points
 */
export function poissonDiskSampling(width, height, minDistance, rng, maxAttempts = 30, suitabilityMask = null) {
    const cellSize = minDistance / Math.SQRT2;
    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    
    // Background grid for fast spatial lookup
    const grid = new Array(gridWidth * gridHeight).fill(null);
    
    const samples = [];
    const active = [];
    
    /**
     * Get grid index for coordinates
     */
    function gridIndex(x, y) {
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);
        if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return -1;
        return gy * gridWidth + gx;
    }
    
    /**
     * Check if point is valid (not too close to existing points)
     */
    function isValid(x, y) {
        // Check bounds
        if (x < 0 || x >= width || y < 0 || y >= height) return false;
        
        // Check suitability mask if provided
        if (suitabilityMask && !suitabilityMask(x, y)) return false;
        
        // Check neighborhood in grid
        const gx = Math.floor(x / cellSize);
        const gy = Math.floor(y / cellSize);
        
        // Check 5x5 neighborhood (sufficient for minDistance check)
        for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
                const nx = gx + dx;
                const ny = gy + dy;
                if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
                
                const neighborIndex = ny * gridWidth + nx;
                const neighbor = grid[neighborIndex];
                
                if (neighbor !== null) {
                    const dist = Math.sqrt(
                        (x - neighbor.x) ** 2 + (y - neighbor.y) ** 2
                    );
                    if (dist < minDistance) return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Add point to samples and grid
     */
    function addPoint(x, y) {
        const point = { x, y };
        samples.push(point);
        active.push(point);
        
        const idx = gridIndex(x, y);
        if (idx >= 0) {
            grid[idx] = point;
        }
    }
    
    // Start with random initial point (or center if suitability mask is very restrictive)
    let initialX, initialY;
    let attempts = 0;
    do {
        initialX = rng() * width;
        initialY = rng() * height;
        attempts++;
        
        // Fallback to center if mask is too restrictive
        if (attempts > 100) {
            initialX = width / 2;
            initialY = height / 2;
            if (suitabilityMask && !suitabilityMask(initialX, initialY)) {
                // No suitable area found - return empty
                return [];
            }
            break;
        }
    } while (suitabilityMask && !suitabilityMask(initialX, initialY));
    
    addPoint(initialX, initialY);
    
    // Process active list
    while (active.length > 0) {
        // Pick random active point
        const index = Math.floor(rng() * active.length);
        const point = active[index];
        
        let found = false;
        
        // Try to generate new points around it
        for (let i = 0; i < maxAttempts; i++) {
            // Generate random point in annulus between minDistance and 2*minDistance
            const angle = rng() * Math.PI * 2;
            const radius = minDistance + rng() * minDistance;
            
            const newX = point.x + Math.cos(angle) * radius;
            const newY = point.y + Math.sin(angle) * radius;
            
            if (isValid(newX, newY)) {
                addPoint(newX, newY);
                found = true;
            }
        }
        
        // Remove from active if no valid points found
        if (!found) {
            active.splice(index, 1);
        }
    }
    
    return samples;
}

/**
 * Stratified Poisson sampling - divide domain into strata and sample each
 * Useful for ensuring more even coverage across the entire domain
 * 
 * @param {number} width 
 * @param {number} height 
 * @param {number} minDistance 
 * @param {function} rng 
 * @param {number} strataCount - Number of strata per dimension (e.g., 3 = 3x3 grid)
 * @param {function} suitabilityMask
 * @returns {Array<{x, y}>}
 */
export function stratifiedPoissonSampling(
    width, 
    height, 
    minDistance, 
    rng, 
    strataCount = 3,
    suitabilityMask = null
) {
    const strataWidth = width / strataCount;
    const strataHeight = height / strataCount;
    const allSamples = [];
    
    // Sample each stratum independently
    for (let sy = 0; sy < strataCount; sy++) {
        for (let sx = 0; sx < strataCount; sx++) {
            const offsetX = sx * strataWidth;
            const offsetY = sy * strataHeight;
            
            // Create local suitability mask for this stratum
            const localMask = suitabilityMask ? 
                (x, y) => suitabilityMask(x + offsetX, y + offsetY) : 
                null;
            
            // Sample within this stratum
            const samples = poissonDiskSampling(
                strataWidth,
                strataHeight,
                minDistance,
                rng,
                30,
                localMask
            );
            
            // Offset samples to global coordinates
            for (const sample of samples) {
                allSamples.push({
                    x: sample.x + offsetX,
                    y: sample.y + offsetY
                });
            }
        }
    }
    
    return allSamples;
}

/**
 * Get N best samples from Poisson distribution based on scoring function
 * 
 * @param {Array<{x, y}>} samples - Input samples
 * @param {number} targetCount - Desired number of samples
 * @param {function} scoreFn - (x, y, index) => number (higher = better)
 * @param {function} rng - For tie-breaking
 * @returns {Array<{x, y}>} Top N samples
 */
export function selectBestSamples(samples, targetCount, scoreFn, rng) {
    if (samples.length <= targetCount) return samples;
    
    // Score each sample
    const scored = samples.map((sample, index) => ({
        ...sample,
        score: scoreFn(sample.x, sample.y, index),
        tieBreaker: rng() // Deterministic tie-breaking
    }));
    
    // Sort by score (descending), then tie-breaker
    scored.sort((a, b) => {
        if (Math.abs(a.score - b.score) < 0.0001) {
            return a.tieBreaker - b.tieBreaker;
        }
        return b.score - a.score;
    });
    
    // Take top N
    return scored.slice(0, targetCount).map(({ x, y }) => ({ x, y }));
}

/**
 * Validate Poisson distribution properties
 */
export function validatePoissonDistribution(samples, minDistance, width, height) {
    let minObservedDist = Infinity;
    let violations = 0;
    
    for (let i = 0; i < samples.length; i++) {
        for (let j = i + 1; j < samples.length; j++) {
            const dx = samples[i].x - samples[j].x;
            const dy = samples[i].y - samples[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist < minObservedDist) {
                minObservedDist = dist;
            }
            
            if (dist < minDistance - 0.001) { // Small tolerance for floating point
                violations++;
            }
        }
    }
    
    const density = samples.length / (width * height);
    const theoreticalMax = 1 / (Math.PI * (minDistance / 2) ** 2);
    
    return {
        count: samples.length,
        minObservedDist,
        violations,
        density,
        theoreticalMaxDensity: theoreticalMax,
        efficiency: density / theoreticalMax
    };
}

