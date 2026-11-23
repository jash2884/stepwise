// AI engineering roadmap: from how text becomes tokens to building retrieval
// systems. Inspired by public AI-engineering roadmaps; the structure and all
// text here are Stepwise's own. Same shape and rules as roadmaps.js: ids are
// stable, hours and placement (0 to 5, how often it comes up in interviews for
// AI engineering roles) are editorial estimates.
//
// Every reading link was checked to return HTTP 200; primary sources first.

const arxiv = (id) => `https://arxiv.org/abs/${id}`;
const q = (params) => new URLSearchParams(params).toString();

export const ROADMAPS = [
  {
    id: "ai-engineering",
    title: "AI engineering",
    summary: "How language models read, think and retrieve, step by step: tokens, embeddings, attention, sampling, the KV cache, search and RAG.",
    description: "A free AI engineering roadmap: tokenisation, embeddings, attention, sampling, KV cache, BM25, hybrid search, HNSW and RAG, each with a visualiser you can step through.",
    howTo: [
      "Do Foundations first: tokens and vectors come up in everything after.",
      "Each visualiser uses tiny data you can check by hand. Work one step on paper before pressing play.",
      "The Building stage is reading only for now. Read the official docs for the provider you use, and try small experiments of your own.",
    ],
    stages: [
      {
        id: "foundations", title: "Foundations", subject: "ai",
        summary: "How text turns into numbers a model can work with: tokens, then vectors.",
        modules: [
          { id: "ai.tokenisation", title: "Tokenisation", hours: 3, placement: 4, needs: [],
            outcomes: ["Train byte-pair encoding by hand on a small corpus and list its merges", "Explain why some languages and code cost more tokens than English", "Compare character, word and subword tokenisers on vocabulary size and unknown words"],
            tools: ["tokenisation"],
            tryIt: [
              { tool: "tokenisation", query: q({ base: "bytes", t: "मैं आज बाज़ार जा रहा हूँ" }), label: "Hindi, byte level" },
              { tool: "tokenisation", query: q({ digits: "split", t: "in 2025 we sold 123456 books at 7.50 each" }), label: "Numbers as single digits" },
            ],
            reading: [
              { title: "Sennrich, Haddow and Birch: Neural Machine Translation of Rare Words with Subword Units (BPE)", url: arxiv("1508.07909") },
              { title: "Kudo and Richardson: SentencePiece", url: arxiv("1808.06226") },
            ] },
          { id: "ai.embeddings", title: "Embeddings and similarity", hours: 3, placement: 5, needs: [],
            outcomes: ["Compute cosine similarity, dot product and Euclidean distance and say when they disagree", "Find nearest neighbours and solve a vector analogy", "Explain what PCA keeps and loses when vectors are drawn in 2D"],
            tools: ["embeddings"],
            tryIt: [
              { tool: "embeddings", query: q({ mode: "analogy", a: "man", b: "king", c: "woman" }), label: "king − man + woman" },
              { tool: "embeddings", query: q({ mode: "neighbours", w: "kitten", metric: "dot" }), label: "Neighbours by dot product" },
              { tool: "embeddings", query: q({ mode: "search", q: "royal home" }), label: "Search by meaning" },
            ],
            reading: [{ title: "Mikolov et al.: Efficient Estimation of Word Representations in Vector Space (word2vec)", url: arxiv("1301.3781") }] },
        ],
      },
      {
        id: "models", title: "How models work", subject: "ai",
        summary: "Inside a transformer at inference time: attention, choosing the next token, and why the cache matters.",
        modules: [
          { id: "ai.attention", title: "Attention", hours: 4, placement: 5, needs: ["ai.embeddings"],
            outcomes: ["Compute one row of scaled dot-product attention by hand", "Explain the causal mask and why scores are divided by √d", "Describe what multiple heads add"],
            tools: ["attention"],
            tryIt: [
              { tool: "attention", query: q({ s: "the cat sat on the mat", causal: 1, heads: 1, pos: 1 }), label: "Causal mask" },
              { tool: "attention", query: q({ s: "dog bites man", causal: 0, heads: 2, pos: 1 }), label: "Two heads" },
            ],
            reading: [{ title: "Vaswani et al.: Attention Is All You Need", url: arxiv("1706.03762") }] },
          { id: "ai.sampling", title: "Decoding and sampling", hours: 2, placement: 4, needs: ["ai.tokenisation"],
            outcomes: ["Apply temperature, top-k and top-p to a set of logits", "Work out which tokens survive a top-p cut-off", "Explain greedy decoding, repetition penalties and entropy"],
            tools: ["sampling"],
            tryIt: [
              { tool: "sampling", query: q({ T: 0 }), label: "Greedy" },
              { tool: "sampling", query: q({ T: 1.5, p: 0.9 }), label: "Hot, with top-p 0.9" },
              { tool: "sampling", query: q({ rp: 1.5 }), label: "Repetition penalty" },
            ],
            reading: [
              { title: "Holtzman et al.: The Curious Case of Neural Text Degeneration (nucleus sampling)", url: arxiv("1904.09751") },
              { title: "Keskar et al.: CTRL (repetition penalty)", url: arxiv("1909.05858") },
            ] },
          { id: "ai.kv-cache", title: "Inference: prefill, decode and the KV cache", hours: 3, placement: 4, needs: ["ai.attention", "ai.sampling"],
            outcomes: ["Work out KV cache memory from a model's shape", "Explain why time to first token and tokens per second have different limits", "Say how grouped-query attention shrinks the cache"],
            tools: ["kv-cache"],
            tryIt: [
              { tool: "kv-cache", query: q({ cache: 0 }), label: "Without a cache" },
              { tool: "kv-cache", query: q({ model: "gqa8b", n: 32768 }), label: "GQA at 32k tokens" },
            ],
            reading: [
              { title: "Ainslie et al.: GQA, Grouped-Query Attention", url: arxiv("2305.13245") },
              { title: "Kwon et al.: Efficient Memory Management for LLM Serving with PagedAttention", url: arxiv("2309.06180") },
            ] },
        ],
      },
      {
        id: "retrieval", title: "Retrieval", subject: "ai",
        summary: "Finding the right text for a question: keyword search, vector search, fusing them, and feeding the result to a model.",
        modules: [
          { id: "ai.search", title: "Keyword, dense and hybrid search", hours: 4, placement: 5, needs: ["ai.embeddings"],
            outcomes: ["Score documents with BM25 by hand, including idf and length normalisation", "Rank by embedding similarity and say when it beats keywords", "Fuse rankings with Reciprocal Rank Fusion and rerank the top results"],
            tools: ["retrieval"],
            tryIt: [
              { tool: "retrieval", query: q({ mode: "bm25" }), label: "BM25 step by step" },
              { tool: "retrieval", query: q({ mode: "hybrid" }), label: "Hybrid with RRF" },
              { tool: "retrieval", query: q({ mode: "rerank" }), label: "Rerank" },
            ],
            reading: [
              { title: "Robertson and Zaragoza: The Probabilistic Relevance Framework: BM25 and Beyond", url: "https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf" },
              { title: "Cormack, Clarke and Büttcher: Reciprocal Rank Fusion", url: "https://cormack.uwaterloo.ca/cormacksigir09-rrf.pdf" },
              { title: "Karpukhin et al.: Dense Passage Retrieval", url: arxiv("2004.04906") },
            ] },
          { id: "ai.rag", title: "Chunking and RAG", hours: 3, placement: 5, needs: ["ai.search", "ai.tokenisation"],
            outcomes: ["Compare fixed, overlapping, sentence and heading chunking on one document", "Assemble a RAG prompt with numbered sources and ask for citations", "Explain why an answer is only as good as what was retrieved"],
            tools: ["retrieval"],
            tryIt: [
              { tool: "retrieval", query: q({ mode: "chunking", chunk: "overlap", size: 30, ov: 10 }), label: "Chunks with overlap" },
              { tool: "retrieval", query: q({ mode: "rag" }), label: "The RAG pipeline" },
            ],
            reading: [{ title: "Lewis et al.: Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", url: arxiv("2005.11401") }] },
          { id: "ai.hnsw", title: "Vector indexes (HNSW)", hours: 3, placement: 3, needs: ["ai.embeddings"],
            outcomes: ["Explain how HNSW's layers make search fast", "Trade recall for speed with M and ef", "Measure recall@k against brute force"],
            tools: ["hnsw"],
            tryIt: [
              { tool: "hnsw", query: q({ mode: "build" }), label: "Build the graph" },
              { tool: "hnsw", query: q({ mode: "search", ef: 1, k: 5 }), label: "Beam too narrow (ef = 1)" },
            ],
            reading: [{ title: "Malkov and Yashunin: Efficient and Robust Approximate Nearest Neighbor Search Using HNSW Graphs", url: arxiv("1603.09320") }] },
        ],
      },
      {
        id: "building", title: "Building", subject: "ai",
        summary: "Putting models to work in software: calling APIs, letting models use tools, and checking that it all works.",
        modules: [
          { id: "ai.apis", title: "Calling model APIs", hours: 3, placement: 4, needs: ["ai.sampling", "ai.kv-cache"],
            outcomes: ["Send a request with system and user messages and read the response", "Set sampling options and a token limit, and stream the output", "Estimate cost and latency from token counts"],
            tools: [], comingSoon: "There is nothing to visualise without calling a live model, so this module is reading only for now.",
            reading: [
              { title: "Anthropic: Messages API reference", url: "https://platform.claude.com/docs/en/api/messages" },
            ] },
          { id: "ai.tools", title: "Tool calling and agents", hours: 4, placement: 4, needs: ["ai.apis"],
            outcomes: ["Describe a tool with a JSON schema and handle a tool call and its result", "Explain the loop an agent runs: think, call a tool, read the result, repeat", "Say where agents fail and how to limit the damage"],
            tools: [], comingSoon: "A step-through of a tool-calling loop with a scripted model is planned.",
            reading: [
              { title: "Anthropic: Tool use overview", url: "https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview" },
              { title: "OpenAI: Function calling guide", url: "https://developers.openai.com/api/docs/guides/function-calling" },
              { title: "Model Context Protocol specification", url: "https://modelcontextprotocol.io/specification/2025-06-18" },
              { title: "Yao et al.: ReAct, Synergizing Reasoning and Acting", url: arxiv("2210.03629") },
            ] },
          { id: "ai.evals", title: "Evaluating LLM apps", hours: 4, placement: 4, needs: ["ai.apis", "ai.rag"],
            outcomes: ["Write a small test set with clear pass criteria before changing a prompt", "Measure retrieval with recall@k and answers with graded checks", "Know the biases of using a model as a judge"],
            tools: [], comingSoon: "An evaluation visualiser is planned. Recall@k is already measured in the HNSW tool.",
            reading: [
              { title: "Anthropic: Define success criteria and build evaluations", url: "https://platform.claude.com/docs/en/test-and-evaluate/develop-tests" },
              { title: "Zheng et al.: Judging LLM-as-a-Judge", url: arxiv("2306.05685") },
              { title: "Thakur et al.: BEIR, a benchmark for retrieval", url: arxiv("2104.08663") },
            ] },
        ],
      },
    ],
  },
];
