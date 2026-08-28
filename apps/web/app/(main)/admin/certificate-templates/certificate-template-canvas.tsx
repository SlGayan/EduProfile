"use client"

import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/apiFetch"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Toggle } from "@/components/ui/toggle"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Loader2, Type, X, Bold, AlignLeft, AlignCenter, AlignRight, Minus, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import {
  BOUND_FIELD_OPTIONS,
  TEMPLATE_CANVAS_WIDTH,
  TEMPLATE_CANVAS_HEIGHT,
  DEFAULT_FIELD_WIDTH,
  DEFAULT_FIELD_HEIGHT,
  MIN_FIELD_WIDTH,
  MIN_FIELD_HEIGHT,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  boundFieldLabel,
  extractApiError,
  fieldFontSize,
  fieldFontWeight,
  fieldHeight,
  fieldTextAlign,
  fieldWidth,
  isTemplateLayoutData,
  type BoundFieldKey,
  type CertificateTemplate,
  type TemplateField,
  type TemplateFontWeight,
  type TemplateTextAlign,
} from "@/lib/certificateTemplates"

const FIELD_HEIGHT = 34

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

type DragPayload =
  | { source: "palette"; kind: "bound"; boundField: BoundFieldKey }
  | { source: "palette"; kind: "text" }
  | { source: "field"; fieldId: string; offsetX: number; offsetY: number }

// The 8 resize handles: 4 corners + 4 edge midpoints. Which axis/axes each
// one drives is derived from its id itself (contains "n"/"s"/"e"/"w") in the
// pointermove handler below, so no separate affectsX/affectsY flags here.
const RESIZE_HANDLES = [
  { id: "nw", cursor: "nwse-resize", style: { left: 0, top: 0 } },
  { id: "n", cursor: "ns-resize", style: { left: "50%", top: 0 } },
  { id: "ne", cursor: "nesw-resize", style: { left: "100%", top: 0 } },
  { id: "e", cursor: "ew-resize", style: { left: "100%", top: "50%" } },
  { id: "se", cursor: "nwse-resize", style: { left: "100%", top: "100%" } },
  { id: "s", cursor: "ns-resize", style: { left: "50%", top: "100%" } },
  { id: "sw", cursor: "nesw-resize", style: { left: 0, top: "100%" } },
  { id: "w", cursor: "ew-resize", style: { left: 0, top: "50%" } },
] as const

type HandleId = (typeof RESIZE_HANDLES)[number]["id"]

interface ResizeState {
  fieldId: string
  handle: HandleId
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  startWidth: number
  startHeight: number
}

