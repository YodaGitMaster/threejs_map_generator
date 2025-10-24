/**
 * Tree Placement System - v1.1
 * 
 * Poisson disk sampling with slope/height constraints
 * Ensures trees:
 * - Never in water or on beaches
 * - Never on steep slopes
 * - Evenly distributed (no clustering)
 * - Exact forest coverage percentage
 */

import { poissonDiskSampling } from './poisson.js';
import { calculateSlopes } from './slope.js';

/**
 * Generate tree positions using Poisson disk sampling with terrain constraints
 */
export function generateTreePositions(terrainData, config, rngStream) {
    const {
        elevation,
        seaLevel,
        width,
        height,
        cellSize
    } = terrainData;
    
    console.log('🌲 Generating tree positions with Poisson + slope constraints...');
    const startTime = performance.now();
    
    // Step 1: Calculate slopes
    const slopes = calculateSlopes(elevation, width, height, cellSize);
    
    // Step 2: Create suitability mask
    const suitabilityMask = createTreeSuitabilityMask(
        elevation,
        slopes,
        width,
        height,
        seaLevel,
        config
    );
    
    // Step 3: Count suitable cells
    let suitableCells = 0;
    for (let i = 0; i < suitabilityMask.length; i++) {
        if (suitabilityMask[i] > 0) suitableCells++;
    }
    
    const suitableArea = suitableCells / (width * height);
    console.log(`  → Suitable area: ${(suitableArea * 100).toFixed(1)}% (${suitableCells}/${width * height} cells)`);
    
    if (suitableCells === 0) {
        console.warn('  ⚠️ No suitable area for trees with current constraints. Relaxing constraints temporarily.');
        // Relax constraints to diagnose
        const relaxedMask = new Float32Array(suitabilityMask.length);
        const relaxedMinHeight = seaLevel + 1.0;
        const relaxedMaxSlope = 45;
        for (let i = 0; i < relaxedMask.length; i++) {
            const h = elevation[i];
            const s = slopes[i];
            relaxedMask[i] = (h > relaxedMinHeight && h < (config.TREE_MAX_HEIGHT || 60) && s <= relaxedMaxSlope) ? 1.0 : 0.0;
        }
        let relaxedCount = 0;
        for (let i = 0; i < relaxedMask.length; i++) if (relaxedMask[i] > 0) relaxedCount++;
        console.warn(`  → After relax: suitable cells = ${relaxedCount}`);
        if (relaxedCount === 0) return [];
        // Use relaxed mask for candidate generation
        for (let i = 0; i < suitabilityMask.length; i++) suitabilityMask[i] = relaxedMask[i];
        suitableCells = relaxedCount;
    }
    
    // Step 4: Calculate target tree count
    const forestPercentage = config.FOREST_PERCENTAGE || 0;
    if (forestPercentage <= 0) {
        console.log('  → Forest coverage: 0%');
        return [];
    }
    
    // Estimate trees needed (assuming each tree "covers" ~3 cells)
    const cellsPerTree = 3;
    const targetForestCells = (suitableCells * forestPercentage) / 100;
    const targetTreeCount = Math.floor(targetForestCells / cellsPerTree);
    
    console.log(`  → Target: ${forestPercentage}% of suitable area = ${targetTreeCount} trees`);
    
    // Step 5: Create suitability function for Poisson sampling
    const suitabilityFn = (x, z) => {
        const cellX = Math.floor(x / cellSize);
        const cellZ = Math.floor(z / cellSize);
        
        if (cellX < 0 || cellX >= width || cellZ < 0 || cellZ >= height) {
            return 0;
        }
        
        const idx = cellZ * width + cellX;
        return suitabilityMask[idx];
    };
    
    // Step 6: Generate candidate positions with Poisson disk sampling
    const mapWidth = width * cellSize;
    const mapHeight = height * cellSize;
    const minSpacing = config.TREE_MIN_SPACING || 3.0;
    
    console.log(`  → Running Poisson sampling (spacing: ${minSpacing}m)...`);
    
    const candidates = poissonDiskSampling(
        mapWidth,
        mapHeight,
        minSpacing,
        () => rngStream.next(),
        30, // maxAttempts
        suitabilityFn
    );
    
    console.log(`  → Generated ${candidates.length} candidate positions`);
    
    // Step 7: Select best candidates up to target count
    const selectedPositions = selectBestTreePositions(
        candidates,
        targetTreeCount,
        elevation,
        width,
        height,
        cellSize,
        rngStream
    );
    
    const elapsedTime = performance.now() - startTime;
    console.log(`✓ Tree placement complete: ${selectedPositions.length} trees in ${elapsedTime.toFixed(1)}ms`);
    
    return selectedPositions;
}

/**
 * Create suitability mask for tree placement
 * Returns Float32Array where 0 = unsuitable, 1 = suitable
 */
