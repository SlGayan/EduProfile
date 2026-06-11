"use client"

import React from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
<<<<<<< Updated upstream
=======
import Link from "next/link"
>>>>>>> Stashed changes

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { login } from "@/lib/auth"
import { useAuthStore } from "@/lib/useAuthStore"

const loginSchema = z.object({
<<<<<<< Updated upstream
  email: z.string().email("Invalid email format"),
=======
  email: z.string().email("Invalid email format").endsWith("@edu.com", "Invalid email format"),
>>>>>>> Stashed changes
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { toast } = useToast()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
<<<<<<< Updated upstream
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })
=======
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    }
  })
>>>>>>> Stashed changes

  const onSubmit = async (values: LoginForm) => {
    try {
      const user = await login(values.email, values.password)
      setUser(user)
<<<<<<< Updated upstream
      toast({ title: "Signed in", description: `Welcome back, ${user.name}` })
=======
      toast({ title: "Signed in", description: `Welcome back` })
>>>>>>> Stashed changes

      // role-based routing
      if (user.role === "teacher") router.push("/teacher/dashboard")
      else if (user.role === "principal") router.push("/principal/dashboard")
      else if (user.role === "student") router.push("/student/profile")
      else router.push("/admin/users")
    } catch (err: unknown) {
      const e = err as Error
<<<<<<< Updated upstream
      // Show friendly toast
      toast({ title: "Login failed", description: e?.message || "Network error" })

      // If it's a validation-like message from API, set field errors
=======
      toast({ title: "Login failed", description: e?.message || "Network error" })

>>>>>>> Stashed changes
      if (e?.message?.toLowerCase().includes("password")) {
        setError("password", { message: e.message })
      } else if (e?.message?.toLowerCase().includes("email")) {
        setError("email", { message: e.message })
      }
    }
  }

  return (
    <Card className="w-full max-w-md" aria-live="polite">
      <CardHeader>
        <CardTitle className="text-2xl text-center">EduProfile Login</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} aria-describedby="login-error">
        <CardContent className="space-y-4">
<<<<<<< Updated upstream
          {/* Global form error area (for server/network messages) */}

=======
>>>>>>> Stashed changes
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
<<<<<<< Updated upstream
              placeholder="Enter your email"
=======
              placeholder="name@edu.com"
>>>>>>> Stashed changes
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
            <Input
              id="password"
              type="password"
              placeholder="Enter your password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
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

<<<<<<< Updated upstream
        <CardFooter>
=======
        <CardFooter className="flex flex-col space-y-4">
>>>>>>> Stashed changes
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
