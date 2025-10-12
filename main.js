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

    // --- CONSTANTES BLUETOOTH ---
    const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_CONTROL_POINT_UUID = "fb005c81-02e7-f387-1cad-8acd2d8df0c8";
    const PMD_DATA_MTU_UUID = "fb005c82-02e7-f387-1cad-8acd2d8df0c8";
    const HR_SERVICE_UUID = "0000180d-0000-1000-8000-00805f9b34fb";
    const HR_CHARACTERISTIC_UUID = "00002a37-0000-1000-8000-00805f9b34fb";


    // --- ESTADO DA APLICAÇÃO ---
    let polarDevice = null;
    let pmdControlPoint = null;
    let pmdData = null;
    let hrCharacteristic = null; // Característica específica para HR/PPI
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
            uV_per_div: 1000,
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
    btnConectar.addEventListener('click', async () => {
        try {
            statusConexao.textContent = 'Procurando dispositivo...';
            
            // Solicita o dispositivo com acesso opcional a ambos os serviços
            polarDevice = await navigator.bluetooth.requestDevice({
                filters: [
                    { namePrefix: 'Polar H10' }
                ],
                optionalServices: [PMD_SERVICE_UUID, HR_SERVICE_UUID]
            });

            statusConexao.textContent = `Conectando a ${polarDevice.name}...`;
            const server = await polarDevice.gatt.connect();
            
            statusConexao.textContent = 'Obtendo serviços e características...';
            // Obtém características PMD para ECG
            const pmdService = await server.getPrimaryService(PMD_SERVICE_UUID);
            pmdControlPoint = await pmdService.getCharacteristic(PMD_CONTROL_POINT_UUID);
            pmdData = await pmdService.getCharacteristic(PMD_DATA_MTU_UUID);

            // Obtém característica de HR para HR/PPI
            const hrService = await server.getPrimaryService(HR_SERVICE_UUID);
            hrCharacteristic = await hrService.getCharacteristic(HR_CHARACTERISTIC_UUID);

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
        pmdControlPoint = null;
        pmdData = null;
        hrCharacteristic = null;
        stopStream(); // Garante que o estado seja limpo
    }
    
    // --- LÓGICA DE CONTROLE DE STREAM (UNIFICADA) ---
    async function startStream() {
        if (!polarDevice || !polarDevice.gatt.connected || appState.streamAtivo) return;

        try {
            appState.streamAtivo = true;

            if (appState.modo === 'ecg') {
                console.log("▶️ Iniciando stream ECG...");
                if (!pmdControlPoint || !pmdData) {
                    throw new Error("Características PMD não estão disponíveis.");
                }
                
                await pmdData.startNotifications();
                pmdData.addEventListener('characteristicvaluechanged', handleEcgData);
                
                // Comando para iniciar ECG
                const startEcgCommand = new Uint8Array([
                    0x02, 0x00, 0x00, 0x01, 0x82, 0x00, 0x01, 0x01, 0x0E, 0x00
                ]);
                await pmdControlPoint.writeValue(startEcgCommand);
                
                appState.ecg.needsReset = true;
                if (!appState.ecg.desenhando) requestAnimationFrame(drawLoop);
                console.log("✅ Stream ECG iniciado.");

            } else if (appState.modo === 'hrppi') {
                console.log("▶️ Iniciando stream HR/PPI...");
                if (!hrCharacteristic) {
                    throw new Error("Característica de HR não está disponível.");
                }

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
        
        try {
            if (appState.modo === 'ecg' && pmdControlPoint) {
                console.log("🛑 Parando stream ECG...");
                await pmdData.stopNotifications();
                pmdData.removeEventListener('characteristicvaluechanged', handleEcgData);
                // Comando para parar ECG
                await pmdControlPoint.writeValue(new Uint8Array([0x03, 0x00]));
                console.log("⏹️ Stream ECG parado.");

            } else if (appState.modo === 'hrppi' && hrCharacteristic) {
                console.log("🛑 Parando stream HR/PPI...");
                await hrCharacteristic.stopNotifications();
                hrCharacteristic.removeEventListener('characteristicvaluechanged', handlePpiData);
                console.log("⏹️ Stream HR/PPI parado.");
            }
        } catch (error) {
            // Ignora erros de "GATT operation already in progress" que podem ocorrer em trocas rápidas
            if (error.name !== 'NetworkError') {
                 console.error("Erro ao parar stream:", error);
            }
        } finally {
            appState.streamAtivo = false;
        }
    }

    // --- HANDLERS DE DADOS ---
    function handleEcgData(event) {
        const value = event.target.value;
        const data = new DataView(value.buffer);
        
        // O loop agora usa o valor bruto diretamente, como na versão HR/PPI.
        for (let i = 10; i < data.byteLength; i += 3) {
            // Lê o valor de 24 bits com sinal diretamente do buffer.
            const rawSample = (data.getInt8(i + 2) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i);            
            // Adiciona o valor bruto ao buffer, sem aplicar o fator de escala para µV.
            appState.ecg.buffer.push(rawSample);
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
                ppiValues.push(Math.round((rr / 1024) * 1000)); // Converte para ms
                index += 2;
            }
        }

        hrValueEl.textContent = hr;
        ppiValueEl.textContent = ppiValues.length > 0 ? ppiValues.join(', ') : '--';
        ppiErrorValueEl.textContent = '--'; // O serviço padrão não fornece erro estimado
        ppiFlagsValueEl.textContent = 'OK'; // O serviço padrão não fornece flags de contato
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
    });
    
    sliderLinhas.addEventListener('input', (e) => {
        appState.config.ecg.numLinhas = parseInt(e.target.value);
        linhasLabel.textContent = e.target.value;
        appState.ecg.needsReset = true;
    });

    // --- LÓGICA DE RENDERIZAÇÃO NO CANVAS ---
    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Reseta transformações
        ctx.scale(dpr, dpr);
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

        // Malha Fina
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        const minorHorizontalStep = lineHeight / 10;
        for (let y = minorHorizontalStep; y < height; y += minorHorizontalStep) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }
        const minorVerticalStep = pixelsPerSecond / 10;
        for (let x = minorVerticalStep; x < width; x += minorVerticalStep) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }

        // Malha Intermediária
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 0.75;
        for (let x = pixelsPerSecond / 2; x < width; x += pixelsPerSecond) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }

        // Malha Grossa
        ctx.strokeStyle = '#aaaaaa';
        ctx.lineWidth = 1;
        for (let i = 1; i < numLinhas; i++) {
            const y = i * lineHeight;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        }
        for (let i = 1; i < secs; i++) {
            const x = i * pixelsPerSecond;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
        }
        
        // Legenda
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${appState.ecg.uV_per_div} µV/div`, 10, height - 28);
        ctx.fillText('1 s/div', 10, height - 10);
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
        const gain = lineHeight / appState.ecg.uV_per_div;
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
            const currentY = lineOffsetY - (sample * gain); 

            if (appState.ecg.lastY === null) {
                ctx.moveTo(appState.ecg.currentX, currentY);
            } else {
                ctx.lineTo(appState.ecg.currentX, currentY);
            }
            
            appState.ecg.currentX += pixelsPerSample;
            appState.ecg.lastY = currentY;

            if (appState.ecg.currentX >= width) {
                ctx.stroke(); // Finaliza o traço atual antes de mudar de linha
                appState.ecg.currentLine++;
                appState.ecg.currentX = 0;
                appState.ecg.lastY = null;
                
                if (appState.ecg.currentLine >= appState.config.ecg.numLinhas) {
                    appState.ecg.currentLine = 0;
                    drawGrid(); // Limpa e redesenha a grade para o novo ciclo
                }
                ctx.beginPath(); // Inicia um novo traço na nova posição
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
        // Lógica do Modal de Aviso
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
        
        // Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(err => {
                console.error('Falha no registro do Service Worker:', err);
            });
        }
        
        changeView('conexao');
        updateUiForMode();
        
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        // Gerenciamento do stream com base na navegação
        menuButtons.aquisicao.addEventListener('click', () => {
             if (polarDevice && !appState.streamAtivo) startStream();
        });
        [menuButtons.conexao, menuButtons.config].forEach(btn => {
            btn.addEventListener('click', () => {
                if (polarDevice && appState.streamAtivo) stopStream();
            });
        });
    }

    init();
});