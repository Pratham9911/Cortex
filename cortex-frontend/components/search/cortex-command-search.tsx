"use client";

import React, { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  FileText,
  Users,
  Inbox,
  Bell,
  Activity,
  BarChart3,
  ClipboardList,
  Grid3X3,
  Sliders,
  Plug,
  Trash2,
  BookOpen,
  Plus,
  Sun,
  Moon,
  LogOut,
  Check,
  FolderKanban,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ArrowRightLeft,
  ChevronRight,
  ExternalLink,
  Settings,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuth } from "@/components/auth/protected-route";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type ProjectItem = {
  project_id: number;
  name: string;
  created_at?: string;
  plan_name?: string;
  members_count?: number;
  documents_count?: number;
  role?: string;
};

type RecentNotification = {
  id: number;
  title: string;
  message?: string;
  created_at: string;
};

type CortexCommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects?: ProjectItem[];
  onProjectSelect?: (project: ProjectItem) => void;
  onCreateProject?: () => void;
  onOpenInbox?: () => void;
};

export function CortexCommandSearch({
  open,
  onOpenChange,
  projects: initialProjects,
  onProjectSelect,
  onCreateProject,
  onOpenInbox,
}: CortexCommandSearchProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const { toast } = useToast();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL!;

  // Navigation sub-views: "root" (main menu) or "projects" (switch project screen)
  const [currentView, setCurrentView] = useState<"root" | "projects">("root");
  const [searchQuery, setSearchQuery] = useState("");
  const [projects, setProjects] = useState<ProjectItem[]>(initialProjects || []);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string>("Project");
  const [recentNotifications, setRecentNotifications] = useState<RecentNotification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);

  const isExecutingRef = useRef(false);

  // Reset view and query whenever dialog opens
  useEffect(() => {
    if (open) {
      setCurrentView("root");
      setSearchQuery("");
      isExecutingRef.current = false;
    }
  }, [open]);

  // Sync initial projects if provided from parent
  useEffect(() => {
    if (initialProjects && initialProjects.length > 0) {
      setProjects(initialProjects);
    }
  }, [initialProjects]);

  // Load project context and notifications when dialog opens
  useEffect(() => {
    if (!open) return;

    const currentId = localStorage.getItem("selected_project_id");
    const currentName = localStorage.getItem("selected_project_name");
    setActiveProjectId(currentId);
    if (currentName) setActiveProjectName(currentName);

    const token = localStorage.getItem("access_token");
    if (!token) return;

    // Fetch projects list if not provided
    if (!initialProjects || initialProjects.length === 0) {
      fetch(`${apiUrl}/getprojects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setProjects(data);
        })
        .catch(() => {});
    }

    // Fetch unread notifications if project is selected
    if (currentId) {
      fetch(`${apiUrl}/projects/${currentId}/notifications?unread_only=true`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : {}))
        .then((data) => {
          if (data && Array.isArray(data.notifications)) {
            setRecentNotifications(data.notifications.slice(0, 3));
            setUnreadNotificationCount(data.unread_count || data.notifications.length || 0);
          }
        })
        .catch(() => {});
    }
  }, [open, apiUrl, initialProjects]);

  // Reliable action execution wrapper (guards against double-invocation from click + select)
  const runAction = (action: () => void) => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    action();
    setTimeout(() => {
      isExecutingRef.current = false;
    }, 350);
  };

  const handleNavigate = (path: string) => {
    runAction(() => {
      onOpenChange(false);
      setTimeout(() => {
        if (typeof window !== "undefined") {
          if (window.location.pathname === path) {
            window.location.reload();
          } else {
            router.push(path);
          }
        }
      }, 50);
    });
  };

  const handleInbox = () => {
    runAction(() => {
      onOpenChange(false);
      setTimeout(() => {
        if (typeof window !== "undefined") {
          if (onOpenInbox && window.location.pathname === "/workspace") {
            onOpenInbox();
          } else {
            if (window.location.pathname === "/inbox") {
              window.location.reload();
            } else {
              router.push("/inbox");
            }
          }
        }
      }, 50);
    });
  };

  const handleCreateProject = () => {
    runAction(() => {
      onOpenChange(false);
      setTimeout(() => {
        if (onCreateProject && window.location.pathname === "/workspace") {
          onCreateProject();
        } else {
          router.push("/workspace");
        }
      }, 50);
    });
  };

  const handleSwitchProject = (project: ProjectItem) => {
    runAction(() => {
      localStorage.setItem("selected_project_id", String(project.project_id));
      localStorage.setItem("selected_project_name", project.name);
      setActiveProjectId(String(project.project_id));
      setActiveProjectName(project.name);
      onOpenChange(false);

      if (onProjectSelect) {
        onProjectSelect(project);
      } else {
        window.dispatchEvent(new Event("storage"));
        window.location.href = "/dashboard";
      }
    });
  };

  const handleDocsClick = () => {
    runAction(() => {
      onOpenChange(false);
      toast({
        title: "Cortex Documentation",
        description: "Official guides, architecture, and API documentation are coming soon.",
      });
    });
  };

  const isDark = theme === "dark";

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cortex Command & Search"
      description="Navigate pages, switch projects, check notifications, or execute actions"
      className={cn(
        "sm:max-w-[700px] rounded-2xl border shadow-2xl font-quicksand overflow-hidden",
        isDark
          ? "border-zinc-800 bg-[#12141a]/95 text-zinc-100 backdrop-blur-xl"
          : "border-slate-200 bg-white/98 text-slate-900 backdrop-blur-xl"
      )}
    >
      {/* ─── SEARCH INPUT / SUB-HEADER ─── */}
      {currentView === "projects" ? (
        <div className="flex flex-col border-b border-border/40">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-muted/30">
            <button
              type="button"
              onClick={() => {
                setCurrentView("root");
                setSearchQuery("");
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Commands</span>
            </button>
            <span className="text-[11px] font-mono text-muted-foreground">
              {projects.length} project{projects.length === 1 ? "" : "s"}
            </span>
          </div>
          <CommandInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search projects to switch..."
            className="text-sm font-medium py-3.5"
            autoFocus
          />
        </div>
      ) : (
        <div className="relative">
          <CommandInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder="Search pages, projects, notifications, or commands..."
            className="text-sm font-medium py-3.5"
          />
        </div>
      )}

      {/* ─── COMMAND LIST ─── */}
      <CommandList className="max-h-[460px] p-2 overflow-y-auto">
        <CommandEmpty className="py-10 text-center text-sm text-muted-foreground">
          {currentView === "projects" ? "No matching projects found." : "No matching commands or pages found."}
        </CommandEmpty>

        {/* ══════════════════════════════════════════
            VIEW A: PROJECTS SUB-SCREEN
           ══════════════════════════════════════════ */}
        {currentView === "projects" && (
          <>
            <CommandGroup heading={`ALL PROJECTS (${projects.length})`}>
              {projects.map((p) => {
                const isActive = String(p.project_id) === String(activeProjectId);
                return (
                  <CommandItem
                    key={p.project_id}
                    value={`project ${p.name}`}
                    onSelect={() => handleSwitchProject(p)}
                    onClick={() => handleSwitchProject(p)}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all my-1",
                      isActive
                        ? isDark
                          ? "bg-emerald-500/10 text-emerald-300 font-medium border border-emerald-500/20"
                          : "bg-emerald-50 text-emerald-800 font-medium border border-emerald-200"
                        : isDark
                        ? "hover:bg-zinc-800/60"
                        : "hover:bg-slate-100"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          "p-2 rounded-lg shrink-0",
                          isActive
                            ? isDark
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-emerald-100 text-emerald-700"
                            : isDark
                            ? "bg-zinc-800 text-zinc-400"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        <FolderKanban className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold truncate leading-tight">
                            {p.name}
                          </span>
                          {p.plan_name && (
                            <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border text-muted-foreground">
                              {p.plan_name}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {p.members_count ? `${p.members_count} member${p.members_count > 1 ? "s" : ""}` : "Cortex Project"}
                          {p.created_at ? ` · Created ${new Date(p.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-500 font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                          <Check className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                          <span>Switch</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>

            <CommandSeparator className="my-2" />

            <CommandGroup heading="Actions">
              <CommandItem
                value="create new project add workspace"
                onSelect={() => handleCreateProject()}
                onClick={() => handleCreateProject()}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sky-500 hover:text-sky-400 cursor-pointer text-xs font-semibold"
              >
                <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                  <Plus className="w-4 h-4" />
                </div>
                <span>Create another project...</span>
              </CommandItem>

              <CommandItem
                value="back return to commands main menu"
                onSelect={() => {
                  setCurrentView("root");
                  setSearchQuery("");
                }}
                onClick={() => {
                  setCurrentView("root");
                  setSearchQuery("");
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer text-xs font-medium text-muted-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to main command menu</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}

        {/* ══════════════════════════════════════════
            VIEW B: MAIN COMMANDS PALETTE
           ══════════════════════════════════════════ */}
        {currentView === "root" && (
          <>
            {/* ─── 1. PROJECTS & WORKSPACE ─── */}
            <CommandGroup heading="Projects & Workspace">
              <CommandItem
                value="switch project choose change select workspace"
                onSelect={() => {
                  setCurrentView("projects");
                  setSearchQuery("");
                }}
                onClick={() => {
                  setCurrentView("projects");
                  setSearchQuery("");
                }}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">Switch Project...</span>
                    <span className="text-[11px] text-muted-foreground">
                      {activeProjectName ? `Active: ${activeProjectName} · Click to view all projects` : "Choose another workspace"}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                  <span>View all</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </CommandItem>

              <CommandItem
                value="create new project start workspace add"
                onSelect={() => handleCreateProject()}
                onClick={() => handleCreateProject()}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-sky-500">Create New Project...</span>
                    <span className="text-[11px] text-muted-foreground">Start a new Cortex workspace</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px] text-sky-500 font-medium">New</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="all projects workspace overview list grid"
                onSelect={() => handleNavigate("/workspace")}
                onClick={() => handleNavigate("/workspace")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-zinc-500/10 text-zinc-400 shrink-0">
                    <Grid3X3 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">All Projects (Workspace Overview)</span>
                    <span className="text-[11px] text-muted-foreground">View all workspaces in grid or list view</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/workspace</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator className="my-2" />

            {/* ─── 2. PAGES & NAVIGATION ─── */}
            <CommandGroup heading="Pages & Navigation">
              <CommandItem
                value="dashboard overview metrics recent activity"
                onSelect={() => handleNavigate("/dashboard")}
                onClick={() => handleNavigate("/dashboard")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-500 shrink-0">
                    <LayoutDashboard className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Dashboard</span>
                    <span className="text-[11px] text-muted-foreground">Overview, metrics & team activity</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/dashboard</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="documents knowledge base files ingestion rag vector"
                onSelect={() => handleNavigate("/documents")}
                onClick={() => handleNavigate("/documents")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Documents</span>
                    <span className="text-[11px] text-muted-foreground">Project knowledge files, folders & ingestion</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/documents</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="ai agent chat cortex assistant rag sub agents workflows"
                onSelect={() => handleNavigate("/ai-agent")}
                onClick={() => handleNavigate("/ai-agent")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">AI Agent</span>
                    <span className="text-[11px] text-muted-foreground">Chat with Cortex agent & multi-agent system</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/ai-agent</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="teams channels decisions collaboration discussions"
                onSelect={() => handleNavigate("/teams")}
                onClick={() => handleNavigate("/teams")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Teams & Discussions</span>
                    <span className="text-[11px] text-muted-foreground">Channels, collaborative memory & decisions</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/teams</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="inbox invitations message requests collaboration"
                onSelect={() => handleInbox()}
                onClick={() => handleInbox()}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 shrink-0">
                    <Inbox className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Inbox</span>
                    <span className="text-[11px] text-muted-foreground">Project invites and collaboration requests</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/inbox</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="audit logs trail tracing agent activity history"
                onSelect={() => handleNavigate("/audit-logs")}
                onClick={() => handleNavigate("/audit-logs")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Audit Logs</span>
                    <span className="text-[11px] text-muted-foreground">Live agent action traces and query activity</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/audit-logs</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="analytics usage token requests metrics performance"
                onSelect={() => handleNavigate("/analytics")}
                onClick={() => handleNavigate("/analytics")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-500 shrink-0">
                    <BarChart3 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Analytics</span>
                    <span className="text-[11px] text-muted-foreground">Token consumption & AI query performance</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/analytics</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="reports decision summaries export"
                onSelect={() => handleNavigate("/reports")}
                onClick={() => handleNavigate("/reports")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0">
                    <ClipboardList className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Reports</span>
                    <span className="text-[11px] text-muted-foreground">Generated project summaries and decision logs</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/reports</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="trash deleted files archived documents"
                onSelect={() => handleNavigate("/trash")}
                onClick={() => handleNavigate("/trash")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-zinc-500/10 text-zinc-400 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Trash & Archived Files</span>
                    <span className="text-[11px] text-muted-foreground">View and recover deleted files</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/trash</CommandShortcut>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator className="my-2" />

            {/* ─── 3. SETTINGS & PREFERENCES ─── */}
            <CommandGroup heading="Settings & Preferences">
              <CommandItem
                value="project settings configuration members role name general http://localhost:3000/settings"
                onSelect={() => handleNavigate("/settings")}
                onClick={() => handleNavigate("/settings")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-violet-500/10 text-violet-500 shrink-0">
                    <Settings className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Project Settings</span>
                    <span className="text-[11px] text-muted-foreground">Configure project name, members, and settings</span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/settings</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="connectors integrations github gmail tools"
                onSelect={() => handleNavigate("/settings/connectors")}
                onClick={() => handleNavigate("/settings/connectors")}
                className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <Plug className="w-4 h-4 text-muted-foreground" />
                  <span>Connectors & External Tools</span>
                </div>
                <CommandShortcut className="text-[10px]">/settings/connectors</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="theme dark light mode switch toggle"
                onSelect={() => {
                  runAction(() => {
                    setTheme(isDark ? "light" : "dark");
                    toast({
                      title: isDark ? "Switched to Light mode" : "Switched to Dark mode",
                      description: "Theme preference updated.",
                    });
                  });
                }}
                onClick={() => {
                  runAction(() => {
                    setTheme(isDark ? "light" : "dark");
                    toast({
                      title: isDark ? "Switched to Light mode" : "Switched to Dark mode",
                      description: "Theme preference updated.",
                    });
                  });
                }}
                className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2.5">
                  {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
                  <span>Toggle Theme (currently {theme})</span>
                </div>
                <CommandShortcut className="text-[10px]">Theme</CommandShortcut>
              </CommandItem>

              <CommandItem
                value="logout sign out exit"
                onSelect={() => {
                  runAction(() => {
                    onOpenChange(false);
                    logout();
                  });
                }}
                onClick={() => {
                  runAction(() => {
                    onOpenChange(false);
                    logout();
                  });
                }}
                className="flex items-center justify-between px-3 py-2 rounded-xl text-rose-500 hover:text-rose-400 cursor-pointer text-xs font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </div>
              </CommandItem>
            </CommandGroup>

            <CommandSeparator className="my-2" />

            {/* ─── 4. NOTIFICATIONS ─── */}
            <CommandGroup
              heading={
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  <span>Notifications</span>
                  {unreadNotificationCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500 text-white">
                      {unreadNotificationCount} unread
                    </span>
                  )}
                </div>
              }
            >
              <CommandItem
                value="notifications alerts updates unread"
                onSelect={() => handleNavigate("/notifications")}
                onClick={() => handleNavigate("/notifications")}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 shrink-0 relative">
                    <Bell className="w-4 h-4" />
                    {unreadNotificationCount > 0 && (
                      <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
                    )}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">View All Notifications</span>
                    <span className="text-[11px] text-muted-foreground">
                      {unreadNotificationCount > 0
                        ? `You have ${unreadNotificationCount} unread notification${unreadNotificationCount > 1 ? "s" : ""}`
                        : "Task assignments, team mentions and updates"}
                    </span>
                  </div>
                </div>
                <CommandShortcut className="text-[11px]">/notifications</CommandShortcut>
              </CommandItem>

              {recentNotifications.map((n) => (
                <CommandItem
                  key={n.id}
                  value={`notification ${n.title} ${n.message || ""}`}
                  onSelect={() => handleNavigate("/notifications")}
                  onClick={() => handleNavigate("/notifications")}
                  className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer opacity-90 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
                    <span className="truncate font-medium">{n.title}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    {new Date(n.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator className="my-2" />

            {/* ─── 5. DOCUMENTATION ─── */}
            <CommandGroup heading="Documentation">
              <CommandItem
                value="documentation docs guides api help reference manual"
                onSelect={() => handleDocsClick()}
                onClick={() => handleDocsClick()}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-500 shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium flex items-center gap-2">
                      Cortex Documentation
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        Coming Soon
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Architecture, hybrid retrieval & system references
                    </span>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>

      {/* ─── FOOTER BAR ─── */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-2.5 border-t text-[11px] font-mono select-none",
          isDark
            ? "border-zinc-800/80 bg-[#0e1015]/90 text-zinc-400"
            : "border-slate-200 bg-slate-50/90 text-slate-500"
        )}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-current/20 bg-background/50 font-semibold">↑↓</kbd>
            <span>Navigate</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-current/20 bg-background/50 font-semibold">↵</kbd>
            <span>Select</span>
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded border border-current/20 bg-background/50 font-semibold">esc</kbd>
            <span>{currentView === "projects" ? "Back" : "Close"}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Image
            src={isDark ? "/cortex_icon.png" : "/cortex-iconb.png"}
            alt="Cortex"
            width={14}
            height={14}
            className="rounded"
          />
          <span className="font-sans font-medium text-[11px]">Cortex Command</span>
        </div>
      </div>
    </CommandDialog>
  );
}
