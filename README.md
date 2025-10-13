# ❤️ Monitor Cardíaco PWA para Polar H10

---

> ## ⚠️ AVISO IMPORTANTE
>
> **Este projeto é estritamente educacional e experimental.**
>
> Ele **não possui certificação da ANVISA** ou de qualquer outra agência regulatória. As informações exibidas **NÃO DEVEM SER UTILIZADAS** para diagnóstico médico, autoavaliação ou como substituto de uma consulta profissional.
>
> A aplicação pode apresentar interpretações incorretas, incluindo **falsos positivos e falsos negativos** de qualquer condição. Os desenvolvedores **não se responsabilizam** por quaisquer decisões ou ações tomadas com base nos dados apresentados por este software.

---

## Sobre o Projeto

[Este software](https://jocoteles.github.io/MonCardPH10/) é um Progressive Web App (PWA) de código aberto que funciona como uma ferramenta avançada de aquisição e visualização de dados do monitor cardíaco **Polar H10**. Utilizando a **API Web Bluetooth**, a aplicação permite a visualização em tempo real, a análise e, mais importante, a **gravação contínua** de dados de Eletrocardiograma (ECG) e Frequência Cardíaca.

O projeto foi desenvolvido em JavaScript puro (vanilla), sem frameworks, com foco em performance, clareza de código e no uso de APIs modernas do navegador para oferecer uma experiência rica e funcional.

## Funcionalidades

### Conexão e Visualização em Tempo Real
- **Conexão Bluetooth:** Conecta-se diretamente ao Polar H10 através do navegador, sem necessidade de aplicativos intermediários.
- **Visualização de ECG:** Renderiza o sinal de ECG em um canvas HTML5, com alta performance e traçado contínuo.
- **Modo HR/PPI:** Exibe dados de frequência cardíaca, intervalo RR (pico a pico) e flags de qualidade do sinal diretamente do sensor.

### Análise e Ferramentas de ECG
- **Cálculo de BPM a partir do ECG:** Implementa um algoritmo robusto e autocorretivo (baseado em Pan-Tompkins) para calcular e exibir a frequência cardíaca diretamente do traçado de ECG.
- **Gráfico Interativo e Configurável:** Permite ajustar a **janela de tempo** (eixo X, 1-60s), o **número de linhas** e a **amplitude do sinal** (eixo Y, µV/div) para uma análise visual detalhada.
- **Exportação e Importação de Dados:**
    - Salve a visualização atual do gráfico de ECG como uma imagem **`.png`**.
    - Exporte os dados brutos do ECG em um arquivo **`.json`** para análise posterior.
    - Carregue um arquivo `.json` previamente salvo para re-visualizar e analisar uma gravação.

### Gravação Automática Contínua
- **Gravação em Segundo Plano:** Selecione uma pasta no seu dispositivo e inicie uma gravação de longa duração que funciona continuamente, mesmo se você navegar para outras abas do aplicativo.
- **Múltiplos Formatos de Saída:** O usuário pode escolher salvar:
    - O **ECG completo** em arquivos `.json` sequenciais e com timestamp local.
    - Um registro contínuo da **Frequência Cardíaca** em um único arquivo `.csv`, ideal para análise de séries temporais.
    - Ambos os formatos simultaneamente.

### Progressive Web App (PWA)
- **Instalável:** Pode ser "instalado" na tela inicial de dispositivos móveis e desktops para acesso rápido.
- **Funcionalidade Offline:** Permite carregar e visualizar arquivos de ECG previamente salvos mesmo sem conexão com a internet.

## Tecnologias Utilizadas

- **HTML5**
- **CSS3** (Estilização pura, sem frameworks)
- **JavaScript (ES6+)**
- **API Web Bluetooth:** Para comunicação com o Polar H10.
- **API HTML5 Canvas:** Para a renderização do gráfico de ECG.
- **File System Access API:** Para permitir a gravação contínua de arquivos em uma pasta local do usuário.
- **Service Worker & Manifest.json:** Para as funcionalidades de PWA.

## Como Executar

### 1. Desenvolvimento Local

A API Web Bluetooth exige um contexto seguro (HTTPS ou `localhost`). A forma mais simples de rodar localmente é:
1.  Clone este repositório.
2.  Instale a extensão **Live Server** no Visual Studio Code.
3.  Clique com o botão direito no `index.html` e selecione "Open with Live Server". Isso criará um servidor local, geralmente já habilitado para HTTPS.

### 2. Deployment (GitHub Pages)

1.  Envie os arquivos do projeto para um repositório no GitHub.
2.  No seu repositório, vá em `Settings` > `Pages`.
3.  Na seção `Build and deployment`, em `Source`, selecione `Deploy from a branch`.
4.  Escolha o branch `main` (ou `master`) e a pasta `/ (root)`.
5.  Salve e aguarde alguns minutos. Seu PWA estará online no endereço fornecido.

## Referência

A implementação da comunicação Bluetooth e o parsing dos dados foram baseados firmemente na documentação oficial do **Polar Measurement Data** e no SDK fornecido pela Polar.