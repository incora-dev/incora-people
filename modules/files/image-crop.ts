export type SquareCrop = {
  sourceX: number;
  sourceY: number;
  sourceSize: number;
};

export function calculateSquareCrop(
  width: number,
  height: number,
  zoom: number,
  positionX: number,
  positionY: number,
): SquareCrop | null {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;

  const safeZoom = clamp(zoom, 1, 3);
  const sourceSize = Math.min(width, height) / safeZoom;
  const travelX = Math.max(0, (width - sourceSize) / 2);
  const travelY = Math.max(0, (height - sourceSize) / 2);

  return {
    sourceX: (width - sourceSize) / 2 + clamp(positionX, -1, 1) * travelX,
    sourceY: (height - sourceSize) / 2 + clamp(positionY, -1, 1) * travelY,
    sourceSize,
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
