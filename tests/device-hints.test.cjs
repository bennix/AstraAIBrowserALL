const {test}=require('node:test'),assert=require('node:assert/strict');
const reduce=require('../src/device-hints.cjs');
test('withholds detailed device hints without inventing a different OS or engine',()=>{
 for(const platform of ['macOS','Windows','Linux','Android']){
  const original={platform,mobile:platform==='Android',brands:[{brand:'Chromium',version:'156'}],fullVersionList:[{brand:'Chromium',version:'156.0.1.2'}],architecture:'arm',bitness:'64',model:'Device',platformVersion:'27.0.0',wow64:true};
  const result=reduce(original);
  for(const key of ['platformVersion','architecture','bitness','model'])assert.equal(result[key],'');
  for(const key of ['platform','mobile','brands','fullVersionList'])assert.deepEqual(result[key],original[key]);
  assert.equal(original.architecture,'arm');
 }
});
