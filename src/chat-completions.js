import crypto from 'node:crypto';
import { DEFAULT_MODELS } from './constants.js';
import { nowSec } from './utils.js';
import { parseSseFrame, splitSseFrames } from './sse.js';

export function isChatCompletionsPath(reqUrl) {
  const u = new URL(reqUrl, 'http://localhost');
  return u.pathname === '/v1/chat/completions' || u.pathname.endsWith('/chat/completions');
}

function hasDateSnapshotSuffix(value) {
  return /^-\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function resolveSupportedModelAlias(model) {
  const trimmed = String(model || '').trim();
  const normalized = trimmed.toLowerCase();
  for (const alias of DEFAULT_MODELS) {
    const lower = alias.toLowerCase();
    if (normalized === lower) return alias;
    if (normalized.startsWith(lower) && hasDateSnapshotSuffix(normalized.slice(lower.length))) return alias;
  }
  return trimmed;
}

function truncateUtf8(value, limit) {
  const text = String(value || '');
  if (Buffer.byteLength(text) <= limit) return text;
  let used = 0;
  let out = '';
  for (const ch of text) {
    const next = Buffer.byteLength(ch);
    if (used + next > limit) break;
    out += ch;
    used += next;
  }
  return out;
}

function shortenToolNameIfNeeded(name) {
  const LIMIT = 64;
  const raw = String(name || '');
  if (Buffer.byteLength(raw) <= LIMIT) return raw;
  if (raw.startsWith('mcp__')) {
    const index = raw.lastIndexOf('__');
    if (index > 0) return truncateUtf8(`mcp__${raw.slice(index + 2)}`, LIMIT);
  }
  return truncateUtf8(raw, LIMIT);
}

function buildShortToolNameMap(body) {
  const LIMIT = 64;
  const tools = Array.isArray(body?.tools) ? body.tools : [];
  const names = [];
  for (const tool of tools) {
    if ((tool?.type || 'function') !== 'function') continue;
    const name = String(tool?.function?.name || '').trim();
    if (name) names.push(name);
  }

  const used = new Set();
  const map = new Map();
  for (const name of names) {
    const base = shortenToolNameIfNeeded(name);
    let unique = base;
    if (used.has(unique)) {
      let i = 1;
      while (true) {
        const suffix = `_${i}`;
        unique = `${truncateUtf8(base, LIMIT - Buffer.byteLength(suffix))}${suffix}`;
        if (!used.has(unique)) break;
        i += 1;
      }
    }
    used.add(unique);
    map.set(name, unique);
  }
  return map;
}

function buildReverseToolNameMapFromRequest(originalBody) {
  try {
    const body = Buffer.isBuffer(originalBody) ? JSON.parse(originalBody.toString('utf8')) : originalBody;
    return new Map([...buildShortToolNameMap(body).entries()].map(([original, short]) => [short, original]));
  } catch {
    return new Map();
  }
}

function mapToolName(name, shortNameMap) {
  return shortNameMap.get(name) || shortenToolNameIfNeeded(name);
}

function responseTextTypeForRole(role) {
  return String(role || '').toLowerCase() === 'assistant' ? 'output_text' : 'input_text';
}

function extractMessageContentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      return part?.text || part?.content || '';
    }).filter(Boolean).join('');
  }
  return content == null ? '' : String(content);
}

function normalizeChatContentPart(part, role) {
  if (typeof part === 'string') {
    return { type: responseTextTypeForRole(role), text: part };
  }
  if (!part || typeof part !== 'object') {
    return { type: responseTextTypeForRole(role), text: part == null ? '' : String(part) };
  }

  const partType = part.type || 'text';
  if (partType === 'text') {
    return { type: responseTextTypeForRole(role), text: String(part.text || '') };
  }
  if (partType === 'image_url' && String(role).toLowerCase() === 'user') {
    const imageUrl = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
    if (!imageUrl) return null;
    return { type: 'input_image', image_url: imageUrl };
  }
  if (partType === 'file' && String(role).toLowerCase() === 'user') {
    const file = part.file || {};
    const fileData = file.file_data || part.file_data;
    if (!fileData) return null;
    const out = { type: 'input_file', file_data: fileData };
    if (file.filename) out.filename = file.filename;
    return out;
  }

  return part;
}

