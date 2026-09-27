/**
 * Guardrails for the recruiter-facing agent.
 *
 * Two layers:
 * 1. Input guardrail — LLM classifier that checks each recruiter message against
 *    owner-interest rules (no source-code exfiltration, no instruction-hijacking,
 *    no defamation bait, no privacy fishing). Trips → the agent never even runs.
 * 2. Output filter — deterministic last-resort redaction of bulk source code /
 *    raw doc dumps in the final answer (defense in depth, zero LLM cost).
 */

export { checkInput, type GuardrailResult, type ViolationType } from './input.js';
export { redactSourceDumps } from './output.js';

/**
 * Polite Chinese refusal messages per violation type.
 */
function getBlockMessage(violation: string): string {
  switch (violation) {
    case 'source_code_exfiltration':
      return '抱歉，为保护候选人的知识产权，我无法提供项目源代码、配置文件或内部文档的原始内容。如果您对技术实现感兴趣，我很乐意以技术方案的形式为您讲解架构思路和技术亮点，也建议安排技术面试深入了解。';
    case 'prompt_injection':
      return '抱歉，我只能作为候选人的AI助手回答与招聘相关的问题。如果您想了解候选人的工作经历、项目经验或技术能力，请随时提问。';
    case 'defamation':
      return '抱歉，我无法对候选人进行负面评价或编造不实信息。我的职责是客观、准确地介绍候选人的经历和能力。如果您有具体的技术或经历方面的疑问，我很乐意回答。';
    case 'privacy_fishing':
      return '抱歉，候选人的身份证号、家庭住址、家属信息、详细薪资流水等属于个人隐私信息，我无法提供。如果您需要了解候选人的期望薪资范围或工作地点偏好，我可以为您查询简历中公开的信息。';
    default:
      return '抱歉，该请求超出了我的服务范围。我可以帮助您了解候选人的工作经历、项目经验、技术栈和求职意向。请换个问题试试。';
  }
}

export interface GuardrailResponse {
  response: string;
  blocked: boolean;
  blockReason?: string;
}

/**
 * Apply both input and output guardrails around a response generation function.
 *
 * Flow:
 * 1. Check input with LLM classifier
 * 2. If blocked → return polite refusal (never runs the agent)
 * 3. If safe → run the agent → apply output redaction filter
 */
export async function applyGuardrails(
  message: string,
  generateResponse: (msg: string) => Promise<string>,
): Promise<GuardrailResponse> {
  const { checkInput } = await import('./input.js');
  const { redactSourceDumps } = await import('./output.js');

  // Layer 1: Input classification
  const inputCheck = await checkInput(message);
  if (!inputCheck.safe) {
    return {
      response: getBlockMessage(inputCheck.violation!),
      blocked: true,
      blockReason: inputCheck.reason,
    };
  }

  // Layer 2: Generate response, then apply output filter
  const raw = await generateResponse(message);
  const redacted = redactSourceDumps(raw);

  return { response: redacted, blocked: false };
}
