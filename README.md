# claude-code-mcp Project

## Overview

This project aims to build a Claude Code MCP server and implement its associated tools (explain_code, review_code, fix_code, edit_code, test_code, simulate_command, your_own_query). The server is implemented using Node.js and the MCP SDK. It receives tool requests from clients via Stdio, dynamically generates and executes `claude --print` commands based on each tool definition, and returns the results to the client.

The **Base64 encoding method** was adopted as the input processing improvement approach. This allows the client side to send raw natural language text (code, README, etc.) as is, and the MCP server reliably solves special character problems (line breaks, double quotes, etc.) internally by Base64 encoding/decoding. This is key to improving the stability and flexibility of the entire system.

The main roles of the server are:

-   **Request Reception:** Receive JSON format tool requests from clients (e.g. `code`, `context`, `focus_areas`, etc.).
-   **Input Processing:** Internally Base64 encode the received natural language text.
-   **Tool Selection and Command Generation:** Based on the tool name in the request, assemble a command string for the query using a fixed template or free format (`your_own_query`).
-   **Command Execution:** Use Node.js's `child_process.exec` to execute the assembled command and get the result from standard output.
-   **Result Return:** Return the execution result to the client in JSON format.

## Getting Started

### Prerequisites

-   Node.js (tested with v22.14.0)
-   npm (or yarn)
-   Claude Code command installed and auth completed.
    https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview

### Installation

1.  Clone the repository:

    ```bash
    git clone https://github.com/KunihiroS/claude-code-mcp.git
    cd claude-code-mcp
    ```
2.  Install dependencies:

    ```bash
    cd claude-code-server
    npm install
    ```

3.  Create a `.env` file in the `claude-code-server` directory based on `.env.example` and set the environment variables.  You must set `CLAUDE_BIN` to the path of your Claude CLI executable.

4.  Build the server:

    ```bash
    npm run build
    ```
### Usage

Add the following to your MCP Host application settings :

```json
    "claude-code-server": {
      "command": "node",
      "args": [
        "FULL PATH-TO-YOUR-DIRECTORY/claude-code-mcp/claude-code-server/build/index.js"
      ],
      "disabled": false,
    }
```
(may required restart host application.)

## Environment Variables

This server uses the following environment variables:

-   `CLAUDE_BIN`: Specifies the path to the Claude CLI executable. (Required)  
    Example: /home/linuxbrew/.linuxbrew/bin/claude
-   `LOG_LEVEL`: Specifies the log level. (Optional, defaults to `info`)

To set these variables, you need to create a `.env` file in the `claude-code-server` directory. Use `.env.example` as a template.

## Available Tools
The `claude-code-server` provides the following tools:

- `explain_code`: Provides a detailed explanation of the given code.
- `review_code`: Reviews the given code.
- `fix_code`: Fixes bugs or issues in the given code.
- `edit_code`: Edits the given code based on instructions.
- `test_code`: Generates tests for the given code.
- `simulate_command`: Simulates the execution of a given command.
- `your_own_query`: Sends a custom query with context.

## Note

- Log rotation is not implemented yet.
- Only tested with Cline / Ubuntu / WSL2.