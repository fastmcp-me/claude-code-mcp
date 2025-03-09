#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import child_process from 'child_process';

import * as dotenv from 'dotenv';
dotenv.config();

// claudeコマンドのパスを環境変数 CLAUDE_BIN から取得
const CLAUDE_BIN = process.env.CLAUDE_BIN!;

// 実行前にClaude CLIの存在を確認し、バージョンも出力
try {
    const versionOutput = child_process.execSync(`${CLAUDE_BIN} --version`, { encoding: 'utf8' });
    console.error(`Claude CLI found: ${versionOutput.trim()}`);
}
catch (err) {
    console.error(`警告: Claude CLI (${CLAUDE_BIN}) が実行できません。詳細エラー:`, err);
    console.error(`PATH: ${process.env.PATH}`);
    // プログラムは続行します - ランタイムでも再チェックします
}

if (!CLAUDE_BIN) {
    console.error('Error: CLAUDE_BIN environment variable is not set.');
    process.exit(1); // または、適切なエラー処理を行う
  }

// Base64 エンコード／デコード ヘルパー関数
function encodeText(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64');
}

function decodeText(encoded: string): string {
    return Buffer.from(encoded, 'base64').toString('utf8');
}

class ClaudeCodeServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'claude-code-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    this.server.onerror = (error: any) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    // ツールリストの設定
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'explain_code',
          description: 'コードの詳細な説明を提供します。',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '対象コード' },
              context: { type: 'string', description: '追加コンテキスト', default: '' }
            },
            required: ['code']
          }
        },
        {
          name: 'review_code',
          description: 'コードのレビューを実施します。',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'レビュー対象コード' },
              focus_areas: { type: 'string', description: '重点的に見るべき領域', default: '' }
            },
            required: ['code']
          }
        },
        {
          name: 'fix_code',
          description: 'コードのバグ修正や問題解決を行います。',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '修正対象コード' },
              issue_description: { type: 'string', description: '問題の説明' }
            },
            required: ['code', 'issue_description']
          }
        },
        {
          name: 'edit_code',
          description: 'コードの編集や機能追加の指示を得ます。',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '編集対象コード' },
              instructions: { type: 'string', description: '編集指示' }
            },
            required: ['code', 'instructions']
          }
        },
        {
          name: 'test_code',
          description: 'コードに対するテストを生成します。',
          inputSchema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: 'テスト対象コード' },
              test_framework: { type: 'string', description: '使用するテストフレームワーク', default: '' }
            },
            required: ['code']
          }
        },
        {
          name: 'simulate_command',
          description: '指定されたコマンドの実行結果をシミュレートします。',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: '実行するコマンド' },
              input: { type: 'string', description: '入力データ', default: '' }
            },
            required: ['command']
          }
        },
        {
          name: 'your_own_query',
          description: '自由な問い合わせを送信するツール。Hostが独自の問い合わせ文とコンテキストを渡します。',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: '問い合わせ文' },
              context: { type: 'string', description: '追加コンテキスト', default: '' }
            },
            required: ['query']
          }
        }
      ]
    }));

    // ツール実行リクエスト処理
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      const runClaudeCommand = (claudeArgs: string[], stdinInput?: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          // タイムアウト設定 (5分)
          const timeoutMs = 5 * 60 * 1000;
          let timeoutId: NodeJS.Timeout;
          
          try {
            // より詳細なデバッグ情報
            console.error(`Debug: Executing Claude CLI at: ${CLAUDE_BIN}`);
            console.error(`Debug: Arguments: ${JSON.stringify(claudeArgs)}`);
            if (stdinInput) console.error(`Debug: Input length: ${stdinInput.length} characters`);
            
            // 環境変数をログに出力
            console.error(`Debug: Environment PATH: ${process.env.PATH}`);
            
            const proc = child_process.spawn(CLAUDE_BIN, claudeArgs, { 
              env: { ...process.env },
              stdio: ['pipe', 'pipe', 'pipe'] 
            });
            
            // 標準入力がある場合は書き込みと終了
            if (stdinInput) {
              proc.stdin.write(stdinInput);
              proc.stdin.end();
            }
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout.on('data', (data) => { 
              const chunk = data.toString();
              stdout += chunk; 
            });
            
            proc.stderr.on('data', (data) => { 
              const chunk = data.toString();
              stderr += chunk; 
              console.error(`Claude stderr: ${chunk}`);
            });
            
            // タイムアウト設定
            timeoutId = setTimeout(() => {
              console.error("Command timed out after", timeoutMs, "ms");
              proc.kill();
              reject(new Error(`Command timed out after ${timeoutMs / 1000} seconds`));
            }, timeoutMs);
            
            proc.on('close', (code) => {
              clearTimeout(timeoutId);
              if (code === 0) {
                resolve(stdout.trim());
              } else {
                console.error(`Debug: Command failed with code ${code}`);
                console.error(`Debug: stderr: ${stderr}`);
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
              }
            });
            
            proc.on('error', (err) => {
              clearTimeout(timeoutId);
              console.error("Debug: Process spawn error:", err);
              reject(err);
            });
          } catch (err) {
            console.error("Failed to spawn process:", err);
            reject(err);
          }
        });
      };

      try {
        // 文字列の最大長さを制限する関数
        const truncateIfNeeded = (str: string, maxLength = 10000): string => {
          if (str.length > maxLength) {
            console.error(`警告: 入力が長すぎるため切り詰めます (${str.length} -> ${maxLength})`);
            return str.substring(0, maxLength) + "... [truncated]";
          }
          return str;
        };
        
        // エラーを適切に処理するために各ケースを try-catch で囲む
        switch (name) {
          case 'explain_code': {
            const { code, context } = args;
            try {
              const encodedCode = encodeText(truncateIfNeeded(code));
              // ファイルを使用して大きな入力を渡す場合の代替方法
              const prompt = `You are super professional engineer. Please kindly provide a detailed explanation of the following Base64 encoded code:\n\n${encodedCode}\n\nAdditional context (if provided):\n${context || 'No additional context provided.'}`;
              const output = await runClaudeCommand(['--print'], prompt);
              return { content: [{ type: 'text', text: output }] };
            } catch (err) {
              console.error("Error in explain_code:", err);
              throw err;
            }
          }
          // 他のケースも同様にファイル入力を使用するように変更
          case 'review_code': {
            const { code, focus_areas } = args;
            try {
              const encodedCode = encodeText(truncateIfNeeded(code));
              const prompt = `You are super professional engineer. Please review the following Base64 encoded code. Consider code readability, efficiency, potential bugs, and security vulnerabilities.\n\nCode:\n${encodedCode}\n\nFocus areas (if provided):\n${focus_areas || 'No specific focus areas provided.'}`;
              const output = await runClaudeCommand(['--print'], prompt);
              return { content: [{ type: 'text', text: output }] };
            } catch (err) {
              console.error("Error in review_code:", err);
              throw err;
            }
          }
          case 'fix_code': {
            const { code, issue_description } = args;
            const encodedCode = encodeText(truncateIfNeeded(code));
            const prompt = `You are super professional engineer. Please fix the following Base64 encoded code, addressing the issue described below:\n\nCode:\n${encodedCode}\n\nIssue description:\n${issue_description}`;
            const output = await runClaudeCommand(['--print'], prompt);
            return { content: [{ type: 'text', text: output }] };
          }
          case 'edit_code': {
            const { code, instructions } = args;
            const encodedCode = encodeText(truncateIfNeeded(code));
            const prompt = `You are super professional engineer. Please edit the following Base64 encoded code according to the instructions provided:\n\nCode:\n${encodedCode}\n\nInstructions:\n${instructions}`;
            const output = await runClaudeCommand(['--print'], prompt);
            return { content: [{ type: 'text', text: output }] };
          }
          case 'test_code': {
            const { code, test_framework } = args;
            const encodedCode = encodeText(truncateIfNeeded(code));
            const framework = test_framework || 'default';
            const prompt = `You are super professional engineer. Please generate tests for the following Base64 encoded code.\n\nCode:\n${encodedCode}\n\nTest framework (if specified):\n${framework || 'No specific framework provided. Please use a suitable default framework.'}`;
            const output = await runClaudeCommand(['--print'], prompt);
            return { content: [{ type: 'text', text: output }] };
          }
          case 'simulate_command': {
            const { command, input } = args;
            const prompt = `You are super professional engineer. Simulate the execution of the following command:\n\nCommand: ${command}\n\nInput: ${input || 'No input provided.'}\n\nDescribe the expected behavior and output, without actually executing the command.`;
            const output = await runClaudeCommand(['--print'], prompt);
            return { content: [{ type: 'text', text: output }] };
          }
          case 'your_own_query': {
            const { query, context } = args;
            const prompt = `Query: ${query} ${context || ''}`;
            const output = await runClaudeCommand(['--print'], prompt);
            return { content: [{ type: 'text', text: output }] };
          }
          default:
            throw new McpError(404, "Unknown tool: " + name);
        }
      } catch (err) {
        console.error("Error executing tool:", err);
        throw new McpError(500, err instanceof Error ? err.message : String(err));
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Claude Code MCP server running on stdio");
  }
}

const server = new ClaudeCodeServer();
server.run().catch(console.error);
