import { marked } from './lib/marked.esm.js';

const MIN_TEXTURE_SIZE = 6;
const MAX_TEXTURE_SIZE = 2048;

async function renderMarkdown() {
  const target = document.getElementById('readme-view');
  try {
    const response = await fetch('README.md');
    if (!response.ok) throw new Error('README.md not found');

    const text = await response.text();

    target.innerHTML = marked.parse(text);
    if (typeof gui !== 'undefined') {
      requestAnimationFrame(() => gui.resize());
    }
  } catch (err) {
    target.innerHTML = `
      <div style="color:#ff4444; text-align:center; padding: 20px;">
        <h3>error loading readme.md</h3>
        <p>${err.message}</p>
      </div>`;
  }
}

class Model {
  constructor() {
    this.viewW = 980;
    this.viewH = 808;
    this.renderMode = 0;
    this.numLevels = 1;
  }

  calculateNumLevels() {
    let w = this.viewW;
    let h = this.viewH;
    let levels = 1;
    while (w > 1 || h > 1) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      levels++;
    }
    this.numLevels = levels;
    return levels;
  }

  advRenderMode(offset) {
    return (this.renderMode + offset + this.numLevels) % this.numLevels;
  }
}

class Webgl {
  init() {
    this.gl = gui.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!this.gl) {
      alert("WebGL 2 not supported");
      throw new Error("WebGL 2 not supported");
    }
  }
  createShader(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      throw new Error('shader compile error');
    }
    return s;
  }

  createProgram(vSrc, fSrc) {
    const gl = this.gl;
    const program = gl.createProgram();
    const vShader = this.createShader(gl.VERTEX_SHADER, vSrc);
    const fShader = this.createShader(gl.FRAGMENT_SHADER, fSrc);
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      throw new Error('program link error');
    }
    gl.deleteShader(vShader);
    gl.deleteShader(fShader);
    return program;
  }
}

class Graphics {
  constructor() {
    this.prog = null;
    this.blitProg = null;
    this.mipProg = null;
    this.uTexLoc = null;
    this.uAspectLoc = null;
    this.uMipTexLoc = null;
    this.uMipLodLoc = null;
    this.tex = null;
    this.fbo = null;
    this.vao = null;
    this.vbo = null;
  }

  init(vsSource, fsSource, blitFsSource, mipFsSource) {
    const gl = webgl.gl;
    this.prog = webgl.createProgram(vsSource, fsSource);
    this.blitProg = webgl.createProgram(vsSource, blitFsSource);
    this.mipProg = webgl.createProgram(vsSource, mipFsSource);
    this.uTexLoc = gl.getUniformLocation(this.blitProg, "uTex");
    this.uAspectLoc = gl.getUniformLocation(this.prog, "uAspect");
    this.uMipTexLoc = gl.getUniformLocation(this.mipProg, "uTex");
    this.uMipLodLoc = gl.getUniformLocation(this.mipProg, "uLod");

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  initBuffers() {
    const numLevels = model.calculateNumLevels();
    const w = model.viewW;
    const h = model.viewH;

    const gl = webgl.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);

    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texStorage2D(gl.TEXTURE_2D, numLevels, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
  }

  render() {
    const gl = webgl.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, model.viewW, model.viewH);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.prog);
    gl.uniform1f(this.uAspectLoc, model.viewW / model.viewH);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.generateMipmap(gl.TEXTURE_2D);

    const targetW = gui.canvas.width;
    const targetH = gui.canvas.height;
    const renderMode = model.renderMode;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, targetW, targetH);

    gl.useProgram(this.mipProg);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.uniform1f(this.uMipLodLoc, renderMode);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
}

class Gui {
  constructor() {
    this.canvas = document.getElementById('glCanvas');
    this.hudLine1 = document.getElementById('hud-line1');
    this.hudLine2 = document.getElementById('hud-line2');
    this.resSelect = document.getElementById('res-select');
    this.customControls = document.getElementById('custom-res-controls');
    this.customW = document.getElementById('custom-w');
    this.customH = document.getElementById('custom-h');
    this.btnApplyCustom = document.getElementById('btn-apply-custom');
    this.btnNext = document.getElementById('btn-next');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnSave = document.getElementById('btn-save');
    this.uiContainer = document.getElementById('ui-container');
    this.appContainer = document.getElementById('app-container');
    this.doPrintLayoutExtents = false;
  }

