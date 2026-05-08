const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });

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

if (!gl) {
  alert("WebGL 2 not supported");
}

const MAX_CANVAS_W = 800;
const MAX_CANVAS_H = 600;
const MIN_CANVAS_W = 400;
const MIN_CANVAS_H = 300;
let VIEW_W = 980;
let VIEW_H = 808;

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
  } else {
    customControls.style.display = 'none';
    const [w, h] = e.target.value.split('x').map(Number);
    initForSize(w, h);
  }
});

document.getElementById('btn-apply-custom').addEventListener('click', () => {
  const w = parseInt(document.getElementById('custom-w').value);
  const h = parseInt(document.getElementById('custom-h').value);
  if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
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
  const aspect = VIEW_W / VIEW_H;
  
  // Start with the natural texture size
  let displayW = VIEW_W;
  let displayH = VIEW_H;

  // 1. Calculate the scale required to fit inside MAX bounds
  const maxScale = Math.min(MAX_CANVAS_W / displayW, MAX_CANVAS_H / displayH);
  
  // 2. Calculate the scale required to meet MIN bounds (at least one dimension)
  const minScale = Math.max(MIN_CANVAS_W / displayW, MIN_CANVAS_H / displayH);

  // We want to scale such that we are as large as possible but within MAX,
  // while also respecting MIN if possible.
  let scale = maxScale; 
  if (scale < minScale) {
    // If there's a conflict (extreme aspect ratio), minScale would push us out of MAX.
    // In this case, we prioritize MAX bounds but ensure we don't go below MIN if we can help it.
    // However, since we MUST preserve aspect ratio, we'll pick the scale that fits the MAX box.
    scale = maxScale;
  }
  
  // If the texture is already smaller than MAX, we don't necessarily want to scale UP 
  // unless it's smaller than MIN.
  if (displayW <= MAX_CANVAS_W && displayH <= MAX_CANVAS_H) {
    scale = Math.max(1.0, minScale); // Only scale up to MIN
    scale = Math.min(scale, maxScale); // But don't exceed MAX
  } else {
    scale = maxScale; // Scale down to fit MAX
  }

  displayW = Math.floor(VIEW_W * scale);
  displayH = Math.floor(VIEW_H * scale);

  console.log(`resizing canvas to ${displayW}x${displayH} from ${VIEW_W}x${VIEW_H}`);


  canvas.width = displayW;
  canvas.height = displayH;
  canvas.style.width = displayW + 'px';
  canvas.style.height = displayH + 'px';

  document.getElementById('status-bar').style.width = displayW + 'px';
  document.getElementById('controls').style.width = displayW + 'px';
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
