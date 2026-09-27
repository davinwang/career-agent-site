import { useEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  /** transition delay in ms */
  delay?: number;
  className?: string;
  as?: ElementType;
  id?: string;
  /** reveal immediately instead of waiting for the element to scroll into view */
  immediate?: boolean;
}

/**
 * Scroll-triggered entrance. Adds `.is-in` once the element intersects the
 * viewport; nested `.section-head__rule` children then draw their hairline.
 * Falls back to visible content if IntersectionObserver is unavailable.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
  id,
  immediate = false,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (immediate || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.06, rootMargin: '0px 0px -6% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [immediate]);

  return (
    <Tag
      id={id}
      ref={ref as never}
      className={`reveal ${className}`.trim()}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
