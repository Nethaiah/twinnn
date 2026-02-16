import { useLoader } from "@react-three/fiber";
import type { ThreeElements } from "@react-three/fiber";
import { useMemo } from "react";
import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type BouquetProps = ThreeElements["group"];

export function Bouquet({ children, ...groupProps }: BouquetProps) {
  const gltf = useLoader(GLTFLoader, "/wrapped_flower_bouquet.glb");
  const bouquetScene = useMemo<Group | null>(() => gltf.scene?.clone(true) ?? null, [gltf.scene]);

  if (!bouquetScene) {
    return null;
  }

  return (
    <group {...groupProps}>
      <primitive object={bouquetScene} />
      {children}
    </group>
  );
}