  calibrate() {
    const originalDisplay = this.canvas.style.display;
    const originalFlex = this.appContainer.style.flexDirection;
    const originalUiFlex = this.uiContainer.style.flexDirection;
    const originalZoom = this.uiContainer.style.zoom;

    this.canvas.style.display = 'none';
    this.uiContainer.style.zoom = 1;
    this.uiContainer.style.transform = 'none';

    // Measure Row (Bottom)
    this.appContainer.style.flexDirection = 'column';
    this.uiContainer.style.flexDirection = 'row';
    let r = this.uiContainer.getBoundingClientRect();
    const rowW = r.width;
    const rowH = r.height;

    // Measure Col (Right)
    this.appContainer.style.flexDirection = 'row';
    this.uiContainer.style.flexDirection = 'column';
    r = this.uiContainer.getBoundingClientRect();
    const colW = r.width;
    const colH = r.height;

    // Restore
    this.canvas.style.display = originalDisplay;
    this.appContainer.style.flexDirection = originalFlex;
    this.uiContainer.style.flexDirection = originalUiFlex;
    this.uiContainer.style.zoom = originalZoom;

    return { rowW, rowH, colW, colH };
  }

  refreshHUD() {
    const lod = model.renderMode;
    let w = model.viewW;
    let h = model.viewH;
    for (let i = 0; i < lod; i++) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
    const ratio = (w / h).toFixed(4);
    const baseRatio = (model.viewW / model.viewH).toFixed(4);
    const delta = (ratio - baseRatio).toFixed(4);
    const deltaStr = (delta >= 0 ? "+" : "") + delta;

    this.hudLine1.textContent = `lod: ${lod} (${w}x${h})`;
    this.hudLine2.textContent = `ratio: ${ratio} (${deltaStr})`;
  }

  setRenderMode(mode) {
    model.renderMode = mode;
    this.refreshHUD();
  }

  initForSize(w, h) {
    model.viewW = w;
    model.viewH = h;
    this.setRenderMode(0);
    graphics.initBuffers();
    this.resize();
  }

  resize() {
    const { rowW, rowH, colW, colH } = this.calibrate();

    const padding = 20;
    const gap = 10;
    const canvasBorder = 4;
    const safety = 4;
    const vW = document.documentElement.clientWidth - padding - safety;
    const vH = document.documentElement.clientHeight - padding - safety;

    // Calc Config 1: BOTTOM
    const uiScale1 = Math.min(1.0, vW / rowW);
    const uiH1 = rowH * uiScale1;
    const availW1 = vW - canvasBorder;
    const availH1 = Math.max(1, vH - gap - uiH1 - canvasBorder);
    const canvasScale1 = Math.min(availW1 / model.viewW, availH1 / model.viewH);

    // Calc Config 2: RIGHT
    const uiScale2 = Math.min(1.0, vH / colH);
    const uiW2 = colW * uiScale2;
    const availW2 = Math.max(1, vW - gap - uiW2 - canvasBorder);
    const availH2 = vH - canvasBorder;
    const canvasScale2 = Math.min(availW2 / model.viewW, availH2 / model.viewH);

    let finalCanvasScale, finalUiScale, isVertical;

    if (canvasScale1 >= canvasScale2) {
      isVertical = true;
      finalCanvasScale = canvasScale1;
      finalUiScale = uiScale1;
      this.appContainer.style.flexDirection = 'column';
      this.uiContainer.style.flexDirection = 'row';
    } else {
      isVertical = false;
      finalCanvasScale = canvasScale2;
      finalUiScale = uiScale2;
      this.appContainer.style.flexDirection = 'row';
      this.uiContainer.style.flexDirection = 'column';
    }

    // Apply scaling
    this.uiContainer.style.zoom = finalUiScale;
    if (finalUiScale !== 1 && CSS.supports && !CSS.supports('zoom: 1')) {
      this.uiContainer.style.transform = `scale(${finalUiScale})`;
      this.uiContainer.style.transformOrigin = isVertical ? 'top center' : 'left center';
    }

    const displayW = Math.floor(model.viewW * finalCanvasScale);
    const displayH = Math.floor(model.viewH * finalCanvasScale);
    this.canvas.width = displayW;
    this.canvas.height = displayH;
    this.canvas.style.width = displayW + 'px';
    this.canvas.style.height = displayH + 'px';
    this.canvas.style.display = 'block';

    if (this.doPrintLayoutExtents)
      this.printLayoutExtents(isVertical, finalCanvasScale, finalUiScale);
  }

