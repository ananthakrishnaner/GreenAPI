// GreenAPI/server.js (FINAL, COMPLETE, AND VERIFIED)
const express = require('express');
const winston = require('winston');
const HTMLtoDOCX = require('html-to-docx');
const payloads = require('./payloads');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const diff = require('diff'); // NEW: Import the diff library
require('dotenv').config();

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const port = 3000;

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

let genAI = null;
let generativeModel = null;
if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    generativeModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash", generationConfig: { responseMimeType: "application/json" } });
    logger.info("Gemini AI integration enabled.");
} else {
    logger.warn("GEMINI_API_KEY not found. AI analysis will be unavailable.");
}

// --- Core Functions ---

function parseCurlCommand(commandArgs, findPayload = false) {
    const request = { method: 'GET', url: null, headers: {}, body: null };
    let injectionPoint = null;
    const args = commandArgs.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const unquote = (t) => t && (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')) ? t.slice(1, -1) : t;
    const remainingArgs = [];
    for (let i = 0; i < args.length; i++) {
        const token = args[i];
        const nextToken = args[i+1];
        if (token === '-X' || token === '--request') { request.method = unquote(nextToken); i++; }
        else if (token === '-H' || token === '--header') { const header = unquote(nextToken); if(findPayload && nextToken.includes('$PAYLOAD$')) injectionPoint = `Header: ${header.split(':')[0]}`; const [key, value] = header.split(/:\s*/, 2); if (key) request.headers[key] = value; i++; }
        else if (token === '-d' || token === '--data' || token === '--data-raw') { request.body = unquote(nextToken); if(findPayload && nextToken.includes('$PAYLOAD$')) injectionPoint = 'Request Body'; if (request.method === 'GET') request.method = 'POST'; i++; }
        else { remainingArgs.push(token); }
    }
    for (const arg of remainingArgs) { const unquotedArg = unquote(arg); if (unquotedArg.startsWith('http')) { request.url = unquotedArg; if(findPayload && unquotedArg.includes('$PAYLOAD$')) injectionPoint = 'URL'; break; } }
    if (!request.url) throw new Error(`Could not parse a valid HTTP/HTTPS URL.`);
    return { request, injectionPoint };
}

// Heuristic analysis remains as a fallback.
function analyzeTestResultHeuristic(payload, response, testSuite) {
    // ... (This function remains unchanged, providing a non-AI baseline)
    if (response.status >= 500) return { name: 'Potential Unhandled Exception', severity: 'high', confidence: 'Medium', explanation: 'Server returned a 5XX status code.', remediation: 'Investigate server logs to determine the root cause. Ensure all user input is properly sanitized and validated to prevent crashes.' };
    const sqlErrorPatterns = [/SQL syntax.*?MySQL/i, /valid OCI function/i, /ORA-\d{5}/, /Microsoft OLE DB Provider for SQL Server/i, /Unclosed quotation mark/i, /syntax error at or near/i];
    if (sqlErrorPatterns.some(pattern => pattern.test(response.body))) return { name: 'Potential SQLi (Error-Based)', severity: 'high', confidence: 'High', explanation: 'Database error messages were detected in the response body.', remediation: 'Use parameterized queries (prepared statements) to handle all database input. Do not concatenate user input directly into SQL queries.' };
    if (testSuite === 'sqlInjection' && response.duration > 4000) return { name: 'Potential SQLi (Time-Based)', severity: 'medium', confidence: 'Medium', explanation: 'The response took significantly longer than expected.', remediation: 'Review database queries for performance bottlenecks. Ensure that user input cannot influence query execution time in a predictable way.' };
    if (testSuite === 'xss' && response.body.includes(payload) && /[<>"']/.test(payload)) return { name: 'Reflected XSS', severity: 'high', confidence: 'High', explanation: 'The injected XSS payload was reflected unsanitized in the response body.', remediation: 'Implement robust output encoding (e.g., HTML entity encoding) for all user-controllable data that is rendered on a page. Use a content security policy (CSP) as a defense-in-depth measure.' };
    return { name: 'None Detected', severity: 'info', confidence: 'N/A', explanation: 'No standard indicators of compromise were found.', remediation: 'N/A' };
}

// NEW: Highly optimized AI analysis function.
async function analyzeTestResultAI(evidence) {
    const { testSuite, payload, injectionPoint, statusChanged, contentTypeChanged, sizeDifference, responseDiff } = evidence;
    
    // If there's no evidence of change, don't even call the AI for simple cases.
    if (!statusChanged && !contentTypeChanged && sizeDifference < 10 && responseDiff.length < 3 && testSuite !== 'sqlInjection') {
        return { name: 'None Detected', severity: 'info', confidence: 'High', explanation: 'No significant changes were observed between the baseline and the test response.', remediation: 'N/A' };
    }

    const prompt = `
    You are an API security expert. Analyze the following pre-calculated evidence to identify a vulnerability.

    **Test Context:**
    - Suite: ${testSuite}
    - Payload: \`${payload}\`
    - Injection Point: ${injectionPoint}

    **Evidence (Comparison to Baseline):**
    - Status Code Changed: ${statusChanged}
    - Content-Type Changed: ${contentTypeChanged}
    - Response Size Difference (bytes): ${sizeDifference}
    - Response Body Diff (lines added are prefixed with '+'):
    \`\`\`diff
    ${responseDiff.length > 0 ? diff.createPatch('response.txt', evidence.baselineBody, evidence.testBody, '', '', {context: 1}).split('\n').slice(4).join('\n') : "No changes."}
    \`\`\`

    **Your Task:**
    Based *only* on the evidence provided, respond in JSON format.
    1.  **name**: If the diff or metadata suggests a vulnerability, name it (e.g., "Reflected XSS", "Error-Based SQLi"). Otherwise, "None Detected".
    2.  **severity**: "info", "low", "medium", "high", or "critical".
    3.  **confidence**: Your confidence in the finding: "low", "medium", "high".
    4.  **explanation**: A concise, technical explanation of *why* the evidence points to this conclusion.
    5.  **remediation**: A concrete, actionable step to fix this specific vulnerability, referencing the **Injection Point**.
    `;

    try {
        const result = await generativeModel.generateContent(prompt);
        const responseText = result.response.text();
        const analysis = JSON.parse(responseText);
        if (analysis && analysis.name && analysis.severity) {
            return analysis;
        }
        return analyzeTestResultHeuristic(payload, {body: evidence.testBody, status: evidence.testStatus, duration: 0}, testSuite); // Fallback
    } catch (error) {
        logger.error("AI analysis failed. Falling back to heuristic.", { error: error.message });
        return analyzeTestResultHeuristic(payload, {body: evidence.testBody, status: evidence.testStatus, duration: 0}, testSuite); // Fallback
    }
}

// --- Express App Configuration & Endpoints ---
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => res.render('index', { cacheBuster: Date.now() }));

async function executeRequest(requestObject) {
    const options = { method: requestObject.method, headers: requestObject.headers, body: requestObject.body, redirect: 'manual' };
    const startTime = Date.now();
    const fetchResponse = await fetch(requestObject.url, options);
    const duration = Date.now() - startTime;
    const responseBody = await fetchResponse.text();
    const responseHeaders = {};
    fetchResponse.headers.forEach((value, key) => responseHeaders[key] = value);
    return { status: fetchResponse.status, statusText: fetchResponse.statusText, duration, size: Buffer.byteLength(responseBody, 'utf8'), headers: responseHeaders, body: responseBody };
}

app.post('/execute-curl', async (req, res) => {
    const { request } = req.body;
    if (!request || !request.url) return res.status(400).json({ error: 'Request object with a URL is required.' });
    try {
        const response = await executeRequest(request);
        res.json({ request, response });
    } catch (error) {
        logger.error('cURL execution failed:', { url: request.url, error: error.message, cause: error.cause });
        res.status(400).json({ error: 'Failed to execute request.', details: `Failed to fetch. Reason: ${error.message}.` });
    }
});

app.post('/run-tests', async (req, res) => {
    const { curlCommand, testSuite, useAI } = req.body;
    const payloadList = payloads[testSuite];
    if (!payloadList) return res.status(400).json({ error: 'A valid test suite must be selected.' });

    const analysisMode = (useAI && generativeModel) ? 'AI (Gemini)' : 'Heuristic';
    const results = [];
    const commandArgs = curlCommand.trim().replace(/^curl\s*/i, '');
    const { injectionPoint } = parseCurlCommand(commandArgs, true);

    try {
        const { request: baselineRequestDetails } = parseCurlCommand(commandArgs.replace(/\$PAYLOAD\$/g, ''));
        const baselineResponse = await executeRequest(baselineRequestDetails);

        for (const payload of payloadList) {
            const injectedCurl = commandArgs.replace(/\$PAYLOAD\$/g, payload);
            const { request: requestDetails } = parseCurlCommand(injectedCurl);
            try {
                const testResponse = await executeRequest(requestDetails);
                
                let vulnerability;
                if (analysisMode === 'AI (Gemini)') {
                    const evidence = {
                        testSuite, payload, injectionPoint,
                        baselineBody: baselineResponse.body,
                        testBody: testResponse.body,
                        testStatus: testResponse.status,
                        statusChanged: baselineResponse.status !== testResponse.status,
                        contentTypeChanged: baselineResponse.headers['content-type'] !== testResponse.headers['content-type'],
                        sizeDifference: testResponse.size - baselineResponse.size,
                        responseDiff: diff.diffLines(baselineResponse.body, testResponse.body, { newlineIsToken: true }).filter(part => part.added || part.removed)
                    };
                    vulnerability = await analyzeTestResultAI(evidence);
                } else {
                    vulnerability = analyzeTestResultHeuristic(payload, testResponse, testSuite);
                }
                results.push({ payload, request: requestDetails, response: testResponse, vulnerability, analysisMode });
            } catch (error) {
                results.push({ payload, request: requestDetails, response: { status: 'Error', statusText: `Fetch Error: ${error.message}`}, vulnerability: { name: 'Execution Error', severity: 'high', remediation: 'Check network connectivity and command validity.' }, analysisMode: 'Error' });
            }
        }
        res.json(results);
    } catch (baselineError) {
        logger.error('Failed to establish baseline:', { error: baselineError.message });
        res.status(400).json({ error: 'Failed to establish baseline connection. Check the URL and server.' });
    }
});

app.post('/export-docx', async (req, res) => {
    const { htmlContent } = req.body;
    if (!htmlContent) return res.status(400).send('HTML content is required.');
    try {
        const fileBuffer = await HTMLtoDOCX(htmlContent, null, { orientation: 'portrait', margins: { top: 720, right: 720, bottom: 720, left: 720 } });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=GreenAPI-Test-Results.docx`);
        res.send(fileBuffer);
    } catch (error) {
        logger.error("Failed to generate DOCX file:", error);
        res.status(500).send('Failed to generate DOCX file.');
    }
});

app.listen(port, () => {
    logger.info(`Server running at http://localhost:${port}`);
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') logger.warn('Certificate validation is disabled.');
});