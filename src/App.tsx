import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useCursor } from "@react-three/drei";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Group } from "three";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Candle } from "./models/candle";
import { Cake } from "./models/cake";
import { Table } from "./models/table";
import { PictureFrame } from "./models/pictureFrame";
import { Fireworks } from "./components/Fireworks";
import { FallingSparkles } from "./components/FallingSparkles";
import { BirthdayCard } from "./components/BirthdayCard";
import { CardOverlay } from "./components/CardOverlay";

import "./App.css";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

type AnimatedSceneProps = {
  isPlaying: boolean;
  onBackgroundFadeChange?: (opacity: number) => void;
  onEnvironmentProgressChange?: (progress: number) => void;
  candleLit: boolean;
  onAnimationComplete?: () => void;
  cards: ReadonlyArray<BirthdayCardConfig>;
  activeCardId: string | null;
  onToggleCard: (id: string) => void;
  onShowOverlay: () => void;
  activeFrameId: string | null;
  onToggleFrame: (id: string) => void;
  onDragChange: (isDragging: boolean) => void;
};

const CAKE_START_Y = 10;
const CAKE_END_Y = 0;
const CAKE_DESCENT_DURATION = 3;

const TABLE_START_Z = 30;
const TABLE_END_Z = 0;
const TABLE_SLIDE_DURATION = 0.7;
const TABLE_SLIDE_START = CAKE_DESCENT_DURATION - TABLE_SLIDE_DURATION - 0.1;

const CANDLE_START_Y = 5;
const CANDLE_END_Y = 0;
const CANDLE_DROP_DURATION = 1.2;
const CANDLE_DROP_START =
  Math.max(CAKE_DESCENT_DURATION, TABLE_SLIDE_START + TABLE_SLIDE_DURATION) +
  1.0;

const totalAnimationTime = CANDLE_DROP_START + CANDLE_DROP_DURATION;

const ORBIT_TARGET = new Vector3(0, 1, 0);
const ORBIT_INITIAL_RADIUS = 3;
const ORBIT_INITIAL_HEIGHT = 1;
const ORBIT_INITIAL_AZIMUTH = Math.PI / 2;
const ORBIT_MIN_DISTANCE = 2;
const ORBIT_MAX_DISTANCE = 8;
const ORBIT_MIN_POLAR = Math.PI * 0;
const ORBIT_MAX_POLAR = Math.PI / 2;

const BACKGROUND_FADE_DURATION = 1;
const BACKGROUND_FADE_OFFSET = 0;
const BACKGROUND_FADE_END = Math.max(
  CANDLE_DROP_START - BACKGROUND_FADE_OFFSET,
  BACKGROUND_FADE_DURATION
);
const BACKGROUND_FADE_START = Math.max(
  BACKGROUND_FADE_END - BACKGROUND_FADE_DURATION,
  0
);

const TYPED_LINES = [
  "> Hello, Ate Bianca",
  "...",
  "> Happy Birthday!",
  "...",
  "> I just want to say...",
  "> Please enjoy your special day.",
  "> Wishing you all the best and a very good future.",
  "...",
  "> Just a simple message for you.",
  "> Happy Birthdayyyyyy!!! ٩(◕‿◕)۶ ٩(◕‿◕)۶ ٩(◕‿◕)۶"
];

const TYPED_CHAR_DELAY = 100;
const POST_TYPING_SCENE_DELAY = 1000;
const CURSOR_BLINK_INTERVAL = 480;

type BirthdayCardConfig = {
  id: string;
  image: string;
  position: [number, number, number];
  rotation: [number, number, number];
};

const BIRTHDAY_CARDS: ReadonlyArray<BirthdayCardConfig> = [
  {
    id: "confetti",
    image: "/letter_five.png",
    position: [1, 0.081, -2],
    rotation: [-Math.PI / 2 , 0, Math.PI / 3],
  }
];

const FRAME_AUDIO_MAPPING: Record<string, { src: string; startAt: number }> = {
  "frame1": { src: "/Colbie Caillat.mp3", startAt: 6 },
  "frame2": { src: "/Prettiest To Me.mp3", startAt: 5 },
  "frame3": { src: "/Gwiyomi.mp3", startAt: 6 },
  "frame4": { src: "/Aphrodite.mp3", startAt: 4 }
};

import { useTexture } from "@react-three/drei";

const CARD_WIDTH = 1;
const CARD_HEIGHT = 0.75;

