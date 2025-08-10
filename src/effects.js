// Minimal GLSL shaders for two effects: wave and ripple.
// Both expect uniforms: progress (0..1), tex0, tex1, resolution(vec2), time(float)
export const vertexShader = `
  precision mediump float;
  attribute vec3 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Simple sine-wave horizontal distortion
export const fragmentWave = `
  precision mediump float;
  uniform sampler2D tex0;
  uniform sampler2D tex1;
  uniform float progress;
  uniform vec2 resolution;
  uniform float time;
  varying vec2 vUv;

  // Ease in-out
  float easeInOut(float t) {
    return t < 0.5 ? 2.0*t*t : -1.0 + (4.0 - 2.0*t)*t;
  }

  void main() {
    float p = easeInOut(clamp(progress, 0.0, 1.0));
    // wave amount decreases as we reach the end
    float amp = 0.03 * (1.0 - p);
    float freq = 12.0;
    vec2 uv0 = vUv;
    vec2 uv1 = vUv;

    uv0.x += sin((uv0.y + time*0.5) * freq) * amp;
    uv1.x += sin((uv1.y + time*0.5) * freq) * (-amp);

    vec4 c0 = texture2D(tex0, uv0);
    vec4 c1 = texture2D(tex1, uv1);

    // crossfade masked by a soft vertical wipe
    float mask = smoothstep(0.0, 1.0, vUv.x + (p - 0.5)*0.6);
    vec4 color = mix(c0, c1, mask * p + p*0.2); // slightly bias towards next
    gl_FragColor = color;
  }
`;

// Ripple from center with radial distortion
export const fragmentRipple = `
  precision mediump float;
  uniform sampler2D tex0;
  uniform sampler2D tex1;
  uniform float progress;
  uniform vec2 resolution;
  uniform float time;
  varying vec2 vUv;

  float easeInOut(float t) {
    return t < 0.5 ? 2.0*t*t : -1.0 + (4.0 - 2.0*t)*t;
  }

  void main() {
    float p = easeInOut(clamp(progress, 0.0, 1.0));
    vec2 center = vec2(0.5, 0.5);
    vec2 toUv = vUv - center;
    float r = length(toUv);

    // ripple ring moves outward with progress
    float ring = smoothstep(p*0.8, p*0.8 + 0.15, r);
    float distort = (0.03 * (1.0 - p)) * sin(24.0 * r - p * 8.0);

    vec2 uv0 = vUv + normalize(toUv) * distort * (1.0 - p);
    vec2 uv1 = vUv - normalize(toUv) * distort * p;

    vec4 c0 = texture2D(tex0, uv0);
    vec4 c1 = texture2D(tex1, uv1);

    // blend more where the ring has passed
    float mixAmt = smoothstep(0.0, 1.0, p) * ring;
    vec4 color = mix(c0, c1, max(p, mixAmt));
    gl_FragColor = color;
  }
`;