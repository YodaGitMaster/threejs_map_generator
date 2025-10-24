// Hydraulic erosion simulation
// Simulates water flow to create realistic valleys and river networks

export class HydraulicErosion {
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }
    
    // Main erosion simulation
    erode(heightField, iterations, strength = 0.3) {
        const flow = new Float32Array(this.width * this.height);
        
        for (let iter = 0; iter < iterations; iter++) {
            // Calculate flow accumulation
            this._calculateFlow(heightField, flow);
            
            // Erode based on flow
            this._applyErosion(heightField, flow, strength);
        }
        
        return flow;
    }
    
    // Calculate water flow accumulation using D8 algorithm
    _calculateFlow(heights, flow) {
        flow.fill(1.0); // Start with base flow
        
        // Create order of cells from highest to lowest
        const cells = [];
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const idx = y * this.width + x;
                cells.push({ x, y, height: heights[idx] });
            }
        }
        cells.sort((a, b) => b.height - a.height);
        
        // Process cells from high to low
        for (const cell of cells) {
            const idx = cell.y * this.width + cell.x;
            let lowestNeighbor = null;
            let lowestHeight = cell.height;
            
            // Find lowest neighbor (D8: 8 directions)
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    
                    const nx = cell.x + dx;
                    const ny = cell.y + dy;
                    
                    if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                        const nIdx = ny * this.width + nx;
                        if (heights[nIdx] < lowestHeight) {
                            lowestHeight = heights[nIdx];
                            lowestNeighbor = nIdx;
                        }
                    }
                }
            }
            
            // Transfer flow to lowest neighbor
            if (lowestNeighbor !== null) {
                flow[lowestNeighbor] += flow[idx];
            }
        }
    }
    
    // Apply erosion based on flow
    _applyErosion(heights, flow, strength) {
        const maxFlow = Math.max(...flow);
        
        for (let i = 0; i < heights.length; i++) {
            // Normalize flow
            const normalizedFlow = flow[i] / maxFlow;
            
            // Erosion amount based on flow (more flow = more erosion)
            const erosion = Math.pow(normalizedFlow, 0.5) * strength * 0.01;
            
            // Apply erosion
            heights[i] -= erosion;
        }
        
        // Renormalize heights
        this._normalize(heights);
    }
    
    // Normalize array to [0, 1]
    _normalize(arr) {
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i] < min) min = arr[i];
            if (arr[i] > max) max = arr[i];
        }
        
        const range = max - min;
        if (range > 0) {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = (arr[i] - min) / range;
            }
        }
    }
}

// Apply thermal erosion (smoothing based on slope)
export function applyThermalErosion(heightField, width, height, iterations = 3, threshold = 0.05) {
    const temp = new Float32Array(heightField.length);
    
    for (let iter = 0; iter < iterations; iter++) {
        temp.set(heightField);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = y * width + x;
                const h = heightField[idx];
                
                // Check all 4 neighbors
                const neighbors = [
                    heightField[idx - 1],       // left
                    heightField[idx + 1],       // right
                    heightField[idx - width],   // up
                    heightField[idx + width],   // down
                ];
                
                let totalDiff = 0;
                let count = 0;
                
                for (const nh of neighbors) {
                    const diff = h - nh;
                    if (diff > threshold) {
                        totalDiff += diff;
                        count++;
                    }
                }
                
                if (count > 0) {
                    const erosion = (totalDiff / count) * 0.5;
                    temp[idx] -= erosion * 0.5;
                }
            }
        }
        
        heightField.set(temp);
    }
}

