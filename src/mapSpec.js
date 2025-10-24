/**
 * MapSpec v1.1 - Serialization and Deserialization
 * 
 * Allows maps to be saved, loaded, and reproduced exactly.
 * Includes all parameters needed for deterministic generation.
 */

import { DEFAULT_CONFIG } from './config.js';

/**
 * Create a MapSpec from config and generation results
 */
export function createMapSpec(config, terrainData) {
    return {
        version: '1.1',
        timestamp: Date.now(),
        
        // Core parameters
        seed: config.SEED,
        subSeeds: terrainData.subSeeds || {},
        
        // Map size
        size: {
            width: config.MAP_WIDTH,
            height: config.MAP_HEIGHT,
            cellSize: config.CELL_SIZE
        },
        
        // Elevation
        elevation: {
            scale: config.ELEVATION_SCALE,
            curve: config.ELEVATION_CURVE,
            quantizationStep: config.QUANTIZATION_STEP
        },
        
        // Noise composition
        noise: {
            macro: { ...config.NOISE_MACRO },
            meso: { ...config.NOISE_MESO },
            micro: { ...config.NOISE_MICRO },
            warpStrength: config.NOISE_WARP_STRENGTH
        },
        
        // Ridges
        ridges: {
            enabled: config.RIDGES_ENABLED,
            frequency: config.RIDGES_FREQUENCY,
            direction: config.RIDGES_DIRECTION,
            strength: config.RIDGES_STRENGTH
        },
        
        // Water
        water: {
            percentage: config.WATER_PERCENTAGE,
            epsilon: config.WATER_EPSILON,
            tolerance: config.WATER_TOLERANCE,
            seaLevel: terrainData.seaLevel,
            seaLevelNormalized: terrainData.seaLevelNormalized,
            actualPercentage: terrainData.metrics?.waterCoverage?.actual || 0,
            method: terrainData.metrics?.waterCoverage?.method || 'quantile'
        },
        
        // Lakes
        lakes: {
            minSpacing: config.LAKE_MIN_SPACING,
            depthMin: config.LAKE_DEPTH_MIN,
            depthMax: config.LAKE_DEPTH_MAX,
            shapeSquareness: config.LAKE_SHAPE_SQUARENESS,
            edgeNoiseFreq: config.LAKE_EDGE_NOISE_FREQ,
            edgeNoiseAmp: config.LAKE_EDGE_NOISE_AMP
        },
        
        // Erosion
        erosion: {
            iterations: config.EROSION_ITERATIONS,
            strength: config.EROSION_STRENGTH,
            dropletCount: config.EROSION_DROPLET_COUNT,
            stratified: config.EROSION_STRATIFIED
        },
        
        // Biomes
        biomes: {
            moistureNoise: { ...config.NOISE_MOIST },
            temperatureNoise: { ...config.NOISE_TEMP },
            tempLapseRate: config.TEMP_LAPSE_RATE,
            tempLatitudeEffect: config.TEMP_LATITUDE_EFFECT
        },
        
        // Forest
        forest: {
            percentage: config.FOREST_PERCENTAGE,
            minSpacing: config.TREE_MIN_SPACING,
            minHeight: config.TREE_MIN_HEIGHT,
            maxHeight: config.TREE_MAX_HEIGHT,
            maxSlope: config.TREE_MAX_SLOPE,
            beachBuffer: config.TREE_BEACH_BUFFER
        },
        
        // Rendering
        render: {
            triangleBudget: config.TRIANGLE_BUDGET,
            quantizationStep: config.QUANTIZATION_STEP,
            guideMode: config.GUIDE_MODE,
            lowPolyMode: config.LOW_POLY_MODE,
            showGrid: config.SHOW_GRID,
            showWater: config.SHOW_WATER
        },
        
        // Metrics (measured outputs)
        metrics: terrainData.metrics || {}
    };
}

/**
 * Serialize MapSpec to JSON string
 */
