import { motion } from "motion/react";

const TAGS = { div: motion.div, section: motion.section, article: motion.article, li: motion.li };

/** Fades and lifts its children once, the first time they scroll into view. */
export default function Reveal({ as = "div", delay = 0, children, ...rest }) {
  const Tag = TAGS[as] || motion.div;
  return (
    <Tag
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
