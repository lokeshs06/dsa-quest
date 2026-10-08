// The shape on each answer tile (white on the tile's colour)
const PATHS = {
  triangle: 'M12 3 22 20H2Z',
  diamond: 'M12 2 22 12 12 22 2 12Z',
  square: 'M4 4h16v16H4Z',
  pentagon: 'M12 2 22 9.5 18 21H6L2 9.5Z',
  hexagon: 'M7 3h10l5 9-5 9H7l-5-9Z',
};

export function Shape({ shape, className = 'size-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 fill-current ${className}`} aria-hidden>
      {shape === 'circle' ? <circle cx="12" cy="12" r="10" /> : <path d={PATHS[shape]} />}
    </svg>
  );
}
