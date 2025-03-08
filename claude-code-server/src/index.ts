#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import child_process from 'child_process';

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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'explain_code',
          description: 'コードの詳細説明を提供',
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
          description: 'コードのレビューを実施',
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
          description: 'コードのバグ修正や問題解決',
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
          description: 'コードの編集や機能追加',
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
          description: 'コードのテスト生成',
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
          name: 'run_command',
          description: '任意のClaude Codeコマンド実行',
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

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      const runClaudeCommand = (command: string, input?: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          let fullCommand = command;
          if (input) {
            fullCommand = `echo "${input.replace(/"/g, '\\"')}" | ${command}`;
          }
          child_process.exec(fullCommand, { encoding: 'utf8' }, (error, stdout, stderr) => {
            const out = stdout as string;
            const err = stderr as string;
            if (error) {
              return reject(err || error.message);
            }
            resolve(out);
          });
        });
      };

      switch (name) {
        case 'explain_code': {
          const { code, context } = args;
          const command = `claude --print "Explain the following code: ${code} ${context}"`;
          try {
            const output = await runClaudeCommand(command);
            return { content: [{ type: 'text', text: output }] };
          } catch (err) {
            throw new McpError(500, String(err));
          }
        }
        case 'review_code': {
          const { code, focus_areas } = args;
          const command = `claude --print "Review the following code and focus on: ${focus_areas}\n${code}"`;
          try {
            const output = await runClaudeCommand(command);
            return { content: [{ type: 'text', text: output }] };
          } catch (err) {
            throw new McpError(500, String(err));
          }
        }
        case 'fix_code': {
          const { code, issue_description } = args;
          const command = `claude --print "Fix the following code given the issue: ${issue_description}\n${code}"`;
          try {
            const output = await runClaudeCommand(command);
            return { content: [{ type: 'text', text: output }] };
          } catch (err) {
            throw new McpError(500, String(err));
          }
        }
        case 'edit_code': {
          const { code, instructions } = args;
          const command = `claude --print "Edit the following code as per instructions: ${instructions}\n${code}"`;
          try {
            const output = await runClaudeCommand(command);
            return { content: [{ type: 'text', text: output }] };
          } catch (err) {
            throw new McpError(500, String(err));
          }
        }
        case 'test_code': {
          const { code, test_framework } = args;
          const command = `claude --print "Generate tests for the following code using ${test_framework || 'default'} framework:\n${code}"`;
          try {
            const output = await runClaudeCommand(command);
            return { content: [{ type: 'text', text: output }] };
          } catch (err) {
            throw new McpError(500, String(err));
          }
        }
        case 'run_command': {
          const { command, input } = args;
          try {
            const output = await runClaudeCommand(command, input);
            return { content: [{ type: 'text', text: output }] };
          } catch (err) {
            throw new McpError(500, String(err));
          }
        }
        default:
          throw new McpError(404, `Unknown tool: ${name}`);
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Claude Code MCP server running on stdio');
  }
}

const server = new ClaudeCodeServer();
server.run().catch(console.error);
