/**
 * Terrain Generator v1.1 - Deterministic, Constraint-Driven
 * 
 * Implements the improved architecture from the v1.1 guide:
 * - Multi-stream RNG for independence
 * - Simulation heights (float) separate from rendering
 * - Quantile solver for exact water coverage
 * - Poisson disk lake placement
 * - Elevation curve presets
 * - Metrics and validation
 */

import { BiomeClassifier } from './biomes.js';
import { getPreset } from './elevationCurve.js';
import { HydraulicErosion } from './erosion.js';
import { generateNoiseField } from './noise.js';
import { poissonDiskSampling } from './poisson.js';
import { calculateTerrainStats, solveSeaLevel, validateWaterCoverage } from './quantile.js';
import { MultiStreamRNG } from './rng.js';

export class TerrainGeneratorV1_1 {
    constructor(config) {
        this.config = config;
        this.width = config.MAP_WIDTH;
        this.height = config.MAP_HEIGHT;
        
        // Multi-stream RNG for deterministic independence
        this.rng = new MultiStreamRNG(config.SEED);
        
        // Metrics tracking
        this.metrics = {
            buildTime: {},
            waterCoverage: {},
            forestCoverage: {},
            terrainStats: {},
            invariants: {}
        };
    }
    
    /**
     * Main generation pipeline
     */
    generate() {
        console.log(`🌍 Generating terrain v1.1 (seed: ${this.config.SEED})...`);
        const totalStart = performance.now();
        
        try {
            // Phase 1: Generate base elevation (simulation heights in meters)
            const elevation = this._generateElevation();
            
            // Phase 2: Apply erosion (optional, deterministic)
            if (this.config.EROSION_ITERATIONS > 0) {
                this._applyErosion(elevation);
            }
            
            // Phase 3: Solve for exact sea level
            const seaLevelData = this._solveSeaLevel(elevation);
            
            // Phase 4: Generate auxiliary fields
            const moisture = this._generateMoisture();
            const temperature = this._generateTemperature(elevation, seaLevelData.seaLevel);
            
            // Phase 5: Classify biomes
            const biomes = this._classifyBiomes(elevation, moisture, temperature, seaLevelData.seaLevel);
            
            // Phase 6: Calculate splat weights (for non-guide rendering)
            const splatWeights = this._calculateSplatWeights(elevation, biomes);
            
            // Calculate final metrics
            this._calculateMetrics(elevation, seaLevelData);
            
            const totalTime = performance.now() - totalStart;
            this.metrics.buildTime.total = totalTime;
            
            console.log(`✓ Terrain generated in ${totalTime.toFixed(1)}ms`);
            console.log(`  → Sea level: ${seaLevelData.seaLevel.toFixed(2)}m (${seaLevelData.actualPercentage.toFixed(1)}%)`);
            console.log(`  → Validation:`, this.metrics.invariants);
            
            return {
                // Simulation data (float heights in meters)
                elevation,           // Float32Array - heights in meters
                seaLevel: seaLevelData.seaLevel,
                seaLevelNormalized: seaLevelData.seaLevel / this.config.ELEVATION_SCALE,
                
                // Auxiliary fields
                moisture,
                temperature,
                biomes,
                splatWeights,
                
                // Metadata
                width: this.width,
                height: this.height,
                cellSize: this.config.CELL_SIZE,
                
                // Metrics
                metrics: this.metrics,
                
                // RNG state (for serialization)
                subSeeds: this.rng.getSubSeeds(),
                rngStates: this.rng.getStreamStates()
            };
            
        } catch (error) {
            console.error('❌ Terrain generation failed:', error);
            throw error;
        }
    }
    
