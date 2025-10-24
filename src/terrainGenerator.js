// Main terrain generation pipeline
import { BiomeClassifier, calculateSlope } from './biomes.js';
import { HydraulicErosion, applyThermalErosion } from './erosion.js';
import { generateNoiseField } from './noise.js';

export class TerrainGenerator {
    constructor(config) {
        this.config = config;
        this.width = config.MAP_WIDTH;
        this.height = config.MAP_HEIGHT;
    }
    
    // Generate complete terrain data
    generate() {
        console.log('🌍 Generating terrain...');
        const start = performance.now();
        
        // Step 1: Generate noise fields
        console.log('  → Generating noise fields...');
        const elevation = this._generateElevation();
        const moisture = this._generateMoisture();
        const temperature = this._generateTemperature();
        
        // Step 2: Apply erosion
        console.log('  → Applying erosion...');
        const flowMap = this._applyErosion(elevation);
        
        // Step 3: Classify biomes
        console.log('  → Classifying biomes...');
        const biomes = this._classifyBiomes(elevation, moisture, temperature);
        
        // Step 4: Calculate splat weights
        console.log('  → Calculating terrain textures...');
        const splatWeights = this._calculateSplatWeights(elevation, biomes);
        
        const elapsed = performance.now() - start;
        console.log(`✓ Terrain generated in ${elapsed.toFixed(1)}ms`);
        
        return {
            elevation,
            moisture,
            temperature,
            flowMap,
            biomes,
            splatWeights,
            width: this.width,
            height: this.height,
        };
    }
    
    // Generate elevation map
    _generateElevation() {
        const seed = this.config.SEED;
        const params = this.config.NOISE_ELEV;
        
        const elevation = generateNoiseField(this.width, this.height, seed, params);
        
        // Flatten terrain to create more open, empty areas
        this._flattenTerrain(elevation);
        
        // Add random lakes
        this._addRandomLakes(elevation);
        
        // If water percentage is 0, ensure ALL terrain is above sea level
        const waterPercentage = this.config.WATER_PERCENTAGE || 0;
        if (waterPercentage === 0) {
            const seaLevel = this.config.SEA_LEVEL;
            for (let i = 0; i < elevation.length; i++) {
                if (elevation[i] < seaLevel) {
                    elevation[i] = seaLevel + 0.01; // Slightly above sea level
                }
            }
            console.log('🏜️ Water set to 0% - raised all terrain above sea level');
        }
        
        return elevation;
    }
    
    // Flatten terrain to create clearer flat zones (like RTS maps)
    _flattenTerrain(elevation) {
        for (let i = 0; i < elevation.length; i++) {
            let value = elevation[i];
            
            // Create distinct height levels (flatter areas)
            // This creates "steps" in terrain instead of smooth gradients
            if (value < 0.4) {
                value = value * 0.5; // Very flat low areas
            } else if (value < 0.6) {
                value = 0.3 + (value - 0.4) * 0.5; // Gentle mid-level
            } else if (value < 0.8) {
                value = 0.4 + (value - 0.6) * 1.5; // Hills
            } else {
                value = 0.7 + (value - 0.8) * 1.5; // Mountains
            }
            
            elevation[i] = Math.max(0, Math.min(1, value));
        }
    }
    
