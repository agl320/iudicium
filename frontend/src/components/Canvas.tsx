import { useEffect, useRef } from "react";
import {
  fragmentShaderSource,
  vertexShaderSource,
} from "../materials/TestShader";

// ============================================================
// SHADER HELPERS
// ============================================================

// Compile GLSL source into a WebGL shader
function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Failed to create shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  // Check for GLSL compilation errors
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed:\n${error}`);
  }

  return shader;
}

// ============================================================
// CREATE SHADER PROGRAM
// ============================================================

// Compile vertex + fragment shaders and link them together
function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);

  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

  const program = gl.createProgram();

  if (!program) {
    throw new Error("Failed to create WebGL program");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  // Link the two shaders into one program
  gl.linkProgram(program);

  // Check for linking errors
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    throw new Error(`Program linking failed:\n${error}`);
  }

  // We no longer need the individual shader objects
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  return program;
}

// ============================================================
// CREATE VERTEX BUFFER
// ============================================================

function createVertexBuffer(gl: WebGL2RenderingContext) {
  // Define our triangle's vertices.
  //
  // Each vertex contains:
  //     x, y
  //
  // Vertex 0 = (0, 0)
  // Vertex 1 = (0, 1)
  // Vertex 2 = (1, 0)
  //
  // These are NDC coordinates because our vertex
  // shader passes them directly to gl_Position.

  const vertices = new Float32Array([0, 0, 0, 1, 1, 0]);

  // Create a buffer object on the GPU
  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error("Failed to create vertex buffer");
  }

  // Tell WebGL that we're working with an ARRAY_BUFFER
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // Upload our vertex data:
  //
  // JavaScript Float32Array
  //        ↓
  //    GPU buffer
  //
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

  return buffer;
}

// ============================================================
// CONNECT VERTEX BUFFER → VERTEX SHADER
// ============================================================

function setupPositionAttribute(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  buffer: WebGLBuffer,
) {
  // Find where the vertex shader's
  //
  //     in vec2 a_position;
  //
  // exists inside the compiled shader program.

  const positionLocation = gl.getAttribLocation(program, "a_position");

  if (positionLocation === -1) {
    throw new Error("a_position not found in shader");
  }

  // Make our vertex buffer the active ARRAY_BUFFER
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // Tell WebGL how to interpret the buffer.
  //
  // Our buffer looks like:
  //
  //     [ x, y, x, y, x, y ]
  //
  // Each vertex contains 2 FLOAT values.
  //
  // Therefore:
  //
  //     vertex 0 → (0, 0)
  //     vertex 1 → (0, 1)
  //     vertex 2 → (1, 0)

  gl.vertexAttribPointer(
    positionLocation,
    2, // 2 values per vertex: x, y
    gl.FLOAT, // each value is a 32-bit float
    false, // don't normalize
    0, // values are tightly packed
    0, // start at beginning of buffer
  );

  // Enable the attribute so the vertex shader can receive it
  gl.enableVertexAttribArray(positionLocation);
}

// ============================================================
// REACT COMPONENT
// ============================================================

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    // ========================================================
    // 1. GET WEBGL2 CONTEXT
    // ========================================================

    const gl = canvas.getContext("webgl2");

    if (!gl) {
      console.error("WebGL2 not supported");
      return;
    }

    // ========================================================
    // 2. CREATE SHADER PROGRAM
    // ========================================================
    //
    // Vertex shader:
    //
    //     vertices → positions
    //
    // Fragment shader:
    //
    //     fragments → colors
    //
    // Both become one WebGL program.

    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);

    gl.useProgram(program);

    // ========================================================
    // 3. CREATE + UPLOAD VERTEX DATA
    // ========================================================

    const buffer = createVertexBuffer(gl);

    // ========================================================
    // 4. CONNECT BUFFER → a_position
    // ========================================================
    //
    // This tells WebGL:
    //
    //     GPU buffer
    //          ↓
    //     a_position
    //          ↓
    //     vertex shader

    setupPositionAttribute(gl, program, buffer);

    // ========================================================
    // 5. DRAW
    // ========================================================
    //
    // NOW we tell WebGL to actually execute the pipeline.
    //
    // 3 vertices + TRIANGLES = 1 triangle.

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ========================================================
    // CLEANUP
    // ========================================================

    return () => {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div className="w-50 h-50 border border-black">
      <canvas ref={canvasRef} />
    </div>
  );
}