    /**
     * Phase 1: Generate elevation with multi-band noise composition
     */
    _generateElevation() {
        const start = performance.now();
        console.log('  → Phase 1: Generating elevation...');
        
        const terrainRng = this.rng.getStream('terrain');
        
        // Multi-band noise composition
        let elevation = new Float32Array(this.width * this.height);
        
        // Macro (continents)
        if (this.config.NOISE_MACRO.amplitude > 0) {
            const macro = generateNoiseField(
                this.width, 
                this.height, 
                terrainRng.nextInt(0, 1000000),
                this.config.NOISE_MACRO
            );
            const weight = this.config.NOISE_MACRO.amplitude;
            for (let i = 0; i < elevation.length; i++) {
                elevation[i] += macro[i] * weight;
            }
        }
        
        // Meso (mountain ranges)
        if (this.config.NOISE_MESO.amplitude > 0) {
            const meso = generateNoiseField(
                this.width,
                this.height,
                terrainRng.nextInt(0, 1000000),
                this.config.NOISE_MESO
            );
            const weight = this.config.NOISE_MESO.amplitude;
            for (let i = 0; i < elevation.length; i++) {
                elevation[i] += meso[i] * weight;
            }
        }
        
        // Micro (surface detail)
        if (this.config.NOISE_MICRO.amplitude > 0) {
            const micro = generateNoiseField(
                this.width,
                this.height,
                terrainRng.nextInt(0, 1000000),
                this.config.NOISE_MICRO
            );
            const weight = this.config.NOISE_MICRO.amplitude;
            for (let i = 0; i < elevation.length; i++) {
                elevation[i] += micro[i] * weight;
            }
        }
        
        // Normalize to 0-1 range, then boost contrast so hills/mountains emerge
        this._normalizeArray(elevation);
        for (let i = 0; i < elevation.length; i++) {
            // Contrast curve: emphasize mid-highs, depress mids
            const e = elevation[i];
            elevation[i] = Math.min(1, Math.max(0, Math.pow(e, 0.9)));
        }
        
        // Apply elevation curve (remapping)
        const curve = getPreset(this.config.ELEVATION_CURVE);
        elevation = curve.applyToArray(elevation, elevation);
        
        // Add lakes via Poisson disk sampling (use estimated sea level in normalized units)
        this._addLakes(elevation);
        
        // Scale to meters (simulation heights)
        for (let i = 0; i < elevation.length; i++) {
            elevation[i] *= this.config.ELEVATION_SCALE;
        }
        // Diagnostics: min/max after scaling
        {
            let min = Infinity, max = -Infinity, sum = 0;
            for (let i = 0; i < elevation.length; i++) { const h = elevation[i]; if (h < min) min = h; if (h > max) max = h; sum += h; }
            const avg = sum / elevation.length;
            console.log(`   ↪ Elevation[m] stats → min: ${min.toFixed(2)}, max: ${max.toFixed(2)}, avg: ${avg.toFixed(2)}`);
        }
        
        this.metrics.buildTime.elevation = performance.now() - start;
        return elevation;
    }
    
    /**
     * Add lakes using Poisson disk sampling
     */
    _addLakes(elevation) {
        if (this.config.WATER_PERCENTAGE <= 0) return;
        
        const start = performance.now();
        const lakesRng = this.rng.getStream('lakes');
        
        // Calculate how many lake cells we need
        const totalCells = this.width * this.height;
        const targetWaterCells = Math.floor((this.config.WATER_PERCENTAGE / 100) * totalCells);
        
        // Estimate lake count from spacing
        const avgLakeArea = Math.PI * (this.config.LAKE_MIN_SPACING / 2) ** 2;
        const estimatedLakeCount = Math.ceil(targetWaterCells / avgLakeArea);
        
        console.log(`    → Adding lakes: ${estimatedLakeCount} centers, targeting ${targetWaterCells} cells`);
        
        // Use Poisson disk sampling for even distribution
        const lakeRng = () => lakesRng.next();
        const lakeCenters = poissonDiskSampling(
            this.width,
            this.height,
            this.config.LAKE_MIN_SPACING,
            lakeRng,
            30
        );
        
        console.log(`    → Poisson sampling generated ${lakeCenters.length} lake centers`);
        
        if (lakeCenters.length === 0) {
            console.warn('    ⚠️ No lake centers generated');
            return;
        }
        
        // Calculate target depth per lake to reach total coverage
        const cellsPerLake = Math.floor(targetWaterCells / lakeCenters.length);
        const avgRadius = Math.sqrt(cellsPerLake / Math.PI);
        
        let totalCellsCarved = 0;
        
        // Create lakes
        for (let lakeIdx = 0; lakeIdx < lakeCenters.length; lakeIdx++) {
            const center = lakeCenters[lakeIdx];
            const cx = Math.floor(center.x);
            const cy = Math.floor(center.y);
            
            // Variable lake size (70%-130% of average)
            const sizeVariation = 0.7 + lakesRng.next() * 0.6;
            const radiusX = avgRadius * sizeVariation;
            const radiusY = avgRadius * sizeVariation;
            
            // Variable depth
            const depthRange = this.config.LAKE_DEPTH_MAX - this.config.LAKE_DEPTH_MIN;
            const depth = this.config.LAKE_DEPTH_MIN + lakesRng.next() * depthRange;
            
            // Carve lake
            const cellsCarved = this._carveLake(
                elevation,
                cx,
                cy,
                radiusX,
                radiusY,
                depth,
                lakesRng
            );
            
            totalCellsCarved += cellsCarved;
        }
        
        console.log(`    → Carved ${totalCellsCarved} cells (target: ${targetWaterCells})`);
        
        this.metrics.buildTime.lakes = performance.now() - start;
    }
    
