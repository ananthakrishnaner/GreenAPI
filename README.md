# GreenAPI

A Web-Based cURL Runner & API Security Tester.


## About The Project

GreenAPI is a simple web-based utility for developers and security testers. It provides a user-friendly interface to execute `curl` commands, inspect HTTP requests and responses, and perform basic automated security scanning for common vulnerabilities like SQL Injection, XSS, and more.

It acts as a lightweight, browser-based alternative to tools like Postman or Burp Suite's Repeater, with the added benefit of automated payload injection and professional report generation.

### Features

-   **cURL Command Parser:** Simply paste a full `curl` command, and the tool automatically parses the URL, method, headers, and body into an editable interface.
-   **Automated Security Testing:** Run pre-defined test suites against your target API. The tool injects payloads from its comprehensive lists to test for:
    -   SQL Injection (Error-based and Time-based)
    -   Cross-Site Scripting (XSS)
    -   Command Injection
    -   Path Traversal
-   **Dynamic Request Editor:** Modify headers and the request body on the fly and see the `curl` command update in real-time.
-   **Detailed Response Viewer:** View the response body, headers, status code, execution time, and response size in a clean, tabbed layout.
-   **Professional Reporting:** Export all test results, including the full request and response for each test case, into a structured and readable Microsoft Word (`.docx`) document.

## Getting Started

Follow these instructions to get a local copy up and running.

### Prerequisites

You will need Node.js and npm (which comes with Node.js) installed on your machine.
-   [Node.js](https://nodejs.org/) (LTS version recommended)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone <your-repository-url>
    ```
2.  **Navigate to the project directory:**
    ```sh
    cd GreenAPI
    ```
3.  **Install NPM packages:**
    ```sh
    npm install
    ```

## Usage

1.  **Start the server:**
    ```sh
    npm start
    ```
    You will see a confirmation in your terminal that the server is running on port 3000.
    ```
    > greenapi@1.0.0 start
    > node server.js

    info: Server running at http://localhost:3000
    ```

2.  **Open the application:**
    Open your web browser and navigate to `http://localhost:3000`.

### Running a Single Request

1.  Paste a full `curl` command into the main input box. The URL, headers, and body will automatically populate in the respective UI elements.
2.  Modify any headers or the request body as needed.
3.  Click the **Send** button.
4.  The response status, time, size, headers, and body will appear in the pane on the right.

### Running Automated Security Tests

1.  Create your `curl` command, but use the marker **`$PAYLOAD$`** in the place where you want the security payloads to be injected. This can be in a URL parameter, a POST body field, or even a header value.

    **Example:**
    ```curl
    curl -X POST "https://api.example.com/login" -d '{"username":"user","password":"$PAYLOAD$"}'
    ```

2.  Select the desired test suite (e.g., SQL Injection, XSS) from the dropdown menu.
3.  Click the **Run Tests** button.
4.  The application will iterate through all payloads for that suite, sending one request per payload.
5.  Once complete, the results will appear in the **Test Results** tab. You can click on each result to expand it and see the details.

### Exporting Results

After running a test suite, a button will appear above the results list.
1.  Click the **Export to Word** button.
2.  A `.docx` file containing a formatted report of all test cases will be downloaded.

## How It Works

-   **Frontend:** The interface is built with vanilla JavaScript and styled with CSS. It communicates with the backend via standard HTTP requests. EJS is used for initial page rendering.
-   **Backend (server.js):** A Node.js server using the Express.js framework acts as a proxy.
    -   It receives request details from the frontend.
    -   It uses Node's native `fetch` API to execute the HTTP request to the target server.
    -   For security tests, it iterates through the payloads defined in `payloads.js`, injects them into the user's template, and executes a request for each one.
    -   For reporting, it generates a structured HTML document from the results and uses the `html-to-docx` library to convert it into a valid Word document.

### A Note on Intranet and HTTPS Targets

-   The HTTP requests are made from the **Node.js server**, not your browser. Therefore, the server must have network access to the target URL. If you want to test an API on your local network (e.g., `http://192.168.1.100`), you must run `GreenAPI` on a machine within that same network.
-   To support testing of internal development servers, this application is configured to **ignore TLS/SSL certificate validation errors** (mimicking `curl -k`). This is insecure for public websites but necessary for testing environments that use self-signed certificates.

## License

Distributed under the ISC License. See `package.json` for more information.
