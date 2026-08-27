"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/apiFetch"
import { getCurrentUser } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { CertificateTemplate, extractApiError } from "@/lib/certificateTemplates"
import { CertificateTemplateCanvas } from "./certificate-template-canvas"

type ViewState = { mode: "list" } | { mode: "new" } | { mode: "edit"; id: number }

export default function CertificateTemplatesPage() {
  return (
    // useSearchParams requires a Suspense boundary in the App Router.
    <Suspense fallback={null}>
      <CertificateTemplatesPageInner />
    </Suspense>
  )
}

function CertificateTemplatesPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Role guard — only ADMINISTRATOR or PRINCIPAL (stored lowercase in auth),
  // matching apps/web/app/(main)/admin/classes/page.tsx.
  useEffect(() => {
    const user = getCurrentUser()
    if (user && user.role !== "admin" && user.role !== "principal") {
      router.replace("/unauthorized")
    }
  }, [router])

  // Deep-link support: the Issue Certificate page's "Edit Template" button
  // navigates here with ?edit={id} so the user lands directly in the canvas
  // for that template instead of the list.
  const editParam = searchParams.get("edit")
  const editId = editParam !== null && !Number.isNaN(Number(editParam)) ? Number(editParam) : null
  const [view, setView] = useState<ViewState>(editId !== null ? { mode: "edit", id: editId } : { mode: "list" })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Certificate Templates</h1>
        <p className="text-muted-foreground">
          Design letterhead layouts selectable as an alternative to the default certificate format.
        </p>
      </div>

      {view.mode === "list" && (
        <TemplateList onCreate={() => setView({ mode: "new" })} onEdit={(id) => setView({ mode: "edit", id })} />
      )}

      {view.mode === "new" && (
        <CertificateTemplateCanvas onSaved={() => setView({ mode: "list" })} onCancel={() => setView({ mode: "list" })} />
      )}

      {view.mode === "edit" && (
        <CertificateTemplateCanvas
          templateId={view.id}
          onSaved={() => setView({ mode: "list" })}
          onCancel={() => setView({ mode: "list" })}
        />
      )}
    </div>
  )
}

function TemplateList({ onCreate, onEdit }: { onCreate: () => void; onEdit: (id: number) => void }) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<CertificateTemplate | null>(null)

  const { data: templates, isLoading, isError, error } = useQuery<CertificateTemplate[]>({
    queryKey: ["certificateTemplates"],
    queryFn: async () => {
      const res = await apiFetch("/api/certificate-templates")
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to load templates"))
      return data.templates
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/api/certificate-templates/${id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to delete template"))
      return data
    },
    onSuccess: () => {
      toast({ title: "Template deleted" })
      queryClient.invalidateQueries({ queryKey: ["certificateTemplates"] })
      setDeleteTarget(null)
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Error deleting template",
        description: err instanceof Error ? err.message : "An unknown error occurred",
      })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={onCreate}>
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {isLoading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : isError ? (
          <p className="p-6 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load certificate templates."}
          </p>
        ) : !templates || templates.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground italic">No certificate templates yet. Create one to offer it as an alternative to the default layout.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created By</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.createdBy.email}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(t.updatedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon-sm" onClick={() => onEdit(t.id)} aria-label="Edit template">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => setDeleteTarget(t)} aria-label="Delete template">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{deleteTarget?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Certificates already issued using this template are unaffected — this only
              removes it from the template picker.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