    /**
     * Carve a single lake with organic shape
     */
    _carveLake(elevation, cx, cy, radiusX, radiusY, depth, rng) {
        let cellsCarved = 0;
        const squareness = this.config.LAKE_SHAPE_SQUARENESS;
        const seaLevelEst = this.config.SEA_LEVEL; // normalized estimate (0..1)
        
        // Iterate over integer bounding box to ensure valid typed-array indexing
        const minY = Math.max(0, Math.floor(cy - radiusY * 2));
        const maxY = Math.min(this.height - 1, Math.ceil(cy + radiusY * 2));
        const minX = Math.max(0, Math.floor(cx - radiusX * 2));
        const maxX = Math.min(this.width - 1, Math.ceil(cx + radiusX * 2));

        for (let yi = minY; yi <= maxY; yi++) {
            for (let xi = minX; xi <= maxX; xi++) {
                const dx = xi - cx;
                const dy = yi - cy;
                
                // Superellipse distance (generalized ellipse)
                const distX = Math.abs(dx) / radiusX;
                const distY = Math.abs(dy) / radiusY;
                const dist = Math.pow(
                    Math.pow(distX, squareness) + Math.pow(distY, squareness),
                    1 / squareness
                );
                
                if (dist < 1.0) {
                    const idx = yi * this.width + xi;
                    // Smooth falloff from center to edge
                    const falloff = Math.cos(dist * Math.PI / 2); // 1.0 at center, 0.0 at edge
                    // Edge noise for organic shores
                    const edgeNoise = (rng.next() - 0.5) * this.config.LAKE_EDGE_NOISE_AMP;
                    // Interpret depth as depth BELOW sea level (normalized)
                    const depthBelowSea = depth * Math.max(0, falloff + edgeNoise);
                    const targetHeight = Math.max(0, seaLevelEst - depthBelowSea);
                    // Lower terrain only down to targetHeight
                    if (elevation[idx] > targetHeight) {
                        elevation[idx] = targetHeight;
                        cellsCarved++;
                    }
                }
            }
        }
        
        return cellsCarved;
    }
    
    /**
     * Phase 2: Apply deterministic erosion
     */
    _applyErosion(elevation) {
        const start = performance.now();
        console.log('  → Phase 2: Applying erosion...');
        
        const erosionRng = this.rng.getStream('erosion');
        
        // Use stratified droplet positions for even coverage
        const dropletCount = this.config.EROSION_DROPLET_COUNT;
        const gridSize = Math.ceil(Math.sqrt(dropletCount));
        const cellWidth = this.width / gridSize;
        const cellHeight = this.height / gridSize;
        
        const erosionSystem = new HydraulicErosion(this.width, this.height);
        
        // Apply erosion (note: current erosion system doesn't use droplets parameter)
        erosionSystem.erode(elevation, this.config.EROSION_ITERATIONS, this.config.EROSION_STRENGTH);
        
        this.metrics.buildTime.erosion = performance.now() - start;
    }
    
    /**
     * Phase 3: Solve for exact sea level using quantile solver
     */
    _solveSeaLevel(elevation) {
        const start = performance.now();
        console.log('  → Phase 3: Solving for sea level...');
        
        const result = solveSeaLevel(
            elevation,
            this.config.WATER_PERCENTAGE,
            this.config.WATER_EPSILON
        );
        
        // Validate
        const validation = validateWaterCoverage(
            elevation,
            result.seaLevel,
            this.config.WATER_PERCENTAGE,
            this.config.WATER_TOLERANCE
        );
        
        console.log(`    → Sea level: ${result.seaLevel.toFixed(2)}m`);
        console.log(`    → Coverage: ${result.actualPercentage.toFixed(2)}% (target: ${this.config.WATER_PERCENTAGE}%)`);
        console.log(`    → Validation: ${validation.passed ? '✓ PASS' : '✗ FAIL'} (error: ${validation.error.toFixed(3)}%)`);
        
        this.metrics.waterCoverage = {
            target: this.config.WATER_PERCENTAGE,
            actual: result.actualPercentage,
            error: validation.error,
            validated: validation.passed,
            seaLevel: result.seaLevel,
            method: result.method
        };
        
        this.metrics.buildTime.seaLevel = performance.now() - start;
        
        return result;
    }
    
    /**
     * Phase 4a: Generate moisture field
     */
    _generateMoisture() {
        const start = performance.now();
        
        const moistureRng = this.rng.getStream('moisture');
        const moisture = generateNoiseField(
            this.width,
            this.height,
            moistureRng.nextInt(0, 1000000),
            this.config.NOISE_MOIST
        );
        
        this.metrics.buildTime.moisture = performance.now() - start;
        return moisture;
    }
    
