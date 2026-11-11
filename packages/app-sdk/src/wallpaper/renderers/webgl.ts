/**
 * The webgl backend: one fragment shader drawing the scene on a canvas at a
 * quarter of the output's resolution per axis (320x200 for 1280x800),
 * scaled up by CSS. The field has no detail finer than about 100 px, so the
 * bilinear upscale loses nothing visible and the shader does 1/16 of the
 * work. The shader is scene.ts's `warp` and `sampleField`, line for line,
 * plus OKLab to sRGB.
 *
 * Measured on the device (llvmpipe, 4 GB VM, 2026-11-09): WebGL 1 and 2 are
 * both available to the shell document, and this field costs about 1 ms a
 * frame at 320x200. What a frame really costs is the compositing after it:
 * at 10 fps, Evo plus the shell's vela use 5.4-5.6% of a core on an idle
 * desktop against 0.7-0.8% still (+4.8%, inside the 8% budget), 9.6% against
 * 2.5% with a floating app over it (+7.1%), and the same as still under a
 * maximized app (paused). An app's open keeps ~99% of its fps.
 */
import { MASS_COUNT } from '../palettes';
import type { WallpaperRenderer } from './types';

/** Canvas pixels per CSS pixel. */
export const WEBGL_SCALE = 0.25;

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uAspect;
uniform vec3 uMass[${MASS_COUNT}];  // x * aspect, y, sigma
uniform vec3 uColor[${MASS_COUNT}]; // OKLab
uniform float uPhase;
uniform float uAmount;

vec2 warp(vec2 p) {
  float wx1 = sin(p.y * 4.3 + uPhase) + sin(p.x * 2.9 - uPhase * 0.7);
  float wy1 = cos(p.x * 3.7 - uPhase * 1.3) + sin(p.y * 3.1 + uPhase);
  vec2 q = p + uAmount * 0.5 * vec2(wx1, wy1);
  float wx2 = sin(q.y * 8.9 - uPhase * 0.9 + 1.7);
  float wy2 = cos(q.x * 7.9 + uPhase * 1.1 + 0.3);
  return q + uAmount * 0.35 * vec2(wx2, wy2);
}

vec3 oklabToLinear(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
   -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(0.0031308, c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = vec2(uv.x * uAspect, 1.0 - uv.y);
  vec2 q = warp(p);
  vec3 acc = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < ${MASS_COUNT}; i++) {
    vec2 d = q - uMass[i].xy;
    float s = uMass[i].z;
    float w = exp(-dot(d, d) / (2.0 * s * s)) + 1e-4;
    acc += w * uColor[i];
    total += w;
  }
  gl_FragColor = vec4(toSrgb(oklabToLinear(acc / total)), 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader: ${log}`);
  }
  return sh;
}

export interface WebglRendererOptions {
  /** Canvas pixels per CSS pixel; default WEBGL_SCALE. */
  scale?: number;
  /** The context was lost: the caller should fall back. */
  onLost?: () => void;
}

/**
 * A webgl renderer in `container`, or null when WebGL is unavailable or the
 * program won't build (the caller then uses the css backend).
 */
export function createWebglRenderer(
  container: HTMLElement,
  opts: WebglRendererOptions = {}
): WallpaperRenderer | null {
  const scale = opts.scale ?? WEBGL_SCALE;
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
  } satisfies Partial<CSSStyleDeclaration>);

  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;

  let program: WebGLProgram;
  try {
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const p = gl.createProgram();
    if (!p) throw new Error('createProgram failed');
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
    program = p;
  } catch (err) {
    console.warn('[wallpaper] webgl program failed, using css', err);
    return null;
  }

  gl.useProgram(program);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = {
    res: gl.getUniformLocation(program, 'uRes'),
    aspect: gl.getUniformLocation(program, 'uAspect'),
    mass: gl.getUniformLocation(program, 'uMass'),
    color: gl.getUniformLocation(program, 'uColor'),
    phase: gl.getUniformLocation(program, 'uPhase'),
    amount: gl.getUniformLocation(program, 'uAmount'),
  };

  let lost = false;
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    opts.onLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  container.appendChild(canvas);

  let cssW = 1;
  let cssH = 1;
  const massBuf = new Float32Array(MASS_COUNT * 3);
  const colorBuf = new Float32Array(MASS_COUNT * 3);

  const renderer: WallpaperRenderer = {
    backend: 'webgl',
    resize(width, height) {
      cssW = Math.max(1, width);
      cssH = Math.max(1, height);
      canvas.width = Math.max(1, Math.round(cssW * scale));
      canvas.height = Math.max(1, Math.round(cssH * scale));
    },
    draw(sc) {
      if (lost || !gl) return;
      const aspect = cssW / cssH;
      const long = Math.max(aspect, 1);
      sc.masses.forEach((m, i) => {
        massBuf[i * 3] = m.x * aspect;
        massBuf[i * 3 + 1] = m.y;
        massBuf[i * 3 + 2] = m.radius * long;
        colorBuf[i * 3] = m.color[0];
        colorBuf[i * 3 + 1] = m.color[1];
        colorBuf[i * 3 + 2] = m.color[2];
      });
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.res, canvas.width, canvas.height);
      gl.uniform1f(u.aspect, aspect);
      gl.uniform3fv(u.mass, massBuf);
      gl.uniform3fv(u.color, colorBuf);
      gl.uniform1f(u.phase, sc.warpPhase);
      gl.uniform1f(u.amount, sc.warpAmount);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      gl = null;
    },
  };
  renderer.resize(container.clientWidth, container.clientHeight);
  return renderer;
}
