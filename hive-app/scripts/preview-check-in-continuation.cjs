// Render the production confirmation component with sample dates; no backend calls.
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),React=require('react'),RN=require('react-native-web');
const {renderToStaticMarkup}=require('react-dom/server');
const output=process.env.HIVE_CONTINUATION_PREVIEW;
if(!output)throw new Error('Set HIVE_CONTINUATION_PREVIEW to an output HTML path.');
const brand={hiveDisplayName:n=>n||'HIVE',hiveAccent:c=>c?.accent_color||'#bd9348',hiveSeal:slug=>`data:image/png;base64,${fs.readFileSync(`public/logos/${slug==='tech'?'tech-hive':slug==='show'?'production-hive':'og-hive'}.png`).toString('base64')}`};
const cache={};
function load(file){if(cache[file])return cache[file];const m={exports:{}};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText)(id=>{
 if(id==='react-native')return RN;
 if(id==='expo-image')return{Image:({source,style})=>React.createElement('img',{src:source,style})};
 if(id.endsWith('hiveBrand'))return brand;
 if(id.startsWith('.'))return load(path.normalize(path.join(path.dirname(file),id))+(/CheckInHiveCard$/.test(id)?'.tsx':'.ts'));
 return require(id);
},m.exports);cache[file]=m.exports;return m.exports;}
const {CheckInNextMeetings}=load('components/surveys/CheckInNextMeetings.tsx');
const community={name:'Tech HIVE',slug:'tech',accent_color:'#011f46'};
const upcoming=[{member:{community:{name:'OG HIVE',slug:'default',accent_color:'#bd9348'}},event:{id:'og',community_id:'og',event_date:'2026-09-09',event_time:'17:00'}},{member:{community:{name:'Production HIVE',slug:'show',accent_color:'#6b4769'}},event:{id:'show',community_id:'show',event_date:'2026-09-10',event_time:'18:00'}}];
const html=renderToStaticMarkup(React.createElement(CheckInNextMeetings,{community,upcoming,onContinue(){},onDone(){},onBrowse(){}}));
const css=RN.StyleSheet.getSheet().textContent;
fs.writeFileSync(output,`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>HIVE continuation layout preview</title><style>${css}body{margin:0;background:#faf8f3;font-family:Arial} [role=button]{cursor:pointer}</style><body><div style="text-align:center;padding:8px;background:#eee5d3;font-size:12px">Layout preview · sample meeting dates · no answers submitted</div>${html}</body></html>`);
console.log(output);
