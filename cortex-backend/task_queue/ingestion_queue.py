import os

from dotenv import load_dotenv
from bullmq import Queue

load_dotenv()

QUEUE_NAME = "document-ingestion"

queue = Queue(
    QUEUE_NAME,
    {
        "connection": os.getenv("REDIS_URL")
    }
)



# async def enqueue_document_ingestion():
#     try:
#         job = await queue.add(
#             "process-document",
#             {
#                 "document_id": 28,
#                 "version_id": 37,
#                 "project_id": 9,
#                 "storage_path": "9/28/v1/somatosensory.pdf",
#             },
#             {
#                 "removeOnComplete": True,
#             },
#         )

#         print("New job:", job.id)
#         return job

#     finally:
#         await queue.close()


# async def enqueue_document_ingestion():
#     try:
#         job = await queue.add(
#             "process-document",
#              {
#                   "document_id": 19,
#                   "version_id": 29,
#                   "project_id": 9,
#                   "storage_path": "9/19/v1/minutes_of_meeting___bwf_software_prototype_discussion.pdf"
#               },
#              {
#                 # 1 initial attempt + 2 retries
#                 "attempts": 3,

#                 # Optional: wait before retrying
#                 "backoff": {
#                     "type": "exponential",
#                     "delay": 5000,
#                 },

#                 # Successful jobs are removed
#                 "removeOnComplete": True,

#                 # Failed jobs are removed after the 3rd attempt
#                 "removeOnFail": True,
#             },
#         )

#         print("New job:", job.id)
#         return job

#     finally:
#         await queue.close()


async def enqueue_document_ingestion(
    document_id: int,
    version_id: int,
    project_id: int,
    storage_path: str
):
    job = await queue.add(
        "process-document",
        {
            "document_id": document_id,
            "version_id": version_id,
            "project_id": project_id,
            "storage_path": storage_path,
        }
        ,
         {
              # 1 initial attempt + 2 r etries
              "attempts": 3,
              # Optional: wait before retrying
              "backoff": {
                  "type": "exponential",
                  "delay": 5000,
              },
              # Successful jobs are removed
              "removeOnComplete": True,
              # Failed jobs are removed after the 3rd attempt
              "removeOnFail": True,
          },
    )

    return job

if __name__ == "__main__":
    import asyncio
    
    asyncio.run(enqueue_document_ingestion())