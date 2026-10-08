import "dotenv/config";
import { KnowledgeStore } from "../core/knowledgeStore";
import { embedder } from "../embedder";

/**
 * Loads backend/knowledge/**\/*.md into the vector store.
 *   npm run knowledge:index            (only new or changed files)
 *   npm run knowledge:index -- --force (re-embed everything)
 */
async function main() {
  const result = await new KnowledgeStore(embedder).indexAll({ force: process.argv.includes("--force") });
  console.log(`indexed: ${result.indexed.length}, unchanged: ${result.unchanged.length}, removed: ${result.removed.length}`);
  for (const slug of result.indexed) console.log(`  + ${slug}`);
  for (const slug of result.removed) console.log(`  - ${slug}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
