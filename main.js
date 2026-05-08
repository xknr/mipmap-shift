const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
if (!gl) {
  alert("WebGL 2 not supported");
  throw new Error("WebGL 2 not supported");
}

const hudLine1 = document.getElementById('hud-line1');
const hudLine2 = document.getElementById('hud-line2');
const resSelect = document.getElementById('res-select');

function initForSize(w, h) {
  VIEW_W = w;
  VIEW_H = h;
  renderMode = 0;
  initBuffers();
  resize();
  refreshHUD();
}

function refreshHUD() {
  const lod = renderMode;
  let w = VIEW_W;
  let h = VIEW_H;
  for (let i = 0; i < lod; i++) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
  }
  const ratio = (w / h).toFixed(4);
  const baseRatio = (VIEW_W / VIEW_H).toFixed(4);
  const delta = (ratio - baseRatio).toFixed(4);
  const deltaStr = (delta >= 0 ? "+" : "") + delta;

  hudLine1.textContent = `lod: ${lod} (${w}x${h})`;
  hudLine2.textContent = `ratio: ${ratio} (${deltaStr})`;
}


let VIEW_W = 980, VIEW_H = 808;
let renderMode = 0;
let numLevels = 1;

function calculateNumLevels() {
  let w = VIEW_W;
  let h = VIEW_H;
  let levels = 1;
  while (w > 1 || h > 1) {
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
    levels++;
  }
  return levels;
}

let tex, fbo;
function initBuffers() {
  if (tex) gl.deleteTexture(tex);
  if (fbo) gl.deleteFramebuffer(fbo);

  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  numLevels = calculateNumLevels();
  gl.texStorage2D(gl.TEXTURE_2D, numLevels, gl.RGBA8, VIEW_W, VIEW_H);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
}

initBuffers();
refreshHUD();

window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowRight') {
    renderMode = (renderMode + 1) % numLevels;
    refreshHUD();
    e.preventDefault();
  }
  if (e.code === 'ArrowLeft') {
    renderMode = (renderMode - 1 + numLevels) % numLevels;
    refreshHUD();
    e.preventDefault();
  }
});

resSelect.addEventListener('change', (e) => {
  const customControls = document.getElementById('custom-res-controls');
  if (e.target.value === 'custom') {
    customControls.style.display = 'flex';
    resize(); // Recalculate layout immediately since UI dimensions just changed
  } else {
    customControls.style.display = 'none';
    const [w, h] = e.target.value.split('x').map(Number);
    initForSize(w, h);
  }
});

document.getElementById('btn-apply-custom').addEventListener('click', () => {
  let w = parseInt(document.getElementById('custom-w').value);
  let h = parseInt(document.getElementById('custom-h').value);
  if (!isNaN(w) && !isNaN(h)) {
    w = Math.max(6, Math.min(2048, w));
    h = Math.max(6, Math.min(2048, h));
    document.getElementById('custom-w').value = w;
    document.getElementById('custom-h').value = h;
    initForSize(w, h);
  }
});

document.getElementById('btn-next').addEventListener('click', () => {
  renderMode = (renderMode + 1) % numLevels;
  refreshHUD();
});

document.getElementById('btn-prev').addEventListener('click', () => {
  renderMode = (renderMode - 1 + numLevels) % numLevels;
  refreshHUD();
});

document.getElementById('btn-save').addEventListener('click', () => {
  // 1. Temporary Resize to Internal Res
  canvas.width = VIEW_W;
  canvas.height = VIEW_H;

  // 2. Render one frame at full res
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, VIEW_W, VIEW_H);
  gl.useProgram(prog);
  gl.uniform1f(uAspectLoc, VIEW_W / VIEW_H);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.generateMipmap(gl.TEXTURE_2D);
  drawOutput(VIEW_W, VIEW_H);

  // 3. Capture
  const link = document.createElement('a');
  const lod = renderMode;
  const filename = `study_${VIEW_W}x${VIEW_H}_lod${lod}.png`;
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();

  // 4. Restore Display Size
  resize();
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

  // Center Crosshair
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

const prog = createProgram(gl, vsSource, fsSource);
const blitProg = createProgram(gl, vsSource, blitFsSource);
const mipProg = createProgram(gl, vsSource, mipFsSource);
const uTexLoc = gl.getUniformLocation(blitProg, "uTex");
const uAspectLoc = gl.getUniformLocation(prog, "uAspect");
const uMipTexLoc = gl.getUniformLocation(mipProg, "uTex");
const uMipLodLoc = gl.getUniformLocation(mipProg, "uLod");

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);


