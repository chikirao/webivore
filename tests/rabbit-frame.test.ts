import test from 'node:test';
import assert from 'node:assert/strict';
import {rabbitFrame} from '../src/rabbit-frame';
test('camera on +X sees the profile facing screen-left; front and back stay unchanged',()=>{
  assert.equal(rabbitFrame(Math.PI/2,0,.6).column,6);
  assert.equal(rabbitFrame(-Math.PI/2,0,.6).column,2);
  assert.equal(rabbitFrame(0,0,.6).column,0);
  assert.equal(rabbitFrame(Math.PI,0,.6).column,4);
});
test('heading rotates the atlas relative to camera, including wraparound and elevations',()=>{
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4;
    assert.equal(rabbitFrame(angle,angle,.6).column,0);
    assert.equal(rabbitFrame(angle+Math.PI/2,angle,.6).column,6);
    assert.equal(rabbitFrame(angle-Math.PI/2,angle,.6).column,2);
  }
  assert.deepEqual([.2,.6,1.3].map(e=>rabbitFrame(0,0,e).row),[0,1,2]);
});
