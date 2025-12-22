import { AnimatePresence, motion } from 'framer-motion';
import { type ReactNode } from 'react';

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

export function AnimatedListItem({
  id,
  children,
  exitDirection = 'right',
}: AnimatedListItemProps) {
  return (
    <motion.div
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
