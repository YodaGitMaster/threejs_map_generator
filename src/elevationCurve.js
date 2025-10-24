/**
 * Elevation Curve System
 * 
 * Replaces hardcoded flattening with editable curves that remap
 * normalized noise (0-1) to desired elevation distribution.
 */

/**
 * Piecewise linear curve defined by control points
 */
class PiecewiseLinearCurve {
    constructor(points) {
        // Points should be sorted by x-coordinate
        this.points = points.sort((a, b) => a.x - b.x);
        
        // Validate
        if (this.points[0].x !== 0 || this.points[this.points.length - 1].x !== 1) {
            console.warn('Curve should start at x=0 and end at x=1');
        }
    }
    
    /**
     * Evaluate curve at given x value
     */
    evaluate(x) {
        // Clamp to [0, 1]
        x = Math.max(0, Math.min(1, x));
        
        // Find segment
        for (let i = 0; i < this.points.length - 1; i++) {
            const p0 = this.points[i];
            const p1 = this.points[i + 1];
            
            if (x >= p0.x && x <= p1.x) {
                // Linear interpolation
                const t = (x - p0.x) / (p1.x - p0.x);
                return p0.y + t * (p1.y - p0.y);
            }
        }
        
        // Shouldn't reach here, but return last point
        return this.points[this.points.length - 1].y;
    }
    
    /**
     * Apply curve to entire array
     */
    applyToArray(input, output = null) {
        if (!output) output = new Float32Array(input.length);
        
        for (let i = 0; i < input.length; i++) {
            output[i] = this.evaluate(input[i]);
        }
        
        return output;
    }
    
    /**
     * Get curve definition for serialization
     */
    serialize() {
        return {
            type: 'piecewise_linear',
            points: this.points.map(p => ({ x: p.x, y: p.y }))
        };
    }
}

/**
 * Preset elevation curves for different terrain styles
 */
export const ELEVATION_PRESETS = {
    /**
     * Original RTS-style stepped terrain
     * Creates distinct flat zones at different elevations
     */
    TERRACED_RTS: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.0 },   // Sea level
        { x: 0.4, y: 0.2 },   // Flat lowlands
        { x: 0.6, y: 0.4 },   // Mid plateau
        { x: 0.8, y: 0.7 },   // Hills
        { x: 1.0, y: 1.0 }    // Mountain peaks
    ]),
    
    /**
     * Smooth rolling hills
     * Gentle curves, no harsh plateaus
     */
    ROLLING_HILLS: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.1 },
        { x: 0.3, y: 0.3 },
        { x: 0.7, y: 0.6 },
        { x: 1.0, y: 0.95 }
    ]),
    
    /**
     * Sharp alpine mountains
     * Steep elevation gain in upper ranges
     */
    SHARP_ALPS: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.0 },
        { x: 0.5, y: 0.3 },
        { x: 0.7, y: 0.5 },
        { x: 0.9, y: 0.8 },
        { x: 1.0, y: 1.0 }
    ]),
    
    /**
     * Flat plains with occasional hills
     */
    FLATLANDS: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.25 },
        { x: 0.7, y: 0.35 },
        { x: 0.9, y: 0.5 },
        { x: 1.0, y: 0.7 }
    ]),
    
    /**
     * Volcanic islands - steep coastal cliffs, flat interior
     */
    VOLCANIC: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.0 },
        { x: 0.3, y: 0.1 },
        { x: 0.4, y: 0.4 },   // Sharp rise (cliffs)
        { x: 0.7, y: 0.5 },   // Flat plateau
        { x: 0.9, y: 0.7 },
        { x: 1.0, y: 1.0 }    // Central peak
    ]),
    
    /**
     * Canyon lands - deep valleys and high mesas
     */
    CANYONS: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.0 },
        { x: 0.2, y: 0.05 },  // Deep valleys
        { x: 0.3, y: 0.5 },   // Sharp cliffs
        { x: 0.8, y: 0.55 },  // Flat mesas
        { x: 1.0, y: 0.6 }
    ]),
    
    /**
     * Linear (no remapping) - for testing
     */
    LINEAR: new PiecewiseLinearCurve([
        { x: 0.0, y: 0.0 },
        { x: 1.0, y: 1.0 }
    ])
};

/**
 * Create custom curve from points
 */
export function createCustomCurve(points) {
    return new PiecewiseLinearCurve(points);
}

/**
 * Get preset by name
 */
export function getPreset(name) {
    const preset = ELEVATION_PRESETS[name];
    if (!preset) {
        console.warn(`Unknown preset: ${name}, using LINEAR`);
        return ELEVATION_PRESETS.LINEAR;
    }
    return preset;
}

/**
 * Deserialize curve from MapSpec
 */
export function deserializeCurve(spec) {
    if (spec.type === 'piecewise_linear') {
        return new PiecewiseLinearCurve(spec.points);
    }
    throw new Error(`Unknown curve type: ${spec.type}`);
}

/**
 * Apply elevation curve to noise field
 * 
 * @param {Float32Array} noiseData - Raw noise (0-1)
 * @param {string|PiecewiseLinearCurve} curve - Preset name or curve object
 * @returns {Float32Array} Remapped elevation (0-1)
 */
export function applyElevationCurve(noiseData, curve = 'TERRACED_RTS') {
    // Get curve object
    if (typeof curve === 'string') {
        curve = getPreset(curve);
    }
    
    // Apply curve
    return curve.applyToArray(noiseData);
}

/**
 * Preview curve - generate sample points for visualization
 */
export function generateCurvePreview(curve, sampleCount = 100) {
    if (typeof curve === 'string') {
        curve = getPreset(curve);
    }
    
    const samples = [];
    for (let i = 0; i <= sampleCount; i++) {
        const x = i / sampleCount;
        const y = curve.evaluate(x);
        samples.push({ x, y });
    }
    
    return samples;
}

/**
 * Get all available preset names
 */
export function getAvailablePresets() {
    return Object.keys(ELEVATION_PRESETS);
}

/**
 * Get preset metadata for UI
 */
export function getPresetInfo() {
    return {
        TERRACED_RTS: {
            name: 'Terraced RTS',
            description: 'Distinct flat zones at different elevations, ideal for RTS gameplay',
            style: 'stepped'
        },
        ROLLING_HILLS: {
            name: 'Rolling Hills',
            description: 'Gentle curves with smooth transitions',
            style: 'smooth'
        },
        SHARP_ALPS: {
            name: 'Sharp Alps',
            description: 'Steep mountains with dramatic elevation changes',
            style: 'mountainous'
        },
        FLATLANDS: {
            name: 'Flatlands',
            description: 'Mostly flat terrain with occasional hills',
            style: 'flat'
        },
        VOLCANIC: {
            name: 'Volcanic Islands',
            description: 'Steep coastal cliffs with flat interior plateaus',
            style: 'island'
        },
        CANYONS: {
            name: 'Canyon Lands',
            description: 'Deep valleys with high flat mesas',
            style: 'canyon'
        },
        LINEAR: {
            name: 'Linear (No Remapping)',
            description: 'Direct noise output without modification',
            style: 'raw'
        }
    };
}

export { PiecewiseLinearCurve };

