import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  MathUtils,
  PointsMaterial,
  Vector3,
} from "three";

type FireworksProps = {
  isActive: boolean;
  origin?: [number, number, number];
};

/* ─── tuning knobs ─── */
const MAX_SHELLS = 12;            // concurrent firework shells
const PARTICLES_PER_SHELL = 80;   // explosion sparkles per shell
const TRAIL_PARTICLES_PER_SHELL = 12; // rising trail dots per shell
const TOTAL_BURST = MAX_SHELLS * PARTICLES_PER_SHELL;
const TOTAL_TRAIL = MAX_SHELLS * TRAIL_PARTICLES_PER_SHELL;
const TOTAL_PARTICLES = TOTAL_BURST + TOTAL_TRAIL;
const GRAVITY = -3.8;
const DRAG = 0.97;                // velocity damping per frame for burst particles
const LAUNCH_INTERVAL = 0.35;     // seconds between shell launches
const SHELL_RISE_SPEED_MIN = 6;
const SHELL_RISE_SPEED_MAX = 10;
const BURST_SPEED_MIN = 2;
const BURST_SPEED_MAX = 5;
const BURST_LIFETIME_MIN = 1.0;
const BURST_LIFETIME_MAX = 2.2;

const SPARKLE_SIZE = 0.06;        // small dots like distant fireworks
const TRAIL_SIZE = 0.03;
const SPREAD_X = 4;               // depth variation (camera looks along -X)
const SPREAD_Z = 16;              // wide horizontal spread (Z = left/right in camera view)

/* ─── colour palettes ─── */
const PALETTES: [number, number, number][][] = [
  // gold + white
  [[1, 0.85, 0.3], [1, 0.95, 0.7], [1, 1, 1]],
  // magenta + pink
  [[1, 0.2, 0.6], [1, 0.5, 0.8], [1, 0.8, 1]],
  // cyan + blue
  [[0.2, 0.8, 1], [0.4, 0.6, 1], [0.7, 0.9, 1]],
  // green + lime
  [[0.3, 1, 0.4], [0.6, 1, 0.3], [0.8, 1, 0.7]],
  // red + orange
  [[1, 0.25, 0.15], [1, 0.55, 0.1], [1, 0.8, 0.4]],
  // purple + violet
  [[0.6, 0.2, 1], [0.8, 0.4, 1], [0.9, 0.7, 1]],
  // white + silver
  [[1, 1, 1], [0.9, 0.95, 1], [0.8, 0.85, 0.95]],
];

const pickPalette = () => PALETTES[Math.floor(Math.random() * PALETTES.length)];

/* ─── per-shell state ─── */
type ShellState = {
  active: boolean;
  phase: "rising" | "burst";
  x: number;
  z: number;
  riseY: number;
  riseVelocity: number;
  targetY: number;
  burstAge: number;
  palette: [number, number, number][];
};

type FireworkData = {
  positions: Float32Array;
  velocities: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  ages: Float32Array;
  lifetimes: Float32Array;
  shells: ShellState[];
};

function initShell(): ShellState {
  return {
    active: false,
    phase: "rising",
    x: 0,
    z: 0,
    riseY: 0,
    riseVelocity: 0,
    targetY: 0,
    burstAge: 0,
    palette: PALETTES[0],
  };
}

function launchShell(shell: ShellState, baseOrigin: Vector3) {
  shell.active = true;
  shell.phase = "rising";
  shell.x = baseOrigin.x - Math.random() * SPREAD_X; // always behind scene (negative X = farther from camera)
  shell.z = baseOrigin.z + (Math.random() - 0.5) * SPREAD_Z; // spread wide left/right
  shell.riseY = baseOrigin.y - 4; // start below
  shell.riseVelocity =
    SHELL_RISE_SPEED_MIN + Math.random() * (SHELL_RISE_SPEED_MAX - SHELL_RISE_SPEED_MIN);
  shell.targetY = baseOrigin.y + Math.random() * 4;
  shell.burstAge = 0;
  shell.palette = pickPalette();
}

function burstShell(
  shellIndex: number,
  shell: ShellState,
  data: FireworkData
) {
  const burstStart = shellIndex * PARTICLES_PER_SHELL;
  const palette = shell.palette;
  for (let p = 0; p < PARTICLES_PER_SHELL; p++) {
    const i = burstStart + p;
    const idx3 = i * 3;

    // spherical burst
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);
    const speed = BURST_SPEED_MIN + Math.random() * (BURST_SPEED_MAX - BURST_SPEED_MIN);

    data.positions[idx3] = shell.x;
    data.positions[idx3 + 1] = shell.riseY;
    data.positions[idx3 + 2] = shell.z;

    data.velocities[idx3] = Math.sin(phi) * Math.cos(theta) * speed;
    data.velocities[idx3 + 1] = Math.sin(phi) * Math.sin(theta) * speed * 0.6 + Math.cos(phi) * speed * 0.5;
    data.velocities[idx3 + 2] = Math.sin(phi) * Math.sin(theta + Math.PI / 2) * speed;

    const c = palette[Math.floor(Math.random() * palette.length)];
    data.colors[idx3] = c[0];
    data.colors[idx3 + 1] = c[1];
    data.colors[idx3 + 2] = c[2];

    data.sizes[i] = SPARKLE_SIZE * (0.6 + Math.random() * 0.8);
    data.lifetimes[i] = BURST_LIFETIME_MIN + Math.random() * (BURST_LIFETIME_MAX - BURST_LIFETIME_MIN);
    data.ages[i] = 0;
  }
}

