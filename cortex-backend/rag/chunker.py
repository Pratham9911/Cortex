from langchain_text_splitters import RecursiveCharacterTextSplitter


def chunk_text(text: str):

    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        chunk_size=400,
        chunk_overlap=80
    )

    chunks = splitter.split_text(text)

    result = []

    for index, chunk in enumerate(chunks): 
        result.append({
            "chunk_index": index,
            "content": chunk
        })

    return result