export function CertificateTemplateCanvas({
  templateId,
  onSaved,
  onCancel,
}: {
  templateId?: number
  onSaved: () => void
  onCancel: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const canvasRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState("")
  const [fields, setFields] = useState<TemplateField[]>([])
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)
  const [resizing, setResizing] = useState<ResizeState | null>(null)

  const isEditMode = templateId !== undefined
  const hasHydrated = useRef(false)

  // Resets the hydrate-once guard below whenever the canvas is retargeted at
  // a different template so a future templateId change (e.g. a "next
  // template" navigation added without remounting this component) isn't
  // silently blocked from hydrating.
  useEffect(() => {
    hasHydrated.current = false
  }, [templateId])

  const {
    data: existingTemplate,
    isLoading,
    isError: isLoadError,
    error: loadError,
  } = useQuery<CertificateTemplate>({
    queryKey: ["certificateTemplate", templateId],
    queryFn: async () => {
      const res = await apiFetch(`/api/certificate-templates/${templateId}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to load template"))
      return data.template
    },
    enabled: isEditMode,
  })

  // Guards against hydrating from a template whose `layoutData` doesn't
  // match the expected shape (e.g. saved directly via the API, or legacy
  // data): rather than silently dropping all fields to `[]` and letting a
  // later Save permanently overwrite them, warn so the user knows to
  // re-check before saving.
  //
  // hasHydrated (reset above whenever templateId changes) ensures this only
  // runs once per template load: without it, any background refetch (e.g.
  // window refocus) re-fires this effect and silently overwrites unsaved
  // in-progress edits with the server copy.
  useEffect(() => {
    if (!existingTemplate || hasHydrated.current) return
    hasHydrated.current = true
    setName(existingTemplate.name)
    if (isTemplateLayoutData(existingTemplate.layoutData)) {
      setFields(existingTemplate.layoutData.fields)
    } else {
      setFields([])
      toast({
        variant: "destructive",
        title: "Template data could not be read",
        description: "This template's saved layout is in an unexpected format and could not be loaded. Saving now would overwrite it with an empty layout — cancel instead unless that's intended.",
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingTemplate])

  const saveMutation = useMutation({
    mutationFn: async () => {
      const layoutData = { canvasWidth: TEMPLATE_CANVAS_WIDTH, canvasHeight: TEMPLATE_CANVAS_HEIGHT, fields }
      const res = await apiFetch(
        isEditMode ? `/api/certificate-templates/${templateId}` : "/api/certificate-templates",
        {
          method: isEditMode ? "PATCH" : "POST",
          body: JSON.stringify({ name: name.trim(), layoutData }),
        }
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(extractApiError(data, "Failed to save template"))
      return data.template
    },
    onSuccess: () => {
      toast({ title: isEditMode ? "Template updated" : "Template created" })
      queryClient.invalidateQueries({ queryKey: ["certificateTemplates"] })
      onSaved()
    },
    onError: (err) => {
      toast({
        variant: "destructive",
        title: "Error saving template",
        description: err instanceof Error ? err.message : "An unknown error occurred",
      })
    },
  })

  function addField(newField: TemplateField) {
    setFields((prev) => [...prev, newField])
    if (newField.kind === "text") setSelectedFieldId(newField.id)
  }

  function updateField(id: string, patch: Partial<TemplateField>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function handlePaletteDragStart(e: React.DragEvent, payload: DragPayload) {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload))
    e.dataTransfer.effectAllowed = "copy"
  }

  function handleFieldDragStart(e: React.DragEvent<HTMLDivElement>, field: TemplateField) {
    const rect = e.currentTarget.getBoundingClientRect()
    const payload: DragPayload = {
      source: "field",
      fieldId: field.id,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    }
    e.dataTransfer.setData("text/plain", JSON.stringify(payload))
    e.dataTransfer.effectAllowed = "move"
  }

  function handleCanvasDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const raw = e.dataTransfer.getData("text/plain")
    if (!raw || !canvasRef.current) return

    let payload: DragPayload
    try {
      payload = JSON.parse(raw)
    } catch {
      return
    }

    const rect = canvasRef.current.getBoundingClientRect()

    if (payload.source === "palette") {
      // Text fields render at DEFAULT_FIELD_HEIGHT (60px), not the smaller
      // FIELD_HEIGHT (34px) used for the drag-ghost/bound-field pill — clamp
      // against the real height so a field dropped near the bottom edge
      // doesn't render overflowing past the canvas.
      const placedHeight = payload.kind === "text" ? DEFAULT_FIELD_HEIGHT : FIELD_HEIGHT
      const x = clamp(e.clientX - rect.left - DEFAULT_FIELD_WIDTH / 2, 0, TEMPLATE_CANVAS_WIDTH - DEFAULT_FIELD_WIDTH)
      const y = clamp(e.clientY - rect.top - placedHeight / 2, 0, TEMPLATE_CANVAS_HEIGHT - placedHeight)
      addField({
        id: crypto.randomUUID(),
        kind: payload.kind,
        boundField: payload.kind === "bound" ? payload.boundField : undefined,
        text: payload.kind === "text" ? "New text" : undefined,
        x,
        y,
        ...(payload.kind === "text" ? { width: DEFAULT_FIELD_WIDTH, height: DEFAULT_FIELD_HEIGHT } : {}),
      })
    } else {
      const movedField = fields.find((f) => f.id === payload.fieldId)
      const width = movedField ? fieldWidth(movedField) : DEFAULT_FIELD_WIDTH
      // Clamp against the field's own height (bound fields fall back to the
      // pill height, text fields to their actual, possibly-resized height)
      // instead of the fixed FIELD_HEIGHT constant, so a tall text field
      // can't be dragged to overflow past the canvas bottom.
      const height = movedField ? (movedField.kind === "text" ? fieldHeight(movedField) : FIELD_HEIGHT) : FIELD_HEIGHT
      const x = clamp(e.clientX - rect.left - payload.offsetX, 0, TEMPLATE_CANVAS_WIDTH - width)
      const y = clamp(e.clientY - rect.top - payload.offsetY, 0, TEMPLATE_CANVAS_HEIGHT - height)
      setFields((prev) => prev.map((f) => (f.id === payload.fieldId ? { ...f, x, y } : f)))
    }
  }

  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id))
    if (editingFieldId === id) setEditingFieldId(null)
    if (selectedFieldId === id) setSelectedFieldId(null)
  }

  function commitFieldText(id: string, value: string) {
    updateField(id, { text: value })
    setEditingFieldId(null)
  }

  function startResize(e: React.PointerEvent, field: TemplateField, handle: HandleId) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedFieldId(field.id)
    setResizing({
      fieldId: field.id,
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: field.x,
      startY: field.y,
      startWidth: fieldWidth(field),
      startHeight: fieldHeight(field),
    })
  }

  // Pointer-driven resize (mouse, touch, and pen alike): tracked on `window`
  // (not the handle itself) so the drag keeps working even if the pointer
  // moves faster than the handle and briefly leaves it.
  useEffect(() => {
    if (!resizing) return

    function onPointerMove(e: PointerEvent) {
      if (!resizing) return
      const dx = e.clientX - resizing.startClientX
      const dy = e.clientY - resizing.startClientY
      const isWest = resizing.handle.includes("w")
      const isEast = resizing.handle.includes("e")
      const isNorth = resizing.handle.includes("n")
      const isSouth = resizing.handle.includes("s")

      let { x, y, width, height } = {
        x: resizing.startX,
        y: resizing.startY,
        width: resizing.startWidth,
        height: resizing.startHeight,
      }

      if (isEast) {
        width = clamp(resizing.startWidth + dx, MIN_FIELD_WIDTH, TEMPLATE_CANVAS_WIDTH - resizing.startX)
      } else if (isWest) {
        const maxWidth = resizing.startX + resizing.startWidth
        width = clamp(resizing.startWidth - dx, MIN_FIELD_WIDTH, maxWidth)
        x = resizing.startX + (resizing.startWidth - width)
      }

      if (isSouth) {
        height = clamp(resizing.startHeight + dy, MIN_FIELD_HEIGHT, TEMPLATE_CANVAS_HEIGHT - resizing.startY)
      } else if (isNorth) {
        const maxHeight = resizing.startY + resizing.startHeight
        height = clamp(resizing.startHeight - dy, MIN_FIELD_HEIGHT, maxHeight)
        y = resizing.startY + (resizing.startHeight - height)
      }

      updateField(resizing.fieldId, { x, y, width, height })
    }

    function onPointerUp() {
      setResizing(null)
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resizing])

  if (isEditMode && isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isEditMode && isLoadError) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 space-y-3">
        <p className="text-sm text-destructive">
          {loadError instanceof Error ? loadError.message : "Failed to load this template."}
        </p>
        <Button variant="outline" onClick={onCancel}>
          Back to Templates
        </Button>
      </div>
    )
  }

  return (
    // md kicks columns in earlier than lg (768px vs 1024px) so this survives
    // high OS display-scaling on a second monitor, which shrinks the
    // *effective* CSS viewport width reported to the browser well below its
    // physical resolution — a real symptom seen on a 150%-scaled monitor
    // where an lg-only breakpoint silently fell back to a single column.
    // items-start stops the shorter palette column from stretching to match
    // the canvas column's height (grid's default is align-items: stretch).
    <div className="grid gap-6 md:grid-cols-3 md:items-start lg:grid-cols-4">
      {/* Palette */}
      <div className="md:col-span-1 lg:col-span-1 space-y-4">
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold border-b pb-2">Bound Fields</h3>
          <p className="text-xs text-muted-foreground">Drag onto the canvas. Auto-filled from the student/certificate at issuance time.</p>
          <div className="flex flex-col gap-2 pt-2">
            {BOUND_FIELD_OPTIONS.map((opt) => (
              <div
                key={opt.key}
                draggable
                onDragStart={(e) => handlePaletteDragStart(e, { source: "palette", kind: "bound", boundField: opt.key })}
                className="cursor-grab active:cursor-grabbing rounded border bg-muted/50 px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                {opt.label}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold border-b pb-2">Free Text</h3>
          <p className="text-xs text-muted-foreground">Drag onto the canvas, then click it to select, or double-click to edit the text.</p>
          <div
            draggable
            onDragStart={(e) => handlePaletteDragStart(e, { source: "palette", kind: "text" })}
            className="cursor-grab active:cursor-grabbing rounded border bg-muted/50 px-3 py-2 text-xs font-medium hover:bg-muted flex items-center gap-2 mt-2"
          >
            <Type className="h-3.5 w-3.5" /> Free-type Text
          </div>
        </div>
      </div>

      {/* Canvas + name */}
      <div className="md:col-span-2 lg:col-span-3 space-y-4">
        <div className="rounded-lg border bg-card p-6 space-y-2">
          <Label htmlFor="template-name">Template Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "2026 Special Character"'
          />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Drag fields from the left onto the letterhead below to position them. Drag a placed field to move it, click
            to select and resize/style it, double-click text to edit its content, or click ✕ to remove it.
          </p>
          {/* The canvas is always rendered at its true fixed design-space
              size (TEMPLATE_CANVAS_WIDTH/HEIGHT) — shrinking it to fit a
              narrow container (e.g. via max-width: 100%) would leave
              children's absolute-px field positions overflowing their own
              box, since those coordinates are relative to the full design
              space. Scrolling this outer wrapper horizontally instead keeps
              every field's position and size accurate no matter how narrow
              the viewport is. */}
          <div className="overflow-x-auto">
            <div
              ref={canvasRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleCanvasDrop}
              onMouseDown={(e) => {
                if (e.target === canvasRef.current) {
                  setSelectedFieldId(null)
                  setEditingFieldId(null)
                }
              }}
              className="relative bg-white border-2 border-dashed rounded-md overflow-hidden"
              style={{ width: TEMPLATE_CANVAS_WIDTH, height: TEMPLATE_CANVAS_HEIGHT }}
            >
            {fields.map((field) => {
              const isSelected = selectedFieldId === field.id
              const isEditingText = editingFieldId === field.id
              return (
                <div
                  key={field.id}
                  draggable={!isEditingText && !resizing}
                  onDragStart={(e) => handleFieldDragStart(e, field)}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedFieldId(field.id)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (field.kind === "text") {
                      setSelectedFieldId(field.id)
                      setEditingFieldId(field.id)
                    }
                  }}
                  className={`absolute cursor-grab active:cursor-grabbing rounded border px-2 py-1.5 text-[11px] text-foreground group ${
                    isSelected ? "border-primary ring-2 ring-primary/40" : "border-primary/40"
                  } bg-primary/10`}
                  style={{
                    left: field.x,
                    top: field.y,
                    width: fieldWidth(field),
                    height: field.kind === "text" ? fieldHeight(field) : undefined,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeField(field.id)
                    }}
                    className="absolute -right-2 -top-2 hidden group-hover:flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground z-10"
                    aria-label="Remove field"
                  >
                    <X className="h-3 w-3" />
                  </button>

                  {field.kind === "bound" ? (
                    <span className="font-medium">{"{{"}{boundFieldLabel(field.boundField!)}{"}}"}</span>
                  ) : isEditingText ? (
                    <textarea
                      autoFocus
                      defaultValue={field.text}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => commitFieldText(field.id, e.currentTarget.value)}
                      style={{
                        width: "100%",
                        height: "100%",
                        whiteSpace: "pre-wrap",
                        fontSize: fieldFontSize(field),
                        fontWeight: fieldFontWeight(field),
                        textAlign: fieldTextAlign(field),
                      }}
                      className="border rounded p-1 bg-background text-foreground resize-none"
                    />
                  ) : (
                    <span
                      style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        fontSize: fieldFontSize(field),
                        fontWeight: fieldFontWeight(field),
                        textAlign: fieldTextAlign(field),
                      }}
                    >
                      {field.text || "New text"}
                    </span>
                  )}

                  {/* 8-point resize handles — only for a selected free-text
                      box, matching where a real design tool (Figma/Canva)
                      shows them. Bound fields aren't user-resizable. */}
                  {isSelected && field.kind === "text" && !isEditingText && (
                    <>
                      {RESIZE_HANDLES.map((handle) => (
                        <div
                          key={handle.id}
                          onPointerDown={(e) => startResize(e, field, handle.id)}
                          className="absolute z-20 h-2.5 w-2.5 rounded-sm border border-primary bg-white shadow-sm touch-none"
                          style={{
                            left: handle.style.left,
                            top: handle.style.top,
                            transform: "translate(-50%, -50%)",
                            cursor: handle.cursor,
                          }}
                        />
                      ))}
                    </>
                  )}

                  {/* Floating styling toolbar for the selected text box */}
                  {isSelected && field.kind === "text" && !isEditingText && (
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute z-30 flex items-center gap-1 rounded-md border bg-popover p-1 shadow-md"
                      style={{ left: 0, bottom: "100%", marginBottom: 8, whiteSpace: "nowrap" }}
                    >
                      <div className="flex items-center gap-0.5 border-r pr-1 mr-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Decrease font size"
                          onClick={() =>
                            updateField(field.id, {
                              fontSize: clamp(fieldFontSize(field) - 1, MIN_FONT_SIZE, MAX_FONT_SIZE),
                            })
                          }
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-6 text-center text-[11px] tabular-nums">{fieldFontSize(field)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Increase font size"
                          onClick={() =>
                            updateField(field.id, {
                              fontSize: clamp(fieldFontSize(field) + 1, MIN_FONT_SIZE, MAX_FONT_SIZE),
                            })
                          }
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>

                      <Toggle
                        size="sm"
                        pressed={fieldFontWeight(field) === "bold"}
                        onPressedChange={(pressed) =>
                          updateField(field.id, { fontWeight: (pressed ? "bold" : "normal") as TemplateFontWeight })
                        }
                        aria-label="Toggle bold"
                      >
                        <Bold className="h-3.5 w-3.5" />
                      </Toggle>

                      <ToggleGroup
                        type="single"
                        size="sm"
                        value={fieldTextAlign(field)}
                        onValueChange={(value) => {
                          if (value) updateField(field.id, { textAlign: value as TemplateTextAlign })
                        }}
                      >
                        <ToggleGroupItem value="left" aria-label="Align left">
                          <AlignLeft className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="center" aria-label="Align center">
                          <AlignCenter className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                        <ToggleGroupItem value="right" aria-label="Align right">
                          <AlignRight className="h-3.5 w-3.5" />
                        </ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !name.trim()}
          >
            {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEditMode ? "Save Changes" : "Create Template"}
          </Button>
        </div>
      </div>
    </div>
  )
}
