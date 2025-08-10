// Minimal dependency-free slider with optional Three.js effects on the direct child <img> only.
const defaultOptions = {
  animation: 'wave', // 'wave' | 'ripple' | 'none'
  duration: 900, // ms
  autoplay: false,
  interval: 4000, // ms
  loop: true,
  threeModuleUrl: 'https://unpkg.com/three@0.166.0/build/three.module.js',
  onChange: null
};

export class Slider {
  /**
   * @param {HTMLElement|string} rootOrSelector Container element or selector; its direct children <div> are slides.
   * @param {Partial<typeof defaultOptions>} options
   */
  constructor(rootOrSelector, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.root = typeof rootOrSelector === 'string' ? document.querySelector(rootOrSelector) : rootOrSelector;
    if (!this.root) throw new Error('Slider root element not found');

    this.slides = Array.from(this.root.querySelectorAll(':scope > div'));
    if (this.slides.length === 0) throw new Error('No slides found. Place slides as direct <div> children.');

    this.index = 0;
    this._timer = null;
    this._isAnimating = false;

    this.root.classList.add('tdis-root');
    this.slides.forEach((el, i) => {
      el.classList.add('tdis-slide');
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
        .catch(() => {
          // last-resort fallback
          this._activateIndex(toIndex);
          this._isAnimating = false;
          this._emitChange(fromIndex, toIndex);
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
    // Lazy-load Three.js
    let THREE;
    try {
      THREE = await import(this.options.threeModuleUrl);
    } catch (e) {
      // Peer dep path (bundler env or node)
      try {
        THREE = await import('three');
      } catch (e2) {
        return Promise.reject(e2);
      }
    }
    const { vertexShader, fragmentWave, fragmentRipple } = await import('./effects.js');

    // Compute canvas position/size to cover only the image area within the slide
    const slideRect = fromSlide.getBoundingClientRect();
    const imgRect = fromImg.getBoundingClientRect();
    const relLeft = imgRect.left - slideRect.left;
    const relTop = imgRect.top - slideRect.top;
    const width = Math.round(imgRect.width);
    const height = Math.round(imgRect.height);

    // Create overlay canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'tdis-canvas';
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

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Plane covers clipspace -1..1
    const geometry = new THREE.PlaneBufferGeometry(2, 2);
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
      const step = now => {
        const t = Math.min(1, (now - start) / dur);
        uniforms.progress.value = t;
        uniforms.time.value = (now - start) * 0.001;
        renderer.render(scene, camera);
        if (t < 1) {
          this._raf = requestAnimationFrame(step);
        } else {
          // Cleanup
          cancelAnimationFrame(this._raf);
          // Reveal destination image only
          toImg.style.opacity = prevToOpacity || '';
          fromImg.style.opacity = prevFromOpacity || '';
          try {
            renderer.dispose();
            geometry.dispose();
            material.dispose();
            t0.dispose && t0.dispose();
            t1.dispose && t1.dispose();
          } catch {}
          canvas.remove();
          // finalize slide active state
          fromSlide.setAttribute('data-active', 'false');
          toSlide.setAttribute('data-active', 'true');
          resolve();
        }
      };
      try {
        this._raf = requestAnimationFrame(step);
      } catch (e) {
        // Fallback
        canvas.remove();
        toImg.style.opacity = prevToOpacity || '';
        fromImg.style.opacity = prevFromOpacity || '';
        reject(e);
      }
    });
  }

  _loadTexture(loader, src) {
    return new Promise((res, rej) => {
      loader.load(src, tex => res(tex), undefined, rej);
    });
  }
}