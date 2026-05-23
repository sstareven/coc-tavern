import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  isFlipping: boolean;
}

export function PageFlip({ isFlipping }: Props) {
  return (
    <AnimatePresence>
      {isFlipping && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            pointerEvents: 'none',
            overflow: 'hidden',
            borderRadius: 4,
          }}
        >
          {/* Fade overlay over both pages */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.6, 0.3, 0] }}
            transition={{ duration: 1.2, ease: 'easeInOut', times: [0, 0.15, 0.7, 1] }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--void)',
            }}
          />

          {/* Page curl simulation — a gradient wipe from the right edge */}
          <motion.div
            initial={{ left: '100%' }}
            animate={{ left: '0%' }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '30%',
              background:
                'linear-gradient(to left, var(--parchment-dark) 0%, rgba(212,196,160,0.6) 40%, transparent 100%)',
              boxShadow: '-8px 0 20px rgba(0,0,0,0.25)',
              borderRadius: '0 4px 4px 0',
            }}
          />

          {/* Subtle page fold line */}
          <motion.div
            initial={{ left: '100%' }}
            animate={{ left: '0%' }}
            transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 2,
              background: 'rgba(0,0,0,0.12)',
              borderRadius: 1,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
