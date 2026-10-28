const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');const assert=require('node:assert/strict');
function load(file,requireFn){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:m,exports:m.exports,require:requireFn,Set});return m.exports;}
const nav=load('lib/navigation.ts',()=>({}));const route=load('lib/hiveSwitchRoute.ts',()=>nav);
assert.equal(nav.placeForRoute('/nat-feedback'),'either');assert.equal(route.routeAfterHiveSwitch('/nat-feedback','hive'),null);assert.equal(route.routeAfterHiveSwitch('/nat-feedback','wide'),null);
assert.equal(nav.placeForRoute('/og-party-planning'),'either');assert.equal(route.routeAfterHiveSwitch('/og-party-planning','hive'),null);
console.log('PASS: private feedback and OG planning links survive HIVE switching.');
