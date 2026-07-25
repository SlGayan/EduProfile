"use client"

import React, { useState } from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import Image from "next/image"
import Link from "next/link"
import { Eye, EyeOff } from "lucide-react"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { login } from "@/lib/auth"
import { useAuthStore } from "@/lib/useAuthStore"

const loginSchema = z.object({
  email: z.string().email("Invalid email format").endsWith("@edu.com", "Invalid email format"),
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { toast } = useToast()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [showPassword, setShowPassword] = useState(false)

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

      // role-based routing
      if (user.role === "teacher") router.push("/teacher/dashboard")
      else if (user.role === "principal") router.push("/principal/dashboard")
      else if (user.role === "student") router.push("/student/profile")
      else router.push("/admin/users")
    } catch (err: unknown) {
      const e = err as Error
      toast({ title: "Login failed", description: e?.message || "Network error" })

      if (e?.message?.toLowerCase().includes("password")) {
        setError("password", { message: e.message })
      } else if (e?.message?.toLowerCase().includes("email")) {
        setError("email", { message: e.message })
      }
    }
  }

  return (
    <Card className="w-full max-w-md" aria-live="polite">
      <CardHeader className="justify-items-center gap-2">
        <Image src="/logo.png" alt="EduProfile" width={72} height={72} priority />
        <CardTitle className="text-2xl text-center">EduProfile Login</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} aria-describedby="login-error">
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@edu.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              {...register("email")}
            />
            {errors.email && (
              <p id="email-error" role="alert" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
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
                className="pr-9"
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
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

          <div className="text-sm text-muted-foreground">
            <div className="grid">
              <p>Teacher: teacher@edu.com</p>
              <p>Principal: principal@edu.com</p>
              <p>Admin: admin@edu.com</p>
              <p>Student: student@edu.com</p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Log in"}
          </Button>
          <div className="text-sm text-center text-muted-foreground w-full">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary hover:underline font-medium">Sign up</Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  )
}
