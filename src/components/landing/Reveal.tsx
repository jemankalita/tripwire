"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const container: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.075, delayChildren: 0.05 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

/** Staggered entrance for the parts of a section: heading, then text, then picture. Runs once. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} variants={container} initial={reduced ? false : "hidden"} whileInView="shown" viewport={{ once: true, amount: 0.15 }}>
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={item} data-reveal>
      {children}
    </motion.div>
  );
}