export function serializeMapSpec(mapSpec) {
    return JSON.stringify(mapSpec, null, 2);
}

/**
 * Deserialize MapSpec from JSON string
 */
export function deserializeMapSpec(jsonString) {
    try {
        const spec = JSON.parse(jsonString);
        
        // Validate version
        if (!spec.version || spec.version !== '1.1') {
            console.warn(`MapSpec version mismatch: expected 1.1, got ${spec.version}`);
        }
        
        return spec;
    } catch (error) {
        console.error('Failed to deserialize MapSpec:', error);
        throw error;
    }
}

/**
 * Create config from MapSpec
 * Reconstructs a config object that will produce the same map
 */
export function configFromMapSpec(mapSpec) {
    const config = { ...DEFAULT_CONFIG };
    
    // Core
    config.VERSION = mapSpec.version;
    config.SEED = mapSpec.seed;
    
    // Size
    config.MAP_WIDTH = mapSpec.size.width;
    config.MAP_HEIGHT = mapSpec.size.height;
    config.CELL_SIZE = mapSpec.size.cellSize;
    
    // Elevation
    config.ELEVATION_SCALE = mapSpec.elevation.scale;
    config.ELEVATION_CURVE = mapSpec.elevation.curve;
    config.QUANTIZATION_STEP = mapSpec.elevation.quantizationStep;
    
    // Noise
    config.NOISE_MACRO = { ...mapSpec.noise.macro };
    config.NOISE_MESO = { ...mapSpec.noise.meso };
    config.NOISE_MICRO = { ...mapSpec.noise.micro };
    config.NOISE_WARP_STRENGTH = mapSpec.noise.warpStrength;
    
    // Ridges
    config.RIDGES_ENABLED = mapSpec.ridges.enabled;
    config.RIDGES_FREQUENCY = mapSpec.ridges.frequency;
    config.RIDGES_DIRECTION = mapSpec.ridges.direction;
    config.RIDGES_STRENGTH = mapSpec.ridges.strength;
    
    // Water
    config.WATER_PERCENTAGE = mapSpec.water.percentage;
    config.WATER_EPSILON = mapSpec.water.epsilon;
    config.WATER_TOLERANCE = mapSpec.water.tolerance;
    
    // Lakes
    config.LAKE_MIN_SPACING = mapSpec.lakes.minSpacing;
    config.LAKE_DEPTH_MIN = mapSpec.lakes.depthMin;
    config.LAKE_DEPTH_MAX = mapSpec.lakes.depthMax;
    config.LAKE_SHAPE_SQUARENESS = mapSpec.lakes.shapeSquareness;
    config.LAKE_EDGE_NOISE_FREQ = mapSpec.lakes.edgeNoiseFreq;
    config.LAKE_EDGE_NOISE_AMP = mapSpec.lakes.edgeNoiseAmp;
    
    // Erosion
    config.EROSION_ITERATIONS = mapSpec.erosion.iterations;
    config.EROSION_STRENGTH = mapSpec.erosion.strength;
    config.EROSION_DROPLET_COUNT = mapSpec.erosion.dropletCount;
    config.EROSION_STRATIFIED = mapSpec.erosion.stratified;
    
    // Biomes
    config.NOISE_MOIST = { ...mapSpec.biomes.moistureNoise };
    config.NOISE_TEMP = { ...mapSpec.biomes.temperatureNoise };
    config.TEMP_LAPSE_RATE = mapSpec.biomes.tempLapseRate;
    config.TEMP_LATITUDE_EFFECT = mapSpec.biomes.tempLatitudeEffect;
    
    // Forest
    config.FOREST_PERCENTAGE = mapSpec.forest.percentage;
    config.TREE_MIN_SPACING = mapSpec.forest.minSpacing;
    config.TREE_MIN_HEIGHT = mapSpec.forest.minHeight;
    config.TREE_MAX_HEIGHT = mapSpec.forest.maxHeight;
    config.TREE_MAX_SLOPE = mapSpec.forest.maxSlope;
    config.TREE_BEACH_BUFFER = mapSpec.forest.beachBuffer;
    
    // Rendering
    config.TRIANGLE_BUDGET = mapSpec.render.triangleBudget;
    config.QUANTIZATION_STEP = mapSpec.render.quantizationStep;
    config.GUIDE_MODE = mapSpec.render.guideMode;
    config.LOW_POLY_MODE = mapSpec.render.lowPolyMode;
    config.SHOW_GRID = mapSpec.render.showGrid;
    config.SHOW_WATER = mapSpec.render.showWater;
    
    return config;
}

