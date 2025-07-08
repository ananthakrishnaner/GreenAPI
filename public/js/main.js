// GreenAPI/public/js/main.js (FINAL, COMPLETE, AND VERIFIED)
document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM Elements ---
    let currentTestResults = [];
    const curlInput = document.getElementById('curl-input');
    const sendBtn = document.getElementById('send-btn');
    const runTestsBtn = document.getElementById('run-tests-btn');
    const testSuiteSelect = document.getElementById('test-suite-select');
    const addHeaderBtn = document.getElementById('add-header-btn');
    const headersList = document.getElementById('request-headers-list');
    const reqBodyEditor = document.getElementById('request-body-editor');
    const exportResultsBtn = document.getElementById('export-results-btn');
    const testResultsListEl = document.getElementById('test-results-list');
    const testResultsCountEl = document.getElementById('test-results-count');
    const enableAiCheckbox = document.getElementById('enable-ai-checkbox');

    // --- Helper Functions ---
    const escapeHTML = (str) => {
        if (typeof str !== 'string') return '';
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };

    const safeHTMLEscape = (str) => {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"').replace(/'/g, "'");
    };
    
    const formatBytes = (bytes, decimals = 2) => {
        if (bytes === 0 || !bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    };

    // --- cURL Parsing & Building ---
    const parseCurlCommand = (commandArgs) => {
        const request = { method: 'GET', url: null, headers: {}, body: null };
        if (!commandArgs) return request;
        const args = commandArgs.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        const unquote = (t) => t && (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')) ? t.slice(1, -1) : t;
        const remainingArgs = [];
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '-X' || args[i] === '--request') { request.method = unquote(args[++i]).toUpperCase(); }
            else if (args[i] === '-H' || args[i] === '--header') { const header = unquote(args[++i]); const separatorIndex = header.indexOf(':'); if (separatorIndex > -1) { const key = header.substring(0, separatorIndex).trim(); const value = header.substring(separatorIndex + 1).trim(); if (key) request.headers[key] = value; } }
            else if (args[i] === '-d' || args[i] === '--data' || args[i] === '--data-raw') { request.body = unquote(args[++i]); if (request.method === 'GET') { request.method = 'POST'; } }
            else { remainingArgs.push(args[i]); }
        }
        for (const arg of remainingArgs) { const unquotedArg = unquote(arg); if (unquotedArg.startsWith('http')) { request.url = unquotedArg; break; } }
        if (!request.url) { throw new Error(`Could not parse a valid HTTP/HTTPS URL from the cURL command.`); }
        return request;
    };

    const buildCurlFromRequest = (request) => {
        if (!request || !request.url) return '';
        const shellEscape = (str) => `'${String(str).replace(/'/g, "'\\''")}'`;
        let command = `curl -X ${request.method} ${shellEscape(request.url)}`;
        if (request.headers) {
            for (const [key, value] of Object.entries(request.headers)) { command += ` -H ${shellEscape(`${key}: ${value}`)}`; }
        }
        if (request.body) { command += ` -d ${shellEscape(request.body)}`; }
        return command;
    };
    
    // --- UI Update Functions ---
    const addHeaderRow = (key = '', value = '', enabled = true) => {
        const row = document.createElement('div');
        row.className = `header-row${enabled ? '' : ' disabled'}`;
        row.innerHTML = `<input type="checkbox" class="header-enable" ${enabled ? 'checked' : ''}><input type="text" class="header-key" placeholder="Header" value="${escapeHTML(key)}"><input type="text" class="header-value" placeholder="Value" value="${escapeHTML(String(value))}"><button class="remove-header-btn">x</button>`;
        headersList.appendChild(row);
    };
    
    const updateUiFromCurl = () => {
        try {
            const commandArgs = curlInput.value.trim().replace(/^curl\s*/i, '');
            const req = parseCurlCommand(commandArgs);
            headersList.innerHTML = '';
            if (req.headers) { for (const [key, value] of Object.entries(req.headers)) { addHeaderRow(key, value, true); } }
            reqBodyEditor.value = req.body || '';
        } catch (e) { headersList.innerHTML = ''; reqBodyEditor.value = ''; }
    };
    
    const updateCurlFromUi = () => {
        try {
            const commandArgs = curlInput.value.trim().replace(/^curl\s*/i, '');
            const req = parseCurlCommand(commandArgs);
            if (!req.url) return;
            const headers = {};
            document.querySelectorAll('#request-headers-list .header-row').forEach(row => { if (row.querySelector('.header-enable').checked) { const key = row.querySelector('.header-key').value.trim(); const value = row.querySelector('.header-value').value.trim(); if (key) headers[key] = value; } });
            curlInput.value = buildCurlFromRequest({ ...req, headers, body: reqBodyEditor.value.trim() || null });
        } catch (e) { /* Fail silently */ }
    };
    
    const displayResults = ({ request, response }) => {
        curlInput.value = buildCurlFromRequest(request); updateUiFromCurl();
        const statusCodeEl = document.getElementById('status-code');
        const durationEl = document.getElementById('duration');
        const sizeEl = document.getElementById('size');
        const resBodyPlaceholder = document.getElementById('response-body-placeholder');
        const resBodyPre = document.querySelector('#response-body pre');
        [statusCodeEl, durationEl, sizeEl].forEach(el => el.classList.remove('hidden'));
        statusCodeEl.textContent = `${response.status} ${response.statusText}`;
        statusCodeEl.className = 'meta-item ' + (response.status >= 200 && response.status < 400 ? 'status-ok' : 'status-error');
        durationEl.textContent = `${response.duration} ms`;
        sizeEl.textContent = formatBytes(response.size);
        resBodyPlaceholder.classList.add('hidden'); resBodyPre.classList.remove('hidden');
        let responseBodyText = response.body || '(Empty Response Body)';
        if (response.headers && response.headers['content-type']?.includes('json') && response.body) { try { responseBodyText = JSON.stringify(JSON.parse(response.body), null, 2); } catch (e) { /* ignore */ } }
        document.getElementById('response-body-content').textContent = responseBodyText;
        document.getElementById('response-headers-content').textContent = JSON.stringify(response.headers, null, 2);
        Prism.highlightAll();
    };
    
    const displayError = (error) => {
        const resBodyPlaceholder = document.getElementById('response-body-placeholder');
        resBodyPlaceholder.classList.remove('hidden');
        document.querySelector('#response-body pre').classList.add('hidden');
        resBodyPlaceholder.textContent = `Execution Error: ${error.details || error.message}`;
        const statusCodeEl = document.getElementById('status-code');
        statusCodeEl.textContent = 'Error';
        statusCodeEl.className = 'meta-item status-error';
        statusCodeEl.classList.remove('hidden');
        document.getElementById('duration').classList.add('hidden');
        document.getElementById('size').classList.add('hidden');
    };

    // --- Test Result Rendering ---
    const renderTestResults = (results) => {
        testResultsListEl.innerHTML = '';
        currentTestResults = results;
        if (results.length > 0) {
            const analysisMode = results[0].analysisMode || 'Heuristic';
            const modeDiv = document.createElement('div');
            modeDiv.className = 'analysis-mode-indicator';
            modeDiv.textContent = `Analysis Mode: ${analysisMode}`;
            testResultsListEl.appendChild(modeDiv);
        }

        results.forEach((result, index) => {
            const card = document.createElement('div'); card.className = 'test-result-card';
            const { payload, response, vulnerability, analysisMode } = result;
            const statusClass = (response.status === 'Error' || response.status >= 400) ? 'status-error' : 'status-ok';
            const severity = vulnerability?.severity?.toLowerCase() || 'info';
            const severityClass = `vuln-${['high', 'critical'].includes(severity) ? 'high' : severity}`;
            let vulnTag = 'None Detected';
            if (vulnerability && vulnerability.name !== 'None Detected') {
                vulnTag = `<span class="vulnerability-tag ${severityClass}">${escapeHTML(vulnerability.name)} (Confidence: ${escapeHTML(vulnerability.confidence || 'N/A')})</span>`;
            }
            const explanationHtml = vulnerability?.explanation ? `<h4>Analysis Details</h4><div class="ai-explanation"><p>${escapeHTML(vulnerability.explanation)}</p></div>` : '';
            const remediationHtml = vulnerability?.remediation && vulnerability.remediation !== 'N/A' ? `<h4>Remediation Advice</h4><div class="remediation-advice"><p>${escapeHTML(vulnerability.remediation)}</p></div>` : '';

            card.innerHTML = `
                <div class="test-result-summary" data-index="${index}"><div class="status-badge ${statusClass}">${escapeHTML(response.status.toString())}</div><div class="payload-text">${escapeHTML(payload)}</div><div>${escapeHTML(String(response.size))} B</div><div>${escapeHTML(String(response.duration))} ms</div></div>
                <div class="test-result-details">
                    <div class="details-header"><h4>Findings (${analysisMode || 'Heuristic'})</h4>${vulnTag}</div>
                    ${explanationHtml}
                    ${remediationHtml}
                    <h4>Injected Payload</h4><pre><code class="language-text">${escapeHTML(payload)}</code></pre>
                    <h4>Request</h4><pre><code class="language-json">${escapeHTML(JSON.stringify(result.request, null, 2) || 'N/A')}</code></pre>
                    <h4>Response</h4><pre><code class="language-json">${escapeHTML(JSON.stringify(response, null, 2) || 'N/A')}</code></pre>
                    <div class="test-result-actions"><button class="copy-curl-btn" data-index="${index}">Copy cURL</button><button class="send-to-req-btn" data-index="${index}">Send to Requester</button></div>
                </div>`;
            testResultsListEl.appendChild(card);
        });

        const findingsCount = results.filter(r => r.vulnerability && r.vulnerability.name !== 'None Detected').length;
        testResultsCountEl.textContent = findingsCount > 0 ? findingsCount : '';
        testResultsCountEl.style.display = findingsCount > 0 ? 'inline-block' : 'none';
        exportResultsBtn.classList.toggle('hidden', results.length === 0);
        Prism.highlightAll();
    };

    // --- Export Logic ---
    const buildAndFormatHttpMessageForExport = (data, isRequest) => {
        if (!data) return 'N/A'; let lines = [], body = '';
        if (isRequest) { if (!data.url) return 'N/A'; try { const url = new URL(data.url); lines.push(`${data.method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`); if (data.headers) { for (const [k, v] of Object.entries(data.headers)) { if (k.toLowerCase() !== 'host') lines.push(`${k}: ${v}`); } } body = data.body || ''; } catch (e) { return 'Error building request.'; } } else { if (data.status === 'Error') return `Error: ${data.statusText}`; lines.push(`HTTP/1.1 ${data.status} ${data.statusText}`); if (data.headers) { for (const [k, v] of Object.entries(data.headers)) { lines.push(`${k}: ${v}`); } } body = data.body || ''; }
        let beautifiedBody = body; try { beautifiedBody = JSON.stringify(JSON.parse(body.trim()), null, 2); } catch (e) { /* ignore */}
        const fullMessage = lines.join('\n') + (beautifiedBody ? '\n\n' + beautifiedBody : '');
        return safeHTMLEscape(fullMessage).replace(/\n/g, '<br />').replace(/^ +/gm, m => ' '.repeat(m.length));
    };

    const generateHtmlForExport = (results) => {
        const styles = {
            body: `font-family: 'Segoe UI', Tahoma, sans-serif; color: #000; padding: 20px; font-size: 10pt;`, h1: `color: #000; border-bottom: 2px solid #ff6633; padding-bottom: 10px; margin-bottom: 20px; font-family: 'Arial', sans-serif;`, h4: `color: #333; font-weight: bold; margin-top: 15px; margin-bottom: 5px; font-family: 'Arial', sans-serif;`, findingCard: `background-color: #fff; border: 1px solid #ccc; margin-bottom: 20px; padding: 15px; page-break-inside: avoid;`, payloadPre: `background-color: #f3e8ff; border: 1px solid #8a2be2; color: #000; padding: 10px; white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; font-size: 9pt;`,
            vulnTag: (severity) => { let bgColor = '#43a047'; if (severity === 'high' || severity === 'critical') bgColor = '#c62828'; else if (severity === 'medium') bgColor = '#f57f17'; else if (severity === 'low') bgColor = '#1e88e5'; return `display: inline-block; font-size: 9pt; font-weight: bold; padding: 2px 8px; border-radius: 10px; color: #fff; background-color: ${bgColor};`; },
            explanationBox: `background-color: #e6f7ff; border: 1px solid #91d5ff; padding: 10px; margin-top: 5px; font-style: italic;`,
            remediationBox: `background-color: #e8f5e9; border: 1px solid #a5d6a7; padding: 10px; margin-top: 5px;`,
            httpHeader: `font-size: 11pt; font-weight: bold; color: #333; margin: 10px 0 5px 0; font-family: 'Arial', sans-serif;`, httpPre: `margin: 0; padding: 10px; white-space: pre-wrap; word-wrap: break-word; font-family: 'Courier New', monospace; font-size: 9pt; line-height: 1.3; color: #000; background-color: #f7f7f7; border: 1px solid #eee;`,
        };
        const analysisMode = results.length > 0 ? (results[0].analysisMode || 'Heuristic') : 'N/A';
        let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Test Results</title></head><body style="${styles.body}"><h1 style="${styles.h1}">GreenAPI Test Results</h1><p>Analysis Mode: ${analysisMode}</p>`;
        results.forEach(result => {
            const { payload, request, response, vulnerability } = result;
            let vulnTagHtml = 'None Detected', explanationHtml = '', remediationHtml = '';
            if (vulnerability && vulnerability.name !== 'None Detected') {
                const severity = vulnerability.severity?.toLowerCase() || 'info';
                vulnTagHtml = `<span style="${styles.vulnTag(severity)}">${safeHTMLEscape(vulnerability.name)} (Confidence: ${safeHTMLEscape(vulnerability.confidence || 'N/A')})</span>`;
                if (vulnerability.explanation) explanationHtml = `<div style="${styles.explanationBox}"><h4 style="${styles.h4}">Analysis Details</h4><p>${safeHTMLEscape(vulnerability.explanation)}</p></div>`;
                if (vulnerability.remediation && vulnerability.remediation !== 'N/A') remediationHtml = `<div style="${styles.remediationBox}"><h4 style="${styles.h4}">Remediation Advice</h4><p>${safeHTMLEscape(vulnerability.remediation)}</p></div>`;
            }
            html += `<div style="${styles.findingCard}"><h4 style="${styles.h4}">Finding</h4><div>${vulnTagHtml}</div>${explanationHtml}${remediationHtml}<h4 style="${styles.h4}">Injected Payload</h4><pre style="${styles.payloadPre}"><code>${safeHTMLEscape(payload)}</code></pre><h5 style="${styles.httpHeader}">Request</h5><pre style="${styles.httpPre}">${buildAndFormatHttpMessageForExport(request, true)}</pre><h5 style="${styles.httpHeader}">Response</h5><pre style="${styles.httpPre}">${buildAndFormatHttpMessageForExport(response, false)}</pre></div>`;
        });
        return html + `</body></html>`;
    };

    // --- Event Listeners ---
    curlInput.addEventListener('input', updateUiFromCurl);
    reqBodyEditor.addEventListener('input', updateCurlFromUi);
    headersList.addEventListener('input', updateCurlFromUi);
    headersList.addEventListener('click', (e) => { if (e.target.classList.contains('remove-header-btn')) { e.target.closest('.header-row').remove(); updateUiFromCurl(); } });
    addHeaderBtn.addEventListener('click', () => addHeaderRow());

    sendBtn.addEventListener('click', async () => {
        updateCurlFromUi();
        const curlCommand = curlInput.value.trim();
        if (!curlCommand) return alert('Please enter a cURL command.');
        sendBtn.disabled = true; sendBtn.textContent = 'Sending...';
        try {
            const requestObject = parseCurlCommand(curlCommand.replace(/^curl\s*/i, ''));
            const res = await fetch('/execute-curl', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request: requestObject }) });
            if (!res.ok) { const data = await res.json(); throw new Error(data.details || data.error); }
            displayResults(await res.json());
        } catch (error) { displayError(error); } finally { sendBtn.disabled = false; sendBtn.textContent = 'Send'; }
    });
    
    runTestsBtn.addEventListener('click', async () => {
        updateCurlFromUi();
        const curlCommand = curlInput.value.trim();
        if (!curlCommand.includes('$PAYLOAD$')) return alert('Your cURL command must include the $PAYLOAD$ marker.');
        const useAI = enableAiCheckbox.checked;
        const placeholderText = useAI ? 'Establishing baseline and running AI analysis... This may take time.' : 'Running tests... (Heuristic mode)';
        testResultsListEl.parentElement.querySelector('.placeholder').classList.add('hidden');
        testResultsListEl.innerHTML = `<div class="placeholder">${placeholderText}</div>`;
        exportResultsBtn.classList.add('hidden');
        runTestsBtn.disabled = true; sendBtn.disabled = true;
        try {
            const res = await fetch('/run-tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ curlCommand, testSuite: testSuiteSelect.value, useAI }) });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Test run failed'); }
            renderTestResults(await res.json());
        } catch (error) { testResultsListEl.innerHTML = `<div class="placeholder">Error: ${error.message}</div>`; }
        finally { runTestsBtn.disabled = false; sendBtn.disabled = false; }
    });

    testResultsListEl.addEventListener('click', (e) => {
        const cardSummary = e.target.closest('.test-result-summary');
        const copyBtn = e.target.closest('.copy-curl-btn');
        const sendToReqBtn = e.target.closest('.send-to-req-btn');
        if (cardSummary) { const details = cardSummary.nextElementSibling; details.style.display = details.style.display === 'block' ? 'none' : 'block'; }
        if (copyBtn) { const result = currentTestResults[copyBtn.dataset.index]; if (result?.request) navigator.clipboard.writeText(buildCurlFromRequest(result.request)); }
        if (sendToReqBtn) { const result = currentTestResults[sendToReqBtn.dataset.index]; if (result) { displayResults(result); document.querySelector('.tabs[data-group="response-tabs"] .tab-link[data-tab="response-body"]').click(); } }
    });
    
    exportResultsBtn.addEventListener('click', async () => {
        if (!currentTestResults || currentTestResults.length === 0) return alert('No results to export.');
        exportResultsBtn.textContent = 'Generating...'; exportResultsBtn.disabled = true;
        try {
            const htmlContent = generateHtmlForExport(currentTestResults);
            const res = await fetch('/export-docx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ htmlContent }) });
            if (!res.ok) throw new Error(`Failed to generate document: ${await res.text()}`);
            const blob = await res.blob();
            saveAs(blob, `GreenAPI-Test-Results-${new Date().toISOString().split('T')[0]}.docx`);
        } catch(e) { console.error(e); alert(e.message); }
        finally { exportResultsBtn.textContent = 'Export to Word'; exportResultsBtn.disabled = false; }
    });

    document.querySelectorAll('.tabs').forEach(tabGroup => { tabGroup.addEventListener('click', (e) => { if (e.target.classList.contains('tab-link')) { const tabId = e.target.dataset.tab; const parentPane = e.target.closest('.pane'); parentPane.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active')); e.target.classList.add('active'); parentPane.querySelectorAll('.tab-content').forEach(panel => { panel.classList.toggle('active', panel.id === tabId); panel.style.display = panel.classList.contains('active') ? (panel.id === 'test-results' ? 'flex' : 'block') : 'none'; }); } }); });
});