export function Fireworks({ isActive, origin = [0, 5, -14] }: FireworksProps) {
  const geometryRef = useRef<BufferGeometry>(null);
  const materialRef = useRef<PointsMaterial>(null);
  const dataRef = useRef<FireworkData | null>(null);
  const baseOrigin = useMemo(() => new Vector3(...origin), [origin]);
  const launchTimerRef = useRef(0);
  const hasExplodedOnceRef = useRef(false);

  // secondary points for trails
  const trailGeomRef = useRef<BufferGeometry>(null);
  const trailMatRef = useRef<PointsMaterial>(null);

  if (!dataRef.current) {
    const shells: ShellState[] = [];
    for (let s = 0; s < MAX_SHELLS; s++) shells.push(initShell());

    dataRef.current = {
      positions: new Float32Array(TOTAL_PARTICLES * 3),
      velocities: new Float32Array(TOTAL_PARTICLES * 3),
      colors: new Float32Array(TOTAL_PARTICLES * 3),
      sizes: new Float32Array(TOTAL_PARTICLES),
      ages: new Float32Array(TOTAL_PARTICLES),
      lifetimes: new Float32Array(TOTAL_PARTICLES),
      shells,
    };

    // initialise all particles offscreen
    for (let i = 0; i < TOTAL_PARTICLES; i++) {
      const idx3 = i * 3;
      dataRef.current.positions[idx3] = 0;
      dataRef.current.positions[idx3 + 1] = -100;
      dataRef.current.positions[idx3 + 2] = 0;
      dataRef.current.ages[i] = 999;
      dataRef.current.lifetimes[i] = 1;
      dataRef.current.sizes[i] = 0;
    }
  }

  // On first activation, do a big volley
  useEffect(() => {
    if (isActive && !hasExplodedOnceRef.current) {
      hasExplodedOnceRef.current = true;
      const data = dataRef.current!;
      // Launch several shells immediately
      let launched = 0;
      for (let s = 0; s < MAX_SHELLS && launched < 5; s++) {
        if (!data.shells[s].active) {
          launchShell(data.shells[s], baseOrigin);
          launched++;
        }
      }
    }
    if (!isActive) {
      hasExplodedOnceRef.current = false;
    }
  }, [isActive, baseOrigin]);

  useFrame((_, rawDelta) => {
    const geometry = geometryRef.current;
    const material = materialRef.current;
    const trailGeom = trailGeomRef.current;
    const trailMat = trailMatRef.current;
    const data = dataRef.current;
    if (!geometry || !material || !data || !trailGeom || !trailMat) return;

    const delta = Math.min(rawDelta, 0.05); // clamp to avoid huge jumps

    const posAttr = geometry.getAttribute("position") as BufferAttribute;
    const colAttr = geometry.getAttribute("color") as BufferAttribute;
    const trailPosAttr = trailGeom.getAttribute("position") as BufferAttribute;
    const trailColAttr = trailGeom.getAttribute("color") as BufferAttribute;

    /* ── fade out when inactive ── */
    if (!isActive) {
      material.opacity = MathUtils.damp(material.opacity, 0, 4, delta);
      trailMat.opacity = MathUtils.damp(trailMat.opacity, 0, 4, delta);
      if (material.opacity < 0.01) {
        // reset shells
        for (const shell of data.shells) shell.active = false;
      }
      return;
    }

    material.opacity = MathUtils.damp(material.opacity, 1, 3, delta);
    trailMat.opacity = MathUtils.damp(trailMat.opacity, 0.7, 3, delta);

    /* ── launch new shells on a timer ── */
    launchTimerRef.current += delta;
    if (launchTimerRef.current >= LAUNCH_INTERVAL) {
      launchTimerRef.current = 0;
      for (let s = 0; s < MAX_SHELLS; s++) {
        if (!data.shells[s].active) {
          launchShell(data.shells[s], baseOrigin);
          break;
        }
      }
    }

    /* ── update each shell ── */
    for (let s = 0; s < MAX_SHELLS; s++) {
      const shell = data.shells[s];
      if (!shell.active) continue;

      if (shell.phase === "rising") {
        // Update trail particles for this shell
        const trailBase = s * TRAIL_PARTICLES_PER_SHELL;
        for (let t = 0; t < TRAIL_PARTICLES_PER_SHELL; t++) {
          const ti = TOTAL_BURST + trailBase + t;
          const ti3 = ti * 3;
          // Trail particles spread along the rise path
          const trailOffset = (t / TRAIL_PARTICLES_PER_SHELL) * 1.5;
          data.positions[ti3] = shell.x + (Math.random() - 0.5) * 0.15;
          data.positions[ti3 + 1] = shell.riseY - trailOffset + (Math.random() - 0.5) * 0.1;
          data.positions[ti3 + 2] = shell.z + (Math.random() - 0.5) * 0.15;

          const brightness = 1 - (t / TRAIL_PARTICLES_PER_SHELL) * 0.7;
          data.colors[ti3] = 1 * brightness;
          data.colors[ti3 + 1] = 0.85 * brightness;
          data.colors[ti3 + 2] = 0.4 * brightness;
          data.sizes[ti] = TRAIL_SIZE * brightness;
        }

        // Move the shell upward
        shell.riseY += shell.riseVelocity * delta;

        if (shell.riseY >= shell.targetY) {
          shell.phase = "burst";
          shell.burstAge = 0;
          burstShell(s, shell, data);

          // Hide trail particles
          const trailBase2 = s * TRAIL_PARTICLES_PER_SHELL;
          for (let t = 0; t < TRAIL_PARTICLES_PER_SHELL; t++) {
            const ti = TOTAL_BURST + trailBase2 + t;
            const ti3 = ti * 3;
            data.positions[ti3 + 1] = -100;
            data.sizes[ti] = 0;
          }
        }
      } else {
        // burst phase
        shell.burstAge += delta;
        const burstStart = s * PARTICLES_PER_SHELL;
        let allDead = true;

        for (let p = 0; p < PARTICLES_PER_SHELL; p++) {
          const i = burstStart + p;
          const idx3 = i * 3;
          data.ages[i] += delta;
          const age = data.ages[i];
          const life = data.lifetimes[i];

          if (age > life) {
            // dead particle - hide
            data.positions[idx3 + 1] = -100;
            data.colors[idx3] = 0;
            data.colors[idx3 + 1] = 0;
            data.colors[idx3 + 2] = 0;
            data.sizes[i] = 0;
            continue;
          }

          allDead = false;

          // Apply drag
          data.velocities[idx3] *= DRAG;
          data.velocities[idx3 + 1] *= DRAG;
          data.velocities[idx3 + 2] *= DRAG;

          // Apply gravity
          data.velocities[idx3 + 1] += GRAVITY * delta;

          // Integrate position
          data.positions[idx3] += data.velocities[idx3] * delta;
          data.positions[idx3 + 1] += data.velocities[idx3 + 1] * delta;
          data.positions[idx3 + 2] += data.velocities[idx3 + 2] * delta;

          // Fade colour and size
          const t = age / life;
          const fade = Math.max(0, 1 - t * t); // quadratic fade for a nice tail
          const flicker = 0.85 + Math.random() * 0.15; // subtle sparkle

          const palette = shell.palette;
          // Transition from bright core colour towards dim warm colour
          const cIdx = Math.min(Math.floor(t * palette.length), palette.length - 1);
          const c = palette[cIdx];
          data.colors[idx3] = c[0] * fade * flicker;
          data.colors[idx3 + 1] = c[1] * fade * flicker;
          data.colors[idx3 + 2] = c[2] * fade * flicker;

          data.sizes[i] = SPARKLE_SIZE * fade * (0.5 + Math.random() * 0.5);
        }

        if (allDead) {
          shell.active = false;
        }
      }
    }

    /* ── upload to GPU ── */
    // Burst particles (first TOTAL_BURST)
    const burstPos = data.positions.subarray(0, TOTAL_BURST * 3);
    const burstCol = data.colors.subarray(0, TOTAL_BURST * 3);
    posAttr.array.set(burstPos);
    colAttr.array.set(burstCol);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Trail particles
    const trailStart = TOTAL_BURST * 3;
    const trailPos = data.positions.subarray(trailStart, trailStart + TOTAL_TRAIL * 3);
    const trailCol = data.colors.subarray(trailStart, trailStart + TOTAL_TRAIL * 3);
    trailPosAttr.array.set(trailPos);
    trailColAttr.array.set(trailCol);
    trailPosAttr.needsUpdate = true;
    trailColAttr.needsUpdate = true;
  });

  const burstPositions = useMemo(() => new Float32Array(TOTAL_BURST * 3), []);
  const burstColors = useMemo(() => new Float32Array(TOTAL_BURST * 3), []);
  const trailPositions = useMemo(() => new Float32Array(TOTAL_TRAIL * 3), []);
  const trailColors = useMemo(() => new Float32Array(TOTAL_TRAIL * 3), []);

  return (
    <group>
      {/* Main burst particles */}
      <points frustumCulled={false}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[burstPositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[burstColors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          size={SPARKLE_SIZE}
          transparent
          vertexColors
          depthWrite={false}
          opacity={0}
          sizeAttenuation
          blending={AdditiveBlending}
        />
      </points>

      {/* Rising trail particles */}
      <points frustumCulled={false}>
        <bufferGeometry ref={trailGeomRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[trailPositions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[trailColors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={trailMatRef}
          size={TRAIL_SIZE}
          transparent
          vertexColors
          depthWrite={false}
          opacity={0}
          sizeAttenuation
          blending={AdditiveBlending}
        />
      </points>
    </group>
  );
}
