export enum UserRole {
  STUDENT = "student",
  TEACHER = "teacher",
  PRINCIPAL = "principal",
  ADMINISTRATOR = "admin",
}

export enum Permission {
  VIEW_STUDENTS = "VIEW_STUDENTS",
  EDIT_STUDENTS = "EDIT_STUDENTS",
  DELETE_STUDENTS = "DELETE_STUDENTS",
  VIEW_CLASSES = "VIEW_CLASSES",
  EDIT_CLASSES = "EDIT_CLASSES",
  DELETE_CLASSES = "DELETE_CLASSES",
  VIEW_MARKS = "VIEW_MARKS",
  EDIT_MARKS = "EDIT_MARKS",
  MANAGE_USERS = "MANAGE_USERS",
  VIEW_REPORTS = "VIEW_REPORTS",
  SYSTEM_SETTINGS = "SYSTEM_SETTINGS",
}

/** Canonical user type used throughout the app */
export interface User {
  id: string
  name: string
  email: string
  role: "admin" | "principal" | "teacher" | "student"
  tokenExpiry?: number // Unix timestamp in milliseconds
  token?: string // JWT for API calls
}
