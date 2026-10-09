/** True when the user asked the OS for reduced motion. */
export const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** 'smooth' unless the user asked the OS for reduced motion. Use for every programmatic scroll. */
export const scrollBehavior = (): ScrollBehavior => (reducedMotion() ? 'auto' : 'smooth')