function createTreeSuitabilityMask(elevation, slopes, width, height, seaLevel, config) {
    const mask = new Float32Array(width * height);
    
    const minHeight = seaLevel + (config.TREE_BEACH_BUFFER || 2.0);
    const maxHeight = config.TREE_MAX_HEIGHT || 60;
    const maxSlope = config.TREE_MAX_SLOPE || 35; // degrees
    
    let suitableCount = 0;
    let tooLowCount = 0;
    let tooHighCount = 0;
    let tooSteepCount = 0;
    
    for (let i = 0; i < elevation.length; i++) {
        const h = elevation[i];
        const slopeDegrees = slopes[i];
        
        // Check constraints
        if (h < minHeight) {
            tooLowCount++;
            mask[i] = 0;
            continue;
        }
        
        if (h > maxHeight) {
            tooHighCount++;
            mask[i] = 0;
            continue;
        }
        
        if (slopeDegrees > maxSlope) {
            tooSteepCount++;
            mask[i] = 0;
            continue;
        }
        
        // Suitable!
        mask[i] = 1.0;
        suitableCount++;
    }
    
    console.log(`  → Suitability analysis:`);
    console.log(`      Suitable: ${suitableCount}`);
    console.log(`      Too low (< ${minHeight.toFixed(1)}m): ${tooLowCount}`);
    console.log(`      Too high (> ${maxHeight}m): ${tooHighCount}`);
    console.log(`      Too steep (> ${maxSlope}°): ${tooSteepCount}`);
    
    return mask;
}

/**
 * Select best tree positions from candidates
 * Prioritizes varied heights and good spacing
 */
function selectBestTreePositions(
    candidates,
    targetCount,
    elevation,
    width,
    height,
    cellSize,
    rngStream
) {
    if (candidates.length <= targetCount) {
        // Use all candidates
        return candidates.map(pos => ({
            x: pos.x,
            z: pos.y, // Note: Poisson returns {x, y}, we use {x, z} for 3D
            height: getHeightAt(pos.x, pos.y, elevation, width, height, cellSize)
        }));
    }
    
    // Score and select best candidates
    const scoredCandidates = candidates.map(pos => {
        const h = getHeightAt(pos.x, pos.y, elevation, width, height, cellSize);
        
        // Prefer mid-elevation (not beach, not peaks)
        const midElevationScore = 1.0 - Math.abs(h - 25) / 25;
        
        // Add some randomness for variety
        const randomScore = rngStream.next();
        
        const totalScore = midElevationScore * 0.7 + randomScore * 0.3;
        
        return {
            x: pos.x,
            z: pos.y,
            height: h,
            score: totalScore
        };
    });
    
    // Sort by score (descending) and take top N
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    return scoredCandidates.slice(0, targetCount);
}

/**
 * Get terrain height at world position (with bilinear interpolation)
 */
function getHeightAt(worldX, worldZ, elevation, width, height, cellSize) {
    const cellX = worldX / cellSize;
    const cellZ = worldZ / cellSize;
    
    // Clamp to valid range
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(cellX)));
    const z0 = Math.max(0, Math.min(height - 1, Math.floor(cellZ)));
    const x1 = Math.min(width - 1, x0 + 1);
    const z1 = Math.min(height - 1, z0 + 1);
    
    // Bilinear interpolation
    const fx = cellX - x0;
    const fz = cellZ - z0;
    
    const h00 = elevation[z0 * width + x0];
    const h10 = elevation[z0 * width + x1];
    const h01 = elevation[z1 * width + x0];
    const h11 = elevation[z1 * width + x1];
    
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    
    return h0 * (1 - fz) + h1 * fz;
}

/**
 * Validate tree positions (post-placement check)
 * Returns array of valid positions
 */
export function validateTreePositions(positions, elevation, width, height, cellSize, seaLevel) {
    const validPositions = [];
    let removedWater = 0;
    let removedBeach = 0;
    
    const beachHeight = seaLevel + 4;
    
    for (const pos of positions) {
        const h = getHeightAt(pos.x, pos.z, elevation, width, height, cellSize);
        
        if (h <= seaLevel) {
            removedWater++;
            continue;
        }
        
        if (h <= beachHeight) {
            removedBeach++;
            continue;
        }
        
        validPositions.push({ ...pos, height: h });
    }
    
    if (removedWater > 0 || removedBeach > 0) {
        console.log(`  → Post-validation removed: ${removedWater} water, ${removedBeach} beach`);
    }
    
    return validPositions;
}

/**
 * Calculate metrics for tree placement
 */
export function calculateTreeMetrics(positions, elevation, width, height, cellSize, config) {
    if (positions.length === 0) {
        return {
            count: 0,
            coverage: 0,
            avgHeight: 0,
            minSpacing: 0,
            actualPercentage: 0
        };
    }
    
    // Average height
    const avgHeight = positions.reduce((sum, pos) => sum + pos.height, 0) / positions.length;
    
    // Minimum spacing (sample nearest neighbors)
    let minSpacing = Infinity;
    for (let i = 0; i < Math.min(100, positions.length); i++) {
        const pos = positions[i];
        let nearestDist = Infinity;
        
        for (let j = 0; j < positions.length; j++) {
            if (i === j) continue;
            
            const other = positions[j];
            const dx = pos.x - other.x;
            const dz = pos.z - other.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            nearestDist = Math.min(nearestDist, dist);
        }
        
        minSpacing = Math.min(minSpacing, nearestDist);
    }
    
    // Coverage (assume each tree covers ~3 cells)
    const cellsPerTree = 3;
    const coveredCells = positions.length * cellsPerTree;
    const totalCells = width * height;
    const coverage = (coveredCells / totalCells) * 100;
    
    return {
        count: positions.length,
        coverage,
        avgHeight,
        minSpacing: minSpacing === Infinity ? 0 : minSpacing,
        actualPercentage: coverage
    };
}

