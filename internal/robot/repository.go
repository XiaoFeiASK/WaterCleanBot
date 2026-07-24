package robot

import "context"

// Repository will contain SQL queries for the robots table.
// Keep SQL explicit so indexes, PostGIS usage, and transactions remain visible.
type Repository interface {
	List(ctx context.Context) ([]Robot, error)
	FindByCode(ctx context.Context, code string) (Robot, error)
}
