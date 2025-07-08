// GreenAPI/server.js (FINAL, COMPLETE, AND VERIFIED)
const express = require('express');
const winston = require('winston');
const HTMLtoDOCX = require('html-to-docx');
const payloads = require('./payloads');
// We no longer need the 'https' module for this fix.

// FIX: Globally disable certificate validation for all HTTPS requests made by this process.
// This is the most reliable way to mimic `curl -k` for testing internal services
// with self-signed or invalid TLS/SSL certificates.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const port = 3000;

// --- Logger Setup ---
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()],
});

// --- Core Functions ---

function parseCurlCommand(commandArgs) {
    const request = { method: 'GET', url: null, headers: {}, body: null };
    const args = commandArgs.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const unquote = (t) => t && (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')) ? t.slice(1, -1) : t;

    const remainingArgs = [];
    for (let i = 0; i < args.length; i++) {
        const token = args[i];
        if (token === '-X' || token === '--request') {
            request.method = unquote(args[++i]).toUpperCase();
        } else if (token === '-H' || token === '--header') {
            const header = unquote(args[++i]);
            const separatorIndex = header.indexOf(':');
            if (separatorIndex > -1) {
                const key = header.substring(0, separatorIndex).trim();
                const value = header.substring(separatorIndex + 1).trim();
                if (key) request.headers[key] = value;
            }
        } else if (token === '-d' || token === '--data' || token === '--data-raw') {
            request.body = unquote(args[++i]);
            if (request.method === 'GET') {
                request.method = 'POST';
            }
        } else {
            remainingArgs.push(token);
        }
    }

    for (const arg of remainingArgs) {
        const unquotedArg = unquote(arg);
        if (unquotedArg.startsWith('http')) {
            request.url = unquotedArg;
            break;
        }
    }

    if (!request.url) {
        throw new Error(`Could not parse a valid HTTP/HTTPS URL from the cURL command.`);
    }
    return request;
}

function analyzeTestResult(payload, response, testSuite) {
    if (response.status >= 500) return { name: 'Potential Unhandled Exception', severity: 'high' };
    const sqlErrorPatterns = [/SQL syntax.*?MySQL/i, /valid OCI function/i, /ORA-\d{5}/, /Microsoft OLE DB Provider for SQL Server/i, /Unclosed quotation mark after the character string/i, /syntax error at or near/i];
    if (sqlErrorPatterns.some(pattern => pattern.test(response.body))) return { name: 'Potential SQLi (Error-Based)', severity: 'high' };
    if (testSuite === 'sqlInjection' && response.duration > 4000) return { name: 'Potential SQLi (Time-Based)', severity: 'medium' };
    if (testSuite === 'xss' && response.body.includes(payload) && /[<>"']/.test(payload)) return { name: 'Reflected XSS', severity: 'high' };
    return { name: 'None Detected', severity: 'info' };
}

// --- Express App Configuration ---
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// --- API Endpoints ---
app.get('/', (req, res) => {
    const cacheBuster = Date.now();
    res.render('index', { cacheBuster });
});

app.post('/execute-curl', async (req, res) => {
    const { request } = req.body;
    if (!request || !request.url) return res.status(400).json({ error: 'Request object with a URL is required.' });

    try {
        const options = {
            method: request.method,
            headers: request.headers,
            body: request.body,
            redirect: 'manual',
            // No custom agent needed due to the global environment variable override
        };
        const startTime = Date.now();
        const fetchResponse = await fetch(request.url, options);
        const duration = Date.now() - startTime;
        const responseBody = await fetchResponse.text();
        const responseHeaders = {};
        fetchResponse.headers.forEach((value, key) => responseHeaders[key] = value);

        const fullResponse = {
            request,
            response: {
                status: fetchResponse.status,
                statusText: fetchResponse.statusText,
                duration,
                size: Buffer.byteLength(responseBody, 'utf8'),
                headers: responseHeaders,
                body: responseBody
            }
        };
        res.json(fullResponse);
    } catch (error) {
        logger.error('cURL execution failed:', { url: request.url, error: error.message, cause: error.cause });
        // FIX: Provide a more direct and accurate error message.
        let details = `Failed to fetch. Reason: ${error.message}.`;
        if (error.cause && error.cause.code) {
             details += ` (Underlying cause: ${error.cause.code})`;
        }
        res.status(400).json({ error: 'Failed to execute request.', details });
    }
});

app.post('/run-tests', async (req, res) => {
    const { curlCommand, testSuite } = req.body;
    const payloadList = payloads[testSuite];
    if (!payloadList) return res.status(400).json({ error: 'A valid test suite must be selected.' });

    const results = [];
    for (const payload of payloadList) {
        const injectedCurl = curlCommand.replace(/\$PAYLOAD\$/g, payload);
        let requestDetails = null;
        try {
            const commandArgs = injectedCurl.trim().replace(/^curl\s*/i, '');
            requestDetails = parseCurlCommand(commandArgs);
            const options = {
                method: requestDetails.method,
                headers: requestDetails.headers,
                body: requestDetails.body,
                redirect: 'manual',
                // No custom agent needed due to the global environment variable override
            };
            
            const startTime = Date.now();
            const fetchResponse = await fetch(requestDetails.url, options);
            const duration = Date.now() - startTime;
            const responseBody = await fetchResponse.text();
            const responseHeaders = {};
            fetchResponse.headers.forEach((value, key) => responseHeaders[key] = value);
            
            const responseData = { status: fetchResponse.status, statusText: fetchResponse.statusText, duration, size: Buffer.byteLength(responseBody, 'utf8'), headers: responseHeaders, body: responseBody };
            const vulnerability = analyzeTestResult(payload, responseData, testSuite);
            results.push({ payload, request: requestDetails, response: responseData, vulnerability });
        } catch (error) {
            logger.error('Test execution failed for payload:', { payload, url: requestDetails?.url || injectedCurl, error: error.message, cause: error.cause });
            let statusText = `Fetch Error: ${error.message}`;
            if (error.cause && error.cause.code) {
                statusText += ` (Cause: ${error.cause.code})`;
            }
            results.push({ 
                payload, 
                request: requestDetails,
                response: { status: 'Error', statusText, size: 0, duration: 0, headers: {}, body: '' }, 
                vulnerability: { name: 'Execution Error', severity: 'high' }
            });
        }
    }
    res.json(results);
});


app.post('/export-docx', async (req, res) => {
    const { htmlContent } = req.body;
    if (!htmlContent) {
        return res.status(400).send('HTML content is required.');
    }
    try {
        const fileBuffer = await HTMLtoDOCX(htmlContent, null, {
            orientation: 'portrait',
            margins: { top: 720, right: 720, bottom: 720, left: 720 }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=GreenAPI-Test-Results.docx`);
        res.send(fileBuffer);
    } catch (error) {
        logger.error("Failed to generate DOCX file:", error);
        res.status(500).send('Failed to generate DOCX file.');
    }
});

// --- Start Server ---
app.listen(port, () => {
    logger.info(`Server running at http://localhost:${port}`);
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        logger.warn('Certificate validation is disabled. This is intended for local testing only.');
    }
});