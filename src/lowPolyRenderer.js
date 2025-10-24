// Low-poly terrain rendering (flat shading, discrete colors)
import * as THREE from 'three';

export class LowPolyTerrainBuilder {
    constructor(config, grid) {
        this.config = config;
        this.grid = grid;
    }
    
    // Build low-poly terrain mesh with flat shading
    buildLowPolyTerrain(terrainData) {
        const { elevation, width, height } = terrainData;
        
        console.log('🎨 Building low-poly terrain...');
        
        // Create merged geometry
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];
        const indices = [];
        
        let vertexIndex = 0;
        
        // Generate tile positions
        const { octagons } = this.grid.generateTiles();
        
        // Build each octagon
        octagons.forEach(tile => {
            this._addOctagonToGeometry(
                tile, 
                elevation, 
                width, 
                height, 
                vertices, 
                colors, 
                indices, 
                vertexIndex
            );
            vertexIndex += 9; // 8 perimeter + 1 center
        });
        
        // Debug: Check if arrays are populated
        if (vertices.length === 0 || indices.length === 0) {
            console.error('ERROR: Empty geometry arrays!', { vertices: vertices.length, indices: indices.length });
            return null;
        }
        
        // Set attributes
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setIndex(indices);
        
        // CRITICAL: Compute normals AFTER setting indices
        geometry.computeVertexNormals();
        
        // Debug output
        console.log(`Geometry stats:`, {
            vertices: vertices.length / 3,
            triangles: indices.length / 3,
            hasPosition: geometry.attributes.position !== undefined,
            hasColor: geometry.attributes.color !== undefined,
            hasIndex: geometry.index !== null
        });
        
        // Create material with vertex colors and flat shading
        const material = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        
        // Verify mesh is valid
        console.log(`Mesh created:`, {
            visible: mesh.visible,
            hasGeometry: mesh.geometry !== null,
            hasMaterial: mesh.material !== null
        });
        
        console.log(`✓ Built ${octagons.length} low-poly octagons`);
        
        return mesh;
    }
    
    // Add single octagon to geometry
    _addOctagonToGeometry(tile, elevation, width, height, vertices, colors, indices, startIdx) {
        // Get height at this tile's grid position
        const h = this._sampleHeight(elevation, width, height, tile.gridX, tile.gridY);
        
        // Apply height scaling
        const heightMeters = h * this.config.ELEVATION_SCALE;
        
        // Flatten underwater areas to sea level
        const seaLevel = this.config.SEA_LEVEL * this.config.ELEVATION_SCALE;
        const finalHeight = heightMeters < seaLevel ? seaLevel : heightMeters;
        
        // Get color for this height
        const color = this._getHeightColor(finalHeight);
        
        // Add center vertex
        const jitter = this.config.VERTEX_JITTER;
        const jx = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;
        const jz = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;
        
        vertices.push(tile.x + jx, finalHeight, tile.z + jz);
        colors.push(color.r, color.g, color.b);
        
        // Add perimeter vertices
        const radius = this.grid.radius;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI / 4) * i;
            const x = tile.x + radius * Math.cos(angle);
            const z = tile.z + radius * Math.sin(angle);
            
            // Sample height at this vertex position
            const vx = (x / (this.config.MAP_WIDTH * this.grid.spacing)) * width;
            const vz = (z / (this.config.MAP_HEIGHT * this.grid.spacing)) * height;
            const vh = this._sampleHeightBilinear(elevation, width, height, vx, vz);
            const vHeight = vh * this.config.ELEVATION_SCALE;
            const finalVHeight = vHeight < seaLevel ? seaLevel : vHeight;
            
            // Add slight jitter
            const vjx = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;
            const vjz = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;
            
            vertices.push(x + vjx, finalVHeight, z + vjz);
            colors.push(color.r, color.g, color.b);
        }
        
        // Add indices (triangle fan from center)
        // CRITICAL: Ensure correct winding order for front faces
        for (let i = 0; i < 8; i++) {
            const nextI = (i + 1) % 8;
            indices.push(
                startIdx,               // center
                startIdx + 1 + i,       // current perimeter vertex
                startIdx + 1 + nextI    // next perimeter vertex
            );
        }
    }
    
    // Get discrete color based on height (low-poly style)
    _getHeightColor(height) {
        const seaLevel = this.config.SEA_LEVEL * this.config.ELEVATION_SCALE;
        
        // Discrete color bands
        if (height <= seaLevel) {
            return new THREE.Color(0x3a8bc6);  // Blue water
        } else if (height <= seaLevel + 5) {
            return new THREE.Color(0xf4e4a6);  // Sandy beach
        } else if (height <= 15) {
            return new THREE.Color(0x52a049);  // Green grass
        } else if (height <= 25) {
            return new THREE.Color(0x7d9b5a);  // Light green hills
        } else if (height <= 35) {
            return new THREE.Color(0xa89968);  // Tan mountains
        } else if (height <= 45) {
            return new THREE.Color(0x8b8b8b);  // Gray peaks
        } else {
            return new THREE.Color(0xf0f0f0);  // White snow
        }
    }
    
    // Sample height from elevation map (nearest neighbor)
    _sampleHeight(elevation, width, height, gridX, gridY) {
        const x = Math.floor((gridX / this.config.MAP_WIDTH) * width);
        const y = Math.floor((gridY / this.config.MAP_HEIGHT) * height);
        
        const clampedX = Math.max(0, Math.min(width - 1, x));
        const clampedY = Math.max(0, Math.min(height - 1, y));
        
        return elevation[clampedY * width + clampedX];
    }
    
    // Sample height with bilinear interpolation
    _sampleHeightBilinear(elevation, width, height, fx, fz) {
        const x = Math.max(0, Math.min(width - 2, Math.floor(fx)));
        const z = Math.max(0, Math.min(height - 2, Math.floor(fz)));
        
        const tx = fx - x;
        const tz = fz - z;
        
        const h00 = elevation[z * width + x];
        const h10 = elevation[z * width + x + 1];
        const h01 = elevation[(z + 1) * width + x];
        const h11 = elevation[(z + 1) * width + x + 1];
        
        const h0 = h00 * (1 - tx) + h10 * tx;
        const h1 = h01 * (1 - tx) + h11 * tx;
        
        return h0 * (1 - tz) + h1 * tz;
    }
}

