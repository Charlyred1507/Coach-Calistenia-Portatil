/* CaliReps AI — pistol squat v13.5
 * Separate, self-contained pistol FSM; leaves all other exercise judges alone.
 * Calibration reference 45363.mp4: first repetition cropped, 3 complete.
 * Uses 512px MoveNet multipose for uploaded clips and 384px for live camera.
 * 2D thresholds are approximate and do not certify form.
 */
(()=>{
  if(typeof judgeAdvanced!=='function'||typeof v10RawPoint!=='function'||
    typeof exerciseSelect==='undefined'||typeof angle!=='function')return;
  const $=id=>document.getElementById(id);
  const C={minConf:.11,baselineKnee:140,downKnee:138,departAngle:17,
    topKnee:139,deepKnee:113,deepPerspectiveKnee:125,
    minROM:38,minDrop:.48,freeLift:.10,freeForward:.65,
    maxGap:1550,occlusionGrace:1350,ankleMemory:950,peakWindow:1350,
    baselineLongAge:12000,baselineFreshAge:4200};
  let stand={L:null,R:null},attempt=null,lastMsg='',lastMsgAt=-Infinity,
    lastPistolCredit=-Infinity,
    ankleMemory={L:null,R:null};
  const reset=()=>{stand={L:null,R:null};attempt=null;
    ankleMemory={L:null,R:null};lastMsg='';lastMsgAt=-Infinity;
    lastPistolCredit=-Infinity};
  const raw=(pose,i)=>v10RawPoint(pose,i,C.minConf);
  const fmt=v=>Number.isFinite(v)?Math.round(v)+'°':'sin lectura';
  const leg=(pose,side,now)=>{
    const l=side==='L';
    const hip=raw(pose,l?IDX.leftHip:IDX.rightHip);
    const knee=raw(pose,l?IDX.leftKnee:IDX.rightKnee);
    const seenAnkle=raw(pose,l?IDX.leftAnkle:IDX.rightAnkle);
    if(seenAnkle)ankleMemory[side]={p:seenAnkle,t:now};
    // The support foot stays on the floor. Bridge only a SHORT hidden
    // ankle, never invent a moving knee or hip.
    const memo=ankleMemory[side];
    const footAnchor=attempt?.side===side?attempt.baseline:stand[side];
    const tracked=memo&&footAnchor&&now-memo.t<=C.ankleMemory &&
      distance(memo.p,footAnchor)<Math.max(15,(footAnchor.scale||30)*.8);
    const ankle=seenAnkle||(tracked?memo.p:null);
    if(!hip||!knee||!ankle)return null;
    const thigh=distance(hip,knee),shin=distance(knee,ankle);
    if(!Number.isFinite(thigh)||!Number.isFinite(shin)||thigh<8||shin<8)return null;
    const kneeAngle=angle(hip,knee,ankle);
    if(!Number.isFinite(kneeAngle))return null;
    const fAnkle=raw(pose,l?IDX.rightAnkle:IDX.leftAnkle);
    const fKnee=raw(pose,l?IDX.rightKnee:IDX.leftKnee);
    const scale=Math.max(15,(thigh+shin)/2);
    const freeLift=fAnkle?(ankle.y-fAnkle.y)/scale:null;
    const freeForward=fAnkle?Math.abs(fAnkle.x-ankle.x)/scale:null;
    const depth=(hip.y-knee.y)/thigh;
    // On the last rep the athlete does not pause fully upright; do not
    // discard a usable support-leg baseline at 136–139°.
    const standing=kneeAngle>=136&&depth<=-.15;
    return {side,hip,knee,ankle,fAnkle,fKnee,thigh,shin,scale,kneeAngle,
      depth,freeLift,freeForward,standing,
      inferredAnkle:!seenAnkle,
      conf:Math.min(hip.score,knee.score,ankle.score)};
  };
  function feedback(title,detail,level='info',now=judgeTime()){
    const h=$('ccWhyTitle'),d=$('ccWhyDetail'),msg=$('advLive');
    if(h)h.textContent=title;
    if(d)d.textContent=detail;
    if(msg)msg.textContent=detail;
    if(lastMsg!==title&&now-lastMsgAt>380){
      lastMsg=title;lastMsgAt=now;
      if(level!=='info'||title==='Pistol válida'||
         (title==='Pistol: esperando subida inicial'&&now-lastPistolCredit>900))
        setStatus(detail,level);
      const hist=$('ccWhyHistory');
      if(hist){
        const li=document.createElement('li');
        li.textContent=(typeof inputMode!=='undefined'&&inputMode==='clip'?video.currentTime.toFixed(1)+' s · ':'')+title+' — '+detail;
        hist.prepend(li);
        while(hist.children.length>12)hist.lastElementChild.remove();
      }
    }
  }
  function groundedTop(m){
    // The free extended leg can appear perfectly straight while the
    // athlete is ALREADY sitting at the bottom of a pistol. Never use it
    // as the support-leg standing reference.
    if(!m||m.inferredAnkle||m.kneeAngle<141)return false;
    if((m.ankle.y-m.hip.y)/m.scale<.85)return false;
    if(m.fAnkle && (m.ankle.y-m.fAnkle.y)/m.scale<-.12)return false;
    return m.depth<=-.15;
  }
  function captureBaseline(m,t){
    if(!groundedTop(m))return;
    let b=stand[m.side];
    if(!b||t-b.last>C.baselineLongAge||distance(m.ankle,b)>m.scale*.95){
      // Recalibrate immediately after a switch of supporting foot.
      b={samples:0,at:t,x:m.ankle.x,y:m.ankle.y,
        hipY:m.hip.y,angle:m.kneeAngle,scale:m.scale,last:t};
    }
    if(distance(m.ankle,b)<m.scale*.95){
      b.samples++;
      b.x=b.x*.85+m.ankle.x*.15;
      b.y=b.y*.85+m.ankle.y*.15;
      b.hipY=b.hipY*.84+m.hip.y*.16;
      b.angle=Math.max(b.angle,m.kneeAngle);
      b.scale=b.scale*.85+m.scale*.15;
      b.last=t;
    }
    stand[m.side]=b;
  }
  const unilateral=m=>{
    if(!m)return false;
    if(m.fAnkle){
      const horizontal=(m.freeForward??0)>=C.freeForward;
      const elevated=(m.freeLift??-2)>=C.freeLift;
      const physicallySeparate=horizontal&&m.fAnkle.y<=m.ankle.y+m.scale*.12;
      if(elevated||physicallySeparate)return true;
    }
    // Forward free knee is valid evidence when the ankle is masked by
    // the upright rig. Do NOT accept two feet planted close together.
    return !!(m.fKnee&&m.fKnee.score>=.20 &&
      Math.abs(m.fKnee.x-m.knee.x)>=m.scale*.82 &&
      m.fKnee.y<m.ankle.y-m.scale*.16);
  };
  // Rescue path when MoveNet hides the supporting knee behind the free leg
  // or the vertical pole. A verified pre-existing standing reference is
  // mandatory: this cannot turn a video that starts crouched into a rep.
  function partialSupport(pose,side,now){
    const b=attempt?.side===side?attempt.baseline:stand[side];
    if(!b||b.samples<2||now-b.last>C.baselineLongAge && !attempt)return null;
    const L=side==='L';
    const hip=raw(pose,L?IDX.leftHip:IDX.rightHip);
    const ankleSeen=raw(pose,L?IDX.leftAnkle:IDX.rightAnkle);
    const remembered=ankleMemory[side];
    const ankle=ankleSeen||(remembered&&now-remembered.t<=C.ankleMemory?
      remembered.p:null);
    if(!hip||!ankle)return null;
    const scale=Math.max(18,b.scale);
    if(distance(ankle,b)/scale>.90)return null;
    const freeAnkle=raw(pose,L?IDX.rightAnkle:IDX.leftAnkle);
    const freeKnee=raw(pose,L?IDX.rightKnee:IDX.leftKnee);
    const footFree=!!(freeAnkle&&(
       (ankle.y-freeAnkle.y)/scale>=.12 ||
       Math.abs(ankle.x-freeAnkle.x)/scale>=.8 &&
       freeAnkle.y<=ankle.y+.12*scale
    ))||!!(freeKnee&&freeKnee.score>=.2 &&
       Math.abs(freeKnee.x-ankle.x)/scale>=1.0 &&
       freeKnee.y<ankle.y-scale*.18);
    const drop=(hip.y-b.hipY)/scale;
    const hipNearFoot=(b.y-hip.y)/scale<=1.25;
    return{drop,footFree,hipNearFoot,hip,ankle,
      // Hip descent is measurable even while MoveNet assigns an
      // artificially straight angle to the supporting knee.
      low:footFree&&drop>=.74&&hipNearFoot};
  }
  function selectPartialStart(pose,now){
    const possible=[];
    for(const side of ['L','R']){
      const m=partialSupport(pose,side,now),b=stand[side];
      if(!m||!b||now-b.last>C.baselineFreshAge*2)continue;
      if(m.footFree&&m.drop>=.33){
        possible.push({side,m,b,score:m.drop-(now-b.last)/30000});
      }
    }
    return possible.sort((a,b)=>b.score-a.score)[0]||null;
  }
  function selectStart(candidates,now){
    const possible=[];
    for(const m of candidates){
      const b=stand[m.side];
      if(!b||b.samples<1||now-b.last>C.baselineLongAge)continue;
      const age=now-b.last;
      const drop=(m.hip.y-b.hipY)/Math.max(10,b.scale);
      const bending=b.angle-m.kneeAngle;
      const ankleDrift=distance(m.ankle,b)/Math.max(10,b.scale);
      const free=unilateral(m);
      // For a recent single standing sample, require clear unilateral
      // evidence before departure; for a known support leg, an old but
      // spatially stable baseline can bridge a missed upright frame.
      const hasBaseline=b.samples>=2||age<=C.baselineFreshAge&&free;
      const confidentDeparture=bending>=C.departAngle &&
        m.kneeAngle<=C.downKnee&&drop>=.11;
      const fastDeparture=bending>=25&&m.kneeAngle<=125 &&
        drop>=.26&&free;
      // Observed in 45369.mp4: third rep reaches ~91% normalized hip
      // descent but MoveNet estimates only 16° of knee excursion.
      // Use a distinct high-evidence hip-led entry, NOT looser defaults.
      const hipLedDeparture=free&&b.samples>=2&&
        bending>=6&&drop>=.52&&m.depth>=-.34&&
        (b.y-m.hip.y)/Math.max(10,b.scale)<=1.40;
      const start=!m.inferredAnkle&&hasBaseline&&
        (confidentDeparture||fastDeparture||hipLedDeparture)&&
        ankleDrift<(age>C.baselineFreshAge?.98:1.10) &&
        (age<C.baselineFreshAge||free);
      if(start)possible.push({m,b,drop,bending,
        score:bending*.62+drop*30+(free?16:0)+
          (m.fAnkle?3:0)-ankleDrift*18-(age>C.baselineFreshAge?4:0)});
    }
    return possible.sort((a,b)=>b.score-a.score)[0]||null;
  }
  function judgePistolV13(pose,now=judgeTime()){
    const candidates=['L','R'].map(s=>leg(pose,s,now)).filter(Boolean);
    if(!attempt){
      for(const m of candidates)captureBaseline(m,now);
      const start=selectStart(candidates,now);
      const partialStart=!start?selectPartialStart(pose,now):null;
      if(!start&&!partialStart){
        if(!candidates.length){
          feedback('Pistol: pierna no visible',
            'MoveNet no localiza cadera-rodilla-tobillo de apoyo. Aleja la cámara, muestra los pies y evita oclusiones.',
            'warn',now);
        }else{
          const m=candidates.slice().sort((a,b)=>b.conf-a.conf)[0];
          markVisible();updateMetrics(m.conf,m.kneeAngle,m.freeLift==null?null:m.freeLift*100,'Pierna libre','%');
          const possible=candidates.find(c=>stand[c.side]&&
            now-stand[c.side].last<=C.baselineLongAge);
          const seen=possible&&stand[possible.side];
          const angleDrop=seen?Math.round(seen.angle-possible.kneeAngle):0;
          const hipDrop=seen?((possible.hip.y-seen.hipY)/Math.max(10,seen.scale)):0;
          feedback('Pistol: esperando subida inicial',
            possible
            ?'Apoyo '+(possible.side==='L'?'izquierdo':'derecho')+
              ' · flexión '+angleDrop+'° (meta ≥17°), descenso '+
              Math.round(hipDrop*100)+'% (meta ≥11%). Mantén el pie de apoyo fijo.'
            :'Párate por completo antes de bajar. La primera rep cortada no cuenta; no hace falta elevar antes la pierna libre.',
            'info',now);
        }
        return;
      }
      const m=start?.m,b=start?.b||partialStart.b;
      const side=m?.side||partialStart.side;
      const partial=partialStart?.m;
      const initialDrop=start?.drop??partial.drop;
      attempt={side,started:now,lastValid:now,
        baseline:{...b},minKnee:m?.kneeAngle??b.angle,
        minAt:now,maxDepth:m?.depth??-Infinity,depthAt:now,
        maxDrop:initialDrop,
        unilateral:m?unilateral(m):partial.footFree,
        freeSeen:m?(!!m.fAnkle||unilateral(m)):partial.footFree,
        bottom:false,topAt:null,samples:1,phase:'down',
        trustedBottom:false,inferredFrames:0,goodBottomSamples:0,
        partialLowFrames:0,partialLowAt:null,partialBottom:false};
      feedback('Pistol: bajada detectada',
        'Pierna de apoyo '+(side==='L'?'izquierda':'derecha')+
        (partialStart?' · seguimiento parcial de rodilla.':'')+
        ' Confirma profundidad y extiende la misma pierna.','info',now);
      return;
    }
    const a=attempt;
    if(now<a.lastValid || now-a.lastValid>C.maxGap){
      feedback('Pistol: seguimiento interrumpido',
        'Se perdieron demasiados fotogramas. Retoma la extensión para comenzar otra repetición.','warn',now);
      attempt=null;return;
    }
    const m=candidates.find(c=>c.side===a.side);
    const body=partialSupport(pose,a.side,now);
    if(body&&body.footFree){a.unilateral=true;a.freeSeen=true;}
    if(body?.low){
      if(a.partialLowAt==null)a.partialLowAt=now;
      a.partialLowFrames++;
      a.maxDrop=Math.max(a.maxDrop,body.drop);
      // A verified standing anchor, a fixed grounded foot, substantial
      // hip descent, an elevated free leg, and 2 frames at the bottom.
      if(a.partialLowFrames>=2&&now-a.partialLowAt>=85){
        a.partialBottom=true;a.bottom=true;a.trustedBottom=true;
      }
    }
    if(!m){
      if(body&&body.footFree&&body.drop>=.27)a.lastValid=now;
      if(now-a.lastValid>C.occlusionGrace){
        attempt=null;
        feedback('Pistol: articulaciones ocultas','Reinicia arriba con la pierna de apoyo visible.','warn',now);
      }else feedback('Pistol: recuperación de pose',
        'Rodilla o tobillo temporalmente ocultos; se conserva el intento sin sumar frames.','info',now);
      return;
    }
    // Inferred ankle can bridge only a short occlusion. At least one
    // measured low position and one measured high position remain needed.
    if(m.inferredAnkle)a.inferredFrames++;
    else a.inferredFrames=0;
    a.lastValid=now;a.samples++;
    markVisible();updateMetrics(m.conf,m.kneeAngle,
      m.freeLift==null?null:m.freeLift*100,'Pierna libre','%');
    if(m.kneeAngle<a.minKnee){a.minKnee=m.kneeAngle;a.minAt=now;}
    if(m.depth>a.maxDepth){a.maxDepth=m.depth;a.depthAt=now;}
    const hipDrop=(m.hip.y-a.baseline.hipY)/Math.max(10,a.baseline.scale);
    a.maxDrop=Math.max(a.maxDrop,hipDrop);
    if(unilateral(m))a.unilateral=true;
    if(m.fAnkle||unilateral(m))a.freeSeen=true;
    const supportDrift=distance(m.ankle,a.baseline)/Math.max(10,a.baseline.scale);
    if(supportDrift>1.55){
      attempt=null;
      feedback('Pistol: apoyo perdido','Se movió demasiado el tobillo de apoyo; no se cuenta un cambio de pie.','warn',now);
      return;
    }
    const strongDepth=a.minKnee<=C.deepKnee&&a.maxDepth>=-.13;
    const projectedDepth=a.minKnee<=C.deepPerspectiveKnee&&
      a.maxDepth>=-.06&&a.maxDrop>=.74;
    const temporalPeak=Math.abs(a.minAt-a.depthAt)<=C.peakWindow;
    const fullRom=a.baseline.angle-a.minKnee>=C.minROM;
    if(temporalPeak&&fullRom&&a.maxDrop>=C.minDrop&&
       (strongDepth||projectedDepth)){
      a.goodBottomSamples++;
      if(!m.inferredAnkle || a.goodBottomSamples>=2){
        a.bottom=true;
        if(!m.inferredAnkle)a.trustedBottom=true;
      }
    }
    // At bottom the near pole may mask ankle/foot. Hip must cross the
    // knee, knee must visibly bend, and a single-leg cue must exist.
    // Requiring another confident frame above/below avoids a phantom rep.
    const strongPartialDepth=a.maxDrop>=.78&&a.maxDepth>=-.035 &&
      a.minKnee<=130&&a.baseline.angle-a.minKnee>=40;
    if(strongPartialDepth&&a.unilateral&&
       (a.goodBottomSamples>=2||!m.inferredAnkle&&m.depth>=-.035)){
      a.bottom=true;
      if(!m.inferredAnkle)a.trustedBottom=true;
    }
    const progress=Math.min(100,Math.max(0,Math.min(
      (a.baseline.angle-a.minKnee)/Math.max(20,a.baseline.angle-C.deepKnee)*100,
      (a.maxDrop)/.75*100)));
    setProgress(progress,a.bottom?'Subiendo':'Bajando');
    const returnedHip=m.hip.y<=a.baseline.hipY+Math.max(12,m.scale*.32);
    const returnedKnee=m.kneeAngle>=C.topKnee&&
      m.kneeAngle>=a.baseline.angle-22;
    const strongReturn=returnedHip&&m.kneeAngle>=133&&
      m.kneeAngle>=a.baseline.angle-28&&a.maxDrop>=.65;
    if(a.bottom&&returnedHip&&(returnedKnee||strongReturn)&&
       !m.inferredAnkle){
      if(a.topAt==null)a.topAt=now;
      const clearLockout=m.kneeAngle>=155 &&
        m.hip.y<=a.baseline.hipY+Math.max(10,m.scale*.18);
      if((now-a.topAt>=125||returnedKnee&&a.samples>=7||
          clearLockout&&a.samples>=5)&&now-a.started>=300){
        // Loss of knee keypoints means angular ROM cannot be measured.
      // This fallback needs actual static-foot / free-leg / large hip-drop
      // evidence across >=2 low frames, then a visible upright return.
      const recoveredROM=a.partialBottom&&a.maxDrop>=.74&&
          a.baseline.angle>=140;
        const ok=a.unilateral&&a.freeSeen&&
          (fullRom||recoveredROM)&&a.trustedBottom;
        const limb=a.side==='L'?'izquierda':'derecha';
        attempt=null;
        for(const c of candidates)captureBaseline(c,now);
        if(ok){
          lastPistolCredit=now;
          validRep();
          feedback('Pistol válida',
            'Profundidad y regreso a extensión en pierna '+limb+
            '. Rodilla mínima: '+fmt(a.minKnee)+'.','ok',now);
        }else feedback('Pistol: sin pierna libre',
          'El recorrido se vio, pero no se confirmó el pie libre elevado o extendido. No se acreditó.',
          'warn',now);
        return;
      }
    }else a.topAt=null;
    if(!a.bottom&&now-a.started>=420&&returnedHip&&returnedKnee&&
       a.maxDrop>=.23){
      const fail=a.minKnee>C.deepPerspectiveKnee?
        'Rodilla mínima '+fmt(a.minKnee)+'; flexiona más la pierna de apoyo.':
        a.maxDepth<-.13?'Cadera demasiado alta en la sentadilla.':
        'No se detectó suficiente descenso de cadera y rodilla en el mismo intento.';
      attempt=null;
      feedback('Pistol: profundidad pendiente',fail,'warn',now);
      return;
    }
    if(now-a.started>12500){attempt=null;feedback('Pistol: intento expirado',
      'Duración excesiva. Reinicia arriba antes de un nuevo pistol.','warn',now);return;}
    feedback(a.bottom?'Pistol: subiendo':'Pistol: bajando',
      'Apoyo '+(a.side==='L'?'izquierdo':'derecho')+
      ' · rodilla mínima '+fmt(a.minKnee)+
      ' (objetivo ≤113°), cadera '+(a.maxDepth>=-.13?'a profundidad':'aún alta')+
      ', pie libre '+(a.unilateral?'detectado':'pendiente')+'.','info',now);
  }
  const previous=judgeAdvanced;
  judgeAdvanced=function(pose,now=judgeTime()){
    if(exerciseSelect.value==='pistolsquat')return judgePistolV13(pose,now);
    return previous(pose,now);
  };
  const oldReset=resetJudge;
  resetJudge=function(){reset();return oldReset()};
  const oldLose=loseAttempt;
  loseAttempt=function(){
    if(exerciseSelect.value==='pistolsquat'){
      if(attempt&&judgeTime()-attempt.lastValid>1050)attempt=null;
    }
    return oldLose();
  };
  exerciseSelect.addEventListener('change',reset);
  video.addEventListener('seeking',reset);
  video.addEventListener('loadedmetadata',reset);
  const previousDetector=createJudgeDetector;
  createJudgeDetector=async function(){
    if(exerciseSelect.value!=='pistolsquat')return previousDetector();
    const clip=typeof inputMode!=='undefined'&&inputMode==='clip';
    const model=await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,{
        modelType:poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableSmoothing:true,enableTracking:true,
        trackerType:poseDetection.TrackerType.BoundingBox,
        minPoseScore:.10,multiPoseMaxDimension:clip?512:384
      });
    model.__muscleupResolution=false;
    model.__pistolHighRes=true;
    return model;
  };
  ADVANCED.pistolsquat.guide='Vista lateral con cuerpo y pies completos. Parte desde arriba; baja en una pierna con el pie libre elevado o extendido al frente y vuelve arriba. Se permiten microcortes de cadera/rodilla. La primera rep cortada no cuenta.';
  console.info('[CaliReps AI] Pistol squat v13.5: hip-led start for false knee geometry and strict full-cycle validation.');
})();