import { useLoader } from "@react-three/fiber";
import type { ThreeElements, ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useTexture, useCursor } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Box3,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector3,
  DoubleSide,
  Group,
  Euler,
  Quaternion
} from "three";

type PictureFrameProps = ThreeElements["group"] & {
  frameId: string;
  image: string;
  imageScale?: number | [number, number];
  imageOffset?: [number, number, number];
  imageInset?: number;
  tablePosition: [number, number, number];
  tableRotation: [number, number, number];
  isActive: boolean;
  onToggle: (id: string) => void;
  onDragChange?: (isDragging: boolean) => void;
};

const DEFAULT_IMAGE_SCALE: [number, number] = [0.82, 0.82];
const FRAME_CAMERA_DISTANCE = 1.0;
const FRAME_HOVER_LIFT = 0.04;

export function PictureFrame({
  frameId,
  image,
  imageScale = DEFAULT_IMAGE_SCALE,
  imageOffset,
  imageInset = 0.01,
  tablePosition,
  tableRotation,
  isActive,
  onToggle,
  onDragChange,
  children,
  ...groupProps
}: PictureFrameProps) {
  const groupRef = useRef<Group>(null);
  const { gl, camera } = useThree();
  const gltf = useLoader(GLTFLoader, "/picture_frame.glb");
  const pictureTexture = useTexture(image);
  const [isHovered, setIsHovered] = useState(false);

  // Interaction state
  const isDragging = useRef(false);
  const hasDragged = useRef(false);
  const previousPointerPosition = useRef({ x: 0, y: 0 });
  const [rotationOffset, setRotationOffset] = useState(new Euler(0, 0, 0));

  useCursor(isHovered && !isActive, "pointer");
  useCursor(isActive && !isDragging.current, "grab");
  useCursor(isDragging.current, "grabbing");

  pictureTexture.colorSpace = SRGBColorSpace;
  const maxAnisotropy =
    typeof gl.capabilities.getMaxAnisotropy === "function"
      ? gl.capabilities.getMaxAnisotropy()
      : 1;
  pictureTexture.anisotropy = maxAnisotropy;

  const frameScene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const { frameSize, frameCenter } = useMemo(() => {
    const box = new Box3().setFromObject(frameScene);
    const size = new Vector3();
    const center = new Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { frameSize: size, frameCenter: center };
  }, [frameScene]);

  const scaledImage = useMemo<[number, number]>(() => {
    if (Array.isArray(imageScale)) {
      return imageScale;
    }
    return [imageScale, imageScale];
  }, [imageScale]);

  const [imageScaleX, imageScaleY] = scaledImage;

  const imageWidth = frameSize.x * imageScaleX;
  const imageHeight = frameSize.y * imageScaleY;

  const [offsetX, offsetY, offsetZ] = imageOffset ?? [
    0,
    0.05,
    -0.27,
  ];

  const imagePosition: [number, number, number] = [
    frameCenter.x + offsetX,
    frameCenter.y + offsetY,
    frameCenter.z + offsetZ,
  ];

  const pictureMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        map: pictureTexture,
        roughness: 0.08,
        metalness: 0,
        side: DoubleSide,
      }),
    [pictureTexture]
  );

  useEffect(() => {
    return () => {
      pictureMaterial.dispose();
    };
  }, [pictureMaterial]);

  const defaultPosition = useMemo(
    () => new Vector3(...tablePosition),
    [tablePosition]
  );
  const defaultQuaternion = useMemo(() => {
    const euler = new Euler(...tableRotation);
    return new Quaternion().setFromEuler(euler);
  }, [tableRotation]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    // Reset offset when deactivated
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

  const tmpPosition = useMemo(() => new Vector3(), []);
  const tmpQuaternion = useMemo(() => new Quaternion(), []);
  const tmpDirection = useMemo(() => new Vector3(), []);
  const cameraOffset = useMemo(() => new Vector3(0, -0.05, 0), []);
  const lookAtTarget = useMemo(() => new Vector3(), []);
  const dummyObj = useMemo(() => new Group(), []);
  const innerGroupRef = useRef<Group>(null);
  const FRAME_TILT = 0.435; // The tilt angle of the frame model/image

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }

    const positionTarget = tmpPosition;
    const rotationTarget = tmpQuaternion;

    if (isActive) {
      positionTarget.copy(camera.position);
      positionTarget.add(
        tmpDirection
          .copy(camera.getWorldDirection(tmpDirection))
          .multiplyScalar(FRAME_CAMERA_DISTANCE)
      );
      positionTarget.add(cameraOffset);
      
      // Vertical Rotation Logic
      // 1. Position dummy at frame target
      dummyObj.position.copy(positionTarget);
      // 2. Look at camera, allowing full rotation to face it directly
      lookAtTarget.copy(camera.position);
      // Removed: lookAtTarget.y = positionTarget.y; 
      dummyObj.lookAt(lookAtTarget);
      // 3. Get that vertical rotation
      rotationTarget.copy(dummyObj.quaternion);

      // 4. Flip 180 (because back face)
      const flipRotation = new Quaternion(); 
      flipRotation.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);
      rotationTarget.multiply(flipRotation);

      // 5. Apply user interaction
      const userRotation = new Quaternion().setFromEuler(rotationOffset);
      rotationTarget.multiply(userRotation);
      
    } else {
      positionTarget.copy(defaultPosition);
      if (isHovered) {
        positionTarget.y += FRAME_HOVER_LIFT;
      }
      rotationTarget.copy(defaultQuaternion);
    }

    const lerpAlpha = 1 - Math.exp(-delta * 12);
    const slerpAlpha = 1 - Math.exp(-delta * 10);

    group.position.lerp(positionTarget, lerpAlpha);
    group.quaternion.slerp(rotationTarget, slerpAlpha);

    // Inner group tilt correction
    if (innerGroupRef.current) {
        const targetTilt = isActive ? -FRAME_TILT : 0;
        // Smoothly interpolate the tilt
        const currentTilt = innerGroupRef.current.rotation.x;
        // Simple lerp for float
        const newTilt = currentTilt + (targetTilt - currentTilt) * (1 - Math.exp(-delta * 10));
        innerGroupRef.current.rotation.x = newTilt;
    }
  });

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

    // Threshold for drag detection
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasDragged.current = true;
    }

    // Sensitivity
    const sensitivity = 0.012;

    setRotationOffset((prev) => new Euler(
      prev.x - deltaY * sensitivity,
      prev.y + deltaX * sensitivity,
      prev.z
    ));

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
      event.stopPropagation(); // Stop R3F propagation

      if (isActive) {
        // Stop DOM propagation to prevent OrbitControls
        event.nativeEvent.stopImmediatePropagation();
        event.nativeEvent.stopPropagation();
        event.nativeEvent.preventDefault();

        isDragging.current = true;
        hasDragged.current = false;
        document.body.style.cursor = "grabbing";
        onDragChange?.(true);
        previousPointerPosition.current = { x: event.clientX, y: event.clientY };

        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
      }
    },
    [isActive, onDragChange, onWindowPointerMove, onWindowPointerUp]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      // Only toggle if we didn't drag
      if (!hasDragged.current) {
          onToggle(frameId);
      }
      // Reset for next time (though usually pointerDown resets it)
      hasDragged.current = false; 
    },
    [frameId, onToggle]
  );

  return (
    <group ref={groupRef} {...groupProps}>
      <group 
        ref={innerGroupRef}
        rotation={[0, 0, 0]} 
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
      >
      <primitive object={frameScene} />
      <mesh position={imagePosition} rotation={[0.435, Math.PI, 0]} material={pictureMaterial}>
        <planeGeometry args={[imageWidth, imageHeight]} />
      </mesh>
      {children}
      </group>
    </group>
  );
}
