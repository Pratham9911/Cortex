<h1>
  <img src="cortex-frontend/public/cortex_icon.png"
       width="56"
       valign="middle"
       alt="Cortex Logo">
  Cortex <small>— Internal AI Knowledge & Decision System</small>
</h1>


<p>
  Cortex is an internal AI system for organizing team knowledge, retrieving relevant context,
  generating grounded answers, and preserving decisions with source-aware AI.
</p>


![Cortex Landing Page](demos/pics/Cortex_LandingPage.png)

---

# 🏗️ Architecture

Cortex combines document management, asynchronous ingestion, hybrid retrieval, AI generation, and team knowledge workflows.

<p align="center">
  <img src="architecture/Cortex_Architecture.png" width="900" alt="Cortex Architecture">
</p>

For the detailed architecture and individual modules, see [`architecture/README.md`](./architecture/README.md).

---

# 📊 Retrieval Evaluation

Cortex's retrieval pipeline was evaluated on a benchmark of **125+ questions**, comparing retrieval approaches using Recall@7, MRR, and nDCG@7.

<p align="center">
  <img src="cortex-backend/rag/evaluation/Observations/Hybrid_Rerankers.png"
       width="750"
       alt="Cortex Retrieval Evaluation">
</p>

| Metric | Baseline | Hybrid + Reranking |
|---|---:|---:|
| Recall@7 | 89.9% | **94.6%** |
| MRR | 0.756 | **0.902** |
| nDCG@7 | 0.758 | **0.884** |

The evaluation compares retrieval quality before and after combining semantic search, keyword search, RRF fusion, and reranking.


[Detailed evaluation →](./cortex-backend/rag/evaluation/readme.md)

---

# 🧩 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js, React, TypeScript |
| **Backend** | Python, FastAPI |
| **Database** | PostgreSQL, pgvector |
| **Storage** | Supabase Storage |
| **Queue & Workers** | Redis, BullMQ |
| **AI / LLM** | Fireworks APIs |
| **AI Frameworks** | LangChain, LangGraph |
| **Search** | pgvector semantic search, PostgreSQL full-text search |
| **Infrastructure** | Docker, Vercel, Render |
| **Development** | Git, GitHub |

---

<p align="center">
  <sub>Built as a system-first approach to internal AI knowledge and decision management.</sub>
</p>
