/**
 * Three.js shaders for U-shaped page curl flip animation.
 *
 * Vertex shader deforms page geometry along Z-axis based on progress p (0→1),
 * producing a U-shaped wave: center dips, edges curl up.
 *
 * ── Tunable parameters (uniforms) ──
 * uProgress: 0→1 flip progress
 * uCurlStrength: amplitude multiplier for bending (default 0.35)
 * uCurlFrequency: wave cycles across page width (default 2.8)
 * uCornerLift: extra lift at free corner (default 0.15)
 * uBackAlpha: back-side visibility during flip (0→1 at p=0.5)
 */

export const pageVertShader = /* glsl */ `
  varying vec2 vUv;
  varying float vProgress;
  uniform float uProgress;
  uniform float uCurlStrength;
  uniform float uCurlFrequency;
  uniform float uCornerLift;

  void main() {
    vUv = uv;

    // ── U-shaped page curl ──
    // Wave across X (width of page): center dips, edges lift
    float waveX = sin(position.x * uCurlFrequency + uProgress * 3.14159) * uCurlStrength;

    // Corner lift: free corner (far edge) lifts more as progress increases
    float cornerLift = position.x * uCornerLift * uProgress;

    // Combined Z deformation: wave + corner lift, scaled by progress
    float zDeform = (waveX * 0.6 + cornerLift * 0.4) * smoothstep(0.0, 0.15, uProgress) * smoothstep(1.0, 0.85, uProgress);

    // Y translation: slight upward lift during flip peak
    float yLift = sin(uProgress * 3.14159) * 0.08;

    // Page rotation around left edge (Y axis) — simulates the flip
    float rotationAngle = uProgress * 3.14159;
    float cosA = cos(rotationAngle);
    float sinA = sin(rotationAngle);

    // Rotate around Y=0 (left edge / spine)
    vec3 rotated = vec3(
      position.x * cosA - position.z * sinA,
      position.y + yLift,
      position.x * sinA + position.z * cosA + zDeform
    );

    vProgress = uProgress;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(rotated, 1.0);
  }
`;

export const pageFragShader = /* glsl */ `
  varying vec2 vUv;
  varying float vProgress;
  uniform sampler2D uTexture;
  uniform sampler2D uBackTexture;
  uniform float uBackAlpha;
  uniform vec3 uLightDir;
  uniform float uAmbient;
  uniform float uSpecular;

  void main() {
    vec4 frontColor = texture2D(uTexture, vUv);
    vec4 backColor = texture2D(uBackTexture, vec2(1.0 - vUv.x, vUv.y));

    // Blend front → back during flip
    float backBlend = smoothstep(0.3, 0.7, vProgress);
    vec4 baseColor = mix(frontColor, backColor, backBlend * uBackAlpha);

    // ── Dynamic lighting ──
    // Simulate crease highlight at the bending point
    float creaseX = abs(vUv.x - 0.5) * 2.0; // 0 at center, 1 at edges
    float highlight = 1.0 - smoothstep(0.0, 0.3, creaseX) * 0.4;
    float shadow = 1.0 - smoothstep(0.5, 1.0, creaseX) * 0.3 * vProgress;

    // Specular at crease
    float spec = pow(1.0 - abs(creaseX - 0.15), 8.0) * uSpecular * vProgress;

    vec3 lit = baseColor.rgb * uAmbient;
    lit += highlight * shadow * 0.15;
    lit += spec * 0.12;

    gl_FragColor = vec4(lit, baseColor.a);
  }
`;

// ── CSS fallback transform ──

/**
 * Generate CSS transform + clip-path for page flip fallback.
 * @param progress 0→1 flip progress
 * @param direction 'forward' | 'backward'
 * @returns React.CSSProperties
 */
export function cssPageFlipStyle(
  progress: number,
  direction: 'forward' | 'backward',
): React.CSSProperties {
  const p = Math.max(0, Math.min(1, progress));
  const isForward = direction === 'forward';

  // Perspective transform origin: left edge for forward, right for backward
  const originX = isForward ? '0%' : '100%';
  const rotateY = isForward ? -p * 150 : p * 150;

  // Clip path: reveal/hide during flip
  const clipProgress = isForward ? p : 1 - p;
  const clipRight = 100 - clipProgress * 100;

  // Shadow
  const shadowIntensity = Math.sin(p * Math.PI) * 40;
  const shadowX = isForward ? shadowIntensity : -shadowIntensity;

  return {
    transformOrigin: `${originX} 50%`,
    transform: `perspective(1200px) rotateY(${rotateY}deg)`,
    clipPath: `inset(0 ${clipRight}% 0 0)`,
    boxShadow: `${shadowX}px 0 ${shadowIntensity * 0.8}px rgba(0,0,0,${0.15 + p * 0.2})`,
    transition: 'none', // controlled by JS animation frame
  };
}
