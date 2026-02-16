import { useLoader } from "@react-three/fiber";
import type { ThreeElements, ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useCursor } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Vector3,
  Group,
  Euler,
  Quaternion,
} from "three";

type BouquetProps = ThreeElements["group"] & {
  bouquetId: string;
  tablePosition: [number, number, number];
  tableRotation: [number, number, number];
  isActive: boolean;
  onToggle: (id: string) => void;
  onDragChange?: (isDragging: boolean) => void;
};

const BOUQUET_CAMERA_DISTANCE = 1.8;
const BOUQUET_HOVER_LIFT = 0.04;

export function Bouquet({
  bouquetId,
  tablePosition,
  tableRotation,
  isActive,
  onToggle,
  onDragChange,
  children,
  ...groupProps
}: BouquetProps) {
  const groupRef = useRef<Group>(null);
  const { camera } = useThree();
  const gltf = useLoader(GLTFLoader, "/wrapped_flower_bouquet.glb");
  const [isHovered, setIsHovered] = useState(false);

  // Interaction state
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const previousPointerPosition = useRef({ x: 0, y: 0 });
  const [rotationOffset, setRotationOffset] = useState(new Euler(0, 0, 0));

  useCursor(isHovered && !isActive, "pointer");
  useCursor(isActive && !isDragging.current, "grab");
  useCursor(isDragging.current, "grabbing");

  const bouquetScene = useMemo<Group | null>(
    () => gltf.scene?.clone(true) ?? null,
    [gltf.scene]
  );

  const defaultPosition = useMemo(
    () => new Vector3(...tablePosition),
    [tablePosition]
  );
  const defaultQuaternion = useMemo(() => {
    const euler = new Euler(...tableRotation);
    return new Quaternion().setFromEuler(euler);
  }, [tableRotation]);

  // Reset when deactivated
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    if (!isActive) {
      setRotationOffset(new Euler(0, 0, 0));
      group.position.copy(defaultPosition);
      group.quaternion.copy(defaultQuaternion);
      isDragging.current = false;
      hasDragged.current = false;
      onDragChange?.(false);
    }
  }, [defaultPosition, defaultQuaternion, isActive, onDragChange]);

  useEffect(() => {
    if (!isActive) {
      setIsHovered(false);
    }
  }, [isActive]);

  // Reusable temp objects
  const tmpPosition = useMemo(() => new Vector3(), []);
  const tmpQuaternion = useMemo(() => new Quaternion(), []);
  const tmpDirection = useMemo(() => new Vector3(), []);
  const cameraOffset = useMemo(() => new Vector3(0, -0.5, 0), []);
  const lookAtTarget = useMemo(() => new Vector3(), []);
  const dummyObj = useMemo(() => new Group(), []);
  const innerGroupRef = useRef<Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const positionTarget = tmpPosition;
    const rotationTarget = tmpQuaternion;

    if (isActive) {
      // Position: in front of camera
      positionTarget.copy(camera.position);
      positionTarget.add(
        tmpDirection
          .copy(camera.getWorldDirection(tmpDirection))
          .multiplyScalar(BOUQUET_CAMERA_DISTANCE)
      );
      positionTarget.add(cameraOffset);

      // Rotation: face the camera with flowers upright
      dummyObj.position.copy(positionTarget);
      lookAtTarget.copy(camera.position);
      // Removed: lookAtTarget.y = positionTarget.y;
      dummyObj.lookAt(lookAtTarget);
      rotationTarget.copy(dummyObj.quaternion);

      // Apply user drag rotation
      const userRotation = new Quaternion().setFromEuler(rotationOffset);
      rotationTarget.multiply(userRotation);
    } else {
      positionTarget.copy(defaultPosition);
      if (isHovered) {
        positionTarget.y += BOUQUET_HOVER_LIFT;
      }
      rotationTarget.copy(defaultQuaternion);
    }

    const lerpAlpha = 1 - Math.exp(-delta * 12);
    const slerpAlpha = 1 - Math.exp(-delta * 10);

    group.position.lerp(positionTarget, lerpAlpha);
    group.quaternion.slerp(rotationTarget, slerpAlpha);
  });

  // --- Pointer handlers ---

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (!isActive) {
        setIsHovered(true);
      }
    },
    [isActive]
  );

  const handlePointerOut = useCallback((event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setIsHovered(false);
  }, []);

  const onWindowPointerMove = useCallback((event: PointerEvent) => {
    if (!isDragging.current) return;

    const deltaX = event.clientX - previousPointerPosition.current.x;
    const deltaY = event.clientY - previousPointerPosition.current.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasDragged.current = true;
    }

    const sensitivity = 0.012;

    setRotationOffset(
      (prev) =>
        new Euler(
          prev.x - deltaY * sensitivity,
          prev.y + deltaX * sensitivity,
          prev.z
        )
    );

    previousPointerPosition.current = { x: event.clientX, y: event.clientY };
  }, []);

  const onWindowPointerUp = useCallback(() => {
    if (isDragging.current) {
      isDragging.current = false;
      document.body.style.cursor = "";
      onDragChange?.(false);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerup", onWindowPointerUp);
    }
  }, [onDragChange, onWindowPointerMove]);

  const handlePointerDown = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();

      if (isActive) {
        event.nativeEvent.stopImmediatePropagation();
        event.nativeEvent.stopPropagation();
        event.nativeEvent.preventDefault();

        isDragging.current = true;
        hasDragged.current = false;
        document.body.style.cursor = "grabbing";
        onDragChange?.(true);
        previousPointerPosition.current = {
          x: event.clientX,
          y: event.clientY,
        };

        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
      }
    },
    [isActive, onDragChange, onWindowPointerMove, onWindowPointerUp]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (!hasDragged.current) {
        onToggle(bouquetId);
      }
      hasDragged.current = false;
    },
    [bouquetId, onToggle]
  );

  if (!bouquetScene) {
    return null;
  }

  return (
    <group ref={groupRef} {...groupProps}>
      <group
        ref={innerGroupRef}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
        <primitive object={bouquetScene} />
        {children}
      </group>
    </group>
  );
}
