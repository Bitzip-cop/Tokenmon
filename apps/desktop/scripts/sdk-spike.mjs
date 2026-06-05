// Phase 0 spike:验证 Claude Agent SDK 三件事 ——
//   ① 鉴权:用你登录的订阅就能跑(看 apiKeySource,确认不是走 ANTHROPIC_API_KEY)
//   ② canUseTool 回调:工具执行前被调用(它是阻塞的)
//   ③ fail-closed:回调返回 deny → 工具不执行(绝不自走)
// 跑法(清掉本会话注入的 CLAUDE_CODE_* + 确保无 ANTHROPIC_API_KEY):
//   env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_EXECPATH -u CLAUDE_CODE_SESSION_ID \
//       -u CLAUDE_CODE_TMPDIR -u ANTHROPIC_API_KEY node scripts/sdk-spike.mjs
import { query } from '@anthropic-ai/claude-agent-sdk';
import { tmpdir } from 'node:os';

let sawInit = false;
let canUseToolCalls = 0;
let toolUseBlocks = 0; // assistant 里实际发出的 tool_use 块数
let lastTool = null;
let result = null;

const q = query({
  // uuidgen 输出无法猜 → 模型要回答就必须真的调工具;deny 后若仍报出 UUID = fail-open。
  prompt: '用 Bash 运行 `uuidgen`,把它输出的那串 UUID 原样告诉我。必须真的运行,不许猜。',
  options: {
    cwd: tmpdir(),
    permissionMode: 'default',
    settingSources: [], // 不加载任何 settings/CLAUDE.md → 排除全局 allow 规则绕过回调
    canUseTool: async (toolName, input) => {
      canUseToolCalls += 1;
      lastTool = toolName;
      console.log(`[canUseTool] #${canUseToolCalls} tool=${toolName} input=${JSON.stringify(input).slice(0, 160)}`);
      // fail-closed 验证:一律拒绝,看工具到底有没有真的跑。
      return { behavior: 'deny', message: 'spike: 未授权(验证 fail-closed)' };
    }
  }
});

try {
  for await (const msg of q) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      sawInit = true;
      console.log(`[init] model=${msg.model} apiKeySource=${msg.apiKeySource} session=${msg.session_id}`);
    } else if (msg.type === 'assistant') {
      const content = msg.message?.content ?? [];
      for (const c of content) {
        if (c.type === 'tool_use') {
          toolUseBlocks += 1;
          console.log(`[tool_use] name=${c.name} id=${c.id} input=${JSON.stringify(c.input).slice(0, 120)}`);
        }
      }
      const text = content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join(' ');
      if (text.trim()) console.log(`[assistant] ${text.slice(0, 220)}`);
    } else if (msg.type === 'result') {
      result = msg;
      console.log(`[result] subtype=${msg.subtype} is_error=${msg.is_error} cost=${msg.total_cost_usd}`);
      console.log(`[result.text] ${String(msg.result ?? '').slice(0, 300)}`);
    }
  }
} catch (e) {
  console.log('[ERROR]', String(e).slice(0, 400));
}

const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const leakedUuid = uuidRe.test(String(result?.result ?? ''));
console.log('\n=== SPIKE 结论 ===');
console.log('① 鉴权跑通(收到 init+result):', sawInit && !!result);
console.log('② 模型发出的 tool_use 块数:', toolUseBlocks, '| canUseTool 被调用次数:', canUseToolCalls, '(最后工具:', lastTool, ')');
console.log('   → tool_use>0 但 canUseTool=0 = 被规则绕过(隐患);两者都>0 = 回调确实拦在工具前;都=0 = 模型没调工具(测试无效,得换更硬的 prompt)');
console.log('③ fail-closed:结果里是否泄漏了真实 UUID:', leakedUuid, '(true=工具被拒却仍跑了=fail-OPEN;false=被拦住了=OK)');
