import { strict as assert } from 'node:assert';
import { destroyedMissionFuels, nextMissionFuel, waveStatus, advanceWave } from '../story-logic.js';
const fuels = [
  {baseIndex:0,x:0,z:0,dead:true},{baseIndex:0,x:10,z:0,dead:false},{baseIndex:0,x:20,z:0,dead:false},
  {baseIndex:1,x:1,z:0,dead:true},{baseIndex:1,x:2,z:0,dead:true},{baseIndex:1,x:3,z:0,dead:true},
];
assert.equal(destroyedMissionFuels(fuels), 1, 'only eastern tanks count, including before the mission');
assert.equal(nextMissionFuel(fuels,{x:0,z:0}), fuels[1], 'waypoint excludes western and destroyed tanks');
fuels[1].dead = fuels[2].dead = true;
assert.equal(destroyedMissionFuels(fuels),3); assert.equal(nextMissionFuel(fuels,{x:0,z:0}),null);
const state={dead:false,inVehicle:false,raised:true,distance:10,alignment:1};
assert.equal(waveStatus(state),'active'); assert.equal(advanceWave(90,1,waveStatus(state)),89);
for (const [changes,expected] of [[{dead:true},'dead'],[{inVehicle:true},'location'],[{distance:40},'location'],[{raised:false},'raise'],[{alignment:0},'aim']]) {
  const status=waveStatus({...state,...changes}); assert.equal(status,expected); assert.equal(advanceWave(90,1,status),90);
}
assert.equal(advanceWave(.5,1,'active'),0);
console.log('Story rules: all tests passed');
