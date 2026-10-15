(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HanziZhuyinHandwriting = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const KEYS = ['neutral', 'g0', 'g1', 'g2', 't0', 't1', 't2'];
  const LABELS = { neutral:'輕聲點', g0:'上格', g1:'中格', g2:'下格', tone:'聲調' };
  const GRID = 48;
  // Locked to the user-approved template; visible tone stays next to the middle box.
  const COMPACT_LAYOUT = Object.freeze({neutral:[169,43],g0:[172,163],g1:[170,245],g2:[168,327],tone:[255,245],toneLabel:[346,251]});
  const LAYOUT_SIZE = Object.freeze({width:625,height:510});

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
        ctx.beginPath();ctx.arc(stroke[0][0],stroke[0][1],4.2,0,2*Math.PI);ctx.fill();continue;
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
    const occupancy = {};
    for (const k of KEYS) occupancy[k] = Boolean(drawing[k] && drawing[k].length);
    const occupancyCheck = layout.validateSlotOccupancy(expectedSlots, occupancy);
    const required = KEYS.filter(k => expectedSlots[k]);
    const observed = KEYS.filter(k => occupancy[k]);
    const maskCache = new Map(), glyphCache = new Map();

    function match(key, symbol) {
      if (symbol === '˙') {
        const result = layout.acceptNeutralGesture(neutralStats(drawing[key] || []));
        return { score: result.state === 'pass' ? 1 : result.state === 'uncertain' ? 0.55 : 0,
          state: result.state };
      }
      if (!maskCache.has(key)) {
        const ink = documentRef.createElement('canvas');
        ink.width = 72; ink.height = 84; drawInk(ink, drawing[key] || []);
        maskCache.set(key, maskFromCanvas(ink));
      }
      if (!glyphCache.has(symbol)) glyphCache.set(symbol, expectedGlyphMask(symbol, documentRef));
      const score = similarity(maskCache.get(key), glyphCache.get(symbol));
      return { score, state: score >= 0.70 ? 'pass' : score >= 0.42 ? 'uncertain' : 'fail' };
    }

    if (occupancyCheck.ok) {
      const details = required.map(key => ({ key, ...match(key, expectedSlots[key]) }));
      if (details.some(x => x.state === 'fail')) {
        return { state: 'fail', symbolCorrect: false, positionCorrect: true,
          errorKinds: ['wrong_symbol'], details };
      }
      if (details.some(x => x.state === 'uncertain')) {
        return { state: 'uncertain', symbolCorrect: null, positionCorrect: true,
          errorKinds: ['uncertain'], details };
      }
      return { state: 'pass', symbolCorrect: true, positionCorrect: true,
        errorKinds: [], details };
    }

    // A misplaced but correctly drawn symbol is a placement lesson, NOT
    // evidence of wrong pronunciation. Each observed glyph may be matched
    // to exactly one expected glyph regardless of which slot received it.
    if (required.length && observed.length === required.length) {
      function canMatch(threshold, index, used) {
        if (index === required.length) return true;
        const target = required[index];
        for (const key of observed) {
          if (used.has(key) || match(key, expectedSlots[target]).score < threshold) continue;
          used.add(key);
          if (canMatch(threshold, index + 1, used)) return true;
          used.delete(key);
        }
        return false;
      }
      if (canMatch(0.70, 0, new Set())) {
        return { state: 'position_only', symbolCorrect: true, positionCorrect: false,
          errorKinds: ['wrong_slot'], details: occupancyCheck.errors };
      }
      // Avoid treating uncertain OCR as a definite pronunciation error.
      return { state: 'uncertain', symbolCorrect: null, positionCorrect: false,
        errorKinds: ['wrong_slot', 'uncertain'], details: occupancyCheck.errors };
    }

    return { state: 'fail', symbolCorrect: null, positionCorrect: false,
      errorKinds: [...new Set(occupancyCheck.errors.map(x => x.kind))],
      details: occupancyCheck.errors };
  }

  function mountPilot({ target, char, zhuyin, onResult, onCapture = null }) {
    const documentRef = target.ownerDocument;
    const layout = root.HanziZhuyinLayout;
    if (!layout) throw new Error('Zhuyin layout core is required');
    const expected = layout.parseZhuyinSlots(zhuyin);
    const toneKey = layout.toneAnchorSlot(expected);
    const drawing = Object.fromEntries(KEYS.map(k => [k, []]));
    // QA-only provenance: do not infer real touch from a manually selected
    // label or a script-dispatched (untrusted) PointerEvent.
    const qaDevice = {
      pointerTypes: new Set(), trustedPointerTypes: new Set(),
      pointerDownCount: 0, trustedTouchStarts: 0, pointerCancelCount: 0
    };
    const panel = documentRef.createElement('section');
    panel.className = 'zh-pilot-card';
    const title = documentRef.createElement('h3');
    title.textContent = '注音手寫練習（位置錯誤分開提醒）';
    const subtitle = documentRef.createElement('p');
    subtitle.textContent = '請在格子裡寫「' + char + '」的注音。只寫錯位置不直接算讀音錯誤。';
    // No teaching paragraphs beside the three main writing boxes.
    // The approved layout reserves a single explanatory note beside the tone.
    const exampleButton = documentRef.createElement('button');
    exampleButton.type = 'button'; exampleButton.className = 'zh-pilot-example-btn';
    exampleButton.textContent = '看位置範例';
    exampleButton.setAttribute('aria-expanded', 'false');
    const samples = documentRef.createElement('div');
    samples.className = 'zh-pilot-examples';
    samples.hidden = true;
    const examples = [
      ['1 個符號：語 ㄩˇ', '空', 'ㄩ', '空', 'ˇ 寫在ㄩ右上角'],
      ['2 個符號：貓 ㄇㄠ', 'ㄇ', '空', 'ㄠ', '一聲不標'],
      ['3 個符號：巷 ㄒㄧㄤˋ', 'ㄒ', 'ㄧ', 'ㄤ', 'ˋ 寫在ㄤ右上角'],
      ['輕聲：叔 ㄕㄨ˙', 'ㄕ', '空', 'ㄨ', '˙ 寫在整組最上方']
    ];
    for (const [heading, upper, middle, lower, tone] of examples) {
      const card = documentRef.createElement('div');
      card.className = 'zh-pilot-sample';
      const head = documentRef.createElement('strong'); head.textContent = heading;
      const desc = documentRef.createElement('span');
      desc.textContent = '上：' + upper + '　中：' + middle + '　下：' + lower + '　｜ ' + tone;
      card.append(head, desc); samples.appendChild(card);
    }
    exampleButton.addEventListener('click', () => {
      samples.hidden = !samples.hidden;
      exampleButton.textContent = samples.hidden ? '看位置範例' : '收起位置範例';
      exampleButton.setAttribute('aria-expanded', String(!samples.hidden));
    });

    const viewport = documentRef.createElement('div');
    viewport.className = 'zh-pilot-layout-viewport';
    const grid = documentRef.createElement('div');
    grid.className = 'zh-pilot-grid';
    grid.setAttribute('data-layout-version', 'compact-v2');
    // The lesson's spoken answer is not exposed in the permanent grid labels.
    const note = documentRef.createElement('div');
    note.className = 'zh-pilot-tone-note';
    note.textContent = '聲調：練習時固定寫在中格旁；正式直式注音要標在最後一個符號右上角，一聲不標。';
    note.style.left = COMPACT_LAYOUT.toneLabel[0] + 'px';
    note.style.top = COMPACT_LAYOUT.toneLabel[1] + 'px';
    grid.appendChild(note);
    const result = documentRef.createElement('p'); result.className = 'zh-pilot-result';
    result.setAttribute('aria-live', 'polite');
    const controls = documentRef.createElement('div'); controls.className = 'zh-pilot-actions';
    let checked = false;
    // Show only ONE tone-writing box, anchored to the last phonetic glyph.
    // t0/t1/t2 remain internal layout coordinates, not three student choices.
    for (const [visualKey, key] of [
      ['neutral', 'neutral'], ['g0', 'g0'], ['g1', 'g1'], ['g2', 'g2'], ['tone', toneKey]
    ]) {
      const holder = documentRef.createElement('div');
      holder.className = 'zh-pilot-slot zh-pilot-' + visualKey;
      if (visualKey === 'tone') holder.classList.add('zh-pilot-tone-middle');
      const pos = COMPACT_LAYOUT[visualKey];
      holder.style.left = pos[0] + 'px';
      holder.style.top = pos[1] + 'px';
      const label = documentRef.createElement('span');
      label.textContent = LABELS[visualKey];
      holder.appendChild(label);
      const canvas = documentRef.createElement('canvas');
      canvas.width = 72; canvas.height = 84;
      canvas.setAttribute('aria-label', LABELS[visualKey] + '注音手寫格');
      canvas.style.touchAction = 'none';
      holder.appendChild(canvas); grid.appendChild(holder);
      let active = null, pointerId = null;
      function point(event) {
        const rect = canvas.getBoundingClientRect();
        return [(event.clientX - rect.left) * canvas.width / rect.width,
          (event.clientY - rect.top) * canvas.height / rect.height];
      }
      canvas.addEventListener('pointerdown', event => {
        if (checked || pointerId !== null) return;
        if (typeof onCapture === 'function') {
          const input = String(event.pointerType || 'unknown');
          qaDevice.pointerTypes.add(input);
          qaDevice.pointerDownCount++;
          if (event.isTrusted) {
            qaDevice.trustedPointerTypes.add(input);
            if (input === 'touch' || input === 'pen') qaDevice.trustedTouchStarts++;
          }
        }
        event.preventDefault(); pointerId = event.pointerId;
        try { canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        active = [point(event)]; drawing[key].push(active); drawInk(canvas, drawing[key]);
      });
      canvas.addEventListener('pointermove', event => {
        if (event.pointerId !== pointerId || !active) return;
        event.preventDefault(); active.push(point(event)); drawInk(canvas, drawing[key]);
      });
      canvas.addEventListener('pointerup', event => {
        if (event.pointerId !== pointerId) return;
        event.preventDefault();
        if (active) {
          const next = point(event);
          const first = active[0];
          if (visualKey === 'neutral' && active.length <= 3 &&
              Math.hypot(next[0]-first[0],next[1]-first[1]) < 8) {
            // A short tap is a legitimate neutral-tone dot, even with
            // no pointermove. Store one point and keep it visibly painted.
            drawing[key][drawing[key].length-1] = [first];
          } else {
            active.push(next);
          }
        }
        drawInk(canvas, drawing[key]); active = null; pointerId = null;
      });
      canvas.addEventListener('pointercancel', event => {
        if (event.pointerId !== pointerId) return;
        if (typeof onCapture === 'function') qaDevice.pointerCancelCount++;
        if (active) drawing[key].pop();
        active = null; pointerId = null; drawInk(canvas, drawing[key]);
      });
    }
    const checkBtn = documentRef.createElement('button');
    checkBtn.type = 'button'; checkBtn.textContent = '檢查注音';
    const clearBtn = documentRef.createElement('button');
    clearBtn.type = 'button'; clearBtn.textContent = '清空重寫';
    checkBtn.addEventListener('click', async () => {
      if (checked) return;
      const verdict = evaluateSlots(expected, drawing, documentRef, layout);
      // Only the standalone QA can opt in to receiving raw strokes. Quiz never passes onCapture.
      if (typeof onCapture === 'function') {
        const captured = JSON.parse(JSON.stringify(drawing));
        const dotCanvas = grid.querySelector('.zh-pilot-neutral canvas');
        let neutralInkPixels = 0;
        if (dotCanvas) {
          const pixels = dotCanvas.getContext('2d', { willReadFrequently:true })
            .getImageData(0, 0, dotCanvas.width, dotCanvas.height).data;
          for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] >= 45) neutralInkPixels++;
          }
        }
        try {
          onCapture({
            char, zhuyin, drawing: captured, neutralInkPixels, verdict: { ...verdict },
            inputEvidence: {
              pointerTypes: [...qaDevice.pointerTypes].sort(),
              trustedPointerTypes: [...qaDevice.trustedPointerTypes].sort(),
              pointerDownCount: qaDevice.pointerDownCount,
              trustedTouchStarts: qaDevice.trustedTouchStarts,
              pointerCancelCount: qaDevice.pointerCancelCount
            }
          });
        }
        catch (captureError) { console.warn('QA capture error:', captureError); }
      }
      if (verdict.state === 'uncertain') {
        result.textContent = verdict.positionCorrect === false
          ? '位置需要調整，筆跡尚無法確認；不計分，請看範例後重寫。'
          : 'UNCERTAIN：筆跡尚無法確認，不計分，請重寫。';
        if (onResult) await onResult(verdict);
        return;
      }
      if (verdict.state === 'position_only') {
        result.textContent = '符號辨識符合，但位置需要調整；不算讀音錯誤，請看範例後重寫。';
        if (onResult) await onResult(verdict);
        return;
      }
      checked = true; checkBtn.disabled = true;
      result.textContent = verdict.state === 'pass'
        ? '注音符號及位置皆通過。'
        : verdict.positionCorrect ? '位置正確，但符號形狀或聲調仍需檢查。'
          : '注音有缺漏或多寫，請檢查格子。';
      try { if (onResult) await onResult(verdict); }
      catch (err) { result.textContent += ' 學習紀錄儲存失敗。'; console.error(err); }
    });
    clearBtn.addEventListener('click', () => {
      checked = false; checkBtn.disabled = false; result.textContent = '';
      for (const key of KEYS) drawing[key] = [];
      qaDevice.pointerTypes.clear(); qaDevice.trustedPointerTypes.clear();
      qaDevice.pointerDownCount = 0; qaDevice.trustedTouchStarts = 0;
      qaDevice.pointerCancelCount = 0;
      grid.querySelectorAll('canvas').forEach(canvas => drawInk(canvas, []));
    });
    controls.append(checkBtn, clearBtn);
    viewport.appendChild(grid);
    panel.append(title, subtitle, exampleButton, samples, viewport, controls, result);
    target.appendChild(panel);
    function fitCompactLayout() {
      const available = viewport.clientWidth || viewport.parentElement?.clientWidth || LAYOUT_SIZE.width;
      const zoom = Math.min(1, Math.max(0.35, available / LAYOUT_SIZE.width));
      grid.style.transform = 'scale(' + zoom + ')';
      viewport.style.height = Math.ceil(LAYOUT_SIZE.height * zoom) + 'px';
    }
    fitCompactLayout();
    // The viewport is fully responsive; detach the observer when the Quiz
    // disposes the previous question panel.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (!panel.isConnected) { observer.disconnect(); return; }
        fitCompactLayout();
      });
      observer.observe(viewport);
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fitCompactLayout);
    return { element: panel, clear: () => clearBtn.click() };
  }

  return { mountPilot, similarity, evaluateSlots, COMPACT_LAYOUT };
});