function CardStackPlaceholder({ position, rotation, onClick }: { position: [number, number, number], rotation: [number, number, number], onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    useCursor(hovered, "pointer", "auto");
    const texture = useTexture("/letter_one.png");
    
    return (
        <group 
            position={position} 
            rotation={rotation} 
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
        >
             {/* Bottom cards in stack */}
            <mesh position={[0, 0.005, 0]} rotation={[0, 0, 0.05]} castShadow receiveShadow>
                 <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, 0.01]} />
                 <meshStandardMaterial color="#fcfcfc" />
            </mesh>
            <mesh position={[0.02, 0.015, 0.02]} rotation={[0, 0, -0.02]} castShadow receiveShadow>
                 <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, 0.01]} />
                 <meshStandardMaterial color="#fcfcfc" />
            </mesh>
             {/* Top card with image */}
             <mesh position={[0, 0.025, 0]} rotation={[0, 0, 0]} castShadow receiveShadow>
                 <boxGeometry args={[CARD_WIDTH, CARD_HEIGHT, 0.01]} />
                 <meshStandardMaterial 
                    map={texture} 
                    roughness={0.35}
                    metalness={0.05}
                 />
            </mesh>
        </group>
    );
}

function AnimatedScene({
  isPlaying,
  onBackgroundFadeChange,
  onEnvironmentProgressChange,
  candleLit,
  onAnimationComplete,
  cards,
  activeCardId,
  onToggleCard,
  onShowOverlay,
  activeFrameId,
  onToggleFrame,
  onDragChange,
}: AnimatedSceneProps) {
  const cakeGroup = useRef<Group>(null);
  const tableGroup = useRef<Group>(null);
  const candleGroup = useRef<Group>(null);
  const animationStartRef = useRef<number | null>(null);
  const hasPrimedRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const backgroundOpacityRef = useRef(1);
  const environmentProgressRef = useRef(0);

  useEffect(() => {
    onBackgroundFadeChange?.(backgroundOpacityRef.current);
    onEnvironmentProgressChange?.(environmentProgressRef.current);
  }, [onBackgroundFadeChange, onEnvironmentProgressChange]);

  const emitBackgroundOpacity = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - backgroundOpacityRef.current) > 0.005) {
      backgroundOpacityRef.current = clamped;
      onBackgroundFadeChange?.(clamped);
    }
  };

  const emitEnvironmentProgress = (value: number) => {
    const clamped = clamp(value, 0, 1);
    if (Math.abs(clamped - environmentProgressRef.current) > 0.005) {
      environmentProgressRef.current = clamped;
      onEnvironmentProgressChange?.(clamped);
    }
  };

  useFrame(({ clock }) => {
    const cake = cakeGroup.current;
    const table = tableGroup.current;
    const candle = candleGroup.current;

    if (!cake || !table || !candle) {
      return;
    }

    if (!hasPrimedRef.current) {
      cake.position.set(0, CAKE_START_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_START_Z);
      table.rotation.set(0, 0, 0);
      candle.position.set(0, CANDLE_START_Y, 0);
      candle.visible = false;
      hasPrimedRef.current = true;
    }

    if (!isPlaying) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
      animationStartRef.current = null;
      hasCompletedRef.current = false;
      completionNotifiedRef.current = false;
      return;
    }

    if (hasCompletedRef.current) {
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
      return;
    }

    if (animationStartRef.current === null) {
      animationStartRef.current = clock.elapsedTime;
    }

    const elapsed = clock.elapsedTime - animationStartRef.current;
    const clampedElapsed = clamp(elapsed, 0, totalAnimationTime);

    const cakeProgress = clamp(clampedElapsed / CAKE_DESCENT_DURATION, 0, 1);
    const cakeEase = easeOutCubic(cakeProgress);
    cake.position.y = lerp(CAKE_START_Y, CAKE_END_Y, cakeEase);
    cake.position.x = 0;
    cake.position.z = 0;
    cake.rotation.y = cakeEase * Math.PI * 2;
    cake.rotation.x = 0;
    cake.rotation.z = 0;

    let tableZ = TABLE_START_Z;
    if (clampedElapsed >= TABLE_SLIDE_START) {
      const tableProgress = clamp(
        (clampedElapsed - TABLE_SLIDE_START) / TABLE_SLIDE_DURATION,
        0,
        1
      );
      const tableEase = easeOutCubic(tableProgress);
      tableZ = lerp(TABLE_START_Z, TABLE_END_Z, tableEase);
    }
    table.position.set(0, 0, tableZ);
    table.rotation.set(0, 0, 0);

    if (clampedElapsed >= CANDLE_DROP_START) {
      if (!candle.visible) {
        candle.visible = true;
      }
      const candleProgress = clamp(
        (clampedElapsed - CANDLE_DROP_START) / CANDLE_DROP_DURATION,
        0,
        1
      );
      const candleEase = easeOutCubic(candleProgress);
      candle.position.y = lerp(CANDLE_START_Y, CANDLE_END_Y, candleEase);
    } else {
      candle.visible = false;
      candle.position.set(0, CANDLE_START_Y, 0);
    }

    if (clampedElapsed < BACKGROUND_FADE_START) {
      emitBackgroundOpacity(1);
      emitEnvironmentProgress(0);
    } else {
      const fadeProgress = clamp(
        (clampedElapsed - BACKGROUND_FADE_START) / BACKGROUND_FADE_DURATION,
        0,
        1
      );
      const eased = easeOutCubic(fadeProgress);
      const backgroundOpacity = 1 - eased;
      emitBackgroundOpacity(backgroundOpacity);
      emitEnvironmentProgress(1 - backgroundOpacity);
    }

    const animationDone = clampedElapsed >= totalAnimationTime;
    if (animationDone) {
      cake.position.set(0, CAKE_END_Y, 0);
      cake.rotation.set(0, 0, 0);
      table.position.set(0, 0, TABLE_END_Z);
      candle.position.set(0, CANDLE_END_Y, 0);
      candle.visible = true;
      emitBackgroundOpacity(0);
      emitEnvironmentProgress(1);
      hasCompletedRef.current = true;
      if (!completionNotifiedRef.current) {
        completionNotifiedRef.current = true;
        onAnimationComplete?.();
      }
    }
  });

  return (
    <>
      <group ref={tableGroup}>
        <Table />
        <PictureFrame
          frameId="frame2"
          image="/frame2.jpg"
          tablePosition={[0, 0.735, 3]}
          tableRotation={[0, 5.6, 0]}
          scale={0.75}
          isActive={activeFrameId === "frame2"}
          onToggle={onToggleFrame}
          onDragChange={onDragChange}
        />
        <PictureFrame
          frameId="frame3"
          image="/frame3.jpg"
          tablePosition={[0, 0.735, -3]}
          tableRotation={[0, 4.0, 0]}
          scale={0.75}
          isActive={activeFrameId === "frame3"}
          onToggle={onToggleFrame}
          onDragChange={onDragChange}
        />
        <PictureFrame
          frameId="frame4"
          image="/frame4.jpg"
          tablePosition={[-1.5, 0.735, 2.5]}
          tableRotation={[0, 5.4, 0]}
          scale={0.75}
          isActive={activeFrameId === "frame4"}
          onToggle={onToggleFrame}
          onDragChange={onDragChange}
        />
        <PictureFrame
          frameId="frame1"
          image="/frame1.jpg"
          tablePosition={[-1.5, 0.735, -2.5]}
          tableRotation={[0, 4.2, 0]}
          scale={0.75}
          isActive={activeFrameId === "frame1"}
          onToggle={onToggleFrame}
          onDragChange={onDragChange}
        />
        {cards.map((card) => {
          if (card.id === "confetti") {
             return (
               <CardStackPlaceholder
                 key={card.id}
                 position={card.position}
                 rotation={card.rotation}
                 onClick={onShowOverlay}
               />
             );
          }
          return (
            <BirthdayCard
              key={card.id}
              id={card.id}
              image={card.image}
              tablePosition={card.position}
              tableRotation={card.rotation}
              isActive={activeCardId === card.id}
              onToggle={onToggleCard}
            />
          );
        })}
      </group>
      <group ref={cakeGroup}>
        <Cake />
      </group>
      <group ref={candleGroup}>
        <Candle isLit={candleLit} scale={0.25} position={[0, 1.1, 0]} />
      </group>
    </>
  );
}



