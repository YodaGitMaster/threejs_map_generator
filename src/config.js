// Default configuration for terrain generation (v1.1 - Deterministic)
export const DEFAULT_CONFIG = {
    // Version
    VERSION: '1.1',
    
    // Random seed
    SEED: 12345,
    
    // Map dimensions (in lattice cells)
    MAP_WIDTH: 128,
    MAP_HEIGHT: 128,
    CELL_SIZE: 1.0,  // Size of each cell in meters (for slope calculations)
    
    // Octagon geometry
    OCT_APOTHEM: 1.0,  // Distance from center to flat edge midpoint
    
    // Elevation settings
    ELEVATION_SCALE: 80,        // meters - taller relief
    ELEVATION_CURVE: 'SHARP_ALPS',  // Mountainous relief
    
    // Water settings (exact coverage via quantile solver)
    // SEA_LEVEL here is only an ESTIMATE used during pre-sea-level steps (e.g., lake carving visuals)
    SEA_LEVEL: 0.35,
    WATER_PERCENTAGE: 15,       // 0-100: exact percentage of map covered by water
    WATER_EPSILON: 0.01,        // Meters above sea level for 0% water case
    
    // Lake settings (Poisson disk sampling)
    LAKE_MIN_SPACING: 15,       // Minimum distance between lake centers (cells)
    LAKE_DEPTH_MIN: 0.05,       // Minimum depth below sea level (normalized units of 0..1)
    LAKE_DEPTH_MAX: 0.15,       // Maximum depth below sea level (normalized units of 0..1)
    LAKE_SHAPE_SQUARENESS: 2.0, // Superellipse exponent (2.0 = circle, higher = square)
    LAKE_EDGE_NOISE_FREQ: 0.3,  // Frequency of edge noise for organic shores
    LAKE_EDGE_NOISE_AMP: 0.15,  // Amplitude of edge noise
    
    // Noise parameters: Multi-band composition
    // Legacy noise parameter for pre-v1.1 TerrainGenerator
    NOISE_ELEV: {
        octaves: 3,
        frequency: 0.01,
        gain: 0.4,
        lacunarity: 2.0
    },
    // Macro (continents) - very low frequency
    NOISE_MACRO: {
        octaves: 2,
        frequency: 0.003,
        gain: 0.6,
        lacunarity: 2.0,
        amplitude: 0.45
    },
    // Meso (mountain ranges) - medium frequency  
    NOISE_MESO: {
        octaves: 3,
        frequency: 0.01,
        gain: 0.4,
        lacunarity: 2.0,
        amplitude: 0.45
    },
    // Micro (surface detail) - higher frequency
    NOISE_MICRO: {
        octaves: 4,
        frequency: 0.04,
        gain: 0.35,
        lacunarity: 2.0,
        amplitude: 0.20
    },
    // Domain warping
    NOISE_WARP_STRENGTH: 0.0,   // 0 = off, 0.5 = moderate, 1.0 = strong
    
    // Ridges (optional sharp mountain ranges)
    RIDGES_ENABLED: false,
    RIDGES_FREQUENCY: 0.008,
    RIDGES_DIRECTION: 45,       // Degrees (0=N, 90=E, 180=S, 270=W)
    RIDGES_STRENGTH: 0.3,
    
    // Moisture and temperature (for biomes)
    NOISE_MOIST: {
        octaves: 2,
        frequency: 0.015,
        gain: 0.3,
        lacunarity: 2.0
    },
    NOISE_TEMP: {
        octaves: 2,
        frequency: 0.008,
        gain: 0.4,
        lacunarity: 2.0
    },
    TEMP_LAPSE_RATE: -0.006,    // Temperature decrease per meter elevation
    TEMP_LATITUDE_EFFECT: 0.3,  // North-south temperature gradient
    
    // Erosion (deterministic)
    EROSION_ITERATIONS: 20,
    EROSION_STRENGTH: 0.15,
    EROSION_DROPLET_COUNT: 5000,  // Fixed number of droplets
    EROSION_STRATIFIED: true,     // Use stratified starting positions
    
    // Forest settings (Poisson disk + suitability)
    FOREST_PERCENTAGE: 25,          // 0-100: percentage of suitable land
    TREE_MIN_SPACING: 3.0,          // Minimum distance between trees (meters)
    TREE_MIN_HEIGHT: 'sea_level+2', // Above beach (special value or number in meters)
    TREE_MAX_HEIGHT: 60,            // Below alpine limit (meters)
    TREE_MAX_SLOPE: 35,             // Maximum slope angle (degrees)
    TREE_BEACH_BUFFER: 2.0,         // Extra buffer above sea level (meters)
    
    // Rendering
    CHUNK_SIZE: 16,
    SHOW_SQUARES: false,
    SHOW_WATER: true,
    SHOW_GRID: false,
    GUIDE_MODE: true,
    LOW_POLY_MODE: true,
    QUANTIZATION_STEP: 1.0,         // Height quantization in meters (reduce banding)
    TRIANGLE_BUDGET: 100000,        // Maximum triangles for performance
    
    // Camera
    CAMERA_MODE: 'topdown',
    CAMERA_HEIGHT: 60,
    CAMERA_DISTANCE: 100,
    CAMERA_ANGLE: 45,
    CAMERA_ROTATION: 0,
    
    // Validation thresholds
    WATER_TOLERANCE: 0.1,           // ±0.1% acceptable error
    MIN_LANDMASS_FRACTION: 0.15,    // Minimum size of largest landmass (15%)
};

export class Config {
    constructor(overrides = {}) {
        Object.assign(this, DEFAULT_CONFIG, overrides);
    }
    
    // Helper to get octagon size (across-flats distance)
    get octagonWidth() {
        return this.OCT_APOTHEM * 2;
    }
    
    // Helper to get octagon radius (center to vertex)
    get octagonRadius() {
        return this.OCT_APOTHEM / Math.cos(Math.PI / 8);
    }
}

