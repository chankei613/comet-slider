// Comet Slider - Minimal dependency-free slider with optional Three.js effects on the direct child <img> only.

// GLSL shaders for effects
const vertexShader = `
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
const fragmentWave = `
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
const fragmentRipple = `
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

const defaultOptions = {
  animation: 'wave', // 'wave' | 'ripple' | 'none'
  duration: 900, // ms
  autoplay: false,
  interval: 4000, // ms
  loop: true,
  onChange: null
};

class CometSlider {
  /**
   * @param {HTMLElement|string} rootOrSelector Container element or selector; its direct children <div> are slides.
   * @param {Partial<typeof defaultOptions>} options
   */
  constructor(rootOrSelector, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.root = typeof rootOrSelector === 'string' ? document.querySelector(rootOrSelector) : rootOrSelector;
    if (!this.root) throw new Error('Comet Slider root element not found');

    this.slides = Array.from(this.root.querySelectorAll(':scope > div'));
    if (this.slides.length === 0) throw new Error('No slides found. Place slides as direct <div> children.');

    this.index = 0;
    this._timer = null;
    this._isAnimating = false;

    this.root.classList.add('comet-root');
    this.slides.forEach((el, i) => {
      el.classList.add('comet-slide');
      el.setAttribute('data-active', i === 0 ? 'true' : 'false');
    });

    if (this.options.autoplay) {
      this.play();
    }
  }

  play() {
    this.stop();
    this._timer = setInterval(() => this.next(), this.options.interval);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  next() {
    const to = this.index + 1;
    if (to >= this.slides.length) {
      if (!this.options.loop) return;
    }
    this.show((to + this.slides.length) % this.slides.length);
  }

  prev() {
    const to = this.index - 1;
    if (to < 0) {
      if (!this.options.loop) return;
    }
    this.show((to + this.slides.length) % this.slides.length);
  }

  show(toIndex) {
    if (this._isAnimating || toIndex === this.index) return;
    const fromIndex = this.index;
    const fromSlide = this.slides[fromIndex];
    const toSlide = this.slides[toIndex];

    const fromImg = this._getDirectImg(fromSlide);
    const toImg = this._getDirectImg(toSlide);
    if (!fromImg || !toImg) {
      // Fallback to instant switch if images are missing
      this._activateIndex(toIndex);
      return;
    }

    this._isAnimating = true;
    const { animation } = this.options;

    if (animation === 'none') {
      // simple fade affecting only the images
      this._fadeImages(fromSlide, toSlide, fromImg, toImg, () => {
        this._activateIndex(toIndex);
        this._isAnimating = false;
        this._emitChange(fromIndex, toIndex);
      });
    } else {
      this._webglTransition(animation, fromSlide, toSlide, fromImg, toImg)
        .then(() => {
          this._activateIndex(toIndex);
          this._isAnimating = false;
          this._emitChange(fromIndex, toIndex);
        })
        .catch((error) => {
          console.warn('WebGL transition failed, falling back to fade:', error);
          // last-resort fallback
          this._fadeImages(fromSlide, toSlide, fromImg, toImg, () => {
            this._activateIndex(toIndex);
            this._isAnimating = false;
            this._emitChange(fromIndex, toIndex);
          });
        });
    }
  }

  destroy() {
    this.stop();
    // minimal cleanup
  }

  _activateIndex(idx) {
    this.slides[this.index].setAttribute('data-active', 'false');
    this.slides[idx].setAttribute('data-active', 'true');
    this.index = idx;
  }

  _getDirectImg(slideEl) {
    // Prefer :scope > img
    const scoped = slideEl.querySelector(':scope > img');
    if (scoped) return scoped;
    // Fallback: first child img
    const child = Array.from(slideEl.children).find(c => c.tagName === 'IMG');
    return child || null;
  }

  _fadeImages(fromSlide, toSlide, fromImg, toImg, done) {
    const dur = this.options.duration;
    // Ensure toSlide is visible as slide, but fade images only
    toSlide.style.visibility = 'visible';
    toSlide.style.position = toSlide.style.position || 'relative';

    toImg.style.opacity = '0';
    toImg.style.transition = `opacity ${dur}ms ease`;
    fromImg.style.transition = `opacity ${dur}ms ease`;

    // Ensure both slides are active for the duration so text is visible correctly
    toSlide.setAttribute('data-active', 'true');
    fromSlide.setAttribute('data-active', 'true');

    requestAnimationFrame(() => {
      fromImg.style.opacity = '0';
      toImg.style.opacity = '1';
    });

    setTimeout(() => {
      // Reset styles
      fromImg.style.transition = '';
      toImg.style.transition = '';
      fromImg.style.opacity = '';
      toImg.style.opacity = '';
      // finalize
      fromSlide.setAttribute('data-active', 'false');
      toSlide.setAttribute('data-active', 'true');
      done();
    }, dur + 20);
  }

  async _webglTransition(kind, fromSlide, toSlide, fromImg, toImg) {
    // Check if Three.js is available globally - more comprehensive check
    let THREE;
    
    console.log('Checking Three.js availability...');
    console.log('window.THREE:', window.THREE);
    console.log('global THREE:', typeof window !== 'undefined' ? typeof window.THREE : 'window not available');
    
    // Try multiple ways to access Three.js
    if (typeof window !== 'undefined' && window.THREE) {
      THREE = window.THREE;
      console.log('Found THREE via window.THREE');
    } else if (typeof globalThis !== 'undefined' && globalThis.THREE) {
      THREE = globalThis.THREE;
      console.log('Found THREE via globalThis.THREE');
    } else {
      // Try to access THREE as a global variable
      try {
        THREE = eval('THREE');
        console.log('Found THREE via eval');
      } catch (e) {
        console.log('THREE not found via eval:', e.message);
      }
    }
    
    if (!THREE) {
      console.error('Three.js not found anywhere!');
      console.log('Available global properties containing "three":', 
        Object.keys(window).filter(k => k.toLowerCase().includes('three')));
      console.log('All THREE-related globals:', {
        'window.THREE': typeof window.THREE,
        'globalThis.THREE': typeof globalThis?.THREE,
        'self.THREE': typeof self?.THREE
      });
      return Promise.reject(new Error('Three.js not found. Please include Three.js before using WebGL animations.'));
    }
    
    console.log('Three.js found successfully! Version:', THREE.REVISION);
    
    // Verify essential Three.js components
    const requiredComponents = ['WebGLRenderer', 'Scene', 'OrthographicCamera', 'PlaneGeometry', 'ShaderMaterial', 'TextureLoader'];
    const missingComponents = requiredComponents.filter(comp => !THREE[comp]);
    
    if (missingComponents.length > 0) {
      console.error('Three.js components missing:', missingComponents);
      return Promise.reject(new Error(`Three.js components are incomplete. Missing: ${missingComponents.join(', ')}`));
    }
    
    console.log('All required Three.js components verified successfully');

    try {
      // Compute canvas position/size to cover only the image area within the slide
      const slideRect = fromSlide.getBoundingClientRect();
      const imgRect = fromImg.getBoundingClientRect();
      const relLeft = imgRect.left - slideRect.left;
      const relTop = imgRect.top - slideRect.top;
      const width = Math.round(imgRect.width);
      const height = Math.round(imgRect.height);

      console.log('WebGL transition starting:', { kind, width, height, revision: THREE.REVISION });

      // Create overlay canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'comet-canvas';
      canvas.style.position = 'absolute';
      canvas.style.left = `${relLeft}px`;
      canvas.style.top = `${relTop}px`;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '3';
      // Ensure slide positioning
      const prevPos = getComputedStyle(fromSlide).position;
      if (prevPos === 'static') fromSlide.style.position = 'relative';
      fromSlide.appendChild(canvas);

      const renderer = new THREE.WebGLRenderer({ 
        canvas, 
        alpha: true, 
        antialias: true, 
        powerPreference: 'high-performance' 
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      // Plane covers clipspace -1..1 (use PlaneGeometry for newer Three.js versions)
      let geometry;
      if (THREE.PlaneBufferGeometry) {
        geometry = new THREE.PlaneBufferGeometry(2, 2);
      } else {
        geometry = new THREE.PlaneGeometry(2, 2);
      }
      
      const loader = new THREE.TextureLoader();

      const [t0, t1] = await Promise.all([
        this._loadTexture(loader, fromImg.src),
        this._loadTexture(loader, toImg.src)
      ]);
      
      t0.minFilter = THREE.LinearFilter;
      t1.minFilter = THREE.LinearFilter;
      t0.magFilter = THREE.LinearFilter;
      t1.magFilter = THREE.LinearFilter;

      const uniforms = {
        progress: { value: 0 },
        tex0: { value: t0 },
        tex1: { value: t1 },
        resolution: { value: new THREE.Vector2(width, height) },
        time: { value: 0 }
      };

      const fragmentShader = kind === 'ripple' ? fragmentRipple : fragmentWave;

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true
      });

      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      // Hide only the images during animation; keep texts visible
      const prevFromOpacity = fromImg.style.opacity;
      const prevToOpacity = toImg.style.opacity;
      fromImg.style.opacity = '0';
      toImg.style.opacity = '0';
      // Ensure both slides are visible so that text/layout stays intact
      toSlide.setAttribute('data-active', 'true');
      fromSlide.setAttribute('data-active', 'true');

      // Animate
      const dur = this.options.duration;
      const start = performance.now();

      return new Promise((resolve, reject) => {
        const step = (now) => {
          try {
            const t = Math.min(1, (now - start) / dur);
            uniforms.progress.value = t;
            uniforms.time.value = (now - start) * 0.001;
            renderer.render(scene, camera);
            
            if (t < 1) {
              this._raf = requestAnimationFrame(step);
            } else {
              // Cleanup
              if (this._raf) cancelAnimationFrame(this._raf);
              // Reveal destination image only
              toImg.style.opacity = prevToOpacity || '';
              fromImg.style.opacity = prevFromOpacity || '';
              try {
                renderer.dispose();
                geometry.dispose();
                material.dispose();
                if (t0.dispose) t0.dispose();
                if (t1.dispose) t1.dispose();
              } catch (disposeError) {
                console.warn('Dispose error:', disposeError);
              }
              canvas.remove();
              // finalize slide active state
              fromSlide.setAttribute('data-active', 'false');
              toSlide.setAttribute('data-active', 'true');
              console.log('WebGL transition completed');
              resolve();
            }
          } catch (stepError) {
            console.error('Animation step error:', stepError);
            // Cleanup on error
            if (this._raf) cancelAnimationFrame(this._raf);
            canvas.remove();
            toImg.style.opacity = prevToOpacity || '';
            fromImg.style.opacity = prevFromOpacity || '';
            reject(stepError);
          }
        };
        
        try {
          this._raf = requestAnimationFrame(step);
        } catch (e) {
          console.error('Failed to start animation:', e);
          // Fallback
          canvas.remove();
          toImg.style.opacity = prevToOpacity || '';
          fromImg.style.opacity = prevFromOpacity || '';
          reject(e);
        }
      });

    } catch (error) {
      console.error('WebGL transition setup error:', error);
      return Promise.reject(error);
    }
  }

  _loadTexture(loader, src) {
    return new Promise((resolve, reject) => {
      loader.load(
        src, 
        (texture) => {
          console.log('Texture loaded:', src);
          resolve(texture);
        }, 
        undefined, 
        (error) => {
          console.error('Texture load error:', error);
          reject(error);
        }
      );
    });
  }

  _emitChange(fromIndex, toIndex) {
    if (this.options.onChange && typeof this.options.onChange === 'function') {
      this.options.onChange(toIndex, fromIndex);
    }
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.CometSlider = CometSlider;
}
