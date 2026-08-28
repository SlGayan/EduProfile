export type BoundFieldKey =
  | "STUDENT_NAME"
  | "ADMISSION_NUMBER"
  | "DATE_OF_ADMISSION"
  | "ATTENDANCE_PERCENTAGE"
  | "CHARACTER_GRADE"
  | "STUDENT_ATTRIBUTES"
  | "REASON_FOR_LEAVING"
  | "ACADEMIC_SUMMARY"
  | "CERTIFICATE_ID"
  | "ISSUED_DATE"

export const BOUND_FIELD_OPTIONS: { key: BoundFieldKey; label: string }[] = [
  { key: "STUDENT_NAME", label: "Student Name" },
  { key: "ADMISSION_NUMBER", label: "Admission Number" },
  { key: "DATE_OF_ADMISSION", label: "Date of Admission" },
  { key: "ATTENDANCE_PERCENTAGE", label: "Attendance %" },
  { key: "CHARACTER_GRADE", label: "Character Grade" },
  { key: "STUDENT_ATTRIBUTES", label: "Student Attributes" },
  { key: "REASON_FOR_LEAVING", label: "Reason for Leaving" },
  { key: "ACADEMIC_SUMMARY", label: "Academic Summary" },
  { key: "CERTIFICATE_ID", label: "Certificate Reference No." },
  { key: "ISSUED_DATE", label: "Issued Date" },
]

export function boundFieldLabel(key: BoundFieldKey): string {
  return BOUND_FIELD_OPTIONS.find((o) => o.key === key)?.label ?? key
}

export type TemplateFontWeight = "normal" | "bold"
export type TemplateTextAlign = "left" | "center" | "right"

export interface TemplateField {
  id: string
  kind: "bound" | "text"
  boundField?: BoundFieldKey
  text?: string
  x: number
  y: number
  // Free-type text fields only: the box size the user dragged a resize
  // handle to. Optional and defaulted via DEFAULT_FIELD_WIDTH/HEIGHT below
  // so templates saved before this existed keep rendering correctly.
  width?: number
  height?: number
  // Free-type text fields only: styling set via the floating toolbar.
  // Optional and defaulted below for the same backward-compat reason.
  fontSize?: number
  fontWeight?: TemplateFontWeight
  textAlign?: TemplateTextAlign
}

// Fixed design-space dimensions (px) that every template's field x/y are
// relative to. The canvas editor and any consumer (preview, future PDF
// renderer) must agree on this so positions aren't ambiguous.
export const TEMPLATE_CANVAS_WIDTH = 850
export const TEMPLATE_CANVAS_HEIGHT = 600

export const DEFAULT_FIELD_WIDTH = 170
export const DEFAULT_FIELD_HEIGHT = 60
export const MIN_FIELD_WIDTH = 40
export const MIN_FIELD_HEIGHT = 24

export const DEFAULT_FONT_SIZE = 12
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 48
export const DEFAULT_FONT_WEIGHT: TemplateFontWeight = "normal"
export const DEFAULT_TEXT_ALIGN: TemplateTextAlign = "left"

export function fieldWidth(field: TemplateField): number {
  return field.width ?? DEFAULT_FIELD_WIDTH
}

export function fieldHeight(field: TemplateField): number {
  return field.height ?? DEFAULT_FIELD_HEIGHT
}

export function fieldFontSize(field: TemplateField): number {
  return field.fontSize ?? DEFAULT_FONT_SIZE
}

export function fieldFontWeight(field: TemplateField): TemplateFontWeight {
  return field.fontWeight ?? DEFAULT_FONT_WEIGHT
}

export function fieldTextAlign(field: TemplateField): TemplateTextAlign {
  return field.textAlign ?? DEFAULT_TEXT_ALIGN
}

export interface TemplateLayoutData {
  canvasWidth: number
  canvasHeight: number
  fields: TemplateField[]
}

export function isTemplateLayoutData(value: unknown): value is TemplateLayoutData {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return typeof v.canvasWidth === "number" && typeof v.canvasHeight === "number" && Array.isArray(v.fields)
}

export interface CertificateTemplate {
  id: number
  name: string
  layoutData: TemplateLayoutData
  createdAt: string
  updatedAt: string
  createdBy: { email: string }
}

export { extractApiError } from "./utils"
