import { AnimatePresence, motion } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';

export type ExitDirection = 'left' | 'right';

type AnimatedListProps = {
  children: ReactNode;
};

export function AnimatedList({ children }: AnimatedListProps) {
  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">{children}</AnimatePresence>
    </div>
  );
}

type AnimatedListItemProps = {
  id: string;
  children: ReactNode;
  exitDirection?: ExitDirection;
};

export const AnimatedListItem = forwardRef<HTMLDivElement, AnimatedListItemProps>(
  function AnimatedListItem({ id, children, exitDirection = 'right' }, ref) {
    return (
      <motion.div
        ref={ref}
        key={id}
        layout
        initial={{ opacity: 1, x: 0 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{
          opacity: 0,
          x: exitDirection === 'right' ? 300 : -300,
          transition: { duration: 0.2 },
        }}
        transition={{
          layout: { duration: 0.2 },
        }}
      >
        {children}
      </motion.div>
    );
  }
);
