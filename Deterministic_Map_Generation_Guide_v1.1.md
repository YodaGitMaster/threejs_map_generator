
# Map Generation — Deterministic, Constraint‑Driven Pipeline (v1.1)

**Purpose:** Replace a mostly noise‑driven pipeline with a **constraint‑driven, deterministic system**. The goal is to make water and forest coverage exact, keep randomness isolated per stage, and ensure that changing one slider does not shuffle unrelated features. With the same seed and configuration, the world should be bit‑for‑bit identical on every machine.

---

## 0) End State At a Glance

- **Deterministic:** Same seed + same config ⇒ identical map (terrain, lakes, trees, colors).
- **Exact coverage:** Water % and forest % match requested values within a tiny tolerance.
- **Independent knobs:** Adjusting forest density no longer moves lake positions; changing erosion strength does not change tree layout.
- **Stable performance:** A single “terrain detail” (triangle budget) knob bounds mesh complexity and stabilizes FPS across map sizes.
- **Separation of concerns:** Simulation logic uses continuous heights; rendering applies the low‑poly quantization only at the very end.
- **Acceptance checks:** Measurable invariants (water %, tree count, min landmass size, etc.) must pass before a map is accepted.

---

## 1) Randomness Architecture (Deterministic Sub‑Streams)

**What to do:** Choose a small, reliable pseudo‑random generator and derive **independent sub‑streams** from the master seed (e.g., “terrain”, “lakes”, “trees”, “biome”). Sub‑streams are created by hashing `SEED + label` and never reused across stages.

**Why:** Ensures independence. Tweaking tree parameters cannot alter lake positions. This mirrors how tile‑based engines keep coordinates stable regardless of other controls.

**How to validate:** Record the first few random numbers per sub‑stream. Across runs and machines, the sequence must match exactly. Store the derived sub‑seeds in your serialized map spec so they are auditable.

---

## 2) Separate Simulation Height from Visual Quantization

**What to do:** Maintain a **simulation height field** as a float array (meters). All logic—water detection, biomes, slope, trees—uses this continuous field. Apply your **low‑poly step** (e.g., 3‑meter quantization) **only when building the render mesh**.

**Why:** Prevents rounding from creating logic artifacts (e.g., trees “on” a beach due to face rounding).

**Extra:** Snap any environmental thresholds (like “beach” and “snowline”) to the quantization grid *for visuals only*, so the render appearance is stable while logic stays precise.

---

## 3) Replace Hardcoded Flattening with an Editable Elevation Curve

**What to do:** Replace stepwise thresholds with a **remapping curve** defined in config (piecewise linear or Bezier). Input is normalized noise (0..1), output is remapped elevation (0..1) before scaling to meters. Expose a handful of designer‑friendly presets (e.g., “Terraced RTS”, “Rolling Hills”, “Sharp Alps”).

**Why:** Designers can sculpt plateaus/hills without changing code. The same curve, seed and noise produce identical macro forms every time.

**Validation:** Export and version the curve. Include it in saved maps (see MapSpec).

---

## 4) Noise Composition with Explicit Controls (Macro / Meso / Micro)

**What to do:** Compose elevation from three bands:
- **Macro** (continents: very low frequency),
- **Meso** (ranges: medium frequency),
- **Micro** (surface detail: higher frequency).

Optionally add **domain warping** (a small coordinate perturbation) and a **ridged component** for sharp ranges with an explicit **direction** parameter (e.g., “mountain chains trend NE‑SW”).

**Why:** Gives predictable knobs that change the “shape language” without destabilizing coverage or performance.

**Designer knobs:** Amplitudes for each band, warp strength, ridge strength, ridge direction (degrees), ridge frequency. Document expected visual effect for each.

---

## 5) Lake Placement via Blue‑Noise (Poisson Disk) + Shape Control

**What to do:**
1. **Centers:** Place lake centers using **Poisson disk sampling** over the map to guarantee even spacing without grid artifacts. Seed the sampler from the “lakes” sub‑stream so it is deterministic.
2. **Shapes:** Create lake basins by carving **superellipses** (a generalization of an ellipse) with a controllable “squarishness” exponent and a light **edge noise** modulation for organic shorelines.
3. **Depth budget:** Define a global “lake depth range” and scale per‑lake depth deterministically (e.g., via center index) so overall depth distribution is stable.

**Why:** Produces evenly distributed, natural‑looking lakes that do not clump in corners or align to a grid, and that remain stable when other systems change.

**Validation:** Count carved cells before sea‑level solve; depth distribution should be reproducible for each seed/config.

---

## 6) Erosion with Fixed Inputs and Ordering

**What to do:** Make hydraulic/thermal erosion **order‑invariant and deterministic**:
- Use a **fixed number of droplets** with a **stratified seed pattern** over the map (not purely random start points).
- Use **fixed neighbor ordering** when choosing downhill directions.
- Cap transported mass per step and enforce **mass conservation**.
- Run for an exact iteration count; do not early‑exit based on stochastic conditions.

