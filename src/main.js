// Main entry point
import { Config } from './config.js';
import { TerrainRenderer } from './renderer.js';
import { TerrainGenerator } from './terrainGenerator.js';

class App {
    constructor() {
        this.config = new Config();
        this.generator = new TerrainGenerator(this.config);
        this.renderer = null;
        this.terrainData = null;
        this.currentMapSpec = null;
        
        this.stats = {
            fps: 0,
            frameCount: 0,
            lastTime: performance.now(),
        };
        
        this._init();
    }
    
    _init() {
        console.log('🚀 Initializing terrain generator...');
        
        // Initialize renderer
        const container = document.getElementById('canvas-container');
        this.renderer = new TerrainRenderer(container, this.config);
        
        // Setup UI controls
        this._setupControls();
        
        // Generate initial terrain
        this.regenerateTerrain();
        
        // Start render loop
        this._animate();
        
        console.log('✓ Initialization complete!');
    }
    
    _setupControls() {
        // Seed input
        const seedInput = document.getElementById('seed');
        seedInput.value = this.config.SEED;
        
        // Water percentage slider
        const waterPercentageSlider = document.getElementById('waterPercentage');
        const waterPercentageValue = document.getElementById('waterPercentageValue');
        waterPercentageSlider.value = this.config.WATER_PERCENTAGE;
        waterPercentageValue.textContent = this.config.WATER_PERCENTAGE + '%';
        
        waterPercentageSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            waterPercentageValue.textContent = value + '%';
            this.config.WATER_PERCENTAGE = value;
            this.regenerateTerrain();
        });
        
        // Elevation scale slider
        const elevScaleSlider = document.getElementById('elevScale');
        const elevScaleValue = document.getElementById('elevScaleValue');
        elevScaleSlider.value = this.config.ELEVATION_SCALE;
        elevScaleValue.textContent = this.config.ELEVATION_SCALE + 'm';
        
        elevScaleSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            elevScaleValue.textContent = value + 'm';
            this.config.ELEVATION_SCALE = value;
            this._updateElevationScale(value);
        });
        
        // Map size slider
        const mapSizeSlider = document.getElementById('mapSize');
        const mapSizeValue = document.getElementById('mapSizeValue');
        mapSizeSlider.value = this.config.MAP_WIDTH;
        mapSizeValue.textContent = this.config.MAP_WIDTH;
        
        mapSizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            mapSizeValue.textContent = value;
        });
        
        // Forest percentage slider
        const forestPercentageSlider = document.getElementById('forestPercentage');
        const forestPercentageValue = document.getElementById('forestPercentageValue');
        if (forestPercentageSlider) {
            forestPercentageSlider.value = this.config.FOREST_PERCENTAGE || 25;
            forestPercentageValue.textContent = (this.config.FOREST_PERCENTAGE || 25) + '%';
            
            forestPercentageSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                forestPercentageValue.textContent = value + '%';
                this.config.FOREST_PERCENTAGE = value;
                this.regenerateTerrain();
            });
        }
        
        // Camera mode selector
        const cameraModeSelect = document.getElementById('cameraMode');
        if (cameraModeSelect) {
            cameraModeSelect.value = this.config.CAMERA_MODE;
            
            cameraModeSelect.addEventListener('change', (e) => {
                this.config.CAMERA_MODE = e.target.value;
                this.renderer.setCameraMode(e.target.value);
                
                // Show/hide angle control based on mode
                const angleGroup = document.getElementById('cameraAngleGroup');
                if (angleGroup) {
                    angleGroup.style.display = e.target.value === 'topdown' ? 'none' : 'block';
                }
            });
        }
        
        // Camera angle slider
        const cameraAngleSlider = document.getElementById('cameraAngle');
        const cameraAngleValue = document.getElementById('cameraAngleValue');
        if (cameraAngleSlider) {
            cameraAngleSlider.value = this.config.CAMERA_ANGLE;
            cameraAngleValue.textContent = this.config.CAMERA_ANGLE + '°';
            
            cameraAngleSlider.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                cameraAngleValue.textContent = value + '°';
                this.config.CAMERA_ANGLE = value;
                this.renderer.setCameraAngle(value);
            });
            
            // Hide angle control if in topdown mode
            const angleGroup = document.getElementById('cameraAngleGroup');
            if (angleGroup && this.config.CAMERA_MODE === 'topdown') {
                angleGroup.style.display = 'none';
            }
        }
        
        // Zoom slider
        const zoomSlider = document.getElementById('zoomLevel');
        const zoomValue = document.getElementById('zoomValue');
        if (zoomSlider) {
            zoomSlider.value = 1.0;
            zoomValue.textContent = '1.0x';
            
            zoomSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                zoomValue.textContent = value.toFixed(1) + 'x';
                this.renderer.setZoom(value);
            });
        }
        
        // Enable mouse rotation checkbox
        const enableRotationCheckbox = document.getElementById('enableRotation');
        if (enableRotationCheckbox) {
            enableRotationCheckbox.checked = true;
            
            enableRotationCheckbox.addEventListener('change', (e) => {
                this.renderer.setMouseRotationEnabled(e.target.checked);
            });
        }
        
        // Show fog checkbox
        const showFogCheckbox = document.getElementById('showFog');
        if (showFogCheckbox) {
            showFogCheckbox.checked = true;
            
            showFogCheckbox.addEventListener('change', (e) => {
                this.renderer.setFogEnabled(e.target.checked);
            });
        }
        
        // Guide mode checkbox
        const guideModeCheckbox = document.getElementById('guideMode');
        if (guideModeCheckbox) {
            guideModeCheckbox.checked = this.config.GUIDE_MODE;
            guideModeCheckbox.addEventListener('change', (e) => {
                this.config.GUIDE_MODE = e.target.checked;
                this.regenerateTerrain();
            });
        }

        // Low-poly mode checkbox
        const lowPolyCheckbox = document.getElementById('lowPolyMode');
        lowPolyCheckbox.checked = this.config.LOW_POLY_MODE;
        
        lowPolyCheckbox.addEventListener('change', (e) => {
            this.config.LOW_POLY_MODE = e.target.checked;
            this.regenerateTerrain();
        });
        
        // Show squares checkbox
        const showSquaresCheckbox = document.getElementById('showSquares');
        showSquaresCheckbox.checked = this.config.SHOW_SQUARES;
        
        showSquaresCheckbox.addEventListener('change', (e) => {
            this.config.SHOW_SQUARES = e.target.checked;
            this.regenerateTerrain();
        });
        
        // Show water checkbox
        const showWaterCheckbox = document.getElementById('showWater');
        showWaterCheckbox.checked = this.config.SHOW_WATER;
        
        showWaterCheckbox.addEventListener('change', (e) => {
            this.config.SHOW_WATER = e.target.checked;
            this.regenerateTerrain();
        });
        
        // Show grid checkbox
        const showGridCheckbox = document.getElementById('showGrid');
        if (showGridCheckbox) {
            showGridCheckbox.checked = this.config.SHOW_GRID;
            
            showGridCheckbox.addEventListener('change', (e) => {
                this.config.SHOW_GRID = e.target.checked;
                this.renderer.toggleGrid(e.target.checked);
            });
        }
        
        // Regenerate button
        const regenerateBtn = document.getElementById('regenerate');
        regenerateBtn.addEventListener('click', () => {
            this.config.SEED = parseInt(seedInput.value);
            this.config.MAP_WIDTH = parseInt(mapSizeSlider.value);
            this.config.MAP_HEIGHT = parseInt(mapSizeSlider.value);
            this.regenerateTerrain();
        });
        
        // Random seed button
        const randomSeedBtn = document.getElementById('randomSeed');
        randomSeedBtn.addEventListener('click', () => {
            const newSeed = Math.floor(Math.random() * 999999);
            seedInput.value = newSeed;
            this.config.SEED = newSeed;
            this.regenerateTerrain();
        });
    }
    
    regenerateTerrain() {
        console.log('🔄 Regenerating terrain with seed:', this.config.SEED);
        
        // Update generator with new config
        this.generator = new TerrainGenerator(this.config);
        
        // Generate terrain data
        this.terrainData = this.generator.generate();
        
        // Update renderer
        this.renderer.updateConfig(this.config);
        this.renderer.buildTerrain(this.terrainData);
        
        // Update stats
        this._updateStats();
    }
    
    _updateSeaLevel(value) {
        // Update materials without full regeneration
        if (this.renderer.octagonMesh && this.renderer.octagonMesh.material && this.renderer.octagonMesh.material.uniforms && this.renderer.octagonMesh.material.uniforms.uSeaLevel) {
            this.renderer.octagonMesh.material.uniforms.uSeaLevel.value = value;
        }
        if (this.renderer.squareMesh && this.renderer.squareMesh.material && this.renderer.squareMesh.material.uniforms && this.renderer.squareMesh.material.uniforms.uSeaLevel) {
            this.renderer.squareMesh.material.uniforms.uSeaLevel.value = value;
        }
        if (this.renderer.waterMesh && this.renderer.waterMesh.material && this.renderer.waterMesh.material.uniforms && this.renderer.waterMesh.material.uniforms.uSeaLevel) {
            this.renderer.waterMesh.material.uniforms.uSeaLevel.value = value;
            this.renderer.waterMesh.position.y = value * this.config.ELEVATION_SCALE;
        }
    }
    
    _updateElevationScale(value) {
        // Update materials without full regeneration
        if (this.renderer.octagonMesh && this.renderer.octagonMesh.material && this.renderer.octagonMesh.material.uniforms && this.renderer.octagonMesh.material.uniforms.uElevationScale) {
            this.renderer.octagonMesh.material.uniforms.uElevationScale.value = value;
        }
        if (this.renderer.squareMesh && this.renderer.squareMesh.material && this.renderer.squareMesh.material.uniforms && this.renderer.squareMesh.material.uniforms.uElevationScale) {
            this.renderer.squareMesh.material.uniforms.uElevationScale.value = value;
        }
        if (this.renderer.waterMesh && this.renderer.waterMesh.material && this.renderer.waterMesh.material.uniforms && this.renderer.waterMesh.material.uniforms.uElevationScale) {
            this.renderer.waterMesh.material.uniforms.uElevationScale.value = value;
            this.renderer.waterMesh.position.y = this.config.SEA_LEVEL * value;
        }
    }
    
    _updateStats() {
        const tileCount = this.config.MAP_WIDTH * this.config.MAP_HEIGHT;
        const chunkCount = Math.ceil(this.config.MAP_WIDTH / this.config.CHUNK_SIZE) *
                          Math.ceil(this.config.MAP_HEIGHT / this.config.CHUNK_SIZE);
        
        document.getElementById('tileCount').textContent = tileCount;
        document.getElementById('chunkCount').textContent = chunkCount;
    }
    
    _animate() {
        requestAnimationFrame(() => this._animate());
        
        const now = performance.now();
        const deltaTime = (now - this.stats.lastTime) * 0.001;
        this.stats.lastTime = now;
        
        // Update FPS counter (accurate over rolling window)
        this.stats.frameCount++;
        if (!this.stats._accum) this.stats._accum = 0;
        this.stats._accum += deltaTime;
        if (this.stats._accum >= 0.5) { // update twice per second
            this.stats.fps = Math.round(this.stats.frameCount / this.stats._accum);
            const fpsElement = document.getElementById('fps');
            if (fpsElement) fpsElement.textContent = this.stats.fps;
            this.stats._accum = 0;
            this.stats.frameCount = 0;
        }
        
        // Render
        try {
            this.renderer.render(deltaTime);
        } catch (error) {
            console.error('❌ Animation loop render error:', error);
        }
    }
}

// Start application
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOMContentLoaded fired');
    
    // DIAGNOSTIC: Check container
    const container = document.getElementById('canvas-container');
    if (!container) {
        console.error('❌ CRITICAL: canvas-container element not found in DOM!');
        document.body.innerHTML = '<div style="color:white;padding:20px;background:red;">ERROR: canvas-container not found</div>';
        return;
    }
    
    console.log('✅ Container found:', {
        id: container.id,
        clientWidth: container.clientWidth,
        clientHeight: container.clientHeight,
        offsetWidth: container.offsetWidth,
        offsetHeight: container.offsetHeight,
        computedStyle: window.getComputedStyle(container).display
    });
    
    if (container.clientWidth === 0 || container.clientHeight === 0) {
        console.error('❌ CRITICAL: Container has no dimensions!', {
            width: container.clientWidth,
            height: container.clientHeight
        });
    }
    
    try {
        new App();
    } catch (error) {
        console.error('❌ CRITICAL: App initialization failed:', error);
        console.error('Stack trace:', error.stack);
        container.innerHTML = `<div style="color:white;padding:20px;background:red;">
            ERROR: ${error.message}<br>
            Check console for full stack trace.
        </div>`;
    }
});

