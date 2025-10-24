# File Structure

## Core Files
- `index.html` - Entry point, UI layout
- `package.json` - Dependencies (Three.js, Vite)
- `init.mdc` - Original specification document
- `README.md` - Project documentation

## Source Files (`src/`)
- `main.js` - Application entry, UI binding, render loop
- `config.js` - Configuration system, default parameters
- `noise.js` - SimplexNoise implementation, fBm, field generation
- `octagonGrid.js` - 4.8.8 tiling math, geometry creation
- `terrainGenerator.js` - Main pipeline: noise → erosion → biomes → textures
- `erosion.js` - Hydraulic erosion (D8 flow), thermal smoothing
- `biomes.js` - Biome classification, splat weight calculation
- `materials.js` - Shader creation, texture generation (height, splat, water)
- `renderer.js` - Three.js scene, instanced meshes, camera, controls

## Context Files (`context/`)
- `state.md` - Current project state, completed tasks
- `schema.md` - Data structures, grid system, rendering architecture
- `decisions.md` - Technical choices and rationale
- `insights.md` - Key findings and patterns
- `files.md` - This file

## Key Dependencies
- `three@^0.168.0` - 3D rendering engine
- `vite@^5.4.0` - Build tool and dev server

