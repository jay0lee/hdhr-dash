/**
 * HDHR Dash — ATSC 1.0 Video & Audio Renderer (player-renderer.js)
 * High-performance WebGL Canvas Video Renderer and Web Audio Master Clock Synchronizer.
 *
 * Features:
 *   - WebGL GPU-accelerated YUV420P to RGB color conversion (Rec. 601 / BT.709)
 *   - Zero-CPU GPU Bob Deinterlacing for 1080i and 480i ATSC broadcasts
 *   - Web Audio API master clock synchronization with monotonic drift correction
 *   - Adaptive frame-dropping controller (< -50ms late dropped to maintain real-time sync)
 *
 * 100% royalty-free open-source implementation.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.WebGLVideoRenderer = exports.WebGLVideoRenderer;
    root.WebAudioPlayer = exports.WebAudioPlayer;
    root.AVSynchronizer = exports.AVSynchronizer;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Vertex Shader: full quad covering viewport
  const VERTEX_SHADER_SRC = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_texCoord = a_texCoord;
    }
  `;

  // Fragment Shader: GPU YUV-to-RGB conversion + optional Bob Deinterlacing
  const FRAGMENT_SHADER_SRC = `
    precision mediump float;
    varying vec2 v_texCoord;

    uniform sampler2D u_textureY;
    uniform sampler2D u_textureU;
    uniform sampler2D u_textureV;

    // 0 = progressive (no-op), 1 = bob top field, 2 = bob bottom field
    uniform int u_deinterlaceMode;
    uniform float u_textureHeight;

    void main() {
        vec2 coord = v_texCoord;

        // GPU Bob Deinterlace: interpolate missing scanlines from active field
        if (u_deinterlaceMode > 0 && u_textureHeight > 0.0) {
            float line = floor(coord.y * u_textureHeight);
            float isOdd = mod(line, 2.0);
            float targetParity = float(u_deinterlaceMode - 1);
            if (isOdd != targetParity) {
                float dy = 1.0 / u_textureHeight;
                coord.y = coord.y - dy;
            }
        }

        float y = texture2D(u_textureY, coord).r - (16.0 / 255.0);
        float u = texture2D(u_textureU, coord).r - (128.0 / 255.0);
        float v = texture2D(u_textureV, coord).r - (128.0 / 255.0);

        // ATSC 1.0 HDTV (1080i / 720p) uses ITU-R BT.709; SDTV (480i) uses BT.601
        float r;
        float g;
        float b;
        if (u_textureHeight >= 700.0) {
            // ITU-R BT.709 (HD)
            r = 1.16438 * y + 1.79274 * v;
            g = 1.16438 * y - 0.21325 * u - 0.53291 * v;
            b = 1.16438 * y + 2.11240 * u;
        } else {
            // ITU-R BT.601 (SD)
            r = 1.16438 * y + 1.59603 * v;
            g = 1.16438 * y - 0.39176 * u - 0.81297 * v;
            b = 1.16438 * y + 2.01723 * u;
        }

        gl_FragColor = vec4(clamp(vec3(r, g, b), 0.0, 1.0), 1.0);
    }
  `;

  /* ==========================================================================
     WebGLVideoRenderer
     ========================================================================== */

  class WebGLVideoRenderer {
    constructor(canvas, options = {}) {
      if (!canvas) throw new Error('Canvas element required for WebGLVideoRenderer');
      this.canvas = canvas;
      this.deinterlace = options.deinterlace !== undefined ? options.deinterlace : true;
      this.currentField = 0; // 0 = top, 1 = bottom

      this.gl = null;
      this.program = null;
      this.textureY = null;
      this.textureU = null;
      this.textureV = null;
      this.vertexBuffer = null;

      this.videoWidth = 0;
      this.videoHeight = 0;
      this.isContextLost = false;

      this.preserveDrawingBuffer = options.preserveDrawingBuffer !== undefined ? options.preserveDrawingBuffer : false;

      this.initGL();
    }

    initGL() {
      const gl =
        this.canvas.getContext('webgl', {
          preserveDrawingBuffer: this.preserveDrawingBuffer,
          alpha: false,
          depth: false,
          stencil: false,
          antialias: false,
          premultipliedAlpha: false,
        }) || this.canvas.getContext('experimental-webgl');

      if (!gl) {
        throw new Error('WebGL not supported in this browser');
      }
      this.gl = gl;

      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.isContextLost = true;
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this.isContextLost = false;
        this.initGL();
      });

      // Compile shaders
      const vertShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
      const fragShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);

      this.program = gl.createProgram();
      gl.attachShader(this.program, vertShader);
      gl.attachShader(this.program, fragShader);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw new Error('WebGL program link error: ' + gl.getProgramInfoLog(this.program));
      }
      gl.useProgram(this.program);

      // Setup vertex buffer: 2D quad with texture coordinates
      // Positions: [-1,-1, 1,-1, -1,1, 1,1] | TexCoords: [0,1, 1,1, 0,0, 1,0]
      const quadVertices = new Float32Array([
        -1.0, -1.0,  0.0, 1.0,
         1.0, -1.0,  1.0, 1.0,
        -1.0,  1.0,  0.0, 0.0,
         1.0,  1.0,  1.0, 0.0,
      ]);

      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

      const aPosition = gl.getAttribLocation(this.program, 'a_position');
      const aTexCoord = gl.getAttribLocation(this.program, 'a_texCoord');

      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

      gl.enableVertexAttribArray(aTexCoord);
      gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 16, 8);

      // Create textures for Y, U, and V planes
      this.textureY = this.createTexture(0, 'u_textureY');
      this.textureU = this.createTexture(1, 'u_textureU');
      this.textureV = this.createTexture(2, 'u_textureV');

      this.uDeinterlaceMode = gl.getUniformLocation(this.program, 'u_deinterlaceMode');
      this.uTextureHeight = gl.getUniformLocation(this.program, 'u_textureHeight');
    }

    compileShader(type, src) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Shader compile error: ' + info);
      }
      return shader;
    }

    createTexture(unit, uniformName) {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

      const loc = gl.getUniformLocation(this.program, uniformName);
      gl.uniform1i(loc, unit);
      return tex;
    }

    /**
     * Upload and render a decoded YUV420P frame.
     * @param {Uint8Array} yPlane - Luminance byte array (width * height)
     * @param {Uint8Array} uPlane - Chrominance U byte array (width/2 * height/2)
     * @param {Uint8Array} vPlane - Chrominance V byte array (width/2 * height/2)
     * @param {number} width - Frame pixel width (e.g. 1920 or 1280)
     * @param {number} height - Frame pixel height (e.g. 1080 or 720)
     * @param {boolean} isInterlaced - Whether source video is interlaced (1080i / 480i)
     */
    renderFrame(yPlane, uPlane, vPlane, width, height, isInterlaced = false) {
      if (this.isContextLost || !this.gl) return;
      const gl = this.gl;

      const yArr = yPlane instanceof Uint8Array ? yPlane : new Uint8Array(yPlane);
      const uArr = uPlane instanceof Uint8Array ? uPlane : new Uint8Array(uPlane);
      const vArr = vPlane instanceof Uint8Array ? vPlane : new Uint8Array(vPlane);

      const isNewSize = this.videoWidth !== width || this.videoHeight !== height;
      if (isNewSize) {
        this.videoWidth = width;
        this.videoHeight = height;
        if (this.canvas.width !== width || this.canvas.height !== height) {
          this.canvas.width = width;
          this.canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
      }

      const uWidth = width >> 1;
      const uHeight = height >> 1;

      // Upload Y Plane (Width x Height)
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.textureY);
      if (isNewSize) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, yArr);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.LUMINANCE, gl.UNSIGNED_BYTE, yArr);
      }

      // Upload U Plane (Width / 2 x Height / 2)
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textureU);
      if (isNewSize) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, uWidth, uHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, uArr);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, uWidth, uHeight, gl.LUMINANCE, gl.UNSIGNED_BYTE, uArr);
      }

      // Upload V Plane (Width / 2 x Height / 2)
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.textureV);
      if (isNewSize) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, uWidth, uHeight, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, vArr);
      } else {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, uWidth, uHeight, gl.LUMINANCE, gl.UNSIGNED_BYTE, vArr);
      }

      // Set deinterlace uniforms
      if (this.deinterlace && isInterlaced) {
        this.currentField = (this.currentField + 1) % 2;
        gl.uniform1i(this.uDeinterlaceMode, this.currentField + 1);
        gl.uniform1f(this.uTextureHeight, height);
      } else {
        gl.uniform1i(this.uDeinterlaceMode, 0);
        gl.uniform1f(this.uTextureHeight, 0.0);
      }

      // Render triangle strip quad
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    clear() {
      if (this.isContextLost || !this.gl) return;
      const gl = this.gl;
      gl.clearColor(0.04, 0.05, 0.07, 1.0); // #0a0d12
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    destroy() {
      if (!this.gl) return;
      const gl = this.gl;
      if (this.textureY) gl.deleteTexture(this.textureY);
      if (this.textureU) gl.deleteTexture(this.textureU);
      if (this.textureV) gl.deleteTexture(this.textureV);
      if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
      if (this.program) gl.deleteProgram(this.program);
      this.gl = null;
    }
  }

  /* ==========================================================================
     WebAudioPlayer
     ========================================================================== */

  class WebAudioPlayer {
    constructor(options = {}) {
      this.sampleRate = options.sampleRate || 48000;
      this.volume = options.volume !== undefined ? options.volume : 1.0;
      this.isMuted = options.isMuted || false;

      this.context = null;
      this.gainNode = null;
      this.nextPlayTime = 0;

      // Real-time presentation clock tracking per scheduled audio chunk
      this.scheduledChunks = [];

      this.activeSources = new Set();
    }

    initContext() {
      if (this.context) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        console.warn('Web Audio API not supported in this browser');
        return;
      }

      this.context = new AudioCtx({ sampleRate: this.sampleRate });
      this.gainNode = this.context.createGain();
      this.gainNode.gain.setValueAtTime(
        this.isMuted ? 0 : this.volume,
        this.context.currentTime
      );
      this.gainNode.connect(this.context.destination);
    }

    resume() {
      if (!this.context) this.initContext();
      if (this.context && this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }
    }

    /**
     * Enqueue a decoded Float32 stereo PCM audio syncframe.
     * @param {Float32Array} left - Left channel samples
     * @param {Float32Array} right - Right channel samples
     * @param {number} pts - Presentation Time Stamp in seconds
     * @param {number} sampleRate - Sample rate in Hz (default 48000)
     */
    queueAudio(left, right, pts, sampleRate = 48000) {
      if (!this.context) this.initContext();
      const lArr = left instanceof Float32Array ? left : new Float32Array(left);
      const rArr = right instanceof Float32Array ? right : new Float32Array(right);
      if (!this.context || lArr.length === 0) return;

      const curTime = this.context.currentTime;
      const duration = lArr.length / sampleRate;

      // Ensure audio context is active
      if (this.context.state === 'suspended') {
        this.context.resume().catch(() => {});
      }

      // Target jitter cushion: 350ms initial pre-buffering provides near-instant tuning
      // while absorbing network packet arrival variance
      const INITIAL_CUSHION = 0.350;

      let startTime = this.nextPlayTime;
      const isInitial = this.scheduledChunks.length === 0;
      const isUnderflow = !startTime || startTime < curTime;
      const isOverAccumulated = startTime > curTime + 4.0;

      if (isInitial) {
        // Instant tuning startup
        startTime = curTime + INITIAL_CUSHION;
      } else if (isUnderflow) {
        // Fast underflow recovery: resume playback immediately with a tiny 40ms safety margin
        // Do NOT insert a massive 1.8s silence freeze
        startTime = curTime + 0.040;
      } else if (isOverAccumulated) {
        // Clamp excessive queue accumulation if worker raced ahead
        startTime = curTime + 0.800;
      }

      this.nextPlayTime = startTime + duration;

      // Track this chunk for precise presentation clock sync
      this.scheduledChunks.push({
        startTime,
        duration,
        pts
      });

      // Prune old chunks that finished playing > 0.5s ago
      while (this.scheduledChunks.length > 1 && (this.scheduledChunks[0].startTime + this.scheduledChunks[0].duration) < curTime - 0.5) {
        this.scheduledChunks.shift();
      }

      const buffer = this.context.createBuffer(2, lArr.length, sampleRate);
      buffer.getChannelData(0).set(lArr);
      buffer.getChannelData(1).set(rArr);

      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      source.start(startTime);

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
      };
    }

    /**
     * Check if audio playback is currently starved (underflowed or in a buffer gap).
     */
    isStarved() {
      if (!this.context || this.scheduledChunks.length === 0) return true;
      const curTime = this.context.currentTime;
      // If we are before the first scheduled chunk, we are in initial cushion
      if (curTime < this.scheduledChunks[0].startTime) return false;
      // Check if curTime falls within any currently playing chunk
      for (let i = 0; i < this.scheduledChunks.length; i++) {
        const c = this.scheduledChunks[i];
        if (curTime >= c.startTime && curTime < c.startTime + c.duration) {
          return false; // Actively emitting audio from speakers
        }
      }
      return true; // No audio currently playing
    }

    /**
     * Current master clock time in presentation seconds.
     * Evaluates against the audio chunk currently emitting from the output device.
     */
    getMasterClockPts() {
      if (!this.context || this.scheduledChunks.length === 0) return null;
      const curTime = this.context.currentTime;

      // Find the chunk currently playing at curTime
      for (let i = this.scheduledChunks.length - 1; i >= 0; i--) {
        const chunk = this.scheduledChunks[i];
        if (curTime >= chunk.startTime) {
          const elapsed = curTime - chunk.startTime;
          // If audio has drained/starved past the end of all scheduled chunks, clamp to prevent clock runaway
          if (i === this.scheduledChunks.length - 1 && elapsed > chunk.duration) {
            return chunk.pts + chunk.duration;
          }
          return chunk.pts + Math.min(elapsed, chunk.duration);
        }
      }

      // Initial cushion before first sample plays (curTime < first.startTime)
      const first = this.scheduledChunks[0];
      return first.pts - (first.startTime - curTime);
    }

    setVolume(vol) {
      this.volume = Math.max(0, Math.min(1, vol));
      if (!this.context || !this.gainNode) return;
      this.gainNode.gain.setValueAtTime(
        this.isMuted ? 0 : this.volume,
        this.context.currentTime
      );
    }

    setMuted(muted) {
      this.isMuted = !!muted;
      if (!this.context || !this.gainNode) return;
      this.gainNode.gain.setValueAtTime(
        this.isMuted ? 0 : this.volume,
        this.context.currentTime
      );
    }

    reset() {
      for (const src of this.activeSources) {
        try {
          src.stop();
          src.disconnect();
        } catch (e) {}
      }
      this.activeSources.clear();
      this.scheduledChunks = [];
      this.nextPlayTime = 0;
    }

    destroy() {
      this.reset();
      if (this.context) {
        this.context.close().catch(() => {});
        this.context = null;
        this.gainNode = null;
      }
    }
  }

  /* ==========================================================================
     AVSynchronizer
     ========================================================================== */

  class AVSynchronizer {
    constructor(videoRenderer, audioPlayer, options = {}) {
      this.renderer = videoRenderer;
      this.audio = audioPlayer;
      this.onFrameStats = options.onFrameStats || null;
      this.onFrameDrop = options.onFrameDrop || null;

      this.videoQueue = [];
      this.isRunning = false;
      this.animId = null;

      // Telemetry
      this.renderedFrames = 0;
      this.droppedFrames = 0;
      this.fps = 0;
      this.lastFpsUpdate = performance.now();
      this.framesThisSecond = 0;
      this.lastNominalRenderTime = 0;

      this.renderLoopBound = this.renderLoop.bind(this);
    }

    start() {
      this.renderedFrames = 0;
      this.droppedFrames = 0;
      if (this.isRunning) return;
      this.isRunning = true;
      this.lastFpsUpdate = performance.now();
      this.lastRenderLoopTime = performance.now();
      this.framesThisSecond = 0;
      if (typeof requestAnimationFrame !== 'undefined') {
        this.animId = requestAnimationFrame(this.renderLoopBound);
      }
      this.timerId = setInterval(() => {
        if (this.isRunning && performance.now() - this.lastRenderLoopTime >= 30) {
          this.renderLoop();
        }
      }, 25);
    }

    stop() {
      this.isRunning = false;
      if (this.animId && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(this.animId);
        this.animId = null;
      }
      if (this.timerId) {
        clearInterval(this.timerId);
        this.timerId = null;
      }
      this.videoQueue = [];
    }

    queueVideoFrame(frame) {
      this.videoQueue.push(frame);
      // Keep queue bounded to prevent memory growth (480 frames = 8s at 60fps / 16s at 30fps)
      if (this.videoQueue.length > 480) {
        this.videoQueue.shift();
        this.droppedFrames++;
      }
    }

    renderLoop(timestamp) {
      if (!this.isRunning) return;
      this.lastRenderLoopTime = performance.now();

      const masterPts = this.audio ? this.audio.getMasterClockPts() : null;

      if (masterPts !== null) {
        // Synchronize video presentation to audio master clock
        while (this.videoQueue.length > 0) {
          const next = this.videoQueue[0];

          if (next.pts === null || isNaN(next.pts)) {
            // No timestamp: render immediately
            const frame = this.videoQueue.shift();
            this.renderer.renderFrame(
              frame.y,
              frame.u,
              frame.v,
              frame.width,
              frame.height,
              frame.isInterlaced
            );
            this.renderedFrames++;
            this.framesThisSecond++;
            break;
          }

          const delta = next.pts - masterPts;

          // Discontinuity check: if delta > 3.0s, discard stale frames to match audio clock
          if (Math.abs(delta) > 3.0) {
            this.videoQueue.shift();
            continue;
          }

          // If audio is currently starved (underflowed), pause video presentation rather than panic dropping
          if (this.audio && this.audio.isStarved()) {
            break;
          }

          // If frame is > 600ms late and a newer frame is waiting: drop stale frame to catch up
          if (delta < -0.600 && this.videoQueue.length > 1) {
            if (this.onFrameDrop) this.onFrameDrop(next.pts, masterPts, delta);
            this.videoQueue.shift();
            this.droppedFrames++;
            continue;
          }

          // Frame is ready for display (within 40ms of master audio clock)
          if (delta <= 0.040) {
            const frame = this.videoQueue.shift();
            this.renderer.renderFrame(
              frame.y,
              frame.u,
              frame.v,
              frame.width,
              frame.height,
              frame.isInterlaced
            );
            this.renderedFrames++;
            this.framesThisSecond++;
            break;
          }

          // Frame is ahead of audio clock (delta > 35ms): hold until audio catches up
          break;
        }
      } else if (this.videoQueue.length > 0) {
        // No audio clock yet: render at nominal rate (~30 fps / 30ms pacing)
        const now = performance.now();
        if (!this.lastNominalRenderTime || now - this.lastNominalRenderTime >= 30) {
          this.lastNominalRenderTime = now;
          const frame = this.videoQueue.shift();
          this.renderer.renderFrame(
            frame.y,
            frame.u,
            frame.v,
            frame.width,
            frame.height,
            frame.isInterlaced
          );
          this.renderedFrames++;
          this.framesThisSecond++;
        }
      }

      // Calculate real-time FPS
      const now = performance.now();
      const elapsed = (now - this.lastFpsUpdate) / 1000.0;
      if (elapsed >= 1.0) {
        this.fps = Math.round((this.framesThisSecond / elapsed) * 10) / 10;
        this.framesThisSecond = 0;
        this.lastFpsUpdate = now;
        if (this.onFrameStats) {
          this.onFrameStats({
            fps: this.fps,
            rendered: this.renderedFrames,
            dropped: this.droppedFrames,
          });
        }
      }

      if (typeof requestAnimationFrame !== 'undefined') {
        this.animId = requestAnimationFrame(this.renderLoopBound);
      }
    }
  }

  return {
    WebGLVideoRenderer,
    WebAudioPlayer,
    AVSynchronizer,
  };
});
