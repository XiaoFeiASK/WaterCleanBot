const fs = require('fs');
const vm = require('vm');

function makeEl() {
  const el = {
    _html:'', _text:'', value:'', className:'',
    classList:{add(){},remove(){},contains(){return false;}},
    style:{}, setAttribute(){}, getAttribute(){return 'overview';},
    addEventListener(){}, appendChild(){}, offsetWidth:0,
    querySelector(){return makeEl();}, querySelectorAll(){return [];},
  };
  Object.defineProperty(el,'innerHTML',{get(){return el._html;},set(v){el._html=v;}});
  Object.defineProperty(el,'textContent',{get(){return el._text;},set(v){el._text=v;}});
  return el;
}
const store = {};
const documentStub = {
  getElementById(id){ return store[id] || (store[id]=makeEl()); },
  querySelector(sel){ return makeEl(); },
  querySelectorAll(sel){ return []; },
  createElement(){ return makeEl(); },
  body: makeEl(), head: makeEl(),
};
const ctx = {
  document: documentStub,
  window: {},
  setTimeout: ()=>{}, setInterval: ()=>0, clearInterval: ()=>{},
  Chart: function(){},
  console,
};
ctx.globalThis = ctx;
vm.createContext(ctx);

const dir = 'E:/job/2026-07-10-11-51-01/2026-07-10-11-51-01/assets/js/';
['data.js','map.js','views.js','app.js'].forEach(f=>{
  vm.runInContext(fs.readFileSync(dir+f,'utf8'), ctx, {filename:f});
});

let pass=0, fail=0;
function ok(name, cond){ if(cond){pass++;console.log('PASS',name);} else {fail++;console.log('FAIL',name);} }

ok('初始设备=AC-001', ctx.currentDeviceId==='AC-001' && ctx.getCurrentDevice().name==='清澜一号');

const dv = ctx.views['device-detail']();
ok('详情含 deviceSwitcher', dv.includes('id="deviceSwitcher"'));
ok('详情含 data-tab=map', dv.includes('data-tab="map"'));
ok('详情含全部8个 option', (dv.match(/<option/g)||[]).length===8);
ok('详情当前选中清澜一号', dv.includes('value="AC-001" selected'));

ctx.switchDetailDevice('AC-005');
ok('切换后 currentDeviceId=AC-005', ctx.currentDeviceId==='AC-005');
ok('切换后 getCurrentDevice=清澜五号', ctx.getCurrentDevice().name==='清澜五号');

let navTarget=null;
const origNav = ctx.navigate;
ctx.navigate = function(p, id){ if(p==='device-detail'){ navTarget=id; } };
ctx.searchGlobal('清澜三号');
ok('搜索"清澜三号"→AC-003', navTarget==='AC-003');
navTarget=null; ctx.searchGlobal('AC-007');
ok('搜索"AC-007"→AC-007', navTarget==='AC-007');
navTarget=null; ctx.searchGlobal('二号');
ok('搜索"二号"→AC-002', navTarget==='AC-002');
navTarget=null; ctx.searchGlobal('  清澜一号  ');
ok('搜索" 清澜一号 "→AC-001', navTarget==='AC-001');
navTarget=null; ctx.searchGlobal('不存在的船');
ok('搜索不匹配→null', navTarget===null);
navTarget=null; ctx.searchGlobal('   ');
ok('空查询→null', navTarget===null);
ctx.navigate = origNav;

let err=null; try { ctx.safeDestroyAmap({destroy:()=>{throw new Error('x');}}); } catch(e){ err=e; }
ok('safeDestroyAmap 吞掉异常', err===null);
ok('safeDestroyAmap 返回 null', ctx.safeDestroyAmap({destroy:()=>{}})===null);

console.log('\n=== '+pass+' passed, '+fail+' failed ===');
process.exit(fail?1:0);
