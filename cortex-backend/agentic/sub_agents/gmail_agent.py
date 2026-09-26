"""
agentic/sub_agents/gmail_agent.py

Dedicated Gmail Sub-Agent for Cortex.

Architecture mirrors github_agent.py exactly:

    Main Agent
        │
        │  gmail_agent_tool(query)
        ▼
    Gmail Sub-Agent  ←── allowed_tools.json ──► enabled tool schemas
        │
        │  LLM generates tool_call
        ▼
    ┌───────────────────────────┐
    │   need_approval = false   │  → execute directly (read tools)
    ├───────────────────────────┤
    │   need_approval = true    │  → HITL interrupt (write tools)
    │                           │      ┌──────────┐  ┌────────┐
    │                           │      │ APPROVE  │  │ REJECT │
    │                           │      └────┬─────┘  └───┬────┘
    │                           │           │             │
    │                           │        Gmail API      stop
    └───────────────────────────┘

SECURITY RULES:
  - Email content (bodies, subjects) is UNTRUSTED DATA.
    The system prompt explicitly forbids the LLM from following
    instructions embedded in emails.
  - Write tools are NEVER executed without explicit user approval.
  - Approval is bound to a unique approval_id + exact pending action.
  - One user's gmail_service is NEVER used for another user.
  - OAuth tokens are NEVER logged or included in SSE events.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Optional

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import StructuredTool
from langchain_fireworks import ChatFireworks
from langgraph.errors import GraphInterrupt
from langgraph.types import interrupt
from pydantic import BaseModel, Field

from agentic.gmail.gmail_service import get_gmail_service, load_gmail_tool_config
from agentic.gmail.tools import GMAIL_TOOL_IMPLS
from agentic.sub_agents.base import SubAgentEventCallback, SubAgentResult
from database import SessionLocal

load_dotenv()

MAX_ITERATIONS = 8

# Keyed by thread_id — stores in-flight agent state while waiting for HITL approval.
# Cleared immediately after approval/rejection resumes the agent.
_PENDING_GMAIL_RUNS: dict[str, dict] = {}

# ──────────────────────────────────────────────────────────────────────────────
# System prompt
# ──────────────────────────────────────────────────────────────────────────────

GMAIL_SYSTEM_PROMPT = SystemMessage(
    content=(
        "You are a specialized Gmail Sub-Agent for Cortex. "
        "You help the user manage their Gmail account using the available Gmail tools.\n\n"

        "OPERATIONAL RULES:\n"
        "1. Perform ONE action/tool call at a time. Never issue multiple tool calls in a single step.\n"
        "2. Use search_emails or list_drafts first to discover relevant emails/drafts.\n"
        "3. Try to search for emails according to the user query and read them to understand the context \n"
        "4. if you didn't find any relevent information in the emails or drafts , you can ask user to provide more information about what they want to do with gmail.\n"
        "5. When Finishing , report what actually happend in interaction with user , so Main Agent can decide next steps\n"
        "6. don't work in loop , if after 2-3 times Search didn't return any relevant information , State it clearly that gmail might not contain that info.\n"
        # "OPERATIONAL RULES:\n"
        # "1. Use search_emails or list_drafts first to discover relevant emails/drafts.\n"
        # "2. For write operations (send_email, create_draft, reply_to_email) you MUST\n"
        # "   provide full details (to, subject, body) so the user can review and approve them.\n"
        # "3. When the user provides instructions ('tell_agent') to modify an action (e.g., 'send email directly instead of drafting' or change recipient/subject/body), follow the user's latest instruction precisely.\n"
        # "If the user replaces a pending write with a read task, cancel the write and do the read task.\n"
        # "4. Always state the EXACT operation completed in your final response. If send_email was executed, state that the email was SENT. Do NOT claim an email was drafted if send_email was executed.\n"
        # "5. If a write action is REJECTED, respect that — do NOT retry.\n"
        # "6. If a tool call fails or returns an error, DO NOT repeat the exact same tool call with identical parameters. Report the error clearly or adjust your strategy. Never retry in a loop.\n"
        # "7. When Finishing , report what actually happend in interaction with user , so Main Agent can decide next steps"


    )
)


# ──────────────────────────────────────────────────────────────────────────────
# Tool input schemas  (Pydantic models for LLM tool-call generation)
# ──────────────────────────────────────────────────────────────────────────────

class SearchEmailsInput(BaseModel):
    query: str = Field(
        ...,
        description=(
            "Gmail search query using Gmail's standard syntax. "
            "Examples: 'from:john@example.com', 'subject:interview is:unread', "
            "'after:2026/09/01', 'from:recruiter@corp.com subject:offer'"
        ),
    )
    max_results: int = Field(10, description="Maximum emails to return (1–50).")


class GetEmailInput(BaseModel):
    message_id: str = Field(..., description="Gmail message ID (from search_emails results).")


class GetThreadInput(BaseModel):
    thread_id: str = Field(
        ...,
        description="Gmail thread ID. Use this to retrieve the full conversation context.",
    )


class ListDraftsInput(BaseModel):
    max_results: int = Field(10, description="Maximum drafts to return (1–50).")


class CreateDraftInput(BaseModel):
    to: str = Field(..., description="Recipient email address.")
    subject: str = Field(..., description="Email subject.")
    body: str = Field(..., description="Email body (plain text).")
    cc: Optional[str] = Field(None, description="CC recipients (comma-separated). Optional.")
    bcc: Optional[str] = Field(None, description="BCC recipients (comma-separated). Optional.")
    thread_id: Optional[str] = Field(
        None, description="Gmail thread ID if creating a draft reply in an existing thread."
    )


class SendEmailInput(BaseModel):
    to: str = Field(..., description="Recipient email address.")
    subject: str = Field(..., description="Email subject.")
    body: str = Field(..., description="Email body (plain text).")
    cc: Optional[str] = Field(None, description="CC recipients (comma-separated). Optional.")
    bcc: Optional[str] = Field(None, description="BCC recipients (comma-separated). Optional.")
    thread_id: Optional[str] = Field(
        None, description="Gmail thread ID if sending inside an existing thread context."
    )


class ReplyToEmailInput(BaseModel):
    message_id: str = Field(..., description="ID of the message to reply to.")
    body: str = Field(..., description="Reply message body (plain text).")
    thread_id: Optional[str] = Field(
        None,
        description="Thread ID override. Auto-detected from the original message if not provided.",
    )


# ──────────────────────────────────────────────────────────────────────────────
# Tool schema registry  (LLM sees these schemas but execution is handled in loop)
# ──────────────────────────────────────────────────────────────────────────────

_TOOL_SCHEMAS: dict[str, StructuredTool] = {
    "search_emails": StructuredTool.from_function(
        func=lambda **kw: None,
        name="search_emails",
        description=(
            "Search the user's Gmail mailbox. Supports Gmail search syntax: "
            "from:, to:, subject:, is:unread, is:read, after:YYYY/MM/DD, before:YYYY/MM/DD, "
            "has:attachment, label:inbox, etc. Returns message metadata (no body)."
        ),
        args_schema=SearchEmailsInput,
    ),
    "get_email": StructuredTool.from_function(
        func=lambda **kw: None,
        name="get_email",
        description=(
            "Retrieve the full content of a single Gmail message by ID. "
            "Returns sender, recipients, subject, date, body, and attachment metadata."
        ),
        args_schema=GetEmailInput,
    ),
    "get_thread": StructuredTool.from_function(
        func=lambda **kw: None,
        name="get_thread",
        description=(
            "Retrieve a full Gmail thread (conversation) by thread ID. "
            "Returns all messages in chronological order. "
            "Prefer this over get_email when you need full conversation context."
        ),
        args_schema=GetThreadInput,
    ),
    "list_drafts": StructuredTool.from_function(
        func=lambda **kw: None,
        name="list_drafts",
        description=(
            "List the user's Gmail drafts. Returns draft ID, recipients, subject, and snippet."
        ),
        args_schema=ListDraftsInput,
    ),
    "create_draft": StructuredTool.from_function(
        func=lambda **kw: None,
        name="create_draft",
        description=(
            "Create a Gmail draft. "
            "The user will be shown a preview and must approve before the draft is created. "
            "Provide complete to, subject, and body."
        ),
        args_schema=CreateDraftInput,
    ),
    "send_email": StructuredTool.from_function(
        func=lambda **kw: None,
        name="send_email",
        description=(
            "Send an email via Gmail. "
            "The user will be shown a full email preview and must approve before sending. "
            "Provide complete to, subject, and body. NEVER send without approval."
        ),
        args_schema=SendEmailInput,
    ),
    "reply_to_email": StructuredTool.from_function(
        func=lambda **kw: None,
        name="reply_to_email",
        description=(
            "Reply to an existing Gmail message in-thread. "
            "Automatically preserves threading headers (In-Reply-To, References, Re: subject). "
            "The user must approve before the reply is sent."
        ),
        args_schema=ReplyToEmailInput,
    ),
}


# ──────────────────────────────────────────────────────────────────────────────
# LLM factory
# ──────────────────────────────────────────────────────────────────────────────

def _get_gmail_llm() -> ChatFireworks:
    return ChatFireworks(
        model=os.getenv("MAIN_MODEL"),
        api_key=os.getenv("FIREWORKS_API_KEY"),
        temperature=0,
    )


# ──────────────────────────────────────────────────────────────────────────────
# Message sanitiser  (mirrors github_agent.sanitize_github_messages)
# ──────────────────────────────────────────────────────────────────────────────

def _sanitize_messages(messages: list) -> list:
    sanitized = []
    for msg in messages:
        if isinstance(msg, AIMessage):
            tool_calls = [
                {
                    "name": c.get("name"),
                    "args": c.get("args"),
                    "id": c.get("id"),
                    "type": "tool_call",
                }
                for c in getattr(msg, "tool_calls", [])
            ]
            sanitized.append(
                AIMessage(
                    content=msg.content or "",
                    tool_calls=tool_calls,
                    id=getattr(msg, "id", None),
                )
            )
        elif isinstance(msg, ToolMessage):
            content = msg.content
            text = json.dumps(content) if isinstance(content, (dict, list)) else str(content)
            sanitized.append(
                ToolMessage(
                    content=text,
                    tool_call_id=msg.tool_call_id,
                    name=msg.name,
                    id=getattr(msg, "id", None),
                )
            )
        else:
            sanitized.append(msg)
    return sanitized


# ──────────────────────────────────────────────────────────────────────────────
# HITL preview builder
# ──────────────────────────────────────────────────────────────────────────────

def _build_hitl_payload(
    tool_name: str,
    tool_args: dict,
    sender_email: str,
    user_id: int,
    thread_id: Optional[str],
) -> dict:
    """
    Build a rich, human-readable HITL payload for a Gmail write operation.

    The payload is passed to interrupt() and also emitted as a gmail_hitl_required
    SSE event. It contains:
      - approval_id  : unique UUID bound to this exact pending action
      - user_id      : for security validation on resume
      - thread_id    : for state recovery
      - preview      : human-readable text shown in the UI
      - structured fields: from, to, cc, bcc, subject, body, message_id, etc.

    NEVER include OAuth tokens, client secrets, or raw API payloads.
    """
    approval_id = str(uuid.uuid4())
    divider = "─" * 48

    base = {
        "approval_id": approval_id,
        "action": tool_name,
        "agent": "gmail_agent",
        "user_id": user_id,
        "thread_id": thread_id or "",
        "from": sender_email,
    }

    if tool_name == "send_email":
        to = tool_args.get("to", "")
        cc = tool_args.get("cc") or ""
        bcc = tool_args.get("bcc") or ""
        subject = tool_args.get("subject", "")
        body = tool_args.get("body", "")

        preview_lines = [
            "📧  Email Approval Required",
            divider,
            f"From:    {sender_email}",
            f"To:      {to}",
        ]
        if cc:
            preview_lines.append(f"Cc:      {cc}")
        if bcc:
            preview_lines.append(f"Bcc:     {bcc}")
        preview_lines += [
            f"Subject: {subject}",
            divider,
            body,
        ]

        base.update(
            {
                "preview_title": "Email Approval Required",
                "to": to,
                "cc": cc,
                "bcc": bcc,
                "subject": subject,
                "body": body,
                "thread_id_for_send": tool_args.get("thread_id") or "",
                "preview": "\n".join(preview_lines),
            }
        )

    elif tool_name == "reply_to_email":
        message_id = tool_args.get("message_id", "")
        body = tool_args.get("body", "")

        preview_lines = [
            "💬  Reply Approval Required",
            divider,
            f"From:           {sender_email}",
            f"Replying to:    message ID {message_id}",
            divider,
            "Your reply:",
            body,
        ]

        base.update(
            {
                "preview_title": "Reply Approval Required",
                "message_id": message_id,
                "body": body,
                "preview": "\n".join(preview_lines),
            }
        )

    elif tool_name == "create_draft":
        to = tool_args.get("to", "")
        cc = tool_args.get("cc") or ""
        bcc = tool_args.get("bcc") or ""
        subject = tool_args.get("subject", "")
        body = tool_args.get("body", "")

        preview_lines = [
            "📝  Draft Approval Required",
            divider,
            f"To:      {to}",
        ]
        if cc:
            preview_lines.append(f"Cc:      {cc}")
        if bcc:
            preview_lines.append(f"Bcc:     {bcc}")
        preview_lines += [
            f"Subject: {subject}",
            divider,
            body,
        ]

        base.update(
            {
                "preview_title": "Draft Approval Required",
                "to": to,
                "cc": cc,
                "bcc": bcc,
                "subject": subject,
                "body": body,
                "thread_id_for_draft": tool_args.get("thread_id") or "",
                "preview": "\n".join(preview_lines),
            }
        )

    else:
        # Generic fallback for any future write tools
        preview_lines = [
            f"⚠️  Approval Required: {tool_name}",
            divider,
        ] + [f"{k}: {v}" for k, v in tool_args.items()]
        base.update(
            {
                "preview_title": f"Approval Required: {tool_name}",
                "args": tool_args,
                "preview": "\n".join(preview_lines),
            }
        )

    return base


# ──────────────────────────────────────────────────────────────────────────────
# Main agent entry point
# ──────────────────────────────────────────────────────────────────────────────

async def run_gmail_agent(
    query: str,
    user_id: int = 1,
    db: Optional[Any] = None,
    thread_id: Optional[str] = None,
    resume_action: Optional[str] = None,
    resume_feedback: Optional[str] = None,
    event_callback: SubAgentEventCallback = None,
) -> SubAgentResult:
    """
    Execute the Gmail Sub-Agent for a user query.

    Handles:
      - Per-user Gmail API service construction (user isolation enforced)
      - Tool config loading from allowed_tools.json
      - LLM tool-call generation with Gmail tool schemas
      - Read tools: execute directly without HITL
      - Write tools: HITL interrupt → human-readable preview → approve/reject
      - SSE event emission via event_callback
      - Pending-run state for HITL resume (keyed by thread_id)

    Args:
        query:           Natural language query from the main agent.
        user_id:         Cortex user ID (credentials are isolated per user).
        db:              Optional SQLAlchemy session (created if not provided).
        thread_id:       LangGraph thread ID — used for HITL state recovery.
        resume_action:   Decision from previous HITL interrupt ('approve'/'reject').
        resume_feedback: Optional user feedback text on resume.
        event_callback:  SSE event emitter function.

    Returns:
        SubAgentResult with agent_name, answer, sources, token counts.
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    try:
        pending_key = thread_id
        pending_run = _PENDING_GMAIL_RUNS.get(pending_key) if pending_key else None

        # ── Reuse or initialise runtime state ─────────────────────────────────
        if pending_run:
            gmail_service = pending_run["gmail_service"]
            sender_email = pending_run["sender_email"]
            tool_config = pending_run["tool_config"]
            llm = pending_run["llm"]
        else:
            # Build authenticated Gmail API client for THIS user only
            try:
                gmail_service = get_gmail_service(user_id, db)
                sender_email = "me"
                try:
                    profile = gmail_service.users().getProfile(userId="me").execute()
                    sender_email = profile.get("emailAddress", "me")
                except Exception as pe:
                    from models import UserIntegration
                    integration = (
                        db.query(UserIntegration)
                        .filter(
                            UserIntegration.user_id == user_id,
                            UserIntegration.provider == "google",
                            UserIntegration.integration_type == "gmail",
                            UserIntegration.is_active == True,
                        )
                        .first()
                    )
                    if integration and integration.account_email:
                        sender_email = integration.account_email
                print(f"[GmailAgent] Connected as {sender_email} for user_id={user_id}")
            except ValueError as ve:
                not_connected_msg = str(ve)
                if event_callback:
                    event_callback("gmail_error", agent="gmail_agent", message=not_connected_msg)
                return {
                    "agent_name": "gmail_agent",
                    "answer": not_connected_msg,
                    "sources": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                }
            except Exception as exc:
                err_msg = f"Gmail connection failed: {exc}"
                print(f"[GmailAgent] {err_msg}")
                if event_callback:
                    event_callback("gmail_error", agent="gmail_agent", message=err_msg)
                return {
                    "agent_name": "gmail_agent",
                    "answer": err_msg,
                    "sources": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                }

            # Load tool configuration from allowed_tools.json
            try:
                config = load_gmail_tool_config()
                tool_config: dict = config.get("gmail", {}).get("tools", {})
            except Exception as exc:
                err_msg = f"Failed to load Gmail tool config: {exc}"
                return {
                    "agent_name": "gmail_agent",
                    "answer": err_msg,
                    "sources": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                }

            # Build LLM-bound tool schemas for enabled tools only
            enabled_schemas = [
                _TOOL_SCHEMAS[name]
                for name, cfg in tool_config.items()
                if cfg.get("enabled") and name in _TOOL_SCHEMAS
            ]

            if not enabled_schemas:
                return {
                    "agent_name": "gmail_agent",
                    "answer": "No Gmail tools are currently enabled.",
                    "sources": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                }

            llm = _get_gmail_llm().bind_tools(enabled_schemas)

        # ── Emit agent started ─────────────────────────────────────────────────
        if event_callback and not pending_run:
            event_callback("gmail_agent_started", agent="gmail_agent", goal=query)

        # ── Restore or initialise conversation state ───────────────────────────
        if pending_run:
            messages: list = pending_run["messages"]
            input_tokens: int = pending_run["input_tokens"]
            output_tokens: int = pending_run["output_tokens"]
            final_answer: str = pending_run["final_answer"]
            iteration: int = pending_run["iteration"]
            pending_call: Optional[dict] = pending_run["pending_call"]
            _PENDING_GMAIL_RUNS.pop(pending_key, None)
        else:
            messages = [GMAIL_SYSTEM_PROMPT, HumanMessage(content=query)]
            input_tokens = 0
            output_tokens = 0
            final_answer = ""
            iteration = 0
            pending_call = None

        resume_action_once = (resume_action or "").strip().lower() or None
        resume_feedback_once = resume_feedback or ""
        stop_after_rejection = False
        stop_after_action = False
        run_status = "running"
        force_tool_selection = False

        # ── Main agent loop ───────────────────────────────────────────────────
        # A saved pending call must always be resumed, even if the normal
        # planning iteration limit was reached before the second approval.
        while pending_call is not None or iteration < MAX_ITERATIONS:
            if pending_call is not None:
                tool_calls_to_run = [pending_call]
                pending_call = None
            else:
                iteration += 1
                clean_msgs = _sanitize_messages(messages)
                response = await llm.ainvoke(clean_msgs)

                usage = getattr(response, "usage_metadata", {}) or {}
                input_tokens += usage.get("input_tokens", 0)
                output_tokens += usage.get("output_tokens", 0)

                reasoning = response.additional_kwargs.get("reasoning_content", "")
                if event_callback and reasoning:
                    event_callback(
                        "reasoning",
                        agent="gmail_agent",
                        iteration=iteration,
                        content=reasoning,
                    )

                messages.append(response)

                if response.content:
                    final_answer = response.content

                tool_calls_to_run = getattr(response, "tool_calls", [])
                if tool_calls_to_run and len(tool_calls_to_run) > 1:
                    tool_calls_to_run = tool_calls_to_run[:1]
                    response.tool_calls = tool_calls_to_run

                if force_tool_selection and not tool_calls_to_run:
                    force_tool_selection = False
                    strict_messages = _sanitize_messages(messages) + [
                        SystemMessage(content="Return exactly one Gmail tool call now. Do not answer in prose.")
                    ]
                    response = await llm.ainvoke(strict_messages)
                    usage = getattr(response, "usage_metadata", {}) or {}
                    input_tokens += usage.get("input_tokens", 0)
                    output_tokens += usage.get("output_tokens", 0)
                    messages.append(response)
                    if response.content:
                        final_answer = response.content
                    tool_calls_to_run = getattr(response, "tool_calls", [])
                    if tool_calls_to_run and len(tool_calls_to_run) > 1:
                        tool_calls_to_run = tool_calls_to_run[:1]
                        response.tool_calls = tool_calls_to_run

                if not tool_calls_to_run:
                    break

            # ── Execute each tool call ────────────────────────────────────────
            for call in tool_calls_to_run:
                call_id: str = call.get("id")
                tool_name: str = call.get("name", "")
                tool_args: dict = call.get("args", {})
                t_cfg: dict = tool_config.get(tool_name, {})
                need_approval: bool = t_cfg.get("need_approval", False)

                if event_callback:
                    event_callback(
                        "gmail_tool_started",
                        agent="gmail_agent",
                        iteration=iteration,
                        tool=tool_name,
                        risk=t_cfg.get("risk", "unknown"),
                        call_id=call_id,
                    )

                impl = GMAIL_TOOL_IMPLS.get(tool_name)
                result = None
                replacement_messages = None

                if need_approval:
                    hitl_payload = _build_hitl_payload(
                        tool_name=tool_name,
                        tool_args=tool_args,
                        sender_email=sender_email,
                        user_id=user_id,
                        thread_id=thread_id,
                    )

                    if pending_key:
                        _PENDING_GMAIL_RUNS[pending_key] = {
                            "messages": messages,
                            "input_tokens": input_tokens,
                            "output_tokens": output_tokens,
                            "final_answer": final_answer,
                            "iteration": iteration,
                            "pending_call": call,
                            "gmail_service": gmail_service,
                            "sender_email": sender_email,
                            "tool_config": tool_config,
                            "llm": llm,
                        }

                    if event_callback:
                        event_callback(
                            "gmail_hitl_required",
                            **{k: v for k, v in hitl_payload.items() if k != "user_id"},
                        )

                    approval_res = interrupt(hitl_payload)
                    decision = ""
                    feedback = ""
                    if isinstance(approval_res, dict):
                        decision = str(
                            approval_res.get("action")
                            or approval_res.get("decision")
                            or approval_res.get("approval")
                            or ""
                        ).lower()
                        feedback = str(approval_res.get("feedback", "")).strip()
                    elif isinstance(approval_res, str):
                        decision = approval_res.strip().lower()

                    recognized = {
                        "yes", "approve", "approved", "accept", "true",
                        "no", "reject", "rejected", "false", "tell_agent",
                    }
                    if decision not in recognized and resume_action_once:
                        decision = resume_action_once
                        feedback = resume_feedback_once
                    resume_action_once = None
                    if pending_key:
                        _PENDING_GMAIL_RUNS.pop(pending_key, None)

                    approved = decision in {"yes", "approve", "approved", "accept", "true"}
                    rejected = decision in {"no", "reject", "rejected", "false"}

                    if rejected:
                        if event_callback:
                            event_callback(
                                "gmail_approval_rejected",
                                agent="gmail_agent",
                                tool=tool_name,
                                approval_id=hitl_payload.get("approval_id"),
                            )
                        result = {
                            "status": "cancelled",
                            "tool": tool_name,
                            "message": f"The user rejected {tool_name}.",
                            "feedback": feedback,
                        }
                        final_answer = f"The user rejected {tool_name}; it was not executed."
                        run_status = "rejected"
                        stop_after_rejection = True
                    elif not approved:
                        result = {
                            "status": "instruction_provided",
                            "tool": tool_name,
                            "user_instruction": feedback or decision,
                            "message": "The user changed or redirected the pending action.",
                        }
                        final_answer = ""
                        run_status = "changed"
                        replacement_messages = [
                            GMAIL_SYSTEM_PROMPT,
                            HumanMessage(
                                content=(
                                    "Current Gmail action: "
                                    f"{tool_name} with arguments {json.dumps(tool_args)}.\n"
                                    "Latest user instruction: "
                                    f"{feedback or decision}\n"
                                    "Choose the next Gmail action from the available tools. "
                                    "A read action needs no approval; a write action needs approval."
                                )
                            ),
                        ]
                    elif impl is None:
                        result = {"status": "error", "error": f"No implementation for '{tool_name}'."}
                    else:
                        if event_callback:
                            event_callback(
                                "gmail_approval_received",
                                agent="gmail_agent",
                                tool=tool_name,
                                approval_id=hitl_payload.get("approval_id"),
                            )
                        try:
                            result = await impl(gmail_service, **tool_args, need_approval=False)
                        except GraphInterrupt:
                            raise
                        except Exception as exc:
                            result = {"status": "error", "error": f"Error executing '{tool_name}': {exc}"}
                elif impl is None:
                    result = {"status": "error", "error": f"No implementation for '{tool_name}'."}
                else:
                    try:
                        result = await impl(gmail_service, **tool_args)
                    except Exception as exc:
                        result = {"status": "error", "error": f"Error executing '{tool_name}': {exc}"}

                res_text = json.dumps(result) if isinstance(result, (dict, list)) else str(result)
                if isinstance(result, dict):
                    status = result.get("status")
                    if status == "sent":
                        final_answer = f"Email successfully sent to {result.get('to', tool_args.get('to'))}."
                        run_status = "completed"
                        stop_after_action = True
                    elif status == "draft_created":
                        final_answer = f"Draft successfully created for {result.get('to', tool_args.get('to'))}."
                        run_status = "completed"
                        stop_after_action = True
                    elif status == "reply_sent":
                        final_answer = "Reply successfully sent."
                        run_status = "completed"
                        stop_after_action = True
                    elif status == "error":
                        final_answer = result.get("error", "Gmail action failed.")
                        run_status = "failed"

                # Append tool result to conversation
                messages.append(
                    ToolMessage(
                        content=res_text,
                        tool_call_id=call_id,
                        name=tool_name,
                    )
                )

                if event_callback:
                    event_callback(
                        "gmail_tool_completed",
                        agent="gmail_agent",
                        tool=tool_name,
                        iteration=iteration,
                    )

                if replacement_messages is not None:
                    messages = replacement_messages
                    force_tool_selection = True

                if stop_after_rejection or stop_after_action:
                    break

        # ── Force synthesis if iteration limit reached ─────────────────────────
        if iteration >= MAX_ITERATIONS and not stop_after_rejection:
            clean_msgs = _sanitize_messages(messages)
            # Drop dangling tool-call-only assistant turn if present
            if clean_msgs and isinstance(clean_msgs[-1], AIMessage):
                if getattr(clean_msgs[-1], "tool_calls", None):
                    clean_msgs = clean_msgs[:-1]

            synthesis_prompt = SystemMessage(
                content=(
                    "You have reached the Gmail agent iteration limit. "
                    "Using ONLY the information gathered so far, provide a clear, complete "
                    "final answer. Do not request more tools. Do not mention the iteration limit."
                )
            )
            syn_response = await _get_gmail_llm().ainvoke([synthesis_prompt] + clean_msgs)
            usage = getattr(syn_response, "usage_metadata", {}) or {}
            input_tokens += usage.get("input_tokens", 0)
            output_tokens += usage.get("output_tokens", 0)
            if syn_response.content:
                final_answer = syn_response.content

        if not final_answer.strip():
            final_answer = "Gmail agent completed the requested tasks."
        if run_status == "running":
            run_status = "completed"

        # ── Emit completion event ──────────────────────────────────────────────
        if event_callback:
            event_callback(
                "gmail_agent_completed",
                agent="gmail_agent",
                answer=final_answer,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

        return {
            "agent_name": "gmail_agent",
            "status": run_status,
            "answer": final_answer,
            "sources": [],
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    finally:
        if close_db and db is not None:
            try:
                db.close()
            except Exception:
                pass