  printLayoutExtents(isVertical, finalCanvasScale, finalUiScale) {
    const cRect = this.canvas.getBoundingClientRect();
    const uRect = this.uiContainer.getBoundingClientRect();
    const vW = document.documentElement.clientWidth;
    const vH = document.documentElement.clientHeight;

    console.log(`config: ${isVertical ? 'bottom' : 'right'}, scales: [canvas=${finalCanvasScale.toFixed(3)}, ui=${finalUiScale.toFixed(3)}]`);
    console.log(`viewport: ${vW}x${vH}`);
    console.log(`canvas:  [${cRect.left.toFixed(1)}, ${cRect.top.toFixed(1)}] to [${cRect.right.toFixed(1)}, ${cRect.bottom.toFixed(1)}]`);
    console.log(`ui:      [${uRect.left.toFixed(1)}, ${uRect.top.toFixed(1)}] to [${uRect.right.toFixed(1)}, ${uRect.bottom.toFixed(1)}]`);
  }

  init() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowRight') {
        this.setRenderMode(model.advRenderMode(1));
        e.preventDefault();
      }
      if (e.code === 'ArrowLeft') {
        this.setRenderMode(model.advRenderMode(-1));
        e.preventDefault();
      }
    });

    this.resSelect.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        this.customControls.style.display = 'flex';
        this.resize();
      } else {
        this.customControls.style.display = 'none';
        const [w, h] = e.target.value.split('x').map(Number);
        this.initForSize(w, h);
      }
    });

    this.btnApplyCustom.addEventListener('click', () => {
      let w = parseInt(this.customW.value);
      let h = parseInt(this.customH.value);
      if (!isNaN(w) && !isNaN(h)) {
        w = Math.max(MIN_TEXTURE_SIZE, Math.min(MAX_TEXTURE_SIZE, w));
        h = Math.max(MIN_TEXTURE_SIZE, Math.min(MAX_TEXTURE_SIZE, h));
        this.customW.value = w;
        this.customH.value = h;
        this.initForSize(w, h);
      }
    });

    this.btnNext.addEventListener('click', () => {
      this.setRenderMode(model.advRenderMode(1));
    });

    this.btnPrev.addEventListener('click', () => {
      this.setRenderMode(model.advRenderMode(-1));
    });

    this.btnSave.addEventListener('click', () => {
      this.canvas.width = model.viewW;
      this.canvas.height = model.viewH;
      graphics.render();
      const link = document.createElement('a');
      const filename = `study_${model.viewW}x${model.viewH}_lod${model.renderMode}.png`;
      link.download = filename;
      link.href = this.canvas.toDataURL("image/png");
      link.click();
      this.resize();
    });

    window.addEventListener('resize', () => this.resize());
  }
}

const vsSource = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vTex;
void main() {
  vTex = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const fsSource = `#version 300 es
precision highp float;
uniform float uAspect;
in vec2 vTex;
out vec4 outColor;
void main() {
  float s = sin((vTex.x-0.5) * 108.0) * sin((vTex.y-0.5) * 108.0 / uAspect) * 0.5 + 0.5;
  float val;
  if (vTex.x + vTex.y > 0.66 && vTex.x + vTex.y < 1.333
  && vTex.x + 1.0 - vTex.y > 0.66 && vTex.x +1.0- vTex.y < 1.333) {
    val = s > 0.5 ? 1.0 : 0.0;
  } else {
    val = 0.0;
  }

  float cross = 0.0;
  if (abs(vTex.x - 0.5) < 0.001 || abs(vTex.y - 0.5) < 0.001) cross = 1.0;
  
  if (cross > 0.5) {
    outColor = vec4(1.0, 0.0, 0.0, 1.0);
  } else {
    outColor = vec4(vec3(val), 1.0);
  }
}`;

const blitFsSource = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vTex;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vTex);
}`;

const mipFsSource = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uLod;
in vec2 vTex;
out vec4 outColor;
void main() {
  outColor = textureLod(uTex, vTex, uLod);
}`;

const graphics = new Graphics();
const webgl = new Webgl();
const model = new Model();
const gui = new Gui();

webgl.init();
graphics.init(vsSource, fsSource, blitFsSource, mipFsSource);
graphics.initBuffers();
gui.init();
gui.refreshHUD();
gui.resize();
renderMarkdown();

function render() {
  graphics.render();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
