"""
Módulo para extrair a frequência cardíaca de arquivos JSON contendo dados de ECG
produzidos pelo aplicativo MonitorCardiacoPH10.
"""

import json
import base64
import numpy as np
import pandas as pd
from scipy.signal import butter, filtfilt, find_peaks
import glob
import os
from datetime import datetime, timedelta

def carregar_dados_ecg(caminho_arquivo):
    """
    Carrega e decodifica os dados de ECG de um arquivo JSON.

    Argumentos:
        caminho_arquivo (str): O caminho para o arquivo JSON.

    Retorna:
        tuple: Uma tupla contendo o timestamp, a taxa de amostragem e as amostras de ECG.
    """
    with open(caminho_arquivo, 'r') as f:
        dados = json.load(f)

    timestamp_str = dados['timestamp']
    taxa_amostragem = dados.get('sampleRate', 130)  # Valor padrão de 130 Hz se não for encontrado
    amostras_base64 = dados['samples_base64']
    bytes_decodificados = base64.b64decode(amostras_base64)
    amostras = np.frombuffer(bytes_decodificados, dtype=np.int32)

    return timestamp_str, taxa_amostragem, amostras

def filtro_passa_banda_agressivo(dados, freq_corte_baixa, freq_corte_alta, taxa_amostragem, ordem=4):
    """
    Aplica um filtro passa-banda Butterworth de 4ª ordem para remover ruído.

    Argumentos:
        dados (np.array): O sinal de ECG bruto.
        freq_corte_baixa (float): A frequência de corte inferior do filtro.
        freq_corte_alta (float): A frequência de corte superior do filtro.
        taxa_amostragem (int): A taxa de amostragem do sinal.
        ordem (int): A ordem do filtro.

    Retorna:
        np.array: O sinal de ECG filtrado.
    """
    nyquist = 0.5 * taxa_amostragem
    corte_baixo = freq_corte_baixa / nyquist
    corte_alto = freq_corte_alta / nyquist
    b, a = butter(ordem, [corte_baixo, corte_alto], btype='band')
    sinal_filtrado = filtfilt(b, a, dados)
    return sinal_filtrado

def extrair_frequencia_cardiaca(sinal_ecg, taxa_amostragem):
    """
    Extrai a frequência cardíaca de um sinal de ECG aplicando filtros e detecção de picos.

    Argumentos:
        sinal_ecg (np.array): O array de amostras de ECG.
        taxa_amostragem (int): A taxa de amostragem do sinal.

    Retorna:
        int: A frequência cardíaca média em batimentos por minuto (BPM), ou None se não forem encontrados picos.
    """
    if len(sinal_ecg) < taxa_amostragem * 2: # Precisa de pelo menos 2 segundos de dados
        return None

    # Etapa 1: Filtragem passa-banda para focar no complexo QRS (5-25 Hz é uma boa faixa)
    sinal_filtrado = filtro_passa_banda_agressivo(sinal_ecg, freq_corte_baixa=5.0, freq_corte_alta=25.0, taxa_amostragem=taxa_amostragem)

    # Etapa 2: Derivada para encontrar altas taxas de variação (inclinações do pico R)
    derivada_ecg = np.diff(sinal_filtrado)

    # Etapa 3: Elevar ao quadrado para realçar os picos e tornar todos os valores positivos
    ecg_ao_quadrado = derivada_ecg**2

    # Etapa 4: Média móvel para suavizar o sinal e obter um formato de onda mais claro
    largura_janela_ms = int(0.150 * taxa_amostragem)
    media_movel_ecg = np.convolve(ecg_ao_quadrado, np.ones(largura_janela_ms)/largura_janela_ms, mode='same')

    # Etapa 5: Detecção de Picos R
    distancia_min_picos = int(0.3 * taxa_amostragem) # Mínimo de 0.3s entre batidas (limite de 200 bpm)
    altura_pico = 0.4 * np.max(media_movel_ecg)
    indices_picos, _ = find_peaks(media_movel_ecg, height=altura_pico, distance=distancia_min_picos)

    if len(indices_picos) < 2:
        return None  # Não é possível calcular a FC com menos de dois picos

    # Etapa 6: Calcular os intervalos R-R em segundos
    intervalos_rr = np.diff(indices_picos) / taxa_amostragem

    # Etapa 7: Calcular a frequência cardíaca a partir da média dos intervalos R-R
    media_rr_final = np.mean(intervalos_rr)
    fc_media = 60.0 / media_rr_final

    return int(fc_media)

