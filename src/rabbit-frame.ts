/** Atlas turns the subject clockwise; camera azimuth turns the observer instead. */
export function rabbitFrame(cameraAzimuth: number, heading: number, elevation: number) {
  const relative = heading - cameraAzimuth;
  return {
    column: ((Math.round(relative / (Math.PI / 4)) % 8) + 8) % 8,
    row: elevation > 1.03 ? 2 : elevation > 0.35 ? 1 : 0,
  };
}
