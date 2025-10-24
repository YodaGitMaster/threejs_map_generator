# Technical Decisions Log

**Project:** Map Gen RTS - v1.1 Deterministic System
**Updated:** 2025-10-24

---

## Architecture Decisions

### **Decision 1: Simulation Heights Separate from Visuals**
**Date:** 2025-10-24  
**Status:** ✅ Implemented

**Context:**  
v1.0 mixed simulation (game logic) with rendering (visual quantization). Made debugging hard and limited flexibility.

**Decision:**  
- Elevation stored as `Float32Array` in **meters** (simulation precision)
- Quantization applied **only** during mesh building for low-poly look
- Sea level solved in meters, not normalized units

**Rationale:**  
- Clear separation of concerns
- Easier to reason about heights (17.5m vs 0.35)
- Quantization step is now a rendering parameter, not data constraint
- Enables accurate physics/pathfinding if needed later

**Alternatives Considered:**  
- Keep normalized 0-1 (rejected: less intuitive)
- Store both (rejected: memory overhead, sync issues)

---

### **Decision 2: Multi-Stream RNG Architecture**
**Date:** 2025-10-24  
**Status:** ✅ Implemented

**Context:**  
Need deterministic generation where changing forest % doesn't change lake positions.

**Decision:**  
- Single master seed generates sub-seeds via hash
- Independent RNG streams: terrain, lakes, erosion, trees, biomes
- Each stream maintains its own state
- Serializable for MapSpec

**Rationale:**  
- True independence between features
- Changing one parameter doesn't cascade
- Reproducibility guaranteed
- Same technique used in Minecraft, Dwarf Fortress

**Alternatives Considered:**  
- Single global RNG (rejected: cascade effects)
- Seed offsets (rejected: collision risk)

---

### **Decision 3: Quantile Solver for Exact Water Coverage**
**Date:** 2025-10-24  
**Status:** ✅ Implemented

**Context:**  
User requests "15% water" but actual coverage varied (13%-18%) due to lakes.

**Decision:**  
- Build CDF of terrain heights
- Solve for sea level that gives exact target percentage
- Validate result within tolerance (±0.1%)
- Handle edge cases (0%, 100%)

**Rationale:**  
- Predictable, constraint-driven design
- Matches user intent precisely
- No trial-and-error tuning
- Professional game-dev approach (Civilization uses similar)

**Alternatives Considered:**  
- Iterative adjustment (rejected: slow, imprecise)
- Fixed sea level (rejected: unpredictable water %)

---

### **Decision 4: Poisson Disk Sampling for Features**
**Date:** 2025-10-24  
**Status:** ✅ Lakes, ⏳ Trees pending

**Context:**  
Grid-based placement created visible patterns, unnatural clustering.

**Decision:**  
- Use Bridson's Poisson disk algorithm
- Minimum spacing guarantees even distribution
- Suitability masks for terrain-aware placement
- Blue-noise properties (no clustering or grid artifacts)

**Rationale:**  
- Industry standard (Unreal Engine, Unity use this)
- Mathematically proven uniform coverage
- Natural-looking results
- Fast (O(n) with grid acceleration)

**Alternatives Considered:**  
- Random scatter (rejected: clustering)
- Hex grid (rejected: visible patterns)
- Stratified grid jitter (rejected: still has artifacts)

---

### **Decision 5: Elevation Curve Presets**
**Date:** 2025-10-24  
**Status:** ✅ Implemented

**Context:**  
Hardcoded terrain flattening (`_flattenTerrain`) was inflexible.

**Decision:**  
- Piecewise linear curve system
- 7 designer presets (Terraced RTS, Rolling Hills, Sharp Alps, etc.)
- Remaps 0-1 input to 0-1 output with custom shape
- Serializable in MapSpec

**Rationale:**  
- Artist-friendly control over terrain shape
- No code changes needed for new styles
- Same approach as Houdini, Substance Designer
- Easy to visualize and tune

**Alternatives Considered:**  
- Bezier curves (rejected: harder to control)
- Procedural functions (rejected: less intuitive)

---

### **Decision 6: MapSpec v1.1 Serialization**
**Date:** 2025-10-24  
**Status:** ✅ Implemented

**Context:**  
Need to save/share maps, reproduce bugs, version control.

**Decision:**  
- JSON schema with all generation parameters
- Includes sub-seeds, metrics, validation results
- Auto-saves to localStorage
- Download as file
- Hash for quick comparison

**Rationale:**  
- Industry standard format
- Human-readable
- Easy to diff (git)
- Enables multiplayer sync, replays, bug reports

**Alternatives Considered:**  
- Binary format (rejected: not human-readable)
- Only save seed (rejected: not enough for exact reproduction)

---

## Abandoned Paths

### **Path 1: Single-Band Noise**
**Why Abandoned:**  
- Couldn't achieve both large continents and small surface detail
- Multi-band (macro/meso/micro) gives better control
- Each band targets specific scale

### **Path 2: Water Plane for Lakes**
**Why Abandoned:**  
- Z-fighting with terrain
- Couldn't represent multiple lake elevations
- Vertex coloring on terrain mesh works better

### **Path 3: Color-Based Tree Placement**
**Why Abandoned:**  
- Sampling terrain vertex colors was unreliable
- Trees appeared in water despite color checks
- Height + slope constraints are more robust

---

## Performance Decisions

### **Renderer Pixel Ratio Forced to 1.0**
- Users reported lag despite high FPS
- Discovered renderer was using devicePixelRatio (2.0 on retina displays)
- Forcing to 1.0 halved pixel count, maintained visual quality
- **Trade-off:** Slightly softer on 4K displays, but smooth interaction

### **Triangle Budget (Pending)**
- Plan: Single knob to control total triangles
- Adjusts map resolution, tree count, detail level together
- Targets: Mobile (10K tri), Desktop (100K tri), High-end (500K tri)

---

## Lessons Learned

1. **Simulation ≠ Rendering** - Separate data precision from visual style
2. **Constraints > Parameters** - "15% water" is clearer than "sea level 0.35"
3. **Independence > Coupling** - Multi-stream RNG prevents cascade effects
4. **Validation > Hope** - Check invariants, don't assume correctness
5. **Serialize Everything** - MapSpec enables debugging, sharing, versioning

---

## Future Considerations

### **Networked Multiplayer**
- Current: MapSpec enables exact reproduction
- Future: Stream terrain chunks, delta-encode updates
- Sub-seeds allow server to specify per-region generation

### **Procedural Detail**
- Current: Fixed triangle count
- Future: GPU tessellation for adaptive detail
- LOD based on camera distance

### **Biome Transitions**
- Current: Sharp boundaries
- Future: Blend zones with transition vegetation
- Whittaker diagram + suitability masks