type ConfiguredOrbitControlsProps = {
  enabled?: boolean;
};

function ConfiguredOrbitControls({ enabled = true }: ConfiguredOrbitControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    const offset = new Vector3(
      Math.sin(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS,
      ORBIT_INITIAL_HEIGHT,
      Math.cos(ORBIT_INITIAL_AZIMUTH) * ORBIT_INITIAL_RADIUS
    );
    const cameraPosition = ORBIT_TARGET.clone().add(offset);
    camera.position.copy(cameraPosition);
    camera.lookAt(ORBIT_TARGET);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(ORBIT_TARGET);
      controls.update();
    }
  }, [camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={enabled}
      enableDamping
      dampingFactor={0.05}
      minDistance={ORBIT_MIN_DISTANCE}
      maxDistance={ORBIT_MAX_DISTANCE}
      minPolarAngle={ORBIT_MIN_POLAR}
      maxPolarAngle={ORBIT_MAX_POLAR}
    />
  );
}

type EnvironmentBackgroundControllerProps = {
  intensity: number;
};

function EnvironmentBackgroundController({
  intensity,
}: EnvironmentBackgroundControllerProps) {
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    if ("backgroundIntensity" in scene) {
      // Cast required because older typings might not include backgroundIntensity yet.
      (scene as typeof scene & { backgroundIntensity: number }).backgroundIntensity =
        intensity;
    }
  }, [scene, intensity]);

  return null;
}


