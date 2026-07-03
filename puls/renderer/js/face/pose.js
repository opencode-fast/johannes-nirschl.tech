// Head-pose extraction from the MediaPipe facial transformation matrix.
// The matrix is a 4×4 column-major (OpenGL-style) rigid transform; we pull the
// rotation part and convert to yaw / pitch / roll in degrees. Absolute sign
// convention is not important here — we use these to gate and visualise how much
// the head moved during a measurement (a key confounder for rPPG).

export function matrixToEuler(m) {
  const r = (row, col) => m[col * 4 + row]; // column-major indexing
  const R00 = r(0, 0), R10 = r(1, 0), R20 = r(2, 0);
  const R21 = r(2, 1), R22 = r(2, 2);
  const sy = Math.hypot(R00, R10);
  const D = 180 / Math.PI;
  let pitch, yaw, roll;
  if (sy > 1e-6) {
    pitch = Math.atan2(R21, R22);
    yaw = Math.atan2(-R20, sy);
    roll = Math.atan2(R10, R00);
  } else {
    pitch = Math.atan2(-r(1, 2), r(1, 1));
    yaw = Math.atan2(-R20, sy);
    roll = 0;
  }
  return { pitch: pitch * D, yaw: yaw * D, roll: roll * D };
}
