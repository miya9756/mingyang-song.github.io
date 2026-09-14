// dequant_worker.js
// -----------------
// Off-thread dequant + offset-apply for one GOP of the 4d-relight bundle format.
// Turns the two decoded RGB motion streams into the per-frame absolute
// [x,y,z, qw,qx,qy,qz] array for the dynamic Gaussians. Mirrors
// compression/decoder.py (_expmap_to_quat, _quat_mul, _apply_offset).
//
// Inputs (all transferred, zero-copy):
//   D, F                  dynamic count, motion-frame count
//   baseXyz  f32[D*3]     keyframe dynamic positions
//   baseRot  f32[D*4]     keyframe dynamic quaternions (wxyz, unit)
//   xyzRgb   u8[F*D*3]    png16-upper bytes (R=x_hi, G=y_hi, B=z_hi)
//   rotRgb   u8[F*D*3]    logmap bytes      (R=vx,   G=vy,   B=vz)
//   xMin/xRng/rMin/rRng f32[F*3]  per-frame per-axis dequant min/range

// Hamilton product (wxyz)
const qmul = (aw, ax, ay, az, bw, bx, by, bz) => [
  aw * bw - ax * bx - ay * by - az * bz,
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
];

self.onmessage = (e) => {
  const { id, D, F, baseXyz, baseRot, xyzRgb, rotRgb, xMin, xRng, rMin, rRng } = e.data;
  const motion = new Float32Array(F * D * 7);

  for (let i = 0; i < F; i++) {
    const fo = i * D * 3;
    const xm0 = xMin[i*3], xm1 = xMin[i*3+1], xm2 = xMin[i*3+2];
    const xr0 = xRng[i*3], xr1 = xRng[i*3+1], xr2 = xRng[i*3+2];
    const rm0 = rMin[i*3], rm1 = rMin[i*3+1], rm2 = rMin[i*3+2];
    const rr0 = rRng[i*3], rr1 = rRng[i*3+1], rr2 = rRng[i*3+2];

    for (let p = 0; p < D; p++) {
      const po = fo + p * 3;
      // xyz: upper byte only -> 16-bit value (lower byte 0), normalise by 65535
      const dx = ((xyzRgb[po]   << 8) / 65535) * xr0 + xm0;
      const dy = ((xyzRgb[po+1] << 8) / 65535) * xr1 + xm1;
      const dz = ((xyzRgb[po+2] << 8) / 65535) * xr2 + xm2;

      // rot: log-map vector -> exp-map -> delta quaternion
      const vx = (rotRgb[po]   / 255) * rr0 + rm0;
      const vy = (rotRgb[po+1] / 255) * rr1 + rm1;
      const vz = (rotRgb[po+2] / 255) * rr2 + rm2;
      const theta = Math.hypot(vx, vy, vz);
      const half = theta / 2;
      const dw = Math.cos(half);
      const sinc = theta > 1e-8 ? Math.sin(half) / theta : 0.5;   // sin(θ/2)/θ -> 1/2 as θ→0
      let dqx = sinc * vx, dqy = sinc * vy, dqz = sinc * vz;
      // normalise delta (decoder.py F.normalize before quat_mul)
      let dn = Math.hypot(dw, dqx, dqy, dqz) || 1;
      const ndw = dw / dn; dqx /= dn; dqy /= dn; dqz /= dn;

      const b = p * 4;
      const r = qmul(baseRot[b], baseRot[b+1], baseRot[b+2], baseRot[b+3], ndw, dqx, dqy, dqz);
      const rn = Math.hypot(r[0], r[1], r[2], r[3]) || 1;

      const mo = (i * D + p) * 7, bp = p * 3;
      motion[mo]     = baseXyz[bp]     + dx;
      motion[mo + 1] = baseXyz[bp + 1] + dy;
      motion[mo + 2] = baseXyz[bp + 2] + dz;
      motion[mo + 3] = r[0] / rn;
      motion[mo + 4] = r[1] / rn;
      motion[mo + 5] = r[2] / rn;
      motion[mo + 6] = r[3] / rn;
    }
  }
  self.postMessage({ id, motion }, [motion.buffer]);
};
