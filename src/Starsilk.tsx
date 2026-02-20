import React, { useRef, useEffect, useState, useCallback } from 'react';

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

// --- Types & Interfaces ---
type LayoutMode = 'default' | 'tree' | 'convergence' | 'dna' | 'river';
type EffectMode = 'default' | 'vortex' | 'surges' | 'gravity' | 'particles';

interface Config {
  numStreams: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  layoutMode: LayoutMode;
  effectMode: EffectMode;
  audioReactive: boolean;
  enableStars: boolean;
  starDensity: number;
  starLuminosity: number;
  starFlickerSpeed: number;
  enableSun: boolean;
  silkLuminosity: number;
  silkSpeed: number;
  variableSpeed: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

class SilkNode {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number = 0;
  vy: number = 0;
  phaseOffsetX: number;
  phaseOffsetY: number;
  streamIndex: number;

  constructor(x: number, y: number, phaseOffsetX: number, phaseOffsetY: number, streamIndex: number) {
    this.x = x;
    this.y = y;
    this.ox = x;
    this.oy = y;
    this.phaseOffsetX = phaseOffsetX;
    this.phaseOffsetY = phaseOffsetY;
    this.streamIndex = streamIndex;
  }

  update(time: number, index: number, mouseX: number, mouseY: number, config: Config, audioSim: number) {
    let driftX = 0;
    let driftY = 0;

    const audioBump = config.audioReactive ? audioSim * 20 : 0;

    if (config.layoutMode === 'dna') {
      // DNA Spiral - rigorous sine wave wrapping
      const dnaPhase = (index * 0.2) - (time * 0.002);
      const isStrandA = this.streamIndex % 2 === 0;
      const amplitude = 60 + audioBump;
      driftX = Math.cos(dnaPhase + (isStrandA ? 0 : Math.PI)) * amplitude;
      driftY = Math.sin(dnaPhase + (isStrandA ? 0 : Math.PI)) * amplitude;
    } else if (config.layoutMode === 'river') {
      // River Styx - Very flat, slow undulating drift
      driftX = Math.sin(time * 0.0002 + index * 0.05 + this.phaseOffsetX) * 20;
      driftY = Math.cos(time * 0.0003 + index * 0.05 + this.phaseOffsetY) * 30 + audioBump;
    } else {
      // Default / Tree / Convergence floaty drift
      driftX = Math.sin(time * 0.0005 + index * 0.1 + this.phaseOffsetX) * (80 + audioBump) + Math.cos(time * 0.0002 - index * 0.05 + this.phaseOffsetY) * 40;
      driftY = Math.cos(time * 0.0007 + index * 0.15 + this.phaseOffsetY) * (120 + audioBump) + Math.sin(time * 0.0003 + index * 0.08 + this.phaseOffsetX) * 60;
    }

    let targetX = this.ox + driftX;
    let targetY = this.oy + driftY;

    // Gravity Wells effect
    if (config.effectMode === 'gravity') {
      // Create two invisible gravity wells
      const wells = [
        { x: window.innerWidth * 0.3, y: window.innerHeight * 0.7, mass: 60000 },
        { x: window.innerWidth * 0.7, y: window.innerHeight * 0.3, mass: 60000 }
      ];

      wells.forEach(well => {
        const dx = well.x - this.x;
        const dy = well.y - this.y;
        const distSq = dx * dx + dy * dy;
        if (distSq > 1000) {
          const force = well.mass / distSq;
          targetX += (dx / Math.sqrt(distSq)) * force;
          targetY += (dy / Math.sqrt(distSq)) * force;
        }
      });
    }

    // Spring towards target
    this.vx += (targetX - this.x) * (config.layoutMode === 'river' ? 0.005 : 0.02);
    this.vy += (targetY - this.y) * (config.layoutMode === 'river' ? 0.005 : 0.02);

    // Mouse interaction
    const dx = this.x - mouseX;
    const dy = this.y - mouseY;
    const dist = Math.hypot(dx, dy);

    if (config.effectMode === 'vortex') {
      // Vortex pulls towards mouse
      if (dist < 400 && dist > 10) {
        const force = 1000 / dist;
        this.vx -= (dx / dist) * force * 0.05;
        this.vy -= (dy / dist) * force * 0.05;

        // Add swirl
        this.vx += (dy / dist) * force * 0.05;
        this.vy -= (dx / dist) * force * 0.05;
      }
    } else {
      // Standard repulsion
      const minDist = 200;
      if (dist < minDist && dist > 0) {
        const force = Math.pow((minDist - dist) / minDist, 2);
        this.vx += (dx / dist) * force * 1.5;
        this.vy += (dy / dist) * force * 1.5;
      }
    }

    // Apply velocity and dampening
    this.x += this.vx;
    this.y += this.vy;
    this.vx *= 0.90;
    this.vy *= 0.90;
  }
}

interface SilkStream {
  nodes: SilkNode[];
  colorPhase: number;
  surgeTime: number;
  speedMultiplier: number;
  localTime: number;
}

interface Star {
  x: number;
  y: number;
  z: number; // depth layer (1 to 3)
  phase: number;
}

const Starsilk: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Configuration State ---
  const [numStreams, setNumStreams] = useState(3);
  const [startX, setStartX] = useState(-10);
  const [startY, setStartY] = useState(50);
  const [endX, setEndX] = useState(110);
  const [endY, setEndY] = useState(50);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>('default');
  const [effectMode, setEffectMode] = useState<EffectMode>('default');
  const [audioReactive, setAudioReactive] = useState(false);

