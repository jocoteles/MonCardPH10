// main.js - Monitor Cardíaco Polar H10

document.addEventListener('DOMContentLoaded', () => {

    // =================================================================================
    // --- SELETORES DE ELEMENTOS DO DOM ---
    // =================================================================================

    // Vistas e Navegação
    const views = {
        conexao: document.getElementById('view-conexao'),
        aquisicao: document.getElementById('view-aquisicao'),
        config: document.getElementById('view-config'),
    };
    const menuButtons = {
        conexao: document.getElementById('btn-conexao'),
        aquisicao: document.getElementById('btn-aquisicao'),
        config: document.getElementById('btn-config'),
    };

    // Componentes de Conexão
    const statusConexao = document.getElementById('status-conexao');
    const btnConectar = document.getElementById('btn-conectar');
    const batteryStatusValueEl = document.getElementById('battery-status-value');

    // Componentes de Aquisição
    const modoEcgView = document.getElementById('modo-ecg');
    const modoHrppiView = document.getElementById('modo-hrppi');
    const bpmDisplayEl = document.getElementById('bpm-display');
    const hrValueEl = document.getElementById('hr-value');
    const ppiValueEl = document.getElementById('ppi-value');
    const ppiErrorValueEl = document.getElementById('ppi-error-value');
    const ppiFlagsValueEl = document.getElementById('ppi-flags-value');

    // Canvas de ECG
    const canvas = document.getElementById('ecg-canvas');
    const ctx = canvas.getContext('2d');

    // Controles e Inputs de Arquivo
    const btnSaveEcg = document.getElementById('btn-save-ecg');
    const btnSavePng = document.getElementById('btn-save-png');
    const btnLoadEcg = document.getElementById('btn-load-ecg');
    const btnShowLastEcg = document.getElementById('btn-show-last-ecg');
    const btnShowLiveEcg = document.getElementById('btn-show-live-ecg');
    const fileInputEcg = document.getElementById('file-input-ecg');

    // Componentes de Configuração
    const radioModo = document.querySelectorAll('input[name="modo"]');
    const sliderLargura = document.getElementById('slider-largura');
    const larguraLabel = document.getElementById('largura-label');
    const sliderLinhas = document.getElementById('slider-linhas');
    const linhasLabel = document.getElementById('linhas-label');
    const sliderUv = document.getElementById('slider-uv');
    const uvLabel = document.getElementById('uv-label');
    const sliderBpmAvg = document.getElementById('slider-bpm-avg');
    const bpmAvgLabel = document.getElementById('bpm-avg-label');

    // Gravação Automática
    const btnAutoRecord = document.getElementById('btn-auto-record');
    const chkSaveEcg = document.getElementById('chk-save-ecg');
    const chkSaveBpm = document.getElementById('chk-save-bpm');

    // Modal de Aviso
    const disclaimerOverlay = document.getElementById('disclaimer-overlay');
    const btnAgree = document.getElementById('btn-agree');
    const btnDisagree = document.getElementById('btn-disagree');


    // =================================================================================
    // --- CONSTANTES BLUETOOTH ---
    // =================================================================================

    const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_DATA_MTU_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";
    const HR_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
    const HR_CHARACTERISTIC_UUID = "00002a37-0000-1000-8000-00805f9b34fb";
    const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
    const BATTERY_CHARACTERISTIC_UUID = "00002a19-0000-1000-8000-00805f9b34fb";


    // =================================================================================
    // --- ESTADO GLOBAL DA APLICAÇÃO ---
    // =================================================================================

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
        lastReceivedHR: null,
        hrSamples: [],

        autoRecord: {
            active: false,
            directoryHandle: null,
            bpmFileHandle: null,
            bpmLogInterval: null,
            autoSaveInterval: null,
            lastSaveTimestamp: 0,
            saveEcg: true,
            saveBpm: true,
            bpmIntervalSeconds: 5,
        },

        config: {
            ecg: {
                larguraTemporal: 10,
                numLinhas: 5,
                filterMode: 'none', // 'none', 'butter2', 'butter4', 'movavg'
            }
        },

        ecg: {
            buffer: [],
            rollingBuffer: [],
            scanBuffer: [],
            autoSaveBuffer: [],
            loadedData: null,
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


    // =================================================================================
    // --- LÓGICA DE NAVEGAÇÃO E UI ---
    // =================================================================================

    function changeView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        Object.values(menuButtons).forEach(b => b.classList.remove('active'));

        views[viewName].classList.add('active');
        menuButtons[viewName].classList.add('active');

        if (viewName === 'aquisicao') {
            resizeCanvas();
        }
    }

    function updateUiForMode() {
        if (appState.modo === 'ecg') {
            modoEcgView.style.display = 'block';
            modoHrppiView.style.display = 'none';
        } else {
            modoEcgView.style.display = 'none';
            modoHrppiView.style.display = 'block';
        }
    }


    // =================================================================================
    // --- LÓGICA DE CONEXÃO BLUETOOTH ---
    // =================================================================================

    btnConectar.addEventListener('click', async () => {
        try {
            statusConexao.textContent = 'Procurando dispositivo...';
            const options = {
                filters: [{ namePrefix: 'Polar H10' }],
                optionalServices: [PMD_SERVICE_UUID, HR_SERVICE_UUID, BATTERY_SERVICE_UUID]
            };
            polarDevice = await navigator.bluetooth.requestDevice(options);

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

        polarDevice = null;
        pmdControlPoint = null;
        pmdData = null;
        hrCharacteristic = null;

        if (batteryUpdateInterval) clearInterval(batteryUpdateInterval);
        if (bpmUpdateInterval) clearInterval(bpmUpdateInterval);

        stopStream();
    }


    // =================================================================================
    // --- LÓGICA DE CONTROLE DE STREAM DE DADOS ---
    // =================================================================================

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
                appState.ecg.lastFullEcg = { samples: [], timestamp: null };
                appState.ecg.startTimestamp = new Date();
                appState.ecg.needsReset = true;
                appState.lastReceivedHR = null;
                appState.hrSamples = [];

                // Inicia notificações de ECG
                await pmdData.startNotifications();
                pmdData.addEventListener('characteristicvaluechanged', handleEcgData);

                const startEcgCommand = new Uint8Array([0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0E, 0x00]);
                await pmdControlPoint.writeValue(startEcgCommand);

                // ← ADICIONAR: Inicia notificações de HR simultaneamente
                await hrCharacteristic.startNotifications();
                hrCharacteristic.addEventListener('characteristicvaluechanged', handleHrForEcg);

                if (!appState.ecg.desenhando) {
                    requestAnimationFrame(drawLoop);
                }
                
                // ← ADICIONAR: Intervalo simples para atualizar display
                if (bpmUpdateInterval) clearInterval(bpmUpdateInterval);
                bpmUpdateInterval = setInterval(() => {
                    if (appState.lastReceivedHR !== null) {
                        bpmDisplayEl.textContent = appState.lastReceivedHR;
                    } else {
                        bpmDisplayEl.textContent = '--';
                    }
                }, 500);

                if (appState.autoRecord.active) {
                    startBpmLogInterval();
                }
                console.log("✅ Stream ECG + HR iniciado.");

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
                await hrCharacteristic.stopNotifications();
                hrCharacteristic.removeEventListener('characteristicvaluechanged', handleHrForEcg);
                console.log("⏹️ Stream ECG parado.");
            } else if (appState.modo === 'hrppi' && hrCharacteristic) {
                console.log("🛑 Parando stream HR/PPI...");
                await hrCharacteristic.stopNotifications();
                hrCharacteristic.removeEventListener('characteristicvaluechanged', handlePpiData);
                console.log("⏹️ Stream HR/PPI parado.");
            }
        } catch (error) {
            if (error.name !== 'NetworkError') {
                console.error("Erro ao parar stream:", error);
            }
        } finally {
            appState.streamAtivo = false;
        }
    }

    // =================================================================================
    // --- FILTROS DIGITAIS DE ECG ---
    // =================================================================================

    const ecgFilterState = {
        butter2: { x1: 0, x2: 0, y1: 0, y2: 0 },
        butter4a: { x1: 0, x2: 0, y1: 0, y2: 0 },
        butter4b: { x1: 0, x2: 0, y1: 0, y2: 0 },
        movavg: [],
        savitzky: [],
        fir: {
            buffer: new Array(101).fill(0),
            index: 0
        }
    };

    // ------------------------------
    // Butterworth 2ª e 4ª ordem
    // ------------------------------
    const coeffsButter2 = {
        b0: 0.945350, b1: -1.890509, b2: 0.945350,
        a1: -1.889033, a2: 0.894874
    };
    const coeffsButter4a = { b0: 0.989283, b1: -1.978566, b2: 0.989283, a1: -1.977786, a2: 0.978783 };
    const coeffsButter4b = { b0: 1.000000, b1: -2.000000, b2: 1.000000, a1: -1.997955, a2: 0.997956 };

    // Função genérica de biquad
    function applyBiquad(x, coeffs, state) {
        const y = coeffs.b0*x + coeffs.b1*state.x1 + coeffs.b2*state.x2 - coeffs.a1*state.y1 - coeffs.a2*state.y2;
        state.x2 = state.x1; state.x1 = x;
        state.y2 = state.y1; state.y1 = y;
        return y;
    }

    // ------------------------------
    // Savitzky–Golay 11 amostras, ordem 3
    // ------------------------------
    const savitzkyCoeffs = [-36, 9, 44, 69, 84, 89, 84, 69, 44, 9, -36].map(c => c / 429);
    function filterEcgSavitzky(x) {
        const buf = ecgFilterState.savitzky;
        buf.push(x);
        if (buf.length < 11) return x; // período inicial
        if (buf.length > 11) buf.shift();

        let y = 0;
        for (let i = 0; i < 11; i++) y += buf[i] * savitzkyCoeffs[i];
        return y;
    }

    // FIR passa-baixa 100 Hz (fs = 130 Hz, 21 coef., janela Hamming)
    // Preserva complexos QRS enquanto atenua ruído de alta frequência
    const firCoeffs = [
        -0.006536, -0.011789, -0.010562,  0.003759,  0.032708,
         0.073068,  0.118046,  0.158111,  0.184487,  0.191429,
         0.184487,  0.158111,  0.118046,  0.073068,  0.032708,
         0.003759, -0.010562, -0.011789, -0.006536
    ];

    if (!ecgFilterState.fir)
        ecgFilterState.fir = { buffer: new Float32Array(firCoeffs.length).fill(0), index: 0, initialized: false };

    function filterEcgFIR(x) {
        const s = ecgFilterState.fir;

        // Inicializa se necessário
        if (!s.buffer) {
            s.buffer = new Float32Array(firCoeffs.length).fill(x);
            s.index = 0;
        }

        s.buffer[s.index] = x;

        // Convolução circular
        let y = 0;
        let j = s.index;
        for (let i = 0; i < firCoeffs.length; i++) {
            y += firCoeffs[i] * s.buffer[j];
            j = (j - 1 + firCoeffs.length) % firCoeffs.length;
        }

        s.index = (s.index + 1) % firCoeffs.length;
        return y;
    }

    // ------------------------------
    // Filtro principal de despacho
    // ------------------------------
    function filterEcgSample(x) {
        const mode = appState.config.ecg.filterMode;

        switch (mode) {
            case 'butter2':
                return applyBiquad(x, coeffsButter2, ecgFilterState.butter2);

            case 'butter4':
                const y1 = applyBiquad(x, coeffsButter4a, ecgFilterState.butter4a);
                return applyBiquad(y1, coeffsButter4b, ecgFilterState.butter4b);

            case 'movavg':
                const buf = ecgFilterState.movavg;
                buf.push(x);
                if (buf.length > 5) buf.shift();
                return buf.reduce((a, b) => a + b, 0) / buf.length;

            case 'savitzky':
                return filterEcgSavitzky(x);

            case 'fir35':
                return filterEcgFIR(x);

            default:
                return x; // none (bruto)
        }
    }

    // =================================================================================
    // --- PROCESSAMENTO DE DADOS E ALGORITMOS ---
    // =================================================================================

    function handleEcgData(event) {
        const value = event.target.value;
        const data = new DataView(value.buffer);
        const newSamples = [];

        for (let i = 10; i < data.byteLength; i += 3) {
            const rawSample = (data.getInt8(i + 2) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i);
            newSamples.push(filterEcgSample(rawSample));
        }

        // Popula os buffers para diferentes finalidades
        appState.ecg.buffer.push(...newSamples);
        appState.ecg.rollingBuffer.push(...newSamples);
        appState.ecg.scanBuffer.push(...newSamples);

        if (appState.autoRecord.active && appState.autoRecord.saveEcg) {
            appState.ecg.autoSaveBuffer.push(...newSamples);
        }

        // Limita o tamanho do rolling buffer para economizar memória
        const maxBufferSize = appState.config.ecg.larguraTemporal * appState.config.ecg.numLinhas * appState.ecg.sampleRate;
        if (appState.ecg.rollingBuffer.length > maxBufferSize) {
            appState.ecg.rollingBuffer.splice(0, appState.ecg.rollingBuffer.length - maxBufferSize);
        }
    }

    function handlePpiData(event) {
        const data = event.target.value;
        const flags = data.getUint8(0);
        const hrFormatIs16bit = (flags & 0x01) !== 0;
        const rrIntervalsPresent = (flags & 0x10) !== 0;
        let index = 1;

        const hr = hrFormatIs16bit ? data.getUint16(index, true) : data.getUint8(index);
        index += hrFormatIs16bit ? 2 : 1;

        const ppiValues = [];
        if (rrIntervalsPresent) {
            while (index < data.byteLength) {
                const rr = data.getUint16(index, true);
                ppiValues.push(Math.round((rr / 1024) * 1000));
                index += 2;
            }
        }

        hrValueEl.textContent = hr;
        ppiValueEl.textContent = ppiValues.length > 0 ? ppiValues.join(', ') : '--';
        ppiErrorValueEl.textContent = '--';
        ppiFlagsValueEl.textContent = 'OK';
    }

    function handleHrForEcg(event) {
        const data = event.target.value;
        const flags = data.getUint8(0);
        const hrFormatIs16bit = (flags & 0x01) !== 0;
        
        const hr = hrFormatIs16bit ? data.getUint16(1, true) : data.getUint8(1);
        appState.lastReceivedHR = hr;
        
        if (appState.autoRecord.active && appState.autoRecord.saveBpm) {
            appState.hrSamples.push(hr);
        }
    }

    
    // =================================================================================
    // --- LÓGICA DE RENDERIZAÇÃO NO CANVAS ---
    // =================================================================================

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const visibleHeight = rect.height;
        const lineHeight = visibleHeight / appState.config.ecg.numLinhas;
        const margin = lineHeight / 2;

        canvas.width = rect.width * dpr;
        canvas.height = (visibleHeight + 2 * margin) * dpr;

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.translate(0, margin);

        appState.ecg.needsReset = true;
        if (appState.displayMode !== 'live') {
            redrawStaticEcg();
        }
    }

    function drawGrid() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const numLinhas = appState.config.ecg.numLinhas;
        const lineHeight = height / numLinhas;
        const secs = appState.config.ecg.larguraTemporal;
        const pixelsPerSecond = width / secs;
        const margin = lineHeight / 2;

        ctx.clearRect(0, -margin, canvas.clientWidth, canvas.clientHeight + 2 * margin);
        
        // --- Linhas menores (grade fina) ---
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;

        const minorHorizontalStep = lineHeight / 10;
        for (let y = minorHorizontalStep; y < height; y += minorHorizontalStep) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        const minorVerticalStep = pixelsPerSecond / 10;
        for (let x = minorVerticalStep; x < width; x += minorVerticalStep) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // --- Linhas verticais médias ---
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 0.75;

        for (let x = pixelsPerSecond / 2; x < width; x += pixelsPerSecond) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // --- Linhas maiores (grade principal) ---
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 1;

        // Linhas horizontais principais
        for (let i = 1; i < numLinhas; i++) {
            const y = i * lineHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Linhas verticais principais
        for (let i = 1; i < secs; i++) {
            const x = i * pixelsPerSecond;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // --- Barra de referência de tempo ---
        ctx.strokeStyle = '#e60012';
        ctx.fillStyle = '#e60012';
        ctx.lineWidth = 2;
        ctx.font = '12px sans-serif';

        const barWidth = pixelsPerSecond;
        const startX = (width - barWidth) / 2;
        const endX = startX + barWidth;
        const barY = height + margin / 2;
        const tickHeight = 8;

        ctx.beginPath();
        ctx.moveTo(startX, barY);
        ctx.lineTo(endX, barY);
        ctx.moveTo(startX, barY - tickHeight / 2);
        ctx.lineTo(startX, barY + tickHeight / 2);
        ctx.moveTo(endX, barY - tickHeight / 2);
        ctx.lineTo(endX, barY + tickHeight / 2);
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('1 s', width / 2, barY + 5);

        // --- Legendas ---
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';

        ctx.fillText(`${Math.round(appState.ecg.uV_per_div/10)} µV/div`, 10, height + margin - 15);
        ctx.fillText('0,1 s/div', 10, height + margin - 2);

    }

    function drawTimestamp(timestamp) {
        const { time, date } = formatTimestamp(timestamp);
        const height = canvas.clientHeight;
        const width = canvas.clientWidth;
        const lineHeight = height / appState.config.ecg.numLinhas;
        const margin = lineHeight / 2;

        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(time, width - 10, height + margin - 15);
        ctx.fillText(date, width - 10, height + margin - 2);
    }

    function drawFilterLegend() {
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const margin = 10;
        
        // Determina qual filtro mostrar baseado no modo de exibição
        let filterMode = appState.config.ecg.filterMode;
        if (appState.displayMode === 'loaded' && appState.ecg.loadedData) {
            filterMode = appState.ecg.loadedData.filterMode || 'none';
        } else if (appState.displayMode === 'last' && appState.ecg.lastFullEcg.samples.length > 0) {
            // Para 'last', usa o filtro que estava ativo durante a gravação
            filterMode = appState.config.ecg.filterMode;
        }

        // Texto amigável para exibir
        const legendText = {
            none: 'Filtro: Nenhum (Bruto)',
            butter2: 'Filtro: Butterworth 2ª ordem (0.5–40 Hz)',
            butter4: 'Filtro: Butterworth 4ª ordem (0.5–40 Hz)',
            movavg: 'Filtro: Média móvel (5 amostras)',
            savitzky: 'Filtro: Savitzky–Golay (11 pts, ordem 3)',
            fir35: 'Filtro: FIR passa-baixa (100 Hz, 21 coef.)',
        }[filterMode] || 'Filtro: —';
        
        ctx.fillStyle = '#222';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(legendText, margin + 8, margin - 30);
    }

    function drawLoop() {
        if (appState.displayMode !== 'live' || !appState.streamAtivo) {
            appState.ecg.desenhando = false;
            return;
        }
        appState.ecg.desenhando = true;

        if (appState.ecg.needsReset) {
            drawGrid();
            drawTimestamp(appState.ecg.startTimestamp);
            drawFilterLegend();
            appState.ecg.currentX = 0;
            appState.ecg.currentLine = 0;
            appState.ecg.lastY = null;
            appState.ecg.needsReset = false;
            appState.ecg.scanBuffer = [];
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

        while (appState.ecg.buffer.length > 0) {
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

                    // Reinicia a tela
                    appState.ecg.currentLine = 0;
                    appState.ecg.startTimestamp = new Date();
                    drawGrid();
                    drawTimestamp(appState.ecg.startTimestamp);
                    drawFilterLegend();
                    appState.ecg.scanBuffer = [];
                }
                ctx.beginPath();
                break;
            }
        }
        ctx.stroke();
        requestAnimationFrame(drawLoop);
    }

    function redrawStaticEcg() {
        const dataToDraw = getCurrentDisplayData();
        const data = dataToDraw.samples;
        const timestamp = dataToDraw.timestamp;

        if (!data || data.length === 0) {
            drawGrid();
            drawTimestamp(null);
            return;
        }

        drawGrid();
        drawTimestamp(timestamp);
        drawFilterLegend();

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const lineHeight = height / appState.config.ecg.numLinhas;
        const gain = lineHeight / appState.ecg.uV_per_div;
        const pixelsPerSecond = width / appState.config.ecg.larguraTemporal;
        const pixelsPerSample = pixelsPerSecond / appState.ecg.sampleRate;

        ctx.strokeStyle = '#0052cc';
        ctx.lineWidth = 1.5;
        let currentX = 0;
        let currentLine = 0;
        let lastY = null;
        ctx.beginPath();

        for (const sample of data) {
            const lineOffsetY = (currentLine * lineHeight) + (lineHeight / 2);
            const currentY = lineOffsetY - (sample * gain);

            if (lastY === null) {
                ctx.moveTo(currentX, currentY);
            } else {
                ctx.lineTo(currentX, currentY);
            }
            
            currentX += pixelsPerSample;
            lastY = currentY;

            if (currentX >= width) {
                ctx.stroke();
                currentLine++;
                currentX = 0;
                lastY = null;
                if (currentLine >= appState.config.ecg.numLinhas) {
                    break;
                }
                ctx.beginPath();
            }
        }
        ctx.stroke();
    }


    // =================================================================================
    // --- LÓGICA DE ARQUIVOS E DADOS (SALVAR/CARREGAR) ---
    // =================================================================================

    function getLocalIsoString(dateInput) {
        const date = dateInput || new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        return date.getFullYear() +
            '-' + pad(date.getMonth() + 1) +
            '-' + pad(date.getDate()) +
            'T' + pad(date.getHours()) +
            ':' + pad(date.getMinutes()) +
            ':' + pad(date.getSeconds());
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToTypedArray(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return new Int32Array(bytes.buffer);
    }

    function getCurrentDisplayData() {
        switch (appState.displayMode) {
            case 'live':
                return { samples: appState.ecg.rollingBuffer, timestamp: appState.ecg.startTimestamp };
            case 'loaded':
                return appState.ecg.loadedData;
            case 'last':
                if (appState.ecg.lastFullEcg.samples.length > 0) {
                    return appState.ecg.lastFullEcg;
                } else {
                    return { samples: appState.ecg.rollingBuffer, timestamp: appState.ecg.startTimestamp };
                }
            default:
                return { samples: [], timestamp: null };
        }
    }

    function saveEcgData() {
        const dataToSave = getCurrentDisplayData();
        if (!dataToSave || !dataToSave.samples || dataToSave.samples.length === 0) {
            alert("Não há dados de ECG visíveis na tela para salvar.");
            return;
        }
        
        const localTimestampStr = getLocalIsoString(dataToSave.timestamp);
        const saveData = {
            timestamp: localTimestampStr,
            sampleRate: appState.ecg.sampleRate,
            uV_per_div: appState.ecg.uV_per_div,
            filterMode: appState.config.ecg.filterMode, // ← ADICIONADO
            samples_base64: arrayBufferToBase64(new Int32Array(dataToSave.samples).buffer)
        };

        const jsonString = JSON.stringify(saveData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        
        a.href = url;
        a.download = `ECG_${localTimestampStr.replace(/[:T]/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function saveCanvasAsPng() {
        const currentData = getCurrentDisplayData();
        const timestamp = currentData.timestamp || new Date();
        const localTimestampStr = getLocalIsoString(timestamp);
        const filename = `ECG-PNG_${localTimestampStr.replace(/[:T]/g, '-')}.png`;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);

        const link = document.createElement('a');
        link.download = filename;
        link.href = tempCanvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function loadEcgData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!data.timestamp || !data.samples_base64) {
                    throw new Error("Formato de arquivo inválido.");
                }
                appState.ecg.loadedData = {
                    samples: base64ToTypedArray(data.samples_base64),
                    timestamp: new Date(data.timestamp),
                    sampleRate: data.sampleRate || 130,
                    uV_per_div: data.uV_per_div || 1000,
                    filterMode: data.filterMode || 'none',
                };
                appState.displayMode = 'loaded';
                redrawStaticEcg();
            } catch (error) {
                alert(`Erro ao carregar o arquivo: ${error.message}`);
                console.error(error);
            }
        };
        reader.readAsText(file);
        fileInputEcg.value = '';
    }


    // =================================================================================
    // --- LÓGICA DE GRAVAÇÃO AUTOMÁTICA ---
    // =================================================================================

    async function handleAutoRecordToggle() {
        if (appState.autoRecord.active) {
            await stopAutoRecording();
        } else {
            await startAutoRecording();
        }
    }

    async function startAutoRecording() {
        if (!polarDevice || !polarDevice.gatt.connected) {
            alert("Por favor, conecte-se ao dispositivo Polar H10 antes de iniciar a gravação.");
            return;
        }

        try {
            const dirHandle = await window.showDirectoryPicker();
            appState.autoRecord.directoryHandle = dirHandle;
            appState.autoRecord.bpmFileHandle = await dirHandle.getFileHandle('registro_bpm.csv', { create: true });
            
            appState.autoRecord.active = true;
            btnAutoRecord.classList.add('recording');
            btnAutoRecord.textContent = 'Interromper Gravação Automática';
            
            appState.ecg.autoSaveBuffer = []; // Limpa o buffer de gravação
            appState.hrSamples = [];
            startAutoSaveInterval(); // Inicia o processo de salvamento de JSON
            
            if (!appState.streamAtivo) {
                console.log("Iniciando stream de dados para gravação automática...");
                if (appState.modo !== 'ecg') {
                    alert("A gravação automática só funciona no modo ECG. Por favor, mude o modo em Configurações.");
                    stopAutoRecording(); // Reverte o estado se o modo estiver errado
                    return;
                }
                await startStream();
            } else {
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
            stopAutoRecording(); // Garante que a UI reverta em caso de erro
        }
    }

    async function stopAutoRecording() {
        if (appState.streamAtivo) {
            await stopStream();
        }

        if (appState.autoRecord.autoSaveInterval) {
            clearInterval(appState.autoRecord.autoSaveInterval);
        }
        if (appState.autoRecord.bpmLogInterval) {
            clearInterval(appState.autoRecord.bpmLogInterval);
        }

        appState.autoRecord = {
            active: false,
            directoryHandle: null,
            bpmFileHandle: null,
            bpmLogInterval: null,
            autoSaveInterval: null,
            lastSaveTimestamp: 0,
            saveEcg: true,
            saveBpm: true,
            bpmIntervalSeconds: 1,
        };

        appState.hrSamples = [];

        chkSaveEcg.checked = true;
        chkSaveBpm.checked = true;
        btnAutoRecord.classList.remove('recording');
        btnAutoRecord.textContent = 'Iniciar Gravação';
        console.log('🛑 Gravação interrompida.');
    }

    function startAutoSaveInterval() {
        if (appState.autoRecord.autoSaveInterval) {
            clearInterval(appState.autoRecord.autoSaveInterval);
        }
        if (!appState.autoRecord.active || !appState.autoRecord.saveEcg) return;

        // Verifica a cada 2 segundos se há dados suficientes para salvar um arquivo
        appState.autoRecord.autoSaveInterval = setInterval(() => {
            const samplesPerScan = appState.config.ecg.larguraTemporal * appState.config.ecg.numLinhas * appState.ecg.sampleRate;
            
            if (appState.ecg.autoSaveBuffer.length >= samplesPerScan) {
                const samplesToSave = appState.ecg.autoSaveBuffer.splice(0, samplesPerScan);
                const scanDurationMs = (samplesPerScan / appState.ecg.sampleRate) * 1000;
                const timestamp = new Date(Date.now() - scanDurationMs);

                autoSaveEcgScan({ samples: samplesToSave, timestamp: timestamp });
            }
        }, 2000);
    }

    async function autoSaveEcgScan(ecgData) {
        if (!appState.autoRecord.active || !appState.autoRecord.saveEcg || !appState.autoRecord.directoryHandle || !ecgData || ecgData.samples.length === 0) {
            return;
        }

        try {
            const localTimestampStr = getLocalIsoString(ecgData.timestamp);
            const filename = `ECG_${localTimestampStr.replace(/[:T]/g, '-')}.json`;
            const fileHandle = await appState.autoRecord.directoryHandle.getFileHandle(filename, { create: true });
            
            const saveData = {
                timestamp: localTimestampStr,
                sampleRate: appState.ecg.sampleRate,
                uV_per_div: appState.ecg.uV_per_div,
                filterMode: appState.config.ecg.filterMode, // ← ADICIONADO
                samples_base64: arrayBufferToBase64(new Int32Array(ecgData.samples).buffer)
            };
            
            const jsonString = JSON.stringify(saveData, null, 2);
            const writable = await fileHandle.createWritable();
            await writable.write(jsonString);
            await writable.close();
            console.log(`ECG salvo automaticamente: ${filename}`);

        } catch (error) {
            console.error('Falha ao salvar ECG automaticamente:', error);
            if (error.name === 'NotAllowedError') {
                alert('A permissão para salvar arquivos foi perdida. A gravação automática foi interrompida.');
                stopAutoRecording();
            }
        }
    }

    function startBpmLogInterval() {
        if (appState.autoRecord.bpmLogInterval) {
            clearInterval(appState.autoRecord.bpmLogInterval);
        }
        if (!appState.autoRecord.active || !appState.autoRecord.saveBpm) return;
        
        const intervalMs = appState.autoRecord.bpmIntervalSeconds * 1000;
        appState.autoRecord.bpmLogInterval = setInterval(logBpmData, intervalMs);
    }

   async function logBpmData() {
        if (!appState.autoRecord.active || !appState.autoRecord.saveBpm || !appState.autoRecord.bpmFileHandle) {
            return;
        }
        
        if (appState.hrSamples.length === 0) {
            console.warn('Nenhuma amostra de HR coletada no intervalo.');
            return;
        }
        
        const numSamples = appState.hrSamples.length;
        const sumHR = appState.hrSamples.reduce((acc, val) => acc + val, 0);
        const avgHR = Math.round(sumHR / numSamples);
        
        appState.hrSamples = []; 
        
        try {
            const timestamp = getLocalIsoString(new Date());
            const line = `${timestamp},${avgHR}\n`;
            
            const writable = await appState.autoRecord.bpmFileHandle.createWritable({ keepExistingData: true });
            const file = await appState.autoRecord.bpmFileHandle.getFile();
            
            if (file.size === 0) {
                await writable.write('timestamp,bpm\n');
            }
            
            await writable.seek(file.size);
            await writable.write(line);
            await writable.close();
            
            console.log(`BPM médio registrado: ${avgHR} (baseado em ${numSamples} amostras)`);

        } catch (error) {
            console.error('Falha ao registrar BPM:', error);
            if (error.name === 'NotAllowedError') {
                alert('A permissão para salvar arquivos foi perdida. A gravação automática foi interrompida.');
                stopAutoRecording();
            }
        }
    }


    // =================================================================================
    // --- FUNÇÃO DE INICIALIZAÇÃO E EVENT LISTENERS ---
    // =================================================================================

    async function updateBatteryStatus() {
        if (!polarDevice || !polarDevice.gatt.connected) {
            batteryStatusValueEl.textContent = 'Desconectado';
            if (batteryUpdateInterval) clearInterval(batteryUpdateInterval);
            return;
        }
        try {
            batteryStatusValueEl.textContent = 'Lendo...';
            const batteryService = await polarDevice.gatt.getPrimaryService(BATTERY_SERVICE_UUID);
            const batteryCharacteristic = await batteryService.getCharacteristic(BATTERY_CHARACTERISTIC_UUID);
            const batteryValue = await batteryCharacteristic.readValue();
            batteryStatusValueEl.textContent = `${batteryValue.getUint8(0)}%`;
        } catch (error) {
            console.error("Erro ao ler nível da bateria:", error);
            batteryStatusValueEl.textContent = 'Erro ao ler';
        }
    }

    function formatTimestamp(date) {
        if (!(date instanceof Date) || isNaN(date)) {
            return { time: 'HH:MM:SS', date: 'DD/MM/AAAA' };
        }
        const HH = String(date.getHours()).padStart(2, '0');
        const MM = String(date.getMinutes()).padStart(2, '0');
        const SS = String(date.getSeconds()).padStart(2, '0');
        const DD = String(date.getDate()).padStart(2, '0');
        const MO = String(date.getMonth() + 1).padStart(2, '0');
        const YYYY = date.getFullYear();
        return { time: `${HH}:${MM}:${SS}`, date: `${DD}/${MO}/${YYYY}` };
    }

    function init() {
        // Modal de Aviso
        btnAgree.addEventListener('click', () => { disclaimerOverlay.style.display = 'none'; });
        btnDisagree.addEventListener('click', () => {
            document.body.innerHTML = `<div style="display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; padding: 20px; font-size: 1.2rem;"><p>Você precisa concordar com os termos para utilizar esta aplicação.</p></div>`;
        });

        // Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.error('Falha no registro do Service Worker:', err);
            });
        }

        // Navegação principal
        Object.keys(menuButtons).forEach(key => {
            menuButtons[key].addEventListener('click', () => changeView(key));
        });
        menuButtons.aquisicao.addEventListener('click', () => {
            if (polarDevice && !appState.streamAtivo) startStream();
            if (batteryUpdateInterval) clearInterval(batteryUpdateInterval);
        });
        menuButtons.conexao.addEventListener('click', () => {
            if (polarDevice && appState.streamAtivo && !appState.autoRecord.active) stopStream();
            if (batteryUpdateInterval) clearInterval(batteryUpdateInterval);
        });
        menuButtons.config.addEventListener('click', async () => {
            if (polarDevice && appState.streamAtivo && !appState.autoRecord.active) await stopStream();
            if (batteryUpdateInterval) clearInterval(batteryUpdateInterval);
            await updateBatteryStatus();
            batteryUpdateInterval = setInterval(updateBatteryStatus, 120000); // Atualiza a cada 2 min
        });

        // Controles da tela de Aquisição
        btnSaveEcg.addEventListener('click', saveEcgData);
        btnSavePng.addEventListener('click', saveCanvasAsPng);
        btnLoadEcg.addEventListener('click', () => fileInputEcg.click());
        fileInputEcg.addEventListener('change', loadEcgData);
        btnShowLastEcg.addEventListener('click', () => {
            if (appState.ecg.lastFullEcg.samples.length === 0 && appState.ecg.rollingBuffer.length === 0) {
                alert("Nenhum dado de ECG foi gravado ainda.");
                return;
            }
            appState.displayMode = 'last';
            redrawStaticEcg();
        });
        btnShowLiveEcg.addEventListener('click', () => {
            appState.displayMode = 'live';
            appState.ecg.startTimestamp = new Date();
            appState.ecg.rollingBuffer = [];
            appState.ecg.buffer = [];
            appState.ecg.scanBuffer = [];
            appState.ecg.needsReset = true;
            if (appState.streamAtivo && !appState.ecg.desenhando) {
                requestAnimationFrame(drawLoop);
            } else if (!appState.streamAtivo) {
                drawGrid();
                drawTimestamp(appState.ecg.startTimestamp);
            }
        });

        // Controles da tela de Configuração
        radioModo.forEach(radio => {
            radio.addEventListener('change', async (e) => {
                if (e.target.value === appState.modo) return;
                if (appState.streamAtivo) {
                    await stopStream();
                    appState.modo = e.target.value;
                    updateUiForMode();
                    await startStream();
                } else {
                    appState.modo = e.target.value;
                    updateUiForMode();
                }
            });
        });
        sliderLargura.addEventListener('input', (e) => {
            appState.config.ecg.larguraTemporal = parseInt(e.target.value);
            larguraLabel.textContent = e.target.value;
            appState.ecg.needsReset = true;
            if (appState.displayMode !== 'live') redrawStaticEcg();
        });
        sliderLinhas.addEventListener('input', (e) => {
            appState.config.ecg.numLinhas = parseInt(e.target.value);
            linhasLabel.textContent = e.target.value;
            appState.ecg.needsReset = true;
            if (appState.displayMode !== 'live') redrawStaticEcg();
        });
        sliderUv.addEventListener('input', (e) => {
            appState.ecg.uV_per_div = parseInt(e.target.value);
            uvLabel.textContent = e.target.value;
            appState.ecg.needsReset = true;
            if (appState.displayMode !== 'live') redrawStaticEcg();
        });
        sliderBpmAvg.addEventListener('input', (e) => {
            const interval = parseInt(e.target.value);
            appState.autoRecord.bpmIntervalSeconds = interval;
            bpmAvgLabel.textContent = `${interval}s`;
            if (appState.autoRecord.active) {
                startBpmLogInterval();
            }
        });
        
        // Gravação Automática
        btnAutoRecord.addEventListener('click', handleAutoRecordToggle);
        chkSaveEcg.addEventListener('change', (e) => {
            appState.autoRecord.saveEcg = e.target.checked;
            if (!appState.autoRecord.saveEcg && !appState.autoRecord.saveBpm) {
                chkSaveBpm.checked = true;
                appState.autoRecord.saveBpm = true;
            }
        });
        chkSaveBpm.addEventListener('change', (e) => {
            appState.autoRecord.saveBpm = e.target.checked;
            if (!appState.autoRecord.saveBpm && !appState.autoRecord.saveEcg) {
                chkSaveEcg.checked = true;
                appState.autoRecord.saveEcg = true;
            }
            if (appState.autoRecord.active && appState.streamAtivo) {
                if (appState.autoRecord.saveBpm) {
                    appState.hrSamples = [];
                    startBpmLogInterval();
                } else {
                    appState.hrSamples = [];
                    if (appState.autoRecord.bpmLogInterval) {
                        clearInterval(appState.autoRecord.bpmLogInterval);
                        appState.autoRecord.bpmLogInterval = null;
                    }
                }
            }
        });

        // Configuração Inicial da UI
        changeView('conexao');
        updateUiForMode();
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        //const initialBpmPeriod = appState.config.ecg.bpmAveragePeriod;
        bpmAvgLabel.textContent = `${appState.autoRecord.bpmIntervalSeconds}s`;
    
        // Controles do filtro de ECG
        const radioFilter = document.querySelectorAll('input[name="ecg-filter"]');
        radioFilter.forEach(r => {
            r.addEventListener('change', (e) => {
                appState.config.ecg.filterMode = e.target.value;
                console.log('Filtro ECG selecionado:', appState.config.ecg.filterMode);
                // Reinicia buffers para evitar transientes
                Object.values(ecgFilterState).forEach(st => {
                    if (Array.isArray(st)) st.length = 0;
                    else Object.keys(st).forEach(k => st[k] = 0);
                });
            });
        });    
    }

    // Inicia a aplicação
    init();
});