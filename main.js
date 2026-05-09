class Webgl {
  constructor(gl) {
    this.gl = gl;
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
    this.prog = createProgram(this.gl, vsSource, fsSource);
    this.blitProg = createProgram(this.gl, vsSource, blitFsSource);
    this.mipProg = createProgram(this.gl, vsSource, mipFsSource);
    this.uTexLoc = this.gl.getUniformLocation(this.blitProg, "uTex");
    this.uAspectLoc = this.gl.getUniformLocation(this.prog, "uAspect");
    this.uMipTexLoc = this.gl.getUniformLocation(this.mipProg, "uTex");
    this.uMipLodLoc = this.gl.getUniformLocation(this.mipProg, "uLod");

    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);
    this.vbo = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vbo);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), this.gl.STATIC_DRAW);
    this.gl.enableVertexAttribArray(0);
    this.gl.vertexAttribPointer(0, 2, this.gl.FLOAT, false, 0, 0);
  }

  initBuffers(w, h, numLevels) {
    if (this.tex) this.gl.deleteTexture(this.tex);
    if (this.fbo) this.gl.deleteFramebuffer(this.fbo);

    this.tex = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex);
    this.gl.texStorage2D(this.gl.TEXTURE_2D, numLevels, this.gl.RGBA8, w, h);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    this.fbo = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.fbo);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.tex, 0);
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

  refreshHUD() {
    const lod = this.renderMode;
    let w = this.viewW;
    let h = this.viewH;
    for (let i = 0; i < lod; i++) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
    }
    const ratio = (w / h).toFixed(4);
    const baseRatio = (this.viewW / this.viewH).toFixed(4);
    const delta = (ratio - baseRatio).toFixed(4);
    const deltaStr = (delta >= 0 ? "+" : "") + delta;

    this.hudLine1.textContent = `lod: ${lod} (${w}x${h})`;
    this.hudLine2.textContent = `ratio: ${ratio} (${deltaStr})`;
  }

  setRenderMode(mode) {
    this.renderMode = mode;
    this.refreshHUD();
  }

  advRenderMode(offset) {
    return (this.renderMode + offset + this.numLevels) % this.numLevels;
  }

  initBuffers() {
    const numLevels = this.calculateNumLevels();
    wg.initBuffers(this.viewW, this.viewH, numLevels);
  }

  initForSize(w, h) {
    this.viewW = w;
    this.viewH = h;
    this.setRenderMode(0);
    this.initBuffers();
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
    const canvasScale1 = Math.min(availW1 / this.viewW, availH1 / this.viewH);

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
    const canvasScale2 = Math.min(availW2 / this.viewW, availH2 / this.viewH);

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

    let displayW = Math.max(1, Math.floor(this.viewW * finalCanvasScale));
    let displayH = Math.max(1, Math.floor(this.viewH * finalCanvasScale));

    this.canvas.width = displayW;
    this.canvas.height = displayH;
    this.canvas.style.width = displayW + 'px';
    this.canvas.style.height = displayH + 'px';
  }
}

const gui = new Gui();
const gl = gui.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) {
  alert("WebGL 2 not supported");
  throw new Error("WebGL 2 not supported");
}

const wg = new Webgl(gl);



window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowRight') {
    gui.setRenderMode(gui.advRenderMode(1));
    e.preventDefault();
  }
  if (e.code === 'ArrowLeft') {
    gui.setRenderMode(gui.advRenderMode(-1));
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
    w = Math.max(6, Math.min(2048, w));
    h = Math.max(6, Math.min(2048, h));
    gui.customW.value = w;
    gui.customH.value = h;
    gui.initForSize(w, h);
  }
});

gui.btnNext.addEventListener('click', () => {
  gui.setRenderMode(gui.advRenderMode(1));
});

gui.btnPrev.addEventListener('click', () => {
  gui.setRenderMode(gui.advRenderMode(-1));
});

gui.btnSave.addEventListener('click', () => {
  gui.canvas.width = gui.viewW;
  gui.canvas.height = gui.viewH;

  gl.bindFramebuffer(gl.FRAMEBUFFER, wg.fbo);
  gl.viewport(0, 0, gui.viewW, gui.viewH);
  gl.useProgram(wg.prog);
  gl.uniform1f(wg.uAspectLoc, gui.viewW / gui.viewH);
  gl.bindVertexArray(wg.vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  gl.bindTexture(gl.TEXTURE_2D, wg.tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  drawOutput(gui.viewW, gui.viewH);

  const link = document.createElement('a');
  const filename = `study_${gui.viewW}x${gui.viewH}_lod${gui.renderMode}.png`;
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
}
`;

const blitFsSource = `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vTex;
out vec4 outColor;
void main() {
  outColor = texture(uTex, vTex);
}
`;

const mipFsSource = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uLod;
in vec2 vTex;
out vec4 outColor;
void main() {
  outColor = textureLod(uTex, vTex, uLod);
}
`;

function createShader(gl, type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    throw new Error('shader compile error');
  }
  return s;
}

function createProgram(gl, vSrc, fSrc) {
  const program = gl.createProgram();
  const vShader = createShader(gl, gl.VERTEX_SHADER, vSrc);
  const fShader = createShader(gl, gl.FRAGMENT_SHADER, fSrc);
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

wg.init(vsSource, fsSource, blitFsSource, mipFsSource);
gui.initBuffers();
gui.refreshHUD();
window.addEventListener('resize', () => gui.resize());
gui.resize();

function drawOutput(targetW, targetH) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, targetW, targetH);

  gl.useProgram(wg.mipProg);
  gl.bindTexture(gl.TEXTURE_2D, wg.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.uniform1f(wg.uMipLodLoc, gui.renderMode);

  gl.bindVertexArray(wg.vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function render() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, wg.fbo);
  gl.viewport(0, 0, gui.viewW, gui.viewH);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(wg.prog);
  gl.uniform1f(wg.uAspectLoc, gui.viewW / gui.viewH);
  gl.bindVertexArray(wg.vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

  gl.bindTexture(gl.TEXTURE_2D, wg.tex);
  gl.generateMipmap(gl.TEXTURE_2D);

  drawOutput(gui.canvas.width, gui.canvas.height);

  gl.bindTexture(gl.TEXTURE_2D, wg.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