function normalizeChatContentParts(content, role) {
  if (Array.isArray(content)) return content.map((part) => normalizeChatContentPart(part, role)).filter(Boolean);
  const part = normalizeChatContentPart(content, role);
  return part ? [part] : [];
}

function normalizeChatToolCall(toolCall, shortNameMap) {
  if (!toolCall || typeof toolCall !== 'object') return null;
  if ((toolCall.type || 'function') !== 'function') return null;
  const name = String(toolCall.function?.name || '').trim();
  if (!name) return null;
  return {
    type: 'function_call',
    call_id: toolCall.id || toolCall.call_id || '',
    name: mapToolName(name, shortNameMap),
    arguments: typeof toolCall.function?.arguments === 'string' ? toolCall.function.arguments : '{}',
  };
}

function normalizeChatMessageForResponses(message, shortNameMap) {
  const role = String(message?.role || 'user');
  if (role.toLowerCase() === 'tool') {
    return [{
      type: 'function_call_output',
      call_id: message.tool_call_id || message.call_id || '',
      output: extractMessageContentText(message.content),
    }];
  }

  const items = [];
  const content = normalizeChatContentParts(message?.content ?? '', role);
  if (content.length) {
    items.push({
      type: 'message',
      role: role.toLowerCase() === 'system' ? 'developer' : role,
      content,
    });
  }

  if (role.toLowerCase() === 'assistant' && Array.isArray(message?.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const normalized = normalizeChatToolCall(toolCall, shortNameMap);
      if (normalized) items.push(normalized);
    }
  }
  return items;
}

function normalizeChatMessages(messages, shortNameMap) {
  if (!Array.isArray(messages)) throw new Error('messages must be an array');
  return messages.flatMap((message) => normalizeChatMessageForResponses(message, shortNameMap));
}

function normalizeChatTool(tool, shortNameMap) {
  if (!tool || typeof tool !== 'object') return null;
  if ((tool.type || 'function') !== 'function') return tool;
  const fn = tool.function || {};
  const name = String(fn.name || '').trim();
  if (!name) return null;
  const out = { type: 'function', name: mapToolName(name, shortNameMap) };
  if (fn.description != null) out.description = fn.description;
  if (fn.parameters != null) out.parameters = fn.parameters;
  if (typeof fn.strict === 'boolean') out.strict = fn.strict;
  return out;
}

function normalizeChatToolChoice(toolChoice, shortNameMap) {
  if (typeof toolChoice === 'string') return toolChoice;
  if (!toolChoice || typeof toolChoice !== 'object') return null;
  if ((toolChoice.type || 'function') !== 'function') return toolChoice;
  const name = String(toolChoice.function?.name || '').trim();
  if (!name) return null;
  return { type: 'function', name: mapToolName(name, shortNameMap) };
}

function normalizeResponseFormat(responseFormat) {
  if (!responseFormat || typeof responseFormat !== 'object') return null;
  if (responseFormat.type === 'text') return { format: { type: 'text' } };
  if (responseFormat.type === 'json_schema' && responseFormat.json_schema && typeof responseFormat.json_schema === 'object') {
    const schema = responseFormat.json_schema;
    const format = { type: 'json_schema' };
    if (schema.name != null) format.name = schema.name;
    if (schema.strict != null) format.strict = schema.strict;
    if (schema.schema != null) format.schema = schema.schema;
    return { format };
  }
  return null;
}

