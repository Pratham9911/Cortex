def format_chunks_for_debug(chunks):

    formatted_chunks = []

    for i, chunk in enumerate(chunks, start=1):

        formatted_chunks.append({
            "rank": i,

            "document": {
                "document_id": chunk["document_id"],
                "title": chunk["document_title"],
                "version": chunk["version_number"],
                "file_name": chunk["file_name"]
            },

            "chunk": {
                "chunk_id": chunk["chunk_id"],
                "page_number": chunk["page_number"]
            },

            "scores": {
                "rerank_score": chunk.get("rerank_score"),
                "distance": chunk.get("distance"),
                "keyword_rank": chunk.get("keyword_rank")
            },

            "content": chunk["content"]
        })

    return formatted_chunks