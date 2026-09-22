import sys
import traceback

def patch_app_js():
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Patch openMainDocModal
    content = content.replace(
        'const doc = gMainDocs.find(d => d.doc_receive_no === receiveNo);',
        'const doc = gMainDocs.find(d => String(d.doc_receive_no) === String(receiveNo));'
    )
    
    # Patch deleteMainDoc
    content = content.replace(
        'const idx = gMainDocs.findIndex(d => d.doc_receive_no === receiveNo);',
        'const idx = gMainDocs.findIndex(d => String(d.doc_receive_no) === String(receiveNo));'
    )
    content = content.replace(
        'const relatedIssues = gIssues.filter(i => i.doc_receive_no === receiveNo);',
        'const relatedIssues = gIssues.filter(i => String(i.doc_receive_no) === String(receiveNo));'
    )

    # Patch calculateDocProgress
    content = content.replace(
        'const mainDoc = gMainDocs.find(d => d.doc_receive_no === receiveNo);',
        'const mainDoc = gMainDocs.find(d => String(d.doc_receive_no) === String(receiveNo));'
    )
    content = content.replace(
        'const docIssues = gIssues.filter(i => !i.deleted && i.doc_receive_no === receiveNo);',
        'const docIssues = gIssues.filter(i => !i.deleted && String(i.doc_receive_no) === String(receiveNo));'
    )

    # Patch toggleExpandRow
    content = content.replace(
        'gExpandedRows.has(receiveNo)',
        'gExpandedRows.has(String(receiveNo))'
    )
    content = content.replace(
        'gExpandedRows.delete(receiveNo);',
        'gExpandedRows.delete(String(receiveNo));'
    )
    content = content.replace(
        'gExpandedRows.add(receiveNo);',
        'gExpandedRows.add(String(receiveNo));'
    )
    content = content.replace(
        'gJustExpanded = receiveNo;',
        'gJustExpanded = String(receiveNo);'
    )

    # Patch renderNestedIssueTable
    content = content.replace(
        'const docIssues = gIssues.filter(i => !i.deleted && i.doc_receive_no === receiveNo);',
        'const docIssues = gIssues.filter(i => !i.deleted && String(i.doc_receive_no) === String(receiveNo));'
    )

    # Patch openIssueModalForDoc (already done, but just in case)
    
    # Patch openIssueModalForEdit
    content = content.replace(
        'const issue = gIssues.find(i => i.issue_id === issueId);',
        'const issue = gIssues.find(i => String(i.issue_id) === String(issueId));'
    )

    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)

if __name__ == '__main__':
    try:
        patch_app_js()
        print("Success")
    except Exception as e:
        print("Error:")
        traceback.print_exc()
