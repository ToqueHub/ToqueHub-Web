-- CreateTable
CREATE TABLE "market_sectors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_sectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "parent_id" TEXT,
    "sector_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "espece_id" INTEGER NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_labels" (
    "id" TEXT NOT NULL,
    "libcod" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_prices" (
    "id" TEXT NOT NULL,
    "label_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "quotation_date" TIMESTAMP(3) NOT NULL,
    "stage" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "avg_price" DECIMAL(10,2) NOT NULL,
    "min_price" DECIMAL(10,2),
    "max_price" DECIMAL(10,2),
    "variation" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_sectors_name_key" ON "market_sectors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "market_products_name_key" ON "market_products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "market_products_espece_id_key" ON "market_products"("espece_id");

-- CreateIndex
CREATE UNIQUE INDEX "markets_code_key" ON "markets"("code");

-- CreateIndex
CREATE UNIQUE INDEX "market_labels_libcod_key" ON "market_labels"("libcod");

-- CreateIndex
CREATE INDEX "market_prices_quotation_date_idx" ON "market_prices"("quotation_date");

-- CreateIndex
CREATE INDEX "market_prices_label_id_market_id_idx" ON "market_prices"("label_id", "market_id");

-- CreateIndex
CREATE UNIQUE INDEX "market_prices_label_id_market_id_quotation_date_stage_key" ON "market_prices"("label_id", "market_id", "quotation_date", "stage");

-- AddForeignKey
ALTER TABLE "market_categories" ADD CONSTRAINT "market_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "market_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_categories" ADD CONSTRAINT "market_categories_sector_id_fkey" FOREIGN KEY ("sector_id") REFERENCES "market_sectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_products" ADD CONSTRAINT "market_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "market_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_labels" ADD CONSTRAINT "market_labels_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "market_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "market_labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
