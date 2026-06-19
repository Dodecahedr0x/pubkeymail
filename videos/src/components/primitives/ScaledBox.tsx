import React from 'react';

interface ScaledBoxProps {
  /** Natural (unscaled) width of the content in px. */
  width: number;
  /** Natural (unscaled) height of the content in px. */
  height: number;
  /** Scale factor to apply. */
  scale: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Scales its children by `scale` while reserving the correct amount of layout
 * space (width * scale, height * scale).
 *
 * Plain `transform: scale()` does NOT affect layout, so scaled-up content
 * visually bleeds over its neighbours. ScaledBox wraps the scaled content in a
 * box sized to the post-scale dimensions, keeping flex/stack layouts honest.
 */
export const ScaledBox: React.FC<ScaledBoxProps> = ({
  width,
  height,
  scale,
  children,
  style,
}) => (
  <div
    style={{
      width: width * scale,
      height: height * scale,
      position: 'relative',
      flexShrink: 0,
      ...style,
    }}
  >
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width,
        height,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      {children}
    </div>
  </div>
);

/**
 * Largest scale that fits `content` (natural size) inside `avail`, capped at
 * `max`. Use to size mockup groups responsively across aspect ratios.
 */
export const fitScale = (
  contentWidth: number,
  contentHeight: number,
  availWidth: number,
  availHeight: number,
  max = Infinity
): number =>
  Math.min(availWidth / contentWidth, availHeight / contentHeight, max);
