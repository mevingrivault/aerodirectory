import type { MetadataRoute } from "next";

/**
 * Search engines may index the public pages. Crawlers that collect content
 * to train AI models are refused: together with the tdm-reservation header
 * (next.config.ts) and /.well-known/tdmrep.json, this is the machine-readable
 * opt-out from text and data mining (art. L122-5-3 CPI, EU directive
 * 2019/790 art. 4) that the CGU refer to.
 */
const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Bytespider",
  "Amazonbot",
  "PerplexityBot",
  "cohere-ai",
  "cohere-training-data-crawler",
  "Diffbot",
  "ImagesiftBot",
  "omgili",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_TRAINING_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/membre", "/profile"] },
    ],
  };
}
