/**
 * Button label that morphs into an icon on hover/focus: the letters collapse
 * into the centre and the icon's strokes draw in one after another; on leave
 * the icon shrinks away and the letters rise back in. Styles: .morph-btn in
 * App.css (put that class on the button/link).
 */
export function MorphLabel({ text, paths }: { text: string; paths: string[] }) {
  const letters = [...text];
  const center = (letters.length - 1) / 2;
  return (
    <>
      <span className="mb-word" aria-hidden="true">
        {letters.map((letter, index) => (
          <span
            key={index}
            className="mb-letter"
            style={
              {
                "--dx": `${(center - index) * 0.55}em`,
                "--delay": `${Math.abs(index - center) * (110 / letters.length)}ms`,
                "--order": `${index * (180 / letters.length)}ms`,
              } as React.CSSProperties
            }
          >
            {letter === " " ? " " : letter}
          </span>
        ))}
      </span>
      <svg className="mb-icon" viewBox="0 0 24 24" aria-hidden="true">
        {paths.map((d, index) => (
          <path
            key={index}
            className="mb-stroke"
            d={d}
            pathLength={1}
            style={{ "--draw-delay": `${90 + index * 110}ms` } as React.CSSProperties}
          />
        ))}
      </svg>
    </>
  );
}
