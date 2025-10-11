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

Este é um Progressive Web App (PWA) de código aberto que se conecta ao monitor cardíaco **Polar H10** utilizando a **API Web Bluetooth**. A aplicação permite a visualização em tempo real de dados de Eletrocardiograma (ECG) e Frequência Cardíaca/Intervalo Pico a Pico (HR/PPI).

O projeto foi desenvolvido com uma filosofia pragmática, privilegiando a clareza do código e a performance, sendo implementado em JavaScript puro, sem o uso de frameworks.

## Funcionalidades

- **Conexão Bluetooth:** Conecta-se diretamente ao Polar H10 através do navegador.
- **Visualização de ECG em Tempo Real:** Renderiza o sinal de ECG em um canvas HTML5, com alta performance e sem bibliotecas externas.
- **Gráfico Configurável:** Permite ajustar a largura temporal (1-60s) e o número de linhas de traçado (1-10) para melhor análise.
- **Modo HR/PPI:** Exibe dados de frequência cardíaca, intervalo RR e flags de qualidade do sinal.
- **PWA Instalável:** Pode ser "instalado" na tela inicial de dispositivos móveis e funciona offline.

## Tecnologias Utilizadas

- **HTML5**
- **CSS3** (Estilização pura, sem frameworks)
- **JavaScript (ES6+)**
- **API Web Bluetooth**
- **API HTML5 Canvas**
- **Service Worker & Manifest.json** (para funcionalidades PWA)

## Como Executar

### 1. Desenvolvimento Local

O Web Bluetooth exige um contexto seguro (HTTPS). A forma mais simples de rodar localmente é:
1. Clone este repositório.
2. Instale a extensão **Live Server** no Visual Studio Code.
3. Clique com o botão direito no `index.html` e selecione "Open with Live Server". O Live Server criará um servidor local com HTTPS.

### 2. Deployment (GitHub Pages)

1. Envie os arquivos do projeto para um repositório no GitHub.
2. No seu repositório, vá em `Settings` > `Pages`.
3. Na seção `Build and deployment`, em `Source`, selecione `Deploy from a branch`.
4. Escolha o branch `main` (ou `master`) e a pasta `/ (root)`.
5. Salve e aguarde alguns minutos. Seu PWA estará online no endereço fornecido.

## Referência

A implementação da comunicação Bluetooth e o parsing dos dados foram baseados firmemente na documentação oficial do **Polar Measurement Data** fornecida pela Polar.