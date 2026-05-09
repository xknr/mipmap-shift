const MIN_TEXTURE_SIZE = 6;
const MAX_TEXTURE_SIZE = 2048;


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
    const padding = 20; // 10px padding * 2
    const gap = 10; // 10px gap
    const winW = window.innerWidth - padding;
    const winH = window.innerHeight - padding;

    // Temporarily hide canvas and reset UI scale to measure natural sizes
    this.canvas.style.display = 'none';
    this.uiContainer.style.zoom = 1;
    this.uiContainer.style.transform = 'none';

    // Test Config 1: Bottom (app col, ui row)
    this.appContainer.style.flexDirection = 'column';
    this.uiContainer.style.flexDirection = 'row';
    this.uiContainer.style.flexWrap = 'nowrap';

    const uiNatW1 = this.uiContainer.scrollWidth;
    const uiNatH1 = this.uiContainer.offsetHeight;
    const uiScale1 = Math.min(1.0, winW / uiNatW1);
    const uiScaledH1 = uiNatH1 * uiScale1;

    const availW1 = winW;
    const availH1 = Math.max(1, winH - gap - uiScaledH1);
    const canvasScale1 = Math.min(availW1 / model.viewW, availH1 / model.viewH);

    // Test Config 2: Right (app row, ui col)
    this.appContainer.style.flexDirection = 'row';
    this.uiContainer.style.flexDirection = 'column';
    this.uiContainer.style.flexWrap = 'nowrap';

    const uiNatH2 = this.uiContainer.scrollHeight;
    const uiNatW2 = this.uiContainer.offsetWidth;
    const uiScale2 = Math.min(1.0, winH / uiNatH2);
    const uiScaledW2 = uiNatW2 * uiScale2;

    const availW2 = Math.max(1, winW - gap - uiScaledW2);
    const availH2 = winH;
    const canvasScale2 = Math.min(availW2 / model.viewW, availH2 / model.viewH);

    let finalCanvasScale;
    if (canvasScale1 > canvasScale2) {
      // Config 1 wins
      this.appContainer.style.flexDirection = 'column';
      this.uiContainer.style.flexDirection = 'row';
      this.uiContainer.style.zoom = uiScale1;
      if (uiScale1 !== 1 && CSS.supports && !CSS.supports('zoom: 1')) {
        this.uiContainer.style.transform = `scale(${uiScale1})`;
        this.uiContainer.style.transformOrigin = 'top center';
      }
      finalCanvasScale = canvasScale1;
    } else {
      // Config 2 wins
      this.appContainer.style.flexDirection = 'row';
      this.uiContainer.style.flexDirection = 'column';
      this.uiContainer.style.zoom = uiScale2;
      if (uiScale2 !== 1 && CSS.supports && !CSS.supports('zoom: 1')) {
        this.uiContainer.style.transform = `scale(${uiScale2})`;
        this.uiContainer.style.transformOrigin = 'left center';
      }
      finalCanvasScale = canvasScale2;
    }

    this.canvas.style.display = 'block';

    let displayW = Math.max(1, Math.floor(model.viewW * finalCanvasScale));
    let displayH = Math.max(1, Math.floor(model.viewH * finalCanvasScale));

    console.log(`resizing canvas to ${displayW}x${displayH} from ${model.viewW}x${model.viewH}`);
    this.canvas.width = displayW;
    this.canvas.height = displayH;
    this.canvas.style.width = displayW + 'px';
    this.canvas.style.height = displayH + 'px';
  }
}

const model = new Model();
const webgl = new Webgl();
const gui = new Gui();
const graphics = new Graphics();

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowRight') {
    gui.setRenderMode(model.advRenderMode(1));
    e.preventDefault();
  }
  if (e.code === 'ArrowLeft') {
    gui.setRenderMode(model.advRenderMode(-1));
    e.preventDefault();
  }
});

gui.resSelect.addEventListener('change', (e) => {
  if (e.target.value === 'custom') {
    gui.customControls.style.display = 'flex';
    gui.resize();
  } else {
    gui.customControls.style.display = 'none';
    const [w, h] = e.target.value.split('x').map(Number);
    gui.initForSize(w, h);
  }
});

gui.btnApplyCustom.addEventListener('click', () => {
  let w = parseInt(gui.customW.value);
  let h = parseInt(gui.customH.value);
  if (!isNaN(w) && !isNaN(h)) {
    w = Math.max(MIN_TEXTURE_SIZE, Math.min(MAX_TEXTURE_SIZE, w));
    h = Math.max(MIN_TEXTURE_SIZE, Math.min(MAX_TEXTURE_SIZE, h));
    gui.customW.value = w;
    gui.customH.value = h;
    gui.initForSize(w, h);
  }
});

gui.btnNext.addEventListener('click', () => {
  gui.setRenderMode(model.advRenderMode(1));
});

gui.btnPrev.addEventListener('click', () => {
  gui.setRenderMode(model.advRenderMode(-1));
});

gui.btnSave.addEventListener('click', () => {
  gui.canvas.width = model.viewW;
  gui.canvas.height = model.viewH;

  graphics.render();

  const link = document.createElement('a');
  const filename = `study_${model.viewW}x${model.viewH}_lod${model.renderMode}.png`;
  link.download = filename;
  link.href = gui.canvas.toDataURL("image/png");
  link.click();

  gui.resize();
});

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

webgl.init();
graphics.init(vsSource, fsSource, blitFsSource, mipFsSource);
graphics.initBuffers();
gui.refreshHUD();
window.addEventListener('resize', () => gui.resize());
gui.resize();

function render() {
  graphics.render();
  requestAnimationFrame(render);
}

requestAnimationFrame(render);
