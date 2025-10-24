/**
 * Deterministic RNG with Sub-Stream Architecture
 * 
 * Provides independent random number streams for different systems
 * to ensure changing one system doesn't affect others.
 */

/**
 * Simple hash function to derive sub-seeds from master seed + label
 * Uses MurmurHash3-like mixing
 */
function hashSeed(seed, label) {
    let hash = seed ^ 0x9e3779b9;
    
    // Mix in label characters
    for (let i = 0; i < label.length; i++) {
        hash ^= label.charCodeAt(i);
        hash = Math.imul(hash, 0x85ebca6b);
        hash ^= hash >>> 13;
    }
    
    // Final avalanche
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    
    return hash >>> 0; // Ensure positive 32-bit integer
}

/**
 * Linear Congruential Generator (LCG)
 * Fast, deterministic, sufficient quality for procedural generation
 */
class LCG {
    constructor(seed) {
        this.state = seed >>> 0; // Ensure unsigned 32-bit
    }
    
    /**
     * Returns next random value in [0, 1)
     */
    next() {
        this.state = (this.state * 1664525 + 1013904223) >>> 0;
        return this.state / 0x100000000;
    }
    
    /**
     * Returns random integer in [min, max)
     */
    nextInt(min, max) {
        return Math.floor(this.next() * (max - min)) + min;
    }
    
    /**
     * Returns random float in [min, max)
     */
    nextFloat(min, max) {
        return this.next() * (max - min) + min;
    }
    
    /**
     * Returns random boolean with given probability
     */
    nextBool(probability = 0.5) {
        return this.next() < probability;
    }
    
    /**
     * Returns random element from array
     */
    choice(array) {
        return array[this.nextInt(0, array.length)];
    }
    
    /**
     * Shuffle array in place (Fisher-Yates)
     */
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = this.nextInt(0, i + 1);
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    /**
     * Get current state (for debugging/validation)
     */
    getState() {
        return this.state;
    }
    
    /**
     * Set state (for resuming from saved state)
     */
    setState(state) {
        this.state = state >>> 0;
    }
}

/**
 * Multi-Stream RNG Manager
 * Creates independent RNG streams for different systems
 */
export class MultiStreamRNG {
    constructor(masterSeed) {
        this.masterSeed = masterSeed;
        this.streams = new Map();
        this.subSeeds = {}; // Track derived sub-seeds for serialization
    }
    
    /**
     * Get or create a named RNG stream
     * @param {string} label - Stream identifier (e.g., 'terrain', 'lakes', 'trees')
     * @returns {LCG} Independent RNG for this stream
     */
    getStream(label) {
        if (!this.streams.has(label)) {
            const subSeed = hashSeed(this.masterSeed, label);
            this.subSeeds[label] = subSeed;
            this.streams.set(label, new LCG(subSeed));
        }
        return this.streams.get(label);
    }
    
    /**
     * Reset a specific stream (useful for regenerating one system)
     */
    resetStream(label) {
        if (this.streams.has(label)) {
            const subSeed = this.subSeeds[label];
            this.streams.set(label, new LCG(subSeed));
        }
    }
    
    /**
     * Reset all streams
     */
    resetAll() {
        this.streams.clear();
        this.subSeeds = {};
    }
    
    /**
     * Get all sub-seeds (for serialization/validation)
     */
    getSubSeeds() {
        return { ...this.subSeeds };
    }
    
    /**
     * Get snapshot of all stream states (for debugging)
     */
    getStreamStates() {
        const states = {};
        for (const [label, rng] of this.streams.entries()) {
            states[label] = rng.getState();
        }
        return states;
    }
}

/**
 * Create a simple seeded RNG (backwards compatible)
 */
export function createSeededRandom(seed) {
    const rng = new LCG(seed);
    return () => rng.next();
}

/**
 * Validation: Generate reproducible sequence for testing
 */
export function validateDeterminism(seed, count = 100) {
    const multi = new MultiStreamRNG(seed);
    const results = {
        terrain: [],
        lakes: [],
        trees: [],
        biomes: []
    };
    
    const labels = ['terrain', 'lakes', 'trees', 'biomes'];
    for (const label of labels) {
        const rng = multi.getStream(label);
        for (let i = 0; i < count; i++) {
            results[label].push(rng.next());
        }
    }
    
    return {
        subSeeds: multi.getSubSeeds(),
        sequences: results,
        states: multi.getStreamStates()
    };
}

export { LCG, hashSeed };