export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [backgroundOpacity, setBackgroundOpacity] = useState(1);
  const [environmentProgress, setEnvironmentProgress] = useState(0);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [sceneStarted, setSceneStarted] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const [hasAnimationCompleted, setHasAnimationCompleted] = useState(false);
  const [isCandleLit, setIsCandleLit] = useState(true);
  const [fireworksActive, setFireworksActive] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeFrameId, setActiveFrameId] = useState<string | null>(null);
  const [showCardOverlay, setShowCardOverlay] = useState(false);
  const [isDraggingFrame, setIsDraggingFrame] = useState(false);
  const backgroundAudioRef = useRef<HTMLAudioElement | null>(null);
  const frameAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/Paragraphs.mp3");
    audio.loop = true;
    audio.preload = "auto";
    backgroundAudioRef.current = audio;
    return () => {
      audio.pause();
      backgroundAudioRef.current = null;
    };
  }, []);

  const playBackgroundMusic = useCallback(() => {
    const audio = backgroundAudioRef.current;
    if (!audio) {
      return;
    }
    if (!audio.paused) {
      return;
    }
    void audio.play().catch(() => {
      // ignore play errors (browser might block)
    });
  }, []);

  const typingComplete = currentLineIndex >= TYPED_LINES.length;
  const typedLines = useMemo(() => {
    if (TYPED_LINES.length === 0) {
      return [""];
    }

    return TYPED_LINES.map((line, index) => {
      if (typingComplete || index < currentLineIndex) {
        return line;
      }
      if (index === currentLineIndex) {
        return line.slice(0, Math.min(currentCharIndex, line.length));
      }
      return "";
    });
  }, [currentCharIndex, currentLineIndex, typingComplete]);

  const cursorLineIndex = typingComplete
    ? Math.max(typedLines.length - 1, 0)
    : currentLineIndex;
  const cursorTargetIndex = Math.max(
    Math.min(cursorLineIndex, typedLines.length - 1),
    0
  );

  useEffect(() => {
    if (!hasStarted) {
      setCurrentLineIndex(0);
      setCurrentCharIndex(0);
      setSceneStarted(false);
      setIsCandleLit(true);
      setFireworksActive(false);
      setHasAnimationCompleted(false);
      return;
    }

    if (typingComplete) {
      if (!sceneStarted) {
        const handle = window.setTimeout(() => {
          setSceneStarted(true);
        }, POST_TYPING_SCENE_DELAY);
        return () => window.clearTimeout(handle);
      }
      return;
    }

    const currentLine = TYPED_LINES[currentLineIndex] ?? "";
    const handle = window.setTimeout(() => {
      if (currentCharIndex < currentLine.length) {
        setCurrentCharIndex((prev) => prev + 1);
        return;
      }

      let nextLineIndex = currentLineIndex + 1;
      while (
        nextLineIndex < TYPED_LINES.length &&
        TYPED_LINES[nextLineIndex].length === 0
      ) {
        nextLineIndex += 1;
      }

      setCurrentLineIndex(nextLineIndex);
      setCurrentCharIndex(0);
    }, TYPED_CHAR_DELAY);

    return () => window.clearTimeout(handle);
  }, [
    hasStarted,
    currentCharIndex,
    currentLineIndex,
    typingComplete,
    sceneStarted,
  ]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, CURSOR_BLINK_INTERVAL);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      if (!hasStarted) {
        playBackgroundMusic();
        setHasStarted(true);
        return;
      }
      if (hasAnimationCompleted && isCandleLit) {
        setIsCandleLit(false);
        setFireworksActive(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hasStarted, hasAnimationCompleted, isCandleLit, playBackgroundMusic]);

  const handleCardToggle = useCallback((id: string) => {
    setActiveCardId((current) => (current === id ? null : id));
  }, []);

  const handleFrameToggle = useCallback((id: string) => {
    setActiveFrameId((current) => (current === id ? null : id));
  }, []);

  useEffect(() => {
    if (!frameAudioRef.current) {
      frameAudioRef.current = new Audio();
      frameAudioRef.current.loop = true;
    }
    
    const bgAudio = backgroundAudioRef.current;
    const frameAudio = frameAudioRef.current;

    if (activeFrameId) {
      if (bgAudio) {
        bgAudio.pause();
      }
      
      const audioConfig = FRAME_AUDIO_MAPPING[activeFrameId];
      if (audioConfig) {
        frameAudio.src = audioConfig.src;
        frameAudio.currentTime = audioConfig.startAt;
        frameAudio.play().catch(() => {});
      }
    } else {
      frameAudio.pause();
      frameAudio.currentTime = 0;
      
      if (bgAudio && hasStarted && !activeCardId) {
         bgAudio.play().catch(() => {});
      }
    }
  }, [activeFrameId, hasStarted, activeCardId]);

  const isScenePlaying = hasStarted && sceneStarted;

  return (
    <div className="App">
      <CardOverlay isOpen={showCardOverlay} onClose={() => setShowCardOverlay(false)} />
      <div
        className="background-overlay"
        style={{ opacity: backgroundOpacity }}
      >
        <div className="typed-text">
          {typedLines.map((line, index) => {
            const showCursor =
              cursorVisible &&
              index === cursorTargetIndex &&
              (!typingComplete || !sceneStarted);
            return (
              <span className="typed-line" key={`typed-line-${index}`}>
                {line || "\u00a0"}
                {showCursor && (
                  <span aria-hidden="true" className="typed-cursor">
                    _
                  </span>
                )}
              </span>
            );
          })}
        </div>
      </div>
      {hasAnimationCompleted && isCandleLit && (
        <div className="hint-overlay">[ Press space to blow out the candle ]</div>
      )}
      {/* Background dismiss is handled via onPointerMissed on the Canvas */}
      <Canvas
        gl={{ alpha: true }}
        style={{ background: "transparent" }}
        onCreated={({ gl }) => {
          gl.setClearColor("#000000", 0);
        }}
        onPointerMissed={() => {
          if (activeFrameId) {
            handleFrameToggle(activeFrameId);
          }
        }}
      >
        <Suspense fallback={null}>
          <AnimatedScene
            isPlaying={isScenePlaying}
            candleLit={isCandleLit}
            onBackgroundFadeChange={setBackgroundOpacity}
            onEnvironmentProgressChange={setEnvironmentProgress}
            onAnimationComplete={() => setHasAnimationCompleted(true)}
            cards={BIRTHDAY_CARDS}
            activeCardId={activeCardId}
            onToggleCard={handleCardToggle}
            onShowOverlay={() => setShowCardOverlay(true)}
            activeFrameId={activeFrameId}
            onToggleFrame={handleFrameToggle}
            onDragChange={setIsDraggingFrame}
          />
          <ambientLight intensity={(1 - environmentProgress) * 0.8} />
          <directionalLight intensity={0.5} position={[2, 10, 0]} color={[1, 0.9, 0.95]}/>
          <Environment
            files={["/shanghai_bund_4k.hdr"]}
            backgroundRotation={[0, 3.3, 0]}
            environmentRotation={[0, 3.3, 0]}
            background
            environmentIntensity={0.1 * environmentProgress}
            backgroundIntensity={0.05 * environmentProgress}
          />
          <EnvironmentBackgroundController intensity={0.05 * environmentProgress} />
          <Fireworks isActive={fireworksActive} origin={[-10, 6, 0]} />
          <FallingSparkles isActive={fireworksActive} />
          <ConfiguredOrbitControls enabled={!isDraggingFrame && !activeFrameId} />
        </Suspense>
      </Canvas>
    </div>
  );
}
