import axios from "axios";
import { Embedder } from "../context/vectorContextProvider";
import { appConfig } from "../../config/app.config";

/**
 * OpenAI-compatible embeddings implementation of vectorContextProvider's
 * Embedder interface — same "one file knows the wire format" discipline
 * as OpenAIProvider (LLM chat). Swapping embedding providers later means
 * writing one new class implementing Embedder and changing who
 * bootstrap.ts hands to vectorContextProvider.setEmbedder(); nothing
 * else changes.
 */
export class OpenAIEmbedder implements Embedder {
  async embed(text: string): Promise<number[]> {
    const res = await axios.post(
      `${appConfig.embeddings.baseUrl}/embeddings`,
      { model: appConfig.embeddings.model, input: text },
      { headers: { Authorization: `Bearer ${appConfig.embeddings.apiKey}` } }
    );
    return res.data.data[0].embedding;
  }
}
