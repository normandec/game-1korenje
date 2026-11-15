// Pure mission rules, shared by the game and regression tests.
export const missionFuels = fuels => fuels.filter(f => f.baseIndex === 0);
export const destroyedMissionFuels = fuels => missionFuels(fuels).filter(f => f.dead).length;
export const nextMissionFuel = (fuels, position) => missionFuels(fuels).filter(f => !f.dead)
  .reduce((best, f) => !best || Math.hypot(f.x - position.x, f.z - position.z) < Math.hypot(best.x - position.x, best.z - position.z) ? f : best, null);

export function waveStatus({ dead, inVehicle, raised, distance, alignment }) {
  if (dead) return 'dead';
  if (inVehicle || distance >= 40) return 'location';
  if (!raised) return 'raise';
  if (alignment < Math.cos(Math.PI / 9)) return 'aim';
  return 'active';
}
export const advanceWave = (remaining, dt, status) => status === 'active' ? Math.max(0, remaining - dt) : remaining;
