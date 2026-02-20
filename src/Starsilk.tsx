import React, { useRef, useEffect } from 'react';

// --- Vector Utilities ---
interface Vec2 {
  x: number;
  y: number;
}

const normalize = (v: Vec2): Vec2 => {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

const getNormal = (v: Vec2): Vec2 => {
  return { x: -v.y, y: v.x };
};

// Catmull-Rom spline interpolation
const catmullRom = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 => {
  const t2 = t * t;
  const t3 = t2 * t;

  const f0 = -0.5 * t3 + t2 - 0.5 * t;
  const f1 = 1.5 * t3 - 2.5 * t2 + 1.0;
  const f2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
  const f3 = 0.5 * t3 - 0.5 * t2;

  return {
    x: p0.x * f0 + p1.x * f1 + p2.x * f2 + p3.x * f3,
    y: p0.y * f0 + p1.y * f1 + p2.y * f2 + p3.y * f3,
  };
};


// --- Physics Node ---
class SilkNode {
  x: number;
  y: number;
  ox: number; // original X
  oy: number; // original Y
  vx: number = 0;
  vy: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.ox = x;
    this.oy = y;
  }

  update(time: number, index: number, mouseX: number, mouseY: number) {
    // Base floating undulation - make it drift significantly to feel like a spirit or ethereal silk
    const driftX = Math.sin(time * 0.0005 + index * 0.1) * 80 + Math.cos(time * 0.0002 - index * 0.05) * 40;
    const driftY = Math.cos(time * 0.0007 + index * 0.15) * 120 + Math.sin(time * 0.0003 + index * 0.08) * 60;

    const targetX = this.ox + driftX;
    const targetY = this.oy + driftY;

    // Spring towards target
    this.vx += (targetX - this.x) * 0.02; // Softer spring for floatier movement
    this.vy += (targetY - this.y) * 0.02;

    // Mouse repulsion
    const dx = this.x - mouseX;
    const dy = this.y - mouseY;
    const dist = Math.hypot(dx, dy);
    const minDist = 200; // Larger interaction radius

    if (dist < minDist && dist > 0) {
      const force = Math.pow((minDist - dist) / minDist, 2); // Smoother, stronger repulsion dropoff
      this.vx += (dx / dist) * force * 1.5;
      this.vy += (dy / dist) * force * 1.5;
    }

    // Apply velocity and dampening
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.90; // Less damping for more sliding momentum (floaty)
    this.vy *= 0.90;
  }
}

const Starsilk: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let time = 0;

    let mouseX = -1000;
    let mouseY = -1000;

    const numNodes = 40;
    let nodes: SilkNode[] = [];

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    const initNodes = () => {
      nodes = [];
      for (let i = 0; i < numNodes; i++) {
        // Create an organic drifting path spanning the screen
        const t = i / (numNodes - 1);
        // Start slightly off-screen and end slightly off-screen
        const startX = width * -0.1;
        const endX = width * 1.1;

        const x = startX + t * (endX - startX);
        const y = height / 2 + Math.sin(t * Math.PI * 3) * (height * 0.35); // Pronounced waves

        nodes.push(new SilkNode(x, y));
      }
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      // Support High DPI (Retina) displays
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      initNodes();
    };

    window.addEventListener('resize', resize);
    resize();

    const render = () => {
      time += 16; // approx 60fps delta

      // 9. Motion Blur & Emissive Trails
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; // Adjust for trail length
      ctx.fillRect(0, 0, width, height);

      // Additive Blending for glow
      ctx.globalCompositeOperation = 'lighter';

      // Update nodes
      nodes.forEach((node, i) => node.update(time, i, mouseX, mouseY));

      // 1. Transverse "Barcode" Striations & Spline Generation
      const points: Vec2[] = [];
      const segmentsPerNode = 10;

      for (let i = 0; i < nodes.length - 1; i++) {
        const p0 = nodes[Math.max(0, i - 1)];
        const p1 = nodes[i];
        const p2 = nodes[i + 1];
        const p3 = nodes[Math.min(nodes.length - 1, i + 2)];

        for (let j = 0; j < segmentsPerNode; j++) {
          const t = j / segmentsPerNode;
          points.push(catmullRom(p0, p1, p2, p3, t));
        }
      }
      points.push(nodes[nodes.length - 1]);

      // Render the striations
      for (let i = 0; i < points.length; i++) {
        const p = points[i];

        // Calculate tangent by looking ahead, or behind if at the end
        const nextP = points[i + 1 < points.length ? i + 1 : i];
        const prevP = points[i > 0 ? i - 1 : i];

        const tangent = normalize({
          x: nextP.x - prevP.x,
          y: nextP.y - prevP.y
        });
        const normal = getNormal(tangent);

        // Spline parametric progress (0 to 1)
        const progress = i / points.length;

        // Base continuous streamer width
        let finalWidth = 45;

        // Subtle twist to give it a hint of depth, but mostly flat to preserve the barcode texture
        const twist = Math.sin(progress * Math.PI * 6 - time * 0.001);
        finalWidth = 45 * (0.85 + 0.15 * Math.abs(twist));

        const pLeft = {
          x: p.x + normal.x * finalWidth,
          y: p.y + normal.y * finalWidth
        };
        const pRight = {
          x: p.x - normal.x * finalWidth,
          y: p.y - normal.y * finalWidth
        };

        // 1. Draw continuous deep blue ribbon background (prevents gaps)
        ctx.beginPath();
        ctx.moveTo(pLeft.x, pLeft.y);
        ctx.lineTo(pRight.x, pRight.y);
        ctx.strokeStyle = `rgba(10, 30, 180, 0.25)`; // Constant, deep underlying blue
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // 2. Barcode clusters logic
        // We generate "bands" that cluster the bright striations together using stepped noise
        const sliceNoise = Math.sin(progress * 1500) + Math.cos(progress * 2800 + time * 0.003);

        // Inside a bright cluster/band
        if (sliceNoise > 0.0) {
          // Randomly pick pure bright white, bright cyan, or medium cyan for each line in the cluster
          const lineIntensity = Math.random();

          // Keep the bright interior slightly narrower than the blue edge
          const coreWidth = finalWidth * 0.92;
          const coreLeft = { x: p.x + normal.x * coreWidth, y: p.y + normal.y * coreWidth };
          const coreRight = { x: p.x - normal.x * coreWidth, y: p.y - normal.y * coreWidth };

          if (lineIntensity > 0.8) {
            // Searing bright white/cyan core line
            ctx.beginPath();
            ctx.moveTo(coreLeft.x, coreLeft.y);
            ctx.lineTo(coreRight.x, coreRight.y);
            ctx.strokeStyle = `rgba(220, 245, 255, 0.9)`;
            ctx.lineWidth = 1;
            ctx.stroke();
          } else if (lineIntensity > 0.3) {
            // Standard bright cyan barcode line
            ctx.beginPath();
            ctx.moveTo(coreLeft.x, coreLeft.y);
            ctx.lineTo(coreRight.x, coreRight.y);
            ctx.strokeStyle = `rgba(0, 180, 255, 0.5)`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />;
};

export default Starsilk;
