export async function init(canvasEl) {
    const gl = canvasEl.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 not supported');

    // Handle resizing
    const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        canvasEl.width = canvasEl.clientWidth * dpr;
        canvasEl.height = canvasEl.clientHeight * dpr;
        gl.viewport(0, 0, canvasEl.width, canvasEl.height);
    };
    window.addEventListener('resize', resize);
    resize();

    // Shader sources
    const vsSource = `#version 300 es
        in vec4 a_position;
        uniform mat4 u_proj;
        void main() {
            gl_Position = u_proj * a_position;
        }`;

    const fsSource = `#version 300 es
        precision mediump float;
        out vec4 fragColor;
        uniform vec4 u_color;
        void main() {
            fragColor = u_color;
        }`;

    function compileShader(src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    const vs = compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = compileShader(fsSource, gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
    }

    // Orthographic projection matrix helper (column-major)
    function createOrtho(left, right, bottom, top, near, far) {
        const rl = right - left;
        const tb = top - bottom;
        const fn = far - near;
        return new Float32Array([
            2 / rl, 0, 0, -(right + left) / rl,
            0, 2 / tb, 0, -(top + bottom) / tb,
            0, 0, -2 / fn, -(far + near) / fn,
            0, 0, 0, 1
        ]);
    }

    // Set up classic 2:1 dimetric isometric camera space.
    // We use a symmetric orthographic projection that preserves aspect ratio.
    // The "isometric" behavior comes from world-space transforms applied later;
    // here we just ensure the viewport maps cleanly to screen coordinates.
    const aspect = canvasEl.width / canvasEl.height;
    const viewSize = 10;
    let left, right, bottom, top;
    if (aspect >= 1) {
        right = viewSize * aspect;
        left = -right;
        top = viewSize;
        bottom = -top;
    } else {
        top = viewSize / aspect;
        bottom = -top;
        right = viewSize;
        left = -right;
    }

    const projMatrix = createOrtho(left, right, bottom, top, -100, 100);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(prog, 'u_proj'), false, projMatrix);

    // Clear screen to a dark color
    gl.clearColor(0.08, 0.08, 0.12, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    return { gl, prog };
}
