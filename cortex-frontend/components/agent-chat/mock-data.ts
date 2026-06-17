import type { ChatSession, PromptCard } from "./types"

export const PROMPT_POOLS: PromptCard[][] = [
  [
    { id: "p1", text: "Write a to-do list for a personal project or task", icon: "user" },
    { id: "p2", text: "Generate an email to reply to a job offer", icon: "mail" },
    { id: "p3", text: "Summarise this article or text for me in one paragraph", icon: "message" },
    { id: "p4", text: "How does AI work in a technical capacity", icon: "sliders" },
  ],
  [
    { id: "p5", text: "Summarize recent documents in this project", icon: "message" },
    { id: "p6", text: "What changed this week across our files?", icon: "sliders" },
    { id: "p7", text: "Find onboarding guides for new team members", icon: "user" },
    { id: "p8", text: "Draft a project status update email", icon: "mail" },
  ],
]

export const INITIAL_CHATS: ChatSession[] = [
  {
    id: "agent-1",
    chatId: 1,
    title: "ChatAI",
    group: "saved",
    avatarLetter: "C",
    avatarColor: "bg-[#E0F2FE] text-[#0369A1]", // Light blue bg, dark blue text
    messages: [
      { id: "m1", role: "user", content: "What can you help me with in this project?" },
      {
        id: "m2",
        role: "assistant",
        content:
          "I can search your project documents, summarize content, answer questions from uploaded files, and help you draft updates based on your knowledge base.",
      },
    ],
  },
  {
    id: "agent-2",
    chatId: 2,
    title: "Image of sun",
    group: "saved",
    avatarLetter: "🌄",
    avatarColor: "bg-[#FFEDD5] text-[#C2410C]", // Light orange bg, dark orange text
    isImageIcon: true,
    messages: [
      { id: "m3", role: "user", content: "Show me an image of the sun" },
      {
        id: "m4",
        role: "assistant",
        content:
          "Here is an image of the sun. It is a bright star at the center of our Solar System.",
      },
    ],
  },
  {
    id: "agent-3",
    chatId: 3,
    title: "Data Analyst",
    group: "saved",
    avatarLetter: "D",
    avatarColor: "bg-[#F3E8FF] text-[#7E22CE]", // Light purple bg, dark purple text
    messages: [
      { id: "m5", role: "user", content: "What metrics should we track for document usage?" },
      {
        id: "m6",
        role: "assistant",
        content:
          "Track upload frequency, search queries, most accessed documents, team-level activity, and version activation rates to understand knowledge base health.",
      },
    ],
  },
  {
    id: "today-1",
    chatId: 4,
    title: "How can I improve my time management skills?",
    group: "today",
    avatarLetter: "T",
    avatarColor: "bg-emerald-500",
    messages: [
      { id: "m7", role: "user", content: "How can I improve my time management skills?" },
      {
        id: "m8",
        role: "assistant",
        content:
          "Start by time-blocking your calendar, prioritizing tasks with a simple matrix, batching similar work, and reviewing outcomes at the end of each week.",
      },
    ],
  },
  {
    id: "today-2",
    chatId: 5,
    title: "What's the best way to learn a new skill?",
    group: "today",
    avatarLetter: "W",
    avatarColor: "bg-rose-500",
    messages: [
      { id: "m9", role: "user", content: "What's the best way to learn a new skill?" },
      {
        id: "m10",
        role: "assistant",
        content:
          "Find a mentor, practice consistently, get feedback, and build hands-on projects.",
      },
    ],
  },
  {
    id: "today-3",
    chatId: 6,
    title: "How do I start investing in stocks as a beginner?",
    group: "today",
    avatarLetter: "H",
    avatarColor: "bg-sky-500",
    messages: [
      { id: "m11", role: "user", content: "How do I start investing in stocks as a beginner?" },
      {
        id: "m12",
        role: "assistant",
        content:
          "Research companies, start small, diversify your portfolio, and think long-term.",
      },
    ],
  },
  {
    id: "yesterday-1",
    chatId: 7,
    title: "What are the benefits of daily exercise for mental health?",
    group: "yesterday",
    avatarLetter: "W",
    avatarColor: "bg-amber-500",
    messages: [
      { id: "m13", role: "user", content: "What are the benefits of daily exercise for mental health?" },
      {
        id: "m14",
        role: "assistant",
        content:
          "Daily exercise releases endorphins, reduces stress, improves sleep, and boosts mood.",
      },
    ],
  },
  {
    id: "yesterday-2",
    chatId: 8,
    title: "What's the difference between a UI designer and UX designer?",
    group: "yesterday",
    avatarLetter: "W",
    avatarColor: "bg-teal-500",
    messages: [
      { id: "m15", role: "user", content: "What's the difference between a UI designer and UX designer?" },
      {
        id: "m16",
        role: "assistant",
        content:
          "UI designer focuses on visual layout and interface design, while UX designer focuses on user journey and experience.",
      },
    ],
  },
]
