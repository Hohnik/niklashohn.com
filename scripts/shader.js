const config = {
  noiseScale: 3.0, // Adjusted for visible pattern
  contourLevels: 5,
  baseColor: [0.733, 0.647, 0.922], // RGB values for #8872b8
  animationSpeed: 0.00005, // Adjusted for smoother animation
};

let gl;
let program;
let timeLocation;
let resolutionLocation;
let baseColorLocation;
let noiseScaleLocation;
let contourLevelsLocation;
let startTime;
let animationFrameId; // To manage animation frames

async function loadShader() {
  try {
    const response = await fetch("scripts/shader.glsl");
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error("Error loading shader:", error);
    return null;
  }
}

async function initShader() {
  const canvas = document.getElementById("glCanvas");
  gl = canvas.getContext("webgl");

  if (!gl) {
    alert("WebGL not supported");
    return;
  }

  const fragmentShaderSource = await loadShader();
  if (!fragmentShaderSource) {
    return; // Exit if shader failed to load
  }

  const vertexShader = createShader(gl.VERTEX_SHADER, `
    attribute vec2 position;
    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
    }
  `);

  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

  if (!vertexShader || !fragmentShader) {
    return; // Exit if shader creation failed
  }

  program = createProgram(vertexShader, fragmentShader);
  if (!program) {
    return; // Exit if program creation failed
  }

  setupBuffers();
  setupUniforms();

  startTime = performance.now(); // Use high-resolution timer
  resize();
  animate();
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(
      `Shader compilation error (${type === gl.VERTEX_SHADER ? "VERTEX" : "FRAGMENT"}):`,
      gl.getShaderInfoLog(shader)
    );
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program linking error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

function setupBuffers() {
  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  const positionLocation = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
}

function setupUniforms() {
  timeLocation = gl.getUniformLocation(program, "u_time");
  resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  baseColorLocation = gl.getUniformLocation(program, "u_baseColor");
  noiseScaleLocation = gl.getUniformLocation(program, "u_noiseScale");
  contourLevelsLocation = gl.getUniformLocation(program, "u_contourLevels");
}

function resize() {
  const canvas = gl.canvas;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function animate() {
  gl.useProgram(program);

  const time = (performance.now() - startTime) * config.animationSpeed;
  gl.uniform1f(timeLocation, time);
  gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
  gl.uniform3fv(baseColorLocation, config.baseColor);
  gl.uniform1f(noiseScaleLocation, config.noiseScale);
  gl.uniform1i(contourLevelsLocation, config.contourLevels);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  animationFrameId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

window.addEventListener("load", initShader);
window.addEventListener("resize", resize);
window.addEventListener("beforeunload", stopAnimation); // Stop animation on page unload