**Why:** Erosion becomes a stable transform rather than a source of run‑to‑run drift.

**Validation:** Save a checksum of the height field after erosion for a handful of seeds. Any change indicates non‑determinism to investigate.

---

## 7) Exact Water Percentage (Sea‑Level Quantile Solver)

**What to do:** After lakes and erosion, **solve for the sea level** that yields the requested **water coverage**. Treat it as a **quantile** of the height distribution (e.g., pick the elevation below which exactly 25% of cells lie). For **0% water**, raise any cell below the target level by a tiny epsilon.

**Why:** Locks the water percentage to the slider value precisely, independent of noise, lakes, or erosion quirks.

**Implementation notes:** Use an efficient CDF via a histogram over heights in meters (simulation heights). Sea level is then applied everywhere: coloring, water plane height, tree/beach checks.

**Validation:** Measure water face percentage after meshing—it should match the target within a tiny tolerance (±0.1%).

---

## 8) Biomes via Temperature–Moisture Grid (Whittaker‑Style)

**What to do:** Compute temperature and moisture fields, adjusted by elevation (lapse rate) and latitude if desired. Classify biome by looking up a **2D grid** (temperature vs moisture) with clear bins (desert, grassland, forest, tundra, snow). Mountains and permanent snow override by elevation thresholds.

**Why:** Removes ad‑hoc logic and makes biome outputs predictable and editable via a single table.

**Designer workflow:** Edit the 2D LUT, store it in MapSpec, and provide preview overlays for QA.

---

## 9) Forest Coverage with Suitability Mask + Blue‑Noise, Exact Count

**What to do:**
1. Build a **forest suitability mask** from simulation heights, slopes, biomes, and distance from beaches (e.g., above beach, below alpine, slope less than a max angle, correct biome class).
2. Run **Poisson disk sampling** constrained to suitable areas to produce evenly spaced candidate points.
3. Compute the **target tree count** from the requested forest % and a “cells per tree” or “trees per hectare” density model, using the **actual area** of suitable cells.
4. **Stable‑select** the first N candidates based on a deterministic score (e.g., suitability value, then a hashed tie‑breaker) to achieve the exact requested count.

**Why:** Ensures forest percentage is met and trees never appear on beaches or steep slopes, while spacing remains even and visually pleasing.

**Validation:** After placement, run a safety pass that removes any tree found in water or beach due to later adjustments (should be zero in steady state). Count must still match target N exactly.

---

## 10) Mesh and LOD as a Triangle Budget (Tile‑Friendly)

**What to do:**
- Replace ad‑hoc segment counts with a single **triangle budget** knob. Convert the budget into segment counts along X and Z (or per tile).
- Optionally **chunk the map into tiles** (e.g., 32×32 cells per tile). Rebuild only tiles affected by parameter changes.
- Recompute **flat normals** per tile after quantization to maintain sharp, low‑poly facets without seams.

**Why:** A single knob controls performance predictably. Tiles emulate the determinism of a tiled map engine and enable partial updates.

**Validation:** Face count stays within budget across all map sizes. Median FPS varies minimally with water/forest changes.

---

## 11) Rendering Decoupled from Simulation

**What to do:** Keep water animation, lighting, fog and post‑processing **read‑only** with respect to the simulation state. No shader may feed back into heights or placement.

**Why:** Visual knobs should never affect deterministic outputs. Designers can change sky/water appearance without invalidating saved maps.

**Validation:** A visual‑only parameter sweep changes nothing in the serialized MapSpec outputs (hash unchanged).

---

## 12) Metrics, Invariants, Acceptance

**What to measure:**
- Water coverage (% of faces below or at sea level).
- Forest coverage (tree count vs target).
- Largest landmass (%) and total number of land components.
- Coastline length (approximate via boundary edges).
- Elevation histogram entropy and mean slope.
- Performance: build time per phase, FPS at camera presets, memory footprint.

**Invariants (examples):**
- Water coverage matches target within ±0.1%.
- Tree count equals target exactly.
- Largest landmass ≥ a minimum fraction (e.g., 25%) when water ≤ 50%.
- No trees at or below beach height; no trees above alpine limit.
- Face count ≤ triangle budget.

**Acceptance:** If a map fails, perform a **deterministic nudge** (e.g., adjust lake depth scale by a tiny, seed‑derived delta) and rebuild once. If still failing, surface an explicit error with the failing metric for designer review.

---

## 13) Configuration Schema and Versioning (MapSpec)