    /**
     * Phase 4b: Generate temperature field with elevation lapse rate
     */
    _generateTemperature(elevation, seaLevel) {
        const start = performance.now();
        
        const tempRng = this.rng.getStream('temperature');
        const temperature = generateNoiseField(
            this.width,
            this.height,
            tempRng.nextInt(0, 1000000),
            this.config.NOISE_TEMP
        );
        
        // Apply lapse rate (temperature decreases with elevation)
        const lapseRate = this.config.TEMP_LAPSE_RATE;
        for (let i = 0; i < temperature.length; i++) {
            const heightAboveSeaLevel = Math.max(0, elevation[i] - seaLevel);
            temperature[i] += heightAboveSeaLevel * lapseRate;
        }
        
        // Apply latitude effect (colder at north/south edges)
        if (this.config.TEMP_LATITUDE_EFFECT > 0) {
            for (let y = 0; y < this.height; y++) {
                const latitudeFactor = Math.abs(y / this.height - 0.5) * 2; // 0 at center, 1 at edges
                const tempAdjust = -latitudeFactor * this.config.TEMP_LATITUDE_EFFECT;
                
                for (let x = 0; x < this.width; x++) {
                    const idx = y * this.width + x;
                    temperature[idx] += tempAdjust;
                }
            }
        }
        
        // Normalize
        this._normalizeArray(temperature);
        
        this.metrics.buildTime.temperature = performance.now() - start;
        return temperature;
    }
    
    /**
     * Phase 5: Classify biomes
     */
    _classifyBiomes(elevation, moisture, temperature, seaLevel) {
        const start = performance.now();
        
        const classifier = new BiomeClassifier(this.config);
        const biomes = classifier.classify(elevation, moisture, temperature, this.width, this.height, seaLevel);
        
        this.metrics.buildTime.biomes = performance.now() - start;
        return biomes;
    }
    
    /**
     * Phase 6: Calculate splat weights (for texture blending)
     */
    _calculateSplatWeights(elevation, biomes) {
        const start = performance.now();
        
        // Placeholder - simplified for now
        const weights = {
            grass: new Float32Array(elevation.length),
            rock: new Float32Array(elevation.length),
            sand: new Float32Array(elevation.length),
            snow: new Float32Array(elevation.length)
        };
        
        // Simple biome-based weighting
        for (let i = 0; i < elevation.length; i++) {
            const biome = biomes[i];
            
            switch(biome) {
                case 0: // Desert
                    weights.sand[i] = 1.0;
                    break;
                case 1: // Grassland
                    weights.grass[i] = 1.0;
                    break;
                case 2: // Forest
                    weights.grass[i] = 0.7;
                    weights.rock[i] = 0.3;
                    break;
                case 3: // Tundra
                    weights.rock[i] = 0.6;
                    weights.snow[i] = 0.4;
                    break;
                case 4: // Mountain
                    weights.rock[i] = 0.8;
                    weights.snow[i] = 0.2;
                    break;
                case 5: // Snow
                    weights.snow[i] = 1.0;
                    break;
                default:
                    weights.grass[i] = 1.0;
            }
        }
        
        this.metrics.buildTime.splatWeights = performance.now() - start;
        return weights;
    }
    
    /**
     * Calculate final metrics and validate invariants
     */
    _calculateMetrics(elevation, seaLevelData) {
        // Terrain statistics
        this.metrics.terrainStats = calculateTerrainStats(elevation);
        
        // Invariant checks
        const invariants = {};
        
        // 1. Water coverage matches target
        invariants.waterCoverageMatch = Math.abs(
            seaLevelData.actualPercentage - this.config.WATER_PERCENTAGE
        ) <= this.config.WATER_TOLERANCE;
        
        // 2. Terrain heights within bounds
        invariants.heightsValid = 
            this.metrics.terrainStats.min >= 0 &&
            this.metrics.terrainStats.max <= this.config.ELEVATION_SCALE;
        
        // 3. Sea level reasonable
        invariants.seaLevelValid =
            seaLevelData.seaLevel >= 0 &&
            seaLevelData.seaLevel <= this.config.ELEVATION_SCALE;
        
        this.metrics.invariants = invariants;
        
        // Check if all invariants pass
        const allPass = Object.values(invariants).every(v => v);
        if (!allPass) {
            console.warn('⚠️ Some invariants failed:', invariants);
        }
        
        return allPass;
    }
    
    /**
     * Utility: Normalize array to 0-1 range
     */
    _normalizeArray(arr) {
        let min = Infinity;
        let max = -Infinity;
        
        for (let i = 0; i < arr.length; i++) {
            min = Math.min(min, arr[i]);
            max = Math.max(max, arr[i]);
        }
        
        const range = max - min;
        if (range > 0) {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = (arr[i] - min) / range;
            }
        }
    }
}

