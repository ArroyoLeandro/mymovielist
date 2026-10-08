/** 'smooth' unless the user asked the OS for reduced motion. Use for every programmatic scroll. */
export const scrollBehavior = (): ScrollBehavior =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
