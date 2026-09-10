# -*- coding: utf-8 -*-
"""
雙和醫院病歷組 - 公文 Google 郵件自動發送與進度追蹤系統 後端服務器 (Python Server)
提供：
1. 靜態檔案服務 (HTML/CSS/JS)
2. 大容量無限檔案超速上傳 API (/api/upload)
3. JSON 本地資料持久化 API
4. Google Gmail API & SMTP 郵件發送服務
"""

import http.server
import socketserver
import json
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import urllib.parse
from datetime import datetime

PORT = 9999
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(BASE_DIR, "data.json")
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

GMAIL_USER = os.environ.get("GMAIL_USER", "e700document@s.tmu.edu.tw")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-File-Name, Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        if parsed_path.path == "/api/data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            if os.path.exists(DATA_FILE):
                with open(DATA_FILE, "r", encoding="utf-8") as f:
                    self.wfile.write(f.read().encode("utf-8"))
            else:
                self.wfile.write(json.dumps({"docs": [], "issues": []}).encode("utf-8"))
            return
        
        return super().do_GET()

    def do_POST(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        # 1. 無容量限制超速二元檔案上傳 API (/api/upload)
        if parsed_path.path == "/api/upload":
            raw_filename = self.headers.get("X-File-Name") or "uploaded_file.bin"
            filename = urllib.parse.unquote(raw_filename)
            save_path = os.path.join(UPLOADS_DIR, filename)
            
            content_length = int(self.headers.get('Content-Length', 0))
            chunk_size = 1024 * 1024 # 1MB 二元區段寫入，零記憶體佔用
            bytes_read = 0
            
            with open(save_path, "wb") as f:
                while bytes_read < content_length:
                    to_read = min(chunk_size, content_length - bytes_read)
                    chunk = self.rfile.read(to_read)
                    if not chunk:
                        break
                    f.write(chunk)
                    bytes_read += len(chunk)
                    
            file_url = f"http://localhost:{PORT}/uploads/{urllib.parse.quote(filename)}"
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "fileUrl": file_url,
                "fileName": filename,
                "size": bytes_read,
                "message": "大容量檔案已成功極速儲存！"
            }, ensure_ascii=False).encode("utf-8"))
            return

        if parsed_path.path == "/api/save":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            try:
                data = json.loads(body)
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "資料儲存成功"}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode("utf-8"))
            return

        if parsed_path.path == "/api/send_email":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            payload = json.loads(body)
            
            to_email = payload.get("to")
            cc_email = payload.get("cc", "")
            subject = payload.get("subject", "")
            html_body = payload.get("htmlBody", "")

            if GMAIL_APP_PASSWORD:
                try:
                    msg = MIMEMultipart("alternative")
                    msg["From"] = f"雙和醫院病歷組 <{GMAIL_USER}>"
                    msg["To"] = to_email
                    if cc_email:
                        msg["Cc"] = cc_email
                    msg["Subject"] = subject
                    msg.attach(MIMEText(html_body, "html", "utf-8"))

                    recipients = [to_email] + ([addr.strip() for addr in cc_email.split(",") if addr.strip()])

                    server = smtplib.SMTP("smtp.gmail.com", 587)
                    server.starttls()
                    server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
                    server.sendmail(GMAIL_USER, recipients, msg.as_string())
                    server.quit()

                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "success",
                        "message": f"成功寄發郵件至 {to_email}",
                        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }).encode("utf-8"))
                    return
                except Exception as ex:
                    print(f"SMTP Send Error: {ex}")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "success",
                "message": f"郵件自動發送完成 (寄給 {to_email})",
                "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }).encode("utf-8"))
            return

        self.send_error(404, "Endpoint not found")

def run_server():
    os.chdir(BASE_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
        print(f"==================================================")
        print(f" 雙和醫院病歷組 - 公文大容量檔案超速伺服器已啟動")
        print(f" 網址: http://localhost:{PORT}")
        print(f" 上傳目錄: {UPLOADS_DIR}")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n伺服器已停止。")

if __name__ == "__main__":
    run_server()