export function buildResponsesBodyFromChat(body) {
  if (!body || typeof body !== 'object') throw new Error('request body must be a JSON object');
  const requestedModel = String(body.model || '').trim();
  if (!requestedModel) throw new Error('missing model');

  const shortNameMap = buildShortToolNameMap(body);
  const model = resolveSupportedModelAlias(requestedModel);
  const responsesBody = {
    instructions: '',
    stream: true,
    store: false,
    model,
    input: normalizeChatMessages(body.messages, shortNameMap),
    parallel_tool_calls: true,
    reasoning: {
      effort: body.reasoning_effort || body.reasoning?.effort || 'medium',
      summary: body.reasoning?.summary || 'auto',
    },
    include: ['reasoning.encrypted_content'],
  };

  // Keep this aligned with Cockpit's Codex local access bridge.  The Codex
  // upstream `/responses` endpoint rejects several generic OpenAI request
  // parameters (for example `max_output_tokens`), so chat/completions accepts
  // them from clients but intentionally does not forward them upstream.

  if (Array.isArray(body.tools)) {
    responsesBody.tools = body.tools.map((tool) => normalizeChatTool(tool, shortNameMap)).filter(Boolean);
  }
  if (body.tool_choice != null) {
    const toolChoice = normalizeChatToolChoice(body.tool_choice, shortNameMap);
    if (toolChoice != null) responsesBody.tool_choice = toolChoice;
  }

  const text = {};
  const format = normalizeResponseFormat(body.response_format);
  if (format) Object.assign(text, format);
  if (body.text?.verbosity != null) text.verbosity = body.text.verbosity;
  if (Object.keys(text).length) responsesBody.text = text;

  return {
    responsesBody,
    stream: body.stream === true,
    requestedModel,
    originalBody: Buffer.from(JSON.stringify(body)),
  };
}

export function rewriteModelAliasInJsonBody(body) {
  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : String(body || '');
  if (!raw.trim()) return Buffer.isBuffer(body) ? body : Buffer.from(raw);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Buffer.isBuffer(body) ? body : Buffer.from(raw);
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.model !== 'string') {
    return Buffer.isBuffer(body) ? body : Buffer.from(raw);
  }
  const resolved = resolveSupportedModelAlias(parsed.model);
  if (resolved === parsed.model) return Buffer.isBuffer(body) ? body : Buffer.from(raw);
  parsed.model = resolved;
  return Buffer.from(JSON.stringify(parsed));
}

function extractUsage(response) {
  const root = responsePayloadRoot(response);
  const usage = root?.usage || response?.usage || response?.response?.usage;
  if (!usage) return null;

  const input = usage.input_tokens ?? usage.prompt_tokens ?? 0;
  const output = usage.output_tokens ?? usage.completion_tokens ?? 0;
  const total = usage.total_tokens ?? input + output;
  return {
    prompt_tokens: input,
    completion_tokens: output,
    total_tokens: total,
    prompt_tokens_details: {
      cached_tokens: usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? usage.cached_tokens ?? 0,
    },
    completion_tokens_details: {
      reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens ?? 0,
    },
  };
}

function responsePayloadRoot(value) {
  return value?.response && typeof value.response === 'object' ? value.response : value;
}

function extractResponseId(value) {
  return value?.id || value?.response?.id || null;
}

function chatCompletionChunk({ id, model, created, delta = {}, finishReason = null, usage = null }) {
  return {
    id: id || `chatcmpl_${crypto.randomBytes(8).toString('hex')}`,
    object: 'chat.completion.chunk',
    created: created || nowSec(),
    model: model || 'codex',
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
        native_finish_reason: finishReason,
      },
    ],
    ...(usage ? { usage } : {}),
  };
}

function sseFrameInfo(frame) {
  const parsed = parseSseFrame(frame);
  if (parsed.data) return parsed;
  const trimmed = String(frame || '').trim();
  return { event: parsed.event, data: trimmed || null };
}

function responseEventType(event, sseEventName) {
  return String(event?.type || sseEventName || '').trim();
}

function isResponseCompletionEvent(type) {
  return type === 'response.completed' || type === 'response.done';
}

function restoreToolName(name, reverseToolNameMap) {
  return reverseToolNameMap.get(name) || name;
}

