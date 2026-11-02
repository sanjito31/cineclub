
export type StopReason = "end" | "tool_use" | "max_tokens";

// ── Content blocks: the pieces a message can contain ──
export type TextBlock = { type: "text"; text: string };

export type ToolCallBlock = {
  type: "tool_call";
  id: string;                       // vendor-generated call ID
  name: string;                     // which tool
  input: Record<string, unknown>;   // parsed JSON args
};

export type ToolResultBlock = {
  type: "tool_result";
  callId: string;                   // matches ToolCallBlock.id
  content: string;                  // result, usually JSON.stringify'd
  isError?: boolean;                // tell the LLM the tool failed
};

export type OpaqueBlock = {
  type: "opaque";
  provider: string;                 // e.g. "anthropic"
  data: unknown;                    // vendor block passed back untouched
};

export type ContentBlock = TextBlock | ToolCallBlock | ToolResultBlock | OpaqueBlock;

// ── Core types ──
export type Msg = {
  role: "user" | "assistant";
  content: string | ContentBlock[]; // string shorthand for plain text
};

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema object
};

export type ToolCall = Omit<ToolCallBlock, "type">; // { id, name, input }

export type Usage = { inputTokens: number; outputTokens: number };

export type LLMRequest = {
  model?: string;
  system?: string;
  messages: Msg[];
  tools?: ToolDef[];
  maxTokens?: number;
};

export type LLMResponse = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  message: Msg;
  usage: Usage;
};


export interface LLMProvider {
    createResponse(req: LLMRequest): Promise<LLMResponse>
}