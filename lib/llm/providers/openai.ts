import type { 
    LLMProvider, 
    LLMRequest, 
    LLMResponse,
    StopReason,
    ContentBlock,
    ToolCall,
    Msg
} from "@/lib/llm"
import type { ResponseInputItem } from "openai/resources/responses/responses";
import OpenAI from "openai";


const openAIModels: string[] = [
    "gpt-6-luna",
    "gpt-6-terra"
]


export class OpenAIProvider implements LLMProvider {    
    constructor(
        private client: OpenAI = new OpenAI(),
        private defaultModel: string = openAIModels[0]
    ) {}

    public getDefaultModel(): string { return this.defaultModel }
    
    async createResponse(
        req: LLMRequest
    ): Promise<LLMResponse> {
        const response = await this.client.responses.create({
            model: req.model ?? this.defaultModel,
            instructions: req.system,                       // OpenAI's "system prompt"
            input: req.messages.flatMap(toOpenAIInput),     // our Msg[] → their items
            tools: req.tools?.map((t) => ({
                type: "function" as const,
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
                strict: false,                                // allow optional params
            })),
            max_output_tokens: req.maxTokens,
        });

    // ── Translate their output items → our content blocks ──
    const content: ContentBlock[] = [];
    const toolCalls: ToolCall[] = [];

    for (const item of response.output) {
      if (item.type === "message") {
        for (const part of item.content) {
          if (part.type === "output_text") content.push({ type: "text", text: part.text });
        }
      } else if (item.type === "function_call") {
        const call = { id: item.call_id, name: item.name, input: JSON.parse(item.arguments) };
        toolCalls.push(call);
        content.push({ type: "tool_call", ...call });
      } else {
        content.push({ type: "opaque", provider: "openai", data: item }); // e.g. reasoning
      }
    }

    let stopReason: StopReason = "end";
    if (toolCalls.length) stopReason = "tool_use";
    else if (response.incomplete_details?.reason === "max_output_tokens") stopReason = "max_tokens";

    return {
      text: response.output_text,
      toolCalls,
      stopReason,
      message: { role: "assistant", content },
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  }
}

function toOpenAIInput(
    msg: Msg
): ResponseInputItem[] {
  if (typeof msg.content === "string") {
    return [{ 
        role: msg.role, 
        content: msg.content 
    }];
  }

  return msg.content.map((block): ResponseInputItem => {
    switch (block.type) {
      case "text":
        return { 
            role: msg.role, 
            content: block.text 
        };
      case "tool_call":
        return {
          type: "function_call",
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),     // OpenAI wants a JSON string
        };
      case "tool_result":
        return {
          type: "function_call_output",
          call_id: block.callId,
          output: block.isError ? `ERROR: ${block.content}` : block.content,
        };
      case "opaque":
        return block.data as ResponseInputItem;       // pass back untouched
    }
  });
}