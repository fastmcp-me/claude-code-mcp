#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError } from '@modelcontextprotocol/sdk/types.js';
import child_process from 'child_process';
import * as dotenv from 'dotenv';
import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ロガーのフォーマット設定を共通化
const createLoggerFormat = () => {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level}] ${message}`;
    })
  );
};

// 初期ロガーの設定（.envの読み込み前に最小限のロガーを設定）
const initialLogger = winston.createLogger({
  level: 'info',
  format: createLoggerFormat(),
  transports: [
    new winston.transports.Console()
  ]
});

// .envファイルのロード試行（複数の候補パスを試す）
const envPaths = [
  path.resolve(__dirname, '../.env'),        // 開発環境
  path.resolve(__dirname, '../../.env'),     // ビルド後の環境
  path.resolve(process.cwd(), 'claude-code-server/.env')        // カレントディレクトリ
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    const result = dotenv.config({ path: envPath });
    if (result.error) {
      initialLogger.error(`Failed to load .env file from ${envPath}: ${result.error.message}`);
    } else {
      initialLogger.info(`Successfully loaded .env file from ${envPath}`);
      envLoaded = true;
      break;
    }
  }
}

// .envファイルが見つからなかった場合のユーザーフレンドリーなメッセージ
if (!envLoaded) {
  initialLogger.warn('.env ファイルが見つかりません。.env.example を参考に .env ファイルを作成してください。');
  initialLogger.warn('確認したパス: ' + envPaths.join(', '));
}

// ログレベルの明示的な確認（デバッグ用）
console.log(`環境変数LOG_LEVEL: ${process.env.LOG_LEVEL}`);

// ログファイルパスを決定するシンプルな方法
let logFilePath: string | null = null;

// 1. まずホームディレクトリに直接書き込みを試みる（これが成功するようです）
try {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  if (homeDir) {
    const homeLogPath = path.resolve(homeDir, '.claude-code-server.log');
    fs.writeFileSync(homeLogPath, `# Log file initialization at ${new Date().toISOString()}\n`, { flag: 'a' });
    console.log(`ホームディレクトリにログファイルを作成しました: ${homeLogPath}`);
    logFilePath = homeLogPath;
  }
} catch (err) {
  console.error(`ホームディレクトリへの書き込みエラー: ${err instanceof Error ? err.message : String(err)}`);
  
  // 2. 次にプロジェクトルートに試みる
  try {
    const projectLogPath = path.resolve(__dirname, '../../claude-code-server.log');
    fs.writeFileSync(projectLogPath, `# Log file initialization at ${new Date().toISOString()}\n`, { flag: 'a' });
    logFilePath = projectLogPath;
    console.log(`プロジェクトルートにログファイルを作成: ${logFilePath}`);
  } catch (err2) {
    console.error(`プロジェクトルートへの書き込みエラー: ${err2 instanceof Error ? err2.message : String(err2)}`);
    
    // 3. 最後に/tmpに試す
    try {
      const tmpPath = '/tmp/claude-code-server.log';
      fs.writeFileSync(tmpPath, `# Log file initialization at ${new Date().toISOString()}\n`, { flag: 'a' });
      logFilePath = tmpPath;
      console.log(`一時ディレクトリにログファイルを作成: ${logFilePath}`);
    } catch (err3) {
      console.error('すべてのログファイルパスが失敗しました。ログはコンソールのみになります。');
      logFilePath = null;
    }
  }
}

// ファイル情報の診断
if (logFilePath) {
  try {
    const stats = fs.statSync(logFilePath);
    console.log('ファイル情報:');
    console.log(` - サイズ: ${stats.size} バイト`);
    console.log(` - パーミッション: ${(stats.mode & 0o777).toString(8)}`);
    console.log(` - UID/GID: ${stats.uid}/${stats.gid}`);
  } catch (err) {
    console.error('ファイル情報取得エラー:', err);
  }
}

// 環境変数からログレベルを確実に取得
const logLevel = process.env.LOG_LEVEL || 'info';
console.log(`設定するログレベル: ${logLevel}`);

// Winstonロガーの設定
const logger = winston.createLogger({
  // 環境変数からログレベルを設定
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level}] ${message}`;
    })
  ),
  transports: [
    // コンソールトランスポートもログレベル設定を継承
    new winston.transports.Console({ level: logLevel })
  ]
});

// ファイルトランスポートの追加
if (logFilePath) {
  try {
    // ファイルトランスポートを作成
    const fileTransport = new winston.transports.File({
      filename: logFilePath,
      // 明示的にログレベルを設定
      level: logLevel,
      options: { flags: 'a' }
    });
    
    // ファイルトランスポート追加
    logger.add(fileTransport);
    console.log(`ログファイルを追加しました: ${logFilePath}`);
    console.log(`ファイルログレベル: ${logLevel}`);
    
    // テストログ
    logger.silly('これはsillyレベルのログです');
    logger.debug('これはdebugレベルのログです - デバッグログが機能していればログに記録されます');
    logger.verbose('これはverboseレベルのログです');
    logger.info('これはinfoレベルのログです');
    logger.warn('これはwarnレベルのログです');
    logger.error('これはerrorレベルのログです');
    
    // 同期書き込みテスト
    fs.appendFileSync(logFilePath, `# 同期書き込みテスト - ログレベル: ${logLevel} - ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error('ファイルトランスポート設定エラー:', err);
  }
}

