import { useEffect, useRef } from "react";

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2");
    if (!gl) {
      console.error("WebGL2 not supported");
      return;
    }

    // Vertex data/buffer ==============

    const vertices = new Float32Array([
      0,
      0, // top left
      0,
      1, // top right
      1,
      0, // bottom left
    ]);

    const buffer = gl.createBuffer();

    // Create buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    // Upload data to buffer
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Vertex shader ==============

    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <div className="w-50 h-50 border border-black">
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
