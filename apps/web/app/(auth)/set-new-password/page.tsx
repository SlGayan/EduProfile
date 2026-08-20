"use client"

import React, { useState } from "react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import Image from "next/image"
import { Eye, EyeOff } from "lucide-react"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { useAuthStore } from "@/lib/useAuthStore"
import { apiFetch } from "@/lib/apiFetch"

const setNewPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .regex(/^(?=.*[A-Za-z])(?=.*\d)/, "Password must contain at least one letter and one number"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type SetNewPasswordForm = z.infer<typeof setNewPasswordSchema>

export default function SetNewPasswordPage() {
  const { toast } = useToast()
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetNewPasswordForm>({
    resolver: zodResolver(setNewPasswordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  })

  const onSubmit = async (values: SetNewPasswordForm) => {
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ newPassword: values.newPassword }),
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error || `Failed to update password (${res.status})`)
      }

      const current = getCurrentUser()
      const updated = current ? { ...current, mustChangePassword: false } : current

      if (updated) {
        // setUser() persists via storeUser() internally — no separate storeUser() call needed
        setUser(updated)
      }

      toast({ title: "Password updated", description: "Your new password has been set." })

      if (updated?.role === "teacher") router.push("/teacher/dashboard")
      else if (updated?.role === "principal") router.push("/principal/dashboard")
      else if (updated?.role === "student") router.push("/student/profile")
      else router.push("/admin/users")
    } catch (err: unknown) {
      const e = err as Error
      toast({ title: "Update failed", description: e?.message || "Network error" })
    }
  }

  return (
    <Card className="w-full max-w-md" aria-live="polite">
      <CardHeader className="justify-items-center gap-2">
        <Image src="/logo.png" alt="EduProfile" width={72} height={72} priority />
        <CardTitle className="text-2xl text-center">Set a New Password</CardTitle>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} aria-describedby="set-new-password-error">
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            For your account's security, you must set a new password before continuing.
          </p>

          <div className="space-y-2">
            <Label htmlFor="newPassword">New password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                placeholder="Enter a new password"
                aria-invalid={!!errors.newPassword}
                aria-describedby={errors.newPassword ? "newPassword-error" : undefined}
                className="pr-9"
                {...register("newPassword")}
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
            {errors.newPassword && (
              <p id="newPassword-error" role="alert" className="text-sm text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter the new password"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? "confirmPassword-error" : undefined}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p id="confirmPassword-error" role="alert" className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full" disabled={isSubmitting} aria-busy={isSubmitting}>
            {isSubmitting ? "Updating..." : "Set new password"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
