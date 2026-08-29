import { MCPModule, ToolDefinition } from "./types";

/**
 * Central plugin registry. Modules register themselves here (see
 * bootstrap.ts) — nothing else in the system imports a module
 * directly. Adding module #5 never means editing this file.
 */
class ModuleRegistry {
  private modules = new Map<string, MCPModule>();

  register(module: MCPModule) {
    if (this.modules.has(module.name)) {
      throw new Error(`Module "${module.name}" already registered`);
    }
    for (const tool of module.tools) {
      if (this.findTool(tool.name)) {
        throw new Error(`Duplicate tool name across modules: "${tool.name}"`);
      }
    }
    this.modules.set(module.name, module);
  }

  // Test-only escape hatch: this registry is a real module-level
  // singleton, shared for the lifetime of one process (one jest test
  // FILE, since bootstrapModules() never runs in tests — see
  // relayReasoningEngine.test.ts's own "moduleRegistry starts empty"
  // tests). A test that needs a real registered fixture tool must undo
  // it afterward or it silently pollutes every later test in the same
  // file that assumes an empty registry. Production code never calls
  // this — modules are registered once at boot and never removed.
  unregister(name: string) {
    this.modules.delete(name);
  }

  getModules(): MCPModule[] {
    return Array.from(this.modules.values());
  }

  getAllTools(): ToolDefinition[] {
    return this.getModules().flatMap((m) => m.tools);
  }

  findTool(name: string): ToolDefinition | undefined {
    return this.getAllTools().find((t) => t.name === name);
  }
}

export const moduleRegistry = new ModuleRegistry();