// 起動時にテストログを書き込み - 同期的にも書き込み
logger.info('=== Claude Code Server 起動 ===');
if (logFilePath) {
  try {
    // 同期的にも書き込み
    fs.appendFileSync(logFilePath, `[INFO] 起動確認: ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error(`ログファイル書き込みエラー: ${err}`);
  }
}

// ログフラッシュ関数をシンプル化
const flushLog = () => {
  console.log('ログをフラッシュしています...');
  
  if (logFilePath) {
    try {
      // 同期的に書き込み
      fs.appendFileSync(logFilePath, `\n# プロセス終了: ${new Date().toISOString()}\n`);
      console.log('✓ 終了メッセージを書き込みました');
    } catch (appendErr) {
      console.error('終了時のログ書き込みエラー:', appendErr);
    }
  }
  
  try {
    // Winstonのクローズを試みる（エラーを無視）
    logger.close();
  } catch (err) {
    // 無視
  }
};

// プロセス終了時にログを確実にフラッシュ
process.on('exit', flushLog);

// SIGINT (Ctrl+C) 処理
process.on('SIGINT', () => {
  logger.info('SIGINT受信。終了します。');
  flushLog();
  process.exit(0);
});

// 未処理の例外をキャッチ
process.on('uncaughtException', (err) => {
  logger.error(`未処理の例外: ${err.message}`);
  logger.error(err.stack);
  flushLog();
  process.exit(1);
});

// claudeコマンドのパスを環境変数 CLAUDE_BIN から取得
const CLAUDE_BIN = process.env.CLAUDE_BIN;

if (!CLAUDE_BIN) {
    logger.error('Error: CLAUDE_BIN environment variable is not set.');
    process.exit(1); // または、適切なエラー処理を行う
}

// 実行前にClaude CLIの存在を確認し、バージョンも出力
if (CLAUDE_BIN) {
    try {
        const versionOutput = child_process.execSync(`${CLAUDE_BIN} --version`, { encoding: 'utf8' });
        logger.info(`Claude CLI found: ${versionOutput.trim()}`);
    }
    catch (err) {
        logger.error(`警告: Claude CLI (${CLAUDE_BIN}) が実行できません。詳細エラー:`, err);
        console.error(`PATH: ${process.env.PATH}`);
        // プログラムは続行します - ランタイムでも再チェックします
    }
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

    this.server.onerror = (error: any) => logger.error('[MCP Error]', error);
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
            logger.debug(`Executing Claude CLI at: ${CLAUDE_BIN}`);
            logger.debug(`Arguments: ${JSON.stringify(claudeArgs)}`);
            if (stdinInput) logger.debug(`Input length: ${stdinInput.length} characters`);
            
            // 環境変数をログに出力
            logger.debug(`Environment PATH: ${process.env.PATH}`);
            
            const proc = child_process.spawn(CLAUDE_BIN!, claudeArgs, {
                env: { ...process.env },
                stdio: ['pipe', 'pipe', 'pipe']
            }) as child_process.ChildProcess;

            // 標準入力がある場合は書き込みと終了
            if (stdinInput) {
                proc.stdin!.write(stdinInput);
                proc.stdin!.end();
            }

            let stdout = '';
            let stderr = '';

            proc.stdout!.on('data', (data: string) => {
                const chunk = data.toString();
                stdout += chunk;
            });

            proc.stderr!.on('data', (data: string) => {
                const chunk = data.toString();
                stderr += chunk;
                logger.error(`Claude stderr: ${chunk}`);
            });

            // タイムアウト設定
            timeoutId = setTimeout(() => {
                logger.error("Command timed out after", timeoutMs, "ms");
                proc.kill();
                reject(new Error(`Command timed out after ${timeoutMs / 1000} seconds`));
            }, timeoutMs);

            proc.on('close', (code: number) => {
                clearTimeout(timeoutId);
                if (code === 0) {
                    resolve(stdout.trim());
                }
                else {
                    logger.error(`Debug: Command failed with code ${code}`);
                    logger.error(`Debug: stderr: ${stderr}`);
                    reject(new Error(`Command failed with code ${code}: ${stderr}`));
                }
            });

            proc.on('error', (err: Error) => {
                clearTimeout(timeoutId);
                logger.error("Debug: Process spawn error:", err);
                reject(err);
            });
          } catch (err) {
            logger.error("Failed to spawn process:", err);
            reject(err);
          }
        });
      };

      try {
        // 文字列の最大長さを制限する関数
        const truncateIfNeeded = (str: string, maxLength = 10000): string => {
          if (str.length > maxLength) {
            logger.warn(`警告: 入力が長すぎるため切り詰めます (${str.length} -> ${maxLength})`);
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
              logger.error("Error in explain_code:", err);
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
              logger.error("Error in review_code:", err);
              throw err;
            }
          }
          case 'fix_code': {
            const { code, issue_description } = args;
            const encodedCode = encodeText(truncateIfNeeded(code));
            const prompt = `You are super professional engineer. Please fix the following Base64 encoded code, addressing the issue described below:\n\nCode:\n${encodedCode}\n\nIssue description:\n${issue_description ?? 'No specific issue described.'}`;
            const output = await runClaudeCommand(['--print'], prompt);
            return { content: [{ type: 'text', text: output }] };
          }
          case 'edit_code': {
            const { code, instructions } = args;
            const encodedCode = encodeText(truncateIfNeeded(code));
            const prompt = `You are super professional engineer. Please edit the following Base64 encoded code according to the instructions provided:\n\nCode:\n${encodedCode}\n\nInstructions:\n${instructions ?? 'No specific instructions provided.'}`;
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
        logger.error("Error executing tool:", err);
        throw new McpError(500, err instanceof Error ? err.message : String(err));
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("Claude Code MCP server running on stdio");
  }
}

const server = new ClaudeCodeServer();
server.run().catch(console.error);
