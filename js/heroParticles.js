export function createHeroParticles(THREE, options = {}) {
  const count = options.count ?? 90;
  const spreadX = options.spreadX ?? 13;
  const spreadY = options.spreadY ?? 5.8;
  const depth = options.depth ?? 10;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const base = new Float32Array(count * 3);
  const drift = new Float32Array(count);
  const phase = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const i3 = i * 3;
    const x = (Math.random() - 0.5) * spreadX;
    const y = (Math.random() - 0.5) * spreadY;
    const z = -Math.random() * depth;

    positions[i3] = x;
    positions[i3 + 1] = y;
    positions[i3 + 2] = z;

    base[i3] = x;
    base[i3 + 1] = y;
    base[i3 + 2] = z;

    drift[i] = 0.08 + Math.random() * 0.2;
    phase[i] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: 0x5ef8ff,
    size: 0.048,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geometry, material);
  points.position.y = -0.05;

  const update = (time, intensity = 1) => {
    const amp = 0.08 * intensity;

    for (let i = 0; i < count; i += 1) {
      const i3 = i * 3;
      positions[i3] = base[i3] + Math.sin(time * 0.5 + phase[i]) * amp;
      positions[i3 + 1] = base[i3 + 1] + Math.cos(time * 0.8 + phase[i] * 0.7) * amp;
      positions[i3 + 2] = base[i3 + 2] + Math.sin(time * drift[i] + phase[i]) * 0.22;
    }

    geometry.attributes.position.needsUpdate = true;
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
  };

  return { points, update, dispose };
}