  const [enableStars, setEnableStars] = useState(true);
  const [starDensity, setStarDensity] = useState(50);
  const [starLuminosity, setStarLuminosity] = useState(50);
  const [starFlickerSpeed, setStarFlickerSpeed] = useState(50);
  const [enableSun, setEnableSun] = useState(true);
  const [silkLuminosity, setSilkLuminosity] = useState(100);
  const [silkSpeed, setSilkSpeed] = useState(50);
  const [variableSpeed, setVariableSpeed] = useState(false);

  const [menuVisible, setMenuVisible] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const configRef = useRef<any>(null);
  configRef.current = { numStreams, startX, startY, endX, endY, layoutMode, effectMode, audioReactive, enableStars, starDensity, starLuminosity, starFlickerSpeed, enableSun, silkLuminosity, silkSpeed, variableSpeed };

  const initNodesRef = useRef<() => void>();
  const initStarsRef = useRef<() => void>();

  // Add debouncing to avoid excessive reinits
  useEffect(() => {
    if (initNodesRef.current) initNodesRef.current();
  }, [numStreams, startX, startY, endX, endY, layoutMode]);

  useEffect(() => {
    if (initStarsRef.current) initStarsRef.current();
  }, [starDensity]);

  const handleMouseMove = useCallback(() => {
    setMenuVisible(true);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => {
      setMenuVisible(false);
    }, 3000);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;
    let time = 0;
    let audioSimOffset = 0;

    let mouseX = -1000;
    let mouseY = -1000;

    const numNodesPerStream = 40;
    let streams: SilkStream[] = [];
    let stars: Star[] = [];
    let particles: Particle[] = [];

    const handleCanvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      mouseX = (e.clientX - rect.left);
      mouseY = (e.clientY - rect.top);
    };

