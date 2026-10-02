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

## 🏗️ Architecture

<p align="center">
  <strong>A system built around knowledge, retrieval, and intelligent decision support.</strong>
</p>

<p align="center">
  Cortex connects secure document management, asynchronous ingestion,
  hybrid retrieval, AI generation, and team knowledge into one system.
</p>

<br>

<p align="center">
  <img
    src="architecture/Cortex_Architecture.png"
    width="950"
    alt="Cortex Architecture Overview"
  >
</p>

<br>

<p align="center">
  <a href="./architecture/Readme.md">
    <strong>Explore the detailed architecture →</strong>
  </a>
</p>

---

## 📊 Retrieval Evaluation

<p align="center">
  <strong>Measuring retrieval quality, not just generation quality.</strong>
</p>

<p align="center">
  Cortex was evaluated on a benchmark of <strong>125+ questions</strong>
  using retrieval metrics including Recall@7, MRR, and nDCG@7.
</p>

<br>

<p align="center">
  <img
    src="cortex-backend/rag/evaluation/Observations/Hybrid_Rerankers.png"
    width="820"
    alt="Cortex Retrieval Evaluation"
  >
</p>

<details>
<summary><strong>What was evaluated?</strong></summary>

<br>

The evaluation compares retrieval approaches across:

- Semantic retrieval
- Keyword retrieval
- Hybrid retrieval with RRF
- Reranking

The final pipeline improved the measured retrieval metrics on the evaluation benchmark.

</details>

<br>

<p align="center">
  <a href="./cortex-backend/rag/evaluation/readme.md">
    <strong>View the detailed evaluation →</strong>
  </a>
</p>


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
