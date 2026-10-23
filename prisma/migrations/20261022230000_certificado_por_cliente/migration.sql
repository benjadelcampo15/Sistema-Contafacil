-- DropIndex
DROP INDEX "TokenArca_contadorId_servicio_ambiente_key";

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "certPem" TEXT,
ADD COLUMN     "keyEnc" TEXT;

-- AlterTable
ALTER TABLE "TokenArca" ADD COLUMN     "titular" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "TokenArca_contadorId_titular_servicio_ambiente_key" ON "TokenArca"("contadorId", "titular", "servicio", "ambiente");

