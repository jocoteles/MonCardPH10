document.addEventListener('DOMContentLoaded', () => {
    // --- ELEMENTOS DO DOM ---
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
    const statusConexao = document.getElementById('status-conexao');
    const btnConectar = document.getElementById('btn-conectar');
    
    // Elementos de aquisição
    const modoEcgView = document.getElementById('modo-ecg');
    const modoHrppiView = document.getElementById('modo-hrppi');
    const hrValueEl = document.getElementById('hr-value');
    const ppiValueEl = document.getElementById('ppi-value');
    const ppiErrorValueEl = document.getElementById('ppi-error-value');
    const ppiFlagsValueEl = document.getElementById('ppi-flags-value');

    // Elementos de Config
    const radioModo = document.querySelectorAll('input[name="modo"]');
    const configEcgDiv = document.getElementById('config-ecg');
    const configHrppiDiv = document.getElementById('config-hrppi');
    const sliderLargura = document.getElementById('slider-largura');
    const larguraLabel = document.getElementById('largura-label');
    const sliderLinhas = document.getElementById('slider-linhas');
    const linhasLabel = document.getElementById('linhas-label');

    // Canvas
    const canvas = document.getElementById('ecg-canvas');
    const ctx = canvas.getContext('2d');

    // Elementos do Modal de Aviso
    const disclaimerOverlay = document.getElementById('disclaimer-overlay');
    const btnAgree = document.getElementById('btn-agree');
    const btnDisagree = document.getElementById('btn-disagree');

    // --- CONSTANTES BLUETOOTH (Baseado na documentação Polar) ---
    const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_DATA_MTU_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";


    // --- ESTADO DA APLICAÇÃO ---
    let polarDevice = null;
    let pmdControlPoint = null;
    let pmdData = null;
    let appState = {
        modo: 'ecg', // 'ecg' ou 'hrppi'
        streamAtivo: false,
        config: {
            ecg: {
                larguraTemporal: 10, // segundos
                numLinhas: 5,
            }
        },
        ecg: {
            buffer: [],
            sampleRate: 130, // Hz
            desenhando: false,
            currentX: 0,
            currentLine: 0,
            lastY: null,
            uV_per_div: 500,
            needsReset: true,
        }
    };
    
    // --- LÓGICA DE NAVEGAÇÃO ---
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

    // --- LÓGICA DE CONEXÃO BLUETOOTH ---
    // --- LÓGICA DE CONEXÃO BLUETOOTH ---
    btnConectar.addEventListener('click', async () => {
        try {
            statusConexao.textContent = 'Procurando dispositivo...';
            
            // --- MUDANÇA CRÍTICA AQUI ---
            // Em vez de filtrar pelo serviço, filtramos pelo nome do dispositivo.
            // O serviço PMD é listado como opcional para garantir o acesso após a conexão.
            polarDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Polar H10' }
                ],
                optionalServices: [PMD_SERVICE_UUID]
            });
            // --- FIM DA MUDANÇA ---

            statusConexao.textContent = `Conectando a ${polarDevice.name}...`;
            const server = await polarDevice.gatt.connect();
            
            statusConexao.textContent = 'Obtendo serviço PMD...';
            const service = await server.getPrimaryService(PMD_SERVICE_UUID);

            statusConexao.textContent = 'Obtendo características...';
            pmdControlPoint = await service.getCharacteristic(PMD_CONTROL_POINT_UUID);
            pmdData = await service.getCharacteristic(PMD_DATA_MTU_UUID);

            statusConexao.textContent = `Conectado a ${polarDevice.name}`;
            btnConectar.textContent = 'Conectado';
            btnConectar.disabled = true;

            polarDevice.addEventListener('gattserverdisconnected', onDisconnect);

        } catch (error) {
            if (error.name === 'NotFoundError') {
                console.log('Busca de dispositivo cancelada pelo usuário.');
                statusConexao.textContent = 'Busca cancelada. Clique para tentar novamente.';
            } else {
                console.error('Erro na conexão Bluetooth:', error);
                statusConexao.textContent = `Erro: ${error.message}`;
            }
        }
    });

    function onDisconnect() {
        statusConexao.textContent = 'Dispositivo desconectado.';
        btnConectar.textContent = 'Conectar ao Dispositivo';
        btnConectar.disabled = false;
        polarDevice = null;
        stopStream();
    }
    
    // --- LÓGICA DE CONTROLE DE STREAM ---

    async function startStream() {
        if (!polarDevice || !pmdControlPoint || appState.streamAtivo) return;

        try {
            appState.streamAtivo = true;
            await pmdData.startNotifications();

            if (appState.modo === 'ecg') {
                pmdData.addEventListener('characteristicvaluechanged', handleEcgData);
                
                const startEcgCommand = new Uint8Array([
                    0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0E, 0x00
                ]);
                await pmdControlPoint.writeValue(startEcgCommand);
                
                appState.ecg.needsReset = true;
                if (!appState.ecg.desenhando) requestAnimationFrame(drawLoop);

            } else if (appState.modo === 'hrppi') {
                pmdData.addEventListener('characteristicvaluechanged', handlePpiData);
                await pmdControlPoint.writeValue(new Uint8Array([0x02, 0x03]));
            }
        } catch (error) {
            console.error("Erro ao iniciar stream:", error);
            appState.streamAtivo = false;
        }
    }

    async function stopStream() {
        if (!polarDevice || !pmdControlPoint || !appState.streamAtivo) return;
        
        try {
            const measurementType = appState.modo === 'ecg' ? 0x00 : 0x03;
            await pmdControlPoint.writeValue(new Uint8Array([0x03, measurementType]));

            await pmdData.stopNotifications();
            pmdData.removeEventListener('characteristicvaluechanged', handleEcgData);
            pmdData.removeEventListener('characteristicvaluechanged', handlePpiData);

        } catch (error) {
            console.error("Erro ao parar stream:", error);
        } finally {
            appState.streamAtivo = false;
        }
    }

    function handleEcgData(event) {
        const value = event.target.value;
        const data = new DataView(value.buffer);
        
        // Fator de escala fixo derivado da documentação
        // Alcance de ±20,000 µV para uma resolução de 14 bits (±8191)
        const ECG_SCALE_FACTOR = 20000 / 8191;

        for (let i = 10; i < data.byteLength; i += 3) {
            // 1. Lê o valor bruto como um número de 24 bits com sinal.
            const raw24bitSample = (data.getInt8(i + 2) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i);
            // 2. Extrai o valor real de 14 bits com sinal para garantir que estamos no range correto.
            const raw14bitSample = (raw24bitSample << 18) >> 18;            
            // 3. Aplica o fator de escala para obter o valor final em microvolts (µV)
            const ecgSampleInMicrovolts = raw14bitSample * ECG_SCALE_FACTOR;
            appState.ecg.buffer.push(ecgSampleInMicrovolts);
        }
    }

    function handlePpiData(event) {
        const data = event.target.value;
        const hr = data.getUint8(10);
        const ppi = data.getUint16(11, true); // true para little-endian
        const error = data.getUint16(13, true);
        const flags = data.getUint8(15);
        
        const flagDetails = [];
        if (flags & 0b00000001) flagDetails.push('PP Inválido');
        if (!(flags & 0b00000010)) flagDetails.push('Contato Ruim');
        if (flags & 0b00000100) flagDetails.push('Contato Não Sup.');

        hrValueEl.textContent = hr;
        ppiValueEl.textContent = ppi;
        ppiErrorValueEl.textContent = error;
        ppiFlagsValueEl.textContent = flagDetails.length > 0 ? flagDetails.join(', ') : 'OK';
    }
    
    // --- LÓGICA DE CONFIGURAÇÃO E UI ---
    function updateUiForMode() {
        if (appState.modo === 'ecg') {
            modoEcgView.style.display = 'block';
            modoHrppiView.style.display = 'none';
            configEcgDiv.style.display = 'block';
            configHrppiDiv.style.display = 'none';
        } else {
            modoEcgView.style.display = 'none';
            modoHrppiView.style.display = 'block';
            configEcgDiv.style.display = 'none';
            configHrppiDiv.style.display = 'block';
        }
    }

    radioModo.forEach(radio => {
        radio.addEventListener('change', async (e) => {
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
        appState.ecg.needsReset = true; // Força o redesenho do grid
    });
    
    sliderLinhas.addEventListener('input', (e) => {
        appState.config.ecg.numLinhas = parseInt(e.target.value);
        linhasLabel.textContent = e.target.value;
        appState.ecg.needsReset = true; // Força o redesenho do grid
    });

    // --- LÓGICA DE RENDERIZAÇÃO NO CANVAS ---
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();

        // Define o tamanho real do canvas em pixels físicos
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        // --- CORREÇÃO CRÍTICA ---
        // Reseta qualquer transformação anterior antes de aplicar a nova escala.
        // Isso impede o efeito de escala cumulativo.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // --- FIM DA CORREÇÃO ---

        // Aplica a escala para corresponder à densidade de pixels do dispositivo
        ctx.scale(dpr, dpr);
        
        // Força o redesenho do grid com as novas dimensões corretas
        appState.ecg.needsReset = true;
    }

    function drawGrid() {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const numLinhas = appState.config.ecg.numLinhas;
        const lineHeight = height / numLinhas;
        const secs = appState.config.ecg.larguraTemporal;
        const pixelsPerSecond = width / secs;

        // --- NÍVEL 1: Malha Fina (Minor Grid) ---
        ctx.strokeStyle = '#e0e0e0'; // Cinza bem claro
        ctx.lineWidth = 0.5;

        // Linhas Horizontais Finas (10 por divisão principal)
        const minorHorizontalStep = lineHeight / 10;
        for (let y = minorHorizontalStep; y < height; y += minorHorizontalStep) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Linhas Verticais Finas (10 por segundo, ou seja, a cada 0.1s)
        const minorVerticalStep = pixelsPerSecond / 10;
        for (let x = minorVerticalStep; x < width; x += minorVerticalStep) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // --- NÍVEL 2: Malha Intermediária (A CADA 0.5 SEGUNDOS) ---
        ctx.strokeStyle = '#cccccc'; // Um cinza um pouco mais escuro
        ctx.lineWidth = 0.75; // Um pouco mais espessa que a fina
        
        const pixelsPerHalfSecond = pixelsPerSecond / 2;
        for (let x = pixelsPerHalfSecond; x < width; x += pixelsPerSecond) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // --- NÍVEL 3: Malha Grossa (Major Grid) ---
        ctx.strokeStyle = '#aaaaaa'; // Cinza escuro
        ctx.lineWidth = 1;

        // Linhas Horizontais Grossas
        for (let i = 1; i < numLinhas; i++) {
            const y = i * lineHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Linhas Verticais Grossas (a cada segundo)
        for (let i = 1; i < secs; i++) {
            const x = i * pixelsPerSecond;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // --- Texto de Calibração (Legenda) ---
        const uV_per_div = Math.round(lineHeight / appState.ecg.gain);
        
        const text1 = `${appState.ecg.uV_per_div} µV/div`;
        const text2 = '1 s/div';
        
        ctx.fillStyle = '#1a1a1a'; // Cor do texto
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        
        ctx.fillText(text1, 10, height - 28);
        ctx.fillText(text2, 10, height - 10);
    }
    
    function drawLoop() {
        appState.ecg.desenhando = true;

        if (appState.ecg.needsReset) {
            drawGrid();
            appState.ecg.currentX = 0;
            appState.ecg.currentLine = 0;
            appState.ecg.lastY = null;
            appState.ecg.needsReset = false;
        }

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const lineHeight = height / appState.config.ecg.numLinhas;

        // --- CÁLCULO DINÂMICO DO GANHO ---
        // O ganho é a altura em pixels de uma divisão, dividido pela escala em µV.
        const gain = lineHeight / appState.ecg.uV_per_div;
        // --- FIM DA CORREÇÃO ---

        const pixelsPerSecond = width / appState.config.ecg.larguraTemporal;
        const pixelsPerSample = pixelsPerSecond / appState.ecg.sampleRate;
        const lineOffsetY = (appState.ecg.currentLine * lineHeight) + (lineHeight / 2);
        
        ctx.strokeStyle = '#0052cc';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        if (appState.ecg.lastY !== null) {
            ctx.moveTo(appState.ecg.currentX, appState.ecg.lastY);
        }

        while(appState.ecg.buffer.length > 0) {
            const sample = appState.ecg.buffer.shift();
            
            // Aplica o ganho calculado dinamicamente
            const currentY = lineOffsetY - (sample * gain); 

            if (appState.ecg.lastY === null) {
                ctx.moveTo(appState.ecg.currentX, currentY);
            } else {
                ctx.lineTo(appState.ecg.currentX, currentY);
            }
            
            appState.ecg.currentX += pixelsPerSample;
            appState.ecg.lastY = currentY;

            if (appState.ecg.currentX >= width) {
                appState.ecg.currentLine++;
                appState.ecg.currentX = 0;
                appState.ecg.lastY = null;
                
                if (appState.ecg.currentLine >= appState.config.ecg.numLinhas) {
                    appState.ecg.currentLine = 0;
                    drawGrid();
                }
                break;
            }
        }
        
        ctx.stroke();

        if (appState.streamAtivo && appState.modo === 'ecg') {
            requestAnimationFrame(drawLoop);
        } else {
            appState.ecg.desenhando = false;
        }
    }

    // --- INICIALIZAÇÃO ---
    function init() {
        // --- LÓGICA DO MODAL DE AVISO ---
        btnAgree.addEventListener('click', () => {
            disclaimerOverlay.style.display = 'none';
        });

        btnDisagree.addEventListener('click', () => {
            document.body.innerHTML = `
                <div style="display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; padding: 20px; font-size: 1.2rem;">
                    <p>Você precisa concordar com os termos para utilizar esta aplicação.</p>
                </div>
            `;
        });
        
        // Registro do Service Worker para PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.error('Falha no registro do Service Worker:', err);
            });
        }
        
        changeView('conexao');
        updateUiForMode();
        
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Inicia/para streams quando o menu de aquisição fica visível/oculto
        menuButtons.aquisicao.addEventListener('click', () => {
             if (polarDevice && !appState.streamAtivo) startStream();
        });
        menuButtons.conexao.addEventListener('click', () => {
             if (polarDevice && appState.streamAtivo) stopStream();
        });
         menuButtons.config.addEventListener('click', () => {
             if (polarDevice && appState.streamAtivo) stopStream();
        });
    }

    init();
});