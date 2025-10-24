// Octagon 4.8.8 tiling system
// Each octagon is surrounded by 4 squares and connects to 8 other octagons

/**
 * 4.8.8 Tiling Layout:
 * - Regular octagons as primary tiles
 * - Small squares fill gaps between octagons
 * - Each octagon touches 8 other octagons and 4 squares
 */

export class OctagonGrid {
    constructor(config) {
        this.config = config;
        this.apothem = config.OCT_APOTHEM;
        
        // Octagon metrics
        this.radius = this.apothem / Math.cos(Math.PI / 8);  // center to vertex
        this.side = this.radius * Math.sin(Math.PI / 8) * 2; // edge length
        
        // Grid spacing (center to center of adjacent octagons)
        // In 4.8.8 tiling: spacing = 2*apothem + square_side
        // For regular 4.8.8: square_side = side of octagon
        this.squareSide = this.side;
        this.spacing = 2 * this.apothem + this.squareSide;
        
        // Offset for alternating rows (brick pattern)
        this.rowOffset = this.spacing * 0.5;
    }
    
    // Get world position for octagon at grid coordinates
    getOctagonPosition(gridX, gridY) {
        const x = gridX * this.spacing + (gridY % 2) * this.rowOffset;
        const z = gridY * this.spacing;
        return { x, z };
    }
    
    // Get positions of 4 connector squares around an octagon
    getSquarePositions(gridX, gridY) {
        const octPos = this.getOctagonPosition(gridX, gridY);
        const offset = this.apothem + this.squareSide * 0.5;
        
        return [
            { x: octPos.x + offset, z: octPos.z, gridX, gridY, dir: 'E' },  // East
            { x: octPos.x - offset, z: octPos.z, gridX, gridY, dir: 'W' },  // West
            { x: octPos.x, z: octPos.z + offset, gridX, gridY, dir: 'S' },  // South
            { x: octPos.x, z: octPos.z - offset, gridX, gridY, dir: 'N' },  // North
        ];
    }
    
    // Generate all tile positions for the map
    generateTiles() {
        const { MAP_WIDTH, MAP_HEIGHT } = this.config;
        const octagons = [];
        const squares = [];
        
        for (let y = 0; y < MAP_HEIGHT; y++) {
            for (let x = 0; x < MAP_WIDTH; x++) {
                const pos = this.getOctagonPosition(x, y);
                octagons.push({
                    gridX: x,
                    gridY: y,
                    x: pos.x,
                    z: pos.z,
                    type: 'octagon'
                });
                
                // Add connector squares (avoiding duplicates at edges)
                const squarePos = this.getSquarePositions(x, y);
                
                // Only add East and South squares to avoid duplicates
                if (x < MAP_WIDTH - 1) {
                    squares.push({ ...squarePos[0], type: 'square' });
                }
                if (y < MAP_HEIGHT - 1) {
                    squares.push({ ...squarePos[2], type: 'square' });
                }
            }
        }
        
        return { octagons, squares };
    }
    
    // Create octagon geometry vertices (flat shape, Y=0)
    createOctagonVertices() {
        const vertices = [];
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI / 4) * i;  // 8 vertices, 45° apart
            const x = this.radius * Math.cos(angle);
            const z = this.radius * Math.sin(angle);
            vertices.push(x, 0, z);
        }
        return vertices;
    }
    
    // Create square geometry vertices
    createSquareVertices() {
        const half = this.squareSide * 0.5;
        return [
            -half, 0, -half,
             half, 0, -half,
             half, 0,  half,
            -half, 0,  half,
        ];
    }
    
    // Create indices for octagon (triangle fan from center)
    createOctagonIndices() {
        const indices = [];
        // Triangle fan: center (8) + 8 perimeter vertices
        for (let i = 0; i < 8; i++) {
            indices.push(8, i, (i + 1) % 8);
        }
        return indices;
    }
    
    // Create indices for square (2 triangles)
    createSquareIndices() {
        return [
            0, 1, 2,
            0, 2, 3
        ];
    }
    
    // Grid to world coordinate conversion helpers
    worldToGrid(worldX, worldZ) {
        const gridY = Math.floor(worldZ / this.spacing);
        const offset = (gridY % 2) * this.rowOffset;
        const gridX = Math.floor((worldX - offset) / this.spacing);
        return { gridX, gridY };
    }
}

