"use client"

import React, { useEffect, useState } from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import Image from "next/image"
import Link from "next/link"
import { Eye, EyeOff, Loader2 } from "lucide-react"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { login } from "@/lib/auth"
import { useAuthStore } from "@/lib/useAuthStore"
import { SESSION_EXPIRED_FLAG } from "@/lib/apiFetch"

const REQUIRED_EMAIL_DOMAIN = "@edu.com"

const loginSchema = z.object({
  email: z.string().email("Invalid email format").endsWith(REQUIRED_EMAIL_DOMAIN, "Invalid email format"),
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { toast } = useToast()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (sessionStorage.getItem(SESSION_EXPIRED_FLAG)) {
      sessionStorage.removeItem(SESSION_EXPIRED_FLAG)
      toast({ title: "Session expired", description: "Please log in again." })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    }
  })

  const onSubmit = async (values: LoginForm) => {
    try {
      const user = await login(values.email, values.password)
      setUser(user)
      toast({ title: "Signed in", description: `Welcome back, ${user.name}` })

      if (user.mustChangePassword) {
        router.push("/set-new-password")
        return
      }

      // role-based routing
      if (user.role === "teacher") router.push("/teacher/dashboard")
      else if (user.role === "principal") router.push("/principal/dashboard")
      else if (user.role === "student") router.push("/student/profile")
      else router.push("/admin/users")
    } catch (err: unknown) {
      const e = err as Error
      toast({ title: "Login failed", description: e?.message || "Network error" })

      const normalized = e?.message?.toLowerCase() ?? ""
      if (normalized.includes("password")) {
        setError("password", { message: e.message })
      } else if (normalized.includes("email")) {
        setError("email", { message: e.message })
      }
    }
  }

  return (
    <Card className="w-full max-w-md sm:p-6" aria-live="polite">
      <CardHeader className="justify-items-center gap-3 pb-2">
        <Image
          src="/logo.png"
          alt="EduProfile"
          width={72}
          height={72}
          priority
          className="w-16 h-16 sm:w-20 sm:h-20"
        />
        <CardTitle className="text-2xl text-center sm:text-3xl">EduProfile Login</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@edu.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : "email-hint"}
              {...register("email")}
            />
            {errors.email ? (
              <p id="email-error" role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : undefined}
                className="pr-9 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

        </CardContent>

        <CardFooter className="flex flex-col">
          <Button type="submit" className="w-full mt-4" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {isSubmitting ? "Signing in..." : "Log in"}
          </Button>
          <div className="text-sm text-center text-muted-foreground w-full mt-2">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
