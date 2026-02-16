import { useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  MathUtils,
  PointsMaterial,
} from "three";

type FallingSparklesProps = {
  isActive: boolean;
};

const PARTICLE_COUNT = 400;
const AREA_X = 20;        // width of the snow area
const AREA_Z = 20;        // depth of the snow area
const TOP_Y = 12;         // spawn height
const BOTTOM_Y = -2;      // despawn height
const FALL_SPEED_MIN = 0.8;
const FALL_SPEED_MAX = 2.0;
const DRIFT_SPEED = 0.3;  // horizontal sway
const PARTICLE_SIZE = 0.04;

export function FallingSparkles({ isActive }: FallingSparklesProps) {
  const geometryRef = useRef<BufferGeometry>(null);
  const materialRef = useRef<PointsMaterial>(null);

  const { positions, colors, velocities } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const col = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT * 3); // vx, vy, vz

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      // Scatter across the area at random heights
      pos[i3] = (Math.random() - 0.5) * AREA_X;
      pos[i3 + 1] = BOTTOM_Y + Math.random() * (TOP_Y - BOTTOM_Y);
      pos[i3 + 2] = (Math.random() - 0.5) * AREA_Z;

      // Warm sparkle colours: golds, whites, soft pinks
      const palette = Math.random();
      if (palette < 0.4) {
        // gold/warm white
        col[i3] = 1;
        col[i3 + 1] = 0.9 + Math.random() * 0.1;
        col[i3 + 2] = 0.6 + Math.random() * 0.3;
      } else if (palette < 0.7) {
        // soft pink
        col[i3] = 1;
        col[i3 + 1] = 0.7 + Math.random() * 0.2;
        col[i3 + 2] = 0.8 + Math.random() * 0.2;
      } else {
        // pure white
        col[i3] = 1;
        col[i3 + 1] = 1;
        col[i3 + 2] = 1;
      }

      // Fall speed + gentle horizontal drift
      vel[i3] = (Math.random() - 0.5) * DRIFT_SPEED;
      vel[i3 + 1] = -(FALL_SPEED_MIN + Math.random() * (FALL_SPEED_MAX - FALL_SPEED_MIN));
      vel[i3 + 2] = (Math.random() - 0.5) * DRIFT_SPEED;
    }

    return { positions: pos, colors: col, velocities: vel };
  }, []);

  useFrame((_, rawDelta) => {
    const geom = geometryRef.current;
    const mat = materialRef.current;
    if (!geom || !mat) return;

    const delta = Math.min(rawDelta, 0.05);

    if (!isActive) {
      mat.opacity = MathUtils.damp(mat.opacity, 0, 4, delta);
      return;
    }

    mat.opacity = MathUtils.damp(mat.opacity, 0.6, 2, delta);

    const posAttr = geom.getAttribute("position") as BufferAttribute;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Gentle sinusoidal sway
      const sway = Math.sin(Date.now() * 0.001 + i) * 0.15;

      positions[i3] += (velocities[i3] + sway) * delta;
      positions[i3 + 1] += velocities[i3 + 1] * delta;
      positions[i3 + 2] += (velocities[i3 + 2] + sway * 0.5) * delta;

      // Respawn at top when particle falls below
      if (positions[i3 + 1] < BOTTOM_Y) {
        positions[i3] = (Math.random() - 0.5) * AREA_X;
        positions[i3 + 1] = TOP_Y + Math.random() * 2;
        positions[i3 + 2] = (Math.random() - 0.5) * AREA_Z;
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        size={PARTICLE_SIZE}
        transparent
        vertexColors
        depthWrite={false}
        opacity={0}
        sizeAttenuation
        blending={AdditiveBlending}
      />
    </points>
  );
}