    const handleMouseLeave = () => {
      mouseX = -1000;
      mouseY = -1000;
    };

    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    const initStars = () => {
      stars = [];
      const density = configRef.current.starDensity;
      const count = Math.floor((width * height) / (20000 / (density + 1)));
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z: Math.random() > 0.8 ? 3 : (Math.random() > 0.5 ? 2 : 1),
          phase: Math.random() * Math.PI * 2
        });
      }
    };
    initStarsRef.current = initStars;

    const initNodes = () => {
      streams = [];
      const cfg = configRef.current;
      const sx = (cfg.startX / 100) * width;
      const sy = (cfg.startY / 100) * height;
      let ex = (cfg.endX / 100) * width;
      let ey = (cfg.endY / 100) * height;

      if (cfg.layoutMode === 'convergence') {
        ex = width / 2;
        ey = height / 2;
      } else if (cfg.effectMode === 'vortex' && mouseX > 0) {
        // Vortex might override end if desired, but we handle it in physics
      }

      const streamCount = cfg.numStreams;

      for (let s = 0; s < streamCount; s++) {
        const nodes: SilkNode[] = [];
        const phaseOffsetX = (s / streamCount) * Math.PI * 4;
        const phaseOffsetY = (s / streamCount) * Math.PI * 2 + 1;
        const colorPhase = s * 0.3;
        const surgeTime = Math.random() * 10000;

        let localSx = sx;
        let localSy = sy;

        if (cfg.layoutMode === 'tree') {
          localSx = width / 2;
          localSy = height * 1.1; // Bottom center
          ex = (s / Math.max(1, streamCount - 1)) * width;
          ey = height * -0.1; // Top edge spread
        } else if (cfg.layoutMode === 'convergence') {
          // Origins circle around the edge
          const angle = (s / streamCount) * Math.PI * 2;
          localSx = width / 2 + Math.cos(angle) * width * 0.6;
          localSy = height / 2 + Math.sin(angle) * height * 0.6;
        }

        const dx = ex - localSx;
        const dy = ey - localSy;
        const streamTangent = normalize({ x: dx, y: dy });
        const streamNormal = getNormal(streamTangent);

        let perpOffset = (s - Math.floor(streamCount / 2)) * 30; // 30px spacing
        if (cfg.layoutMode === 'river') {
          perpOffset = (s - Math.floor(streamCount / 2)) * 10; // Tight spacing
        } else if (cfg.layoutMode === 'dna') {
          perpOffset = 0; // DNA twists around exact center
        }

        for (let i = 0; i < numNodesPerStream; i++) {
          const t = i / (numNodesPerStream - 1);
          const x = localSx + t * dx + streamNormal.x * perpOffset;
          const y = localSy + t * dy + streamNormal.y * perpOffset;

          nodes.push(new SilkNode(x, y, phaseOffsetX, phaseOffsetY, s));
        }
        streams.push({
          nodes,
          colorPhase,
          surgeTime,
          speedMultiplier: 0.5 + Math.random() * 1.5, // 0.5x to 2.0x
          localTime: Math.random() * 10000
        });
      }
    };
    initNodesRef.current = initNodes;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      initStars();
      initNodes();
    };

    window.addEventListener('resize', resize);
    resize();

    const spawnParticles = (x: number, y: number, colorStr: string) => {
      for (let i = 0; i < 3; i++) {
        particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 0,
          maxLife: 30 + Math.random() * 40,
          size: 1 + Math.random() * 2,
          color: colorStr
        });
      }
    };

    const render = () => {
      time += 16; // approx 60fps delta
      const cfg = configRef.current;

      // Draw background (no trails for background itself to prevent smearing stars badly, so we clear, draw stars, then dim overlay)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, width, height);

      // Distant Nebulas
      if (cfg.enableStars) {
        ctx.globalCompositeOperation = 'lighter';
        const nebulaGrad1 = ctx.createRadialGradient(width * 0.3, height * 0.3, 0, width * 0.3, height * 0.3, width * 0.6);
        nebulaGrad1.addColorStop(0, 'rgba(20, 10, 50, 0.4)');
        nebulaGrad1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nebulaGrad1;
        ctx.fillRect(0, 0, width, height);

        const nebulaGrad2 = ctx.createRadialGradient(width * 0.8, height * 0.7, 0, width * 0.8, height * 0.7, width * 0.5);
        nebulaGrad2.addColorStop(0, 'rgba(10, 40, 60, 0.3)');
        nebulaGrad2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = nebulaGrad2;
        ctx.fillRect(0, 0, width, height);

        // Starfield
        const lumMultiplier = cfg.starLuminosity / 50;
        const flickerSpd = cfg.starFlickerSpeed * 0.0001;

        stars.forEach(star => {
          star.phase += flickerSpd * star.z;
          const flicker = Math.sin(star.phase) * 0.5 + 0.5;
          const alpha = (0.2 + flicker * 0.8) * lumMultiplier * (star.z / 3);

          if (star.z === 3 && flicker > 0.9) {
            ctx.fillStyle = `rgba(200, 230, 255, ${alpha})`;
            ctx.fillRect(star.x - 1, star.y - 1, 3, 3);
          } else {
            ctx.fillStyle = `rgba(180, 200, 255, ${alpha})`;
            ctx.fillRect(star.x, star.y, star.z === 3 ? 2 : 1, star.z === 3 ? 2 : 1);
          }
        });
      }

      // Restore dimming for trails
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(5, 5, 8, 0.5)'; // Heavier dim to create motion blur trails over stars
      ctx.fillRect(0, 0, width, height);

      // Additive Blending for glow
      ctx.globalCompositeOperation = 'lighter';

      // Sun/Star Target Object
      if (cfg.enableSun) {
        let ex = (cfg.endX / 100) * width;
        let ey = (cfg.endY / 100) * height;
        if (cfg.layoutMode === 'convergence') { ex = width / 2; ey = height / 2; }
        else if (cfg.layoutMode === 'tree') { ex = width / 2; ey = -100; } // out of view mostly

        const sunPulse = Math.sin(time * 0.002) * 10;
        const sunRadius = 40 + sunPulse;

        const sunGrad = ctx.createRadialGradient(ex, ey, 0, ex, ey, sunRadius * 3);
        sunGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        sunGrad.addColorStop(0.1, 'rgba(150, 220, 255, 0.8)');
        sunGrad.addColorStop(0.4, 'rgba(20, 100, 255, 0.3)');
        sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = sunGrad;
        ctx.fillRect(ex - sunRadius * 3, ey - sunRadius * 3, sunRadius * 6, sunRadius * 6);
      }

      // Audio Sim
      if (cfg.audioReactive) {
        audioSimOffset = Math.sin(time * 0.01) * Math.sin(time * 0.003) * 0.5 + 0.5;
      } else {
        audioSimOffset = 0;
      }

      // Global increment based on slider
      const globalSpeedFactor = cfg.silkSpeed / 50;

      // Render Streams
      streams.forEach((stream, sIdx) => {
        const strandMultiplier = cfg.variableSpeed ? stream.speedMultiplier : 1.0;
        stream.localTime += 16 * globalSpeedFactor * strandMultiplier;
        const sTime = stream.localTime;

        stream.nodes.forEach((node, i) => node.update(sTime, i, mouseX, mouseY, cfg, audioSimOffset));

        const points: Vec2[] = [];
        const segmentsPerNode = 10;
        for (let i = 0; i < stream.nodes.length - 1; i++) {
          const p0 = stream.nodes[Math.max(0, i - 1)];
          const p1 = stream.nodes[i];
          const p2 = stream.nodes[i + 1];
          const p3 = stream.nodes[Math.min(stream.nodes.length - 1, i + 2)];

          for (let j = 0; j < segmentsPerNode; j++) {
            const t = j / segmentsPerNode;
            points.push(catmullRom(p0, p1, p2, p3, t));
          }
        }
        points.push(stream.nodes[stream.nodes.length - 1]);

        // Handle Surges
        let isSurging = false;
        if (cfg.effectMode === 'surges') {
          if (sTime > stream.surgeTime) {
            isSurging = true;
            if (sTime > stream.surgeTime + 800) {
              stream.surgeTime = sTime + 2000 + Math.random() * 8000;
            }
          }
        }

        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const nextP = points[i + 1 < points.length ? i + 1 : i];
          const prevP = points[i > 0 ? i - 1 : i];

          const tangent = normalize({ x: nextP.x - prevP.x, y: nextP.y - prevP.y });
          const normal = getNormal(tangent);

          const progress = i / points.length;

          let driftSpeed = sTime * (cfg.layoutMode === 'river' ? 0.001 : 0.005);
          if (isSurging) driftSpeed *= 3; // Surge speeds up the data flow

          let finalWidth = 45 - (streams.length * 2);
          if (cfg.layoutMode === 'river') finalWidth = 80;
          if (finalWidth < 10) finalWidth = 10;

          const twist = Math.sin(progress * Math.PI * 6 - sTime * 0.001 + stream.colorPhase);
          finalWidth = finalWidth * (0.85 + 0.15 * Math.abs(twist));

          // Optional DNA widening
          if (cfg.layoutMode === 'dna') finalWidth = 20;

          const pLeft = { x: p.x + normal.x * finalWidth, y: p.y + normal.y * finalWidth };
          const pRight = { x: p.x - normal.x * finalWidth, y: p.y - normal.y * finalWidth };

          // Opacity factoring
          let baseAlphaFactor = 1 / Math.max(1, Math.sqrt(streams.length));
          if (cfg.layoutMode === 'river') baseAlphaFactor = 0.5;

          // Allow user to manually overdrive luminosity
          baseAlphaFactor *= (cfg.silkLuminosity / 100);

          ctx.beginPath();
          ctx.moveTo(pLeft.x, pLeft.y);
          ctx.lineTo(pRight.x, pRight.y);
          ctx.strokeStyle = `rgba(10, 30, 180, ${(isSurging ? 0.6 : 0.25) * baseAlphaFactor})`;
          ctx.lineWidth = cfg.layoutMode === 'river' ? 6 : 3.5;
          ctx.stroke();

          const streamOffset = stream.colorPhase * 100;
          const barcodeNoise = Math.sin(progress * 1200 - driftSpeed * 2 + streamOffset) + Math.sin(progress * 2500 - driftSpeed * 4 + streamOffset) * 0.5;

          if (barcodeNoise < -0.6 && !isSurging) continue;

          const sliceNoise = Math.sin(progress * 1500 - driftSpeed * 3 + streamOffset * 2) + Math.cos(progress * 2800 - driftSpeed * 5);

          if (sliceNoise > 0.0 || isSurging) {
            const coreWidth = finalWidth * 0.92;
            const coreLeft = { x: p.x + normal.x * coreWidth, y: p.y + normal.y * coreWidth };
            const coreRight = { x: p.x - normal.x * coreWidth, y: p.y - normal.y * coreWidth };

            const lineIntensity = isSurging ? 1.0 : Math.random();

            if (lineIntensity > 0.8) {
              ctx.beginPath();
              ctx.moveTo(coreLeft.x, coreLeft.y);
              ctx.lineTo(coreRight.x, coreRight.y);
              ctx.strokeStyle = `rgba(220, 245, 255, ${0.9 * baseAlphaFactor})`;
              ctx.lineWidth = 1;
              ctx.stroke();

              // Disintegration particles at the terminus
              if (cfg.effectMode === 'particles' && progress > 0.98 && Math.random() > 0.6) {
                spawnParticles(p.x, p.y, 'rgba(200, 240, 255, 0.8)');
              }
            } else if (lineIntensity > 0.3) {
              ctx.beginPath();
              ctx.moveTo(coreLeft.x, coreLeft.y);
              ctx.lineTo(coreRight.x, coreRight.y);
              ctx.strokeStyle = `rgba(0, 180, 255, ${0.5 * baseAlphaFactor})`;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
        }
      });

      // Render Particles
      if (cfg.effectMode === 'particles') {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life++;
          const alpha = 1 - (p.life / p.maxLife);
          if (alpha <= 0) {
            particles.splice(i, 1);
            continue;
          }
          ctx.fillStyle = p.color;
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1.0;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleCanvasMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, []); // Empty dep array because we use refs for all dynamic values to prevent re-binding the massive loop

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseMove={handleMouseMove}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%', cursor: menuVisible ? 'default' : 'none' }} />

      {/* Settings Menu Overlay */}
      <div
        className="settings-panel"
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(15, 15, 20, 0.85)',
          border: '1px solid rgba(0, 150, 255, 0.3)',
          borderRadius: '8px',
          padding: '20px',
          color: '#e0e0e0',
          fontFamily: 'monospace',
          backdropFilter: 'blur(10px)',
          transition: 'opacity 0.5s ease',
          opacity: menuVisible ? 1 : 0,
          pointerEvents: menuVisible ? 'auto' : 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '15px',
          width: '320px',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onMouseMove={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, color: '#00c8ff', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '1px' }}>StarSilk System Controls</h3>

        {/* Layout & Effects */}
        <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <label style={{ fontSize: '0.85rem', color: '#888' }}>Layout Mode</label>
          <select value={layoutMode} onChange={e => setLayoutMode(e.target.value as LayoutMode)} style={{ width: '100%', padding: '5px', marginTop: '5px', backgroundColor: '#222', color: '#fff', border: '1px solid #444' }}>
            <option value="default">Default Drift</option>
            <option value="tree">Tree of Souls</option>
            <option value="convergence">Orbital Convergence</option>
            <option value="dna">Spiral DNA Helix</option>
            <option value="river">The River Styx</option>
          </select>

          <label style={{ fontSize: '0.85rem', color: '#888', display: 'block', marginTop: '10px' }}>Interaction Effect</label>
          <select value={effectMode} onChange={e => setEffectMode(e.target.value as EffectMode)} style={{ width: '100%', padding: '5px', marginTop: '5px', backgroundColor: '#222', color: '#fff', border: '1px solid #444' }}>
            <option value="default">Standard Repulsion</option>
            <option value="vortex">Interactive Vortex</option>
            <option value="surges">Data-Packet Surges</option>
            <option value="gravity">Gravity Wells</option>
            <option value="particles">Terminus Particles</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={audioReactive} onChange={e => setAudioReactive(e.target.checked)} />
            Simulated Audio Reactivity pulse
          </label>
        </div>

        {/* Environment Settings */}
        <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#00c8ff' }}>Cosmos Background</h4>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={enableStars} onChange={e => setEnableStars(e.target.checked)} />
            Enable Deep Starfield & Nebulas
          </label>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', opacity: enableStars ? 1 : 0.5 }}>
            <label style={{ fontSize: '0.85rem' }}>Star Density: {starDensity}</label>
            <input type="range" disabled={!enableStars} min="10" max="100" value={starDensity} onChange={e => setStarDensity(parseInt(e.target.value))} />

            <label style={{ fontSize: '0.85rem', marginTop: '5px' }}>Luminosity: {starLuminosity}</label>
            <input type="range" disabled={!enableStars} min="10" max="100" value={starLuminosity} onChange={e => setStarLuminosity(parseInt(e.target.value))} />

            <label style={{ fontSize: '0.85rem', marginTop: '5px' }}>Flicker Speed: {starFlickerSpeed}</label>
            <input type="range" disabled={!enableStars} min="0" max="100" value={starFlickerSpeed} onChange={e => setStarFlickerSpeed(parseInt(e.target.value))} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={enableSun} onChange={e => setEnableSun(e.target.checked)} />
            Enable Terminus Sun/Star
          </label>
        </div>

        {/* Existing Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '0.85rem' }}>Stream Threads: {numStreams}</label>
          <input type="range" min="1" max="15" value={numStreams} onChange={e => setNumStreams(parseInt(e.target.value))} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '0.85rem' }}>Silk Luminosity: {silkLuminosity}</label>
          <input type="range" min="10" max="300" value={silkLuminosity} onChange={e => setSilkLuminosity(parseInt(e.target.value))} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <label style={{ fontSize: '0.85rem' }}>Global Flow Speed: {silkSpeed}</label>
          <input type="range" min="0" max="250" value={silkSpeed} onChange={e => setSilkSpeed(parseInt(e.target.value))} />

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={variableSpeed} onChange={e => setVariableSpeed(e.target.checked)} />
            Variable Per-Strand Variance
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
            <label style={{ fontSize: '0.85rem' }}>Start X: {startX}</label>
            <input type="range" min="-50" max="150" value={startX} onChange={e => setStartX(parseInt(e.target.value))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
            <label style={{ fontSize: '0.85rem' }}>Start Y: {startY}</label>
            <input type="range" min="-50" max="150" value={startY} onChange={e => setStartY(parseInt(e.target.value))} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
            <label style={{ fontSize: '0.85rem' }}>End X: {endX}</label>
            <input type="range" min="-50" max="150" value={endX} onChange={e => setEndX(parseInt(e.target.value))} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
            <label style={{ fontSize: '0.85rem' }}>End Y: {endY}</label>
            <input type="range" min="-50" max="150" value={endY} onChange={e => setEndY(parseInt(e.target.value))} />
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          style={{
            marginTop: '10px', backgroundColor: 'rgba(0, 150, 255, 0.2)', border: '1px solid rgba(0, 150, 255, 0.5)',
            color: '#fff', padding: '8px 12px', cursor: 'pointer', borderRadius: '4px', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px'
          }}
        >
          Toggle Fullscreen
        </button>
      </div>
    </div>
  );
};

export default Starsilk;
