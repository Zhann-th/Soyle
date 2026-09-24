let WORD_BANK = [
    { word: 'Сәлем',     translit: 'Sálem',      meaning: 'Привет' },
    { word: 'Рақмет',    translit: 'Raqmet',     meaning: 'Спасибо' },
    { word: 'Иә',        translit: 'Iyä',        meaning: 'Да' },
    { word: 'Жоқ',       translit: 'Joq',        meaning: 'Нет' },
    { word: 'Сау бол',   translit: 'Saw bol',    meaning: 'До свидания' },
    { word: 'Кешіріңіз', translit: 'Keshirіŋіz', meaning: 'Простите' },
    { word: 'Жақсы',     translit: 'Jaqsy',      meaning: 'Хорошо' },
    { word: 'Жаман',     translit: 'Jaman',      meaning: 'Плохо' },
    { word: 'Су',        translit: 'Su',         meaning: 'Вода' },
    { word: 'Тамақ',     translit: 'Tamaq',      meaning: 'Еда' },
    { word: 'Үй',        translit: 'Üy',         meaning: 'Дом' },
    { word: 'Досым',     translit: 'Dosym',      meaning: 'Мой друг' },
];
const SAMPLES_NEEDED  = 8;    
let N_MFCC          = 40
var N_FRAMES        = 48;   
const SNIPPET_MS      = 1500; 
const AUGMENT_COPIES  = 3;    
const RETRAIN_TRIGGER = 5;    
const MODEL_KEY       = 'qazai-model';
const META_KEY        = 'qazai-meta';
const AUDIO_DB_NAME   = 'qazai-audio-db';
let AUDIO_STORE     = 'recordings';
let samples        = WORD_BANK.map(() => [])
let currentIdx     = 0;
let model          = null;
let isRecording    = false
let isListening    = false;
let audioCtx       = null;
let lastFeatures   = null;
let lastPredIdx    = null;
let newSamples     = 0;
let audioDB        = null;
let lastSampleRate = 16000;
const micBtn       = document.getElementById('micBtn');
const micIcon      = document.getElementById('micIcon');
const micHint      = document.getElementById('micHint');
const micWave      = document.getElementById('micWave');
let wordStage    = document.getElementById('wordStage');
var samplesStrip = document.getElementById('samplesStrip');
const progFill     = document.getElementById('progFill');
let progFraction = document.getElementById('progFraction');
var trainBtn     = document.getElementById('trainBtn');
const gStatus      = document.getElementById('globalStatus')
const gText        = document.getElementById('gText');
openAudioDB().then(() => {
    renderCard();
    updateProgress()
    tryLoadSaved();
})
function renderCard() {
    var w = WORD_BANK[currentIdx];
    let s = samples[currentIdx]
    wordStage.innerHTML = `
        <div class="ws-feedback ${s.length >= SAMPLES_NEEDED ? 'show ok' : s.length > 0 ? 'show rec' : ''}" id="wsFeedback">
            ${s.length >= SAMPLES_NEEDED ? `✓ Дайын! (${s.length} үлгі)` : s.length > 0 ? `${s.length} үлгі` : ''}
        </div>
        <div class="ws-label">Осы сөзді айтыңыз</div>
        <div class="ws-word">${w.word}</div>
        <div class="ws-transliteration">${w.translit}</div>
        <div class="ws-translation">${w.meaning}</div>
    `;
    samplesStrip.innerHTML = '';
    for (let i = 0; i < SAMPLES_NEEDED; i++) {
        const pip = document.createElement('div');
        pip.className = 's-pip' +
            (i < s.length ? (s.length >= SAMPLES_NEEDED ? ' done' : ' partial') : '') +
            (i === s.length && s.length < SAMPLES_NEEDED ? ' current' : '');
        samplesStrip.appendChild(pip)
    }
    if (s.length >= SAMPLES_NEEDED) {
        micHint.textContent = '✅ Дайын! Келесіге өтіңіз →';
    } else {
        micHint.textContent = `«${w.word}» деп айтып жазыңыз (${SAMPLES_NEEDED - s.length} қалды)`;
    }
}
function updateProgress() {
    const total = WORD_BANK.length * SAMPLES_NEEDED;
    let done  = samples.reduce((acc, s) => acc + Math.min(s.length, SAMPLES_NEEDED), 0);
    const pct   = Math.round((done / total) * 100);
    progFill.style.width = pct + '%';
    progFraction.textContent = `${done} / ${total}`;
    const canTrain = samples.every(s => s.length >= 2);
    trainBtn.disabled = !canTrain
}
function navigate(dir) {
    currentIdx = (currentIdx + dir + WORD_BANK.length) % WORD_BANK.length;
    renderCard();
}
async function onMicClick() {
    if (isRecording) return
    const w = WORD_BANK[currentIdx];
    isRecording = true;
    micBtn.classList.add('recording')
    micIcon.textContent = 'fiber_manual_record';
    micWave.classList.add('pulsing');
    micHint.textContent = `«${w.word}» деп айтыңыз...`;
    setStatus('active', 'Жазып жатыр...')
    try {
        const buffer = await captureAudio(SNIPPET_MS);
        let features = extractFeatures(buffer);
        samples[currentIdx].push(features);
        await saveAudioToDB(currentIdx, w.word, buffer, lastSampleRate);
        const justDone = samples[currentIdx].length === SAMPLES_NEEDED;
        renderCard();
        updateProgress();
        if (justDone && currentIdx < WORD_BANK.length - 1) {
            setTimeout(() => { currentIdx++; renderCard(); }, 800);
        }
        setStatus('', 'Дайын');
    } catch (err) {
        micHint.textContent = 'Қате: ' + err.message;
    }
    micBtn.classList.remove('recording');
    micIcon.textContent = 'mic';
    micWave.classList.remove('pulsing');
    isRecording = false;
}
async function captureAudio(durationMs) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioContext({ sampleRate: 16000 });
    }
    lastSampleRate = audioCtx.sampleRate;
    var src = audioCtx.createMediaStreamSource(stream)
    const bufferSize = Math.ceil(audioCtx.sampleRate * durationMs / 1000)
    return new Promise((resolve) => {
        const proc = audioCtx.createScriptProcessor(4096, 1, 1)
        let collected = new Float32Array(bufferSize), pos = 0;
        proc.onaudioprocess = (e) => {
            const data = e.inputBuffer.getChannelData(0)
            let rem = bufferSize - pos;
            if (rem > 0) {
                collected.set(data.slice(0, Math.min(data.length, rem)), pos);
                pos += Math.min(data.length, rem);
            }
            if (pos >= bufferSize) {
                stream.getTracks().forEach(t => t.stop());
                src.disconnect(); proc.disconnect();
                resolve(collected);
            }
        };
        src.connect(proc);
        proc.connect(audioCtx.destination);
    });
}
function extractFeatures(buffer) {
    const preEmp = new Float32Array(buffer.length);
    preEmp[0] = buffer[0];
    for (let i = 1; i < buffer.length; i++) {
        preEmp[i] = buffer[i] - 0.97 * buffer[i - 1];
    }
    const frameSize = Math.floor(preEmp.length / N_FRAMES);
    const base = new Float32Array(N_FRAMES * N_MFCC)
    for (let f = 0; f < N_FRAMES; f++) {
        var frame = preEmp.slice(f * frameSize, f * frameSize + frameSize)
        const fftSize = Math.pow(2, Math.ceil(Math.log2(Math.max(frame.length, N_MFCC * 4))))
        const real = new Float32Array(fftSize);
        for (let i = 0; i < frame.length && i < fftSize; i++) {
            real[i] = frame[i] * 0.5 * (1 - Math.cos(2 * Math.PI * i / (frame.length - 1)));
        }
        const [re, im] = fft(real);
        const bandW = Math.floor((fftSize / 2) / N_MFCC);
        for (let b = 0; b < N_MFCC; b++) {
            let e = 0;
            for (let k = b * bandW; k < (b + 1) * bandW; k++) {
                e += re[k] * re[k] + im[k] * im[k]
            }
            base[f * N_MFCC + b] = Math.log(e + 1e-9);
        }
    }
    const delta = new Float32Array(N_FRAMES * N_MFCC);
    for (let f = 1; f < N_FRAMES - 1; f++) {
        for (let b = 0; b < N_MFCC; b++) {
            delta[f * N_MFCC + b] = base[(f + 1) * N_MFCC + b] - base[(f - 1) * N_MFCC + b];
        }
    }
    const combined = new Float32Array(N_FRAMES * N_MFCC * 2)
    combined.set(base, 0);
    combined.set(delta, N_FRAMES * N_MFCC);
    let mean = 0;
    for (const v of combined) mean += v;
    mean /= combined.length
    let std = 0;
    for (let v of combined) std += (v - mean) ** 2;
    std = Math.sqrt(std / combined.length) + 1e-9;
    for (let i = 0; i < combined.length; i++) combined[i] = (combined[i] - mean) / std;
    return combined;
}
function augmentSample(feat) {
    const out = new Float32Array(feat.length)
    for (let i = 0; i < feat.length; i++) {
        out[i] = feat[i] + (Math.random() - 0.5) * 0.15;
    }
    return out
}
function fft(re) {
    const n = re.length;
    const im = new Float32Array(n)
    let j = 0;
    for (let i = 1; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1) j ^= bit;
        j ^= bit
        if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
        let ang = -2 * Math.PI / len;
        const wr = Math.cos(ang), wi = Math.sin(ang);
        for (let i = 0; i < n; i += len) {
            let cr = 1, ci = 0;
            for (let k = 0; k < len / 2; k++) {
                const ur = re[i+k], ui = im[i+k];
                let vr = re[i+k+len/2]*cr - im[i+k+len/2]*ci;
                const vi = re[i+k+len/2]*ci + im[i+k+len/2]*cr
                re[i+k] = ur+vr; im[i+k] = ui+vi;
                re[i+k+len/2] = ur-vr; im[i+k+len/2] = ui-vi;
                const tmp = cr*wr - ci*wi; ci = cr*wi + ci*wr; cr = tmp;
            }
        }
    }
    return [re, im];
}
const FEAT_SIZE = N_FRAMES * N_MFCC * 2;  
async function goToTrain() {
    showPhase('phaseTrain')
    markStep(2);
    setStatus('active', 'Оқытып жатыр...');
    const validWords = WORD_BANK.map((w, i) => ({ ...w, idx: i }))
        .filter(w => samples[w.idx].length >= 2);
    let labelCount = validWords.length;
    const allFeatures = [], allLabels = [];
    validWords.forEach((w, labelIdx) => {
        samples[w.idx].forEach(feat => {
            allFeatures.push(Array.from(feat));
            allLabels.push(labelIdx)
            for (let a = 0; a < AUGMENT_COPIES; a++) {
                allFeatures.push(Array.from(augmentSample(feat)));
                allLabels.push(labelIdx)
            }
        });
    });
    document.getElementById('epochLog').textContent =
        `Датасет: ${allFeatures.length} үлгі (augmentation ×${AUGMENT_COPIES + 1})`;
    let xs = tf.tensor2d(allFeatures);
    const ys = tf.oneHot(tf.tensor1d(allLabels, 'int32'), labelCount);
    if (model) model.dispose();
    model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [FEAT_SIZE], units: 256, activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }))
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.4 }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: 0.001 }) }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }))
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ units: labelCount, activation: 'softmax' }));
    model.compile({
        optimizer: tf.train.adam(0.0005),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
    })
    model._wordLabels = validWords.map(w => w.word);
    model._wordIndices = validWords.map(w => w.idx); 
    const EPOCHS = 200;
    const fill = document.getElementById('trainProgFill');
    const pct  = document.getElementById('trainPct')
    var log  = document.getElementById('epochLog')
    await model.fit(xs, ys, {
        epochs: EPOCHS,
        batchSize: 16,
        shuffle: true,
        validationSplit: 0.15,
        callbacks: {
            onEpochEnd: async (epoch, logs) => {
                const p = Math.round(((epoch + 1) / EPOCHS) * 100)
                fill.style.width = p + '%';
                pct.textContent  = p + '%';
                const acc = (logs.acc * 100).toFixed(1)
                const valAcc = logs.val_acc ? ` | val: ${(logs.val_acc * 100).toFixed(1)}%` : '';
                log.textContent = `Epoch ${epoch+1}/${EPOCHS} — acc: ${acc}%${valAcc}`;
                await tf.nextFrame()
            }
        }
    });
    xs.dispose(); ys.dispose();
    newSamples = 0;
    document.getElementById('trainTitle').textContent = '✅ Нейросеть дайын!';
    document.getElementById('trainSubtitle').textContent = 'ИИ сіздің дауысыңызды тану үшін дайын'
    document.getElementById('brainIcon').classList.remove('spin-icon');
    setStatus('ready', 'Дайын!')
    await saveModelToStorage(model._wordLabels, model._wordIndices);
    buildConfBars(model._wordLabels);
    setTimeout(() => {
        showPhase('phaseTest');
        markStep(3);
        showFeedbackUI(false); 
    }, 1200);
}
function buildConfBars(wordLabels) {
    var container = document.getElementById('confBars');
    container.innerHTML = '';
    wordLabels.forEach(w => {
        container.innerHTML += `
            <div class="cbar-row">
                <div class="cbar-label">${w}</div>
                <div class="cbar-track"><div class="cbar-fill" id="cbar-${w}" style="width:0%"></div></div>
                <div class="cbar-pct" id="cpct-${w}">0%</div>
            </div>`
    });
}
async function toggleListen() {
    if (!model) return;
    const btn  = document.getElementById('predMicBtn');
    const icon = document.getElementById('predMicIcon');
    const ring = document.getElementById('predWaveRing')
    if (isListening) {
        isListening = false;
        btn.classList.remove('listening');
        icon.textContent = 'mic';
        ring.classList.remove('active');
        document.getElementById('predConf').textContent = 'Микрофонды басыңыз';
        showFeedbackUI(false);
        return;
    }
    isListening = true
    btn.classList.add('listening');
    icon.textContent = 'stop';
    ring.classList.add('active');
    document.getElementById('predConf').textContent = 'Тыңдап жатыр...';
    showFeedbackUI(false);
    while (isListening) {
        try {
            const buffer = await captureAudio(SNIPPET_MS);
            const features = extractFeatures(buffer)
            const input = tf.tensor2d([Array.from(features)]);
            const probs = model.predict(input);
            const probsData = await probs.data();
            input.dispose(); probs.dispose();
            let bestIdx = 0, bestProb = 0
            probsData.forEach((p, i) => { if (p > bestProb) { bestProb = p; bestIdx = i; } })
            lastFeatures = features;
            lastPredIdx  = bestIdx;
            const predWord = model._wordLabels[bestIdx];
            document.getElementById('predWord').textContent = predWord
            document.getElementById('predConf').textContent = `Сенімділік: ${(bestProb * 100).toFixed(1)}%`;
            const wordEl = document.getElementById('predWord');
            if (bestProb > 0.8) wordEl.style.filter = 'hue-rotate(0deg)'
            else if (bestProb > 0.5) wordEl.style.filter = 'hue-rotate(30deg)'
            else wordEl.style.filter = 'hue-rotate(180deg)';
            probsData.forEach((p, i) => {
                const w = model._wordLabels[i];
                let bar = document.getElementById(`cbar-${w}`)
                const pct = document.getElementById(`cpct-${w}`)
                if (bar) bar.style.width = (p * 100).toFixed(1) + '%'
                if (pct) pct.textContent = (p * 100).toFixed(0) + '%';
            });
            showFeedbackUI(true, predWord);
            isListening = false;
            document.getElementById('predMicBtn').classList.remove('listening');
            document.getElementById('predMicIcon').textContent = 'mic';
            document.getElementById('predWaveRing').classList.remove('active');
        } catch (err) {
            console.error(err);
            isListening = false;
        }
    }
}
function showFeedbackUI(show, predWord = '') {
    let fb = document.getElementById('feedbackUI')
    if (!show) { if (fb) fb.style.display = 'none'; return; }
    if (!fb) {
        fb = document.createElement('div')
        fb.id = 'feedbackUI';
        fb.style.cssText = `
            display:flex; flex-direction:column; align-items:center; gap:12px;
            margin-top:16px; width:100%
        `;
        const correctBtn = document.createElement('button');
        correctBtn.id = 'fbCorrect';
        correctBtn.style.cssText = `
            display:flex; align-items:center; gap:8px
            background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3);
            color:#10b981; border-radius:14px; padding:12px 28px;
            font-family:Outfit,sans-serif; font-size:15px; font-weight:600;
            cursor:pointer; width:100%; justify-content:center; transition:all .2s;
        `;
        correctBtn.innerHTML = `<span class="material-symbols-rounded">check_circle</span> Дұрыс! (Правильно)`;
        correctBtn.onclick = onFeedbackCorrect;
        const wrongBtn = document.createElement('button')
        wrongBtn.id = 'fbWrong'
        wrongBtn.style.cssText = `
            display:flex; align-items:center; gap:8px;
            background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.25);
            color:#ef4444; border-radius:14px; padding:12px 28px;
            font-family:Outfit,sans-serif; font-size:15px; font-weight:600;
            cursor:pointer; width:100%; justify-content:center; transition:all .2s;
        `;
        wrongBtn.innerHTML = `<span class="material-symbols-rounded">close</span> Бұрыс (Неверно) — исправить`;
        wrongBtn.onclick = onFeedbackWrong;
        const retryBtn = document.createElement('button');
        retryBtn.style.cssText = `
            display:flex; align-items:center; gap:8px
            background:transparent; border:1px solid rgba(255,255,255,0.1);
            color:rgba(255,255,255,0.4); border-radius:14px; padding:10px 20px;
            font-family:Outfit,sans-serif; font-size:13px
            cursor:pointer; width:100%; justify-content:center; transition:all .2s;
        `
        retryBtn.innerHTML = `<span class="material-symbols-rounded">refresh</span> Еще раз`;
        retryBtn.onclick = () => { showFeedbackUI(false); toggleListen(); }
        fb.appendChild(correctBtn);
        fb.appendChild(wrongBtn);
        fb.appendChild(retryBtn)
        const wordSel = document.createElement('div')
        wordSel.id = 'wordSelector';
        wordSel.style.cssText = `
            display:none; flex-wrap:wrap; gap:8px; justify-content:center
            padding:10px; background:rgba(0,0,0,0.2); border-radius:14px; width:100%;
        `;
        model._wordLabels.forEach((w, i) => {
            const chip = document.createElement('button');
            chip.style.cssText = `
                background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.25);
                color:#a5b4fc; border-radius:10px; padding:8px 16px
                font-family:Outfit,sans-serif; font-size:14px; font-weight:600
                cursor:pointer; transition:all .2s;
            `;
            chip.textContent = w;
            chip.onclick = () => onCorrectWordSelected(i)
            wordSel.appendChild(chip);
        });
        fb.appendChild(wordSel)
        document.querySelector('.test-card').insertBefore(fb,
            document.getElementById('confBars'));
    }
    fb.style.display = 'flex';
    document.getElementById('wordSelector').style.display = 'none';
}
async function onFeedbackCorrect() {
    if (lastFeatures === null || lastPredIdx === null) return;
    showFeedbackUI(false);
    const wbIdx = model._wordIndices[lastPredIdx];
    samples[wbIdx].push(new Float32Array(lastFeatures));
    newSamples++;
    showToast(`✅ Отлично! Үлгі қосылды (${newSamples}/${RETRAIN_TRIGGER})`);
    if (newSamples >= RETRAIN_TRIGGER) {
        showToast('🔄 Жаңа деректермен қайта оқытып жатыр...');
        await saveMetaOnly()
        await goToTrain();    
    } else {
        await saveMetaOnly();
        setTimeout(() => toggleListen(), 600);
    }
}
function onFeedbackWrong() {
    const sel = document.getElementById('wordSelector');
    if (sel) sel.style.display = 'flex';
}
async function onCorrectWordSelected(labelIdx) {
    if (lastFeatures === null) return;
    showFeedbackUI(false);
    var wbIdx = model._wordIndices[labelIdx];
    samples[wbIdx].push(new Float32Array(lastFeatures))
    newSamples++
    const correctWord = model._wordLabels[labelIdx];
    showToast(`📝 «${correctWord}» деп белгіленді. Дерекқор жаңартылды.`);
    if (newSamples >= RETRAIN_TRIGGER) {
        showToast('🔄 Жаңа деректермен қайта оқытып жатыр...');
        await saveMetaOnly();
        await goToTrain();
    } else {
        await saveMetaOnly()
        setTimeout(() => toggleListen(), 600);
    }
}
async function saveModelToStorage(wordLabels, wordIndices) {
    try {
        await model.save(`localstorage:
        await saveMetaOnly(wordLabels, wordIndices);
        showToast('💾 Модель сақталды! Перезагрузка безопасна.');
    } catch (err) {
        console.error('Save error:', err)
    }
}
async function saveMetaOnly(wordLabels, wordIndices) {
    const labels  = wordLabels  || model._wordLabels;
    const indices = wordIndices || model._wordIndices;
    const samplesJSON = samples.map(ws => ws.map(feat => Array.from(feat)))
    localStorage.setItem(META_KEY, JSON.stringify({
        wordLabels: labels,
        wordIndices: indices,
        samples: samplesJSON,
        timestamp: Date.now()
    }));
}
async function tryLoadSaved() {
    try {
        const metaRaw = localStorage.getItem(META_KEY)
        if (!metaRaw) return;
        const meta = JSON.parse(metaRaw);
        if (!meta.wordLabels || !meta.samples) return;
        samples = meta.samples.map(ws => ws.map(arr => new Float32Array(arr)));
        renderCard()
        updateProgress();
        const loadedModel = await tf.loadLayersModel(`localstorage:
        loadedModel._wordLabels  = meta.wordLabels;
        loadedModel._wordIndices = meta.wordIndices || meta.wordLabels.map((w) =>
            WORD_BANK.findIndex(wb => wb.word === w));
        model = loadedModel;
        buildConfBars(model._wordLabels);
        showPhase('phaseTest')
        markStep(3);
        setStatus('ready', 'Дайын!');
        const totalSamples = samples.reduce((a, s) => a + s.length, 0);
        const d = new Date(meta.timestamp);
        showToast(`📂 Модель жүктелді — ${totalSamples} үлгі (${d.toLocaleDateString('ru')})`);
    } catch (err) {
        console.warn('Could not load saved model:', err);
        clearStorage();
    }
}
function clearStorage() {
    try {
        localStorage.removeItem(META_KEY);
        tf.io.removeModel(`localstorage:
    } catch (e) {}
}
function showPhase(id) {
    ['phaseRecord','phaseTrain','phaseTest','phaseDB'].forEach(p => {
        document.getElementById(p).classList.remove('active');
    });
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.phase-tab').forEach(t => t.classList.remove('active'));
    const map = { phaseRecord:0, phaseTrain:1, phaseTest:2, phaseDB:3 };
    const tabs = document.querySelectorAll('.phase-tab')
    if (tabs[map[id]]) tabs[map[id]].classList.add('active');
}
function markStep(n) {
    ['step1', 'step2', 'step3'].forEach((s, i) => {
        let el = document.getElementById(s);
        el.classList.remove('active', 'done');
        if (i + 1 < n) el.classList.add('done')
        else if (i + 1 === n) el.classList.add('active');
    });
    document.querySelectorAll('.step-line').forEach((l, i) => {
        l.classList.toggle('done', i + 1 < n);
    });
}
function setStatus(cls, text) {
    gStatus.className = 'global-status ' + cls
    gText.textContent = text;
}
function restart() {
    samples = WORD_BANK.map(() => []);
    model = null
    currentIdx = 0;
    isListening = false;
    newSamples = 0
    clearStorage();
    showPhase('phaseRecord')
    markStep(1);
    setStatus('', 'Дайын');
    renderCard();
    updateProgress();
    document.getElementById('predWord').textContent = '—'
    document.getElementById('predConf').textContent = 'Микрофонды басыңыз';
    showFeedbackUI(false);
}
function showToast(message) {
    let toast = document.getElementById('qazToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'qazToast';
        toast.style.cssText = `
            position:fixed; bottom:28px; left:50%; transform:translateX(-50%);
            background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3);
            color:#10b981; padding:12px 22px; border-radius:14px;
            font-family:Outfit,sans-serif; font-size:14px; font-weight:500;
            z-index:9999; backdrop-filter:blur(10px); white-space:nowrap;
        `
        var style = document.createElement('style')
        style.textContent = '@keyframes fadeInToast{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}';
        document.head.appendChild(style);
        document.body.appendChild(toast)
    }
    toast.textContent = message;
    toast.style.display = 'block';
    toast.style.animation = 'none'
    void toast.offsetWidth
    toast.style.animation = 'fadeInToast 0.4s ease'
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}
function openAudioDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(AUDIO_DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(AUDIO_STORE)) {
                const store = db.createObjectStore(AUDIO_STORE, { keyPath: 'id', autoIncrement: true })
                store.createIndex('wordIdx', 'wordIdx', { unique: false });
            }
        };
        req.onsuccess = (e) => { audioDB = e.target.result; resolve(); };
        req.onerror  = (e) => { console.warn('IndexedDB error', e); resolve(); }
    });
}
function saveAudioToDB(wordIdx, wordName, pcmData, sampleRate) {
    if (!audioDB) return Promise.resolve();
    return new Promise((resolve) => {
        const tx = audioDB.transaction(AUDIO_STORE, 'readwrite')
        tx.objectStore(AUDIO_STORE).add({
            wordIdx,
            wordName,
            pcm: Array.from(pcmData),  
            sampleRate,
            timestamp: Date.now()
        });
        tx.oncomplete = resolve
        tx.onerror = resolve;
    });
}
function getAllAudioRecords() {
    if (!audioDB) return Promise.resolve([]);
    return new Promise((resolve) => {
        var tx  = audioDB.transaction(AUDIO_STORE, 'readonly');
        var req = tx.objectStore(AUDIO_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([])
    });
}
function deleteAudioRecord(id) {
    if (!audioDB) return Promise.resolve();
    return new Promise((resolve) => {
        var tx = audioDB.transaction(AUDIO_STORE, 'readwrite');
        tx.objectStore(AUDIO_STORE).delete(id);
        tx.oncomplete = resolve;
    })
}
function clearAllAudioRecords() {
    if (!audioDB) return Promise.resolve();
    return new Promise((resolve) => {
        const tx = audioDB.transaction(AUDIO_STORE, 'readwrite')
        tx.objectStore(AUDIO_STORE).clear();
        tx.oncomplete = resolve;
    });
}
function float32ToWav(pcm, sampleRate) {
    var numChannels = 1;
    var bitsPerSample = 16;
    var blockAlign = numChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    let dataSize = pcm.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    let view = new DataView(buffer);
    var writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }
    writeStr(0, 'RIFF');
    view.setUint32(4,  36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true)
    let offset = 44;
    for (let i = 0; i < pcm.length; i++) {
        const s = Math.max(-1, Math.min(1, pcm[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }
    return new Blob([buffer], { type: 'audio/wav' });
}
async function openDatabase() {
    showPhase('phaseDB');
    await renderDatabase()
}
async function renderDatabase() {
    const records = await getAllAudioRecords();
    let container = document.getElementById('dbContent');
    let subtitle  = document.getElementById('dbSubtitle');
    subtitle.textContent = `${records.length} жазба барлығы`;
    if (records.length === 0) {
        container.innerHTML = `
            <div class="db-empty">
                <span class="material-symbols-rounded">mic_off</span>
                Әлі жазба жоқ. Үйрену қүйіне өтіңіз және сөздерді жазыңыз.
            </div>`
        return;
    }
    const grouped = {};
    records.forEach(r => {
        if (!grouped[r.wordName]) grouped[r.wordName] = [];
        grouped[r.wordName].push(r);
    });
    container.innerHTML = '';
    for (const [wordName, recs] of Object.entries(grouped)) {
        const card = document.createElement('div');
        card.className = 'db-word-card';
        const wbEntry = WORD_BANK.find(w => w.word === wordName);
        const meta = wbEntry ? `${wbEntry.translit} — ${wbEntry.meaning}` : '';
        card.innerHTML = `
            <div class="db-word-header">
                <div>
                    <div class="db-word-name">${wordName}</div>
                    <div class="db-word-meta">${meta}</div>
                </div>
                <div class="db-word-count">
                    <span class="material-symbols-rounded" style="font-size:14px">mic</span>
                    ${recs.length} үлгі
                </div>
            </div>
            <div class="db-recordings" id="recs-${wordName.replace(/\s/g,'_')}"></div>
        `
        container.appendChild(card);
        const recsDiv = card.querySelector('.db-recordings');
        recs.forEach((rec, i) => {
            const wavBlob = float32ToWav(rec.pcm, rec.sampleRate || 16000);
            const url = URL.createObjectURL(wavBlob);
            var d = new Date(rec.timestamp);
            const timeStr = d.toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' });
            const dateStr = d.toLocaleDateString('ru', { day:'2-digit', month:'2-digit' });
            const row = document.createElement('div')
            row.className = 'db-rec-row';
            row.id = `rec-row-${rec.id}`;
            row.innerHTML = `
                <span class="db-rec-num">#${i+1}</span>
                <span class="db-rec-time">${dateStr} ${timeStr}</span>
                <div class="db-rec-player">
                    <audio controls src="${url}"></audio>
                </div>
                <button class="db-rec-delete" onclick="deleteRecording(${rec.id}, '${wordName}')" title="Жою">
                    <span class="material-symbols-rounded">delete</span>
                </button>
            `;
            recsDiv.appendChild(row);
        });
    }
}
async function deleteRecording(id, wordName) {
    await deleteAudioRecord(id);
    const row = document.getElementById(`rec-row-${id}`);
    if (row) {
        row.style.opacity = '0'
        row.style.transition = 'opacity 0.3s';
        setTimeout(() => renderDatabase(), 350);
    }
    showToast(`Жазба жойылды`);
}
async function clearAllAudio() {
    if (!confirm('Барлық аудио жазбаларын жоюғыңыз келе ме?')) return;
    await clearAllAudioRecords();
    renderDatabase();
    showToast('🗑️ Барлық жазбалар жойылды');
}