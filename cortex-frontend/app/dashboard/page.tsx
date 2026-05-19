"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import Image from "next/image"
import { LogOut, Sun, Moon, Settings, Folder, FileText, Activity, Terminal, Shield, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ProtectedRoute, useAuth } from "@/components/auth/protected-route"
import { cn } from "@/lib/utils"

function DashboardContent() {
  const { user, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const isDark = mounted && theme === "dark"

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300",
      isDark ? "bg-[#0A0A0A] text-white" : "bg-slate-50 text-slate-900"
    )}>
      {/* Navbar */}
      <header className={cn(
        "border-b sticky top-0 z-30 backdrop-blur-md transition-all duration-300",
        isDark ? "border-white/5 bg-[#121212]/80" : "border-slate-200 bg-white/80"
      )}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8">
              <Image
                src="/cortex_icon.png"
                alt="Cortex"
                fill
                className="object-contain"
              />
            </div>
            <span className={cn(
              "font-bold text-xl tracking-tight transition-colors duration-300",
              isDark ? "text-white" : "text-zinc-900"
            )}>
              Cortex
            </span>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3">
            {mounted && (
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className={cn(
                  "p-2 rounded-full transition-all border shadow-sm",
                  isDark 
                    ? "bg-[#1A1A1A] border-white/10 text-zinc-400 hover:text-white hover:bg-[#2A2A2A]" 
                    : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                )}
                aria-label="Toggle theme"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
            
            <button
              className={cn(
                "p-2 rounded-full transition-all border shadow-sm",
                isDark 
                  ? "bg-[#1A1A1A] border-white/10 text-zinc-400 hover:text-white hover:bg-[#2A2A2A]" 
                  : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              )}
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            <Button
              onClick={logout}
              variant="ghost"
              size="sm"
              className={cn(
                "font-semibold transition-all",
                isDark
                  ? "text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                  : "text-slate-600 hover:text-red-600 hover:bg-red-50"
              )}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Workspace Dashboard Content */}
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 animate-in fade-in duration-500">
        
        {/* Welcome & Info Hero Card */}
        <div className={cn(
          "p-8 rounded-2xl border relative overflow-hidden transition-all duration-300 shadow-xl",
          isDark 
            ? "border-white/5 bg-gradient-to-br from-[#121212] to-[#181818]" 
            : "border-slate-200 bg-gradient-to-br from-white to-slate-50"
        )}>
          {/* Subtle Stark Monochrome Glow corner */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-zinc-500/5 rounded-full blur-[85px] pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border",
                isDark ? "bg-[#1A1A1A] border-white/10 text-white" : "bg-zinc-100 border-zinc-200 text-zinc-800"
              )}>
                <Shield className="w-3.5 h-3.5" />
                Active Session
              </div>
              <h1 className={cn(
                "text-3xl md:text-4xl font-extrabold tracking-tight transition-colors duration-300",
                isDark ? "text-white" : "text-slate-900"
              )}>
                Welcome back, <span className="font-black underline underline-offset-4 decoration-zinc-400">{user?.name}</span>!
              </h1>
              <p className={cn(
                "text-base leading-relaxed max-w-xl transition-colors duration-300",
                isDark ? "text-zinc-400" : "text-slate-600"
              )}>
                Access the creative studio to start scaling your teams, orchestrating assets, and executing vector search workflows.
              </p>
            </div>

            {/* Profile Summary Panel */}
            <div className={cn(
              "p-5 rounded-xl border flex flex-col gap-3 min-w-[280px]",
              isDark ? "bg-[#1A1A1A]/60 border-white/5" : "bg-slate-100/60 border-slate-200"
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-lg flex items-center justify-center",
                  isDark ? "bg-white/5 text-white" : "bg-white text-slate-800 shadow-sm"
                )}>
                  <User className={cn("w-5 h-5", isDark ? "text-white" : "text-zinc-800")} />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Account Profile</p>
                  <p className={cn(
                    "text-sm font-bold truncate",
                    isDark ? "text-white" : "text-slate-800"
                  )}>
                    {user?.name}
                  </p>
                </div>
              </div>
              
              <div className={cn(
                "h-px",
                isDark ? "bg-white/5" : "bg-slate-200"
              )} />

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">Email:</span>
                  <span className={cn(
                    "font-bold truncate max-w-[170px]",
                    isDark ? "text-zinc-300" : "text-slate-700"
                  )}>{user?.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-500">User ID:</span>
                  <span className={cn(
                    "font-bold",
                    isDark ? "text-zinc-300" : "text-slate-700"
                  )}>#{user?.user_id}</span>
                </div>
                {user?.created_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-500">Member Since:</span>
                    <span className={cn(
                      "font-bold",
                      isDark ? "text-zinc-300" : "text-slate-700"
                    )}>
                      {new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Projects */}
          <Card className={cn(
            "p-6 transition-all duration-300 hover:shadow-lg relative overflow-hidden flex flex-col justify-between h-44",
            isDark ? "bg-[#121212] border-white/5 hover:border-white/10" : "bg-white border-slate-200"
          )}>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Projects</span>
                <h3 className={cn(
                  "text-4xl font-extrabold transition-colors duration-300",
                  isDark ? "text-white" : "text-slate-900"
                )}>
                  0
                </h3>
              </div>
              <div className={cn(
                "p-3 rounded-lg flex items-center justify-center",
                isDark ? "bg-white/5 text-white" : "bg-zinc-100 text-zinc-800"
              )}>
                <Folder className="w-6 h-6" />
              </div>
            </div>
            <div className={cn(
              "mt-4 pt-4 border-t flex items-center justify-between text-xs",
              isDark ? "border-white/5" : "border-slate-100"
            )}>
              <span className="text-zinc-500">Ready to configure</span>
              <span className={cn(
                "font-bold cursor-pointer hover:underline",
                isDark ? "text-white" : "text-zinc-850"
              )}>Create Project &rarr;</span>
            </div>
          </Card>

          {/* Card 2: Documents */}
          <Card className={cn(
            "p-6 transition-all duration-300 hover:shadow-lg relative overflow-hidden flex flex-col justify-between h-44",
            isDark ? "bg-[#121212] border-white/5 hover:border-white/10" : "bg-white border-slate-200"
          )}>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Documents</span>
                <h3 className={cn(
                  "text-4xl font-extrabold transition-colors duration-300",
                  isDark ? "text-white" : "text-slate-900"
                )}>
                  0
                </h3>
              </div>
              <div className={cn(
                "p-3 rounded-lg flex items-center justify-center",
                isDark ? "bg-white/5 text-white" : "bg-zinc-100 text-zinc-800"
              )}>
                <FileText className="w-6 h-6" />
              </div>
            </div>
            <div className={cn(
              "mt-4 pt-4 border-t flex items-center justify-between text-xs",
              isDark ? "border-white/5" : "border-slate-100"
            )}>
              <span className="text-zinc-500">Vector store is empty</span>
              <span className={cn(
                "font-bold cursor-pointer hover:underline",
                isDark ? "text-white" : "text-zinc-850"
              )}>Upload Files &rarr;</span>
            </div>
          </Card>

          {/* Card 3: API Usage */}
          <Card className={cn(
            "p-6 transition-all duration-300 hover:shadow-lg relative overflow-hidden flex flex-col justify-between h-44",
            isDark ? "bg-[#121212] border-white/5 hover:border-white/10" : "bg-white border-slate-200"
          )}>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">API Requests</span>
                <h3 className={cn(
                  "text-4xl font-extrabold transition-colors duration-300",
                  isDark ? "text-white" : "text-slate-900"
                )}>
                  0
                </h3>
              </div>
              <div className={cn(
                "p-3 rounded-lg flex items-center justify-center",
                isDark ? "bg-white/5 text-white" : "bg-zinc-100 text-zinc-800"
              )}>
                <Activity className="w-6 h-6" />
              </div>
            </div>
            <div className={cn(
              "mt-4 pt-4 border-t flex items-center justify-between text-xs",
              isDark ? "border-white/5" : "border-slate-100"
            )}>
              <span className="text-zinc-500">Limits reset monthly</span>
              <span className={cn(
                "font-bold cursor-pointer hover:underline",
                isDark ? "text-white" : "text-zinc-850"
              )}>View Analytics &rarr;</span>
            </div>
          </Card>
        </div>

        {/* Quick Actions Panel */}
        <Card className={cn(
          "p-6 transition-all duration-300",
          isDark ? "bg-[#121212] border-white/5" : "bg-white border-slate-200"
        )}>
          <div className="flex items-center gap-2 mb-6">
            <Terminal className={cn("w-5 h-5", isDark ? "text-white" : "text-zinc-800")} />
            <h2 className={cn(
              "text-lg font-bold transition-colors duration-300",
              isDark ? "text-white" : "text-slate-900"
            )}>
              Developer Quick Actions
            </h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Stark Monochromatic Action Button */}
            <Button className={cn(
              "font-bold h-11 transition-all uppercase text-xs tracking-wider",
              isDark
                ? "bg-white text-black hover:bg-zinc-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                : "bg-black text-white hover:bg-zinc-800 hover:shadow-[0_0_15px_rgba(0,0,0,0.1)]"
            )}>
              Create New Project
            </Button>
            <Button variant="outline" className={cn(
              "h-11 transition-all font-bold uppercase text-xs tracking-wider",
              isDark 
                ? "border-zinc-850 hover:bg-white/5 hover:border-zinc-700 text-white" 
                : "border-slate-200 hover:bg-slate-100 hover:border-slate-350 text-slate-800"
            )}>
              Upload Document to RAG Pipeline
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  )
}