def processar_ecg_em_janelas(intervalo_segundos):
    """
    Carrega todos os arquivos JSON, cria um fluxo de dados contínuo e o processa em janelas de tempo.
    """
    caminho_script = os.path.dirname(os.path.abspath(__file__))
    padrao_arquivo = os.path.join(caminho_script, 'ECG_*.json')
    arquivos_json = sorted(glob.glob(padrao_arquivo))

    if not arquivos_json:
        print("Nenhum arquivo 'ECG_*.json' encontrado no diretório do script.")
        return

    print(f"Encontrados {len(arquivos_json)} arquivos. Carregando e concatenando dados...")

    todas_as_amostras = []
    timestamp_inicial_str = None
    taxa_amostragem = 130  # Assumir valor padrão

    for arquivo in arquivos_json:
        timestamp_str, ts_arquivo, amostras = carregar_dados_ecg(arquivo)
        if timestamp_inicial_str is None:
            timestamp_inicial_str = timestamp_str
            taxa_amostragem = ts_arquivo
        todas_as_amostras.append(amostras)

    amostras_continuas = np.concatenate(todas_as_amostras)
    timestamp_inicial = datetime.fromisoformat(timestamp_inicial_str)
    
    total_amostras = len(amostras_continuas)
    print(f"Total de {total_amostras} amostras carregadas, correspondendo a {total_amostras / taxa_amostragem:.2f} segundos de dados.")
    print(f"Processando dados em janelas de {intervalo_segundos} segundos...")

    resultados = []
    tamanho_janela_em_amostras = int(intervalo_segundos * taxa_amostragem)

    # Itera sobre o array contínuo em passos do tamanho da janela
    for i in range(0, total_amostras, tamanho_janela_em_amostras):
        janela_de_amostras = amostras_continuas[i : i + tamanho_janela_em_amostras]

        # Pula a última janela se for muito pequena para uma análise confiável
        if len(janela_de_amostras) < tamanho_janela_em_amostras / 2:
            continue

        # Calcula o timestamp para o início desta janela
        segundos_passados = i / taxa_amostragem
        timestamp_janela = timestamp_inicial + timedelta(seconds=segundos_passados)
        timestamp_formatado = timestamp_janela.strftime('%Y-%m-%dT%H:%M:%S')

        # Extrai a FC da janela atual
        frequencia_cardiaca = extrair_frequencia_cardiaca(janela_de_amostras, taxa_amostragem)

        if frequencia_cardiaca is not None:
            resultados.append([timestamp_formatado, frequencia_cardiaca])
            print(f"  -> {timestamp_formatado}: {frequencia_cardiaca} BPM")
        else:
            print(f"  -> {timestamp_formatado}: Não foi possível extrair a FC (picos R insuficientes).")

    if not resultados:
        print("Nenhuma frequência cardíaca foi extraída com sucesso.")
        return

    # Salva os resultados em CSV
    df_resultados = pd.DataFrame(resultados, columns=['timestamp', 'fc'])
    caminho_csv = os.path.join(caminho_script, 'frequencia_cardiaca.csv')
    df_resultados.to_csv(caminho_csv, index=False, header=False)

    print(f"\nProcessamento concluído. {len(resultados)} registros de FC foram salvos em '{caminho_csv}'")

if __name__ == '__main__':
    try:
        intervalo = int(input("Digite o intervalo de tempo desejado entre os registros (em segundos): "))
        if intervalo <= 0:
            raise ValueError("O intervalo deve ser um número inteiro positivo.")
        processar_ecg_em_janelas(intervalo)
    except ValueError as e:
        print(f"Entrada inválida: {e}. Por favor, insira um número inteiro positivo.")
    except Exception as e:
        print(f"Ocorreu um erro inesperado: {e}")
