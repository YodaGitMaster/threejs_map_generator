# Data Structures & Schema

## Configuration Variables
```
SEED                    # Random seed for reproducibility
MAP_WIDTH, MAP_HEIGHT   # Lattice cells (world size)
OCT_APOTHEM            # Octagon size (across-flats = 2a)
ELEVATION_SCALE        # World height in meters
SEA_LEVEL              # 0..1 threshold for water
NOISE_ELEV             # (octaves, freq, gain, lacunarity)
NOISE_MOIST            # (octaves, freq, gain, lacunarity)
NOISE_TEMP             # (octaves, freq, gain, lacunarity)
EROSION_ITERATIONS     # Hydraulic erosion passes
CHUNK_SIZE             # Cells per chunk for LOD/streaming
SHOW_SQUARES           # Bool: render connector squares
```

## Grid System
- **Pattern**: 4.8.8 tiling (octagons + connector squares)
- **Primary**: Octagons for visual focus
- **Secondary**: Squares for tiling accuracy (optionally hidden)

## Data Maps
- **Height field**: 2D array, normalized [0..1], scaled to meters
- **Moisture map**: 2D array [0..1]
- **Temperature map**: 2D array [0..1]
- **Flow accumulation**: 2D array from erosion
- **Biome ID**: 2D array (derived from height/moist/temp)
- **Splat weights**: Per-tile grass/rock/sand/snow weights

## Rendering Structures
- **Instanced meshes**: Separate for octagons and squares
- **Height texture**: GPU-accessible for vertex displacement
- **Chunks**: Grid subdivided by CHUNK_SIZE for culling/LOD

