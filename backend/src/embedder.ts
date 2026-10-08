import { appConfig } from "./config/app.config";
import { OpenAIEmbedder } from "./providers/embeddings/openaiEmbedder";

// One embedder shared by every vector consumer (WARM context tier, policy
// documents, knowledge base) so they all embed into the same space. Null
// without EMBEDDINGS_API_KEY/LLM_API_KEY: every consumer then no-ops.
// Its own file so tool modules can import it without importing bootstrap.
export const embedder = appConfig.embeddings.apiKey ? new OpenAIEmbedder() : null;