/**
 * Save MapSpec to localStorage
 */
export function saveMapSpecToStorage(mapSpec, key = 'lastMapSpec') {
    try {
        const json = serializeMapSpec(mapSpec);
        localStorage.setItem(key, json);
        console.log(`✓ MapSpec saved to localStorage (key: ${key})`);
        return true;
    } catch (error) {
        console.error('Failed to save MapSpec:', error);
        return false;
    }
}

/**
 * Load MapSpec from localStorage
 */
export function loadMapSpecFromStorage(key = 'lastMapSpec') {
    try {
        const json = localStorage.getItem(key);
        if (!json) {
            console.warn(`No MapSpec found with key: ${key}`);
            return null;
        }
        
        const mapSpec = deserializeMapSpec(json);
        console.log(`✓ MapSpec loaded from localStorage (key: ${key})`);
        return mapSpec;
    } catch (error) {
        console.error('Failed to load MapSpec:', error);
        return null;
    }
}

/**
 * Download MapSpec as file
 */
export function downloadMapSpec(mapSpec, filename = null) {
    if (!filename) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        filename = `mapspec_${mapSpec.seed}_${timestamp}.json`;
    }
    
    const json = serializeMapSpec(mapSpec);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
    console.log(`✓ MapSpec downloaded: ${filename}`);
}

/**
 * Compare two MapSpecs for differences
 */
export function compareMapSpecs(spec1, spec2) {
    const differences = [];
    
    function compareObjects(obj1, obj2, path = '') {
        for (const key in obj1) {
            const fullPath = path ? `${path}.${key}` : key;
            
            if (typeof obj1[key] === 'object' && obj1[key] !== null && !Array.isArray(obj1[key])) {
                compareObjects(obj1[key], obj2[key], fullPath);
            } else if (obj1[key] !== obj2[key]) {
                differences.push({
                    path: fullPath,
                    value1: obj1[key],
                    value2: obj2[key]
                });
            }
        }
    }
    
    compareObjects(spec1, spec2);
    
    return differences;
}

/**
 * Generate hash of MapSpec for quick comparison
 */
export function hashMapSpec(mapSpec) {
    // Simple hash of seed + key parameters
    const keyString = `${mapSpec.seed}_${mapSpec.size.width}x${mapSpec.size.height}_` +
                     `w${mapSpec.water.percentage}_f${mapSpec.forest.percentage}_` +
                     `${mapSpec.elevation.curve}`;
    
    // Simple string hash
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
        const char = keyString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(16);
}

/**
 * Validate MapSpec structure
 */
export function validateMapSpec(mapSpec) {
    const errors = [];
    
    // Required top-level fields
    if (!mapSpec.version) errors.push('Missing version');
    if (!mapSpec.seed) errors.push('Missing seed');
    if (!mapSpec.size) errors.push('Missing size');
    if (!mapSpec.water) errors.push('Missing water');
    if (!mapSpec.forest) errors.push('Missing forest');
    
    // Validate ranges
    if (mapSpec.water && (mapSpec.water.percentage < 0 || mapSpec.water.percentage > 100)) {
        errors.push('Water percentage out of range (0-100)');
    }
    
    if (mapSpec.forest && (mapSpec.forest.percentage < 0 || mapSpec.forest.percentage > 100)) {
        errors.push('Forest percentage out of range (0-100)');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

