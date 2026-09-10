# -*- coding: utf-8 -*-
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def build_proposal_docx():
    doc = docx.Document()

    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title_p.add_run('【系統建置計畫書】\n雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統')
    run.font.size = Pt(18)
    run.font.bold = True
    run.font.color.rgb = RGBColor(15, 118, 110)

    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_run = sub_p.add_run('規劃與建置單位：雙和醫院病歷組 | 2026 年專案計畫')
    sub_run.font.size = Pt(11)
    sub_run.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph()

    h1 = doc.add_heading('一、 專案背景與需求規劃', level=1)
    h1.runs[0].font.color.rgb = RGBColor(15, 118, 110)

    p1 = doc.add_paragraph(
        '雙和醫院病歷組目前在處理公文函詢醫師作業時，原擬採用 Office 365 / SharePoint 搭配 Power Automate 之自動化流程。'
        '然而，由於機構並未配置獨立網域與相關 O365 付費授權，為替醫院節省額外軟體授權成本，決策改以醫院現有之 Google 信箱 '
        '(Google Workspace / Gmail API) 為核心架構，打造一套高效、直覺且無縫運作的公文自動化郵件發送與狀態追蹤系統。'
    )

    doc.add_heading('1.1 六大核心功能需求', level=2)
    reqs = [
        '【公文與函詢主副關聯】承辦同仁填完公文主檔與醫師函詢問題後，公文主檔可動態顯示醫師回覆進度（如 4/5 (80%) 或 不需醫師已完成）。',
        '【Google 郵件自動雙向收發】填完醫師函詢問題自動寄發 Gmail 信件給醫師，同步抄送 (Cc) 承辦 Email 與副本 Email 1、副本 Email 2。醫師直接點擊信件「回覆」即可自動寫入意見並變更狀態為「已回覆」。',
        '【退回補件與結案機制】承辦人如需退回補件，必須填寫退回原因才可按下確認，系統自動寄發「退回補件通知信」給醫師；審核通過按「已完成」自動發送結案通知信。',
        '【大型附件轉雲端連結】當附件單檔 > 10MB 或總檔案 > 25MB 導致 Gmail 易退件時，系統自動將檔案轉存至 Google Drive 並於郵件內文帶入安全下載連結。',
        '【自動催辦提醒與逾期警示】超過 1 天未回覆自動寄發催辦提醒信，並於系統儀表板顯示紅字逾期警示清單。',
        '【未結案週表 Excel 匯出】一鍵匯出符合標準格式之未結案公文函詢週表（整合完成率 < 100%），檔名格式為「雙和醫院病歷組_公文函詢週表_YYYYMMDD.xlsx」。'
    ]
    for r in reqs:
        doc.add_paragraph(r, style='List Bullet')

    h2 = doc.add_heading('二、 資料庫結構設計 (Data Schema)', level=1)
    h2.runs[0].font.color.rgb = RGBColor(15, 118, 110)

    doc.add_heading('2.1 公文主檔欄位表 (20 欄位)', level=2)
    t1 = doc.add_table(rows=1, cols=4)
    t1.alignment = WD_TABLE_ALIGNMENT.CENTER
    ns = nsdecls('w')
    for i, h in enumerate(['欄位名稱', '資料類型', '說明 / 範例', '備註']):
        cell = t1.rows[0].cells[i]
        cell.text = h
        cell.paragraphs[0].runs[0].font.bold = True
        shd = parse_xml(f'<w:shd {ns} w:fill="0F766E"/>')
        cell._tc.get_or_add_tcPr().append(shd)
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)

    doc_fields = [
        ('收發文號', 'String', '1150009463', '主鍵 PK'),
        ('創稿文號', 'String', '1151294569', ''),
        ('來文單位', 'String', '勞動部勞工保險局', ''),
        ('收發日期', 'Date', '115/09/01', ''),
        ('發文日期', 'Date', '115/09/03', ''),
        ('發文字號', 'String', '保職失字第11560220220號', ''),
        ('主旨', 'Text', '請貴院就說明三於文到15日內儘速寄送...', ''),
        ('病歷號', 'String', '17525415', ''),
        ('病患姓名', 'String', '李銀雪', ''),
        ('調病歷', 'String', '已調閱 / 待調閱 / 影本提供', ''),
        ('承辦人員', 'String', '錢佩好 (19020@s.tmu.edu.tw)', ''),
        ('病歷查詢費', 'Number', '1000', ''),
        ('勞保局受理編號', 'String', '115031019735號', ''),
        ('函覆文號', 'String', '1151202001', ''),
        ('函覆日期', 'Date', '2025/12/15', ''),
        ('公文狀態', 'Enum', '處理中 / 不需醫師已完成 / 已完成', ''),
        ('整合完成率', 'String', '4/5 (80%)', '自動計算'),
        ('建立時間', 'DateTime', '2026-09-04 11:11', ''),
        ('最後更新時間', 'DateTime', '2026-09-04 11:11', ''),
        ('附件檔案', 'Array', 'PDF/Word 實體公文雲端連結', '')
    ]

    for name, dtype, sample, note in doc_fields:
        row_cells = t1.add_row().cells
        row_cells[0].text = name
        row_cells[1].text = dtype
        row_cells[2].text = sample
        row_cells[3].text = note

    doc.add_heading('2.2 醫師函詢明細檔欄位表 (24 欄位)', level=2)
    t2 = doc.add_table(rows=1, cols=4)
    t2.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(['欄位名稱', '資料類型', '說明 / 範例', '備註']):
        cell = t2.rows[0].cells[i]
        cell.text = h
        cell.paragraphs[0].runs[0].font.bold = True
        shd = parse_xml(f'<w:shd {ns} w:fill="0F766E"/>')
        cell._tc.get_or_add_tcPr().append(shd)
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)

    issue_fields = [
        ('函詢ID', 'String', 'INQ-1788420295830', '主鍵 PK'),
        ('收發文號', 'String', '1150008387', '外鍵 FK'),
        ('發文日期', 'Date', '2026-08-20', ''),
        ('病歷號', 'String', '17961475', ''),
        ('病患姓名', 'String', '黃登科', ''),
        ('醫師姓名', 'String', '林家倫', '必填'),
        ('醫師Email', 'String', '24552@s.tmu.edu.tw', '必填'),
        ('副本Email1', 'String', '19020@s.tmu.edu.tw', '同步 CC'),
        ('副本Email2', 'String', '備用 Email 2', '同步 CC'),
        ('承辦人員姓名', 'String', '錢佩好', ''),
        ('分機', 'String', '2043', ''),
        ('承辦Email', 'String', '19020@s.tmu.edu.tw', 'Reply-To / CC'),
        ('問題摘要', 'Text', '請問但高嗎？是否符合職業傷害...', ''),
        ('醫師意見回覆', 'Text', '同意。(2026/09/03 15:44:33)', '回信自動寫入'),
        ('備註', 'Text', '醫師已補件完成', ''),
        ('函詢狀態', 'Enum', '待發送/已發送/已回覆/退回補件/已完成', ''),
        ('回覆期限', 'Date', '2026-08-25', ''),
        ('寄件時間', 'DateTime', '2026-08-20 14:00', ''),
        ('回覆時間', 'DateTime', '2026-09-03 15:44', ''),
        ('最後提醒時間', 'DateTime', '2026-08-22 08:00', ''),
        ('提醒次數', 'Number', '2', ''),
        ('退回原因', 'Text', '回附太簡略，請補充詳細說明與簽章', '退回時必填'),
        ('附件檔案', 'Array', '公文附件 (大檔自動轉 Drive 連結)', '')
    ]

    for name, dtype, sample, note in issue_fields:
        row_cells = t2.add_row().cells
        row_cells[0].text = name
        row_cells[1].text = dtype
        row_cells[2].text = sample
        row_cells[3].text = note

    h3 = doc.add_heading('三、 五大標準 HTML 郵件範本設計', level=1)
    h3.runs[0].font.color.rgb = RGBColor(15, 118, 110)

    templates = [
        ('1. 填完醫師函詢問題自動寄信 (藍色 #0D6EFD)', '頂部橫幅「🔔 您有一筆待回覆案件」，提示醫師直接點擊 Gmail「回覆」即可答覆與夾帶附件。'),
        ('2. 醫師回復後自動寄信 (鋼鐵藍 #0B5ED7)', '頂部橫幅「✅ 醫師回覆已確認完成」，自動帶入醫師答覆內文並通知承辦人員。'),
        ('3. 按退回補件按鈕自動寄信 (警示紅 #DC3545)', '頂部橫幅「⚠️ 醫師補件回覆通知」，包含紅色「退回原因」與上次醫師回答內容，提示醫師直接回信補件。'),
        ('4. 承辦同仁按已完成按鈕自動寄信 (成功綠 #198754)', '頂部橫幅「🎉 案件已結案完成通知」，告知醫師案件已結案存檔。'),
        ('5. 超過一天醫師未回覆自動寄信 (逾期紅 #C82333)', '頂部橫幅「⚠️ 尚未回覆提醒通知 (逾期第 X 天)」，自動計算逾期天數並發送催辦提醒。')
    ]

    for title, desc in templates:
        p = doc.add_paragraph()
        r = p.add_run(title)
        r.bold = True
        doc.add_paragraph(desc)

    h4 = doc.add_heading('四、 公文函詢週表 Excel 匯出規範', level=1)
    h4.runs[0].font.color.rgb = RGBColor(15, 118, 110)
    doc.add_paragraph('週表匯出檔名：雙和醫院病歷組_公文函詢週表_YYYYMMDD.xlsx')
    doc.add_paragraph('匯出條件：處理狀態非已完成（即整合完成率 / 進度 < 100% 案件）。')
    doc.add_paragraph('匯出欄位：【序號】｜【承辦人】｜【收發文號】｜【主旨】｜【寄件日期】｜【處理狀態】')

    out_path = r'D:\峻弦_BI\ai\病歷0907\我需要做一個公文透過GOOGLE郵件自動發送系統計畫書.docx'
    doc.save(out_path)
    print(f'SUCCESSFULLY_CREATED: {out_path}')

if __name__ == '__main__':
    build_proposal_docx()
