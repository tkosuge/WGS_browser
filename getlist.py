#! /usr/bin/env python3

import pandas as pd
from ete3 import NCBITaxa
import os
import urllib.request
from email.utils import parsedate_to_datetime
import schedule
import time

def add_taxonomy_to_wgs_list(input_file, output_file):
    url = "https://ddbj.nig.ac.jp/public/ddbj_database/wgs/WGS_ORGANISM_LIST.txt"
    with urllib.request.urlopen(url) as response:
        # Last-Modifiedヘッダー
        last_modified = response.headers.get('Last-Modified')
        # Save the file
        with open(input_file, 'wb') as out_file:
            out_file.write(response.read())
    if last_modified:
        # UNIXタイムスタンプへ
        dt = parsedate_to_datetime(last_modified)
        timestamp = dt.timestamp()
        os.utime(input_file, (timestamp, timestamp))
        print(f"Downloaded and timestamp set: {input_file}")
    else:
        print(f"Downloaded (no Last-Modified header): {input_file}")

    # 1. ete3のセットアップ（パスはご指定の場所）
    custom_path = "./ncbitaxonomy.sqlite"
    if not os.path.exists(os.path.dirname(custom_path)):
        os.makedirs(os.path.dirname(custom_path))
    
    ncbi = NCBITaxa(dbfile=custom_path)
    ncbi.update_taxonomy_database()
    
    # 2. TSVファイルの読み込み（1行目がヘッダーの想定）実際のリストに合わせて skiprows を調整
    df = pd.read_csv(input_file, sep='\t',skiprows=2, skipfooter=1, engine='python',header=None, dtype=str, names=['id', 'organism name', 'file', 'accession number', 'sequences', 'base pair', 'DIV', 'submitted', 'updated', 'BioProject', 'BioSample', 'SRA']) 
    
    # 重複を除いたユニークな学名リストを作成（高速化のため）
    unique_names = df['organism name'].unique().tolist()
    
    print(f"Total rows: {len(df)}, Unique organisms: {len(unique_names)}")

    # 3. Taxonomy情報の取得
    name_to_taxid = ncbi.get_name_translator(unique_names)
    
    # 取得したい階級（Rank）の定義
    target_ranks = ['domain', 'kingdom', 'phylum', 'class', 'order', 'family', 'genus']
    
    # 結果格納用の辞書
    tax_info_map = {}

    for name in unique_names:
        row_data = {rank: "Not Found" for rank in target_ranks}
        
        if name in name_to_taxid:
            tid = name_to_taxid[name][0]
            # 系統(lineage)のIDリストを取得
            lineage = ncbi.get_lineage(tid)
            # 系統IDから各々のRankを取得
            names_dict = ncbi.get_taxid_translator(lineage)
            ranks_dict = ncbi.get_rank(lineage)
            
            # 逆引き用辞書（rank -> name）の作成
            rank_to_name = {r: names_dict[t] for t, r in ranks_dict.items()}
            
            # 必要なRankだけ抽出
            for rank in target_ranks:
                row_data[rank] = rank_to_name.get(rank, "no " + rank)
        
        tax_info_map[name] = row_data

    # 4. 元のDataFrameに列を追加
    for rank in target_ranks:
        df[rank] = df['organism name'].map(lambda x: tax_info_map[x][rank])

    # 5. 結果を保存
    df.to_csv(f"./{output_file}", sep='\t', index=False)
    print(f"Success! Saved to {output_file}")

# 実行
if __name__ == '__main__':
    input_txt = "WGS_ORGANISM_LIST.txt"
    output_txt = "WGS_ORGANISM_LIST_with_Taxonomy.tsv"
    add_taxonomy_to_wgs_list(input_txt, output_txt)
    # 以降、毎日##:##に実行するスケジュールを設定
    schedule.every().day.at("12:00").do(lambda: add_taxonomy_to_wgs_list(input_txt, output_txt))
    schedule.every().day.at("15:00").do(lambda: add_taxonomy_to_wgs_list(input_txt, output_txt))
    schedule.every().day.at("18:00").do(lambda: add_taxonomy_to_wgs_list(input_txt, output_txt))
    schedule.every().day.at("21:00").do(lambda: add_taxonomy_to_wgs_list(input_txt, output_txt))
    while True:
        schedule.run_pending()
        time.sleep(60)
