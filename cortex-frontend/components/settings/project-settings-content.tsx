"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  AlertTriangle,
  Check,
  FolderKanban,
  Loader2,
  LogOut,
  Save,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/protected-route";

type Project = {
  project_id: number;
  name: string;
  current_user_role?: string;
  created_by?: {
    user_id: number;
    name: string;
  };
};

export default function ProjectSettingsContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectNameInput, setProjectNameInput] = useState("");
  const [loadingProject, setLoadingProject] = useState(true);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectDeleting, setProjectDeleting] = useState(false);
  const [projectLeaving, setProjectLeaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [projectError, setProjectError] = useState("");
  const [projectMessage, setProjectMessage] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL!;
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const selectedProjectId =
    typeof window !== "undefined" ? Number(localStorage.getItem("selected_project_id")) : null;
  const isAdmin = selectedProject?.current_user_role === "admin";
  const isOwner = selectedProject?.created_by?.user_id === user?.user_id;

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadProject = async () => {
    if (!token || !selectedProjectId) {
      setSelectedProject(null);
      setLoadingProject(false);
      return;
    }

    setProjectError("");
    try {
      const res = await fetch(`${apiUrl}/getprojects`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Could not load project settings.");

      const found = Array.isArray(data)
        ? data.find((project: Project) => project.project_id === selectedProjectId)
        : null;
      setSelectedProject(found || null);
      setProjectNameInput(found?.name || "");
      if (!found) setProjectError("This project is unavailable or you are no longer a member.");
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not load project settings.");
    } finally {
      setLoadingProject(false);
    }
  };

  useEffect(() => {
    void loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedProjectId]);

  const clearSelectedProject = () => {
    localStorage.removeItem("selected_project_id");
    localStorage.removeItem("selected_project_name");
    router.push("/workspace");
  };

  const handleUpdateProject = async () => {
    if (!selectedProject || !token) return;
    setProjectSaving(true);
    setProjectError("");
    setProjectMessage("");
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: projectNameInput.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || "Could not update project name.");

      localStorage.setItem("selected_project_name", projectNameInput.trim());
      setSelectedProject((prev) => (prev ? { ...prev, name: projectNameInput.trim() } : null));
      setProjectMessage("Project name updated successfully.");
      // Fire storage event so sidebar/header updates project name
      window.dispatchEvent(new Event("storage"));
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not update project.");
    } finally {
      setProjectSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProject || !token || !isAdmin) return;
    setProjectDeleting(true);
    setProjectError("");
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not delete project.");

      setDeleteOpen(false);
      clearSelectedProject();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not delete project.");
    } finally {
      setProjectDeleting(false);
    }
  };

  const handleLeaveProject = async () => {
    if (!selectedProject || !token || isOwner) return;
    setProjectLeaving(true);
    setProjectError("");
    try {
      const res = await fetch(`${apiUrl}/projects/${selectedProject.project_id}/leave`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Could not leave project.");

      setLeaveOpen(false);
      clearSelectedProject();
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Could not leave project.");
    } finally {
      setProjectLeaving(false);
    }
  };

  const isDark = mounted ? (resolvedTheme === "dark" || theme === "dark") : false;

  // Shared semantic tokens
  const cardBg = isDark ? "bg-[#14161d] border-zinc-800/80" : "bg-white border-slate-200/90 shadow-xs";
  const cardHeaderBg = isDark ? "border-zinc-800 bg-zinc-900/30" : "border-slate-100 bg-slate-50/60";
  const headingText = isDark ? "text-zinc-100" : "text-slate-900";
  const subtitleText = isDark ? "text-zinc-400" : "text-slate-500";
  const inputBg = isDark
    ? "border-zinc-700 bg-[#0d0e14] text-white placeholder:text-zinc-500"
    : "border-slate-300 bg-slate-50/50 text-slate-900 placeholder:text-slate-400 focus-visible:bg-white";

  if (loadingProject) {
    return (
      <div
        className={cn(
          "flex min-h-64 items-center justify-center rounded-2xl border text-sm transition-colors",
          isDark ? "border-zinc-800 bg-[#181a24] text-zinc-400" : "border-slate-200 bg-white text-slate-500 shadow-xs"
        )}
      >
        <Loader2 className="mr-2 size-4 animate-spin text-sky-500" /> Loading project settings...
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div
        className={cn(
          "rounded-2xl border p-10 text-center transition-colors max-w-xl mx-auto my-12",
          isDark ? "border-zinc-800 bg-[#14161d]" : "border-slate-200 bg-white shadow-xs"
        )}
      >
        <FolderKanban className={cn("mx-auto size-10", isDark ? "text-zinc-500" : "text-slate-400")} />
        <p className={cn("mt-4 text-base font-semibold", headingText)}>No project selected</p>
        <p className={cn("mt-1 text-xs", subtitleText)}>
          Select a project from the workspace or use the search palette (Ctrl+K) to manage its settings.
        </p>
        {projectError && <p className="mt-4 text-xs text-red-400">{projectError}</p>}
        <Button className="mt-6 bg-sky-600 hover:bg-sky-500 text-white" onClick={() => router.push("/workspace")}>
          Open workspace
        </Button>
      </div>
    );
  }

  const canSaveName =
    isAdmin && projectNameInput.trim().length >= 2 && projectNameInput.trim() !== selectedProject.name;

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-16 font-quicksand">
      {/* ─── PAGE HEADER ─── */}
      <header className={cn("border-b pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4", isDark ? "border-zinc-800" : "border-slate-200")}>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-11 items-center justify-center rounded-xl border shrink-0",
              isDark
                ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                : "border-sky-200 bg-sky-50 text-sky-700 shadow-xs"
            )}
          >
            <FolderKanban className="size-5.5" />
          </span>
          <div>
            <h1 className={cn("text-2xl font-bold tracking-tight", headingText)}>Project Settings</h1>
            <p className={cn("mt-0.5 text-xs sm:text-sm", subtitleText)}>
              Manage project configuration, team membership, and access.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/workspace")}
            className={cn(
              "text-xs gap-1.5 h-9",
              isDark ? "border-zinc-700 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            )}
          >
            <span>All Projects</span>
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </Button>
        </div>
      </header>

      {/* ─── STATUS NOTICES ─── */}
      {projectError && (
        <div
          role="alert"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm flex items-center gap-2",
            isDark ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"
          )}
        >
          <AlertTriangle className="size-4 shrink-0 text-red-500" />
          <span>{projectError}</span>
        </div>
      )}
      {projectMessage && (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium",
            isDark
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          )}
        >
          <Check className="size-4 shrink-0 text-emerald-500" />
          <span>{projectMessage}</span>
        </div>
      )}

      {/* ─── PROJECT DETAILS SECTION ─── */}
      <section className={cn("overflow-hidden rounded-2xl border transition-colors", cardBg)}>
        <div className={cn("border-b px-6 py-4.5", cardHeaderBg)}>
          <h2 className={cn("text-sm font-semibold", headingText)}>Project Details</h2>
          <p className={cn("mt-0.5 text-xs", subtitleText)}>
            General workspace information and permissions for this project.
          </p>
        </div>
        <div className="space-y-6 p-6">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="space-y-2">
              <Label htmlFor="project-name" className={cn("text-xs font-semibold", headingText)}>
                Project name
              </Label>
              <Input
                id="project-name"
                value={projectNameInput}
                onChange={(event) => setProjectNameInput(event.target.value)}
                disabled={!isAdmin || projectSaving}
                maxLength={100}
                className={cn("h-10 text-sm focus-visible:ring-sky-500 transition-colors", inputBg)}
              />
              <p className={cn("text-xs", subtitleText)}>
                {isAdmin
                  ? "Use a clear, recognizable name for your team."
                  : "Only project administrators can rename this project."}
              </p>
            </div>

            <div className="space-y-2">
              <Label className={cn("text-xs font-semibold", headingText)}>Your role</Label>
              <div
                className={cn(
                  "flex h-10 items-center rounded-lg border px-3 text-sm capitalize font-medium",
                  isDark ? "border-zinc-700 bg-[#0d0e14] text-zinc-200" : "border-slate-300 bg-slate-50/60 text-slate-800"
                )}
              >
                {selectedProject.current_user_role || "member"}
              </div>
              <p className={cn("text-xs", subtitleText)}>Current access level</p>
            </div>
          </div>

          {isAdmin && (
            <div className={cn("flex justify-end border-t pt-4", isDark ? "border-zinc-800" : "border-slate-100")}>
              <Button
                onClick={handleUpdateProject}
                disabled={!canSaveName || projectSaving}
                className="gap-2 bg-sky-600 hover:bg-sky-500 text-white font-medium shadow-xs"
              >
                {projectSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save changes
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ─── 3. LEAVE PROJECT SECTION ─── */}
      <section
        className={cn(
          "overflow-hidden rounded-2xl border transition-colors",
          isDark ? "border-amber-500/30 bg-[#14161d]" : "border-amber-200/90 bg-amber-50/20 shadow-xs"
        )}
      >
        <div
          className={cn(
            "border-b px-6 py-4.5 flex items-center gap-2.5",
            isDark ? "border-amber-500/20 bg-amber-950/20" : "border-amber-100 bg-amber-50/60"
          )}
        >
          <LogOut className="size-4 text-amber-500 shrink-0" />
          <div>
            <h2 className={cn("text-sm font-semibold", isDark ? "text-white" : "text-amber-950")}>
              Leave Project
            </h2>
            <p className={cn("mt-0.5 text-xs", isDark ? "text-zinc-400" : "text-amber-700")}>
              Relinquish your membership in this project.
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
          <p className={cn("max-w-xl text-xs leading-relaxed", subtitleText)}>
            {isOwner
              ? "As the project owner, you cannot leave the project unless ownership is transferred."
              : "You will lose access to documents, discussions, and decisions in this project. An admin can re-invite you later."}
          </p>
          <Button
            variant="outline"
            onClick={() => setLeaveOpen(true)}
            disabled={isOwner}
            className={cn(
              "shrink-0 gap-2 font-medium transition-colors",
              isDark
                ? "border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200"
                : "border-amber-300 bg-white text-amber-800 hover:bg-amber-100/70 shadow-xs"
            )}
          >
            <LogOut className="size-4" /> Leave project
          </Button>
        </div>
      </section>

      {/* ─── 4. DANGER ZONE (ADMIN ONLY) ─── */}
      {isAdmin && (
        <section
          className={cn(
            "overflow-hidden rounded-2xl border transition-colors",
            isDark ? "border-red-500/40 bg-[#14161d]" : "border-red-200/90 bg-red-50/20 shadow-xs"
          )}
        >
          <div
            className={cn(
              "border-b px-6 py-4.5 flex items-center gap-2.5",
              isDark ? "border-red-500/25 bg-red-950/20" : "border-red-100 bg-red-50/60"
            )}
          >
            <AlertTriangle className="size-4 text-red-500 shrink-0" />
            <div>
              <h2 className={cn("text-sm font-semibold", isDark ? "text-white" : "text-red-950")}>
                Danger Zone
              </h2>
              <p className={cn("mt-0.5 text-xs", isDark ? "text-zinc-400" : "text-red-700")}>
                Irreversible actions that affect all members of this project.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
            <div>
              <p className={cn("text-sm font-semibold", headingText)}>Delete this project</p>
              <p className={cn("mt-1 text-xs", subtitleText)}>
                Permanently deletes the project, files, vector embeddings, and collaborative history.
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => {
                setDeleteConfirmation("");
                setDeleteOpen(true);
              }}
              className="shrink-0 gap-2 bg-red-600 hover:bg-red-500 text-white font-medium shadow-xs"
            >
              <Trash2 className="size-4" /> Delete project
            </Button>
          </div>
        </section>
      )}

      {/* ─── DELETE CONFIRMATION DIALOG ─── */}
      <Dialog open={deleteOpen} onOpenChange={(open) => !projectDeleting && setDeleteOpen(open)}>
        <DialogContent
          className={cn(
            "sm:max-w-md border transition-colors",
            isDark ? "border-red-500/30 bg-[#15171d] text-white" : "border-red-200 bg-white text-slate-900 shadow-2xl"
          )}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-5 text-red-500" /> Delete project permanently?
            </DialogTitle>
            <DialogDescription className={cn("pt-1 text-xs leading-relaxed", subtitleText)}>
              This will permanently delete the project and all its documents. To confirm, type{" "}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono font-semibold",
                  isDark ? "bg-zinc-800 text-zinc-100" : "bg-slate-100 text-slate-800"
                )}
              >
                {selectedProject.name}
              </span>{" "}
              below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-project-name" className={cn("text-xs font-semibold", headingText)}>
              Project name
            </Label>
            <Input
              id="confirm-project-name"
              autoComplete="off"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              disabled={projectDeleting}
              className={cn("h-10 text-sm", inputBg)}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={projectDeleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteProject}
              disabled={projectDeleting || deleteConfirmation !== selectedProject.name}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {projectDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── LEAVE CONFIRMATION DIALOG ─── */}
      <Dialog open={leaveOpen} onOpenChange={(open) => !projectLeaving && setLeaveOpen(open)}>
        <DialogContent
          className={cn(
            "sm:max-w-md border transition-colors",
            isDark ? "border-amber-500/30 bg-[#15171d] text-white" : "border-amber-200 bg-white text-slate-900 shadow-2xl"
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-base">Leave {selectedProject.name}?</DialogTitle>
            <DialogDescription className={cn("pt-1 text-xs leading-relaxed", subtitleText)}>
              You will immediately lose access to this project and all its team channels. A project administrator
              can invite you back later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setLeaveOpen(false)} disabled={projectLeaving}>
              Stay in project
            </Button>
            <Button
              onClick={handleLeaveProject}
              disabled={projectLeaving || isOwner}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              {projectLeaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Leave project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
