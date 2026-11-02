import type { LLMProvider, Msg, ToolDef, ToolResultBlock } from "./types";

export type ToolContext = {
  reportStatus: (text: string) => void;                   // progress shown to the user while the tool runs
};

export type Tool = {
  definition: ToolDef;                                    // what the LLM sees
  run: (input: Record<string, unknown>, context: ToolContext) => Promise<unknown>; // what actually executes
};

export type AgentConfig = {
  provider: LLMProvider;
  system: string;
  tools: Tool[];
  model?: string;
  maxTokens?: number;
  maxIterations?: number;                                 // safety cap on the loop
};

export class ChatAgent {
  private toolMap: Map<string, Tool>;

  constructor(
    private config: AgentConfig
) {
    this.toolMap = new Map(config.tools.map((t) => [t.definition.name, t]));
}

  async handleMessage(
    history: Msg[], 
    userText: string,
    options: { onStatus?: (text: string) => void } = {}
): Promise<{ reply: string; history: Msg[] }> {
    const messages: Msg[] = [...history, { role: "user", content: userText }];
    const maxIterations = this.config.maxIterations ?? 10;
    const context: ToolContext = { reportStatus: options.onStatus ?? (() => {}) };

    for (let i = 0; i < maxIterations; i++) {
      context.reportStatus("Thinking…");
      const res = await this.config.provider.createResponse({
        model: this.config.model,
        system: this.config.system,
        messages,
        tools: this.config.tools.map((t) => t.definition),
        maxTokens: this.config.maxTokens ?? 2048,
      });

      messages.push(res.message);

      if (res.stopReason !== "tool_use") {
        return { reply: res.text, history: messages };    // done
      }

      // Run all requested tools in parallel, collect results
      const results = await Promise.all(
        res.toolCalls.map(async (call): Promise<ToolResultBlock> => {
          const tool = this.toolMap.get(call.name);
          if (!tool) {
            return { type: "tool_result", callId: call.id, content: `Unknown tool: ${call.name}`, isError: true };
          }
          try {
            const output = await tool.run(call.input, context);
            return { type: "tool_result", callId: call.id, content: JSON.stringify(output) };
          } catch (err) {
            return { type: "tool_result", callId: call.id, content: String(err), isError: true };
          }
        })
      );

      messages.push({ role: "user", content: results });  // all results in one message
    }

    throw new Error(`ChatAgent exceeded ${maxIterations} iterations`);
  }
}