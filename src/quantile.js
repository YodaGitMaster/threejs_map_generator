/**
 * Quantile Solver for Exact Water Coverage
 * 
 * Determines sea level such that exactly the requested percentage
 * of terrain is below water.
 */

/**
 * Find the quantile value in a dataset
 * @param {Float32Array|Array} data - Height values
 * @param {number} quantile - Target quantile (0-1), e.g., 0.25 for 25th percentile
 * @returns {number} The height value at the given quantile
 */
export function findQuantile(data, quantile) {
    if (quantile < 0 || quantile > 1) {
        throw new Error(`Quantile must be between 0 and 1, got ${quantile}`);
    }
    
    if (data.length === 0) return 0;
    
    // Create sorted copy
    const sorted = Array.from(data).sort((a, b) => a - b);
    
    // Handle edge cases
    if (quantile === 0) return sorted[0];
    if (quantile === 1) return sorted[sorted.length - 1];
    
    // Linear interpolation between array positions
    const position = quantile * (sorted.length - 1);
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const weight = position - lower;
    
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Solve for sea level that gives exact water coverage
 * 
 * @param {Float32Array} elevationData - Height field (in meters)
 * @param {number} targetWaterPercentage - Desired water coverage (0-100)
 * @param {number} epsilon - Minimum height above sea level for 0% water (default 0.01m)
 * @returns {Object} { seaLevel, actualPercentage, cellsBelowSeaLevel, raised }
 */
export function solveSeaLevel(elevationData, targetWaterPercentage, epsilon = 0.01) {
    const totalCells = elevationData.length;
    
    // Handle 0% water case - raise all terrain above current minimum
    if (targetWaterPercentage === 0) {
        const minHeight = Math.min(...elevationData);
        const seaLevel = minHeight - epsilon;
        
        // Count how many cells we need to raise
        let raised = 0;
        for (let i = 0; i < elevationData.length; i++) {
            if (elevationData[i] < minHeight + epsilon) {
                elevationData[i] = minHeight + epsilon;
                raised++;
            }
        }
        
        return {
            seaLevel,
            actualPercentage: 0,
            cellsBelowSeaLevel: 0,
            raised,
            method: '0%_raise'
        };
    }
    
    // Handle 100% water case
    if (targetWaterPercentage >= 100) {
        const maxHeight = Math.max(...elevationData);
        return {
            seaLevel: maxHeight + epsilon,
            actualPercentage: 100,
            cellsBelowSeaLevel: totalCells,
            raised: 0,
            method: '100%_cover'
        };
    }
    
    // Normal case: find quantile
    const quantile = targetWaterPercentage / 100;
    const seaLevel = findQuantile(elevationData, quantile);
    
    // Verify actual coverage
    let cellsBelowSeaLevel = 0;
    for (let i = 0; i < elevationData.length; i++) {
        if (elevationData[i] <= seaLevel) {
            cellsBelowSeaLevel++;
        }
    }
    
    const actualPercentage = (cellsBelowSeaLevel / totalCells) * 100;
    
    return {
        seaLevel,
        actualPercentage,
        cellsBelowSeaLevel,
        raised: 0,
        method: 'quantile'
    };
}

/**
 * Create height histogram for analysis
 * 
 * @param {Float32Array} elevationData 
 * @param {number} binCount - Number of histogram bins
 * @param {number} minHeight - Minimum height (optional, auto-detect if not provided)
 * @param {number} maxHeight - Maximum height (optional, auto-detect if not provided)
 * @returns {Object} Histogram data
 */
export function createHeightHistogram(elevationData, binCount = 100, minHeight = null, maxHeight = null) {
    if (minHeight === null) minHeight = Math.min(...elevationData);
    if (maxHeight === null) maxHeight = Math.max(...elevationData);
    
    const binWidth = (maxHeight - minHeight) / binCount;
    const bins = new Array(binCount).fill(0);
    
    for (let i = 0; i < elevationData.length; i++) {
        const height = elevationData[i];
        const binIndex = Math.min(
            binCount - 1,
            Math.floor((height - minHeight) / binWidth)
        );
        bins[binIndex]++;
    }
    
    // Calculate cumulative distribution
    const cdf = new Array(binCount);
    cdf[0] = bins[0];
    for (let i = 1; i < binCount; i++) {
        cdf[i] = cdf[i - 1] + bins[i];
    }
    
    // Normalize CDF to percentages
    const totalCells = elevationData.length;
    const cdfPercent = cdf.map(count => (count / totalCells) * 100);
    
    return {
        bins,
        cdf,
        cdfPercent,
        binWidth,
        minHeight,
        maxHeight,
        binCount
    };
}

/**
 * Find sea level from histogram (faster for repeated queries)
 * 
 * @param {Object} histogram - Output from createHeightHistogram
 * @param {number} targetPercentage - Target water coverage
 * @returns {number} Sea level height
 */
export function seaLevelFromHistogram(histogram, targetPercentage) {
    const { cdfPercent, minHeight, binWidth, binCount } = histogram;
    
    // Find first bin where CDF exceeds target
    for (let i = 0; i < binCount; i++) {
        if (cdfPercent[i] >= targetPercentage) {
            // Interpolate within bin
            const binStart = minHeight + i * binWidth;
            const binEnd = binStart + binWidth;
            
            if (i === 0) return binStart;
            
            // Linear interpolation
            const prevPercent = i > 0 ? cdfPercent[i - 1] : 0;
            const weight = (targetPercentage - prevPercent) / (cdfPercent[i] - prevPercent);
            
            return binStart + weight * binWidth;
        }
    }
    
    // Target exceeds all data
    return histogram.maxHeight;
}

/**
 * Validate water coverage meets target
 * 
 * @param {Float32Array} elevationData 
 * @param {number} seaLevel 
 * @param {number} targetPercentage 
 * @param {number} tolerance - Acceptable error (default ±0.1%)
 * @returns {Object} Validation result
 */
export function validateWaterCoverage(elevationData, seaLevel, targetPercentage, tolerance = 0.1) {
    let cellsBelowSeaLevel = 0;
    let cellsAtSeaLevel = 0;
    
    for (let i = 0; i < elevationData.length; i++) {
        if (elevationData[i] < seaLevel) {
            cellsBelowSeaLevel++;
        } else if (Math.abs(elevationData[i] - seaLevel) < 0.001) {
            cellsAtSeaLevel++;
        }
    }
    
    const totalWaterCells = cellsBelowSeaLevel + cellsAtSeaLevel;
    const actualPercentage = (totalWaterCells / elevationData.length) * 100;
    const error = Math.abs(actualPercentage - targetPercentage);
    const passed = error <= tolerance;
    
    return {
        passed,
        targetPercentage,
        actualPercentage,
        error,
        tolerance,
        cellsBelowSeaLevel,
        cellsAtSeaLevel,
        totalWaterCells,
        totalCells: elevationData.length
    };
}

/**
 * Apply sea level to elevation data (for 0% water case)
 * Raises all cells below threshold
 * 
 * @param {Float32Array} elevationData - Height field (modified in place)
 * @param {number} seaLevel 
 * @param {number} epsilon - Amount to raise above sea level
 * @returns {number} Number of cells raised
 */
export function raiseTerrainAboveSeaLevel(elevationData, seaLevel, epsilon = 0.01) {
    let raised = 0;
    const targetHeight = seaLevel + epsilon;
    
    for (let i = 0; i < elevationData.length; i++) {
        if (elevationData[i] < targetHeight) {
            elevationData[i] = targetHeight;
            raised++;
        }
    }
    
    return raised;
}

/**
 * Calculate terrain statistics
 */
export function calculateTerrainStats(elevationData) {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let sumSquares = 0;
    
    for (let i = 0; i < elevationData.length; i++) {
        const h = elevationData[i];
        min = Math.min(min, h);
        max = Math.max(max, h);
        sum += h;
        sumSquares += h * h;
    }
    
    const mean = sum / elevationData.length;
    const variance = (sumSquares / elevationData.length) - (mean * mean);
    const stdDev = Math.sqrt(variance);
    
    return {
        min,
        max,
        mean,
        stdDev,
        variance,
        range: max - min
    };
}

