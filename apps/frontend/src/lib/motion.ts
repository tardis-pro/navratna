import { Transition } from 'framer-motion';

export const gentle: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 14,
  mass: 1,
};

export const swift: Transition = {
  type: 'spring',
  stiffness: 200,
  damping: 20,
  mass: 0.8,
};

export const settle: Transition = {
  type: 'spring',
  stiffness: 80,
  damping: 12,
  mass: 1.2,
};