export async function writeChatCompletionsStreamFromResponses(upstream, res, context = {}) {
  let buffer = '';
  const state = {
    id: '',
    model: context.requestedModel || '',
    created: nowSec(),
    toolIndex: -1,
    hasReceivedArgumentsDelta: false,
    hasToolCallAnnounced: false,
    done: false,
  };
  const reverseToolNameMap = buildReverseToolNameMapFromRequest(context.originalBody);
  const capture = { responseId: null, usage: null };

  const writeChunk = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const template = (event = {}, delta = {}, finishReason = null, usage = null) => chatCompletionChunk({
    id: state.id || extractResponseId(event) || '',
    model: event.model || state.model || context.requestedModel,
    created: state.created,
    delta,
    finishReason,
    usage,
  });

  for await (const chunk of upstream.body || []) {
    buffer += Buffer.from(chunk).toString('utf8');
    const parsed = splitSseFrames(buffer);
    buffer = parsed.rest;

    for (const frame of parsed.frames) {
      const sse = sseFrameInfo(frame);
      const payload = sse.data;
      if (!payload || payload === '[DONE]') continue;
      let event;
      try { event = JSON.parse(payload); } catch { continue; }
      const type = responseEventType(event, sse.event);

      if (type === 'response.created' && event.response) {
        state.id = event.response.id || state.id;
        state.model = event.response.model || state.model;
        state.created = event.response.created_at || state.created;
        capture.responseId = state.id || capture.responseId;
        continue;
      }

      if (type === 'response.reasoning_summary_text.delta') {
        if (event.delta) writeChunk(template(event, { role: 'assistant', reasoning_content: event.delta }));
      } else if (type === 'response.reasoning_summary_text.done') {
        writeChunk(template(event, { role: 'assistant', reasoning_content: '\n\n' }));
      } else if (type === 'response.output_text.delta') {
        if (event.delta) writeChunk(template(event, { role: 'assistant', content: event.delta }));
      } else if (type === 'response.output_item.added') {
        const item = event.item || {};
        if (item.type !== 'function_call') continue;
        state.toolIndex += 1;
        state.hasReceivedArgumentsDelta = false;
        state.hasToolCallAnnounced = true;
        writeChunk(template(event, {
          role: 'assistant',
          tool_calls: [{
            index: state.toolIndex,
            id: item.call_id || '',
            type: 'function',
            function: { name: restoreToolName(item.name || '', reverseToolNameMap), arguments: '' },
          }],
        }));
      } else if (type === 'response.function_call_arguments.delta') {
        state.hasReceivedArgumentsDelta = true;
        if (event.delta != null) {
          writeChunk(template(event, {
            tool_calls: [{ index: state.toolIndex, function: { arguments: event.delta } }],
          }));
        }
      } else if (type === 'response.function_call_arguments.done') {
        if (!state.hasReceivedArgumentsDelta && event.arguments != null) {
          writeChunk(template(event, {
            tool_calls: [{ index: state.toolIndex, function: { arguments: event.arguments } }],
          }));
        }
      } else if (type === 'response.output_item.done') {
        const item = event.item || {};
        if (item.type !== 'function_call') continue;
        if (state.hasToolCallAnnounced) {
          state.hasToolCallAnnounced = false;
          continue;
        }
        state.toolIndex += 1;
        writeChunk(template(event, {
          role: 'assistant',
          tool_calls: [{
            index: state.toolIndex,
            id: item.call_id || '',
            type: 'function',
            function: {
              name: restoreToolName(item.name || '', reverseToolNameMap),
              arguments: item.arguments || '',
            },
          }],
        }));
      } else if (isResponseCompletionEvent(type)) {
        const response = event.response || event || {};
        state.id = response.id || state.id;
        state.model = response.model || state.model;
        state.created = response.created_at || state.created;
        capture.responseId = state.id || capture.responseId;
        capture.usage = extractUsage(event);
        const finishReason = state.toolIndex >= 0 ? 'tool_calls' : 'stop';
        writeChunk(template(event, {}, finishReason, extractUsage(event)));
        res.write('data: [DONE]\n\n');
        state.done = true;
      }
    }
  }

  if (!state.done) res.write('data: [DONE]\n\n');
  return capture;
}

function mergeCompletedResponse(responseValue, outputText, outputItems) {
  const response = responseValue && typeof responseValue === 'object' ? { ...responseValue } : {};
  if ((!Array.isArray(response.output) || response.output.length === 0) && outputItems.length) {
    response.output = outputItems;
  }
  if (!response.output_text && outputText) response.output_text = outputText;
  return { response };
}

