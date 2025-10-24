# Quick Start for New Session

If starting a new chat session, read these files in order:

## 1. Read State First
```
context/state.md
```
Current project status, what's done, what's next.

## 2. Review Architecture
```
context/schema.md
context/decisions.md
context/files.md
```
How the system works, why decisions were made, where code lives.

## 3. Check Insights
```
context/insights.md
```
Important discoveries, gotchas, optimization notes.

## 4. User Documentation
```
README.md
CONFIGURATION.md
```
How to use the system, tweak parameters.

## Project Summary
**Type**: Procedural terrain generator for RTS games  
**Tech**: Three.js + WebGL2 shaders + JavaScript ES6 modules  
**Pattern**: Octagon 4.8.8 tiling (unique visual style)  
**Pipeline**: Noise → Erosion → Biomes → GPU Rendering  
**Status**: ✅ Complete and functional

## Key Files
- `src/main.js` - Entry point, UI controls
- `src/terrainGenerator.js` - Core generation pipeline
- `src/renderer.js` - Three.js rendering
- `src/materials.js` - GPU shaders
- `src/octagonGrid.js` - Tiling mathematics

## Common Tasks

### Test the System
```bash
npm run dev
```
Opens http://localhost:5173

### Modify Terrain Look
Edit `src/config.js` DEFAULT_CONFIG object

### Add New Biome
1. Add to BiomeType enum in `src/biomes.js`
2. Add color to BiomeColors
3. Add classification logic to BiomeClassifier.classify()
4. Add splat weights in calculateSplatWeights()

### Adjust Shaders
Edit `src/materials.js`:
- terrainVertexShader - Height displacement
- terrainFragmentShader - Color blending
- waterVertexShader - Water animation
- waterFragmentShader - Water appearance

### Change Grid Pattern
Edit `src/octagonGrid.js` - Warning: complex math!

## Known Limitations
- LOD/culling infrastructure present but not fully active
- No river rendering (flow map calculated but unused)
- Square tile UVs simplified (use octagon neighbor's height)
- Instance color hack for per-instance UVs (Three.js limitation)

## Future Enhancements
- Distance-based LOD switching
- Frustum culling for chunks
- River/stream mesh generation from flow accumulation
- Unit placement API
- Pathfinding integration
- Minimap generation

