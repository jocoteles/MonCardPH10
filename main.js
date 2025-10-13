// main.js - Versão Corrigida e Estabilizada

document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM --- (Sem alterações)
    const views = { conexao: document.getElementById('view-conexao'), aquisicao: document.getElementById('view-aquisicao'), config: document.getElementById('view-config'), };
    const menuButtons = { conexao: document.getElementById('btn-conexao'), aquisicao: document.getElementById('btn-aquisicao'), config: document.getElementById('btn-config'), };
    const statusConexao = document.getElementById('status-conexao');
    const btnConectar = document.getElementById('btn-conectar');
    const modoEcgView = document.getElementById('modo-ecg');
    const modoHrppiView = document.getElementById('modo-hrppi');
    const hrValueEl = document.getElementById('hr-value');
    const ppiValueEl = document.getElementById('ppi-value');
    const ppiErrorValueEl = document.getElementById('ppi-error-value');
    const ppiFlagsValueEl = document.getElementById('ppi-flags-value');
    const bpmDisplayEl = document.getElementById('bpm-display');
    const radioModo = document.querySelectorAll('input[name="modo"]');
    const configEcgDiv = document.getElementById('config-ecg');
    const configHrppiDiv = document.getElementById('config-hrppi');
    const sliderLargura = document.getElementById('slider-largura');
    const larguraLabel = document.getElementById('largura-label');
    const sliderLinhas = document.getElementById('slider-linhas');
    const linhasLabel = document.getElementById('linhas-label');
    const sliderUv = document.getElementById('slider-uv');
    const uvLabel = document.getElementById('uv-label');
    const sliderBpmAvg = document.getElementById('slider-bpm-avg');
    const bpmAvgLabel = document.getElementById('bpm-avg-label');
    const btnAutoRecord = document.getElementById('btn-auto-record');
    const chkSaveEcg = document.getElementById('chk-save-ecg'); // NOVO
    const chkSaveBpm = document.getElementById('chk-save-bpm');
    const canvas = document.getElementById('ecg-canvas');
    const ctx = canvas.getContext('2d');
    const disclaimerOverlay = document.getElementById('disclaimer-overlay');
    const btnAgree = document.getElementById('btn-agree');
    const btnDisagree = document.getElementById('btn-disagree');
    const batteryStatusValueEl = document.getElementById('battery-status-value');
    const btnSaveEcg = document.getElementById('btn-save-ecg');
    const btnSavePng = document.getElementById('btn-save-png');
    const btnLoadEcg = document.getElementById('btn-load-ecg');
    const btnShowLastEcg = document.getElementById('btn-show-last-ecg');
    const btnShowLiveEcg = document.getElementById('btn-show-live-ecg');
    const fileInputEcg = document.getElementById('file-input-ecg');

    // --- CONSTANTES BLUETOOTH --- (Sem alterações)
    const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_DATA_MTU_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";
    const HR_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
    const HR_CHARACTERISTIC_UUID = "00002a37-0000-1000-8000-00805f9b34fb";
    const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
    const BATTERY_CHARACTERISTIC_UUID = "00002a19-0000-1000-8000-00805f9b34fb";

    // --- ESTADO DA APLICAÇÃO --- (Adicionado scanBuffer)
    let polarDevice = null;
    let pmdControlPoint = null;
    let pmdData = null;
    let hrCharacteristic = null;
    let batteryUpdateInterval = null; 
    let bpmUpdateInterval = null;
    let appState = {
        modo: 'ecg',
        streamAtivo: false,
        displayMode: 'live',
        autoRecord: {
            active: false,
            directoryHandle: null,
            bpmFileHandle: null,
            bpmLogInterval: null,
            lastSaveTimestamp: 0,
            saveEcg: true,
            saveBpm: true,
        },
        config: {
            ecg: {
                larguraTemporal: 10,
                numLinhas: 5,
                bpmAveragePeriod: 5,
            }
        },
        ecg: {
            buffer: [],
            rollingBuffer: [], 
            scanBuffer: [],
            loadedData: null, 
            recentRRIntervals: [],
            lastFullEcg: {
                samples: [],
                timestamp: null
            },
            startTimestamp: null,
            sampleRate: 130,
            desenhando: false,
            currentX: 0,
            currentLine: 0,
            lastY: null,
            uV_per_div: 1000,
            needsReset: true,
        }
    };
    
    // --- LÓGICA DE NAVEGAÇÃO --- (Sem alterações)
    function changeView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        Object.values(menuButtons).forEach(b => b.classList.remove('active'));
        views[viewName].classList.add('active');
        menuButtons[viewName].classList.add('active');
        if (viewName === 'aquisicao') {
            resizeCanvas();
        }
    }
    Object.keys(menuButtons).forEach(key => {
        menuButtons[key].addEventListener('click', () => changeView(key));
    });

    // --- LÓGICA DE CONEXÃO BLUETOOTH --- (Sem alterações)
    btnConectar.addEventListener('click', async () => {
        try {
            statusConexao.textContent = 'Procurando dispositivo...';
            polarDevice = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'Polar H10' }], optionalServices: [PMD_SERVICE_UUID, HR_SERVICE_UUID, BATTERY_SERVICE_UUID] });
            statusConexao.textContent = `Conectando a ${polarDevice.name}...`;
            const server = await polarDevice.gatt.connect();
            statusConexao.textContent = 'Obtendo serviços e características...';
            const pmdService = await server.getPrimaryService(PMD_SERVICE_UUID);
            pmdControlPoint = await pmdService.getCharacteristic(PMD_CONTROL_POINT_UUID);
            pmdData = await pmdService.getCharacteristic(PMD_DATA_MTU_UUID);
            const hrService = await server.getPrimaryService(HR_SERVICE_UUID);
            hrCharacteristic = await hrService.getCharacteristic(HR_CHARACTERISTIC_UUID);
            statusConexao.textContent = `Conectado a ${polarDevice.name}`;
            btnConectar.textContent = 'Conectado';
            btnConectar.disabled = true;
            polarDevice.addEventListener('gattserverdisconnected', onDisconnect);
        } catch (error) {
            if (error.name === 'NotFoundError') {
                statusConexao.textContent = 'Busca cancelada. Clique para tentar novamente.';
            } else {
                console.error('Erro na conexão Bluetooth:', error);
                statusConexao.textContent = `Erro: ${error.message}`;
            }
        }
    });

    function onDisconnect() {
        statusConexao.textContent = 'Dispositivo desconectado.';
        batteryStatusValueEl.textContent = 'Desconectado'; 
        btnConectar.textContent = 'Conectar ao Dispositivo';
        btnConectar.disabled = false;
        polarDevice = null; pmdControlPoint = null; pmdData = null; hrCharacteristic = null;
        if(batteryUpdateInterval) clearInterval(batteryUpdateInterval);
        if(bpmUpdateInterval) clearInterval(bpmUpdateInterval);
        stopStream();
    }
    
    // --- LÓGICA DE CONTROLE DE STREAM ---
    async function startStream() {
        if (!polarDevice || !polarDevice.gatt.connected || appState.streamAtivo) return;
        try {
            appState.streamAtivo = true;
            appState.displayMode = 'live';
            if (appState.modo === 'ecg') {
                console.log("▶️ Iniciando stream ECG...");
                appState.ecg.buffer = [];
                appState.ecg.rollingBuffer = [];
                appState.ecg.scanBuffer = [];
                appState.ecg.recentRRIntervals = [];
                appState.ecg.lastFullEcg = { samples: [], timestamp: null };
                appState.ecg.startTimestamp = new Date();
                await pmdData.startNotifications();
                pmdData.addEventListener('characteristicvaluechanged', handleEcgData);
                const startEcgCommand = new Uint8Array([0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0E, 0x00]);
                await pmdControlPoint.writeValue(startEcgCommand);
                appState.ecg.needsReset = true;
                if (!appState.ecg.desenhando) requestAnimationFrame(drawLoop);
                if (bpmUpdateInterval) clearInterval(bpmUpdateInterval);
                bpmUpdateInterval = setInterval(() => {
                    const requiredSamples = appState.config.ecg.bpmAveragePeriod > 0 ? appState.ecg.sampleRate * appState.config.ecg.bpmAveragePeriod : appState.ecg.sampleRate * 2;
                    if (appState.ecg.rollingBuffer.length > requiredSamples) {
                        const bpm = calculateBpmFromEcg([...appState.ecg.rollingBuffer], appState.ecg.sampleRate, appState.config.ecg.bpmAveragePeriod);
                        if (bpm !== null) { bpmDisplayEl.textContent = Math.round(bpm); } else { bpmDisplayEl.textContent = '--'; }
                    }
                }, 2000);
                if (appState.autoRecord.active) {
                    startBpmLogInterval();
                }
                console.log("✅ Stream ECG iniciado.");
            } else if (appState.modo === 'hrppi') {
                console.log("▶️ Iniciando stream HR/PPI...");
                await hrCharacteristic.startNotifications();
                hrCharacteristic.addEventListener('characteristicvaluechanged', handlePpiData);
                console.log("✅ Stream HR/PPI iniciado.");
            }
        } catch (error) {
            console.error("Erro ao iniciar stream:", error);
            statusConexao.textContent = `Erro: ${error.message}`;
            appState.streamAtivo = false;
        }
    }

    async function stopStream() {
        if (!polarDevice || !appState.streamAtivo) return;
        if (bpmUpdateInterval) clearInterval(bpmUpdateInterval);
        if (appState.autoRecord.bpmLogInterval) {
            clearInterval(appState.autoRecord.bpmLogInterval);
            appState.autoRecord.bpmLogInterval = null;
        }
        bpmUpdateInterval = null;
        bpmDisplayEl.textContent = '--';
        try {
            if (appState.modo === 'ecg' && pmdControlPoint) {
                console.log("🛑 Parando stream ECG...");
                await pmdData.stopNotifications();
                pmdData.removeEventListener('characteristicvaluechanged', handleEcgData);
                await pmdControlPoint.writeValue(new Uint8Array([0x03, 0x00]));
                console.log("⏹️ Stream ECG parado.");
            } else if (appState.modo === 'hrppi' && hrCharacteristic) {
                console.log("🛑 Parando stream HR/PPI...");
                await hrCharacteristic.stopNotifications();
                hrCharacteristic.removeEventListener('characteristicvaluechanged', handlePpiData);
                console.log("⏹️ Stream HR/PPI parado.");
            }
        } catch (error) {
            if (error.name !== 'NetworkError') { console.error("Erro ao parar stream:", error); }
        } finally {
            appState.streamAtivo = false;
        }
    }

    // --- ALGORITMO DE BPM --- (Mantido com a versão robusta)
    function calculateBpmFromEcg(samples, sampleRate, averagingPeriodInSeconds) {
        if (samples.length < sampleRate * 2) { return null; }
        const lowpassCutoff = 15.0;
        const a_lp = Math.exp(-2.0 * Math.PI * lowpassCutoff / sampleRate);
        let filtered_lp = [samples[0]];
        for (let i = 1; i < samples.length; i++) { filtered_lp[i] = (1.0 - a_lp) * samples[i] + a_lp * filtered_lp[i - 1]; }
        const highpassCutoff = 5.0;
        const a_hp = Math.exp(-2.0 * Math.PI * highpassCutoff / sampleRate);
        let filtered_hp = [0];
        for (let i = 1; i < filtered_lp.length; i++) { filtered_hp[i] = (1 - a_hp) * (filtered_lp[i] - filtered_lp[i-1]) + a_hp * filtered_hp[i-1]; }
        let derivative = [0];
        for (let i = 1; i < filtered_hp.length; i++) { derivative[i] = filtered_hp[i] - filtered_hp[i - 1]; }
        let squared = derivative.map(val => val * val);
        const windowSize = Math.round(0.150 * sampleRate);
        let integrated = [];
        let currentSum = 0;
        for (let i = 0; i < squared.length; i++) { currentSum += squared[i]; if (i >= windowSize) { currentSum -= squared[i - windowSize]; } integrated.push(currentSum / windowSize); }
        let r_peaks = [];
        let signal_peak = 0, noise_peak = 0;
        let signal_threshold = 0, noise_threshold = 0;
        const refractory_period = Math.round(0.2 * sampleRate);
        for (let i = 0; i < integrated.length; i++) {
            if (i > 0 && i < integrated.length - 1 && integrated[i] > integrated[i-1] && integrated[i] > integrated[i+1]) {
                const current_peak = integrated[i];
                if (r_peaks.length === 0 && i < 2 * sampleRate) { if(current_peak > noise_peak) noise_peak = current_peak; }
                if (current_peak > signal_threshold) {
                    if (r_peaks.length === 0 || (i - r_peaks[r_peaks.length - 1]) > refractory_period) { r_peaks.push(i); signal_peak = 0.125 * current_peak + 0.875 * signal_peak; }
                } else if (current_peak > noise_threshold) { noise_peak = 0.125 * current_peak + 0.875 * noise_peak; }
                signal_threshold = noise_peak + 0.25 * (signal_peak - noise_peak);
                noise_threshold = 0.5 * signal_threshold;
            }
        }
        if (r_peaks.length < 2) { return null; }
        let raw_rr_intervals = [];
        for (let i = 1; i < r_peaks.length; i++) { raw_rr_intervals.push(r_peaks[i] - r_peaks[i-1]); }
        const physiologicallyPlausible_rr = [];
        const max_rr_samples = sampleRate * 1.8;
        const min_rr_samples = sampleRate / (220 / 60);
        for (const rr of raw_rr_intervals) { if (rr > min_rr_samples && rr < max_rr_samples) { physiologicallyPlausible_rr.push(rr); } }
        if (physiologicallyPlausible_rr.length === 0) { return null; }
        if (appState.ecg.recentRRIntervals.length === 0) { appState.ecg.recentRRIntervals.push(...physiologicallyPlausible_rr); } else {
            for (const new_rr of physiologicallyPlausible_rr) {
                const recent_rr_avg = appState.ecg.recentRRIntervals.reduce((a, b) => a + b, 0) / appState.ecg.recentRRIntervals.length;
                const lower_bound = 0.65 * recent_rr_avg; const upper_bound = 1.65 * recent_rr_avg;
                if (new_rr > lower_bound && new_rr < upper_bound) {
                    appState.ecg.recentRRIntervals.push(new_rr);
                    if (appState.ecg.recentRRIntervals.length > 8) { appState.ecg.recentRRIntervals.shift(); }
                }
            }
        }
        const samplesToConsider = averagingPeriodInSeconds * sampleRate;
        let relevant_rr_sum = 0; let relevant_rr_count = 0; let samples_counted = 0;
        for (let i = appState.ecg.recentRRIntervals.length - 1; i >= 0; i--) {
            const interval = appState.ecg.recentRRIntervals[i];
            if (averagingPeriodInSeconds === 0) { relevant_rr_sum = appState.ecg.recentRRIntervals.reduce((a, b) => a + b, 0); relevant_rr_count = appState.ecg.recentRRIntervals.length; break; }
            samples_counted += interval;
            if (samples_counted > samplesToConsider && relevant_rr_count > 0) break;
            relevant_rr_sum += interval; relevant_rr_count++;
        }
        if (relevant_rr_count === 0) return null;
        const avg_rr_samples = relevant_rr_sum / relevant_rr_count;
        const avg_rr_seconds = avg_rr_samples / sampleRate;
        return 60.0 / avg_rr_seconds;
    }

    async function updateBatteryStatus() {
        if (!polarDevice || !polarDevice.gatt.connected) {
            batteryStatusValueEl.textContent = 'Desconectado';
            if(batteryUpdateInterval) clearInterval(batteryUpdateInterval); return;
        }
        try {
            batteryStatusValueEl.textContent = 'Lendo...';
            const batteryService = await polarDevice.gatt.getPrimaryService(BATTERY_SERVICE_UUID);
            const batteryCharacteristic = await batteryService.getCharacteristic(BATTERY_CHARACTERISTIC_UUID);
            const batteryValue = await batteryCharacteristic.readValue();
            const batteryPercent = batteryValue.getUint8(0);
            batteryStatusValueEl.textContent = `${batteryPercent}%`;
        } catch (error) {
            console.error("Erro ao ler nível da bateria:", error);
            batteryStatusValueEl.textContent = 'Erro ao ler';
        }
    }

    // --- HANDLERS DE DADOS --- (Adicionada populacão do scanBuffer)
    function handleEcgData(event) {
        const value = event.target.value;
        const data = new DataView(value.buffer);
        const newSamples = [];
        for (let i = 10; i < data.byteLength; i += 3) {
            const rawSample = (data.getInt8(i + 2) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i);
            newSamples.push(rawSample);
        }
        appState.ecg.buffer.push(...newSamples);
        appState.ecg.rollingBuffer.push(...newSamples);
        appState.ecg.scanBuffer.push(...newSamples);
        const maxBufferSize = Math.max(appState.config.ecg.larguraTemporal * appState.config.ecg.numLinhas * appState.ecg.sampleRate, appState.config.ecg.bpmAveragePeriod * appState.config.ecg.sampleRate * 2);
        if (appState.ecg.rollingBuffer.length > maxBufferSize) {
            appState.ecg.rollingBuffer.splice(0, appState.ecg.rollingBuffer.length - maxBufferSize);
        }
    }

    function handlePpiData(event) {
        const data = event.target.value;
        const flags = data.getUint8(0);
        const hrFormatIs16bit = (flags & 0x01) !== 0; const rrIntervalsPresent = (flags & 0x10) !== 0;
        let index = 1;
        const hr = hrFormatIs16bit ? data.getUint16(index, true) : data.getUint8(index);
        index += hrFormatIs16bit ? 2 : 1;
        const ppiValues = [];
        if (rrIntervalsPresent) {
            while (index < data.byteLength) { const rr = data.getUint16(index, true); ppiValues.push(Math.round((rr / 1024) * 1000)); index += 2; }
        }
        hrValueEl.textContent = hr; ppiValueEl.textContent = ppiValues.length > 0 ? ppiValues.join(', ') : '--'; ppiErrorValueEl.textContent = '--'; ppiFlagsValueEl.textContent = 'OK';
    }
    
    // --- LÓGICA DE CONFIGURAÇÃO E UI --- (Sem alterações)
    function updateUiForMode() {
        if (appState.modo === 'ecg') { modoEcgView.style.display = 'block'; modoHrppiView.style.display = 'none'; configEcgDiv.style.display = 'block'; configHrppiDiv.style.display = 'none'; } else { modoEcgView.style.display = 'none'; modoHrppiView.style.display = 'block'; configEcgDiv.style.display = 'none'; configHrppiDiv.style.display = 'block'; }
    }
    radioModo.forEach(radio => {
        radio.addEventListener('change', async (e) => {
            if (e.target.value === appState.modo) return;
            if (appState.streamAtivo) { await stopStream(); appState.modo = e.target.value; updateUiForMode(); await startStream(); } else { appState.modo = e.target.value; updateUiForMode(); }
        });
    });
    sliderLargura.addEventListener('input', (e) => { appState.config.ecg.larguraTemporal = parseInt(e.target.value); larguraLabel.textContent = e.target.value; appState.ecg.needsReset = true; if (appState.displayMode !== 'live') { redrawStaticEcg(); } });
    sliderLinhas.addEventListener('input', (e) => { appState.config.ecg.numLinhas = parseInt(e.target.value); linhasLabel.textContent = e.target.value; appState.ecg.needsReset = true; if (appState.displayMode !== 'live') { redrawStaticEcg(); } });
    sliderUv.addEventListener('input', (e) => { appState.ecg.uV_per_div = parseInt(e.target.value); uvLabel.textContent = e.target.value; appState.ecg.needsReset = true; if (appState.displayMode !== 'live') { redrawStaticEcg(); } });
    sliderBpmAvg.addEventListener('input', (e) => { const period = parseInt(e.target.value); appState.config.ecg.bpmAveragePeriod = period; bpmAvgLabel.textContent = period === 0 ? 'Inst.' : `${period}s`; if (appState.autoRecord.active) { startBpmLogInterval(); } });

    // --- LÓGICA DE RENDERIZAÇÃO NO CANVAS ---
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect(); const visibleHeight = rect.height; const lineHeight = visibleHeight / appState.config.ecg.numLinhas; const margin = lineHeight / 2;
        canvas.width = rect.width * dpr; canvas.height = (visibleHeight + 2 * margin) * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); ctx.translate(0, margin);
        appState.ecg.needsReset = true; if (appState.displayMode !== 'live') { redrawStaticEcg(); }
    }
    function drawGrid() {
        const width = canvas.clientWidth; const height = canvas.clientHeight; const numLinhas = appState.config.ecg.numLinhas; const lineHeight = height / numLinhas; const secs = appState.config.ecg.larguraTemporal; const pixelsPerSecond = width / secs; const margin = lineHeight / 2;
        ctx.clearRect(0, -margin, canvas.clientWidth, canvas.clientHeight + 2*margin); ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.5;
        const minorHorizontalStep = lineHeight / 10; for (let y = minorHorizontalStep; y < height; y += minorHorizontalStep) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
        const minorVerticalStep = pixelsPerSecond / 10; for (let x = minorVerticalStep; x < width; x += minorVerticalStep) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        ctx.strokeStyle = '#cccccc'; ctx.lineWidth = 0.75; for (let x = pixelsPerSecond / 2; x < width; x += pixelsPerSecond) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        ctx.strokeStyle = '#aaaaaa'; ctx.lineWidth = 1; for (let i = 1; i < numLinhas; i++) { const y = i * lineHeight; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); } for (let i = 1; i < secs; i++) { const x = i * pixelsPerSecond; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        ctx.strokeStyle = '#e60012'; ctx.fillStyle = '#e60012'; ctx.lineWidth = 2; ctx.font = '12px sans-serif';
        const barWidth = pixelsPerSecond; const startX = (width - barWidth) / 2; const endX = startX + barWidth; const barY = height + margin / 2; const tickHeight = 8;
        ctx.beginPath(); ctx.moveTo(startX, barY); ctx.lineTo(endX, barY); ctx.moveTo(startX, barY - tickHeight / 2); ctx.lineTo(startX, barY + tickHeight / 2); ctx.moveTo(endX, barY - tickHeight / 2); ctx.lineTo(endX, barY + tickHeight / 2); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('1 s', width / 2, barY + 5);
        ctx.fillStyle = '#1a1a1a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(`${appState.ecg.uV_per_div} µV/div`, 10, height + margin - 15); ctx.fillText('1 s/div', 10, height + margin - 2);
    }
    function formatTimestamp(date) {
        if (!(date instanceof Date) || isNaN(date)) { return { time: 'HH:MM:SS', date: 'DD/MM/AAAA' }; }
        const HH = String(date.getHours()).padStart(2, '0'); const MM = String(date.getMinutes()).padStart(2, '0'); const SS = String(date.getSeconds()).padStart(2, '0');
        const DD = String(date.getDate()).padStart(2, '0'); const MO = String(date.getMonth() + 1).padStart(2, '0'); const YYYY = date.getFullYear();
        return { time: `${HH}:${MM}:${SS}`, date: `${DD}/${MO}/${YYYY}` };
    }
    function drawTimestamp(timestamp) {
        const { time, date } = formatTimestamp(timestamp);
        const height = canvas.clientHeight; const width = canvas.clientWidth; const lineHeight = height / appState.config.ecg.numLinhas; const margin = lineHeight / 2;
        ctx.fillStyle = '#1a1a1a'; ctx.font = '14px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(time, width - 10, height + margin - 15); ctx.fillText(date, width - 10, height + margin - 2);
    }

    // --- CORREÇÃO 1: LÓGICA DE GRAVAÇÃO E THROTTLE RESTAURADO ---
    function drawLoop() {
        if (appState.displayMode !== 'live' || !appState.streamAtivo) {
            appState.ecg.desenhando = false;
            return;
        }
        appState.ecg.desenhando = true;

        if (appState.ecg.needsReset) {
            drawGrid();
            drawTimestamp(appState.ecg.startTimestamp);
            appState.ecg.currentX = 0;
            appState.ecg.currentLine = 0;
            appState.ecg.lastY = null;
            appState.ecg.needsReset = false;
            appState.ecg.scanBuffer = []; // Limpa o buffer de gravação no início de cada nova tela
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const lineHeight = height / appState.config.ecg.numLinhas;
        const gain = lineHeight / appState.ecg.uV_per_div;
        const pixelsPerSecond = width / appState.config.ecg.larguraTemporal;
        const pixelsPerSample = pixelsPerSecond / appState.ecg.sampleRate;
        
        ctx.strokeStyle = '#0052cc';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (appState.ecg.lastY !== null) {
            ctx.moveTo(appState.ecg.currentX, appState.ecg.lastY);
        }

        while(appState.ecg.buffer.length > 0) {
            const sample = appState.ecg.buffer.shift();
            const lineOffsetY = (appState.ecg.currentLine * lineHeight) + (lineHeight / 2);
            const currentY = lineOffsetY - (sample * gain); 
            ctx.lineTo(appState.ecg.currentX, currentY);
            
            appState.ecg.currentX += pixelsPerSample;
            appState.ecg.lastY = currentY;

            if (appState.ecg.currentX >= width) {
                ctx.stroke();
                appState.ecg.currentLine++;
                appState.ecg.currentX = 0;
                appState.ecg.lastY = null;
                
                if (appState.ecg.currentLine >= appState.config.ecg.numLinhas) {
                    appState.ecg.lastFullEcg = {
                        samples: [...appState.ecg.scanBuffer],
                        timestamp: appState.ecg.startTimestamp 
                    };

                    if (appState.autoRecord.active) {
                        const now = Date.now();
                        const scanDurationMs = appState.config.ecg.larguraTemporal * appState.config.ecg.numLinhas * 1000;
                        // THROTTLE RESTAURADO: Só salva se o tempo real decorrido for suficiente
                        if (now - appState.autoRecord.lastSaveTimestamp > scanDurationMs * 0.9) {
                            appState.autoRecord.lastSaveTimestamp = now;
                            autoSaveEcgScan({ ...appState.ecg.lastFullEcg });
                        }
                    }

                    appState.ecg.currentLine = 0;
                    appState.ecg.startTimestamp = new Date();
                    drawGrid();
                    drawTimestamp(appState.ecg.startTimestamp);
                    appState.ecg.scanBuffer = []; // Limpa para a próxima gravação
                }
                ctx.beginPath();
                break; 
            }
        }
        ctx.stroke();
        requestAnimationFrame(drawLoop);
    }
    
    // --- Funções de Salvar e Carregar --- (Sem alterações)
    function arrayBufferToBase64(buffer) { let binary = ''; const bytes = new Uint8Array(buffer); const len = bytes.byteLength; for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); } return window.btoa(binary); }
    function base64ToTypedArray(base64) { const binary_string = window.atob(base64); const len = binary_string.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); } return new Int32Array(bytes.buffer); }
    function getCurrentDisplayData() {
        switch (appState.displayMode) {
            case 'live': return { samples: appState.ecg.rollingBuffer, timestamp: appState.ecg.startTimestamp };
            case 'loaded': return appState.ecg.loadedData;
            case 'last':
                if (appState.ecg.lastFullEcg.samples.length > 0) { return appState.ecg.lastFullEcg; } 
                else { return { samples: appState.ecg.rollingBuffer, timestamp: appState.ecg.startTimestamp }; }
            default: return { samples: [], timestamp: null };
        }
    }
    function saveEcgData() {
        const dataToSave = getCurrentDisplayData();
        if (!dataToSave || !dataToSave.samples || dataToSave.samples.length === 0) { alert("Não há dados de ECG visíveis na tela para salvar."); return; }
        const samplesToSave = new Int32Array(dataToSave.samples);
        const saveData = { timestamp: dataToSave.timestamp.toISOString(), sampleRate: appState.ecg.sampleRate, uV_per_div: appState.ecg.uV_per_div, samples_base64: arrayBufferToBase64(samplesToSave.buffer) };
        const jsonString = JSON.stringify(saveData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `ECG_${dataToSave.timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
    function saveCanvasAsPng() {
        const currentData = getCurrentDisplayData(); const timestamp = currentData.timestamp || new Date(); const filename = `ECG-PNG_${timestamp.toISOString().replace(/[:.]/g, '-')}.png`;
        const tempCanvas = document.createElement('canvas'); tempCanvas.width = canvas.width; tempCanvas.height = canvas.height; const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = '#ffffff'; tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height); tempCtx.drawImage(canvas, 0, 0);
        const link = document.createElement('a'); link.download = filename; link.href = tempCanvas.toDataURL('image/png');
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }
    function loadEcgData(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.timestamp || !data.samples_base64) { throw new Error("Formato de arquivo inválido."); }
                appState.ecg.loadedData = { samples: base64ToTypedArray(data.samples_base64), timestamp: new Date(data.timestamp), sampleRate: data.sampleRate || 130, uV_per_div: data.uV_per_div || 1000 };
                appState.displayMode = 'loaded'; redrawStaticEcg();
            } catch (error) { alert(`Erro ao carregar o arquivo: ${error.message}`); console.error(error); }
        };
        reader.readAsText(file); fileInputEcg.value = '';
    }
    function redrawStaticEcg() {
        const dataToDraw = getCurrentDisplayData(); const data = dataToDraw.samples; const timestamp = dataToDraw.timestamp;
        if (!data || data.length === 0) { drawGrid(); drawTimestamp(null); return; }
        drawGrid(); drawTimestamp(timestamp);
        const width = canvas.clientWidth; const height = canvas.clientHeight; const lineHeight = height / appState.config.ecg.numLinhas; const gain = lineHeight / appState.ecg.uV_per_div; const pixelsPerSecond = width / appState.config.ecg.larguraTemporal; const pixelsPerSample = pixelsPerSecond / appState.ecg.sampleRate;
        ctx.strokeStyle = '#0052cc'; ctx.lineWidth = 1.5; let currentX = 0; let currentLine = 0; let lastY = null; ctx.beginPath();
        for(const sample of data) {
            const lineOffsetY = (currentLine * lineHeight) + (lineHeight / 2); const currentY = lineOffsetY - (sample * gain);
            if (lastY === null) { ctx.moveTo(currentX, currentY); } else { ctx.lineTo(currentX, currentY); }
            currentX += pixelsPerSample; lastY = currentY;
            if (currentX >= width) { ctx.stroke(); currentLine++; currentX = 0; lastY = null; if (currentLine >= appState.config.ecg.numLinhas) { break; } ctx.beginPath(); }
        }
        ctx.stroke();
    }
    
    // --- INICIALIZAÇÃO E EVENTOS ---
    function init() {
        btnAgree.addEventListener('click', () => { disclaimerOverlay.style.display = 'none'; });
        btnDisagree.addEventListener('click', () => { document.body.innerHTML = `<div style="display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; padding: 20px; font-size: 1.2rem;"><p>Você precisa concordar com os termos para utilizar esta aplicação.</p></div>`; });
        if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(err => { console.error('Falha no registro do Service Worker:', err); }); }
        changeView('conexao'); updateUiForMode(); window.addEventListener('resize', resizeCanvas); resizeCanvas();
        menuButtons.aquisicao.addEventListener('click', () => { if (polarDevice && !appState.streamAtivo) startStream(); if(batteryUpdateInterval) clearInterval(batteryUpdateInterval); });
        menuButtons.conexao.addEventListener('click', () => { if (polarDevice && appState.streamAtivo) stopStream(); if(batteryUpdateInterval) clearInterval(batteryUpdateInterval); });
        menuButtons.config.addEventListener('click', async () => { if (polarDevice && appState.streamAtivo) await stopStream(); if (batteryUpdateInterval) clearInterval(batteryUpdateInterval); await updateBatteryStatus(); batteryUpdateInterval = setInterval(updateBatteryStatus, 120000); });
        btnSaveEcg.addEventListener('click', saveEcgData);
        btnSavePng.addEventListener('click', saveCanvasAsPng);
        btnLoadEcg.addEventListener('click', () => fileInputEcg.click());
        fileInputEcg.addEventListener('change', loadEcgData);
        btnShowLastEcg.addEventListener('click', () => {
            if (appState.ecg.lastFullEcg.samples.length === 0 && appState.ecg.rollingBuffer.length === 0) { alert("Nenhum dado de ECG foi gravado ainda."); return; }
            appState.displayMode = 'last'; redrawStaticEcg();
        });
        btnShowLiveEcg.addEventListener('click', () => {
            appState.displayMode = 'live'; appState.ecg.startTimestamp = new Date();
            appState.ecg.rollingBuffer = []; appState.ecg.buffer = []; appState.ecg.scanBuffer = []; appState.ecg.recentRRIntervals = [];
            appState.ecg.currentX = 0; appState.ecg.currentLine = 0; appState.ecg.lastY = null; appState.ecg.needsReset = true;
            if (appState.streamAtivo && !appState.ecg.desenhando) { requestAnimationFrame(drawLoop); } else if (!appState.streamAtivo) { drawGrid(); drawTimestamp(appState.ecg.startTimestamp); }
        });
        btnAutoRecord.addEventListener('click', handleAutoRecordToggle);

        chkSaveEcg.addEventListener('change', (e) => {
            appState.autoRecord.saveEcg = e.target.checked;
            // Impede que ambos sejam desmarcados
            if (!appState.autoRecord.saveEcg && !appState.autoRecord.saveBpm) {
                chkSaveBpm.checked = true;
                appState.autoRecord.saveBpm = true;
            }
        });
        chkSaveBpm.addEventListener('change', (e) => {
            appState.autoRecord.saveBpm = e.target.checked;
            // Impede que ambos sejam desmarcados
            if (!appState.autoRecord.saveBpm && !appState.autoRecord.saveEcg) {
                chkSaveEcg.checked = true;
                appState.autoRecord.saveEcg = true;
            }
            // Se a gravação já estiver ativa, inicia ou para o log de BPM conforme necessário
            if (appState.autoRecord.active && appState.streamAtivo) {
                if (appState.autoRecord.saveBpm) {
                    startBpmLogInterval();
                } else if (appState.autoRecord.bpmLogInterval) {
                    clearInterval(appState.autoRecord.bpmLogInterval);
                    appState.autoRecord.bpmLogInterval = null;
                }
            }
        });

        const initialBpmPeriod = appState.config.ecg.bpmAveragePeriod;
        bpmAvgLabel.textContent = initialBpmPeriod === 0 ? 'Inst.' : `${initialBpmPeriod}s`;
    }

    // --- CORREÇÃO 2: LÓGICA DE INÍCIO DA GRAVAÇÃO ---
    async function startAutoRecording() {
        if (!polarDevice || !polarDevice.gatt.connected) {
            alert("Por favor, conecte-se ao dispositivo Polar H10 antes de iniciar a gravação.");
            return;
        }
        try {
            const dirHandle = await window.showDirectoryPicker();
            appState.autoRecord.directoryHandle = dirHandle;
            appState.autoRecord.bpmFileHandle = await dirHandle.getFileHandle('registro_bpm.csv', { create: true });
            
            // Define o estado como ativo ANTES de iniciar processos dependentes
            appState.autoRecord.active = true;
            btnAutoRecord.classList.add('recording');
            btnAutoRecord.textContent = 'Interromper Gravação Automática';
            
            if (!appState.streamAtivo) {
                console.log("Iniciando stream de dados para gravação automática...");
                if (appState.modo !== 'ecg') {
                    alert("A gravação automática só funciona no modo ECG. Por favor, mude o modo em Configurações.");
                    stopAutoRecording(); // Reverte o estado se o modo estiver errado
                    return;
                }
                await startStream(); // Esta função agora iniciará o log de BPM porque autoRecord.active é true
            } else {
                // Se o stream já está ativo, apenas precisamos iniciar o log de BPM
                startBpmLogInterval();
            }
            
            console.log('✅ Gravação automática iniciada na pasta:', dirHandle.name);
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('O usuário cancelou a seleção da pasta.');
            } else {
                console.error('Erro ao iniciar a gravação automática:', error);
                alert('Não foi possível iniciar a gravação. Verifique as permissões do navegador.');
            }
            // Garante que a UI reverta em caso de erro
            stopAutoRecording();
        }
    }

    function stopAutoRecording() {
        if (appState.autoRecord.bpmLogInterval) { clearInterval(appState.autoRecord.bpmLogInterval); }
        appState.autoRecord = { 
            active: false,
            directoryHandle: null,
            bpmFileHandle: null,
            bpmLogInterval: null,
            lastSaveTimestamp: 0,
            saveEcg: true,
            saveBpm: true,
        };
        chkSaveEcg.checked = true;
        chkSaveBpm.checked = true;
        btnAutoRecord.classList.remove('recording');
        btnAutoRecord.textContent = 'Iniciar Gravação Automática';
        console.log('🛑 Gravação automática interrompida.');
    }

    function handleAutoRecordToggle() {
        if (appState.autoRecord.active) { stopAutoRecording(); } else { startAutoRecording(); }
    }

    async function autoSaveEcgScan(ecgData) {
         if (!appState.autoRecord.active || !appState.autoRecord.saveEcg || !appState.autoRecord.directoryHandle || !ecgData || ecgData.samples.length === 0) { return; }
        try {
            const timestamp = ecgData.timestamp;
            const filename = `ECG_${timestamp.toISOString().replace(/[:.]/g, '-')}.json`;
            const fileHandle = await appState.autoRecord.directoryHandle.getFileHandle(filename, { create: true });
            const samplesToSave = new Int32Array(ecgData.samples);
            const saveData = { timestamp: timestamp.toISOString(), sampleRate: appState.ecg.sampleRate, uV_per_div: appState.ecg.uV_per_div, samples_base64: arrayBufferToBase64(samplesToSave.buffer) };
            const jsonString = JSON.stringify(saveData, null, 2);
            const writable = await fileHandle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            console.log(`ECG salvo automaticamente: ${filename}`);
        } catch (error) {
            console.error('Falha ao salvar ECG automaticamente:', error);
            if (error.name === 'NotAllowedError') { alert('A permissão para salvar arquivos foi perdida. A gravação automática foi interrompida.'); stopAutoRecording(); }
        }
    }

    async function logBpmData() {
        if (!appState.autoRecord.active || !appState.autoRecord.saveBpm || !appState.autoRecord.bpmFileHandle) { return; }
        const requiredSamples = appState.ecg.sampleRate * 2;
        if (appState.ecg.rollingBuffer.length < requiredSamples) { return; }
        const bpmValue = calculateBpmFromEcg([...appState.ecg.rollingBuffer], appState.ecg.sampleRate, appState.config.ecg.bpmAveragePeriod);
        if (bpmValue === null) { return; }
        try {
            const timestamp = new Date().toISOString();
            const roundedBpm = Math.round(bpmValue);
            const line = `${timestamp},${roundedBpm}\n`;
            const writable = await appState.autoRecord.bpmFileHandle.createWritable({ keepExistingData: true });
            const file = await appState.autoRecord.bpmFileHandle.getFile();
            if (file.size === 0) { await writable.write('timestamp,bpm\n'); }
            await writable.seek(file.size);
            await writable.write(line);
            await writable.close();
        } catch (error) {
            console.error('Falha ao registrar BPM:', error);
             if (error.name === 'NotAllowedError') { alert('A permissão para salvar arquivos foi perdida. A gravação automática foi interrompida.'); stopAutoRecording(); }
        }
    }

    function startBpmLogInterval() {
        if (appState.autoRecord.bpmLogInterval) { clearInterval(appState.autoRecord.bpmLogInterval); }
        if (!appState.autoRecord.active || !appState.autoRecord.saveBpm) { return; }
        const periodMs = appState.config.ecg.bpmAveragePeriod > 0 ? appState.config.ecg.bpmAveragePeriod * 1000 : 2000;
        appState.autoRecord.bpmLogInterval = setInterval(logBpmData, periodMs);
    }

    init();
});