**What to include in the saved map spec:**
- **version** (e.g., “1.1”).
- **seed** and **sub‑seeds** (terrain/lakes/trees/biome).
- **size** (width, height), **cell size** if applicable.
- **noise**: macro/meso/micro amplitudes, frequencies, domain warp strength; ridges (strength, direction, frequency).
- **flattenCurve**: the elevation remap function definition.
- **water**: target %, solver type (“quantile”), any nudge applied.
- **lakes**: min spacing, depth range, shape parameters (superellipse exponent, edge noise frequency).
- **erosion**: iterations, strength, droplet seeding mode.
- **biome**: 2D LUT identifier or embedded table; lapse/latitude coefficients.
- **forest**: target %, min spacing (Poisson radius), max slope, altitude constraints, selection policy.
- **render**: triangle budget, quantization step, guide/low‑poly flags, color palette.
- **metrics**: measured outputs at the time of save (water %, tree count, etc.).

**Why:** Any map can be reproduced exactly, debugged, and compared across versions. Backwards compatibility is manageable and explicit.

---

## 14) Test Strategy

- **Determinism tests:** For a set of “golden seeds,” assert byte‑identical outputs (height field hashes, tree coordinate lists) across machines/OS/GPU.
- **Property tests:** Water % equals target; no trees below beach; tree spacing minimum respected; triangle budget not exceeded.
- **Regression tests:** Keep a gallery of serialized MapSpecs and thumbnails to visually detect unintended changes.
- **Performance tests:** Record timings per phase and enforce upper bounds in CI for typical sizes (64×64, 128×128, 256×256).

---

## 15) Migration Plan from v1.0

1. Introduce the **simulation height field** and route all logic through it.
2. Add the **sea‑level quantile solver** and replace ad‑hoc water checks with it.
3. Swap **grid patches** for **blue‑noise** centers (lakes and trees).
4. Add **slope gating** and altitude bounds for trees; implement **exact tree count** from forest %.
5. Split RNG into **per‑stage sub‑streams** and update serialization to include sub‑seeds.
6. Replace hardcoded flattening with an **editable elevation curve**; ship 2–3 presets.
7. Implement **triangle budget** and (optionally) **tiling**; recompute normals per tile.
8. Add **metrics, invariants, acceptance** and surface failures clearly in the UI/console.
9. Freeze **MapSpec v1.1**; export and load reliably; build a thumbnail pipeline for previews.

Roll out in small PRs, with screenshots and metrics before/after each step.

---

## 16) Designer‑Facing Controls (Minimal, Powerful)

- **Seed** (integer).
- **Terrain detail** (triangle budget).
- **Height scale** (meters).
- **Water coverage** (% exact).
- **Forest coverage** (% exact).
- **Elevation curve preset** (with an “advanced” editor).
- **Ridges** (on/off, direction, strength).
- **Biome preset** (LUT).
- **Tree spacing** (meters) and **max slope** (degrees).

Everything else lives behind these controls or inside presets for consistent UX.

---

## 17) Performance Notes

- Use **typed arrays** for all fields; avoid per‑cell object allocations.
- Reuse buffers and scratch arrays; avoid garbage where possible.
- Precompute and tile noise; sample with bilinear interpolation instead of re‑running noise functions in tight loops when possible.
- Move expensive phases (erosion, histograms) to **Web Workers**.
- Use **instanced meshes** for trees; vary crown/trunk geometry detail with the triangle budget to maintain a stable frame time.
- Only rebuild changed **tiles** when sliders move; re‑solve sea level after any phase that materially changes heights.

---

## 18) Risks & Mitigations

- **Risk:** Blue‑noise placement on a sparse suitability mask yields too few candidates.  
  **Mitigation:** Fall back to a second pass with a slightly smaller radius or increase candidate attempts deterministically.
- **Risk:** Sea‑level quantile conflicts with a hard “0% water” request on very rugged terrain.  
  **Mitigation:** Apply a post‑raise epsilon above sea level for all low cells; report how many were adjusted.
- **Risk:** Erosion non‑determinism due to floating‑point differences across platforms.  
  **Mitigation:** Fix iteration order, avoid parallel updates that depend on thread scheduling, and prefer stable accumulation patterns (e.g., two‑buffer ping‑pong).

---

## 19) What “Done” Looks Like

- A **MapSpec v1.1** can be serialized, reloaded, and produces the exact same mesh and decorations.
- QA can toggle **visual‑only** settings without altering any serialized outputs.
- Water and forest percentages are exact for multiple seeds and map sizes.
- Triangle count stays within budget; FPS and timings match targets for 128×128 and 256×256 maps.
- Automated tests cover determinism, coverage, spacing, and performance.

---

### Summary

By moving to a **constraint‑driven** architecture with **sub‑stream RNG**, **quantile sea‑level solve**, **blue‑noise placement**, **slope‑aware suitability**, and a **triangle budget**, you gain precise control and repeatability without sacrificing your low‑poly style. The user’s sliders become mathematically truthful, designer presets become reliable, and every map is reproducible down to the last tree.

