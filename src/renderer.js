// Three.js rendering system
import * as THREE from 'three';
import { LowPolyTerrainBuilder } from './lowPolyRenderer.js';
import {
    createHeightTexture,
    createSplatTexture,
    createTerrainMaterial,
    createWaterMaterial
} from './materials.js';
import { OctagonGrid } from './octagonGrid.js';
import { calculateTreeMetrics, generateTreePositions } from './treePlacement.js';

// Low‑poly knobs for Guide Mode
const LOW_POLY = {
    stepMeters: 3,      // height quantization step (meters)
};

export class TerrainRenderer {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.grid = new OctagonGrid(config);
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        this.octagonMesh = null;
        this.squareMesh = null;
        this.waterMesh = null;
        this.treeMeshes = [];
        this.gridMesh = null;
        
        this.chunks = [];
        
        this._initScene();
        this._initCamera();
        this._initRenderer();
        this._initLighting();
        this._initControls();
    }
    
    _initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
        this.scene.fog = new THREE.Fog(0xb0c4de, 200, 500);
        this.fogEnabled = true;
    }
    
    _initCamera() {
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        
        this.cameraTarget = new THREE.Vector3();
        this.cameraTarget.set(
            (this.config.MAP_WIDTH * this.grid.spacing) / 2,
            0,
            (this.config.MAP_HEIGHT * this.grid.spacing) / 2
        );
        
        // Set initial camera position based on mode
        this.setCameraMode(this.config.CAMERA_MODE);
    }
    
    _initRenderer() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (!gl) {
                throw new Error('WebGL is not supported by this browser');
            }
            
            this.renderer = new THREE.WebGLRenderer({ 
                antialias: true,
                powerPreference: 'high-performance',
                alpha: false
            });
            
            const width = this.container.clientWidth || window.innerWidth;
            const height = this.container.clientHeight || window.innerHeight;
            
            if (width === 0 || height === 0) {
                throw new Error(`Invalid renderer dimensions: ${width}x${height}`);
            }
            
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(1);
            
            this.renderer.domElement.style.display = 'block';
            this.renderer.domElement.style.position = 'absolute';
            this.renderer.domElement.style.top = '0';
            this.renderer.domElement.style.left = '0';
            this.renderer.domElement.style.zIndex = '1';
            
            this.container.appendChild(this.renderer.domElement);
            
            if (!document.contains(this.renderer.domElement)) {
                throw new Error('Canvas element failed to attach to DOM');
            }
            
            this.renderer.setClearColor(0x87ceeb, 1);
            this.renderer.clear();
            
            window.addEventListener('resize', () => this._onResize());
            
        } catch (error) {
            console.error('❌ Renderer initialization failed:', error);
            this.container.innerHTML = `<div style="color:white;padding:20px;background:red;z-index:9999;position:relative;">
                <h2>WebGL Initialization Failed</h2>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>Try: Update browser, enable hardware acceleration, or use Chrome/Firefox</p>
            </div>`;
            throw error;
        }
    }
    
    _initLighting() {
        // Hemisphere + soft sun for low‑poly vibe
        const hemi = new THREE.HemisphereLight(0xdedede, 0x5a7b79, 0.9);
        this.scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xffffff, 0.4);
        sun.position.set(60, 100, 40);
        this.scene.add(sun);
    }
    
    _initControls() {
        this.zoom = 1.0;
        this.rotation = 0; // Rotation angle in degrees
        this.mouseRotationEnabled = true;
        this.isDragging = false;
        this.lastMouseX = 0;
        
        // Mouse drag rotation
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousedown', (e) => {
            if (this.mouseRotationEnabled) {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                canvas.style.cursor = 'grabbing';
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging && this.mouseRotationEnabled) {
                const deltaX = e.clientX - this.lastMouseX;
                // Convert pixel movement to rotation (sensitivity: 0.5 degrees per pixel)
                this.rotation += deltaX * 0.5;
                // Normalize to 0-360
                this.rotation = ((this.rotation % 360) + 360) % 360;
                this._updateCameraFromMode();
                this.lastMouseX = e.clientX;
            }
        });
        
        canvas.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                canvas.style.cursor = this.mouseRotationEnabled ? 'grab' : 'default';
            }
        });
        
        canvas.addEventListener('mouseleave', () => {
            if (this.isDragging) {
                this.isDragging = false;
                canvas.style.cursor = this.mouseRotationEnabled ? 'grab' : 'default';
            }
        });
        
        // Mouse wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.1 : -0.1;
            this.zoom = Math.max(0.3, Math.min(8.0, this.zoom + delta));
            this._updateCameraFromMode();
            
            // Auto-disable fog when zoomed out (zoom > 1.5x)
            this._updateFogBasedOnZoom();
            
            // Update zoom slider if it exists
            const zoomSlider = document.getElementById('zoomLevel');
            const zoomValue = document.getElementById('zoomValue');
            if (zoomSlider) {
                zoomSlider.value = this.zoom;
            }
            if (zoomValue) {
                zoomValue.textContent = this.zoom.toFixed(1) + 'x';
            }
        }, { passive: false });
        
        // Set initial cursor
        canvas.style.cursor = this.mouseRotationEnabled ? 'grab' : 'default';
    }
    
    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    buildTerrain(terrainData) {
        this._clearTerrain();
        
        // Update camera target to new map center
        this.cameraTarget.set(
            (this.config.MAP_WIDTH * this.grid.spacing) / 2,
            0,
            (this.config.MAP_HEIGHT * this.grid.spacing) / 2
        );
        
        // Reset rotation to 0 when regenerating map to ensure proper centering
        this.rotation = 0;
        
        // Update camera position based on new center
        this._updateCameraFromMode();
        
        // Update fog based on current zoom level
        this._updateFogBasedOnZoom();
        
        if (this.config.GUIDE_MODE) {
            this._buildGuidePlaneTerrain(terrainData);
        } else if (this.config.LOW_POLY_MODE) {
            this._buildLowPolyTerrain(terrainData);
        } else {
            this._buildStandardTerrain(terrainData);
        }
        
        // Water rendering
        if (this.config.SHOW_WATER) {
            if (this.config.GUIDE_MODE) {
                // Add a smooth water surface at solved sea level for low‑poly look
                this._buildFlatWater();
            } else {
                this._buildWaterMesh();
            }
        }
    }

    _showCoverageOverlay(text) {
        if (!this._covEl) {
            const el = document.createElement('div');
            el.style.position = 'fixed';
            el.style.left = '10px';
            el.style.bottom = '10px';
            el.style.padding = '4px 6px';
            el.style.background = 'rgba(0,0,0,0.4)';
            el.style.color = '#fff';
            el.style.font = '12px monospace';
            el.style.zIndex = '1000';
            document.body.appendChild(el);
            this._covEl = el;
        }
        this._covEl.textContent = text;
    }

    _buildFlatWater() {
        // Create a semi-transparent water plane at sea level
        // It will only be visible where terrain is below sea level (lakes)
        const sizeX = this.config.MAP_WIDTH * this.grid.spacing;
        const sizeZ = this.config.MAP_HEIGHT * this.grid.spacing;
        // Prefer solved sea level from last generated terrain if available
        const waterHeight = (this.lastTerrainData && typeof this.lastTerrainData.seaLevel === 'number')
            ? this.lastTerrainData.seaLevel
            : (this.config.SEA_LEVEL * this.config.ELEVATION_SCALE);
        
        console.log('Building water plane at sea level:', { sizeX, sizeZ, waterHeight });
        
        const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, 1, 1);
        geometry.rotateX(-Math.PI / 2);
        
        // Semi-transparent water material with slight blue tint
        const material = new THREE.MeshLambertMaterial({ 
            color: 0x5ab8e8,        // Brighter low‑poly water
            transparent: true,
            opacity: 0.65,          // Semi‑transparent
            flatShading: false,     // Smooth for water
            side: THREE.DoubleSide
        });
        
        const plane = new THREE.Mesh(geometry, material);
        plane.position.set(sizeX / 2, waterHeight, sizeZ / 2);
        plane.renderOrder = 2; // Render after terrain
        
        // Store initial height for wave animation
        plane.userData.baseHeight = waterHeight;
        plane.userData.baseOpacity = 0.6;
        
        this.waterMesh = plane;
        this.scene.add(plane);
        
        console.log('✅ Water plane added at height:', waterHeight);
    }
    
    // Animate water waves
    animateWater(time) {
        if (!this.waterMesh) return;
        
        // Gentle wave motion: up and down (low‑poly friendly)
        const waveAmplitude = 0.2; // meters
        const waveSpeed = 0.5; // slower for calmer water
        const waveHeight = Math.sin(time * waveSpeed) * waveAmplitude;
        
        // Update water height
        this.waterMesh.position.y = this.waterMesh.userData.baseHeight + waveHeight;
        
        // Subtle opacity pulse
        const opacityRange = 0.1;
        const opacity = this.waterMesh.userData.baseOpacity + Math.sin(time * 0.5) * opacityRange;
        this.waterMesh.material.opacity = opacity;
    }

    // Build terrain using guide's PlaneGeometry approach
    _buildGuidePlaneTerrain(terrainData) {
        const { elevation, width, height, seaLevel: seaLevelMeters } = terrainData;
        
        try {
        
        // elevation is Float32Array in METERS (v1.1)
        // seaLevel is in METERS
        // Apply quantization ONLY for visual mesh
        
        // Create plane with width/height segments equal to data dimensions
        const geo = new THREE.PlaneGeometry(width, height, width, height);
        // Rotate to XZ plane
        geo.rotateX(-Math.PI / 2);
        
        // Assign heights from elevation map (quantized for crisp facets)
        const pos = geo.attributes.position;
        const quantizationStep = this.config.QUANTIZATION_STEP || LOW_POLY.stepMeters;
        
        for (let j = 0; j <= height; j++) {
            for (let i = 0; i <= width; i++) {
                const vIndex = j * (width + 1) + i;
                const pIndex = vIndex * 3 + 1; // Y component after rotation
                const x = Math.min(width - 1, i);
                const y = Math.min(height - 1, j);
                
                // If terrainData provided seaLevel, we assume meters (v1.1);
                // otherwise, old generator uses normalized 0..1, so scale to meters here
                let h = elevation[y * width + x];
                if (typeof seaLevelMeters === 'undefined') {
                    h *= this.config.ELEVATION_SCALE;
                }
                
                // Quantize height for low-poly look (visual only)
                h = Math.round(h / quantizationStep) * quantizationStep;
                
                pos.array[pIndex] = h;
            }
        }
        pos.needsUpdate = true;
        
        // Compute normals suitable for flat shading
        // Some Three.js versions don't expose computeFlatVertexNormals.
        // Convert to non-indexed geometry and compute normals.
        const nonIndexed = geo.toNonIndexed();
        nonIndexed.computeVertexNormals();
        
        // Replace geometry reference with non-indexed version
        // (color attribute will be set on this geometry below)
        const geoRef = nonIndexed;
        
        // Per-face colors
        const colorAttr = new THREE.BufferAttribute(new Float32Array(geoRef.attributes.position.count * 3), 3);
        geoRef.setAttribute('color', colorAttr);
        
        const setFaceColor = (a, b, c, color) => {
            colorAttr.setXYZ(a, color.r, color.g, color.b);
            colorAttr.setXYZ(b, color.r, color.g, color.b);
            colorAttr.setXYZ(c, color.r, color.g, color.b);
        };
        
        // seaLevelMeters comes from terrainData (v1.1)
        const seaLevelM = seaLevelMeters || (this.config.SEA_LEVEL * this.config.ELEVATION_SCALE);
        console.log('Sea level in meters:', seaLevelM);

        // Compute dynamic bands based on actual elevation range
        let minH = Infinity, maxH = -Infinity;
        const posArr = geoRef.attributes.position.array;
        for (let i = 1; i < posArr.length; i += 3) {
            const h = posArr[i];
            if (h < minH) minH = h;
            if (h > maxH) maxH = h;
        }
        const range = Math.max(1e-3, maxH - minH);
        const grassTop = seaLevelM + 0.25 * range;
        const hillTop  = seaLevelM + 0.55 * range;
        const rockTop  = seaLevelM + 0.80 * range;
        
        let waterFaceCount = 0;
        const getColor = (h) => {
            // Vibrant low‑poly bands
            if (h <= seaLevelM) {
                waterFaceCount++;
                return new THREE.Color(0x4a9fd8); // water (darker blue for lakes)
            }
            if (h <= seaLevelM + 3)      return new THREE.Color(0xf0de9a); // beach
            if (h <= grassTop)           return new THREE.Color(0x3db44a); // grass
            if (h <= hillTop)            return new THREE.Color(0x6cb35a); // hills
            if (h <= rockTop)            return new THREE.Color(0xa88d7a); // rock
            if (h <= maxH)               return new THREE.Color(0x9a9a9a); // granite
            return new THREE.Color(0xf2f2f2);                               // snow white
        };
        
        // Color per face using average height
        const indexArray = geoRef.index ? geoRef.index.array : null;
        const positions = geoRef.attributes.position.array;
        let colorSamples = [];
        let waterFaces = 0;
        if (indexArray) {
            for (let f = 0; f < indexArray.length; f += 3) {
                const ia = indexArray[f] * 3 + 1;
                const ib = indexArray[f + 1] * 3 + 1;
                const ic = indexArray[f + 2] * 3 + 1;
                const avg = (positions[ia] + positions[ib] + positions[ic]) / 3;
                const col = getColor(avg);
                setFaceColor(indexArray[f], indexArray[f + 1], indexArray[f + 2], col);
                if (f < 30) colorSamples.push({ avg, col: col.getHexString() });
                if (avg <= seaLevelM) waterFaces++;
            }
        } else {
            // Non-indexed: iterate by 3 vertices per face
            for (let i = 0; i < positions.length; i += 9) {
                const aY = positions[i + 1];
                const bY = positions[i + 4];
                const cY = positions[i + 7];
                const avg = (aY + bY + cY) / 3;
                const col = getColor(avg);
                const vIndex = i / 3; // vertex index (per component)
                setFaceColor(vIndex + 0, vIndex + 1, vIndex + 2, col);
                if (i < 270) colorSamples.push({ avg, col: col.getHexString() });
                if (avg <= seaLevelM) waterFaces++;
            }
        }
        colorAttr.needsUpdate = true;
        
        console.log(`🌊 Water faces rendered: ${waterFaces} (blue color at or below ${seaLevelM}m)`);
        console.log('Sample face colors (first 10):', colorSamples.slice(0, 10));

        // Debug overlay: show visual water coverage vs target
        const totalFaces = indexArray ? indexArray.length / 3 : positions.length / 9;
        const waterPct = ((waterFaces / totalFaces) * 100).toFixed(1);
        const targetPct = (this.config.WATER_PERCENTAGE || 0).toFixed(1);
        this._showCoverageOverlay(`Water visual: ${waterPct}% | target: ${targetPct}%`);
        
        // Flat‑shaded Lambert material
        const mat = new THREE.MeshLambertMaterial({
            vertexColors: true,
            flatShading: true,
            side: THREE.DoubleSide,
        });
        
        const mesh = new THREE.Mesh(geoRef, mat);
        
        // Scale plane to world spacing (so water aligns). Add a tiny Z-fight offset via renderOrder
        mesh.scale.set(this.grid.spacing, 1, this.grid.spacing);
        mesh.renderOrder = 1;
        
        // Center it
        mesh.position.set(
            (this.config.MAP_WIDTH * this.grid.spacing) / 2,
            0,
            (this.config.MAP_HEIGHT * this.grid.spacing) / 2
        );
        
        this.octagonMesh = mesh;
        this.scene.add(mesh);
        
        // Add low‑poly props using legacy geometry sampling
        this._spawnLowPolyTrees(geoRef, mesh);
        console.log('Trees spawned, treeMeshes count:', this.treeMeshes.length);
        
        } catch (error) {
            console.error('❌ GUIDE terrain build failed:', error);
            throw error;
        }
    }

    _spawnLowPolyTrees(geoRef, terrainMesh) {
        const forestPercentage = this.config.FOREST_PERCENTAGE || 0;
        if (forestPercentage <= 0) return;
        const sea = this.config.SEA_LEVEL * this.config.ELEVATION_SCALE;
        
        // Calculate tree count based on percentage of available land
        // First, estimate green area (rough approximation: ~40% of above-water land)
        const totalCells = this.config.MAP_WIDTH * this.config.MAP_HEIGHT;
        const waterPercentage = this.config.WATER_PERCENTAGE || 0;
        const landCells = totalCells * (100 - waterPercentage) / 100;
        const greenCells = landCells * 0.6; // Approximate 60% of land is green
        const targetTreeCells = greenCells * forestPercentage / 100;
        
        // Tree density: approximately 1 tree per 3-5 cells for visual appeal
        const count = Math.floor(targetTreeCells / 3);
        
        console.log(`Forest coverage: ${forestPercentage}% → ~${count} trees (land cells: ${landCells.toFixed(0)}, green: ${greenCells.toFixed(0)})`);

        // Two instanced meshes: trunk and crown
        const trunkGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.0, 5);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x775533, flatShading: true });
        const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);

        const crownGeo = new THREE.ConeGeometry(0.8, 1.8, 6);
        crownGeo.translate(0, 1.2, 0);
        const crownMat = new THREE.MeshLambertMaterial({ color: 0x28cc49, flatShading: true });
        const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);

        const dummy = new THREE.Object3D();
        const pos = geoRef.attributes.position.array;
        let placed = 0;
        
        const mapSizeX = this.config.MAP_WIDTH * this.grid.spacing;
        const mapSizeZ = this.config.MAP_HEIGHT * this.grid.spacing;
        
        // Seeded random for consistent patches with same seed
        const random = this._seededRandom(this.config.SEED + 999);
        
        // Helper function to get height and color at world position (define first!)
        const getTerrainDataAt = (wx, wz) => {
            // Convert world pos to terrain mesh local space
            const lx = (wx - terrainMesh.position.x) / terrainMesh.scale.x;
            const lz = (wz - terrainMesh.position.z) / terrainMesh.scale.z;
            
            // Find closest face and get height + color
            let closestDist = Infinity;
            let closestHeight = 0;
            let closestColorIndex = 0;
            
            for (let i = 0; i < pos.length && i < 30000; i += 9) { // Limit search for performance
                const ax = pos[i + 0], ay = pos[i + 1], az = pos[i + 2];
                const cxn = ax, czn = az;
                const dist = Math.sqrt((cxn - lx) * (cxn - lx) + (czn - lz) * (czn - lz));
                if (dist < closestDist) {
                    closestDist = dist;
                    closestHeight = ay;
                    closestColorIndex = i / 3; // vertex index for color lookup
                }
            }
            
            // Get color from color attribute
            const colorAttr = geoRef.attributes.color;
            const r = colorAttr.getX(closestColorIndex);
            const g = colorAttr.getY(closestColorIndex);
            const b = colorAttr.getZ(closestColorIndex);
            
            return { height: closestHeight, r, g, b };
        };
        
        // Scan terrain to find green areas first
        console.log('🔍 Scanning terrain for green areas...');
        const greenLocations = [];
        const sampleStep = 10; // Sample every 10 units
        const beachHeight = sea + 4; // 21.5m (beach threshold)
        let skippedWaterCount = 0;
        
        for (let x = 0; x < mapSizeX; x += sampleStep) {
            for (let z = 0; z < mapSizeZ; z += sampleStep) {
                const data = getTerrainDataAt(x, z);
                
                // SKIP water and beach areas entirely (height-based)
                if (data.height <= beachHeight) {
                    skippedWaterCount++;
                    continue;
                }
                
                // Check if this location is green
                if (data.g > data.r + 0.15 && data.g > data.b + 0.15 && data.g > 0.4) {
                    greenLocations.push({ x, z });
                }
            }
        }
        
        console.log(`   Skipped ${skippedWaterCount} water/beach sample points`);
        
        console.log(`   Found ${greenLocations.length} green sample points`);
        
        if (greenLocations.length === 0) {
            console.warn('⚠️ No green areas found on terrain! Trees cannot be placed.');
            return;
        }
        
        // Create patches with EVEN DISTRIBUTION across map (grid-based)
        const numPatches = Math.max(5, Math.floor(count / 30)); // More patches for better distribution
        const gridSize = Math.ceil(Math.sqrt(numPatches));
        const cellSizeX = mapSizeX / gridSize;
        const cellSizeZ = mapSizeZ / gridSize;
        
        const patches = [];
        console.log(`   Creating ${numPatches} tree patches across ${gridSize}x${gridSize} grid`);
        
        // Generate patch centers in grid cells, using nearest green location
        for (let gz = 0; gz < gridSize; gz++) {
            for (let gx = 0; gx < gridSize; gx++) {
                if (patches.length >= numPatches) break;
                
                // Target center of grid cell
                const targetX = (gx + 0.5) * cellSizeX;
                const targetZ = (gz + 0.5) * cellSizeZ;
                
                // Find closest green location to this grid cell center
                let closestGreen = greenLocations[0];
                let minDist = Infinity;
                for (const loc of greenLocations) {
                    const dx = loc.x - targetX;
                    const dz = loc.z - targetZ;
                    const dist = dx * dx + dz * dz;
                    if (dist < minDist) {
                        minDist = dist;
                        closestGreen = loc;
                    }
                }
                
                patches.push({
                    x: closestGreen.x,
                    z: closestGreen.z,
                    radius: 10 + random() * 15, // 10-25 unit radius
                    density: 0.4 + random() * 0.3 // 40-70% density
                });
            }
            if (patches.length >= numPatches) break;
        }
        
        console.log(`   Generated ${patches.length} evenly distributed patches`);
        
        // Place trees in patches
        let attempts = 0;
        const maxAttempts = count * 3;
        let rejectedColor = 0;
        let rejectedBounds = 0;
        let rejectedDensity = 0;
        
        // Look for ANY green terrain (grass 0x3db44a OR hillside 0x6cb35a)
        // We'll check if green channel is dominant
        const colorTolerance = 0.15;
        
        console.log(`🌳 Tree placement - looking for ANY green terrain (grass or hillside)`);
        
        let colorSamples = [];
        
        while (placed < count && attempts < maxAttempts) {
            attempts++;
            
            // Pick random patch
            const patch = patches[Math.floor(random() * patches.length)];
            
            // Random position within patch
            const angle = random() * Math.PI * 2;
            const dist = random() * patch.radius;
            const wx = patch.x + Math.cos(angle) * dist;
            const wz = patch.z + Math.sin(angle) * dist;
            
            // Check if within map bounds
            if (wx < 0 || wx > mapSizeX || wz < 0 || wz > mapSizeZ) {
                rejectedBounds++;
                continue;
            }
            
            // Density check
            if (random() > patch.density) {
                rejectedDensity++;
                continue;
            }
            
            // Get height and color at this position
            const terrainData = getTerrainDataAt(wx, wz);
            const wy = terrainData.height;
            
            // PRE-PLACEMENT VALIDATION: Check if in water or beach BEFORE placing
            const beachHeightCheck = sea + 4; // 21.5m
            const isInWater = wy <= sea;
            const isOnBeach = wy > sea && wy <= beachHeightCheck;
            
            if (isInWater || isOnBeach) {
                rejectedColor++; // Count as rejected
                continue; // Skip this location
            }
            
            // Log first few color samples for debugging
            if (colorSamples.length < 10) {
                colorSamples.push({
                    r: terrainData.r.toFixed(2),
                    g: terrainData.g.toFixed(2),
                    b: terrainData.b.toFixed(2),
                    height: wy.toFixed(1)
                });
            }
            
            // Only place trees on green areas (any green terrain)
            // Check if green channel is dominant and color is greenish
            // Green should be higher than red and blue by a significant amount
            const isGreen = 
                terrainData.g > terrainData.r + colorTolerance &&
                terrainData.g > terrainData.b + colorTolerance &&
                terrainData.g > 0.4; // Green channel should be reasonably bright
            
            if (!isGreen) {
                rejectedColor++;
                continue;
            }
            
            // Place tree at ground level
            const scale = 0.7 + random() * 0.6;
            dummy.position.set(wx, wy, wz);
            dummy.scale.setScalar(scale);
            dummy.rotation.y = random() * Math.PI * 2;
            dummy.updateMatrix();
            trunks.setMatrixAt(placed, dummy.matrix);
            crowns.setMatrixAt(placed, dummy.matrix);
            placed++;
        }
        
        // POST-PLACEMENT VALIDATION: Remove trees that ended up in water (safety net)
        console.log('🔍 Validating tree positions - checking for trees in water...');
        let removedCount = 0;
        let removedWater = 0;
        let removedBeach = 0;
        const validatedTrees = [];
        const beachHeightValidation = sea + 4; // 21.5m (same as beach threshold)
        
        for (let i = 0; i < placed; i++) {
            // Get the matrix for this tree instance
            const matrix = new THREE.Matrix4();
            trunks.getMatrixAt(i, matrix);
            
            // Extract position from matrix
            const position = new THREE.Vector3();
            position.setFromMatrixPosition(matrix);
            
            // Check terrain HEIGHT at this exact position (canonical water definition)
            const terrainData = getTerrainDataAt(position.x, position.z);
            
            // Water detection: use HEIGHT (same as terrain coloring logic)
            // Water: height ≤ seaLevel (17.5m)
            // Beach: height > seaLevel && height ≤ seaLevel + 4m (21.5m)
            const isWater = terrainData.height <= sea;
            const isBeach = terrainData.height > sea && terrainData.height <= beachHeightValidation;
            
            if (isWater) {
                removedCount++;
                removedWater++;
                if (removedCount <= 5) {
                    console.log(`   ⚠️ Removed tree at (${position.x.toFixed(1)}, ${position.z.toFixed(1)}): height ${terrainData.height.toFixed(1)}m ≤ sea ${sea}m`);
                }
            } else if (isBeach) {
                removedCount++;
                removedBeach++;
                if (removedCount <= 5) {
                    console.log(`   ⚠️ Removed tree at (${position.x.toFixed(1)}, ${position.z.toFixed(1)}): height ${terrainData.height.toFixed(1)}m on beach`);
                }
            } else {
                // This tree is valid, add to validated list
                validatedTrees.push(i);
            }
        }
        
        if (removedCount > 0) {
            console.log(`   📊 Removed ${removedWater} trees from water, ${removedBeach} from beach (total: ${removedCount})`);
        }
        
        // If we removed any trees, rebuild the instance matrices
        if (removedCount > 0) {
            
            // Rebuild instance matrices with only valid trees
            for (let i = 0; i < validatedTrees.length; i++) {
                const originalIndex = validatedTrees[i];
                const matrix = new THREE.Matrix4();
                trunks.getMatrixAt(originalIndex, matrix);
                trunks.setMatrixAt(i, matrix);
                crowns.setMatrixAt(i, matrix);
            }
            
            placed = validatedTrees.length;
        }
        
        trunks.count = placed;
        crowns.count = placed;
        
        console.log(`✅ Placed ${placed} trees out of ${count} requested (${attempts} attempts, ${removedCount} removed from water)`);
        console.log(`   Rejected: ${rejectedColor} (not green/wrong color), ${rejectedBounds} (out of bounds), ${rejectedDensity} (density)`);
        console.log(`   First 10 color samples from terrain:`);
        colorSamples.forEach((sample, i) => {
            console.log(`     ${i+1}. RGB(${sample.r}, ${sample.g}, ${sample.b}) at height ${sample.height}m`);
        });
        console.log('Tree placement result:', placed > 0 ? `${placed} trees placed successfully` : '❌ NO TREES PLACED');
        
        if (placed > 0) {
            this.scene.add(trunks);
            this.scene.add(crowns);
            
            // Store references for cleanup
            this.treeMeshes.push(trunks, crowns);
            
            console.log('Trees added to scene, total meshes in scene:', this.scene.children.length);
        } else {
            console.warn('⚠️ No trees were placed! Check tree spawning logic.');
        }
    }
    
    /**
     * v1.1 Tree placement using Poisson disk sampling with slope constraints
     */
    _spawnLowPolyTreesV1_1(terrainData, terrainMesh) {
        // Get RNG stream from terrain data (v1.1)
        const treeRng = terrainData.rngStates ? 
            { next: () => Math.random(), nextInt: (min, max) => Math.floor(Math.random() * (max - min)) + min } : 
            terrainData.rng?.getStream('trees') || 
            { next: () => Math.random(), nextInt: (min, max) => Math.floor(Math.random() * (max - min)) + min };
        
        // Generate tree positions using v1.1 system
        const treePositions = generateTreePositions(terrainData, this.config, treeRng);
        
        if (treePositions.length === 0) {
            console.log('No trees to place');
            return;
        }
        
        // Calculate metrics
        const metrics = calculateTreeMetrics(
            treePositions,
            terrainData.elevation,
            terrainData.width,
            terrainData.height,
            terrainData.cellSize,
            this.config
        );
        
        console.log(`📊 Tree placement metrics:`);
        console.log(`   Count: ${metrics.count}`);
        console.log(`   Coverage: ${metrics.coverage.toFixed(1)}%`);
        console.log(`   Avg height: ${metrics.avgHeight.toFixed(1)}m`);
        console.log(`   Min spacing: ${metrics.minSpacing.toFixed(1)}m`);
        
        // Create instanced meshes
        const count = treePositions.length;
        
        const trunkGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.0, 5);
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x775533, flatShading: true });
        const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
        
        const crownGeo = new THREE.ConeGeometry(0.8, 1.8, 6);
        crownGeo.translate(0, 1.2, 0);
        const crownMat = new THREE.MeshLambertMaterial({ color: 0x28cc49, flatShading: true });
        const crowns = new THREE.InstancedMesh(crownGeo, crownMat, count);
        
        // Place trees
        const dummy = new THREE.Object3D();
        for (let i = 0; i < treePositions.length; i++) {
            const pos = treePositions[i];
            
            // Random scale and rotation
            const scale = 0.7 + treeRng.next() * 0.6;
            
            dummy.position.set(pos.x, pos.height, pos.z);
            dummy.scale.setScalar(scale);
            dummy.rotation.y = treeRng.next() * Math.PI * 2;
            dummy.updateMatrix();
            
            trunks.setMatrixAt(i, dummy.matrix);
            crowns.setMatrixAt(i, dummy.matrix);
        }
        
        // Add to scene
        this.scene.add(trunks);
        this.scene.add(crowns);
        
        // Store for cleanup
        this.treeMeshes.push(trunks, crowns);
        
        console.log(`✅ v1.1 tree placement complete: ${count} trees added to scene`);
    }

    _seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }
    
    _buildLowPolyTerrain(terrainData) {
        const builder = new LowPolyTerrainBuilder(this.config, this.grid);
        this.octagonMesh = builder.buildLowPolyTerrain(terrainData);
        
        if (!this.octagonMesh) {
            console.error('Failed to build low-poly terrain mesh');
            return;
        }
        
        this.scene.add(this.octagonMesh);
    }
    
    // Build standard terrain (instanced with shaders)
    _buildStandardTerrain(terrainData) {
        // Create textures
        const heightTexture = createHeightTexture(
            terrainData.elevation,
            terrainData.width,
            terrainData.height
        );
        
        const splatTexture = createSplatTexture(
            terrainData.splatWeights,
            terrainData.width,
            terrainData.height
        );
        
        // Create material
        const material = createTerrainMaterial(heightTexture, splatTexture, this.config, this.grid.spacing);
        
        // Generate tile positions
        const { octagons, squares } = this.grid.generateTiles();
        
        // Build octagon instances
        this._buildOctagonMesh(octagons, material);
        
        // Build square instances (if visible)
        if (this.config.SHOW_SQUARES) {
            this._buildSquareMesh(squares, material);
        }
        
        console.log(`✓ Built ${octagons.length} octagons, ${squares.length} squares`);
    }
    
    _buildOctagonMesh(tiles, material) {
        // Create base geometry with center vertex
        const vertices = this.grid.createOctagonVertices();
        vertices.push(0, 0, 0); // Center vertex
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        const indices = this.grid.createOctagonIndices();
        geometry.setIndex(indices);
        
        // Compute UVs based on world position
        const uvs = [];
        for (let i = 0; i < 9; i++) {
            uvs.push(0.5, 0.5); // Will be set per-instance
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        
        geometry.computeVertexNormals();
        
        // Create instanced mesh
        const instancedMesh = new THREE.InstancedMesh(geometry, material, tiles.length);
        
        const matrix = new THREE.Matrix4();
        const mapWidth = this.config.MAP_WIDTH * this.grid.spacing;
        const mapHeight = this.config.MAP_HEIGHT * this.grid.spacing;
        
        tiles.forEach((tile, i) => {
            matrix.setPosition(tile.x, 0, tile.z);
            instancedMesh.setMatrixAt(i, matrix);
            
            // Set UV coordinates for this instance based on grid position
            // This allows proper heightmap sampling
            const u = tile.gridX / this.config.MAP_WIDTH;
            const v = tile.gridY / this.config.MAP_HEIGHT;
            
            // Store UV in instance color attribute (hack for per-instance UVs)
            instancedMesh.setColorAt(i, new THREE.Color(u, v, 0));
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        
        this.scene.add(instancedMesh);
        this.octagonMesh = instancedMesh;
    }
    
    _buildSquareMesh(tiles, material) {
        const vertices = this.grid.createSquareVertices();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        
        const indices = this.grid.createSquareIndices();
        geometry.setIndex(indices);
        
        const uvs = [0, 0, 1, 0, 1, 1, 0, 1];
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        
        geometry.computeVertexNormals();
        
        const instancedMesh = new THREE.InstancedMesh(geometry, material, tiles.length);
        
        const matrix = new THREE.Matrix4();
        
        tiles.forEach((tile, i) => {
            matrix.setPosition(tile.x, 0, tile.z);
            instancedMesh.setMatrixAt(i, matrix);
            
            const u = tile.gridX / this.config.MAP_WIDTH;
            const v = tile.gridY / this.config.MAP_HEIGHT;
            instancedMesh.setColorAt(i, new THREE.Color(u, v, 0));
        });
        
        instancedMesh.instanceMatrix.needsUpdate = true;
        if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
        
        this.scene.add(instancedMesh);
        this.squareMesh = instancedMesh;
    }
    
    _buildWaterMesh() {
        const waterMaterial = createWaterMaterial(this.config);
        
        const size = Math.max(
            this.config.MAP_WIDTH * this.grid.spacing,
            this.config.MAP_HEIGHT * this.grid.spacing
        ) * 1.2;
        
        const geometry = new THREE.PlaneGeometry(size, size, 50, 50);
        geometry.rotateX(-Math.PI / 2);
        
        this.waterMesh = new THREE.Mesh(geometry, waterMaterial);
        this.waterMesh.position.set(
            (this.config.MAP_WIDTH * this.grid.spacing) / 2,
            this.config.SEA_LEVEL * this.config.ELEVATION_SCALE,
            (this.config.MAP_HEIGHT * this.grid.spacing) / 2
        );
        
        this.scene.add(this.waterMesh);
    }
    
    _clearTerrain() {
        if (this.octagonMesh) {
            this.scene.remove(this.octagonMesh);
            this.octagonMesh.geometry.dispose();
            this.octagonMesh.material.dispose();
            this.octagonMesh = null;
        }
        
        if (this.squareMesh) {
            this.scene.remove(this.squareMesh);
            this.squareMesh.geometry.dispose();
            this.squareMesh.material.dispose();
            this.squareMesh = null;
        }
        
        if (this.waterMesh) {
            this.scene.remove(this.waterMesh);
            this.waterMesh.geometry.dispose();
            this.waterMesh.material.dispose();
            this.waterMesh = null;
        }
        
        // Clear trees
        if (this.treeMeshes && this.treeMeshes.length > 0) {
            this.treeMeshes.forEach(mesh => {
                this.scene.remove(mesh);
                mesh.geometry.dispose();
                mesh.material.dispose();
            });
            this.treeMeshes = [];
        }
        
        // Clear grid
        if (this.gridMesh) {
            this.scene.remove(this.gridMesh);
            this.gridMesh.geometry.dispose();
            this.gridMesh.material.dispose();
            this.gridMesh = null;
        }
    }
    
    render(deltaTime) {
        if (!this.renderer || !this.scene || !this.camera) return;
        
        // Accumulate time for animations
        if (!this._animationTime) this._animationTime = 0;
        this._animationTime += deltaTime;
        
        // Animate water if it exists
        this.animateWater(this._animationTime);
        
        this.renderer.render(this.scene, this.camera);
    }
    
    setCameraMode(mode) {
        this.config.CAMERA_MODE = mode;
        this._updateCameraFromMode();
    }
    
    setCameraAngle(angle) {
        this.config.CAMERA_ANGLE = angle;
        this._updateCameraFromMode();
    }
    
    setZoom(zoom) {
        this.zoom = zoom;
        this._updateCameraFromMode();
        this._updateFogBasedOnZoom();
    }
    
    setRotation(degrees) {
        this.rotation = degrees;
        this._updateCameraFromMode();
    }
    
    setMouseRotationEnabled(enabled) {
        this.mouseRotationEnabled = enabled;
        const canvas = this.renderer.domElement;
        canvas.style.cursor = enabled ? 'grab' : 'default';
    }
    
    setFogEnabled(enabled) {
        this.fogEnabled = enabled;
        
        // If zoomed out past threshold, don't enable fog regardless of checkbox
        if (enabled && this.zoom <= 1.5) {
            this.scene.fog = new THREE.Fog(0xb0c4de, 200, 500);
        } else {
            this.scene.fog = null;
        }
    }
    
    _updateFogBasedOnZoom() {
        // Auto-disable fog when zoomed out past threshold (1.5x)
        // to provide clear overview of the map
        if (this.zoom > 1.5) {
            // Zoomed out - disable fog for better overview
            this.scene.fog = null;
        } else {
            // Zoomed in - enable fog if user has it enabled
            if (this.fogEnabled) {
                this.scene.fog = new THREE.Fog(0xb0c4de, 200, 500);
            } else {
                this.scene.fog = null;
            }
        }
    }
    
    _updateCameraFromMode() {
        const mode = this.config.CAMERA_MODE;
        const angle = this.config.CAMERA_ANGLE;
        const distance = 120 * this.zoom;
        const centerX = this.cameraTarget.x;
        const centerZ = this.cameraTarget.z;
        const rotationRad = (this.rotation * Math.PI) / 180;
        
        let baseX = 0, baseY = 0, baseZ = 0;
        
        switch (mode) {
            case 'topdown':
                baseX = 0;
                baseY = distance;
                baseZ = distance * 0.3;
                break;
                
            case 'diagonal':
                // Diagonal view at specified angle
                const angleRad = (angle * Math.PI) / 180;
                const height = distance * Math.sin(angleRad);
                const dist = distance * Math.cos(angleRad);
                baseX = dist * 0.7;
                baseY = height;
                baseZ = dist * 0.7;
                break;
                
            case 'landscape':
                // Lower angle landscape view
                const landscapeAngle = (angle * Math.PI) / 180;
                const landscapeHeight = distance * Math.sin(landscapeAngle);
                const landscapeDist = distance * Math.cos(landscapeAngle);
                baseX = 0;
                baseY = landscapeHeight;
                baseZ = landscapeDist;
                break;
        }
        
        // Apply rotation around center
        const rotatedX = baseX * Math.cos(rotationRad) - baseZ * Math.sin(rotationRad);
        const rotatedZ = baseX * Math.sin(rotationRad) + baseZ * Math.cos(rotationRad);
        
        this.camera.position.set(
            centerX + rotatedX,
            baseY,
            centerZ + rotatedZ
        );
        
        this.camera.lookAt(this.cameraTarget);
    }
    
    toggleGrid(show) {
        if (show) {
            if (!this.gridMesh && this.octagonMesh) {
                const edges = new THREE.EdgesGeometry(this.octagonMesh.geometry);
                const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
                this.gridMesh = new THREE.LineSegments(edges, lineMat);
                this.gridMesh.scale.copy(this.octagonMesh.scale);
                this.gridMesh.position.copy(this.octagonMesh.position);
                this.scene.add(this.gridMesh);
            }
        } else {
            if (this.gridMesh) {
                this.scene.remove(this.gridMesh);
                this.gridMesh.geometry.dispose();
                this.gridMesh.material.dispose();
                this.gridMesh = null;
            }
        }
    }
    
    // Update config and rebuild
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        this.grid = new OctagonGrid(this.config);
        
        // Update camera target if map size changed
        this.cameraTarget.set(
            (this.config.MAP_WIDTH * this.grid.spacing) / 2,
            0,
            (this.config.MAP_HEIGHT * this.grid.spacing) / 2
        );
    }
}

