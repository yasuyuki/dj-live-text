import { fit, reveal } from './layout.js';
const stage = document.querySelector('#stage'), measure = document.querySelector('#measure');
let current = null, revision = -1, renderError = '';
function size() {return {width:innerWidth,height:innerHeight};}
function status(ok = !renderError, error = renderError) {window.host.outputStatus({ok,error,...size()});}
window.host.onPrepare(async ({id,document:doc}) => {
  await document.fonts.ready;
  const result = fit(measure,doc,innerWidth,innerHeight);
  window.host.prepared({id,...result});
});
function render(snapshot, animate) {
  const result = fit(stage,snapshot.document,innerWidth,innerHeight);
  if (!result.ok) {stage.replaceChildren();renderError=result.error;status();return;}
  renderError='';
  reveal(stage, 0);
  reveal(stage, snapshot.visible, animate && !snapshot.live);
  status();
}
window.host.onFrame(({snapshot,sequence,background}) => {
  if (sequence <= revision) return;
  revision = sequence;
  document.body.style.backgroundColor = background;
  if (!snapshot) {current = null;renderError='';stage.replaceChildren();status();return;}
  if (current?.id === snapshot.id) reveal(stage,snapshot.visible,!snapshot.live);
  else render(snapshot,true);
  current = snapshot;
});
addEventListener('resize', () => {if(current)render(current,false);else status();});
window.host.onPing(() => status());
status();