    // Add lakes based on percentage coverage with even distribution
    _addRandomLakes(elevation) {
        const seaLevel = this.config.SEA_LEVEL;
        const waterPercentage = this.config.WATER_PERCENTAGE || 0;
        if (waterPercentage <= 0) return;
        
        const totalCells = this.width * this.height;
        const targetWaterCells = Math.floor((waterPercentage / 100) * totalCells);
        
        console.log(`Creating lakes to cover ${waterPercentage}% of map (${targetWaterCells} cells out of ${totalCells})`);
        
        // Seeded random
        let seed = this.config.SEED + 5555;
        const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
        
        // Create grid for even distribution (divide map into cells)
        const gridSize = Math.max(3, Math.floor(Math.sqrt(waterPercentage / 5))); // More lakes as percentage increases
        const cellWidth = this.width / gridSize;
        const cellHeight = this.height / gridSize;
        
        // Generate lake centers in each grid cell (with some randomness)
        const lakeCenters = [];
        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                // Skip some grid cells randomly for variation (but not too many)
                if (random() < 0.3 && lakeCenters.length > gridSize) continue;
                
                // Place lake center within grid cell with offset
                const cx = Math.floor((gx + 0.3 + random() * 0.4) * cellWidth);
                const cy = Math.floor((gy + 0.3 + random() * 0.4) * cellHeight);
                lakeCenters.push({ cx, cy });
            }
        }
        
        console.log(`Generated ${lakeCenters.length} lake centers across ${gridSize}x${gridSize} grid`);
        
        // Calculate average lake size to meet target
        const avgLakeSize = targetWaterCells / lakeCenters.length;
        const avgRadius = Math.sqrt(avgLakeSize / Math.PI);
        
        let totalWaterCells = 0;
        let lakesCreated = 0;
        
        // Create lakes until we reach target coverage
        for (const {cx, cy} of lakeCenters) {
            // Variable radius around average
            const radiusX = Math.max(3, avgRadius * (0.7 + random() * 0.6));
            const radiusY = Math.max(3, avgRadius * (0.7 + random() * 0.6));
            const depth = 0.25 + random() * 0.15; // 0.25-0.40 below sea level
            
            let lakeCells = 0;
            
            // Create depression for lake
            for (let dy = -radiusY * 2; dy <= radiusY * 2; dy++) {
                for (let dx = -radiusX * 2; dx <= radiusX * 2; dx++) {
                    const x = cx + dx;
                    const y = cy + dy;
                    
                    if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
                    
                    // Elliptical falloff
                    const distX = dx / radiusX;
                    const distY = dy / radiusY;
                    const dist = Math.sqrt(distX * distX + distY * distY);
                    
                    if (dist < 1.0) {
                        const idx = y * this.width + x;
                        const oldHeight = elevation[idx];
                        
                        // Smooth falloff - FORCE depression below sea level
                        const factor = Math.cos(dist * Math.PI / 2);
                        const targetHeight = seaLevel - depth * factor;
                        const newHeight = Math.max(0, targetHeight);
                        
                        elevation[idx] = newHeight;
                        
                        if (newHeight <= seaLevel) {
                            lakeCells++;
                        }
                    }
                }
            }
            
            totalWaterCells += lakeCells;
            lakesCreated++;
            
            // Stop if we've exceeded target (with small tolerance)
            if (totalWaterCells >= targetWaterCells * 0.95) break;
        }
        
        const actualPercentage = (totalWaterCells / totalCells * 100).toFixed(1);
        console.log(`✅ Created ${lakesCreated} lakes covering ${totalWaterCells} cells (${actualPercentage}% of map, target: ${waterPercentage}%)`);
    }
    
    // Generate moisture map
    _generateMoisture() {
        const seed = this.config.SEED + 1000;
        const params = this.config.NOISE_MOIST;
        
        return generateNoiseField(this.width, this.height, seed, params);
    }
    
    // Generate temperature map
    _generateTemperature() {
        const seed = this.config.SEED + 2000;
        const params = this.config.NOISE_TEMP;
        const temp = generateNoiseField(this.width, this.height, seed, params);
        
        // Apply latitude gradient (colder at edges, warmer at center)
        for (let y = 0; y < this.height; y++) {
            const latitude = Math.abs(y / this.height - 0.5) * 2; // 0 at center, 1 at edges
            const latitudeFactor = 1.0 - latitude * 0.6;
            
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                temp[idx] *= latitudeFactor;
            }
        }
        
        return temp;
    }
    
    // Apply hydraulic erosion
    _applyErosion(elevation) {
        const erosion = new HydraulicErosion(this.width, this.height);
        const iterations = this.config.EROSION_ITERATIONS;
        const strength = this.config.EROSION_STRENGTH;
        
        const flowMap = erosion.erode(elevation, iterations, strength);
        
        // Also apply thermal erosion for smoothing
        applyThermalErosion(elevation, this.width, this.height, 3, 0.05);
        
        return flowMap;
    }
    
    // Classify biomes
    _classifyBiomes(elevation, moisture, temperature) {
        const classifier = new BiomeClassifier(this.config);
        return classifier.generateBiomeMap(elevation, moisture, temperature);
    }
    
    // Calculate splat weights for texturing
    _calculateSplatWeights(elevation, biomes) {
        const classifier = new BiomeClassifier(this.config);
        const weights = [];
        
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                const slope = calculateSlope(elevation, this.width, this.height, x, y, 10.0);
                const biome = biomes[idx];
                const elev = elevation[idx];
                
                const w = classifier.calculateSplatWeights(elev, biome, slope);
                weights.push(w);
            }
        }
        
        return weights;
    }
    
    // Sample height at world position (bilinear interpolation)
    sampleHeight(terrainData, worldX, worldZ) {
        const { elevation, width, height } = terrainData;
        
        // Convert to grid coordinates
        const fx = (worldX / this.config.MAP_WIDTH) * width;
        const fz = (worldZ / this.config.MAP_HEIGHT) * height;
        
        // Clamp
        const x = Math.max(0, Math.min(width - 2, Math.floor(fx)));
        const z = Math.max(0, Math.min(height - 2, Math.floor(fz)));
        
        const tx = fx - x;
        const tz = fz - z;
        
        // Bilinear interpolation
        const h00 = elevation[z * width + x];
        const h10 = elevation[z * width + x + 1];
        const h01 = elevation[(z + 1) * width + x];
        const h11 = elevation[(z + 1) * width + x + 1];
        
        const h0 = h00 * (1 - tx) + h10 * tx;
        const h1 = h01 * (1 - tx) + h11 * tx;
        
        return h0 * (1 - tz) + h1 * tz;
    }
}

