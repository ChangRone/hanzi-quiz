(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HanziZhuyinHandwriting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEYS = ['neutral', 'g0', 'g1', 'g2', 't0', 't1', 't2'];
  const LABELS = { neutral:'輕聲', g0:'上', g1:'中', g2:'下', t0:'上調', t1:'中調', t2:'下調' };
  const GRID = 48;

  function maskFromCanvas(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently:true });
    const { width, height } = canvas, img = ctx.getImageData(0, 0, width, height).data;
    const ink = [];
    for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
      if (img[(y*width+x)*4+3] >= 45) ink.push([x,y]);
    }
    if (!ink.length) return [];
    const xs=ink.map(p=>p[0]), ys=ink.map(p=>p[1]);
    const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
    const factor=39/Math.max(1,maxX-minX,maxY-minY);
    const offsetX=(GRID-(maxX-minX)*factor)/2, offsetY=(GRID-(maxY-minY)*factor)/2;
    const pixels=new Set(ink.map(([x,y]) => (Math.round(offsetY+(y-minY)*factor)*GRID+Math.round(offsetX+(x-minX)*factor))));
    return [...pixels].map(key=>[key%GRID,Math.floor(key/GRID)]).filter(([x,y])=>x>=0&&x<GRID&&y>=0&&y<GRID);
  }

  function similarity(a,b,radius=6) {
    if (!a.length||!b.length) return 0;
    const near=(p,points)=>points.some(q=>(p[0]-q[0])**2+(p[1]-q[1])**2<=radius*radius);
    // Both precision and recall must be adequate; a single line must not
    // pass a complex Bopomofo symbol just because it touches one component.
    const precision=a.filter(p=>near(p,b)).length/a.length;
    const recall=b.filter(p=>near(p,a)).length/b.length;
    return Math.min(precision,recall);
  }

  function drawInk(canvas,strokes) {
    const ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.lineWidth=7;
    ctx.lineJoin='round'; ctx.lineCap='round'; ctx.strokeStyle='#172033'; ctx.fillStyle='#172033';
    for(const stroke of strokes) {
      if(!stroke.length) continue;
      if(stroke.length===1) {
        ctx.beginPath();ctx.arc(stroke[0][0],stroke[0][1],3.5,0,2*Math.PI);ctx.fill();continue;
      }
      ctx.beginPath();ctx.moveTo(stroke[0][0],stroke[0][1]);
      for(const [x,y] of stroke.slice(1)) ctx.lineTo(x,y);
      ctx.stroke();
    }
  }

  function expectedGlyphMask(expected, documentRef) {
    const canvas=documentRef.createElement('canvas');
    canvas.width=72;canvas.height=84;
    const ctx=canvas.getContext('2d');
    ctx.font='bold 62px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#000';
    ctx.fillText(expected,36,42);
    return maskFromCanvas(canvas);
  }

  function neutralStats(strokes) {
    const points=strokes.flat();
    if(!points.length) return null;
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    let path=0;
    for(const stroke of strokes) for(let i=1;i<stroke.length;i++) path+=Math.hypot(stroke[i][0]-stroke[i-1][0],stroke[i][1]-stroke[i-1][1]);
    return {strokeCount:strokes.length,pointCount:points.length,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),path};
  }

  function evaluateSlots(expectedSlots, drawing, documentRef, layout) {
    const occupancy={};
    for(const k of KEYS) occupancy[k]=Boolean(drawing[k]&&drawing[k].length);
    const occupancyCheck=layout.validateSlotOccupancy(expectedSlots,occupancy);
    if(!occupancyCheck.ok) return {state:'fail',errorKinds:[...new Set(occupancyCheck.errors.map(e=>e.kind))],details:occupancyCheck.errors};
    const outcomes=[];
    for(const key of KEYS) {
      const expected=expectedSlots[key];
      if(!expected) continue;
      const strokes=drawing[key] || [];
      if(key==='neutral') {
        const check=layout.acceptNeutralGesture(neutralStats(strokes));
        outcomes.push({key,state:check.state,score:check.state==='pass'?1:0});
        continue;
      }
      const ink=documentRef.createElement('canvas');
      ink.width=72;ink.height=84;drawInk(ink,strokes);
      const score=similarity(maskFromCanvas(ink),expectedGlyphMask(expected,documentRef));
      outcomes.push({key,score,state:score>=0.70?'pass':score>=0.42?'uncertain':'fail'});
    }
    if(outcomes.some(x=>x.state==='fail')) return {state:'fail',errorKinds:['wrong_symbol'],details:outcomes};
    if(outcomes.some(x=>x.state==='uncertain')) return {state:'uncertain',errorKinds:['uncertain'],details:outcomes};
    return {state:'pass',errorKinds:[],details:outcomes};
  }

  function mountPilot({target,char,zhuyin,onResult}) {
    const documentRef=target.ownerDocument;
    const layout=root.HanziZhuyinLayout;
    if(!layout) throw new Error('Zhuyin layout core is required');
    const expected=layout.parseZhuyinSlots(zhuyin);
    const drawing=Object.fromEntries(KEYS.map(k=>[k,[]]));
    const panel=documentRef.createElement('section');
    panel.className='zh-pilot-card';
    const title=documentRef.createElement('h3');
    title.textContent='注音手寫實驗（不影響原本國字作答）';
    const subtitle=documentRef.createElement('p');
    subtitle.textContent='請在固定位置手寫「'+char+'」的注音。沒寫的格子要保持空白；辨識不確定時請重寫。';
    const grid=documentRef.createElement('div');grid.className='zh-pilot-grid';
    const result=documentRef.createElement('p');
    result.className='zh-pilot-result';result.setAttribute('aria-live','polite');
    const controls=documentRef.createElement('div');controls.className='zh-pilot-actions';
    let checked=false;
    for(const key of KEYS) {
      const holder=documentRef.createElement('div');
      holder.className='zh-pilot-slot zh-pilot-'+key;
      const label=documentRef.createElement('span');
      label.textContent=LABELS[key];holder.appendChild(label);
      const canvas=documentRef.createElement('canvas');
      canvas.width=72;canvas.height=84;
      canvas.setAttribute('aria-label',LABELS[key]+'注音手寫格');
      canvas.style.touchAction='none';
      holder.appendChild(canvas);grid.appendChild(holder);
      let active=null, pointerId=null;
      function point(event) {
        const rect=canvas.getBoundingClientRect();
        return [(event.clientX-rect.left)*canvas.width/rect.width,(event.clientY-rect.top)*canvas.height/rect.height];
      }
      canvas.addEventListener('pointerdown', event=>{
        if(checked || pointerId!==null) return;
        event.preventDefault();pointerId=event.pointerId;
        try{canvas.setPointerCapture(event.pointerId)}catch{}
        active=[point(event)];drawing[key].push(active);drawInk(canvas,drawing[key]);
      });
      canvas.addEventListener('pointermove', event=>{
        if(event.pointerId!==pointerId||!active)return;
        event.preventDefault();active.push(point(event));drawInk(canvas,drawing[key]);
      });
      canvas.addEventListener('pointerup', event=>{
        if(event.pointerId!==pointerId)return;
        event.preventDefault();
        if(active)active.push(point(event));
        drawInk(canvas,drawing[key]);active=null;pointerId=null;
      });
      canvas.addEventListener('pointercancel', event=>{
        if(event.pointerId!==pointerId)return;
        if(active) drawing[key].pop(); // prevent cancelled touch leaving ghost ink
        active=null;pointerId=null;drawInk(canvas,drawing[key]);
      });
    }
    const checkBtn=documentRef.createElement('button');
    checkBtn.type='button';checkBtn.textContent='檢查注音';
    const clearBtn=documentRef.createElement('button');
    clearBtn.type='button';clearBtn.textContent='清空重寫';
    checkBtn.addEventListener('click',async()=>{
      if(checked)return;
      const verdict=evaluateSlots(expected,drawing,documentRef,layout);
      if(verdict.state==='uncertain') {
        result.textContent='UNCERTAIN：筆跡無法確定，請清空後重寫；這次不計分。';
        return;
      }
      checked=true;checkBtn.disabled=true;
      result.textContent=verdict.state==='pass'?'注音位置與手寫驗證通過。':'注音有缺漏、位置錯誤或筆跡不符。';
      try {if(onResult) await onResult(verdict);}catch(err){result.textContent+=' 學習紀錄儲存失敗。';console.error(err);}
    });
    clearBtn.addEventListener('click',()=>{
      checked=false;checkBtn.disabled=false;result.textContent='';
      for(const key of KEYS) drawing[key]=[];
      grid.querySelectorAll('canvas').forEach(canvas=>drawInk(canvas,[]));
    });
    controls.append(checkBtn,clearBtn);panel.append(title,subtitle,grid,controls,result);target.appendChild(panel);
    return {element:panel,clear:()=>clearBtn.click()};
  }

  return { mountPilot, similarity, evaluateSlots };
});
