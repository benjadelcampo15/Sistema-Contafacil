-- CreateEnum
CREATE TYPE "Ambiente" AS ENUM ('HOMOLOGACION', 'PRODUCCION');

-- CreateEnum
CREATE TYPE "CondicionIva" AS ENUM ('RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE', 'AUTORIZADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "Contador" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cuit" TEXT,
    "ambiente" "Ambiente" NOT NULL DEFAULT 'HOMOLOGACION',
    "certPem" TEXT,
    "keyEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenArca" (
    "id" TEXT NOT NULL,
    "contadorId" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "ambiente" "Ambiente" NOT NULL,
    "token" TEXT NOT NULL,
    "sign" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenArca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "contadorId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nombreFantasia" TEXT,
    "cuit" TEXT NOT NULL,
    "condicionIva" "CondicionIva" NOT NULL,
    "domicilio" TEXT NOT NULL,
    "iibb" TEXT,
    "inicioActividades" TIMESTAMP(3),
    "email" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PuntoVenta" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "PuntoVenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receptor" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "docTipo" INTEGER NOT NULL,
    "docNro" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "condicionIvaId" INTEGER NOT NULL,
    "domicilio" TEXT,
    "email" TEXT,

    CONSTRAINT "Receptor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comprobante" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "puntoVentaId" TEXT NOT NULL,
    "tipo" INTEGER NOT NULL,
    "numero" INTEGER,
    "fecha" DATE NOT NULL,
    "concepto" INTEGER NOT NULL,
    "fchServDesde" DATE,
    "fchServHasta" DATE,
    "fchVtoPago" DATE,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'PENDIENTE',
    "docTipo" INTEGER NOT NULL,
    "docNro" TEXT NOT NULL,
    "receptorNombre" TEXT NOT NULL,
    "receptorDomicilio" TEXT,
    "receptorCondIvaId" INTEGER NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'PES',
    "cotizacion" DECIMAL(14,6) NOT NULL DEFAULT 1,
    "impNeto" DECIMAL(14,2) NOT NULL,
    "impIva" DECIMAL(14,2) NOT NULL,
    "impExento" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "impTotal" DECIMAL(14,2) NOT NULL,
    "asociadoId" TEXT,
    "cae" TEXT,
    "caeVto" DATE,
    "observaciones" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobanteItem" (
    "id" TEXT NOT NULL,
    "comprobanteId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(14,4) NOT NULL,
    "precioUnitario" DECIMAL(14,4) NOT NULL,
    "alicuotaIvaId" INTEGER,
    "subtotal" DECIMAL(14,2) NOT NULL,
    "iva" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "ComprobanteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contador_email_key" ON "Contador"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TokenArca_contadorId_servicio_ambiente_key" ON "TokenArca"("contadorId", "servicio", "ambiente");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_contadorId_cuit_key" ON "Cliente"("contadorId", "cuit");

-- CreateIndex
CREATE UNIQUE INDEX "PuntoVenta_clienteId_numero_key" ON "PuntoVenta"("clienteId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "Receptor_clienteId_docTipo_docNro_key" ON "Receptor"("clienteId", "docTipo", "docNro");

-- CreateIndex
CREATE INDEX "Comprobante_clienteId_fecha_idx" ON "Comprobante"("clienteId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Comprobante_puntoVentaId_tipo_numero_key" ON "Comprobante"("puntoVentaId", "tipo", "numero");

-- AddForeignKey
ALTER TABLE "TokenArca" ADD CONSTRAINT "TokenArca_contadorId_fkey" FOREIGN KEY ("contadorId") REFERENCES "Contador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_contadorId_fkey" FOREIGN KEY ("contadorId") REFERENCES "Contador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PuntoVenta" ADD CONSTRAINT "PuntoVenta_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receptor" ADD CONSTRAINT "Receptor_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_puntoVentaId_fkey" FOREIGN KEY ("puntoVentaId") REFERENCES "PuntoVenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_asociadoId_fkey" FOREIGN KEY ("asociadoId") REFERENCES "Comprobante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobanteItem" ADD CONSTRAINT "ComprobanteItem_comprobanteId_fkey" FOREIGN KEY ("comprobanteId") REFERENCES "Comprobante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
