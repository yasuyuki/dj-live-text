const {contextBridge,ipcRenderer} = require('electron');
const receive = channel => fn => {ipcRenderer.on(channel,(_event,value)=>fn(value));};
contextBridge.exposeInMainWorld('host', {
  load:()=>ipcRenderer.invoke('load'),save:value=>ipcRenderer.invoke('save',value),
  prepare:document=>ipcRenderer.invoke('prepare',document),
  frame:snapshot=>ipcRenderer.send('frame',snapshot),
  configure:value=>ipcRenderer.invoke('configure',value),
  openOutput:()=>ipcRenderer.invoke('open-output'),
  track:()=>ipcRenderer.invoke('track'),
  onStatus:receive('status'),onPrepare:receive('prepare-output'),onFrame:receive('frame-output'),onPing:receive('ping'),
  prepared:value=>ipcRenderer.send('prepared',value),outputStatus:value=>ipcRenderer.send('output-status',value)
});
