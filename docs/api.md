# API Phase 1

Base URL: `http://localhost:3000/api`

Swagger: `http://localhost:3000/api/docs`

All endpoints except `POST /auth/login` require a JWT bearer token.

## Auth

- `POST /auth/login`
  - Body: `{ "email": "admin@mon-etablissement.fr", "password": "Votre-mot-de-passe" }`
  - Returns: `{ accessToken, user }`
- `GET /auth/me`

## Catalog

- `GET /categories`
- `POST /categories`
- `GET /units`
- `POST /units`
- `GET /products`
- `POST /products`
- `GET /suppliers`
- `POST /suppliers`

## Stocks

- `GET /stocks`
- `GET /stock-movements`
- `POST /stock-movements`

Example movement:

```json
{
  "productId": "uuid",
  "supplierId": "uuid",
  "type": "RECEPTION",
  "quantity": 25,
  "reason": "Réception commande Metro"
}
```

Stock mutations are intentionally modeled as movements to preserve history.
