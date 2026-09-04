# Architecture - ToqueHub Phase 1 Core

## Business core

ToqueHub is designed as a modular kitchen ERP. Future modules must depend on the shared Core entities instead of duplicating data.

Core entities in Phase 1:

- `organizations` for multi-establishment readiness.
- `users`, `roles`, `permissions`, `role_permissions` for access control foundations.
- `categories`, `units`, `products` for catalog management.
- `suppliers` for purchasing relationships.
- `lots` to prepare HACCP and traceability features.
- `stock_movements` as the source of truth for stock changes.
- `stocks` as a current stock projection derived from movements.

## Stock rule

Users must not directly modify a stock quantity. The API exposes stock mutations only through `POST /api/stock-movements`.

Movement types:

- `RECEPTION`: positive quantity.
- `PRODUCTION`: negative quantity.
- `LOSS`: negative quantity.
- `CORRECTION`: positive quantity by default in Phase 1.
- `INVENTORY`: positive quantity by default in Phase 1.

The movement history remains queryable and makes the current stock recalculable.

## Backend structure

The NestJS API is split into modules:

- `AuthModule`: login and JWT strategy.
- `CatalogModule`: categories, units, products, suppliers.
- `StocksModule`: current stocks and stock movements.
- `PrismaModule`: shared Prisma service.

Swagger is mounted at `/api/docs`.

## Frontend structure

The React MVP uses simple CSS and native form controls to keep the Community edition lightweight and dependency-free on proprietary UI kits.

Main screens:

- Login page.
- Core dashboard with creation forms.
- Current stock table.
- Stock movement history table.

## Future compatibility

The repository contains a `docker/` placeholder but no Docker implementation yet. The dependency set is intentionally simple to keep future Raspberry Pi support realistic.
