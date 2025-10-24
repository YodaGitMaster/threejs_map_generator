// Biome classification based on elevation, moisture, and temperature

export const BiomeType = {
    OCEAN: 0,
    BEACH: 1,
    GRASSLAND: 2,
    FOREST: 3,
    DESERT: 4,
    TUNDRA: 5,
    MOUNTAIN: 6,
    SNOW: 7,
    WETLAND: 8,
};

export const BiomeColors = {
    [BiomeType.OCEAN]: [0.1, 0.3, 0.6],
    [BiomeType.BEACH]: [0.9, 0.85, 0.6],
    [BiomeType.GRASSLAND]: [0.4, 0.7, 0.3],
    [BiomeType.FOREST]: [0.2, 0.5, 0.2],
    [BiomeType.DESERT]: [0.9, 0.8, 0.5],
    [BiomeType.TUNDRA]: [0.6, 0.7, 0.6],
    [BiomeType.MOUNTAIN]: [0.5, 0.5, 0.5],
    [BiomeType.SNOW]: [0.95, 0.95, 1.0],
    [BiomeType.WETLAND]: [0.3, 0.6, 0.5],
};

export class BiomeClassifier {
    constructor(config) {
        this.config = config;
        this.seaLevel = config.SEA_LEVEL;
    }
    
    // Classify a single tile's biome
    classify(elevation, moisture, temperature) {
        // Underwater
        if (elevation < this.seaLevel) {
            return BiomeType.OCEAN;
        }
        
        // Beach (just above sea level)
        if (elevation < this.seaLevel + 0.05) {
            return BiomeType.BEACH;
        }
        
        // High elevation = mountains/snow
        if (elevation > 0.8) {
            return temperature < 0.3 ? BiomeType.SNOW : BiomeType.MOUNTAIN;
        }
        
        // Cold regions
        if (temperature < 0.3) {
            return BiomeType.TUNDRA;
        }
        
        // Hot and dry = desert
        if (temperature > 0.7 && moisture < 0.4) {
            return BiomeType.DESERT;
        }
        
        // Wet regions
        if (moisture > 0.7) {
            return elevation < 0.55 ? BiomeType.WETLAND : BiomeType.FOREST;
        }
        
        // Medium moisture = forest or grassland
        if (moisture > 0.4) {
            return BiomeType.FOREST;
        }
        
        // Default = grassland
        return BiomeType.GRASSLAND;
    }
    
    // Generate biome map for entire terrain
    generateBiomeMap(elevationMap, moistureMap, temperatureMap) {
        const size = elevationMap.length;
        const biomeMap = new Uint8Array(size);
        
        for (let i = 0; i < size; i++) {
            biomeMap[i] = this.classify(
                elevationMap[i],
                moistureMap[i],
                temperatureMap[i]
            );
        }
        
        return biomeMap;
    }
    
    // Calculate terrain splat weights (grass, rock, sand, snow)
    calculateSplatWeights(elevation, biome, slope) {
        const weights = { grass: 0, rock: 0, sand: 0, snow: 0 };
        
        // Slope affects rock/grass distribution
        const steepness = Math.min(slope / 0.5, 1.0);
        
        switch (biome) {
            case BiomeType.OCEAN:
            case BiomeType.BEACH:
                weights.sand = 1.0;
                break;
                
            case BiomeType.DESERT:
                weights.sand = 0.8 - steepness * 0.3;
                weights.rock = 0.2 + steepness * 0.3;
                break;
                
            case BiomeType.SNOW:
                weights.snow = 1.0 - steepness * 0.4;
                weights.rock = steepness * 0.4;
                break;
                
            case BiomeType.MOUNTAIN:
                weights.rock = 0.6 + steepness * 0.4;
                weights.grass = 0.4 - steepness * 0.4;
                break;
                
            case BiomeType.TUNDRA:
                weights.snow = 0.4;
                weights.grass = 0.3 - steepness * 0.2;
                weights.rock = 0.3 + steepness * 0.2;
                break;
                
            case BiomeType.GRASSLAND:
                weights.grass = 0.9 - steepness * 0.5;
                weights.rock = 0.1 + steepness * 0.5;
                break;
                
            case BiomeType.FOREST:
                weights.grass = 0.8 - steepness * 0.4;
                weights.rock = 0.2 + steepness * 0.4;
                break;
                
            case BiomeType.WETLAND:
                weights.grass = 0.7;
                weights.sand = 0.3;
                break;
        }
        
        return weights;
    }
}

// Calculate slope from height field
export function calculateSlope(heightField, width, height, x, y, scale = 1.0) {
    if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) {
        return 0;
    }
    
    const idx = y * width + x;
    const h = heightField[idx];
    
    // Sample neighbors
    const hLeft = heightField[idx - 1];
    const hRight = heightField[idx + 1];
    const hUp = heightField[idx - width];
    const hDown = heightField[idx + width];
    
    // Calculate gradient
    const dx = (hRight - hLeft) * scale;
    const dy = (hDown - hUp) * scale;
    
    // Slope magnitude
    return Math.sqrt(dx * dx + dy * dy);
}

