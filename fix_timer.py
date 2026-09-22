import sys
import traceback

def patch_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Patch startAutoSyncTimer
    old_timer = """function startAutoSyncTimer() {
    // 100% 極速全自動背景靜默同步 (每 3 秒自動連線同步同仁雲端最新公文與 Gmail 醫師回信)
    if (gAutoSyncInterval) clearInterval(gAutoSyncInterval);

    // 啟動 1 秒內立即進行初次靜默雲端連線校正
    setTimeout(() => {
        syncCloudData(true);
        syncGmailReplies(true);
        autoCheckAndRemindOverdue();
    }, 1000);

    gAutoSyncInterval = setInterval(() => {
        syncCloudData(true);
        syncGmailReplies(true);
        autoCheckAndRemindOverdue();
    }, 5000);

    // 當使用者分頁切換回本系統，或視窗獲得焦點時，立即全自動靜默連線校正
    window.addEventListener("focus", () => {
        syncCloudData(true);
        syncGmailReplies(true);
        autoCheckAndRemindOverdue();
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
            syncCloudData(true);
            syncGmailReplies(true);
            autoCheckAndRemindOverdue();
        }
    });
}"""

    new_timer = """let gIsSyncing = false;
function startAutoSyncTimer() {
    if (gAutoSyncInterval) clearInterval(gAutoSyncInterval);

    const doSync = async () => {
        if (gIsSyncing) return;
        gIsSyncing = true;
        try {
            await syncCloudData(true);
            await syncGmailReplies(true);
            await autoCheckAndRemindOverdue();
        } catch (err) {
            console.error("Auto sync error:", err);
        } finally {
            gIsSyncing = false;
        }
    };

    setTimeout(doSync, 1000);
    gAutoSyncInterval = setInterval(doSync, 5000);

    window.addEventListener("focus", doSync);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) doSync();
    });
}"""

    if old_timer in content:
        content = content.replace(old_timer, new_timer)
    else:
        print("Could not find startAutoSyncTimer to patch.")

    # 2. Patch autoCheckAndRemindOverdue
    old_check = """        if (overdueIssues.length > 0) {
            showToast(`⚡ 統一在早上 10 點執行：偵測到 ${overdueIssues.length} 筆逾期未回覆案件，正在批次發送催辦通知...`, "warning");
            for (let i = 0; i < overdueIssues.length; i++) {
                const issue = overdueIssues[i];
                issue.remind_count = (issue.remind_count || 0) + 1;
                issue.last_reminded_at = getTaiwanNowStr();
                await autoSendEmail(issue.issue_id, 5); 
            }
            saveDataToStorage();
            pushCloudData(true);
            renderTable();
            renderDashboard();
        }"""
        
    new_check = """        if (overdueIssues.length > 0) {
            showToast(`⚡ 統一在早上 10 點執行：偵測到 ${overdueIssues.length} 筆逾期未回覆案件，正在批次發送催辦通知...`, "warning");
            
            // First mark them all and save IMMEDIATELY
            for (let i = 0; i < overdueIssues.length; i++) {
                const issue = overdueIssues[i];
                issue.remind_count = (issue.remind_count || 0) + 1;
                issue.last_reminded_at = getTaiwanNowStr();
            }
            saveDataToStorage(); 
            await pushCloudData(true);
            renderTable();
            renderDashboard();

            // Then send the emails
            for (let i = 0; i < overdueIssues.length; i++) {
                const issue = overdueIssues[i];
                await autoSendEmail(issue.issue_id, 5); 
            }
        }"""

    if old_check in content:
        content = content.replace(old_check, new_check)
    else:
        print("Could not find autoCheckAndRemindOverdue block to patch.")

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Patch complete.")

if __name__ == '__main__':
    try:
        patch_app_js()
    except Exception as e:
        traceback.print_exc()
