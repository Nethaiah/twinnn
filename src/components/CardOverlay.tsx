
import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";

interface CardOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

const CARDS = [
  { src: "/letter_one.png", rotation: -12, x: -60, y: -40 },
  { src: "/letter_two.png", rotation: 8, x: 40, y: -60 },
  { src: "/letter_three.png", rotation: -5, x: -20, y: 10 },
  { src: "/letter_four.png", rotation: 15, x: 50, y: 30 },
  { src: "/letter_five.png", rotation: -8, x: -50, y: 50 },
];

export function CardOverlay({ isOpen, onClose }: CardOverlayProps) {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleBackgroundClick = () => {
    if (focusedIndex !== null) {
      setFocusedIndex(null);
    } else {
      onClose();
    }
  };

  const handleCardClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDragging.current) {
      return;
    }
    setFocusedIndex(index === focusedIndex ? null : index);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0 }}
           className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
           onClick={handleBackgroundClick}
           ref={containerRef}
           style={{
             position: 'fixed',
             top: 0,
             left: 0,
             width: '100vw',
             height: '100vh',
             zIndex: 9999,
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
             backgroundColor: 'rgba(0,0,0,0.8)',
             backdropFilter: 'blur(8px)'
           }}
        >
           {/* Close Hint */}
           <div style={{ position: 'absolute', top: 30, right: 30, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'monospace', letterSpacing: '2px', fontSize: '0.9rem' }}>
              {focusedIndex !== null ? "[ CLICK BACKGROUND TO UNFOCUS ]" : "[ CLICK BACKGROUND TO CLOSE ]"}
           </div>

           <div 
             style={{ 
               width: '100%', 
               height: '100%', 
               position: 'relative',
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               perspective: '1000px'
             }}
           >
              {CARDS.map((card, index) => {
                 const isFocused = focusedIndex === index;
                 
                 return (
                   <motion.img
                     key={card.src}
                     src={card.src}
                     onDragStart={() => { isDragging.current = true; }}
                     onDragEnd={() => { setTimeout(() => { isDragging.current = false; }, 100); }}
                     onClick={(e) => handleCardClick(index, e)}
                     drag={!isFocused} 
                     dragConstraints={containerRef}
                     dragElastic={0.1}
                     dragMomentum={true}
                     dragTransition={{ power: 0.3, timeConstant: 200 }}
                     initial={{ scale: 0, opacity: 0, y: 100, rotate: 0 }}
                     animate={{ 
                        scale: isFocused ? 1.5 : 0.75, 
                        opacity: (focusedIndex !== null && !isFocused) ? 0.3 : 1, 
                        rotate: isFocused ? 0 : [card.rotation - 2, card.rotation + 2], // Dancing rotation
                        x: isFocused ? 0 : card.x,
                        y: isFocused ? 0 : [card.y - 5, card.y + 5], // Dancing Y-axis
                        zIndex: isFocused ? 1000 : (CARDS.length - index), 
                     }}
                     transition={{ 
                        rotate: {
                           repeat: Infinity,
                           repeatType: "reverse",
                           duration: 3 + index * 0.3, // Different duration for rotation
                           ease: "easeInOut"
                        },
                        y: {
                           repeat: Infinity, 
                           repeatType: "reverse", 
                           duration: 2 + index * 0.2, 
                           ease: "easeInOut"
                        },
                        default: { type: "spring", stiffness: 200, damping: 20 }
                     }}
                     whileHover={{ scale: isFocused ? 1.5 : 0.88, zIndex: 100 }}
                     style={{
                        position: 'absolute',
                        width: '450px',
                        height: 'auto',
                        cursor: isFocused ? 'zoom-out' : 'grab',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                        borderRadius: '12px',
                        // Re-enable mini animations (dancing) if not focused?
                        // complex with current animate prop. Simplest is static scatter + drag.
                        // User asked for "mini animations like dancing". We can add a y-yoyo in animate if not focused.
                     }}
                   />
                 );
              })}
            </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
