// SimplexNoise implementation for terrain generation
// Based on Stefan Gustavson's implementation

class SimplexNoise {
    constructor(seed = 0) {
        this.seed = seed;
        this.p = this._buildPermutation(seed);
    }
    
    _buildPermutation(seed) {
        const p = new Uint8Array(512);
        const perm = new Uint8Array(256);
        
        // Initialize with values 0-255
        for (let i = 0; i < 256; i++) {
            perm[i] = i;
        }
        
        // Shuffle using seed
        let random = this._seededRandom(seed);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        
        // Duplicate for overflow
        for (let i = 0; i < 512; i++) {
            p[i] = perm[i & 255];
        }
        
        return p;
    }
    
    _seededRandom(seed) {
        let state = seed;
        return function() {
            state = (state * 1664525 + 1013904223) | 0;
            return ((state >>> 0) / 4294967296);
        };
    }
    
    // 2D simplex noise
    noise2D(x, y) {
        const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
        const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
        
        // Skew input space
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        
        // Determine which simplex
        let i1, j1;
        if (x0 > y0) {
            i1 = 1; j1 = 0;
        } else {
            i1 = 0; j1 = 1;
        }
        
        // Offsets for corners
        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;
        
        // Wrapped indices
        const ii = i & 255;
        const jj = j & 255;
        
        // Gradients
        const gi0 = this.p[ii + this.p[jj]] % 12;
        const gi1 = this.p[ii + i1 + this.p[jj + j1]] % 12;
        const gi2 = this.p[ii + 1 + this.p[jj + 1]] % 12;
        
        // Contributions from corners
        let n0 = 0, n1 = 0, n2 = 0;
        
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * this._grad2(gi0, x0, y0);
        }
        
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * this._grad2(gi1, x1, y1);
        }
        
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * this._grad2(gi2, x2, y2);
        }
        
        // Sum and scale to [-1, 1]
        return 70.0 * (n0 + n1 + n2);
    }
    
    _grad2(hash, x, y) {
        const grad2 = [
            [1,1], [-1,1], [1,-1], [-1,-1],
            [1,0], [-1,0], [1,0], [-1,0],
            [0,1], [0,-1], [0,1], [0,-1]
        ];
        const g = grad2[hash];
        return g[0] * x + g[1] * y;
    }
}

// Fractal Brownian Motion (fBm) noise
export function fbm(noise, x, y, params) {
    const { octaves, frequency, gain, lacunarity } = params;
    let value = 0;
    let amplitude = 1.0;
    let freq = frequency;
    let maxValue = 0;
    
    for (let i = 0; i < octaves; i++) {
        value += noise.noise2D(x * freq, y * freq) * amplitude;
        maxValue += amplitude;
        amplitude *= gain;
        freq *= lacunarity;
    }
    
    return value / maxValue;
}

// Generate a 2D noise field
export function generateNoiseField(width, height, seed, params) {
    const noise = new SimplexNoise(seed);
    const field = new Float32Array(width * height);
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const value = fbm(noise, x, y, params);
            // Normalize to [0, 1]
            field[idx] = (value + 1) * 0.5;
        }
    }
    
    return field;
}

export { SimplexNoise };

