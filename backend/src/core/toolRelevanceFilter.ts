import { ToolDefinition } from "./types";

export function narrowToolsForPrompt(tools: ToolDefinition[], _prompt: string): ToolDefinition[] {
  return tools;
}
