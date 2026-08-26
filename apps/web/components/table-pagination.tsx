"use client"

import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

export const TABLE_PAGE_SIZE = 15

interface TablePaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
}

export function TablePagination({ page, pageCount, onPageChange }: TablePaginationProps) {
  if (pageCount <= 1) return null

  return (
    <Pagination className="pt-4">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            onClick={(e) => {
              e.preventDefault()
              if (page > 1) onPageChange(page - 1)
            }}
            aria-disabled={page === 1}
            className={page === 1 ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-4 text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            onClick={(e) => {
              e.preventDefault()
              if (page < pageCount) onPageChange(page + 1)
            }}
            aria-disabled={page === pageCount}
            className={page === pageCount ? "pointer-events-none opacity-50" : undefined}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
