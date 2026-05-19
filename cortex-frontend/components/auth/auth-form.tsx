"use client"

import React, { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Lock, User } from "lucide-react"

interface AuthFormProps extends React.ComponentPropsWithoutRef<"div"> {
  isRegister?: boolean
}

export function AuthForm({ className, isRegister = false, ...props }: AuthFormProps) {
  const router = useRouter()
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Set mounted state
  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect to dashboard if already logged in
  useEffect(() => {
    const token = localStorage.getItem("access_token")
    if (token) {
      router.push("/dashboard")
    }
  }, [router])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg("")

    if (isRegister && password !== confirmPassword) {
      setErrorMsg("Passwords do not match")
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters long")
      setLoading(false)
      return
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
      
      if (isRegister) {
        // 1. Call Register endpoint
        const regResponse = await fetch(`${apiUrl}/register`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            password,
          }),
        })

        if (!regResponse.ok) {
          const errorData = await regResponse.json()
          throw new Error(errorData.detail || "Registration failed")
        }

        // 2. Automatically login after successful registration
        const loginResponse = await fetch(`${apiUrl}/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        })

        if (!loginResponse.ok) {
          throw new Error("Registration succeeded but auto-login failed. Please log in manually.")
        }

        const loginData = await loginResponse.json()
        localStorage.setItem("access_token", loginData.access_token)
        localStorage.setItem("token_type", loginData.token_type)
        router.push("/dashboard")
      } else {
        // Call Login endpoint
        const response = await fetch(`${apiUrl}/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email,
            password,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.detail || "Invalid email or password")
        }

        const data = await response.json()
        localStorage.setItem("access_token", data.access_token)
        localStorage.setItem("token_type", data.token_type)
        router.push("/dashboard")
      }
    } catch (error: any) {
      setErrorMsg(error.message || "An error occurred during authentication.")
    } finally {
      setLoading(false)
    }
  }

  // Google Login is static for now
  const handleGoogleLogin = () => {
    setLoading(true)
    setErrorMsg("")
    try {
      // Set a mock access token in localStorage to simulate successful authentication
      localStorage.setItem("access_token", "mock_google_oauth_token_cortex_static")
      localStorage.setItem("token_type", "bearer")
      
      // Redirect to dashboard
      setTimeout(() => {
        router.push("/dashboard")
      }, 500)
    } catch (err: any) {
      setErrorMsg("An error occurred with Google login.")
      setLoading(false)
    }
  }

  const isDark = mounted && theme === "dark"

  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 w-full max-w-sm px-4 animate-in fade-in duration-500 relative", className)} {...props}>
      {/* Brand Icon and Header */}
      <Link href="/" className="flex items-center gap-2 hover:opacity-85 transition-opacity mb-0.5">
        <Image 
          src="/cortex_icon.png" 
          alt="Cortex" 
          width={28} 
          height={28} 
          className="rounded-md object-contain"
        />
        <span className={cn(
          "font-bold text-lg tracking-tight transition-colors duration-300",
          isDark ? "text-white" : "text-zinc-900"
        )}>
          Cortex
        </span>
      </Link>
      
      {/* High contrast light-dark card in Dark mode */}
      <Card className={cn(
        "w-full shadow-2xl relative overflow-hidden transition-all duration-300 border",
        isDark 
          ? "border-zinc-800 bg-[#18181b]" 
          : "border-zinc-200 bg-white"
      )}>
        {/* Stark Horizontal border line */}
        <div className={cn(
          "absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-zinc-500 to-transparent opacity-30"
        )}></div>
        
        <CardHeader className="text-center space-y-1 pt-5 pb-3">
          <CardTitle className={cn(
            "text-xl font-bold tracking-tight transition-colors duration-300",
            isDark ? "text-white" : "text-zinc-900"
          )}>
            {isRegister ? "Create an account" : "Welcome back"}
          </CardTitle>
          <CardDescription className={cn(
            "text-[11px] transition-colors duration-300",
            isDark ? "text-zinc-400" : "text-zinc-500"
          )}>
            {isRegister ? "Enter your details to sign up" : "Login with your Google account or email"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pb-5 pl-5 pr-5">
          <form onSubmit={handleEmailAuth}>
            <div className="grid gap-3">
              
              {/* Google OAuth Login Button */}
              <div>
                <Button 
                  type="button" 
                  variant="outline" 
                  className={cn(
                    "w-full transition-all shadow-sm h-9 text-xs font-semibold flex items-center justify-center gap-3",
                    isDark 
                      ? "bg-[#0c0c0e] border-zinc-800 text-white hover:bg-zinc-800 hover:border-zinc-700" 
                      : "bg-zinc-50 border-zinc-200 text-zinc-800 hover:bg-zinc-100 hover:border-zinc-300"
                  )} 
                  onClick={handleGoogleLogin}
                  disabled={loading}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-4 w-4">
                    <path
                      d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                      fill="currentColor"
                    />
                  </svg>
                  {isRegister ? "Sign up with Google" : "Login with Google"}
                </Button>
              </div>
              
              {/* Divider */}
              <div className={cn(
                "relative text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t",
                isDark ? "after:border-zinc-800/80" : "after:border-zinc-200"
              )}>
                <span className={cn(
                  "relative z-10 px-2 text-[9px] uppercase tracking-widest font-medium transition-colors duration-300",
                  isDark ? "bg-[#18181b] text-zinc-500" : "bg-white text-zinc-400"
                )}>
                  Or continue with
                </span>
              </div>
              
              {/* Form Input Fields */}
              <div className="grid gap-2">
                
                {/* Full Name field (Register only) */}
                {isRegister && (
                  <div className="grid gap-1">
                    <Label htmlFor="name" className={cn(
                      "font-bold text-[10px] ml-0.5 transition-colors uppercase tracking-wider",
                      isDark ? "text-zinc-400" : "text-zinc-600"
                    )}>
                      Full Name
                    </Label>
                    <div className="relative">
                      <User className={cn(
                        "absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5",
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      )} />
                      <Input 
                        id="name" 
                        type="text" 
                        placeholder="John Doe" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required 
                        className={cn(
                          "pl-9 h-8.5 text-xs transition-all focus-visible:ring-zinc-450 focus-visible:border-transparent",
                          isDark 
                            ? "bg-[#0c0c0e] border-zinc-800 text-white placeholder:text-zinc-650" 
                            : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                        )}
                      />
                    </div>
                  </div>
                )}

                {/* Email field */}
                <div className="grid gap-1">
                  <Label htmlFor="email" className={cn(
                    "font-bold text-[10px] ml-0.5 transition-colors uppercase tracking-wider",
                    isDark ? "text-zinc-400" : "text-zinc-600"
                  )}>
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className={cn(
                      "absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5",
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    )} />
                    <Input 
                      id="email" 
                      type="email" 
                      placeholder="m@example.com" 
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required 
                      className={cn(
                        "pl-9 h-8.5 text-xs transition-all focus-visible:ring-zinc-450 focus-visible:border-transparent",
                        isDark 
                          ? "bg-[#0c0c0e] border-zinc-800 text-white placeholder:text-zinc-650" 
                          : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                      )}
                    />
                  </div>
                </div>
                
                {/* Password field */}
                <div className="grid gap-1">
                  <div className="flex items-center justify-between ml-0.5">
                    <Label htmlFor="password" className={cn(
                      "font-bold text-[10px] transition-colors uppercase tracking-wider",
                      isDark ? "text-zinc-400" : "text-zinc-600"
                    )}>
                      Password
                    </Label>
                    {!isRegister && (
                      <Link 
                        href="#" 
                        className={cn(
                          "text-[9px] underline-offset-4 hover:underline transition-colors font-medium",
                          isDark ? "text-zinc-500 hover:text-white" : "text-zinc-400 hover:text-black"
                        )}
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className={cn(
                      "absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5",
                      isDark ? "text-zinc-500" : "text-zinc-400"
                    )} />
                    <Input 
                      id="password" 
                      type="password" 
                      placeholder={isRegister ? "At least 6 chars" : "••••••••"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required 
                      className={cn(
                        "pl-9 h-8.5 text-xs transition-all focus-visible:ring-zinc-450 focus-visible:border-transparent",
                        isDark 
                          ? "bg-[#0c0c0e] border-zinc-800 text-white placeholder:text-zinc-655" 
                          : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                        )}
                      />
                    </div>
                  </div>
  
                  {/* Confirm Password field (Register only) */}
                  {isRegister && (
                    <div className="grid gap-1">
                      <Label htmlFor="confirmPassword" className={cn(
                        "font-bold text-[10px] ml-0.5 transition-colors uppercase tracking-wider",
                        isDark ? "text-zinc-400" : "text-zinc-600"
                      )}>
                        Confirm Password
                      </Label>
                      <div className="relative">
                        <Lock className={cn(
                          "absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5",
                          isDark ? "text-zinc-500" : "text-zinc-400"
                        )} />
                        <Input 
                          id="confirmPassword" 
                          type="password" 
                          placeholder="••••••••"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required 
                          className={cn(
                            "pl-9 h-8.5 text-xs transition-all focus-visible:ring-zinc-455 focus-visible:border-transparent",
                            isDark 
                              ? "bg-[#0c0c0e] border-zinc-800 text-white placeholder:text-zinc-655" 
                              : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400"
                          )}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Error feedback */}
                  {errorMsg && (
                    <div className={cn(
                      "text-[11px] p-2 rounded-md border flex items-center justify-center animate-in fade-in zoom-in-95",
                      isDark 
                        ? "text-red-400 bg-red-500/10 border-red-500/20" 
                        : "text-red-600 bg-red-50 border-red-200"
                    )}>
                      {errorMsg}
                    </div>
                  )}
  
                  {/* Submit Button */}
                  <Button 
                    type="submit" 
                    disabled={loading}
                    className={cn(
                      "w-full font-bold h-9 mt-1 transition-all text-xs tracking-wider uppercase",
                      isDark
                        ? "bg-white text-black hover:bg-zinc-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.08)]"
                        : "bg-black text-white hover:bg-zinc-800 hover:shadow-[0_0_15px_rgba(0,0,0,0.08)]"
                    )}
                  >
                    {loading ? "Please wait..." : (isRegister ? "Sign Up" : "Login")}
                  </Button>
                </div>
                
                {/* Toggle Login/Register */}
                <div className={cn(
                  "text-center text-[11px] mt-0.5 transition-colors",
                  isDark ? "text-zinc-500" : "text-zinc-400"
                )}>
                  {isRegister ? "Already have an account? " : "Don't have an account? "}
                  <Link 
                    href={isRegister ? "/login" : "/register"} 
                    className={cn(
                      "font-bold transition-colors underline-offset-2 hover:underline",
                      isDark ? "text-white hover:text-zinc-300" : "text-zinc-900 hover:text-zinc-700"
                    )}
                  >
                    {isRegister ? "Log in" : "Sign up"}
                  </Link>
                </div>
  
              </div>
            </form>
          </CardContent>
        </Card>
        
        {/* Terms of Service footer */}
        <div className={cn(
          "text-balance text-center text-[9px] max-w-[260px] transition-colors leading-relaxed",
          isDark ? "text-zinc-600" : "text-zinc-400"
        )}>
          By clicking continue, you agree to our <br/>
          <Link href="#" className={cn("underline underline-offset-4 transition-colors font-medium", isDark ? "hover:text-white" : "hover:text-zinc-800")}>Terms of Service</Link> and <Link href="#" className={cn("underline underline-offset-4 transition-colors font-medium", isDark ? "hover:text-white" : "hover:text-zinc-800")}>Privacy Policy</Link>.
        </div>
      </div>
    )
  }
