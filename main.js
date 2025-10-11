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

    // --- CONSTANTES BLUETOOTH (Baseado na documentação Polar) ---
    const PMD_SERVICE_UUID = "fb005c80-02e7-f387-1cad-8acd2d8df0c";
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
            gain: 0.5, // Fator de amplificação do sinal no canvas
            needsReset: true
        }
    };
    
    // --- LÓGICA DE NAVEGAÇÃO ---
    function changeView(viewName) {
        Object.values(views).forEach(v => v.classList.remove('active'));
        Object.values(menuButtons).forEach(b => b.classList.remove('active'));
        views[viewName].classList.add('active');
        menuButtons[viewName].classList.add('active');
    }

    Object.keys(menuButtons).forEach(key => {
        menuButtons[key].addEventListener('click', () => changeView(key));
    });

    // --- LÓGICA DE CONEXÃO BLUETOOTH ---
    btnConectar.addEventListener('click', async () => {
        try {
            statusConexao.textContent = 'Procurando dispositivo...';
            polarDevice = await navigator.bluetooth.requestDevice({
                filters: [{ services: [PMD_SERVICE_UUID] }],
                acceptAllDevices: false,
            });

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
            console.error('Erro na conexão Bluetooth:', error);
            statusConexao.textContent = `Erro: ${error.message}`;
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
            if (appState.modo === 'ecg') {
                await pmdData.startNotifications();
                pmdData.addEventListener('characteristicvaluechanged', handleEcgData);
                // Comando para iniciar ECG (tipo 0)
                await pmdControlPoint.writeValue(new Uint8Array([0x02, 0x00]));
                appState.ecg.needsReset = true;
                if (!appState.ecg.desenhando) requestAnimationFrame(drawLoop);

            } else if (appState.modo === 'hrppi') {
                await pmdData.startNotifications();
                pmdData.addEventListener('characteristicvaluechanged', handlePpiData);
                // Comando para iniciar PPI (tipo 3)
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
            // Comando para parar a medição
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

    // --- LÓGICA DE PARSING DE DADOS ---
    function handleEcgData(event) {
        const value = event.target.value;
        const data = new DataView(value.buffer);
        // ECG data começa no byte 10
        for (let i = 10; i < data.byteLength; i += 3) {
            // Ler um valor de 24 bits com sinal (little-endian)
            let ecgSample = (data.getInt8(i + 2) << 16) | (data.getUint8(i + 1) << 8) | data.getUint8(i);
            appState.ecg.buffer.push(ecgSample);
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
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        appState.ecg.needsReset = true; // Redesenhar ao redimensionar
    }

    function drawGrid() {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const numLinhas = appState.config.ecg.numLinhas;
        const lineHeight = height / numLinhas;
        const secs = appState.config.ecg.larguraTemporal;

        ctx.strokeStyle = '#222';
        ctx.lineWidth = 1;

        // Linhas Horizontais
        for (let i = 1; i < numLinhas; i++) {
            const y = i * lineHeight;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Linhas Verticais
        for (let i = 0; i <= secs; i++) {
            const x = (i / secs) * width;
            // Linhas de 0.5s
            if(i < secs) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(x + (width / secs / 2), 0);
                ctx.lineTo(x + (width / secs / 2), height);
                ctx.stroke();
            }
            // Linhas de 1s
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
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
        const pixelsPerSecond = width / appState.config.ecg.larguraTemporal;
        const pixelsPerSample = pixelsPerSecond / appState.ecg.sampleRate;
        const lineOffsetY = (appState.ecg.currentLine * lineHeight) + (lineHeight / 2);
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        if (appState.ecg.lastY !== null) {
            ctx.moveTo(appState.ecg.currentX, appState.ecg.lastY);
        }

        while(appState.ecg.buffer.length > 0) {
            const sample = appState.ecg.buffer.shift(); // Pega o primeiro sample
            
            // Mapeia o valor do ECG (em µV) para uma coordenada Y no canvas
            // O valor de 'gain' e o divisor são empíricos, ajuste para melhor visualização
            const currentY = lineOffsetY - (sample * appState.ecg.gain / 1000); 

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
                    drawGrid(); // Limpa e redesenha o grid para começar de novo
                }
                // Quebra o loop para renderizar o que já foi processado
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