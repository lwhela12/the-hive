// Isolated actual component execution with mocked hooks/network; no live writes.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const jsx=(type,props)=>({type,props});
function harness(file,db){
 let slots=[],i=0,effects=[],pending=[];
 const react={useState(v){const n=i++;if(!(n in slots))slots[n]=v;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef(v){const n=i++;return slots[n]??(slots[n]={current:v});},useCallback:f=>f,useEffect(f,deps){const n=i++;if(!effects[n]||deps.some((d,j)=>d!==effects[n].deps[j]))pending.push(()=>{effects[n]?.clean?.();effects[n]={deps,clean:f()};});}};
 const mocks={react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':Object.fromEntries(['View','Text','Pressable','Switch','ScrollView','ActivityIndicator'].map(x=>[x,x])), '../../lib/supabase':{supabase:db},'../../lib/hiveBrand':{HIVE_GOLD:'#bd9348'}}; mocks['react-native'].Platform={OS:'web'};
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(`${__dirname}/../components/admin/${file}.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module,exports:module.exports,require:id=>mocks[id],console,Set});
 return {render(props){i=0;return module.exports[file](props);},async flush(){const work=pending;pending=[];work.forEach(f=>f());for(let j=0;j<8;j++)await Promise.resolve();}};
}
function nodes(tree){const out=[];function walk(n){if(!n||typeof n!=='object')return;if(Array.isArray(n))return n.forEach(walk);out.push(n);walk(n.props?.children);}walk(tree);return out;}
const text=t=>nodes(t).filter(n=>n.type==='Text').map(n=>JSON.stringify(n.props.children)).join(' ');
(async()=>{
 let calls=[];
 const template={key:'message',name:'Somebody sent you a message',when:'When a message lands',approved:true,revision:'unchanged-hash',html:'<p>Original</p>',subject:'Original subject'};
 const email=harness('EmailTemplatesPanel',{from:()=>({select:()=>Promise.resolve({data:[{id:'tech',name:'Tech HIVE'},{id:'og',name:'OG HIVE'},{id:'prod',name:'Production HIVE'}]})}),functions:{invoke:async(path,opts)=>{calls.push({path,opts});return {data:{templates:[template]}};}}});
 const props={Panel:'Panel'};email.render(props);await email.flush();let tree=email.render(props),panel=nodes(tree).find(n=>n.type==='Panel');
 assert.equal(panel.props.tabs.map(t=>t.label).join('|'),'HIVE-Wide|OG HIVE|Production HIVE|Tech HIVE');
 const row=nodes(tree).find(n=>n.props.testID==='email-approval-row');assert.equal(row.props.style.flexDirection,'row');
 const sw=nodes(row).find(n=>n.type==='Switch');assert.equal(sw.props.trackColor.true,'#bd9348');assert.equal(sw.props.thumbColor,'#F6F4E5');assert.match(sw.props.accessibilityLabel,/Approved/);
 nodes(row).find(n=>n.type==='Pressable').props.onPress();tree=email.render(props);assert.equal(nodes(tree).find(n=>n.props.html)?.props.html,template.html);
 panel.props.onTabChange('tech');email.render(props);await email.flush();assert.equal(calls.at(-1).path,'email-preview?hive=tech');assert.ok(calls.every(c=>c.opts.method==='GET'));
 const source=fs.readFileSync(`${__dirname}/../components/admin/GodModePanels.tsx`,'utf8');
 assert.ok(!source.includes("{ key: 'answers', label: 'Answers' }"));
 assert.ok(!source.includes('CheckInAnswersPanel'));
 assert.equal(fs.existsSync(`${__dirname}/../components/admin/CheckInAnswersPanel.tsx`),false);
 console.log('PASS: actual mocked email component: sorted canonical folder tabs, same-row branded approval, exact preview HTML, GET-only scope changes; Admin has no raw check-in answer archive. No signed-in visual acceptance.');
})().catch(e=>{console.error(e);process.exitCode=1;});
