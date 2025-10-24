// Shader materials for terrain and water
import * as THREE from 'three';

// Terrain vertex shader with GPU displacement
const terrainVertexShader = `
uniform sampler2D uHeightMap;
uniform float uElevationScale;
uniform vec2 uMapSize;
uniform float uOctApothem;
uniform float uGridSpacing;

attribute vec3 instanceColor;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vHeight;

void main() {
    // Transform position to world space
    vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
    
    // Calculate UV from world position
    vec2 worldUV = worldPosition.xz / (uMapSize * uGridSpacing);
    worldUV.y = 1.0 - worldUV.y; // Flip Y
    vUv = worldUV;
    
    // Sample height from texture
    vec4 heightData = texture2D(uHeightMap, worldUV);
    float height = heightData.r;
    vHeight = height;
    
    // Displace vertex in world space
    worldPosition.y = height * uElevationScale;
    
    // Calculate normal from height map for lighting
    float texelSize = 1.0 / uMapSize.x;
    float hL = texture2D(uHeightMap, worldUV + vec2(-texelSize, 0.0)).r;
    float hR = texture2D(uHeightMap, worldUV + vec2(texelSize, 0.0)).r;
    float hD = texture2D(uHeightMap, worldUV + vec2(0.0, -texelSize)).r;
    float hU = texture2D(uHeightMap, worldUV + vec2(0.0, texelSize)).r;
    
    vec3 normalCalc;
    normalCalc.x = (hL - hR) * uElevationScale;
    normalCalc.z = (hD - hU) * uElevationScale;
    normalCalc.y = 2.0 * uOctApothem;
    vNormal = normalize(normalCalc);
    
    vPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

// Terrain fragment shader with splat texturing
const terrainFragmentShader = `
uniform sampler2D uSplatMap; // R=grass, G=rock, B=sand, A=snow
uniform vec3 uGrassColor;
uniform vec3 uRockColor;
uniform vec3 uSandColor;
uniform vec3 uSnowColor;
uniform float uSeaLevel;
uniform vec3 uLightDirection;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying float vHeight;

void main() {
    // Sample splat weights
    vec4 splat = texture2D(uSplatMap, vUv);
    
    // Blend colors based on weights
    vec3 color = vec3(0.0);
    color += uGrassColor * splat.r;
    color += uRockColor * splat.g;
    color += uSandColor * splat.b;
    color += uSnowColor * splat.a;
    
    // Lighting (simple diffuse) - brighter for RTS style
    float diffuse = max(dot(vNormal, uLightDirection), 0.5);
    color *= mix(0.9, 1.0, diffuse);
    
    // Very subtle ambient occlusion for depth
    float ao = smoothstep(uSeaLevel, uSeaLevel + 0.2, vHeight);
    color *= mix(0.85, 1.0, ao);
    
    // Fog
    float fogFactor = smoothstep(200.0, 500.0, length(vPosition));
    vec3 fogColor = vec3(0.7, 0.8, 0.9);
    color = mix(color, fogColor, fogFactor);
    
    gl_FragColor = vec4(color, 1.0);
}
`;

// Water vertex shader
const waterVertexShader = `
uniform float uTime;
uniform float uSeaLevel;
uniform float uElevationScale;

varying vec3 vPosition;
varying vec2 vUv;

void main() {
    vUv = uv;
    
    // Animate water surface
    vec3 pos = position;
    float wave1 = sin(pos.x * 0.5 + uTime * 0.5) * 0.2;
    float wave2 = sin(pos.z * 0.3 + uTime * 0.3) * 0.15;
    pos.y = uSeaLevel * uElevationScale + wave1 + wave2;
    
    vPosition = pos;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

// Water fragment shader
const waterFragmentShader = `
uniform float uTime;
uniform vec3 uLightDirection;

varying vec3 vPosition;
varying vec2 vUv;

void main() {
    // Water color with depth gradient
    vec3 shallowColor = vec3(0.2, 0.6, 0.8);
    vec3 deepColor = vec3(0.0, 0.2, 0.5);
    
    // Fake depth based on position
    float depth = sin(vUv.x * 10.0 + uTime * 0.2) * 0.5 + 0.5;
    vec3 waterColor = mix(shallowColor, deepColor, depth * 0.3);
    
    // Fake reflection/lighting
    float fresnel = pow(1.0 - abs(dot(normalize(vPosition), vec3(0, 1, 0))), 2.0);
    waterColor += fresnel * 0.2;
    
    // Transparency
    gl_FragColor = vec4(waterColor, 0.7);
}
`;

// Create terrain material
export function createTerrainMaterial(heightTexture, splatTexture, config, gridSpacing) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uHeightMap: { value: heightTexture },
            uSplatMap: { value: splatTexture },
            uElevationScale: { value: config.ELEVATION_SCALE },
            uSeaLevel: { value: config.SEA_LEVEL },
            uMapSize: { value: new THREE.Vector2(config.MAP_WIDTH, config.MAP_HEIGHT) },
            uOctApothem: { value: config.OCT_APOTHEM },
            uGridSpacing: { value: gridSpacing },
            uGrassColor: { value: new THREE.Color(0.35, 0.6, 0.25) },  // Darker, more saturated grass
            uRockColor: { value: new THREE.Color(0.45, 0.45, 0.45) },  // Slightly darker rock
            uSandColor: { value: new THREE.Color(0.8, 0.75, 0.55) },   // Muted sand
            uSnowColor: { value: new THREE.Color(0.9, 0.9, 0.95) },    // Slightly less bright snow
            uLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
        },
        vertexShader: terrainVertexShader,
        fragmentShader: terrainFragmentShader,
        side: THREE.DoubleSide,
        vertexColors: true,  // Enable instance colors
    });
}

// Create water material
export function createWaterMaterial(config) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSeaLevel: { value: config.SEA_LEVEL },
            uElevationScale: { value: config.ELEVATION_SCALE },
            uLightDirection: { value: new THREE.Vector3(0.5, 1.0, 0.3).normalize() },
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
}

// Create height texture from elevation data
export function createHeightTexture(elevationData, width, height) {
    const size = width * height;
    const data = new Uint8Array(size * 4);
    
    for (let i = 0; i < size; i++) {
        const value = Math.floor(elevationData[i] * 255);
        data[i * 4 + 0] = value; // R
        data[i * 4 + 1] = value; // G
        data[i * 4 + 2] = value; // B
        data[i * 4 + 3] = 255;   // A
    }
    
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    
    return texture;
}

// Create splat texture from weights
export function createSplatTexture(splatWeights, width, height) {
    const size = width * height;
    const data = new Uint8Array(size * 4);
    
    for (let i = 0; i < size; i++) {
        const weights = splatWeights[i];
        data[i * 4 + 0] = Math.floor(weights.grass * 255); // R = grass
        data[i * 4 + 1] = Math.floor(weights.rock * 255);  // G = rock
        data[i * 4 + 2] = Math.floor(weights.sand * 255);  // B = sand
        data[i * 4 + 3] = Math.floor(weights.snow * 255);  // A = snow
    }
    
    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    
    return texture;
}