function resize() {
  const padding = 40; // 20px padding * 2
  const gap = 20; // 20px gap
  const winW = window.innerWidth - padding;
  const winH = window.innerHeight - padding;
  
  const ui = document.getElementById('ui-container');
  const app = document.getElementById('app-container');
  
  // Temporarily hide canvas and reset UI scale to measure natural sizes
  canvas.style.display = 'none';
  ui.style.zoom = 1;
  ui.style.transform = 'none';
  
  // Test Config 1: Bottom (app col, ui row)
  app.style.flexDirection = 'column';
  ui.style.flexDirection = 'row';
  ui.style.flexWrap = 'nowrap'; // force nowrap to measure true required width
  
  const uiNatW1 = ui.scrollWidth;
  const uiNatH1 = ui.offsetHeight;
  const uiScale1 = Math.min(1.0, winW / uiNatW1);
  const uiScaledH1 = uiNatH1 * uiScale1;
  
  const availW1 = winW;
  const availH1 = Math.max(1, winH - gap - uiScaledH1);
  const canvasScale1 = Math.min(availW1 / VIEW_W, availH1 / VIEW_H);
  
  // Test Config 2: Right (app row, ui col)
  app.style.flexDirection = 'row';
  ui.style.flexDirection = 'column';
  ui.style.flexWrap = 'nowrap';
  
  const uiNatH2 = ui.scrollHeight;
  const uiNatW2 = ui.offsetWidth;
  const uiScale2 = Math.min(1.0, winH / uiNatH2);
  const uiScaledW2 = uiNatW2 * uiScale2;
  
  const availW2 = Math.max(1, winW - gap - uiScaledW2);
  const availH2 = winH;
  const canvasScale2 = Math.min(availW2 / VIEW_W, availH2 / VIEW_H);
  
  let finalCanvasScale;
  if (canvasScale1 > canvasScale2) {
    // Config 1 wins
    app.style.flexDirection = 'column';
    ui.style.flexDirection = 'row';
    ui.style.zoom = uiScale1;
    // Fallback for browsers that don't support zoom
    if (uiScale1 !== 1 && CSS.supports && !CSS.supports('zoom: 1')) {
      ui.style.transform = `scale(${uiScale1})`;
      ui.style.transformOrigin = 'top center';
    }
    finalCanvasScale = canvasScale1;
  } else {
    // Config 2 wins
    app.style.flexDirection = 'row';
    ui.style.flexDirection = 'column';
    ui.style.zoom = uiScale2;
    // Fallback for browsers that don't support zoom
    if (uiScale2 !== 1 && CSS.supports && !CSS.supports('zoom: 1')) {
      ui.style.transform = `scale(${uiScale2})`;
      ui.style.transformOrigin = 'left center';
    }
    finalCanvasScale = canvasScale2;
  }
  
  // Restore canvas display
  canvas.style.display = 'block';
  
  let displayW = Math.max(1, Math.floor(VIEW_W * finalCanvasScale));
  let displayH = Math.max(1, Math.floor(VIEW_H * finalCanvasScale));
  
  console.log(`resizing canvas to ${displayW}x${displayH} from ${VIEW_W}x${VIEW_H}`);
  
  canvas.width = displayW;
  canvas.height = displayH;
  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';
}
window.addEventListener('resize', resize);
resize();

function drawOutput(targetW, targetH) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, targetW, targetH);

  gl.useProgram(mipProg);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.uniform1f(uMipLodLoc, renderMode);

  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
}

function render() {
  // 1. Draw Pattern to Source FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, VIEW_W, VIEW_H);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(prog);
  gl.uniform1f(uAspectLoc, VIEW_W / VIEW_H);
  gl.bindVertexArray(vao);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

  // 2. Generate Mipmaps
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.generateMipmap(gl.TEXTURE_2D);

  // 3. Display result to screen
  drawOutput(canvas.width, canvas.height);

  // Restore state for next frame
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
