// All horizontal travel accepts one destination or one signed displacement.
export function resolveTravel(options, fromX = options.fromX ?? 0, fallbackToX) {
  const hasDistance = options.distance !== undefined;
  const hasTarget = options.toX !== undefined;
  if (hasDistance && hasTarget) throw new Error('Specify distance or toX, not both');
  const toX = hasDistance ? fromX + options.distance : hasTarget ? options.toX : fallbackToX;
  if (!Number.isFinite(fromX) || !Number.isFinite(toX) || (hasDistance && !Number.isFinite(options.distance))) {
    throw new Error('Travel requires a finite start and distance or toX');
  }
  return { fromX, toX, distance: toX - fromX };
}
