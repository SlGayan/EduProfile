export enum UserRole {
  STUDENT = "STUDENT",
  TEACHER = "TEACHER",
  PRINCIPAL = "PRINCIPAL",
  ADMINISTRATOR = "ADMINISTRATOR",
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

export interface User {
  id: number
  name: string
  email: string
  role: UserRole
  status: "Active" | "Inactive"
  permissions?: Permission[]
}