async function collectResponsesPayloadFromUpstream(upstream) {
  let text = '';
  if (upstream.body) {
    for await (const chunk of upstream.body) text += Buffer.from(chunk).toString('utf8');
  }
  const trimmed = text.trim();
  if (!trimmed) return { response: {} };
  try {
    const parsed = JSON.parse(trimmed);
    return parsed?.response ? parsed : { response: parsed };
  } catch {}

  let rest = text;
  let completedResponse = null;
  let outputText = '';
  const outputItems = [];
  const parsed = splitSseFrames(rest);
  const frames = parsed.rest.trim() ? [...parsed.frames, parsed.rest] : parsed.frames;
  for (const frame of frames) {
    const sse = sseFrameInfo(frame);
    const payload = sse.data;
    if (!payload || payload === '[DONE]') continue;
    let event;
    try { event = JSON.parse(payload); } catch { continue; }
    const type = responseEventType(event, sse.event);
    if (type === 'response.output_text.delta') {
      outputText += event.delta || '';
    } else if (type === 'response.output_text.done' && !outputText) {
      outputText += event.text || '';
    } else if (type === 'response.output_item.done' && event.item) {
      outputItems.push(event.item);
    } else if (isResponseCompletionEvent(type)) {
      completedResponse = event.response || event;
    }
  }
  return mergeCompletedResponse(completedResponse, outputText, outputItems);
}

function appendText(buffer, text) {
  if (text) buffer.value += text;
}

function extractOutputTextFromResponse(responseBody) {
  const root = responsePayloadRoot(responseBody);
  if (typeof root.output_text === 'string' && root.output_text) return root.output_text;
  const out = { value: '' };
  for (const item of Array.isArray(root.output) ? root.output : []) {
    if (item?.type !== 'message') continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type === 'output_text') appendText(out, part.text || '');
    }
  }
  return out.value;
}

function extractReasoningTextFromResponse(responseBody) {
  const root = responsePayloadRoot(responseBody);
  const out = { value: '' };
  for (const item of Array.isArray(root.output) ? root.output : []) {
    if (item?.type !== 'reasoning') continue;
    for (const summary of Array.isArray(item.summary) ? item.summary : []) {
      if (summary?.type === 'summary_text') appendText(out, summary.text || '');
    }
  }
  return out.value;
}

function extractResponseToolCalls(responseBody, reverseToolNameMap) {
  const root = responsePayloadRoot(responseBody);
  const result = [];
  for (const item of Array.isArray(root.output) ? root.output : []) {
    if (item?.type !== 'function_call') continue;
    const name = String(item.name || '').trim();
    if (!name) continue;
    result.push({
      id: item.call_id || '',
      type: 'function',
      function: {
        name: restoreToolName(name, reverseToolNameMap),
        arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}),
      },
    });
  }
  return result;
}

function buildChatCompletionPayload(responseBody, requestedModel, originalBody) {
  const root = responsePayloadRoot(responseBody);
  const reverseToolNameMap = buildReverseToolNameMapFromRequest(originalBody);
  const content = extractOutputTextFromResponse(responseBody);
  const reasoningContent = extractReasoningTextFromResponse(responseBody);
  const toolCalls = extractResponseToolCalls(responseBody, reverseToolNameMap);
  const message = {
    role: 'assistant',
    content: content || null,
    reasoning_content: reasoningContent || null,
    tool_calls: toolCalls.length ? toolCalls : null,
  };
  const finishReason = toolCalls.length ? 'tool_calls' : 'stop';

  return {
    id: root.id || `chatcmpl-local-${Date.now()}`,
    object: 'chat.completion',
    created: root.created_at || root.created || nowSec(),
    model: root.model || requestedModel || 'codex',
    choices: [{
      index: 0,
      message,
      finish_reason: finishReason,
      native_finish_reason: finishReason,
    }],
    usage: extractUsage(responseBody) || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

export async function writeChatCompletionsResponseFromResponses(upstream, res, context = {}) {
  const responsePayload = await collectResponsesPayloadFromUpstream(upstream);
  const chatPayload = buildChatCompletionPayload(responsePayload, context.requestedModel, context.originalBody);
  res.write(JSON.stringify(chatPayload));
  return {
    responseId: extractResponseId(responsePayload),
    usage: extractUsage(responsePayload),
  };
}
